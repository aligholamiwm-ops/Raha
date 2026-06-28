import pytest

pytest_plugins = ("pytest_asyncio",)


@pytest.fixture(autouse=True)
def _clear_caches():
    from app.integrations.xui_api import (
        _cookie_cache,
        _csrf_cache,
        _prefix_cache,
    )
    _cookie_cache.clear()
    _csrf_cache.clear()
    _prefix_cache.clear()
