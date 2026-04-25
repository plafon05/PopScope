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
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Generate forecasts from saved model artifact.',
    )
    parser.add_argument(
        '--model-path',
        default=str(Path(__file__).resolve().with_name('model.json')),
        help='Path to saved model artifact.',
    )
    parser.add_argument(
        '--output-path',
        default=str(Path(__file__).resolve().with_name('predictions_2024_2038.json')),
        help='Path to write predictions JSON.',
    )
    parser.add_argument(
        '--municipality-id',
        type=int,
        default=None,
        help='Optional municipality id for single forecast export.',
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
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    artifact = load_json(args.model_path)
    predictions = generate_predictions(
        artifact,
        municipality_id=args.municipality_id,
        start_year=args.start_year,
        end_year=args.end_year,
    )
    save_json(predictions, args.output_path)
    print(f"Saved {len(predictions)} predictions to {args.output_path}")


if __name__ == '__main__':
    main()
