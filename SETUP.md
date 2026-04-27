# Руководство по запуску PopScope

Документ описывает рекомендуемый рабочий сценарий проекта:
- база и backend в Docker,
- frontend локально через Vite.

## 1. Что нужно заранее

Установите:
- Docker Desktop
- Docker Compose (обычно входит в Docker Desktop)
- Node.js 18+ и npm

Проверьте:
```bash
docker --version
docker compose version
node -v
npm -v
```

## 2. Подготовка конфигурации

В корне проекта:
```bash
cp .env.example .env
```

При необходимости проверьте значения в `.env`:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` (должен ссылаться на хост `db` внутри docker compose)
- `POSTGRES_HOST_PORT` (по умолчанию `5433`)

Для frontend (опционально, если нужно переопределить API URL):
```bash
cp frontend/.env.example frontend/.env.local
```

## 3. Запуск backend и БД

Из корня проекта:
```bash
docker compose up -d db backend
```

Проверьте, что backend жив:
```bash
curl -s http://localhost:8000/api/v1/health/live
curl -s http://localhost:8000/api/v1/health/ready
```

Если всё в порядке:
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 4. Запуск frontend

В отдельном терминале:
```bash
cd frontend
npm install
npm run dev
```

Frontend будет доступен на `http://localhost:5173`.

## 5. Загрузка данных и прогнозов

Из корня проекта:
```bash
docker compose --profile data-seed run --rm data-import
```

Что делает команда:
- применяет миграции,
- загружает муниципалитеты,
- загружает исторические данные,
- обучает модель и загружает прогнозы (если их ещё нет).

## 6. Проверка, что всё готово

Проверка данных:
```bash
curl -s "http://localhost:8000/api/v1/municipalities?limit=1&offset=0"
curl -s "http://localhost:8000/api/v1/municipality-data?limit=1&offset=0"
curl -s "http://localhost:8000/api/v1/predictions?limit=1&offset=0"
```

## 7. Ежедневная работа

Запустить:
```bash
docker compose up -d db backend
```

Остановить:
```bash
docker compose down
```

Логи backend:
```bash
docker compose logs --tail=100 backend
```

Как остановить:
```bash
# Остановить и удалить контейнеры/сеть проекта
docker compose down

# Просто остановить контейнеры (без удаления)
docker compose stop db backend

# Полный сброс (включая volume БД)
docker compose down -v
```

## 8. Пересчёт прогнозов после изменений ML-логики

Важно: обычный `data-import` пропустит прогнозы, если таблица `municipality_predictions` уже заполнена.

Принудительный пересчёт:
```bash
docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE TABLE municipality_predictions RESTART IDENTITY;"'
docker compose exec -T backend sh -lc 'rm -f /app/ml/model.json /app/ml/predictions_2024_2038.json'

Еслли нужно очистить и дугие даблицы БД:
docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE TABLE municipality_data RESTART IDENTITY CASCADE;"'
docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE TABLE municipalities RESTART IDENTITY CASCADE;"'

docker compose --profile data-seed run --rm data-import
```
Проверка нового run:
```bash
curl -s "http://localhost:8000/api/v1/predictions?limit=1&offset=0"
```
Смотрите поле `model_run_id`.

## 9. Нужно изменить метод генерации отчетов

### Правишь .env
Если нужна LLM
```bash
REPORT_USE_LLM=true
LLM_PROVIDER=gigachat
+ GIGACHAT_* переменные
```
Если нужно программно
```bash
REPORT_USE_LLM=false
LLM_PROVIDER=stub
```
### Пересоздаёшь backend, чтобы он перечитал env
```bash
docker compose up -d --force-recreate backend
```
### Проверяешь генерацию отчёта
```bash
curl -s -X POST "http://localhost:8000/api/v1/reports/analytics" \
  -H "Content-Type: application/json" \
  -d '{"year_from":2019,"year_to":2023}' | jq '.provider,.model_name'
```

## 10. Тесты

Backend unit:
```bash
pytest backend/tests/unit/test_ml_forecasting.py
```

Backend API:
```bash
pytest backend/tests/api/test_predictions_api.py
```

Через контейнер backend:
```bash
docker compose exec -T backend pytest
```

## 11. Частые проблемы

### 11.1 `data-import` пишет: `Прогнозы уже загружены, пропускаем`
Это штатное поведение. Используйте сценарий из раздела 8.

### 11.2 `permission denied while trying to connect to the docker API`
Проверьте, что Docker Desktop запущен и текущий пользователь имеет доступ к Docker socket.

### 11.3 Нужно сбросить всё состояние
```bash
docker compose down -v
```
Это удалит данные Postgres volume.

### 11.4 Нужно пересоздать контейнер
```bash
docker compose up -d --force-recreate --no-deps backend
```

