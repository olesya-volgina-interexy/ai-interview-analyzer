# V2 Audit — AI Interview Analyzer

> Аудит кодовой базы перед проектированием V2: подготовка кандидатов к интервью с конкретным клиентом, чат с AI и генерация документа подготовки.
>
> Дата: 2026-04-29. Ветка: `develop`. HEAD: `6ddc5ae`.

---

## 1. Данные о клиентах

### Текущее состояние

**Модель `Client`** (`apps/api/prisma/schema.prisma:37-44`) — определена, но в коде **никогда не используется**:

```prisma
model Client {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  insights    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- Глобальный grep `prisma\.client\.` по `apps/api/src` не находит ни одного запроса к таблице `Client` (есть только обращения к `llmClient`/`embeddingClient`).
- Поле `Client.insights` (Json) предусмотрено под LLM-инсайты, но **нет ни writer'а, ни reader'а, ни промпта**, который их генерирует.
- `Client.description` — пустой; нет UI/API для заполнения.

**Денормализованный `clientName: String?`** хранится строкой (без FK) на трёх сущностях:
- `Interview.clientName` (`schema.prisma:19`)
- `IncomingRequest.clientName` (`schema.prisma:49`)
- `PipelineCandidate.clientName` (`schema.prisma:83`)

Источник `clientName` — webhook Linear (`apps/api/src/routes/webhooks/linear.ts:208` через `parseIssueTitle`). При смене заголовка тикета во всех трёх таблицах делается `updateMany` (строки 211–224). Никакой `Client`-записи при этом не создаётся.

**Связи Interview → Client**: только через строковое поле `clientName`. FK нет, на уровне Prisma связи отсутствуют.

**API-эндпоинтов про клиентов нет**:
- `apps/api/src/routes/` — `analyze.ts`, `interviews.ts`, `candidates.ts`, `stats.ts`, `webhooks/linear.ts`. Префикс `/api/clients` не зарегистрирован.
- В статистике клиенты участвуют только как агрегат: `stats.requests.byClient` (`apps/api/src/routes/stats.ts:63-66`).
- Список значений для UI-фильтра (`getClients` endpoint) **отсутствует** — фронтенд берёт список из `byClient` объекта статистики или пишет имя руками.

### Что можно переиспользовать

- Сама таблица `Client` (схема + миграция `20260327151733_init`) — пустая, но есть. JSON-поле `insights` готово принять любую структуру.
- Денормализованный `clientName` на `Interview` — готовый ключ агрегации; индекс для фильтра в Qdrant уже есть (`apps/api/src/db/qdrant.ts:12`).

### Что нужно доработать

- Запустить запись в `Client`: при первом упоминании в Linear-вебхуке создавать запись (upsert по `name`), синхронизировать `description` из issue body / broker request.
- Написать backfill-скрипт: пройтись по `DISTINCT clientName` из `Interview`/`IncomingRequest`/`PipelineCandidate` и создать записи `Client`.
- Добавить эндпоинты:
  - `GET /api/clients` — список с агрегатами (число интервью, hire-rate).
  - `GET /api/clients/:name` или `/:id` — карточка клиента (insights + последние интервью).
  - `POST /api/clients/:id/insights/regenerate` — пересборка `insights` (фоновый job).

### Что нужно создать с нуля

- **Сущность `ClientInterviewProfile`** (рекомендуется отдельно от `Client`, чтобы не смешивать редактируемое описание клиента и LLM-агрегат): хранит структурированный «профиль интервью» — типичные вопросы менеджера, паттерны успехов/провалов, специфичные требования. Альтернатива — расширить `Client.insights` JSON-схемой.
  - Поля: `clientId`, `lastBuiltAt`, `interviewCountAtBuild`, `managerQuestions: Json` (топ N + темы), `successPatterns: Json`, `failurePatterns: Json`, `requirements: Json`, `summary: String`.
- LLM-промпт `buildClientInsightsSystemPrompt` (см. раздел 3).
- Воркер `client-insights.worker.ts` (см. раздел 5).

**Вывод по разделу 1:** текущей `Client` недостаточно. `insights` Json есть, но пуст и не имеет схемы. Нужна отдельная новая модель/расширение под структурированный профиль интервью + механизм его регенерации.

---

## 2. Вопросы менеджеров и паттерны интервью

### Текущее состояние

**Хранение вопросов:**
- Поле `Interview.questions: Json?` (`schema.prisma:29`).
- Структура — массив объектов:
  ```ts
  { question: string; topic?: string; candidateHandled?: 'well' | 'partial' | 'poor' | 'skipped' }
  ```
  Zod-схема: `InterviewQuestionsSchema` в `packages/shared/src/schemas.ts:22-28`.
- Источник — LLM-выход. В `manager_call` промпте задача №6 (`apps/api/src/prompts/analyze.prompt.ts:68-71`) и в `technical` task №8 (строка 272) явно требуют извлечь ВСЕ вопросы из транскрипта. Структура вопросов внутри JSON-схемы определена в `MANAGER_CALL_JSON_SCHEMA` (строка 401–407) и `TECHNICAL_JSON_SCHEMA` (строка 444–451).
- Запись — `apps/api/src/db/db.service.ts:40` → `data.questions ? (data.questions as object[]) : undefined`. Воркер передаёт `questions` извлечёнными из `analysis.questions` (`analyze.worker.ts:219`).

**Имя менеджера** (`Interview.managerName: String?`, `schema.prisma:28`):
- Источник — Linear-парсер: `candidate.managerName` приходит в `triggerManagerCall` (`webhooks/linear.ts:380`).
- Заполняется только для `manager_call` стадии. Для `technical` менеджер не записывается (`triggerTechCall` не передаёт `managerName`, см. `webhooks/linear.ts:443`).
- Эндпоинт `GET /api/interviews/managers` (`routes/interviews.ts:40-47`) — возвращает distinct список менеджеров. Используется фронтом для фильтра.

**Связь Interview → Client**: только через `Interview.clientName`. Агрегация вопросов по клиенту в коде **не реализована** — нужен новый запрос `WHERE clientName = ? AND stage = 'manager_call'` + раскрутка JSON-массива.

**Эндпоинты, которые отдают вопросы:**
- `GET /api/interviews/:id` (`routes/interviews.ts:59`) — возвращает interview со всеми полями, включая `questions`.
- В списках (`GET /api/interviews`, `GET /api/candidates`) поле `questions` НЕ селектится.
- Отдельного эндпоинта типа `GET /api/clients/:name/questions` нет.

### Что можно переиспользовать

- Само поле `questions` уже валидно структурировано — никакой миграции данных не нужно.
- `managerName` можно агрегировать «как есть» по `clientName` для определения частых менеджеров клиента.
- LLM уже извлекает все вопросы — не нужно переписывать промпт ради ретро-сбора.

### Что нужно доработать

- **`triggerTechCall`** не пишет `managerName` (`webhooks/linear.ts:441-446`) — добавить, иначе профиль клиента будет видеть только «менеджеров с manager-call», а не «всех, кто вёл интервью».
- Парсер Linear (`linear.parser.ts`) — проверить, есть ли вообще извлечение менеджера на технической стадии (если нет — `null` приемлем, но это надо честно отразить в профиле).
- Селект `questions` в эндпоинте списка не критичен, но для построения профиля нужен новый агрегирующий эндпоинт (см. ниже).

### Что нужно создать с нуля

- **Сервис `clientProfile.service.ts`**:
  - `aggregateClientQuestions(clientName)` — раскручивает `questions` JSON по всем интервью клиента, кластеризует через существующий `clusterTextItems` (`llm.service.ts:108`) или новый промпт «топ N тем интервью клиента».
  - `aggregateClientPatterns(clientName)` — собирает `decisionBreakers`/`strengths`/`weaknesses` по интервью клиента.
- **Эндпоинт `GET /api/clients/:name/profile`** — возвращает агрегат для UI и для контекста подготовки.
- Возможно — таблица `InterviewQuestion` (нормализованная) для быстрых агрегатов, но это оптимизация: на текущих объёмах JSON-агрегация достаточна.

**Вывод по разделу 2:** существующих данных достаточно для построения «профиля клиента» из вопросов. Нужно (а) допилить запись `managerName` для technical-стадии, (б) написать сервис агрегации, (в) добавить эндпоинт. Структура `questions` менять не нужно.

---

## 3. LLM-пайплайн и промпты

### Текущее состояние

**Файлы:**
- `apps/api/src/services/llm.client.ts` — единственный экземпляр OpenAI-клиента, baseURL/apiKey из env, модель из `LLM_MODEL` (default `qwen-plus`).
- `apps/api/src/services/llm.service.ts` — три функции:
  1. `analyzeInterview(transcript, meta, options)` — основной анализ manager_call/technical.
  2. `analyzeFinalResult(previousAnalyses, decision)` — финальный синтез после двух стадий.
  3. `clusterTextItems(items, type)` — LLM-кластеризация для статистики.
- `apps/api/src/prompts/analyze.prompt.ts` — все промпты в коде, как функции:
  - `buildManagerCallSystemPrompt(meta)` (строки 3-81)
  - `buildTechnicalSystemPrompt(meta)` (строки 83-298)
  - `buildFinalResultSystemPrompt(decision)` (строки 300-328)
  - `buildSystemPrompt(meta)` — диспатчер по `meta.stage`
  - `buildUserMessage(transcript, cvText, brokerRequest, similarCases)` — единый шаблон user-сообщения с тегами `<transcript>`, `<cv>`, `<broker_request>`
  - JSON-схемы как строковые константы: `MANAGER_CALL_JSON_SCHEMA`, `TECHNICAL_JSON_SCHEMA`, `FINAL_RESULT_JSON_SCHEMA`
  - `formatSimilarCases(cases)` для RAG-контекста
- `apps/api/src/services/cv.service.ts` — три отдельных LLM-вызова (имя из CV, уровень из CV, имя из транскрипта). Все промпты inline.

**Что передаётся в промпт анализа** (`llm.service.ts:31-37`):
- system: `buildSystemPrompt(meta)` + `\n\n` + JSON-schema
- user: `transcript` + `cvText` + `brokerRequest` + `similarCases` (опционально)
- `temperature: 0.1`, `max_tokens: 6000`, `response_format: { type: 'json_object' }`

**Формат ответа:**
- Discriminated union по `stage` — `CandidateAnalysisSchema` (`packages/shared/src/schemas.ts:121-125`):
  - `ManagerCallAnalysisSchema`
  - `TechnicalAnalysisSchema`
  - `FinalResultAnalysisSchema`
- Валидация — Zod на выходе (`llm.service.ts:60`, `97`). Полная strict-схема (без `passthrough()`).

**Где живут системные промпты:** только в коде (`apps/api/src/prompts/analyze.prompt.ts`). В БД/конфиге их **нет**. Версионирование — через git.

**Сложность добавления нового типа промпта:**
- Архитектурно — низкая: достаточно добавить новую функцию `buildXxxSystemPrompt`, новую JSON-схему, новый Zod-тип, новый метод в `llm.service`. Никаких регистраций/диспатчеров через таблицы — всё статически.
- НО: текущий `analyzeInterview` жёстко привязан к `InterviewMeta` и одному формату user-message. Для chat-режима с историей/streaming потребуется отдельная функция, не переиспользование `analyzeInterview`.

### Что можно переиспользовать

- `llmClient` (singleton OpenAI) — без изменений.
- `clusterTextItems` — для агрегации тем из вопросов клиента.
- `formatSimilarCases` — для подачи похожих кейсов в любой новый промпт.
- Паттерн «строковая JSON-schema → Zod» — повторить для новых ответов.

### Что нужно доработать

- Параметризовать `LLM_MODEL`/`temperature` на уровне вызова (для чата нужна выше temperature, для генерации документа — ниже). Сейчас temperature и max_tokens захардкожены.
- Добавить поддержку **multi-turn history** — текущие функции принимают только одиночный user-message; для чата нужен массив `messages`.
- Стриминг (`stream: true`) — для UX чата критично, в текущей реализации ответ блокирующий.

### Что нужно создать с нуля

- **`buildClientInsightsSystemPrompt(client, interviewsData)`** + JSON-schema + Zod-схема (`ClientInsightsSchema`).
- **`buildPreparationDocSystemPrompt(client, candidate, clientProfile, brokerRequest)`** + Markdown-формат вывода (документ — не JSON, либо JSON с секциями).
- **`buildChatSystemPrompt(client, candidate, clientProfile)`** — короткий system + tool-use для подгрузки доп. контекста (опционально).
- **Сервисный слой `chat.service.ts`** — отдельный от `llm.service`, со streaming-поддержкой и хранением истории сессии.
- **`generationDoc.service.ts`** — отдельная функция, генерирующая Markdown.

**Вывод по разделу 3:** `llm.service` хорошо структурирован, но заточен под одноразовый JSON-анализ. Для V2 нужно расширить его новыми функциями (или вынести в `chat.service`/`docGen.service`), потому что чат и генерация документа имеют принципиально другие требования (history, streaming, free-form output).

---

## 4. RAG и Qdrant

### Текущее состояние

**Коллекция:** `interviews` (`apps/api/src/db/qdrant.ts:9`, env `QDRANT_COLLECTION`).
- Размер вектора — 1024 (Qwen `text-embedding-v4`, см. `embedding.service.ts:13`).
- Distance — `Cosine`.
- Payload-индексы (keyword): `role`, `level`, `clientName`, `stage`, `decision` (`qdrant.ts:12`). Создаются идемпотентно при старте.

**Что эмбеддится** (`embedding.service.ts:20-30`):
```
transcript + "CV:\n<cvText[:2000]>" + "Запрос брокера:\n<brokerRequest[:500]>"
```
Truncate до 8000 символов перед отправкой в эмбеддер.

**Метаданные точки** (`rag.service.ts:11-22`, callsite — `analyze.worker.ts:247-253`):
```ts
{ role, level, stage, decision, clientName }
```
Вызов `saveEmbedding(interview.id, vector, payload)` — id точки совпадает с `Interview.id`.

**Поиск** (`rag.service.ts:25-65`):
1. Пытается фильтр `role + level + clientName` (limit 3).
2. Если по клиенту не набралось 3 — fallback `role + level` без клиента.
3. Возвращает только id, без payload (`with_payload: false`). Затем worker подтягивает анализ из Postgres (`getInterviewsByIds`).

Фильтрация по `clientName` уже работает (видно в `findSimilarInterviews`, строка 41).

### Что можно переиспользовать

- Коллекция `interviews` и payload-индексы — пригодны как есть для всех сценариев V2 «найти похожие интервью клиента».
- `saveEmbedding`/`findSimilarInterviews` — дополняются легко, без миграции коллекции.
- Embedder и `buildEmbeddingText` — переиспользуются для эмбеддинга вопросов, документов подготовки, чат-сообщений.

### Что нужно доработать

- Расширить payload точки доп. полями для V2-фильтров: `candidateName`, `managerName`, `recommendation` (текущий — только `decision`). Это позволит фильтровать «похожие интервью с тем же менеджером» или «успешные у этого клиента».
  - Не требует пересоздания коллекции — Qdrant поддерживает добавление полей в payload через upsert. Но для исторических точек нужен backfill-скрипт.
- В `findSimilarInterviews` параметр `stage` принимается, но **не используется в фильтре** (`rag.service.ts:27` — параметр есть в типе, но в `must` его нет). Это бага: для финального анализа нужны только `final_result`-кейсы, а сейчас фильтра нет. Проверить намеренно ли.

### Что нужно создать с нуля

- **Опциональная отдельная коллекция `client_questions`** — эмбеддинги отдельных вопросов менеджера с payload `{clientName, topic, managerName}`. Полезно для чата: «какие вопросы про SQL обычно спрашивает Acme?».
  - Альтернатива — использовать ту же `interviews` и фильтровать по `stage = 'manager_call'`, потом раскручивать `questions` JSON в Postgres. На текущих объёмах достаточно.
- **Коллекция `preparation_chunks`** — если делать RAG по сгенерированным документам подготовки или по справочным материалам клиента (если они появятся).

**Вывод по разделу 4:** менять структуру коллекции не обязательно. Минимум — допилить payload и пофиксить неиспользуемый `stage`-фильтр. Отдельная коллекция нужна только если хочется сделать поиск по конкретным вопросам, а не по интервью целиком.

---

## 5. Очередь задач (BullMQ)

### Текущее состояние

**Один Queue, один Worker:**
- Queue: `analyzeQueue` — имя `'analyze'` (`analyze.worker.ts:26`).
- Worker: `analyzeWorker` — concurrency 3 (`analyze.worker.ts:286-289`).
- Connection — Redis из `apps/api/src/db/redis.ts`.

**Типы job'ов:**
Формально один тип — `'analyze'`, но job branch-ит по `meta.stage`:
- `manager_call` / `technical` — стандартный пайплайн (CV → embed → RAG → LLM → save → Qdrant → Linear post).
- `final_result` — отдельный флоу (`analyze.worker.ts:44-115`): подтягивает прошлые анализы из БД, вызывает `analyzeFinalResult`, сохраняет, постит в Linear.

**Этапы стандартного флоу** (`analyze.worker.ts:118-284`):
1. `progress 10` — извлечение CV (`extractCVText`, `extractNameFromCV`).
2. Слияние managerFeedback с транскриптом, расчёт `contentHash`, dedup-проверка по `findInterviewByContentHash`.
3. `progress 25` — `embedText`.
4. `progress 40` — `findSimilarInterviews` + `getInterviewsByIds` для few-shot.
5. `progress 55` — `analyzeInterview` (LLM).
6. `progress 80` — `createInterview` в Postgres (с обработкой P2002 дубля).
7. `saveEmbedding` в Qdrant + `updateEmbeddingId`.
8. Опциональный пост в Linear (`postManagerCallAnalysis` / `postTechnicalAnalysis`).

**Дедупликация:**
- Стабильный jobId через `buildDedupJobId` (для ручного `/analyze`) и `buildWebhookJobId(issueId, rootCommentId, stage)` (для webhook).
- Уникальный индекс `(linearIssueId, parentCommentId, stage)` в Postgres (`schema.prisma:33`).
- `contentHash` — short-circuit при идентичном содержимом под другим parentCommentId.

**Отслеживание статуса с фронта** (`apps/web/src/hooks/useAnalyze.ts`):
- **Polling**, не SSE/WS.
- `analyzeApi.start()` → `POST /analyze` → 202 + jobId.
- `analyzeApi.getStatus(jobId)` → `GET /analyze/:jobId/status` каждые 2с (`useAnalyze.ts:45`).
- Возвращает `state` (`waiting | active | completed | failed`), `progress`, `result`.
- Retry при сетевых ошибках до 3 раз с интервалом 3с.

### Что можно переиспользовать

- Сама `analyzeQueue` — можно добавить новые job-имена (`'generate_preparation_doc'`, `'rebuild_client_insights'`) в ту же очередь или создать отдельные.
- Паттерн `runStage('label', fn, ctx)` (`utils/errorLogger.ts`) — стандартизирует логи; стоит использовать для всех новых стадий.
- `progress`-API + polling-эндпоинт `/analyze/:jobId/status` — переиспользуемая абстракция; можно сделать общий `/jobs/:jobId/status`.

### Что нужно доработать

- Текущий branching по `meta.stage` внутри одного job-handler'а уже неудобен (final_result отдельной веткой). Добавление `preparation_doc` сделает switch громоздким — либо разнести на несколько Worker'ов на разных Queue, либо разнести на разные `job.name` с разными handler'ами.
- Эндпоинт статуса работает только с `analyzeQueue`. Если делать новые очереди — нужен общий или полиморфный.

### Что нужно создать с нуля

- **Новая очередь `preparation`** (рекомендуется) или новый job-name внутри `analyzeQueue`:
  - `generate_preparation_doc` — собирает client profile + candidate CV + broker request → LLM → Markdown → возвращает результат в job.returnvalue или сохраняет в новую таблицу `PreparationDoc`.
- **Новая очередь `client_insights`** (фоновая регенерация):
  - `rebuild_client_insights` — запускается по cron или после N новых интервью клиента.
- **Чат — НЕ через очередь.** Чат должен быть синхронным (с stream), не job-based — иначе UX будет ужасный. Использовать обычный POST-эндпоинт со streaming response (SSE).
- Унифицировать polling-эндпоинт: `GET /api/jobs/:jobId/status?queue=...`.

**Вывод по разделу 5:** добавить новый тип job для генерации документа можно. Но для чата очередь не нужна — нужен прямой streaming endpoint. Polling-механизм уже в наличии и его легко обобщить.

---

## 6. API-эндпоинты и роуты

### Текущее состояние

**Регистрация в Fastify** (`apps/api/src/index.ts:25-33`):
```
app.register(linearWebhookRoutes);
app.register(analyzeRoutes,    { prefix: '/api' });
app.register(interviewRoutes,  { prefix: '/api' });
app.register(statsRoutes,      { prefix: '/api' });
app.register(candidateRoutes,  { prefix: '/api' });
```

**Полный список эндпоинтов:**

| Метод | Путь | Файл | Назначение |
|---|---|---|---|
| GET | `/health` | `index.ts:33` | health check |
| POST | `/webhooks/linear` | `routes/webhooks/linear.ts:49` | Linear webhook (HMAC verified) |
| POST | `/api/analyze` | `routes/analyze.ts:17` | Поставить анализ в очередь |
| GET | `/api/analyze/:jobId/status` | `routes/analyze.ts:32` | Polling статуса job |
| GET | `/api/interviews` | `routes/interviews.ts:6` | Список интервью с фильтрами |
| GET | `/api/interviews/stats` | `routes/interviews.ts:11` | Простая статистика (legacy) |
| GET | `/api/interviews/managers` | `routes/interviews.ts:40` | Distinct менеджеры |
| GET | `/api/interviews/roles` | `routes/interviews.ts:49` | Distinct роли |
| GET | `/api/interviews/:id` | `routes/interviews.ts:59` | Интервью + transcript |
| DELETE | `/api/interviews/:id` | `routes/interviews.ts:67` | Удалить интервью |
| GET | `/api/candidates` | `routes/candidates.ts:8` | Список кандидатов с агрегатами |
| GET | `/api/candidates/:name` | `routes/candidates.ts:104` | Карточка кандидата + clustered findings |
| GET | `/api/pipeline-candidates` | `routes/candidates.ts:223` | Pipeline-кандидаты (CV, без интервью) |
| GET | `/api/stats/overview` | `routes/stats.ts:9` | Большой dashboard-агрегат |

**Паттерн создания нового роута:** `async function xxxRoutes(fastify: FastifyInstance) { fastify.get(...) }` + регистрация в `index.ts`. Никакого автодискавера.

**Middleware:**
- CORS (`@fastify/cors`) — origin из `CORS_ORIGIN` env.
- Body-parser для `application/json` глобально + кастомный для webhook'а (raw body для HMAC).
- HMAC verification — только в `linearWebhookRoutes` (`verifySignature`).
- **НЕТ авторизации/аутентификации** — все API-эндпоинты публичные. Для V2 с чатом и пользовательскими сессиями придётся добавлять.
- **НЕТ rate-limiting** на уровне Fastify (только обработчик 429 в axios на фронте).
- Валидация — Zod в обработчике (`AnalyzeRequestSchema.parse(request.body)` в `analyze.ts:18`), Fastify schemas не используются.

### Что можно переиспользовать

- Паттерн `xxxRoutes` + `register` — понятный, расширяемый.
- Zod-валидация на входе.
- HMAC + raw-body content-type parser для webhook'ов.

### Что нужно доработать

- Перед V2-чатом — добавить **auth middleware** (минимум session/JWT). Сейчас любой запрос анонимный.
- Рассмотреть **rate-limit** на чат-эндпоинт (LLM-вызовы дорогие).
- Унифицировать формат ошибок (сейчас mix из Fastify default + custom).

### Что нужно создать с нуля

Минимальный набор для V2:

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/clients` | Список клиентов с агрегатами |
| GET | `/api/clients/:id` | Карточка клиента + insights |
| GET | `/api/clients/:id/profile` | LLM-профиль интервью клиента (questions, patterns) |
| POST | `/api/clients/:id/insights/regenerate` | Пнуть фоновую регенерацию |
| POST | `/api/preparation` | Поставить в очередь генерацию документа подготовки |
| GET | `/api/preparation/:id` | Получить готовый документ (Markdown + meta) |
| POST | `/api/chat/sessions` | Создать чат-сессию для (client + candidate) |
| GET | `/api/chat/sessions/:id` | Получить историю сессии |
| POST | `/api/chat/sessions/:id/messages` | **SSE stream** — отправить сообщение, получить токены |

