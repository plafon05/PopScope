from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


MODEL_NAME = 'damped_panel_trend'
MODEL_VERSION = '1.1.0'
DEFAULT_START_YEAR = 2024
DEFAULT_END_YEAR = 2038
SERIES_MIN_HISTORY = 4
MIN_BACKTEST_TRAIN_SIZE = 4
BACKTEST_HOLDOUT_POINTS = 3
AUTOREG_LAGS = 3
RATE_FLOOR = -0.05
RATE_CEILING = 0.08
NATURAL_RATE_FLOOR = -0.08
NATURAL_RATE_CEILING = 0.08


@dataclass(frozen=True)
class MetricSpec:
    name: str
    transform: str
    damping: float
    recent_trend_weight: float
    recency_strength: float
    clip_min: float | None = None
    clip_max: float | None = None
    anomaly_year_weights: dict[int, float] | None = None


@dataclass
class SeriesModel:
    last_year: int
    last_value: float
    last_transformed: float
    slope: float
    error: float
    volatility: float
    observations: int
    history_from_year: int
    history_to_year: int


@dataclass
class AutoregModel:
    intercept: float
    coefficients: list[float]
    feature_names: list[str]
    residual_scale: float
    sample_size: int
    fallback_value: float


@dataclass
class ErrorMetrics:
    mae: float | None
    rmse: float | None
    mape: float | None
    sample_size: int


METRIC_SPECS: dict[str, MetricSpec] = {
    'population': MetricSpec(
        name='population',
        transform='log',
        damping=0.985,
        recent_trend_weight=0.30,
        recency_strength=0.10,
        clip_min=1.0,
        clip_max=None,
    ),
    'birth_rate': MetricSpec(
        name='birth_rate',
        transform='identity',
        damping=0.94,
        recent_trend_weight=0.45,
        recency_strength=0.18,
        clip_min=RATE_FLOOR,
        clip_max=RATE_CEILING,
        anomaly_year_weights={2020: 0.7, 2021: 0.8},
    ),
    'death_rate': MetricSpec(
        name='death_rate',
        transform='identity',
        damping=0.94,
        recent_trend_weight=0.35,
        recency_strength=0.14,
        clip_min=RATE_FLOOR,
        clip_max=RATE_CEILING,
        anomaly_year_weights={2020: 0.35, 2021: 0.45, 2022: 0.75},
    ),
    'natural_increase_rate': MetricSpec(
        name='natural_increase_rate',
        transform='identity',
        damping=0.92,
        recent_trend_weight=0.40,
        recency_strength=0.16,
        clip_min=NATURAL_RATE_FLOOR,
        clip_max=NATURAL_RATE_CEILING,
        anomaly_year_weights={2020: 0.5, 2021: 0.6},
    ),
}


def _parse_optional_float(raw_value: str | None) -> float | None:
    if raw_value in (None, '', 'null'):
        return None
    return float(raw_value)


def load_rows(csv_path: str | Path) -> list[dict[str, Any]]:
    path = Path(csv_path)
    with path.open(encoding='utf-8') as file_obj:
        reader = csv.DictReader(file_obj)
        rows = []
        for row in reader:
            birth_rate = _parse_optional_float(row.get('birth_rate'))
            death_rate = _parse_optional_float(row.get('death_rate'))
            rows.append(
                {
                    'municipality_id': int(row['municipality_id']),
                    'year': int(row['year']),
                    'population': _parse_optional_float(row.get('population')),
                    'birth_rate': birth_rate,
                    'death_rate': death_rate,
                    'migration': _parse_optional_float(row.get('migration')),
                    'natural_increase_rate': (
                        birth_rate - death_rate
                        if birth_rate is not None and death_rate is not None
                        else None
                    ),
                }
            )
    return rows


def group_rows_by_municipality(rows: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row['municipality_id']].append(row)
    for municipality_rows in grouped.values():
        municipality_rows.sort(key=lambda item: item['year'])
    return dict(grouped)


def _transform(value: float, spec: MetricSpec) -> float:
    if spec.transform == 'log':
        return math.log(max(value, 1.0))
    return value


def _inverse_transform(value: float, spec: MetricSpec) -> float:
    if spec.transform == 'log':
        return math.exp(value)
    return value


def _clip(value: float, spec: MetricSpec) -> float:
    if spec.clip_min is not None:
        value = max(spec.clip_min, value)
    if spec.clip_max is not None:
        value = min(spec.clip_max, value)
    return value


def _median(values: list[float], fallback: float = 0.0) -> float:
    if not values:
        return fallback
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _mean(values: list[float], fallback: float = 0.0) -> float:
    if not values:
        return fallback
    return sum(values) / len(values)


