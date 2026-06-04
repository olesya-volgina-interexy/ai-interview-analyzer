# Локальный запуск

Инструкция для разработчика, поднимающего проект с нуля на Windows / macOS / Linux.

## 1. Требования

- **Node.js** 20 LTS или новее
- **pnpm** 10.33.0 (`corepack enable && corepack prepare pnpm@10.33.0 --activate`)
- **Docker Desktop** (для Postgres, Redis, Qdrant)
- **Git**

Проверка:
```bash
node -v        # v20+
pnpm -v        # 10.33.0
docker -v
```

## 2. Клонирование и переключение на develop

```bash
git clone https://github.com/olesya-volgina-interexy/ai-interview-analyzer.git
cd ai-interview-analyzer
git checkout develop
```

> **Важно:** работаем в `develop`. Ветка `main` — релизная, прямые коммиты туда запрещены.

## 3. Установка зависимостей

```bash
pnpm install
```

Команда поставит зависимости во все workspace'ы (`apps/api`, `apps/web`, `packages/shared`).

## 4. Инфраструктура (Postgres + Redis + Qdrant)

```bash
pnpm infra:up
```

Поднимутся три контейнера (см. `docker-compose.yml`):
- Postgres на `localhost:5432` (db `interviews`, user `user`, password `password`)
- Redis на `localhost:6379`
- Qdrant на `localhost:6333`

Остановить: `pnpm infra:down`. Полный сброс с данными: `pnpm infra:reset`.

## 5. Переменные окружения

### apps/api/.env

Скопировать пример и заполнить секретами:

```bash
cp apps/api/.env.example apps/api/.env
```

Минимум для локального запуска:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/interviews
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                            # пусто для локального qdrant
QDRANT_COLLECTION=interviews

LLM_API_KEY=<спросить у тимлида>
LLM_BASE_URL=<спросить у тимлида>
LLM_MODEL=<спросить у тимлида>

JWT_SECRET=<любая длинная случайная строка, например `openssl rand -hex 32`>
ADMIN_EMAIL=admin@interexy.com
ADMIN_PASSWORD=changeme

CORS_ORIGIN=http://localhost:5173
PORT=3001
NODE_ENV=development
```

Остальные переменные (`LINEAR_API_KEY`, `KRISP_WEBHOOK_SECRET`, `CHROME_PATH`) нужны только если работаете с соответствующими интеграциями.

> **Где взять секреты:** `LLM_API_KEY`, `LINEAR_API_KEY`, прод-credentials Qdrant — у тимлида (передаются через 1Password / личным сообщением, не через git).

### apps/web/.env (опционально для локалки)

Для локальной разработки фронт сам стучится в `http://localhost:3001` — отдельный `.env` не нужен. Файл `apps/web/.env.production.example` — это для прод-сборки на Render.

## 6. Миграции БД и создание админ-пользователя

```bash
cd apps/api
pnpm prisma migrate deploy     # применить все миграции
pnpm prisma db seed            # создать админа из ADMIN_EMAIL/ADMIN_PASSWORD
cd ../..
```

После сида можно логиниться в приложение под `admin@interexy.com` / `changeme` (или тем, что указано в `.env`).

## 7. Запуск приложения

```bash
pnpm dev
```

Запустит параллельно все workspace'ы:
- API (Fastify) на `http://localhost:3001`
- Web (Vite + React) на `http://localhost:5173`
- Воркеры (`analyze.worker`, `preparation.worker`) поднимаются вместе с API

Открыть в браузере `http://localhost:5173`, залогиниться админом — готово.

## 8. Типичные проблемы

### `Cannot read properties of undefined (reading 'parse')` при логине
Не пересобран `@shared/schemas` после изменений в его исходниках. Лечится:
```bash
pnpm --filter @shared/schemas build
```

### `prisma: command not found`
Запускайте prisma-команды из `apps/api` (там dev-зависимость), либо через `pnpm --filter @app/api exec prisma ...`.

### Контейнеры не стартуют (порт занят)
Проверьте, не запущен ли уже Postgres/Redis локально:
```bash
# Windows
netstat -ano | findstr 5432
# macOS/Linux
lsof -i :5432
```

### Логин возвращает 401
Проверьте, что выполнили `pnpm prisma db seed` и `ADMIN_EMAIL` / `ADMIN_PASSWORD` совпадают с тем, что вводите.

## 9. Workflow веток

- **Новая фича / правка UI / правка фич develop** → ветка от `develop`, PR в `develop`.
- **Фикс логики анализа (должен попасть в `main`)** → ветка от `main`, PR в `main`, после мерджа подтянуть `main` → `develop`.
- **Никогда** не открываем PR из `develop` в `main` напрямую без согласования.

Подробнее — спросить у тимлида перед первым PR.
