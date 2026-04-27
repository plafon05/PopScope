# Быстрый Старт PopScope

Короткая версия. Полная инструкция: [SETUP.md](SETUP.md)

## Первый запуск
```bash
git clone <repository-url>
cd PopScope
cp .env.example .env

# Backend + БД
docker compose up -d db backend

# Импорт данных и прогнозов 
docker compose --profile data-seed run --rm data-import
```

Frontend в отдельном терминале:
```bash
cd frontend
npm install
npm run dev
```

Готово:
- Frontend: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs

## Частые команды
```bash
# Логи backend
docker compose logs --tail=100 backend

# Остановить сервисы
docker compose down

# Полный сброс (удалит volume БД)
docker compose down -v
```

## Если после изменения ML логики прогнозы не обновились
```bash
docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE TABLE municipality_predictions RESTART IDENTITY;"'
docker compose exec -T backend sh -lc 'rm -f /app/ml/model.json /app/ml/predictions_2024_2038.json'
docker compose --profile data-seed run --rm data-import
```
