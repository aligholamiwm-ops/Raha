import logging
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

logging.disable(logging.CRITICAL)

TEST_TELEGRAM_ID = 12345
TEST_ADMIN_ID = 99999


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.settings = AsyncMock()
    return db


@pytest.fixture
async def client(mock_db):
    user_doc = {
        "telegram_id": TEST_TELEGRAM_ID,
        "role": "user",
        "notifications": [],
    }
    admin_doc = {
        "telegram_id": TEST_ADMIN_ID,
        "role": "admin",
        "notifications": [],
    }

    async def override_get_db():
        return mock_db

    async def override_get_current_user():
        from app.models.user import UserModel
        return UserModel(**user_doc)

    async def override_require_admin():
        from app.models.user import UserModel
        return UserModel(**admin_doc)

    app.dependency_overrides.clear()
    from app.database import get_database
    from app.dependencies import get_current_user, require_admin
    app.dependency_overrides[get_database] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[require_admin] = override_require_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


class TestLinksPublic:
    @pytest.mark.asyncio
    async def test_get_links_empty(self, client, mock_db):
        mock_db.settings.find_one.return_value = None
        response = await client.get("/api/v1/links/sections")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_get_links_returns_sections(self, client, mock_db):
        sections = [
            {
                "title": "Download app",
                "columns": {
                    "android": [{"label": "Raha VPN", "url": "https://play.google.com"}],
                    "apple": [{"label": "Raha VPN iOS", "url": "https://apps.apple.com"}],
                },
            }
        ]
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": sections}
        response = await client.get("/api/v1/links/sections")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "Download app"
        assert "android" in data[0]["columns"]
        assert "apple" in data[0]["columns"]

    @pytest.mark.asyncio
    async def test_get_links_no_auth_required(self, client, mock_db):
        mock_db.settings.find_one.return_value = None
        response = await client.get("/api/v1/links/sections")
        assert response.status_code == 200


class TestLinksAdmin:
    @pytest.mark.asyncio
    async def test_create_section(self, client, mock_db):
        mock_db.settings.find_one.return_value = None
        mock_db.settings.update_one = AsyncMock()

        payload = {
            "title": "Download app",
            "columns": {
                "android": [{"label": "Raha VPN", "url": "https://play.google.com"}],
                "apple": [{"label": "Raha VPN iOS", "url": "https://apps.apple.com"}],
            },
        }
        response = await client.post("/api/v1/admin/links/sections", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Download app"
        assert len(data["columns"]["android"]) == 1

    @pytest.mark.asyncio
    async def test_create_duplicate_section_returns_409(self, client, mock_db):
        sections = [{"title": "Download app", "columns": {"android": []}}]
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": sections}

        payload = {"title": "Download app", "columns": {"android": []}}
        response = await client.post("/api/v1/admin/links/sections", json=payload)
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_update_section(self, client, mock_db):
        sections = [{"title": "Download app", "columns": {"android": [{"label": "Old", "url": "https://old"}]}}]
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": sections}
        mock_db.settings.update_one = AsyncMock()

        payload = {
            "title": "Download app",
            "columns": {"android": [{"label": "New", "url": "https://new"}]},
        }
        response = await client.put("/api/v1/admin/links/sections/Download%20app", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["columns"]["android"][0]["label"] == "New"

    @pytest.mark.asyncio
    async def test_update_nonexistent_section_returns_404(self, client, mock_db):
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": []}
        payload = {"title": "Nope", "columns": {"android": []}}
        response = await client.put("/api/v1/admin/links/sections/Nope", json=payload)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_section(self, client, mock_db):
        sections = [{"title": "Download app", "columns": {"android": []}}]
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": sections}
        mock_db.settings.update_one = AsyncMock()

        response = await client.delete("/api/v1/admin/links/sections/Download%20app")
        assert response.status_code == 200
        assert response.json() == {"status": "deleted"}

    @pytest.mark.asyncio
    async def test_delete_nonexistent_section_returns_404(self, client, mock_db):
        mock_db.settings.find_one.return_value = {"_id": "links", "sections": []}
        response = await client.delete("/api/v1/admin/links/sections/Nope")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_links_after_delete(self, client, mock_db):
        mock_db.settings.find_one.return_value = None
        response = await client.get("/api/v1/links/sections")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_post_without_admin_returns_403(self, client, mock_db):
        app.dependency_overrides.clear()
        from app.database import get_database
        from app.dependencies import get_current_user, require_admin

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            from app.models.user import UserModel
            return UserModel(**{"telegram_id": TEST_TELEGRAM_ID, "role": "user"})

        app.dependency_overrides[get_database] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        payload = {"title": "Test", "columns": {"android": []}}
        response = await client.post("/api/v1/admin/links/sections", json=payload)
        assert response.status_code == 403