def _percentile(values: list[float], q: float, fallback: float | None = None) -> float | None:
    if not values:
        return fallback
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered) - 1) * q
    lower = int(math.floor(index))
    upper = int(math.ceil(index))
    if lower == upper:
        return ordered[lower]
    fraction = index - lower
    return ordered[lower] * (1 - fraction) + ordered[upper] * fraction


def _weighted_mean(values: list[float], weights: list[float], fallback: float = 0.0) -> float:
    if not values or not weights:
        return fallback
    total_weight = sum(weights)
    if total_weight <= 0:
        return _mean(values, fallback=fallback)
    return sum(value * weight for value, weight in zip(values, weights)) / total_weight


def _build_point_weights(points: list[tuple[int, float]], spec: MetricSpec) -> list[float]:
    if not points:
        return []
    min_year = points[0][0]
    weights = []
    for year, _ in points:
        recency_weight = 1.0 + spec.recency_strength * (year - min_year)
        anomaly_multiplier = 1.0
        if spec.anomaly_year_weights:
            anomaly_multiplier = spec.anomaly_year_weights.get(year, 1.0)
        weights.append(max(0.05, recency_weight * anomaly_multiplier))
    return weights


def _autoreg_feature_names() -> list[str]:
    return ['lag1', 'lag2', 'lag3', 'mean3', 'delta1', 'delta2', 'year_offset']


def _has_consecutive_history(points: list[tuple[int, float]]) -> bool:
    return all(
        current_year - previous_year == 1
        for (previous_year, _), (current_year, _) in zip(points, points[1:])
    )


def _build_autoreg_features(history_points: list[tuple[int, float]], target_year: int) -> list[float]:
    values = [value for _, value in history_points[-AUTOREG_LAGS:]]
    lag1, lag2, lag3 = values[-1], values[-2], values[-3]
    mean3 = _mean(values)
    delta1 = lag1 - lag2
    delta2 = lag2 - lag3
    year_offset = (target_year - DEFAULT_START_YEAR) / 10.0
    return [lag1, lag2, lag3, mean3, delta1, delta2, year_offset]


def _solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [value] for row, value in zip(matrix, vector)]

    for pivot_index in range(size):
        pivot_row = max(
            range(pivot_index, size),
            key=lambda row_index: abs(augmented[row_index][pivot_index]),
        )
        if abs(augmented[pivot_row][pivot_index]) < 1e-12:
            continue
        augmented[pivot_index], augmented[pivot_row] = augmented[pivot_row], augmented[pivot_index]
        pivot_value = augmented[pivot_index][pivot_index]
        for column_index in range(pivot_index, size + 1):
            augmented[pivot_index][column_index] /= pivot_value
        for row_index in range(size):
            if row_index == pivot_index:
                continue
            factor = augmented[row_index][pivot_index]
            if factor == 0:
                continue
            for column_index in range(pivot_index, size + 1):
                augmented[row_index][column_index] -= factor * augmented[pivot_index][column_index]

    return [augmented[row_index][size] for row_index in range(size)]


def _build_death_autoreg_training_rows(
    grouped_rows: dict[int, list[dict[str, Any]]],
    *,
    until_year: int | None = None,
) -> tuple[list[list[float]], list[float], list[float]]:
    spec = METRIC_SPECS['death_rate']
    features: list[list[float]] = []
    targets: list[float] = []
    weights: list[float] = []

    for municipality_rows in grouped_rows.values():
        points = _build_series_points(municipality_rows, 'death_rate')
        for target_index in range(AUTOREG_LAGS, len(points)):
            history_points = points[target_index - AUTOREG_LAGS : target_index]
            target_year, target_value = points[target_index]
            if until_year is not None and target_year > until_year:
                continue
            if not _has_consecutive_history(history_points + [points[target_index]]):
                continue
            features.append(_build_autoreg_features(history_points, target_year))
            targets.append(target_value)
            weights.append(_build_point_weights(history_points + [points[target_index]], spec)[-1])
    return features, targets, weights


