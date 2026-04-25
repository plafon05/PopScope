import asyncio
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import Municipality, MunicipalityData, MunicipalityPrediction
from ml.train import ensure_training_artifacts

SEEDS_DIR = Path(__file__).parent
ML_DIR = SEEDS_DIR.parent / "ml"
PREDICTIONS_PATH = ML_DIR / "predictions_2024_2038.json"
MODEL_PATH = ML_DIR / "model.json"
SOURCE_DATA_PATH = SEEDS_DIR / "municipality_data.csv"
PREDICTION_BATCH_SIZE = 1000


async def seed_municipalities(session):
    result = await session.execute(select(Municipality).limit(1))
    if result.scalar():
        print("✅ Муниципалитеты уже загружены, пропускаем")
        return

    with open(SEEDS_DIR / "municipalities.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        objects = [
            Municipality(
                id=int(row["id"]),
                name=row["name"],
                region=row["region"],
                type=row["type"],
                area=float(row["area"]) if row["area"] else None,
            )
            for row in reader
        ]

    session.add_all(objects)
    await session.commit()
    print(f"🌱 Загружено {len(objects)} муниципалитетов")


async def seed_municipality_data(session):
    result = await session.execute(select(MunicipalityData).limit(1))
    if result.scalar():
        print("✅ Данные муниципалитетов уже загружены, пропускаем")
        return

    with open(SEEDS_DIR / "municipality_data.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        objects = [
            MunicipalityData(
                id=int(row["id"]),
                municipality_id=int(row["municipality_id"]),
                year=int(row["year"]),
                population=int(row["population"]) if row["population"] else None,
                birth_rate=float(row["birth_rate"]) if row["birth_rate"] else None,
                death_rate=float(row["death_rate"]) if row["death_rate"] else None,
                migration=int(row["migration"]) if row["migration"] else None,
            )
            for row in reader
        ]

    session.add_all(objects)
    await session.commit()
    print(f"🌱 Загружено {len(objects)} записей данных муниципалитетов")


def ensure_predictions_json() -> list[dict]:
    _, predictions, created = ensure_training_artifacts(
        data_path=SOURCE_DATA_PATH,
        model_path=MODEL_PATH,
        predictions_path=PREDICTIONS_PATH,
    )
    if created:
        print("🤖 Прогнозы и модель не найдены, обучение выполнено один раз")
    else:
        print("✅ Артефакты модели уже существуют, повторное обучение не требуется")
    return predictions


async def seed_predictions(session):
    result = await session.execute(select(MunicipalityPrediction.id).limit(1))
    if result.scalar():
        print("✅ Прогнозы уже загружены, пропускаем")
        return

    predictions = ensure_predictions_json()
    total = len(predictions)

    for start_index in range(0, total, PREDICTION_BATCH_SIZE):
        chunk = predictions[start_index : start_index + PREDICTION_BATCH_SIZE]
        objects = [
            MunicipalityPrediction(
                municipality_id=item["municipality_id"],
                target_year=item["target_year"],
                model_name=item["model_name"],
                model_version=item["model_version"],
                model_run_id=item["model_run_id"],
                predicted_population=item.get("predicted_population"),
                predicted_birth_rate=item.get("predicted_birth_rate"),
                predicted_death_rate=item.get("predicted_death_rate"),
                predicted_natural_increase_rate=item.get("predicted_natural_increase_rate"),
                predicted_migration=item.get("predicted_migration"),
                confidence=item.get("confidence", {}),
                extra_metadata=item.get("metadata", {}),
                history_from_year=item.get("history_from_year"),
                history_to_year=item.get("history_to_year"),
            )
            for item in chunk
        ]
        session.add_all(objects)
        await session.commit()

    print(f"🌱 Загружено {total} прогнозных записей")


async def main():
    async with AsyncSessionLocal() as session:
        await seed_municipalities(session)
        await seed_municipality_data(session)
        await seed_predictions(session)


if __name__ == "__main__":
    asyncio.run(main())
