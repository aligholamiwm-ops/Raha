from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.setting import (
    LinkItem, LinkSection, LinkSectionCreate, LinkSectionUpdate,
    get_setting_links, save_setting_links,
)

router = APIRouter()


@router.get("/links/sections", summary="List link sections (public)")
async def list_link_sections(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    sections = await get_setting_links(db)
    return sections


@router.get("/admin/links/sections", summary="List link sections (admin)")
async def admin_list_link_sections(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    sections = await get_setting_links(db)
    return sections


@router.post("/admin/links/sections", response_model=LinkSection, status_code=201, summary="Create link section (admin)")
async def create_link_section(
    payload: LinkSectionCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LinkSection:
    sections = await get_setting_links(db)
    if any(s["title"] == payload.title for s in sections):
        raise HTTPException(status_code=409, detail="Link section with this title already exists")
    section = LinkSection(**payload.model_dump())
    sections.append(section.to_dict())
    await save_setting_links(db, sections)
    return section


@router.put("/admin/links/sections/{title}", response_model=LinkSection, summary="Update link section (admin)")
async def update_link_section(
    title: str,
    payload: LinkSectionUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LinkSection:
    sections = await get_setting_links(db)
    idx = next((i for i, s in enumerate(sections) if s["title"] == title), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Link section not found")
    if payload.title != title and any(s["title"] == payload.title for s in sections):
        raise HTTPException(status_code=409, detail="Another section with this title already exists")
    section = LinkSection(**payload.model_dump())
    sections[idx] = section.to_dict()
    await save_setting_links(db, sections)
    return section


@router.delete("/admin/links/sections/{title}", summary="Delete link section (admin)")
async def delete_link_section(
    title: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    sections = await get_setting_links(db)
    filtered = [s for s in sections if s["title"] != title]
    if len(filtered) == len(sections):
        raise HTTPException(status_code=404, detail="Link section not found")
    await save_setting_links(db, filtered)
    return {"status": "deleted"}