**Вывод по разделу 6:** паттерн регистрации простой — расширить легко. Главный технический долг — отсутствие auth, который придётся внедрять до открытия чата для пользователей.

---

## 7. Фронтенд — компоненты и страницы

### Текущее состояние

**Роутер** (`apps/web/src/router.tsx`, TanStack Router):
- `/` — `DashboardPage`
- `/interviews` — `InterviewsPage`
- `/candidates` — `CandidatesPage`
- `/candidates/$name` — `CandidateDetailPage`

Все страницы lazy-loaded через `lazy(() => import(...))`.

**Структура `apps/web/src/components/`:**
- `analysis/` — отображение результата (`AnalysisResult`, `ManagerCallResult`, `TechnicalResult`, `FinalResult`, `BrokerMatchBlock`, `CVMatchBlock`).
- `analyze/` — форма + прогресс (`AnalyzeForm`, `AnalyzeProgress`).
- `dashboard/` — карточки и графики (`StatsCards`, `Charts`, `PipelineFunnelChart`, `QualityStatsCard`, `RequestsStatsCard`, `TimelineStatsCard`, `CandidateInsightsCard`).
- `interviews/` — `InterviewsTable`, `InterviewFilters`.
- `layout/` — `Layout`, `Sidebar`, `TopNav`.
- `modals/` — `AnalyzeModal`, `CandidateModal`.
- `ui/` — shadcn-style примитивы (`button`, `dialog`, `input`, `textarea`, `tabs`, `select`, `popover`, `progress`, `skeleton`, `card`, `badge`, `calendar`, `label`, `separator`, `EmptyState`, `ErrorMessage`).

