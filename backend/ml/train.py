from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from ml.forecasting import (
    DEFAULT_END_YEAR,
    DEFAULT_START_YEAR,
    generate_predictions,
    load_json,
    save_json,
    train_model,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Train demographic forecasting model and export predictions.',
    )
    parser.add_argument(
        '--data-path',
        default=str(BACKEND_DIR / 'seed' / 'municipality_data.csv'),
        help='Path to municipality data CSV.',
    )
    parser.add_argument(
        '--model-path',
        default=str(Path(__file__).resolve().with_name('model.json')),
        help='Where to store trained model artifact.',
    )
    parser.add_argument(
        '--predictions-path',
        default=str(Path(__file__).resolve().with_name('predictions_2024_2038.json')),
        help='Where to store generated predictions.',
    )
    parser.add_argument(
        '--start-year',
        type=int,
        default=DEFAULT_START_YEAR,
        help='First forecast year.',
    )
    parser.add_argument(
        '--end-year',
        type=int,
        default=DEFAULT_END_YEAR,
        help='Last forecast year.',
    )
    parser.add_argument(
        '--model-run-id',
        default=None,
        help='Optional explicit model run id.',
    )
    return parser


def ensure_training_artifacts(
    *,
    data_path: str | Path,
    model_path: str | Path,
    predictions_path: str | Path,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
    model_run_id: str | None = None,
) -> tuple[dict, list[dict], bool]:
    model_path = Path(model_path)
    predictions_path = Path(predictions_path)

    if model_path.exists() and predictions_path.exists():
        artifact = load_json(model_path)
        predictions = load_json(predictions_path)
        return artifact, predictions, False

    artifact = train_model(
        csv_path=data_path,
        start_year=start_year,
        end_year=end_year,
        model_run_id=model_run_id,
    )
    predictions = generate_predictions(
        artifact,
        start_year=start_year,
        end_year=end_year,
    )
    save_json(artifact, model_path)
    save_json(predictions, predictions_path)
    return artifact, predictions, True


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    _, predictions, created = ensure_training_artifacts(
        data_path=args.data_path,
        model_path=args.model_path,
        predictions_path=args.predictions_path,
        start_year=args.start_year,
        end_year=args.end_year,
        model_run_id=args.model_run_id,
    )
    if created:
        print(
            f"Saved model to {args.model_path} and {len(predictions)} predictions to {args.predictions_path}"
        )
    else:
        print(
            f"Training artifacts already exist at {args.model_path} and {args.predictions_path}, skipping"
        )


if __name__ == '__main__':
    main()