def _fit_death_autoreg_model(
    grouped_rows: dict[int, list[dict[str, Any]]],
    *,
    until_year: int | None = None,
) -> AutoregModel:
    features, targets, weights = _build_death_autoreg_training_rows(
        grouped_rows,
        until_year=until_year,
    )
    feature_count = len(_autoreg_feature_names())
    fallback_value = _mean(targets, fallback=0.0)
    if not features:
        return AutoregModel(
            intercept=fallback_value,
            coefficients=[0.0] * feature_count,
            feature_names=_autoreg_feature_names(),
            residual_scale=0.001,
            sample_size=0,
            fallback_value=fallback_value,
        )

    design_matrix = [[1.0] + row for row in features]
    parameter_count = feature_count + 1
    xtwx = [[0.0] * parameter_count for _ in range(parameter_count)]
    xtwy = [0.0] * parameter_count

    for row, target, weight in zip(design_matrix, targets, weights):
        for i in range(parameter_count):
            xtwy[i] += weight * row[i] * target
            for j in range(parameter_count):
                xtwx[i][j] += weight * row[i] * row[j]

    regularization = 8e-4
    for diagonal_index in range(1, parameter_count):
        xtwx[diagonal_index][diagonal_index] += regularization

    solved = _solve_linear_system(xtwx, xtwy)
    intercept = solved[0]
    coefficients = solved[1:]
    residuals = [
        target - (intercept + sum(feature_value * coefficient for feature_value, coefficient in zip(row, coefficients)))
        for row, target in zip(features, targets)
    ]
    residual_scale = math.sqrt(_mean([residual ** 2 for residual in residuals], fallback=1e-6))
    return AutoregModel(
        intercept=intercept,
        coefficients=coefficients,
        feature_names=_autoreg_feature_names(),
        residual_scale=max(residual_scale, 1e-4),
        sample_size=len(targets),
        fallback_value=fallback_value,
    )


def _forecast_death_autoreg_sequence(
    history_points: list[tuple[int, float]],
    model: AutoregModel,
    target_year: int,
) -> float:
    spec = METRIC_SPECS['death_rate']
    if not history_points:
        return _clip(model.fallback_value, spec)

    synthetic_history = history_points[:]
    while synthetic_history[-1][0] < target_year:
        next_year = synthetic_history[-1][0] + 1
        if len(synthetic_history) >= AUTOREG_LAGS and _has_consecutive_history(synthetic_history[-AUTOREG_LAGS:]):
            feature_row = _build_autoreg_features(synthetic_history[-AUTOREG_LAGS:], next_year)
            predicted_value = model.intercept + sum(
                feature_value * coefficient
                for feature_value, coefficient in zip(feature_row, model.coefficients)
            )
        else:
            predicted_value = synthetic_history[-1][1]
        synthetic_history.append((next_year, _clip(predicted_value, spec)))
        synthetic_history = synthetic_history[-AUTOREG_LAGS:]
    return synthetic_history[-1][1]


def _build_series_points(
    municipality_rows: list[dict[str, Any]],
    metric_name: str,
) -> list[tuple[int, float]]:
    points = []
    for row in municipality_rows:
        value = row.get(metric_name)
        if value is None:
            continue
        points.append((row['year'], float(value)))
    return points


def _linear_regression(
    points: list[tuple[int, float]],
    spec: MetricSpec,
    weights: list[float] | None = None,
) -> dict[str, float]:
    transformed_points = [(year, _transform(value, spec)) for year, value in points]
    years = [year for year, _ in transformed_points]
    values = [value for _, value in transformed_points]
    if weights is None:
        weights = [1.0] * len(transformed_points)
    mean_year = _weighted_mean(years, weights)
    mean_value = _weighted_mean(values, weights)
    denominator = sum(
        weight * ((year - mean_year) ** 2)
        for year, weight in zip(years, weights)
    )
    if denominator == 0:
        slope = 0.0
    else:
        numerator = sum(
            weight * (year - mean_year) * (value - mean_value)
            for (year, value), weight in zip(transformed_points, weights)
        )
        slope = numerator / denominator
    intercept = mean_value - slope * mean_year
    return {
        'intercept': intercept,
        'slope': slope,
    }


def _recent_slope(transformed_points: list[tuple[int, float]]) -> float:
    if len(transformed_points) < 2:
        return 0.0
    recent_points = transformed_points[-4:]
    deltas = []
    for (previous_year, previous_value), (current_year, current_value) in zip(
        recent_points,
        recent_points[1:],
    ):
        year_delta = current_year - previous_year
        if year_delta <= 0:
            continue
        deltas.append((current_value - previous_value) / year_delta)
    return _mean(deltas, fallback=0.0)