**API-клиент** (`apps/web/src/api/client.ts`):
- Один axios instance, baseURL из `VITE_API_URL`.
- Глобальный response interceptor → класс `ApiError` с кодами (`NETWORK_ERROR`, `VALIDATION_ERROR`, ...).
- API-namespaces: `analyzeApi`, `interviewsApi`, `candidatesApi`, `pipelineCandidatesApi`, `statsApi`.
- Типы запросов/ответов (`InterviewListItem`, `InterviewDetail`, `JobStatus`, `CandidateDetail`, `StatsOverview`, ...) — все определены здесь, не в `@shared`.

**Хуки данных:**
- `apps/web/src/hooks/useAnalyze.ts` — управляет жизненным циклом анализа: idle/pending/processing/completed/failed + polling статуса каждые 2 секунды через `setTimeout`.
- `apps/web/src/hooks/useInterviews.ts` — пустой (1 строка). На странице используются inline `useQuery` (см. `InterviewsPage.tsx:12-25`).
- В страницах используется TanStack Query напрямую (`useQuery({ queryKey, queryFn })`).

**Real-time / polling:**
- Только в `useAnalyze` — polling на 2с интервалах. Нет WebSocket/SSE.
- Кеш-инвалидация через `queryClient.invalidateQueries` после mutations.

