# PopScope

PopScope — сервис демографической аналитики и прогнозирования по муниципалитетам России.

## О проекте
PopScope объединяет фактические демографические данные, визуальную аналитику и ML-прогнозы до `2038` года.

**Настройка и запуск:** [SETUP.md](SETUP.md)

## Технологии
| Слой | Стек |
|---|---|
| Backend | FastAPI, SQLAlchemy, PostgreSQL |
| Frontend | React, Vite, Recharts, react-simple-maps |

## Что умеет
- Аналитика фактических данных по населению и демографии.
- Прогнозы по ключевым метрикам до `2038` года.
- Доверительные интервалы для естественного прироста.
- Карта плотности населения по регионам.

## Метрики
| Поле | Описание |
|---|---|
| `population` | Численность населения |
| `birth_rate` | Коэффициент рождаемости |
| `death_rate` | Коэффициент смертности |
| `natural_increase_rate` | Естественный прирост (`birth_rate - death_rate`) |

## Данные
| Источник | Файл |
|---|---|
| Справочник муниципалитетов | [backend/seed/municipalities.csv](backend/seed/municipalities.csv) |
| Исторические показатели | [backend/seed/municipality_data.csv](backend/seed/municipality_data.csv) |

## Важные правила расчётов
- Карта плотности считает региональную плотность как `Σpopulation / Σarea` по региону за последний доступный год.
- Матчинг регионов GeoJSON и данных делается через нормализацию названий, alias-правила и контроль неоднозначных совпадений.
- Доверительные интервалы в прогнозах строятся по horizon-ошибкам backtest с защитой от нестабильных узких интервалов на дальних горизонтах.

## API и документация
| Ресурс | URL |
|---|---|
| Swagger UI | `http://localhost:8000/docs` |
| ReDoc | `http://localhost:8000/redoc` |

**Основные эндпоинты:**
- `GET /api/v1/municipalities`
- `GET /api/v1/municipality-data`
- `GET /api/v1/predictions`
- `GET /api/v1/health/live`

## Тесты
### ML-логика
```bash
pytest backend/tests/unit/test_ml_forecasting.py
```

### API прогнозов
```bash
pytest backend/tests/api/test_predictions_api.py
```
