# 🚀 Руководство по запуску PopScope

## Предварительные требования

Убедитесь, что установлены:
- **Docker** ([скачать](https://www.docker.com/products/docker-desktop))
- **Docker Compose** (обычно идет с Docker Desktop)
- **Node.js 18+** и **npm** (для локальной работы с фронтенд без Docker, если нужно)

Проверьте установку:
```bash
docker --version
docker compose --version
```

## ⚙️ Первоначальная настройка

### 1. Клонируйте репозиторий
```bash
git clone <repository-url>
cd PopScope
```

### 2. Проверьте файл `.env`

Пример файла в .env.example

## 🐳 Запуск с Docker Compose

### 3. Запустите все сервисы
```bash
docker compose up -d (если нужен не демон, то уберите -d)
```

Это запустит:
- **PostgreSQL** (порт 5433)
- **Backend FastAPI** (порт 8000)
- Применит миграции БД автоматически (через Alembic)

### 4. (Опционально) импортируйте CSV-данные в БД

```bash
docker compose --profile data-seed run --rm data-import
```

Импорт данных выполняется отдельным профилем и не запускается по умолчанию.

### 5. Запустите фронтенд

В **отдельном терминале**:

```bash
cd frontend
npm install   # только при первом запуске
npm run dev
```

Фронтенд будет доступен на http://localhost:5173

### 6. Проверьте, что все работает

**Backend API:**
```bash
curl http://localhost:8000/api/v1/health
```

Должны получить успешный ответ.

**Frontend:**
- Откройте [http://localhost:5173](http://localhost:5173) в браузере (Vite dev-сервер)

### 7. Останавливайте сервисы, когда нужно
```bash
docker compose down
```

Чтобы также удалить данные БД:
```bash
docker compose down -v
```

---

## 🔧 Локальная разработка (опционально)

Если хотите разрабатывать без Docker:

### Backend (Python)
```bash
cd backend

# Создайте виртуальное окружение
python -m venv venv
source venv/bin/activate  # macOS/Linux
# или
venv\Scripts\activate     # Windows

# Установите зависимости
pip install -r requirements.txt

# Запустите тесты
pytest

# Запустите сервер (требует PostgreSQL отдельно)
uvicorn app.main:app --reload
```

### Frontend (Node.js)
```bash
cd frontend

# Установите зависимости
npm install

# Запустите dev-сервер
npm run dev

# Собрите production версию
npm run build
```

---

## 📋 Структура проекта

```
PopScope/
├── backend/           # FastAPI приложение
│   ├── app/          # Основной код
│   │   ├── api/      # API endpoints
│   │   ├── db/       # Модели БД
│   │   ├── schemas/  # Pydantic схемы
│   │   ├── services/ # Бизнес-логика
│   │   └── ...
│   ├── tests/        # Тесты
│   └── requirements.txt
├── frontend/         # React приложение
│   ├── src/
│   │   ├── app/      # Главные компоненты
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   └── package.json
├── db/              # legacy SQL (справочно, схема через Alembic)
├── docker-compose.yml
└── .env
```

---

## 🧪 Тестирование

```bash
# Запустите все тесты
docker compose exec backend pytest

# Запустите конкретный тест
docker compose exec backend pytest tests/api/test_health_api.py

# С покрытием
docker compose exec backend pytest --cov
```

---

## 🆘 Решение проблем

### Порты уже заняты
Если порты 5433 или 8000 уже используются, измените их в `.env`:
```env
POSTGRES_HOST_PORT=5434  # или другой порт
```
### Данные не загрузились
```bash
# Запустите импорт вручную
docker compose --profile data-seed run --rm data-import

# Посмотрите логи импорта
docker compose --profile data-seed logs data-import
```

### Ошибка подключения к БД
```bash
# Проверьте, что контейнер БД запущен и здоров
docker compose ps

# Просмотрите логи
docker compose logs db
```

### Миграции не применились
```bash
# Примените их вручную
docker compose exec backend python -m alembic upgrade head
```

### Сбросьте все (осторожно!)
```bash
docker compose down -v
docker compose up -d
```

---

## 📊 API документация

После запуска backend доступна Swagger документация:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

---

## 🎯 Основные команды

```bash
# Запуск
docker compose up -d

# Остановка
docker compose down

# Просмотр логов
docker compose logs -f backend
docker compose logs -f db

# Выполнение команды в контейнере
docker compose exec backend bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Пересборка контейнеров (после изменения Dockerfile)
docker compose build
docker compose up -d
```

---

✅ **Готово!** Приложение должно быть доступно:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Database: localhost:5433
