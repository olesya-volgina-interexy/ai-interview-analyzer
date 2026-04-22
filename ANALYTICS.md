# Аналитика и статистика проекта

Документ описывает все эндпоинты и компоненты, отвечающие за статистику и аналитику в проекте AI Interview Analyzer. Охватывает backend (`apps/api`), frontend (`apps/web`) и источники данных в БД (Prisma).

---

## Содержание

1. [Источники данных](#источники-данных)
2. [Backend-эндпоинты](#backend-эндпоинты)
    - [GET /stats/overview](#get-statsoverview)
    - [GET /interviews/stats](#get-interviewsstats)
    - [GET /interviews/managers](#get-interviewsmanagers)
    - [GET /interviews/roles](#get-interviewsroles)
    - [GET /candidates](#get-candidates)
    - [GET /candidates/:name](#get-candidatesname)
3. [Frontend-компоненты](#frontend-компоненты)
4. [Кэширование](#кэширование)
5. [Особенности и нюансы](#особенности-и-нюансы)

---

## Источники данных

### Таблица `Interview`
Одна запись = один AI-анализ одного этапа интервью.

| Поле | Тип | Роль в аналитике |
|---|---|---|
| `stage` | string | Этап: `manager_call`, `technical`, `final_result` — для воронки |
| `decision` | string? | `hired` / `rejected` — заполняется только на `final_result` |
| `role` | string | Вакансия — распределение по ролям |
| `level` | string | Уровень (Junior/Middle/Senior/Architect) — средние оценки по уровням |
| `clientName` | string? | Клиент, к которому относится интервью |
| `candidateName` | string? | Имя кандидата — для группировки на странице кандидатов |
| `managerName` | string? | Менеджер, проводивший manager call |
| `analysis` | JSON | Результат LLM-анализа: `score`, `strengths`, `weaknesses`, `decisionBreakers`, `softSkills`, `recommendation`, `stageResult` |
| `createdAt` | DateTime | Момент создания анализа — используется для трендов и тайминга |
| `linearIssueId` | string? | Связь с `IncomingRequest` через Linear-тикет |

### Таблица `IncomingRequest`
Одна запись = один входящий тикет от брокера в Linear.

| Поле | Тип | Роль в аналитике |
|---|---|---|
| `linearIssueId` | string unique | Ключ связи с Linear и с `Interview` |
| `clientName` | string? | Клиент (парсится из заголовка тикета) |
| `role` | string? | Роль в заголовке тикета |
| `level` | string? | Требуемый уровень |
| `status` | string | Текущий статус: `triage` / `new` / `in_progress` / `client_review` / `cv_sent` / `manager_call` / `technical` / `hired` / `rejected` / `on_hold` / `dropped` |
| `cvSentCount` | int | Сколько раз CV отправлялись по этому тикету |
| `externalFeedback` | text? | Фидбек от клиента/брокера (анализируется в `topExternalReasons`) |
| `receivedAt` | DateTime | Дата появления тикета — базовая точка периода |

### Таблица `IncomingRequestStatusHistory`
Одна запись = один переход в новый статус тикета. Заполняется через webhook Linear.

| Поле | Тип | Роль |
|---|---|---|
| `incomingRequestId` | string | Ссылка на `IncomingRequest` |
| `status` | string | В какой статус перешёл тикет |
| `enteredAt` | DateTime | Когда произошёл переход |

Первая запись создаётся при `Issue/create` (начальный статус), последующие — при каждой реальной смене `stateId` в Linear.

---

## Backend-эндпоинты

### GET /stats/overview

**Файл:** `apps/api/src/routes/stats.ts`

Главный эндпоинт дашборда. Возвращает агрегированную статистику за период.

#### Query-параметры

| Параметр | Тип | По умолчанию | Назначение |
|---|---|---|---|
| `from` | ISO-строка | 1-е число текущего месяца | Начало периода |
| `to` | ISO-строка | Последний день текущего месяца | Конец периода |
| `refresh` | `'1'` | — | Принудительно сбросить кэш Redis и пересчитать |

#### Поля ответа

```ts
{
  period: { from: ISO, to: ISO }

  requests: {
    total: number;                         // IncomingRequest.receivedAt в периоде
    byStatus: Record<string, number>;      // группировка по status
    byClient: Record<string, number>;      // группировка по clientName
    byRole: Record<string, number>;        // группировка по role
  }

  pipeline: {
    reachedCvSent: number;                 // статус = 'cv_sent' или cvSentCount > 0
    totalCvSent: number;                   // сумма cvSentCount
    reachedManagerCall: number;            // Interview.stage = 'manager_call'
    reachedTechnical: number;              // Interview.stage = 'technical'
    reachedFinalResult: number;            // Interview.stage = 'final_result'
    hired: number;                         // Interview.decision = 'hired'
    rejected: number;                      // Interview.decision = 'rejected'
    onHold: number;                        // IncomingRequest.status = 'on_hold'
    conversion: {
      managerCallToTechnical: number;      // % technical/manager_call
      technicalToHired: number;            // % hired/technical
    }
  }

  timing: {
    // Legacy-метрики по Interview.createdAt + IncomingRequest.receivedAt
    avgTriageToManagerCallDays: number | null;
    avgManagerToTechnicalDays: number | null;
    avgTechnicalToFinalDays: number | null;
    avgTotalDays: number | null;

    // Новые метрики по IncomingRequestStatusHistory
    avgDaysToHired: number | null;              // от первой записи истории до 'hired'
    avgTimePerStage: Record<string, number | null>;
    // ^ среднее время в каждой стадии в днях, считаются только завершённые заходы
    // ключи: triage, in_progress, client_review, manager_call, technical, ...

    trend: Array<{ month: string; count: number }>;
    // количество интервью по месяцам (YYYY-MM)
  }

  quality: {
    topDecisionBreakers: Array<{ text: string; count: number }>;
    // LLM-кластеризация поля analysis.decisionBreakers всех интервью периода
    topWeaknesses: Array<{ text: string; count: number }>;
    // LLM-кластеризация analysis.weaknesses (без 'not mentioned')
    hireRateByRole: Array<{ role: string; hireRate: number; total: number }>;
    // % hired / total среди интервью с stage='technical'
    topExternalReasons: Array<{ text: string; count: number }>;
    // LLM-кластеризация IncomingRequest.externalFeedback
  }

  candidates: {
    avgScoreByLevel: Array<{ level: string; avgScore: number }>;
    // среднее analysis.score по IT-уровням
    avgScoreByRole: Array<{ role: string; avgScore: number }>;
    // среднее analysis.score по вакансиям
  }
}
```

#### Как считается тайминг

**Legacy-блок** (`avgTriageTo...`, `avgManagerTo...`, `avgTechnicalTo...`, `avgTotalDays`): для каждого `linearIssueId` берутся `createdAt` интервью по стадиям и `receivedAt` соответствующего `IncomingRequest`. Считается по **всем** интервью с `linearIssueId`, без фильтра по периоду, чтобы средние были стабильнее.

**Новый блок** (`avgDaysToHired`, `avgTimePerStage`): только по тикетам с `receivedAt` в периоде.
- Для каждого тикета берётся его история статусов, отсортированная по `enteredAt`.
- Длительность стадии = разница между соседними записями истории. Последняя запись не учитывается (стадия ещё идёт).
- `avgDaysToHired` — разница между первой записью истории и записью со статусом `hired`; учитываются только тикеты, дошедшие до найма.

#### LLM-кластеризация (`clusterTextItems`)

Свободный текст (`weaknesses`, `decisionBreakers`, `externalFeedback`) отправляется в LLM, который возвращает агрегированные топ-кластеры с подсчётом. Используется при формировании `quality.topDecisionBreakers`, `topWeaknesses`, `topExternalReasons`, а также `topStrengths/topWeaknesses/topDecisionBreakers` на странице кандидата.

#### Кэширование

Redis-ключ: `stats:overview:{fromISO}:{toISO}`, TTL = 30 минут. Сбрасывается автоматически при:
- Создании нового `Interview` (`db.service.ts::createInterview`);
- Обновлении `externalFeedback` через webhook;
- Смене заголовка тикета (обновление `clientName`);
- Запросе с `?refresh=1`.

---

### GET /interviews/stats

**Файл:** `apps/api/src/routes/interviews.ts`

Короткая статистика по **всем** интервью (без фильтра по периоду). Питает верхние KPI-карточки дашборда.

#### Query-параметры
Нет.

#### Поля ответа

```ts
{
  total: number;                          // всего интервью в БД
  hireRate: number;                       // % decision='hired' / total
  avgScore: number;                       // среднее analysis.score
  byRole: Record<string, number>;         // группировка по role
  byStage: Record<string, number>;        // группировка по stage
}
```

> **Нюанс:** этот эндпоинт не учитывает период — всегда отдаёт all-time. Фильтр по периоду применяется только в `/stats/overview`.

---

### GET /interviews/managers

**Файл:** `apps/api/src/routes/interviews.ts`

Список уникальных менеджеров, проводивших manager call.

#### Ответ
```ts
string[]  // все непустые distinct Interview.managerName
```

Используется как источник опций для фильтра менеджеров на странице `Interviews`.

---

### GET /interviews/roles

**Файл:** `apps/api/src/routes/interviews.ts`

Список уникальных ролей по проведённым интервью, отсортирован по алфавиту.

#### Ответ
```ts
string[]  // distinct Interview.role, не пустые
```

Источник опций для фильтра роли.

---

### GET /candidates

**Файл:** `apps/api/src/routes/candidates.ts`

Список кандидатов с их агрегированной статистикой. Питает страницу `CandidatesPage`.

#### Query-параметры

| Параметр | Тип | По умолчанию | Назначение |
|---|---|---|---|
| `search` | string | — | Фильтр по части имени (ILIKE) |
| `page` | number | 1 | Пагинация |
| `limit` | number | 20 | Размер страницы |
| `role` | string | — | Фильтр: кандидат проходил интервью на эту роль |
| `result` | `'hired' \| 'not_hired'` | — | `hired` — есть хоть один успех; `not_hired` — успехов нет |

#### Поля ответа

Агрегация через SQL (`GROUP BY candidateName`):

```ts
Array<{
  candidateName: string;
  totalInterviews: number;       // COUNT(*)
  successful: number;            // COUNT FILTER (decision = 'hired')
  failed: number;                // COUNT FILTER (decision = 'rejected')
  lastInterviewAt: string;       // MAX(createdAt)
  roles: string[];               // DISTINCT role
  avgScore: number | null;       // среднее analysis.score
}>
```

---

### GET /candidates/:name

**Файл:** `apps/api/src/routes/candidates.ts`

Детальный профиль кандидата. Питает `CandidateDetailPage`.

#### Параметры пути
- `name` (URL-encoded) — имя кандидата (регистронезависимо)

#### Поля ответа

```ts
{
  candidateName: string;
  totalInterviews: number;
  successful: number;            // interviews.filter(decision='hired').length
  failed: number;                // interviews.filter(decision='rejected').length
  avgScore: number | null;
  roles: string[];               // уникальные роли
  totalCvSent: number;           // сумма cvSentCount связанных IncomingRequest

  // Топы через LLM-кластеризацию по всем интервью кандидата
  topStrengths: Array<{ text: string; count: number }>;
  topWeaknesses: Array<{ text: string; count: number }>;
  topDecisionBreakers: Array<{ text: string; count: number }>;

  // Полная история интервью
  interviews: Array<{
    id: string;
    stage: string;
    role: string;
    level: string;
    decision: string | null;
    clientName: string | null;
    managerName: string | null;
    createdAt: ISO;
    recommendation: string | null;
    stageResult: string | null;
    score: number | null;
  }>;
}
```

> **Как считаются hired/rejected на странице кандидата:** `decision` проставляется у `Interview` только на стадии `final_result` (когда тикет в Linear переходит в `Hired` или `Lost`). Значит `successful` = количество тикетов, доведённых до найма этим кандидатом; `failed` = количество тикетов, где кандидат был в итоге отклонён на финале. Интервью на стадиях `manager_call` / `technical` в подсчёт не попадают, пока тикет не получит финальное решение.

---

## Frontend-компоненты

| Компонент | Эндпоинт | Используемые поля | Назначение |
|---|---|---|---|
| `StatsCards` | `/interviews/stats` | `total`, `hireRate`, `avgScore`, `byStage`, `byRole` | 4 верхние KPI-карточки дашборда (Total Interviews, Hire Rate, Avg Score, Top Role) |
| `Charts` | `/interviews/stats` | `byRole`, `byStage` | Bar-chart по ролям + Pie по стадиям (вкладка **Overview**) |
| `RequestsStatsCard` | `/stats/overview` | `requests.{total, byStatus, byClient, byRole}`, `period` | Распределение входящих запросов по статусам/клиентам/ролям |
| `PipelineFunnelChart` | `/stats/overview` | `pipeline.*` | Воронка: CV sent → Manager Call → Tech → Hired, + проценты конверсии |
| `TimelineStatsCard` | `/stats/overview` | `timing.avgDaysToHired`, `timing.avgTimePerStage`, `timing.trend` | Среднее время до найма + сегментированная полоса прогресса по стадиям + тренд-график |
| `QualityStatsCard` | `/stats/overview` | `quality.topDecisionBreakers`, `topWeaknesses`, `hireRateByRole`, `topExternalReasons` | Тэги с причинами отказа/слабостей/фидбека, процент найма по ролям |
| `RoleScoresCard` | `/stats/overview` | `candidates.avgScoreByRole` | Средний скор по вакансиям |
| `LevelScoresCard` | `/stats/overview` | `candidates.avgScoreByLevel` | Средний скор по уровням |
| `CandidatesPage` | `/candidates` | весь массив | Таблица кандидатов с фильтрами и пагинацией |
| `CandidateDetailPage` | `/candidates/:name` | весь объект | Профиль кандидата: stat-карточки, топы, таблица интервью |
| `InterviewFilters` | `/interviews/managers`, `/interviews/roles` | массивы строк | Опции в выпадающих списках фильтров страницы интервью |

---

## Кэширование

- **Redis** используется только для `/stats/overview` (ключ `stats:overview:{from}:{to}`, TTL 30 мин).
- Все остальные эндпоинты (`/interviews/stats`, `/candidates`, `/candidates/:name`) работают **без кэша** — прямые запросы в Postgres.
- **React Query** на фронте кеширует ответы по `queryKey`:
    - `['stats']` — KPI
    - `['stats', 'overview', dateRange]` — overview
    - `['candidate', name]` — профиль кандидата
    - `['interviews', 'recent']` — последние интервью

#### Когда сбрасывается кэш stats
- Создание нового `Interview` (в `createInterview`);
- Обновление `externalFeedback` (webhook — `#feedback` без `#feedback_manager_call`);
- Смена заголовка тикета в Linear (обновление `clientName`);
- `?refresh=1` в запросе от фронта (есть кнопка refresh в `RequestsStatsCard`).

---

## Особенности и нюансы

1. **Фильтрация по периоду работает только в `/stats/overview`.** Все остальные эндпоинты — все-время.
2. **Legacy-блок timing (`avgTriageToManagerCallDays` и пр.) считается по всем тикетам без фильтра периода** — чтобы средние были стабильны при узких окнах. Новые метрики (`avgDaysToHired`, `avgTimePerStage`) привязаны к периоду.
3. **История статусов заполняется только с момента деплоя.** Для тикетов, созданных до внедрения `IncomingRequestStatusHistory`, записей нет — они не попадут в `avgDaysToHired` / `avgTimePerStage`.
4. **`Interview.decision` заполняется только на стадии `final_result`.** Поэтому `hired` / `rejected` — это счётчик тикетов, доведённых до финала, а не суммарный итог по всем стадиям.
5. **`hireRateByRole` считается по интервью со стадией `technical`** — показывает процент найма среди тех, кто дошёл до технической стадии.
6. **LLM-кластеризация (`clusterTextItems`) недетерминирована** — топы могут чуть меняться между запусками, поэтому критично держать кэш (и инвалидировать его точечно, а не по TTL).
7. **Статус `'in_progress'` больше не перезаписывается при каждом новом комментарии** — это было бы шумом в истории статусов. Смена статуса идёт только через webhook `Issue/update` по `stateId`.
8. **Маппинг Linear → внутренние статусы** живёт в `LINEAR_STATUS_MAP` (`apps/api/src/routes/webhooks/linear.ts`): `Triage`, `In Progress`, `Client Review`, `Broker's Call` → `manager_call`, `Tech Call` → `technical`, `Hired`, `Lost`, `On Hold`.
