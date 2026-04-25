from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MunicipalityPrediction
from app.schemas.prediction import MunicipalityPredictionCreate


class PredictionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_prediction(
        self,
        payload: MunicipalityPredictionCreate,
    ) -> MunicipalityPrediction:
        prediction = MunicipalityPrediction(**payload.model_dump())
        self.session.add(prediction)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise
        await self.session.refresh(prediction)
        return prediction

    async def list_predictions(
        self,
        *,
        municipality_id: int | None,
        model_run_id: str | None,
        year_from: int | None,
        year_to: int | None,
        limit: int,
        offset: int,
    ) -> tuple[list[MunicipalityPrediction], int]:
        stmt = select(MunicipalityPrediction)
        count_stmt = select(func.count(MunicipalityPrediction.id))

        filters = []
        if municipality_id is not None:
            filters.append(MunicipalityPrediction.municipality_id == municipality_id)
        if model_run_id:
            filters.append(MunicipalityPrediction.model_run_id == model_run_id)
        if year_from is not None:
            filters.append(MunicipalityPrediction.target_year >= year_from)
        if year_to is not None:
            filters.append(MunicipalityPrediction.target_year <= year_to)

        if filters:
            stmt = stmt.where(and_(*filters))
            count_stmt = count_stmt.where(and_(*filters))

        stmt = (
            stmt.order_by(MunicipalityPrediction.generated_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.session.execute(stmt)
        total = await self.session.execute(count_stmt)
        return list(result.scalars().all()), int(total.scalar_one())
