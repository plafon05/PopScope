# PopScope: Полное техническое описание

## 1. Назначение проекта

PopScope — веб-приложение для демографической аналитики по муниципальным образованиям РФ с тремя основными режимами:

- `Дашборд`: фактическая динамика, таблицы и карта плотности.
- `Прогнозы`: сравнение исторических рядов и ML-прогнозов по метрикам.
- `Аналитика`: расширенные графики и генерация текстовой аналитической справки (LLM/fallback).

Проект ориентирован на работу с муниципальным уровнем данных и на агрегирование по регионам/типам МО.

## 2. Технологический стек

## 2.1 Backend

- `FastAPI` — HTTP API.
- `SQLAlchemy 2.x` (async) + `asyncpg` — доступ к PostgreSQL.
- `Pydantic v2` + `pydantic-settings` — валидация схем и конфиг из `.env`.
- `Alembic` — миграции схемы.
- `httpx` — интеграция с GigaChat API.
- `pytest`, `pytest-asyncio` — тесты.

## 2.2 Frontend

- `React 18` + `TypeScript`.
- `Vite`.
- `react-router` — маршрутизация.
- `Recharts` — графики.
- `react-simple-maps` — карта РФ (GeoJSON).
- `Tailwind CSS` — стилизация.
- `lucide-react` — иконки.

## 2.3 Инфраструктура

- `Docker Compose`:
  - `db` (PostgreSQL 17),
  - `backend` (FastAPI + autoreload),
  - `data-import` (сидирование + генерация прогнозов).

## 3. Структура репозитория

```
backend/
  app/
    api/                 # маршруты и DI
    core/                # настройки приложения
    db/                  # engine/session/models
    repositories/        # слой доступа к данным
    schemas/             # Pydantic DTO
    services/            # бизнес-логика (reports + llm)
  alembic/               # миграции БД
  ml/                    # обучение и генерация прогнозов
  seed/                  # CSV и скрипт загрузки
  tests/                 # unit + api тесты

frontend/
  src/app/
    api/                 # http-клиент + API модули
    components/          # UI-компоненты
    data/                # контекст данных и типы
    lib/                 # утилиты и алгоритмы (регрессия, маппинг регионов)
    pages/               # Dashboard / Forecasts / Analytics
    routes.tsx           # маршруты приложения
```

## 4. Backend: архитектура и реализация

## 4.1 Инициализация приложения

Файл: `backend/app/main.py`

- создаётся `FastAPI` приложение;
- подключается CORS (`allowed_origins` из конфига);
- корневой endpoint `/`;
- основной API подключается под префиксом `API_PREFIX` (по умолчанию `/api/v1`).

## 4.2 Конфигурация и переменные окружения

Файл: `backend/app/core/config.py`

Ключевые группы настроек:

- App:
  - `APP_NAME`, `APP_ENV`, `APP_DEBUG`, `API_PREFIX`, `ALLOWED_ORIGINS`.
- Database:
  - `DATABASE_URL` (async DSN).
- Reports / LLM:
  - `REPORT_USE_LLM` (вкл/выкл LLM),
  - `LLM_PROVIDER` (`gigachat` | `stub`),
  - параметры GigaChat (`AUTH_URL`, `BASE_URL`, `MODEL`, `TIMEOUT`, SSL verify/CA bundle).

Настройки кэшируются через `lru_cache(maxsize=1)`.

## 4.3 Слой БД

### Сессия

Файл: `backend/app/db/session.py`

- `create_async_engine(...)`;
- `async_sessionmaker(...)`;
- DI-функция `get_db()` возвращает `AsyncSession`.

### Модель данных

Файл: `backend/app/db/models.py`

#### `municipalities`

- `id`, `name`, `region`, `type`, `area`.
- Индексы по `region`, `type`.

#### `municipality_data`

- связь с `municipalities`,
- `year`, `population`, `birth_rate`, `death_rate`, `migration`,
- уникальность `(municipality_id, year)`,
- ограничение `year >= 1900`.

#### `municipality_predictions`

- связь с `municipalities`,
- `target_year`, `model_name`, `model_version`, `model_run_id`,
- прогнозные поля: population/birth/death/natural_increase/migration,
- `confidence` (JSON),
- `metadata` (JSON, mapped as `extra_metadata`),
- уникальность `(model_run_id, municipality_id, target_year)`,
- индексы для фильтрации по времени, модели и МО.