### Что можно переиспользовать

- `Dialog` + паттерн `AnalyzeModal` — готовый шаблон для модалки чата или превью документа подготовки.
- `Tabs` — для организации Chat / Preparation Doc внутри карточки клиента/кандидата.
- `AnalyzeProgress` — формат progress-bar для долгих job'ов (генерация документа).
- `Skeleton`, `EmptyState`, `ErrorMessage` — единый стиль ожидания/ошибок.
- Axios-клиент с interceptor'ом — добавить `chatApi`, `clientsApi`, `preparationApi` по тому же паттерну.

### Что нужно доработать

- Перенести типы ответов из `apps/web/src/api/client.ts` в `@shared/schemas` (текущий файл смешивает domain types и API-обёртки). Это упростит V2, где типы будут общими между chat-стримом и Markdown-документом.
- `useInterviews.ts` пустой — либо заполнить, либо удалить.

### Что нужно создать с нуля

**Страницы:**
- `/clients` — список клиентов с hire-rate и числом интервью.
- `/clients/$name` или `$id` — карточка клиента: insights, топ-вопросы, паттерны успехов/провалов, кнопки «Generate preparation doc» / «Open chat».
- `/preparation/$id` (опционально) — просмотр сгенерированного документа в полноэкранном режиме.

**Компоненты:**
- `ChatPanel` — drawer/модалка с историей сообщений, инпутом, индикатором стриминга. Понадобится:
  - Парсер SSE-стрима (axios умеет через `responseType: 'stream'` или fetch + `ReadableStream`).
  - Render Markdown для ответов AI (потребуется новая зависимость, например `react-markdown`).
