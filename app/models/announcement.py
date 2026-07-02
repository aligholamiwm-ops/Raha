from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
import uuid


class Announcement(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    announcement_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    message: str
    target: str = Field(
        default="all",
        description="Target group: 'all' | 'unpaid_loans' | 'active_configs'",
    )
    audience_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    created_by: int = Field(..., description="Admin telegram_id who created this")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()