## 4.4 API-слой

Файл маршрутизатора: `backend/app/api/router.py`

Подключённые группы:

- `health`,
- `municipalities`,
- `municipality-data`,
- `predictions`,
- `reports`.

### Municipalities API

Файл: `backend/app/api/v1/endpoints/municipalities.py`

- `GET /municipalities` — список с фильтрами `region`, `type`, пагинация.
- `GET /municipalities/{id}` — карточка МО.
- `GET /municipalities/{id}/data` — временные ряды по МО.

### Municipality Data API

Файл: `backend/app/api/v1/endpoints/municipality_data.py`

- `GET /municipality-data` — временные ряды по выборке с фильтрами и пагинацией.

### Predictions API

Файл: `backend/app/api/v1/endpoints/predictions.py`

- `POST /predictions` — создание прогнозной записи.
- `GET /predictions` — выборка прогнозов по `municipality_id`, `model_run_id`, `year_from`, `year_to`.

Особенность: явная обработка `IntegrityError`:

- конфликт уникальности → `409`,
- ошибка FK по `municipality_id` → `404`,
- прочие ошибки валидности записи → `400`.

### Reports API

Файл: `backend/app/api/v1/endpoints/reports.py`

- `POST /reports/analytics` — формирование аналитического текста по агрегатам.

## 4.5 Repository-слой

Файлы:

- `backend/app/repositories/municipalities.py`
- `backend/app/repositories/predictions.py`
- `backend/app/repositories/reports.py`

Принципы:

- репозитории получают `AsyncSession` через DI;
- инкапсулируют SQL-запросы, фильтрацию и пагинацию;
- API-эндпоинт не содержит SQL.

Особенно важно в `ReportRepository`:

- метрики считаются на стороне SQL агрегатами (`avg`, `sum`, `count distinct`);
- средние ставки из БД (в долях, например `0.0109`) масштабируются в промилле (`*1000`) для отображения.

## 4.6 Сервис аналитических отчётов

### `AnalyticsReportService`

Файл: `backend/app/services/reports.py`

Пайплайн:

1. запрос агрегатов в `ReportRepository`,
2. формирование детального промпта,
3. вызов LLM-клиента,
4. при ошибке LLM — fallback-текст.

Возвращается:

- `provider`,
- `model_name`,
- фильтры запроса,
- итоговый `report_text`.

### LLM-клиенты

Файл: `backend/app/services/llm.py`

- `StubLLMClient` — всегда возвращает служебный stub-текст.
- `GigaChatClient`:
  - получает OAuth-токен (`auth_url` + `scope`),
  - кэширует токен до `expires_at`,
  - отправляет `/chat/completions`,
  - возвращает `provider='gigachat'`, модель и текст.

Переключение провайдера:

- `REPORT_USE_LLM=false` → всегда stub;
- `REPORT_USE_LLM=true` + `LLM_PROVIDER=gigachat` → GigaChat;
- любые ошибки в рантайме не валят endpoint: сервис возвращает fallback.
 
### Собственная модель ML

## 5. ML-подсистема прогнозирования

Основной файл: `backend/ml/forecasting.py`

## 5.1 Цель модели

Построить прогнозы на годы `start_year..end_year` (по умолчанию `2024..2038`) для:

- `population`,
- `birth_rate`,
- `death_rate`,
- `natural_increase_rate` (`birth - death`).

Также формируется интервал доверия для `natural_increase_rate`.

## 5.2 Основные идеи модели

Модель гибридная, без heavy ML-фреймворков:

1. Для каждого ряда строится **damped trend** (затухающий тренд).
2. Для `death_rate` дополнительно обучается **autoregression (lag features)**.
3. Для прогноза смертности используется **смесь** trend + autoreg (вес подбирается backtest-ом).
4. Интервалы для natural increase строятся через horizon-dependent RMSE из backtest.

## 5.3 Спецификации метрик (`METRIC_SPECS`)

Для каждой метрики задаются:

- трансформация (`log` или `identity`),
- коэффициент затухания `damping`,
- вес короткого тренда `recent_trend_weight`,
- усиление недавних наблюдений `recency_strength`,
- границы клиппинга (`clip_min/clip_max`),
- веса аномальных лет (`anomaly_year_weights`).

Примеры:

