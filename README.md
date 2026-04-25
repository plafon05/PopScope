# PopScope Backend

FastAPI backend для демографической аналитики и прогноза муниципалитетов.

## Быстрый старт
1. Скопируйте `.env.example` в `.env` и заполните значения.
2. Поднимите сервисы:
```bash
docker compose up --build
```
3. API и документация:
- `http://localhost:8000`
- `http://localhost:8000/docs`

Полное руководство: [SETUP.md](SETUP.md)

## Полезные команды
- Применить миграции вручную:
```bash
docker compose exec backend python -m alembic upgrade head
```
- Импортировать CSV-данные и прогнозы в БД:
```bash
docker compose --profile data-seed run --rm data-import
```
- Запустить тесты:
```bash
docker compose exec backend pytest
```