def _fit_series_model(
    points: list[tuple[int, float]],
    spec: MetricSpec,
    global_series_model: SeriesModel | None = None,
) -> SeriesModel:
    weights = _build_point_weights(points, spec)
    regression = _linear_regression(points, spec, weights)
    intercept = regression['intercept']
    transformed_points = [(year, _transform(value, spec)) for year, value in points]
    long_slope = regression['slope']
    short_slope = _recent_slope(transformed_points)
    slope = (
        (1.0 - spec.recent_trend_weight) * long_slope
        + spec.recent_trend_weight * short_slope
    )

    transformed_values = [value for _, value in transformed_points]
    residuals = [
        abs(value - (intercept + slope * year))
        for (year, _), value in zip(points, transformed_values)
    ]
    deltas = [
        abs(current - previous)
        for previous, current in zip(transformed_values, transformed_values[1:])
    ]

    observations = len(points)
    shrink_weight = min(0.92, max(0.35, observations / 10))
    if global_series_model is not None:
        slope = shrink_weight * slope + (1.0 - shrink_weight) * global_series_model.slope
        error = (
            shrink_weight * _median(residuals, fallback=0.0)
            + (1.0 - shrink_weight) * global_series_model.error
        )
        volatility = (
            shrink_weight * _median(deltas, fallback=0.0)
            + (1.0 - shrink_weight) * global_series_model.volatility
        )
    else:
        error = _median(residuals, fallback=0.0)
        volatility = _median(deltas, fallback=0.0)

    last_year, last_value = points[-1]
    recent_values = transformed_values[-3:]
    recent_weights = [1.0, 1.35, 1.7][-len(recent_values):]
    anchored_level = (
        0.72 * transformed_values[-1]
        + 0.28 * _weighted_mean(recent_values, recent_weights, fallback=transformed_values[-1])
    )
    return SeriesModel(
        last_year=last_year,
        last_value=last_value,
        last_transformed=anchored_level,
        slope=slope,
        error=error,
        volatility=volatility,
        observations=observations,
        history_from_year=points[0][0],
        history_to_year=points[-1][0],
    )


def _forecast_from_model(
    model: SeriesModel,
    spec: MetricSpec,
    target_year: int,
) -> float:
    steps = max(0, target_year - model.last_year)
    damped_delta = 0.0
    for step_index in range(steps):
        damped_delta += model.slope * (spec.damping ** step_index)
    predicted_transformed = model.last_transformed + damped_delta
    predicted_value = _inverse_transform(predicted_transformed, spec)
    return _clip(predicted_value, spec)


def _round_metric(metric_name: str, value: float) -> float | int:
    if metric_name == 'population':
        return max(0, int(round(value)))
    return round(value, 6)


def _round_error_metric(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 6)


def _calculate_error_metrics(actuals: list[float], predictions: list[float]) -> ErrorMetrics:
    if not actuals or not predictions:
        return ErrorMetrics(mae=None, rmse=None, mape=None, sample_size=0)

    absolute_errors = [abs(actual - predicted) for actual, predicted in zip(actuals, predictions)]
    squared_errors = [(actual - predicted) ** 2 for actual, predicted in zip(actuals, predictions)]
    percentage_errors = [
        abs((actual - predicted) / actual)
        for actual, predicted in zip(actuals, predictions)
        if abs(actual) > 1e-12
    ]

    mae = sum(absolute_errors) / len(absolute_errors)
    rmse = math.sqrt(sum(squared_errors) / len(squared_errors))
    mape = (
        sum(percentage_errors) / len(percentage_errors)
        if percentage_errors
        else None
    )
    return ErrorMetrics(
        mae=mae,
        rmse=rmse,
        mape=mape,
        sample_size=len(actuals),
    )


def _serialize_error_metrics(metrics: ErrorMetrics) -> dict[str, float | int | None]:
    return {
        'mae': _round_error_metric(metrics.mae),
        'rmse': _round_error_metric(metrics.rmse),
        'mape': _round_error_metric(metrics.mape),
        'sample_size': metrics.sample_size,
    }


def _build_metric_summary(
    metric_collections: list[ErrorMetrics],
) -> dict[str, dict[str, float | int | None]]:
    populated = [metrics for metrics in metric_collections if metrics.sample_size > 0]
    summary: dict[str, dict[str, float | int | None]] = {
        'mean': {'mae': None, 'rmse': None, 'mape': None, 'sample_size': len(populated)},
        'median': {'mae': None, 'rmse': None, 'mape': None, 'sample_size': len(populated)},
        'p90': {'mae': None, 'rmse': None, 'mape': None, 'sample_size': len(populated)},
    }
    if not populated:
        return summary

    for metric_name in ('mae', 'rmse', 'mape'):
        values = [
            getattr(metrics, metric_name)
            for metrics in populated
            if getattr(metrics, metric_name) is not None
        ]
        summary['mean'][metric_name] = _round_error_metric(_mean(values)) if values else None
        summary['median'][metric_name] = _round_error_metric(_median(values)) if values else None
        summary['p90'][metric_name] = _round_error_metric(_percentile(values, 0.9)) if values else None
    return summary


