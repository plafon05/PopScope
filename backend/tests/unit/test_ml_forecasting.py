from pathlib import Path

from ml.forecasting import generate_predictions, train_model


def test_train_model_builds_artifact_and_predictions() -> None:
    data_path = Path(__file__).resolve().parents[2] / 'seed' / 'municipality_data.csv'
    artifact = train_model(data_path, start_year=2024, end_year=2038, model_run_id='test-run')

    assert artifact['model_name'] == 'damped_panel_trend'
    assert artifact['forecast_years'] == {'start': 2024, 'end': 2038}
    assert artifact['model_run_id'] == 'test-run'
    assert 'population' in artifact['evaluation']
    assert 'mae' in artifact['evaluation']['population']
    assert 'evaluation_summary' in artifact
    assert 'mean' in artifact['evaluation_summary']['population']

    predictions = generate_predictions(artifact, municipality_id=91601000, start_year=2024, end_year=2038)

    assert len(predictions) == 15
    assert predictions[0]['target_year'] == 2024
    assert predictions[-1]['target_year'] == 2038
    assert predictions[0]['municipality_id'] == 91601000
    assert predictions[0]['predicted_population'] > 0
    assert 'natural_increase_rate' in predictions[0]['confidence']
    assert 'quality_metrics' in predictions[0]['metadata']
    assert 'overall_quality_metrics' in predictions[0]['metadata']
    assert 'overall_quality_summary' in predictions[0]['metadata']
    assert 'population' in predictions[0]['metadata']['quality_metrics']
    assert 'mape' in predictions[0]['metadata']['quality_metrics']['population']


def test_natural_increase_interval_wraps_central_forecast() -> None:
    data_path = Path(__file__).resolve().parents[2] / 'seed' / 'municipality_data.csv'
    artifact = train_model(data_path, start_year=2024, end_year=2026, model_run_id='test-run')
    predictions = generate_predictions(artifact, municipality_id=4601000, start_year=2024, end_year=2026)

    for prediction in predictions:
        band = prediction['confidence']['natural_increase_rate']
        assert band['lower'] <= prediction['predicted_natural_increase_rate'] <= band['upper']


def test_quality_metrics_are_serialized_for_frontend() -> None:
    data_path = Path(__file__).resolve().parents[2] / 'seed' / 'municipality_data.csv'
    artifact = train_model(data_path, start_year=2024, end_year=2024, model_run_id='test-run')
    prediction = generate_predictions(
        artifact,
        municipality_id=91601000,
        start_year=2024,
        end_year=2024,
    )[0]

    population_metrics = prediction['metadata']['quality_metrics']['population']
    overall_population_metrics = prediction['metadata']['overall_quality_metrics']['population']
    overall_population_summary = prediction['metadata']['overall_quality_summary']['population']

    assert set(population_metrics) == {'mae', 'rmse', 'mape', 'sample_size'}
    assert set(overall_population_metrics) == {'mae', 'rmse', 'mape', 'sample_size'}
    assert set(overall_population_summary) == {'mean', 'median', 'p90'}
    assert population_metrics['sample_size'] >= 0
