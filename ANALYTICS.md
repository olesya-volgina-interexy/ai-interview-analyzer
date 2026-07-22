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
    // avgTechnicalToFinalDays/avgTotalDays: только эти два всё ещё считаются
    // по Interview.createdAt + IncomingRequest.receivedAt, потому что у стадии
    // 'final_result' (это стадия анализа, не статус тикета в Linear) нет
    // эквивалента в IncomingRequestStatusHistory.
    avgTriageToManagerCallDays: number | null;  // теперь тоже по IncomingRequestStatusHistory (см. ниже)
    avgManagerToTechnicalDays: number | null;   // тоже по истории статусов
    avgTechnicalToFinalDays: number | null;     // legacy: Interview.createdAt
    avgTotalDays: number | null;                // legacy: Interview.createdAt

    avgDaysToHired: number | null;               // от первой записи истории до 'hired'

    stages: Array<{
      key: string;                    // triage | in_progress | client_review | manager_call | technical | hired
      label: string;                  // человекочитаемая метка (см. STAGE_LABELS в packages/shared/src/stages.ts)
      avgDaysCompleted: number | null;  // среднее время ЗАВЕРШЁННЫХ визитов в стадию (кандидат ушёл дальше)
      completedCount: number;           // число завершённых визитов (не кандидатов — один кандидат может дать несколько)
      currentOccupancy: number;         // сколько тикетов сейчас в этой стадии (по состоянию на конец периода/сейчас)
      avgDaysInFlight: number | null;   // среднее "уже прошло" для тех, кто ещё в стадии
      skippedCount: number;             // сколько раз стадию перепрыгнули (переход A→B, где B на 2+ шага дальше A)
      regressionInCount: number;        // сколько раз кандидата вернули В эту стадию из более поздней
      regressionOutCount: number;       // сколько раз кандидата увели ИЗ этой стадии назад
      revisitCount: number;             // визиты сверх первого — стадия была пройдена по кругу
    }>;
    // ^ заменяет старый avgTimePerStage. Полная модель и обоснование —
    // docs/fix-time-on-stages-plan.md (RC-0..RC-4, §6).

    transitions: Array<{
      from: string; to: string; count: number; avgDays: number | null;
      kind: 'step' | 'skip' | 'regression' | 'exit' | 'reopen';
      skipsOver: string[];             // при kind='skip' — какие стадии были перепрыгнуты
    }>;
    // ^ разбивка по конкретным переходам A→B — используется для детального
    // раскрывающегося блока в TimelineStatsCard ("Show transitions").

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

Реализация: `apps/api/src/utils/stageTiming.ts` (`computeStageTiming`), вызывается из `apps/api/src/routes/stats.ts`. Полное обоснование дизайна — `docs/fix-time-on-stages-plan.md`.

**Legacy-блок** (`avgTechnicalToFinalDays`, `avgTotalDays`): для каждого `linearIssueId` берутся `createdAt` интервью по стадиям и `receivedAt` соответствующего `IncomingRequest`. Считается по **всем** интервью с `linearIssueId`, без фильтра по периоду. Остаётся на Interview-данных, потому что `final_result` — стадия анализа, а не статус тикета, и в `IncomingRequestStatusHistory` эквивалента для неё нет.

**Всё остальное** (`avgTriageToManagerCallDays`, `avgManagerToTechnicalDays`, `avgDaysToHired`, `stages`, `transitions`) считается из `IncomingRequestStatusHistory` целиком (без фильтра по `receivedAt` тикета — важно, см. ниже), запрос ограничен только `enteredAt <= to`:

- **Дата привязки к периоду — по времени самого перехода (`enteredAt`), а не по `receivedAt` тикета.** Раньше запрос фильтровал историю по `request.receivedAt` в периоде, из-за чего у тикета, созданного в прошлом месяце, но перешедшего в новую стадию в текущем, **вся** история отбрасывалась целиком — стадия могла показывать пусто, хотя переход только что произошёл. Теперь тикет учитывается, если сам переход (`B.enteredAt`) попадает в период — независимо от того, когда тикет был создан.
- **Завершённые визиты**: для каждой пары соседних записей истории A→B, где `B.enteredAt` попадает в период, разница `B.enteredAt - A.enteredAt` — это dwell-время визита в стадию A. Один и тот же кандидат может дать **несколько** визитов в одну стадию (если его туда возвращали) — `avgDaysCompleted` считается по визитам, не по кандидатам.
- **In-flight (текущая занятость)**: последняя запись истории тикета (по состоянию на `min(now, to)`), если её статус не терминальный (`hired`/`lost`/`rejected`/`dropped`), даёт "уже прошло N дней" в `avgDaysInFlight` + инкремент `currentOccupancy` — раньше такие тикеты не учитывались нигде, пока не покидали стадию.
- **Skip / regression / reopen**: каждый переход A→B классифицируется по позиции A и B в `STAGE_ORDER` (`packages/shared/src/stages.ts::classifyTransition`) — вперёд на 1 шаг (`step`), вперёд на 2+ (`skip`, с указанием какие стадии перепрыгнули), назад (`regression` — например, клиент отказал кандидату на Broker's Call и его вернули в Client Review), уход в `on_hold`/`lost`/etc (`exit`), возврат оттуда (`reopen`).
- `avgDaysToHired` / `avgTriageToManagerCallDays` / `avgManagerToTechnicalDays` — по **первому** попаданию тикета в соответствующий статус (не зависят от последующих откатов/петель), привязаны к периоду по времени этого первого попадания.
- Тикеты с аномально длинной историей (>50 записей — вероятно, баг данных или webhook-петля) исключаются из агрегации целиком, с warning в логах.
- Локальная история статусов может отставать от Linear (пропущенный/рассинхронённый вебхук) — она самовосстанавливается через `reconcileStatusHistory` (`apps/api/src/db/db.service.ts`), которая опционально вызывается при каждом вебхуке смены статуса, и через разовый бэкфилл `pnpm reconcile:status-history` (`apps/api/src/scripts/reconcile-status-history.ts`).

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
| `TimelineStatsCard` | `/stats/overview` | `timing.avgDaysToHired`, `timing.stages`, `timing.transitions`, `timing.trend` | Среднее время до найма + сегментированная полоса прогресса по стадиям (с индикацией skip/regression/in-flight) + раскрывающийся список переходов + тренд-график |
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
2. **`avgTechnicalToFinalDays`/`avgTotalDays` считаются по всем тикетам без фильтра периода** (Interview-based, см. выше) — чтобы средние были стабильны при узких окнах. Всё остальное в `timing` (включая `avgTriageToManagerCallDays`/`avgManagerToTechnicalDays` — теперь тоже history-based) привязано к периоду **по времени самого перехода**, а не по `receivedAt` тикета — см. "Как считается тайминг".
3. **История статусов заполняется только с момента деплоя `IncomingRequestStatusHistory`**, и восстанавливается через `reconcileStatusHistory`/`pnpm reconcile:status-history` для тикетов, у которых вебхук был пропущен или пришёл с рассинхроном. Тикеты без единой записи истории не попадают в `avgDaysToHired` / `stages` / `transitions`.
4. **`Interview.decision` заполняется только на стадии `final_result`.** Поэтому `hired` / `rejected` — это счётчик тикетов, доведённых до финала, а не суммарный итог по всем стадиям.
5. **`hireRateByRole` считается по интервью со стадией `technical`** — показывает процент найма среди тех, кто дошёл до технической стадии.
6. **LLM-кластеризация (`clusterTextItems`) недетерминирована** — топы могут чуть меняться между запусками, поэтому критично держать кэш (и инвалидировать его точечно, а не по TTL).
7. **Статус `'in_progress'` больше не перезаписывается при каждом новом комментарии** — это было бы шумом в истории статусов. Смена статуса идёт только через webhook `Issue/update` по `stateId`.
8. **Маппинг Linear → внутренние статусы для истории/тайминга резолвится по стабильному `state.id`, не по имени.** `apps/api/src/services/stageResolver.ts::resolveStage` — единственная точка входа для webhook'а и реконсиляции: при первом появлении конкретного `state.id` он бутстрапится по имени через `mapLinearStateToStatus` (`packages/shared/src/stages.ts`, с fallback-обрезкой суффикса вида `" (CV)"`) и дальше кэшируется по `id` на весь процесс — переименование статуса в Linear после этого момента больше не ломает историю. Если имя не распознано даже при бутстрапе — это **логируется warning'ом** (`[stageResolver] Unknown Linear workflow state...`, один раз на id) вместо тихой потери перехода. `STAGE_LABELS`/`STAGE_COLORS` на фронте по-прежнему заданы по внутреннему ключу (`triage`, `in_progress`, `client_review`, `manager_call` ↔ Linear "Broker's Call", `technical` ↔ Linear "Tech Call", `hired`) — внутренний `manager_call`/`technical` это и есть Linear-статусы "Broker's Call"/"Tech Call" (частый источник путаницы, см. `docs/fix-time-on-stages-plan.md`, §2). Кэш `resolveStage` живёт только в памяти процесса — после рестарта бутстрап по имени происходит заново (дёшево, не проблема).
9. **`GET /stats/overview` не использует `getIssuesForStats`'s `mapStateToStatus`** (`apps/api/src/services/linear.service.ts`) для тайминга — та функция обслуживает только "живой" `requests.byStatus` (карточка Incoming Requests), матчит по имени (не по id) и намеренно имеет более широкий словарь статусов (`backlog`, `duplicate`, автослагификация неизвестных) — трогать её в рамках time-on-stage фикса не нужно.