- `population` — лог-трансформация + более мягкое затухание.
- `birth_rate`, `death_rate`, `natural_increase_rate` — identity + ограничение допустимого диапазона.

## 5.4 Подготовка данных

Функции:

- `load_rows` — чтение CSV, вычисление `natural_increase_rate`;
- `group_rows_by_municipality` — группировка по МО, сортировка по году.

## 5.5 Оценка локального ряда (SeriesModel)

`SeriesModel` хранит:

- последний год/уровень,
- трансформированный уровень,
- тренд `slope`,
- error/volatility,
- границы истории.

Алгоритм `_fit_series_model`:

1. регрессия по взвешенным точкам;
2. вычисление длинного и короткого slope;
3. смешивание slope (long/short);
4. shrinkage к глобальной модели при малой истории;
5. «якорение» последнего уровня на недавних значениях.

Прогноз `_forecast_from_model`:

- суммирует затухающие приращения `slope * damping^k`,
- выполняет обратную трансформацию,
- клиппинг в допустимый диапазон.

## 5.6 Autoregression для смертности

Фичи (`AUTOREG_LAGS=3`):

- `lag1..lag3`,
- `mean3`,
- `delta1`, `delta2`,
- `year_offset`.

Модель:

- линейная регрессия в closed-form через `X^T W X`,
- лёгкая L2-регуляризация (ridge-like),
- вычисляется `residual_scale`.

Прогноз последовательности:

- rolling на синтетической истории,
- клиппинг в границы `death_rate`.

## 5.7 Backtest и quality metrics

Ключевые константы:

- `MIN_BACKTEST_TRAIN_SIZE=4`,
- `BACKTEST_HOLDOUT_POINTS=3`.

Считаются:

- `MAE`,
- `RMSE`,
- `MAPE`,
- `sample_size`.

Quality метрики сохраняются:

- по каждому МО и метрике,
- глобально по всем МО,
- summary (`mean`, `median`, `p90`).

## 5.8 Интервалы доверия natural increase

Параметры:

- `level=0.68`,
- `z_score=1.0`,
- `width_multiplier=0.8`.

Логика:

1. считается RMSE по горизонтам (`by_horizon`);
2. горизонты расширяются функцией `_expand_horizon_metrics`:
   - blending при малом `sample_size`,
   - монотонность ширины (не уже, чем предыдущий горизонт);
3. ширина интервала:
   `width = width_multiplier * z_score * rmse`;
4. в `generate_predictions` для каждого года:
   - `lower = prediction - width`,
   - `upper = prediction + width`,
   - оба значения клиппятся.

Fallback-иерархия для ширины:

1. муниципальный `by_horizon`,
2. муниципальный `fallback`,
3. глобальный `by_horizon`,
4. `natural_model.volatility`.

## 5.9 Артефакты модели

`train_model` возвращает JSON-артефакт:

- идентификаторы модели (`name/version/run_id`),
- окна прогноза,
- глобальные и локальные параметры рядов,
- autoreg-модель смертности,
- quality metrics,
- интервальные настройки,
- payload по каждому МО.

`generate_predictions` на основе артефакта строит записи для БД/API.

## 5.10 Скрипты `ml/`

- `train.py`:
  - `ensure_training_artifacts` — если `model.json` + `predictions_*.json` уже есть, переобучение не запускается.
- `predict.py`:
  - догенерация прогнозов из сохранённой модели.

## 6. Сидирование и pipeline данных

Файл: `backend/seed/seed.py`

Последовательность:

1. загрузка `municipalities.csv`,
2. загрузка `municipality_data.csv`,
3. генерация/чтение ML-артефактов,
4. батч-запись прогнозов в `municipality_predictions`.

Особенности:

- авто-детект разделителя `,`/`;`;
- поддержка кодировок `utf-8-sig`, `utf-8`, `cp1251`;
- нормализация optional-чисел (`null/none/nan`, запятая как разделитель);
- seed идемпотентен: если таблица уже не пустая, данные пропускаются.

## 7. Frontend: архитектура и поведение

## 7.1 Глобальный источник данных

`DemographyProvider`:

- при старте грузит все МО и все данные по годам (постранично);
- объединяет в единый массив `MunicipalityRecord`;
- вычисляет `regions`, `years`, `minYear/maxYear`, `municipalityCount`.

Важный нюанс:

- birth/death/migration в API приходят в долях;
- во frontend конвертируются:
  - в `‰` (`*1000`),
  - natural growth percent (`*100`).

