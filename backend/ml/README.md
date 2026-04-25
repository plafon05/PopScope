# ML Forecasting

Папка `backend/ml` содержит обучение и генерацию прогноза демографических показателей по муниципалитетам.

## Что прогнозируется

- `population`
- `birth_rate`
- `death_rate`
- `natural_increase_rate`

Для `natural_increase_rate` дополнительно строится интервал `lower` / `upper`, который можно использовать как полупрозрачную заливку вокруг основной линии на графике.

## Запуск

```bash
python3 backend/ml/train.py
```

Скрипт создаст:

- `backend/ml/model.json` - артефакт обученной модели
- `backend/ml/predictions_2024_2038.json` - прогнозы на 2024-2038

## Повторная генерация прогнозов

```bash
python3 backend/ml/predict.py --model-path backend/ml/model.json
```

## Формат прогноза

Каждая запись совместима со схемой backend prediction API и содержит:

- `predicted_population`
- `predicted_birth_rate`
- `predicted_death_rate`
- `predicted_natural_increase_rate`
- `confidence.natural_increase_rate.lower`
- `confidence.natural_increase_rate.upper`
- `metadata.quality_metrics.<metric>.mae`
- `metadata.quality_metrics.<metric>.rmse`
- `metadata.quality_metrics.<metric>.mape`
- `metadata.overall_quality_metrics.<metric>.mae`
- `metadata.overall_quality_metrics.<metric>.rmse`
- `metadata.overall_quality_metrics.<metric>.mape`
- `metadata.overall_quality_summary.<metric>.mean`
- `metadata.overall_quality_summary.<metric>.median`
- `metadata.overall_quality_summary.<metric>.p90`

`quality_metrics` содержит метрики для конкретного муниципалитета, `overall_quality_metrics` - агрегированные метрики по всей модели.
`overall_quality_summary` содержит готовую сводку для интерфейса: средние, медианные и 90-й перцентиль ошибок по муниципалитетам.
