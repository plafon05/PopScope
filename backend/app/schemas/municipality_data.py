from pydantic import BaseModel, Field


class MunicipalityDataRead(BaseModel):
    id: int
    municipality_id: int
    year: int
    population: int | None = None
    birth_rate: float | None = None
    death_rate: float | None = None
    migration: float | None = None

    model_config = {'from_attributes': True}


class MunicipalityDataListResponse(BaseModel):
    items: list[MunicipalityDataRead]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