def _build_global_models(
    grouped_rows: dict[int, list[dict[str, Any]]],
) -> dict[str, SeriesModel]:
    global_models: dict[str, SeriesModel] = {}
    for metric_name, spec in METRIC_SPECS.items():
        local_models = []
        for municipality_rows in grouped_rows.values():
            points = _build_series_points(municipality_rows, metric_name)
            if len(points) < 2:
                continue
            local_models.append(_fit_series_model(points, spec))

        if not local_models:
            global_models[metric_name] = SeriesModel(
                last_year=DEFAULT_START_YEAR - 1,
                last_value=1.0 if metric_name == 'population' else 0.0,
                last_transformed=0.0 if metric_name != 'population' else math.log(1.0),
                slope=0.0,
                error=0.001,
                volatility=0.001,
                observations=0,
                history_from_year=DEFAULT_START_YEAR - 1,
                history_to_year=DEFAULT_START_YEAR - 1,
            )
            continue

        median_last_value = _median([model.last_value for model in local_models], fallback=0.0)
        global_models[metric_name] = SeriesModel(
            last_year=int(round(_median([model.last_year for model in local_models], fallback=DEFAULT_START_YEAR - 1))),
            last_value=median_last_value,
            last_transformed=_transform(median_last_value, spec),
            slope=_median([model.slope for model in local_models], fallback=0.0),
            error=max(1e-4, _median([model.error for model in local_models], fallback=0.001)),
            volatility=max(
                1e-4,
                _median([model.volatility for model in local_models], fallback=0.001),
            ),
            observations=int(round(_median([model.observations for model in local_models], fallback=0.0))),
            history_from_year=int(round(_median([model.history_from_year for model in local_models], fallback=DEFAULT_START_YEAR - 1))),
            history_to_year=int(round(_median([model.history_to_year for model in local_models], fallback=DEFAULT_START_YEAR - 1))),
        )
    return global_models


def _evaluate_metric_points(
    points: list[tuple[int, float]],
    spec: MetricSpec,
    global_model: SeriesModel,
) -> ErrorMetrics:
    if len(points) < MIN_BACKTEST_TRAIN_SIZE + 1:
        return ErrorMetrics(mae=None, rmse=None, mape=None, sample_size=0)

    holdout_start = max(MIN_BACKTEST_TRAIN_SIZE, len(points) - BACKTEST_HOLDOUT_POINTS)
    actuals: list[float] = []
    predictions: list[float] = []

    for target_index in range(holdout_start, len(points)):
        train_points = points[:target_index]
        target_year, actual_value = points[target_index]
        local_model = _fit_series_model(train_points, spec, global_model)
        predicted_value = _forecast_from_model(local_model, spec, target_year)
        actuals.append(actual_value)
        predictions.append(predicted_value)

    return _calculate_error_metrics(actuals, predictions)


def _select_death_blend_weight(
    grouped_rows: dict[int, list[dict[str, Any]]],
    global_models: dict[str, SeriesModel],
    yearly_death_autoreg_models: dict[int, AutoregModel],
) -> float:
    candidate_weights = [0.0, 0.15, 0.3, 0.45, 0.6]
    scored_candidates: list[tuple[float, float]] = []

    for blend_weight in candidate_weights:
        actuals: list[float] = []
        predictions: list[float] = []
        for municipality_rows in grouped_rows.values():
            death_points = _build_series_points(municipality_rows, 'death_rate')
            if len(death_points) < MIN_BACKTEST_TRAIN_SIZE + 1:
                continue
            holdout_start = max(MIN_BACKTEST_TRAIN_SIZE, len(death_points) - BACKTEST_HOLDOUT_POINTS)
            for target_index in range(holdout_start, len(death_points)):
                train_points = death_points[:target_index]
                target_year, actual_value = death_points[target_index]
                trend_model = _fit_series_model(
                    train_points,
                    METRIC_SPECS['death_rate'],
                    global_models['death_rate'],
                )
                trend_prediction = _forecast_from_model(
                    trend_model,
                    METRIC_SPECS['death_rate'],
                    target_year,
                )
                autoreg_model = yearly_death_autoreg_models.get(target_year)
                if autoreg_model is not None and len(train_points) >= AUTOREG_LAGS:
                    autoreg_prediction = _forecast_death_autoreg_sequence(
                        train_points[-AUTOREG_LAGS:],
                        autoreg_model,
                        target_year,
                    )
                    prediction = (
                        (1.0 - blend_weight) * trend_prediction
                        + blend_weight * autoreg_prediction
                    )
                else:
                    prediction = trend_prediction
                actuals.append(actual_value)
                predictions.append(_clip(prediction, METRIC_SPECS['death_rate']))
        metrics = _calculate_error_metrics(actuals, predictions)
        scored_candidates.append((blend_weight, metrics.rmse or float('inf')))

    scored_candidates.sort(key=lambda item: item[1])
    return scored_candidates[0][0]


