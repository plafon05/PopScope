from fastapi import APIRouter, Depends, Query
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_prediction_repository
from app.repositories.predictions import PredictionRepository
from app.schemas.prediction import (
    MunicipalityPredictionCreate,
    MunicipalityPredictionListResponse,
    MunicipalityPredictionRead,
)

router = APIRouter(prefix='/predictions', tags=['predictions'])


@router.post('', response_model=MunicipalityPredictionRead)
async def create_prediction(
    payload: MunicipalityPredictionCreate,
    repository: PredictionRepository = Depends(get_prediction_repository),
) -> MunicipalityPredictionRead:
    try:
        prediction = await repository.create_prediction(payload)
    except IntegrityError as exc:
        error_message = str(exc.orig).lower() if exc.orig else str(exc).lower()
        if 'uq_prediction_run' in error_message or 'duplicate key value' in error_message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Prediction with the same model_run_id, municipality_id and target_year already exists',
            ) from exc
        if 'foreign key' in error_message and 'municipality_id' in error_message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Municipality not found',
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Prediction cannot be created with the provided payload',
        ) from exc
    return MunicipalityPredictionRead.model_validate(prediction)


@router.get('', response_model=MunicipalityPredictionListResponse)
async def list_predictions(
    municipality_id: int | None = Query(default=None),
    model_run_id: str | None = Query(default=None),
    year_from: int | None = Query(default=None),
    year_to: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    repository: PredictionRepository = Depends(get_prediction_repository),
) -> MunicipalityPredictionListResponse:
    items, total = await repository.list_predictions(
        municipality_id=municipality_id,
        model_run_id=model_run_id,
        year_from=year_from,
        year_to=year_to,
        limit=limit,
        offset=offset,
    )
    return MunicipalityPredictionListResponse(
        items=[MunicipalityPredictionRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )
