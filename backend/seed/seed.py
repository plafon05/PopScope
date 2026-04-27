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


def _normalize_optional(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized or normalized.lower() in {"null", "none", "nan"}:
        return None
    return normalized.replace(",", ".")


def _parse_optional_float(value: str | None) -> float | None:
    normalized = _normalize_optional(value)
    if normalized is None:
        return None
    return float(normalized)


def _parse_optional_int(value: str | None) -> int | None:
    parsed_float = _parse_optional_float(value)
    if parsed_float is None:
        return None
    return int(parsed_float)


def _read_csv_rows(path: Path) -> list[dict[str, str]]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            with path.open("r", encoding=encoding, newline="") as f:
                sample = f.read(4096)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",;")
                except csv.Error:
                    dialect = csv.excel
                    if ";" in sample and sample.count(";") >= sample.count(","):
                        dialect.delimiter = ";"
                reader = csv.DictReader(f, dialect=dialect)
                return list(reader)
        except UnicodeDecodeError as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    raise ValueError(f"Не удалось прочитать CSV: {path}")


async def seed_municipalities(session):
    result = await session.execute(select(Municipality).limit(1))
    if result.scalar():
        print("✅ Муниципалитеты уже загружены, пропускаем")
        return

    rows = _read_csv_rows(SEEDS_DIR / "municipalities.csv")
    objects = [
        Municipality(
            id=int(row["id"]),
            name=row["name"],
            region=row["region"],
            type=row["type"],
            area=_parse_optional_float(row["area"]),
        )
        for row in rows
    ]

    session.add_all(objects)
    await session.commit()
    print(f"🌱 Загружено {len(objects)} муниципалитетов")


async def seed_municipality_data(session):
    result = await session.execute(select(MunicipalityData).limit(1))
    if result.scalar():
        print("✅ Данные муниципалитетов уже загружены, пропускаем")
        return

    rows = _read_csv_rows(SEEDS_DIR / "municipality_data.csv")
    objects = [
        MunicipalityData(
            id=int(row["id"]),
            municipality_id=int(row["municipality_id"]),
            year=int(row["year"]),
            population=_parse_optional_int(row["population"]),
            birth_rate=_parse_optional_float(row["birth_rate"]),
            death_rate=_parse_optional_float(row["death_rate"]),
            migration=_parse_optional_float(row["migration"]),
        )
        for row in rows
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