def _evaluate_municipality_metrics(
    municipality_rows: list[dict[str, Any]],
    global_models: dict[str, SeriesModel],
    yearly_death_autoreg_models: dict[int, AutoregModel],
    death_blend_weight: float,
) -> dict[str, ErrorMetrics]:
    points_by_metric = {
        metric_name: _build_series_points(municipality_rows, metric_name)
        for metric_name in METRIC_SPECS
    }

    evaluations = {
        'population': _evaluate_metric_points(
            points_by_metric['population'],
            METRIC_SPECS['population'],
            global_models['population'],
        ),
        'birth_rate': _evaluate_metric_points(
            points_by_metric['birth_rate'],
            METRIC_SPECS['birth_rate'],
            global_models['birth_rate'],
        ),
        'death_rate': _evaluate_metric_points(
            points_by_metric['death_rate'],
            METRIC_SPECS['death_rate'],
            global_models['death_rate'],
        ),
    }

    natural_actual_by_year = {
        row['year']: row['natural_increase_rate']
        for row in municipality_rows
        if row.get('natural_increase_rate') is not None
    }
    birth_points = points_by_metric['birth_rate']
    death_points = points_by_metric['death_rate']
    death_actuals: list[float] = []
    death_predictions: list[float] = []
    if len(death_points) >= MIN_BACKTEST_TRAIN_SIZE + 1:
        holdout_start = max(MIN_BACKTEST_TRAIN_SIZE, len(death_points) - BACKTEST_HOLDOUT_POINTS)
        for target_index in range(holdout_start, len(death_points)):
            train_points = death_points[:target_index]
            target_year, actual_value = death_points[target_index]
            trend_model = _fit_series_model(
                train_points,
                METRIC_SPECS['death_rate'],
                global_models['death_rate'],
            )
            trend_prediction = _forecast_from_model(
                trend_model,
                METRIC_SPECS['death_rate'],
                target_year,
            )
            autoreg_model = yearly_death_autoreg_models.get(target_year)
            if autoreg_model is not None and len(train_points) >= AUTOREG_LAGS:
                autoreg_prediction = _forecast_death_autoreg_sequence(
                    train_points[-AUTOREG_LAGS:],
                    autoreg_model,
                    target_year,
                )
                death_prediction = (
                    (1.0 - death_blend_weight) * trend_prediction
                    + death_blend_weight * autoreg_prediction
                )
            else:
                death_prediction = trend_prediction
            death_actuals.append(actual_value)
            death_predictions.append(_clip(death_prediction, METRIC_SPECS['death_rate']))
        evaluations['death_rate'] = _calculate_error_metrics(death_actuals, death_predictions)

    max_holdout_length = min(len(birth_points), len(death_points))
    if max_holdout_length >= MIN_BACKTEST_TRAIN_SIZE + 1:
        holdout_start = max(MIN_BACKTEST_TRAIN_SIZE, max_holdout_length - BACKTEST_HOLDOUT_POINTS)
        actuals: list[float] = []
        predictions: list[float] = []
        for target_index in range(holdout_start, max_holdout_length):
            target_year = birth_points[target_index][0]
            if death_points[target_index][0] != target_year:
                continue
            actual_value = natural_actual_by_year.get(target_year)
            if actual_value is None:
                continue
            birth_model = _fit_series_model(
                birth_points[:target_index],
                METRIC_SPECS['birth_rate'],
                global_models['birth_rate'],
            )
            predicted_birth = _forecast_from_model(
                birth_model,
                METRIC_SPECS['birth_rate'],
                target_year,
            )
            trend_death_model = _fit_series_model(
                death_points[:target_index],
                METRIC_SPECS['death_rate'],
                global_models['death_rate'],
            )
            trend_death_prediction = _forecast_from_model(
                trend_death_model,
                METRIC_SPECS['death_rate'],
                target_year,
            )
            autoreg_model = yearly_death_autoreg_models.get(target_year)
            if autoreg_model is not None and target_index >= AUTOREG_LAGS:
                autoreg_prediction = _forecast_death_autoreg_sequence(
                    death_points[target_index - AUTOREG_LAGS : target_index],
                    autoreg_model,
                    target_year,
                )
                predicted_death = (
                    (1.0 - death_blend_weight) * trend_death_prediction
                    + death_blend_weight * autoreg_prediction
                )
            else:
                predicted_death = trend_death_prediction
            actuals.append(actual_value)
            predictions.append(predicted_birth - predicted_death)
        evaluations['natural_increase_rate'] = _calculate_error_metrics(actuals, predictions)
    else:
        evaluations['natural_increase_rate'] = ErrorMetrics(
            mae=None,
            rmse=None,
            mape=None,
            sample_size=0,
        )
    return evaluations