- `PreparationDocPreview` — отображение сгенерированного Markdown с возможностью copy/export to PDF.
- `ClientCard` / `ClientInsightsBlock` — отображение топ-вопросов, паттернов.
- `GeneratePreparationDocModal` — форма (выбор кандидата → выбор клиента → опции) + прогресс.

**Хуки:**
- `useChat(sessionId)` — управление SSE-стримом, история, отправка.
- `useClientProfile(clientId)`, `useClientInsightsRebuild(clientId)`.
- `usePreparationDoc(jobId)` — аналог `useAnalyze` для нового типа job'а.

**Вывод по разделу 7:** страница чата и страница клиента — новые. Документ подготовки — новая страница либо встроенный preview. UI-примитивы и паттерны polling/модалки готовы; основная новая зависимость — Markdown-рендерер и SSE-стриминг.

---

## 8. Shared-схемы (`@shared/schemas`)

### Текущее состояние

**Файл:** `packages/shared/src/schemas.ts` (157 строк), экспорт через `packages/shared/src/index.ts`.

**Существующие схемы:**

| Схема | Назначение |
|---|---|
| `InterviewStageSchema` | enum `'manager_call' \| 'technical'` (final_result в discriminated union ниже отдельно) |
| `InterviewMetaSchema` | meta-инфо для запроса анализа: stage, role, level, decision, clientName, candidateName, ... |
| `InterviewQuestionsSchema` | { questions: Array<{ question, topic?, candidateHandled? }> } |
| `ManagerCallAnalysisSchema` | результат анализа manager_call (softSkills, brokerSoftFit, stageResult, decisionBreakers, recommendation, questions) |
| `CVMatchSchema` | declared/confirmed/unconfirmed skills + cvMatchScore |
| `BrokerRequestMatchSchema` | required/covered/missing/notAssessed + brokerMatchScore |
| `TechnicalAnalysisSchema` | результат technical (technicalLevel, technicalSkills, cvMatch, brokerRequestMatch, recommendation, decisionBreakers, score) |
| `FinalResultAnalysisSchema` | финальный синтез (softSkillsSummary, technicalSummary, decision, ...) |
| `CandidateAnalysisSchema` | discriminated union по `stage` |
| `AnalyzeRequestSchema` | { transcript, meta, cvText?, brokerRequest? } |
| `ChatMessageSchema` | { role: 'user' \| 'assistant', content: string } |
| `ChatRequestSchema` | { message, clientName?, candidateId?, history: ChatMessage[] } |

