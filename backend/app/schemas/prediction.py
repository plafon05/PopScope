from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MunicipalityPredictionCreate(BaseModel):
    municipality_id: int = Field(gt=0)
    target_year: int = Field(ge=1900)

    model_name: str = Field(min_length=1, max_length=100)
    model_version: str = Field(min_length=1, max_length=50)
    model_run_id: str = Field(min_length=1, max_length=64)

    predicted_population: int | None = None
    predicted_birth_rate: float | None = None
    predicted_death_rate: float | None = None
    predicted_natural_increase_rate: float | None = None
    predicted_migration: int | None = None

    confidence: dict = Field(default_factory=dict)
    extra_metadata: dict = Field(
        default_factory=dict,
        validation_alias='metadata',
        serialization_alias='metadata',
    )

    history_from_year: int | None = None
    history_to_year: int | None = None


class MunicipalityPredictionRead(BaseModel):
    id: int
    municipality_id: int
    target_year: int

    model_name: str
    model_version: str
    model_run_id: str

    predicted_population: int | None = None
    predicted_birth_rate: float | None = None
    predicted_death_rate: float | None = None
    predicted_natural_increase_rate: float | None = None
    predicted_migration: int | None = None

    confidence: dict
    metadata: dict = Field(validation_alias='extra_metadata')

    history_from_year: int | None = None
    history_to_year: int | None = None
    generated_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class MunicipalityPredictionListResponse(BaseModel):
    items: list[MunicipalityPredictionRead]
    total: int
    limit: int
    offset: int