def _merge_metric_collections(
    metric_collections: list[ErrorMetrics],
) -> ErrorMetrics:
    absolute_errors: list[float] = []
    squared_errors: list[float] = []
    percentage_errors: list[float] = []

    for metrics in metric_collections:
        if metrics.sample_size == 0 or metrics.mae is None or metrics.rmse is None:
            continue
        absolute_errors.extend([metrics.mae] * metrics.sample_size)
        squared_errors.extend([(metrics.rmse ** 2)] * metrics.sample_size)
        if metrics.mape is not None:
            percentage_errors.extend([metrics.mape] * metrics.sample_size)

    sample_size = len(absolute_errors)
    if sample_size == 0:
        return ErrorMetrics(mae=None, rmse=None, mape=None, sample_size=0)

    mae = sum(absolute_errors) / sample_size
    rmse = math.sqrt(sum(squared_errors) / sample_size)
    mape = sum(percentage_errors) / len(percentage_errors) if percentage_errors else None
    return ErrorMetrics(mae=mae, rmse=rmse, mape=mape, sample_size=sample_size)


def train_model(
    csv_path: str | Path,
    *,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
    model_run_id: str | None = None,
) -> dict[str, Any]:
    rows = load_rows(csv_path)
    grouped_rows = group_rows_by_municipality(rows)
    global_models = _build_global_models(grouped_rows)
    years = sorted({row['year'] for row in rows})
    yearly_death_autoreg_models = {
        year: _fit_death_autoreg_model(grouped_rows, until_year=year - 1)
        for year in years
    }
    final_death_autoreg_model = _fit_death_autoreg_model(grouped_rows)
    death_blend_weight = _select_death_blend_weight(
        grouped_rows,
        global_models,
        yearly_death_autoreg_models,
    )
    global_metric_collections: dict[str, list[ErrorMetrics]] = {
        metric_name: [] for metric_name in METRIC_SPECS
    }

    municipalities: dict[str, Any] = {}
    for municipality_id, municipality_rows in grouped_rows.items():
        history_years = [row['year'] for row in municipality_rows]
        municipality_payload: dict[str, Any] = {
            'history_from_year': min(history_years),
            'history_to_year': max(history_years),
            'series': {},
            'evaluation': {},
            'death_autoreg_history': _build_series_points(municipality_rows, 'death_rate')[-AUTOREG_LAGS:],
        }

        for metric_name, spec in METRIC_SPECS.items():
            points = _build_series_points(municipality_rows, metric_name)
            if len(points) >= SERIES_MIN_HISTORY:
                series_model = _fit_series_model(points, spec, global_models[metric_name])
            elif points:
                series_model = _fit_series_model(points, spec, global_models[metric_name])
            else:
                series_model = global_models[metric_name]
            municipality_payload['series'][metric_name] = asdict(series_model)
        municipality_evaluation = _evaluate_municipality_metrics(
            municipality_rows,
            global_models,
            yearly_death_autoreg_models,
            death_blend_weight,
        )
        municipality_payload['evaluation'] = {
            metric_name: _serialize_error_metrics(evaluation)
            for metric_name, evaluation in municipality_evaluation.items()
        }
        for metric_name, evaluation in municipality_evaluation.items():
            global_metric_collections[metric_name].append(evaluation)
        municipalities[str(municipality_id)] = municipality_payload

    overall_evaluation = {
        metric_name: _serialize_error_metrics(_merge_metric_collections(metric_collections))
        for metric_name, metric_collections in global_metric_collections.items()
    }
    overall_evaluation_summary = {
        metric_name: _build_metric_summary(metric_collections)
        for metric_name, metric_collections in global_metric_collections.items()
    }

    return {
        'model_name': MODEL_NAME,
        'model_version': MODEL_VERSION,
        'model_run_id': model_run_id or f'{datetime.now(timezone.utc):%Y%m%d%H%M%S}-{uuid4().hex[:8]}',
        'trained_at': datetime.now(timezone.utc).isoformat(),
        'source_data': str(Path(csv_path)),
        'forecast_years': {'start': start_year, 'end': end_year},
        'evaluation': overall_evaluation,
        'evaluation_summary': overall_evaluation_summary,
        'metrics': {
            metric_name: {
                'transform': METRIC_SPECS[metric_name].transform,
                'damping': METRIC_SPECS[metric_name].damping,
                'global': asdict(global_model),
            }
            for metric_name, global_model in global_models.items()
        },
        'death_rate_autoreg': {
            'blend_weight': death_blend_weight,
            'global': asdict(final_death_autoreg_model),
        },
        'municipalities': municipalities,
    }


def _build_interval_width(
    birth_model: SeriesModel,
    death_model: SeriesModel,
    natural_model: SeriesModel,
    horizon: int,
) -> float:
    base_error = math.sqrt(
        birth_model.error ** 2
        + death_model.error ** 2
        + natural_model.error ** 2
    )
    volatility = max(natural_model.volatility, 1e-4) * math.sqrt(max(horizon, 1))
    return base_error * (1.0 + 0.22 * max(horizon - 1, 0)) + volatility