**Заметка:** `ChatMessageSchema` и `ChatRequestSchema` уже определены, но **в API/UI не используются** — задел под V2, который остался от предыдущих попыток. Поиск по коду эндпоинта `/chat` ничего не находит.

**Схем для скоринга** (отдельно от анализа) — нет; score хранится внутри `TechnicalAnalysisSchema.score` и `CVMatchSchema.cvMatchScore`/`BrokerRequestMatchSchema.brokerMatchScore`.

### Что можно переиспользовать

- Существующие схемы анализа — без изменений; они нужны как input для нового профиля клиента и подготовки.
- `ChatMessageSchema` — minimum viable, можно расширить. Уже совместим с OpenAI-форматом сообщений.

### Что нужно доработать

- Обогатить `ChatRequestSchema`:
  - `sessionId: string` (для persisted-сессии вместо stateless `history`).
  - `context?: { clientId, candidateId, preparationDocId? }`.
- `InterviewMetaSchema.role` сейчас enum c фиксированным списком (`Backend, Frontend, Fullstack, DevOps, QA, Mobile`). Если V2 расширяет роли — менять здесь.

### Что нужно создать с нуля

```ts
// Профиль клиента (LLM-агрегат)
ClientInsightsSchema = {
  summary: string,
  topQuestions: Array<{ question, topic, frequency, sampleAnswers? }>,
  successPatterns: string[],
  failurePatterns: string[],
  redFlags: string[],
  technicalFocus: string[],
  softSkillsFocus: string[],
  managerStyles: Array<{ managerName, style }>,
  generatedAt: string,
  basedOnInterviews: number
}

// Документ подготовки
PreparationDocSchema = {
  candidateName: string,
  clientName: string,
  brokerRequest: string,
  generatedAt: string,
  markdown: string,            // сам документ
  sections: {
    aboutClient: string,
    likelyQuestions: string,
    technicalFocus: string,
    softSkillsTips: string,
    redFlagsToAvoid: string,
  },
  sourceInterviewIds: string[]  // какие интервью использовались для контекста
}

// Чат-сессия
ChatSessionSchema = {
  id: string,
  clientId: string?,
  candidateId: string?,
  preparationDocId: string?,
  createdAt: string,
  updatedAt: string,
  messages: ChatMessage[]
}

// Расширенный ChatMessage
ChatMessageSchema (V2) = {
  role: 'user' | 'assistant' | 'system',
  content: string,
  createdAt: string,
  citations?: Array<{ interviewId, snippet }>  // RAG-цитаты
}
```

