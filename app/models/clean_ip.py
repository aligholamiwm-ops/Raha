from pydantic import BaseModel, ConfigDict, Field


class CleanIPModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    isp_name: str = Field(..., description="ISP name (e.g. MCI, MTN)")
    ip_address: str = Field(..., description="Clean IP address for this ISP")

    def to_dict(self) -> dict:
        return self.model_dump()


class CleanIPCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    isp_name: str
    ip_address: str