def generate_predictions(
    model_artifact: dict[str, Any],
    *,
    municipality_id: int | None = None,
    start_year: int | None = None,
    end_year: int | None = None,
) -> list[dict[str, Any]]:
    start_year = start_year or model_artifact['forecast_years']['start']
    end_year = end_year or model_artifact['forecast_years']['end']
    predictions: list[dict[str, Any]] = []

    municipality_items = model_artifact['municipalities'].items()
    if municipality_id is not None:
        municipality_items = [
            (str(municipality_id), model_artifact['municipalities'][str(municipality_id)])
        ]

    for municipality_id_str, municipality_payload in municipality_items:
        series_payload = municipality_payload['series']
        population_model = SeriesModel(**series_payload['population'])
        birth_model = SeriesModel(**series_payload['birth_rate'])
        death_model = SeriesModel(**series_payload['death_rate'])
        natural_model = SeriesModel(**series_payload['natural_increase_rate'])
        death_autoreg_model = AutoregModel(**model_artifact['death_rate_autoreg']['global'])
        death_blend_weight = model_artifact['death_rate_autoreg']['blend_weight']
        death_autoreg_history = [tuple(point) for point in municipality_payload.get('death_autoreg_history', [])]

        for target_year in range(start_year, end_year + 1):
            horizon = target_year - start_year + 1
            predicted_population = _forecast_from_model(
                population_model,
                METRIC_SPECS['population'],
                target_year,
            )
            predicted_birth_rate = _forecast_from_model(
                birth_model,
                METRIC_SPECS['birth_rate'],
                target_year,
            )
            trend_death_rate = _forecast_from_model(
                death_model,
                METRIC_SPECS['death_rate'],
                target_year,
            )
            if death_autoreg_history and len(death_autoreg_history) >= AUTOREG_LAGS:
                autoreg_death_rate = _forecast_death_autoreg_sequence(
                    death_autoreg_history,
                    death_autoreg_model,
                    target_year,
                )
                predicted_death_rate = _clip(
                    (1.0 - death_blend_weight) * trend_death_rate
                    + death_blend_weight * autoreg_death_rate,
                    METRIC_SPECS['death_rate'],
                )
            else:
                predicted_death_rate = trend_death_rate
            predicted_natural_increase_rate = _clip(
                predicted_birth_rate - predicted_death_rate,
                METRIC_SPECS['natural_increase_rate'],
            )
            if not death_autoreg_history or death_autoreg_history[-1][0] < target_year:
                death_autoreg_history.append((target_year, predicted_death_rate))
                death_autoreg_history = death_autoreg_history[-AUTOREG_LAGS:]

            interval_width = _build_interval_width(
                birth_model=birth_model,
                death_model=death_model,
                natural_model=natural_model,
                horizon=horizon,
            )
            interval_lower = _clip(
                predicted_natural_increase_rate - interval_width,
                METRIC_SPECS['natural_increase_rate'],
            )
            interval_upper = _clip(
                predicted_natural_increase_rate + interval_width,
                METRIC_SPECS['natural_increase_rate'],
            )

            predictions.append(
                {
                    'municipality_id': int(municipality_id_str),
                    'target_year': target_year,
                    'model_name': model_artifact['model_name'],
                    'model_version': model_artifact['model_version'],
                    'model_run_id': model_artifact['model_run_id'],
                    'predicted_population': _round_metric('population', predicted_population),
                    'predicted_birth_rate': _round_metric('birth_rate', predicted_birth_rate),
                    'predicted_death_rate': _round_metric('death_rate', predicted_death_rate),
                    'predicted_natural_increase_rate': _round_metric(
                        'natural_increase_rate',
                        predicted_natural_increase_rate,
                    ),
                    'predicted_migration': None,
                    'confidence': {
                        'natural_increase_rate': {
                            'lower': _round_metric('natural_increase_rate', interval_lower),
                            'upper': _round_metric('natural_increase_rate', interval_upper),
                            'level': 0.8,
                            'method': 'damped-trend-residual-band',
                        }
                    },
                    'metadata': {
                        'forecast_horizon': horizon,
                        'interval_fill_metric': 'natural_increase_rate',
                        'series_history_years': {
                            'from': municipality_payload['history_from_year'],
                            'to': municipality_payload['history_to_year'],
                        },
                        'quality_metrics': municipality_payload['evaluation'],
                        'overall_quality_metrics': model_artifact.get('evaluation', {}),
                        'overall_quality_summary': model_artifact.get('evaluation_summary', {}),
                    },
                    'history_from_year': municipality_payload['history_from_year'],
                    'history_to_year': municipality_payload['history_to_year'],
                }
            )
    return predictions


def save_json(payload: Any, output_path: str | Path) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as file_obj:
        json.dump(payload, file_obj, ensure_ascii=False, indent=2)


def load_json(input_path: str | Path) -> Any:
    path = Path(input_path)
    with path.open(encoding='utf-8') as file_obj:
        return json.load(file_obj)