**Вывод по разделу 8:** базовые схемы анализа готовы и переиспользуются. Чат-схемы есть в зачаточном виде и требуют доработки. Профиль клиента и документ подготовки — полностью новые. Все новые типы — в `@shared/schemas`, чтобы фронт и бэк были типизированы.

---

## Сводная таблица

| Компонент | Статус | Приоритет | Зависит от |
|---|---|---|---|
| Prisma `Client` модель | **доработать** (заполнять) | high | — |
| Prisma `ClientInterviewProfile` (или extend `Client.insights`) | **создать** | high | Client |
| Backfill-скрипт Client из existing clientName | **создать** | high | Client model populated |
| `Interview.questions` JSON-формат | **есть** | — | — |
| `Interview.managerName` для technical-стадии | **доработать** (writes missing) | medium | linear.parser |
| Сервис агрегации `clientProfile.service` | **создать** | high | clusterTextItems, Interview |
| `llm.service.analyzeInterview` | **есть** | — | — |
| `chat.service` (streaming, multi-turn) | **создать** | high | llm.client |
| `preparationDoc.service` | **создать** | high | clientProfile, llm.client |
| `clientInsights.service` (regenerator) | **создать** | medium | clientProfile, llm.client |
| Промпты для chat / prep doc / insights | **создать** | high | analyze.prompt patterns |
| Qdrant коллекция `interviews` | **есть** | — | — |
| Qdrant payload extension (managerName, recommendation) | **доработать** | medium | rag.service |
| Qdrant `stage`-фильтр в `findSimilarInterviews` | **доработать** (баг — параметр игнорируется) | medium | rag.service |
| Отдельная коллекция `client_questions` | **опционально** | low | — |
| `analyzeQueue` BullMQ | **есть** | — | — |
| Job `generate_preparation_doc` (новая queue или name) | **создать** | high | preparationDoc.service |
| Job `rebuild_client_insights` (cron/N-trigger) | **создать** | medium | clientInsights.service |
| Унифицированный `/api/jobs/:id/status` | **доработать** | low | — |
| Эндпоинты `/api/clients*` | **создать** | high | Client model, profile service |
| Эндпоинты `/api/preparation*` | **создать** | high | preparationDoc job |
| Эндпоинты `/api/chat/sessions*` (с SSE) | **создать** | high | chat.service, auth |
| Auth middleware | **создать** | high | — (блокирует chat для prod) |
| Rate-limit на chat/preparation | **создать** | medium | auth |
| Zod-схемы `ChatMessage`/`ChatRequest` (расширить) | **доработать** | high | — |
| Zod-схемы `ClientInsights`, `PreparationDoc`, `ChatSession` | **создать** | high | — |
| Frontend страницы `/clients`, `/clients/$id` | **создать** | high | clients API |
| Frontend `ChatPanel` + SSE-парсер | **создать** | high | chat API, react-markdown |
| Frontend `PreparationDocPreview` | **создать** | high | preparation API |
| Frontend `useChat`, `useClientProfile`, `usePreparationDoc` | **создать** | high | API hooks |
| Frontend `Dialog`, `Tabs`, `Progress`, `Skeleton`, `Markdown` | **переиспользовать** / новая зависимость для md | low | — |
| Перенос типов из `web/api/client.ts` в `@shared` | **доработать** | low | shared schemas |

**Критический путь V2:**
1. Backfill `Client` + сервис `clientProfile` (фундамент для контекста).
2. Промпт + сервис `preparationDoc` + новый job + UI preview.
3. Auth middleware (блокирует выкатку чата на пользователей).
4. Промпт + `chat.service` со streaming + SSE-эндпоинт + UI `ChatPanel`.
5. Регенерация `clientInsights` в фоне (можно отложить, пока агрегаты считаются on-the-fly).