## 7.2 API-клиенты фронта

- `api/client.ts` — универсальные `apiGet`/`apiPost` c единой обработкой ошибок.
- `api/demography.ts` — массовая загрузка `/municipalities` и `/municipality-data`.
- `api/predictions.ts`:
  - получает последний `model_run_id`,
  - грузит все прогнозы по run постранично,
  - мапит confidence lower/upper.
- `api/reports.ts` — `POST /reports/analytics`.

## 7.3 Страницы

### Dashboard (`pages/Dashboard.tsx`)

- Фильтры (регион/тип/период),
- таблица МО,
- график динамики с tabs,
- карта плотности.

Минимальный год принудительно не ниже 2008 (`effectiveMinYear`).

### Forecasts (`pages/Forecasts.tsx`)

- фильтры по региону/типу/МО,
- выбор показателя,
- выбор горизонта прогноза,
- график «факт/прогноз» с пунктиром и confidence-интервалами,
- карточки лидеров по позитивной/негативной динамике.

Логика источников:

- если ML-прогноз для точки есть — берётся он;
- иначе серия может быть скрыта/не построена для МО без достаточной истории.

### Analytics (`pages/Analytics.tsx`)

- продвинутые визуализации (bar/line/radar/scatter/composed),
- расчёт агрегатов и сравнений по регионам/типам МО,
- генерация аналитической справки через `/reports/analytics`,
- markdown-like рендер текста отчёта с адаптацией под блоки.

## 7.4 Карта плотности и матчинг регионов

Карта (`HeatMap.tsx`) использует внешний GeoJSON РФ.

Ключевой модуль `lib/heatmapRegions.ts`:

- нормализует и канонизирует названия регионов,
- применяет alias/fragment-словарь (рус/англ варианты),
- токенизирует названия,
- использует similarity по корням токенов,
- накладывает пороги надёжности (`MATCH_MIN_SCORE`, `MATCH_MIN_MARGIN`),
- возвращает `null`, если сопоставление неоднозначно.

Плотность считается как:

- для каждого региона берётся последний доступный год,
- `density = Σpopulation / Σarea` по МО региона.

## 8. Тестирование

Backend тесты разделены на:

- `tests/unit` — репозитории, сервисы, ML-вспомогательная логика, LLM-клиент;
- `tests/api` — endpoint-контракты.

Примеры:

- `test_ml_forecasting.py`
- `test_predictions_api.py`
- `test_report_service.py`
- `test_llm.py`

## 9. Сильные стороны текущей реализации

- Чёткое разделение слоёв: API → Service → Repository.
- Асинхронный backend стек.
- Идемпотентный seed-процесс.
- ML-подход без внешних тяжёлых зависимостей, но с инженерной стабилизацией:
  - blend trend/autoreg,
  - horizon-aware интервалы,
  - fallback-цепочки.
- Гибкая деградация отчётов: приложение работает и при недоступности LLM.

## 10. Ограничения и практические нюансы

- В `frontend/package.json` есть много UI-библиотек, но реально активно используется только часть.
- Визуальная метрика и статистическая метрика могут отличаться по единицам измерения (доли/‰/%), поэтому важно явно фиксировать единицы на каждом графике.
- Доверительный интервал строится на RMSE-бэкстесте и отражает модельную неопределённость, а не «истинный» вероятностный интервал из байесовской модели.
- При массовой выгрузке фронт тянет всю историю и прогнозы пагинацией, поэтому на больших объёмах важны оптимизация и кеширование.

## 11. Ключевые файлы для быстрого входа

Backend:

- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/db/models.py`
- `backend/app/api/router.py`
- `backend/app/api/v1/endpoints/predictions.py`
- `backend/app/services/reports.py`
- `backend/app/services/llm.py`
- `backend/ml/forecasting.py`
- `backend/seed/seed.py`

Frontend:

- `frontend/src/app/data/DemographyProvider.tsx`
- `frontend/src/app/api/demography.ts`
- `frontend/src/app/api/predictions.ts`
- `frontend/src/app/pages/Dashboard.tsx`
- `frontend/src/app/pages/Forecasts.tsx`
- `frontend/src/app/pages/Analytics.tsx`
- `frontend/src/app/components/HeatMap.tsx`
- `frontend/src/app/lib/heatmapRegions.ts`
