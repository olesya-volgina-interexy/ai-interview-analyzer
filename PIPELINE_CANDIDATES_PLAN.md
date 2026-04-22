# Промпт: добавить трекинг кандидатов по CV из Linear-тикетов

### Контекст проекта

Монорепа: `apps/api` (Fastify + Prisma + PostgreSQL + Redis), `apps/web` (React + TanStack Router/Query), `packages/shared`.

**Как сейчас работает CV-обнаружение** (`apps/api/src/routes/webhooks/linear.ts`, блок `type === 'Comment' && action === 'create'`):
- При любом новом комментарии в Linear проверяется наличие ссылки `my.visualcv.com`/`visualcv` в теле комментария
- Если ссылка есть → инкрементится `IncomingRequest.cvSentCount`, статус меняется на `cv_sent`
- Больше ничего — имя кандидата не парсится, отдельная сущность кандидата не создаётся

**Структура треда в Linear**: каждая вакансия = один тикет. Каждый кандидат = одна корневая ветка комментариев (root comment без `parent.id`). Root comment содержит CV-ссылку. Replies к нему содержат транскрипты, фидбек с хэштегами.

**Ключевые существующие функции:**
- `extractCVUrl(body: string)` — в `apps/api/src/services/linear.parser.ts:136` — извлекает ссылку visualcv из тела комментария
- `extractCVText(cvUrl: string)` — в `apps/api/src/services/cv.service.ts:16` — скачивает и парсит PDF/HTML CV
- `extractNameFromCV(cvText: string)` — в `apps/api/src/services/cv.service.ts:121` — извлекает имя через LLM
- `detectLevelFromCV(cvText: string)` — в `apps/api/src/services/cv.service.ts:147` — определяет уровень через LLM
- `extractCVUrl` экспортируется только внутри parser, надо проверить — может понадобиться переэкспортировать из `linear.service.ts`

**Схема БД** (`apps/api/prisma/schema.prisma`):
- `Interview` — анализ одного интервью. Связь с тикетом через `linearIssueId` + `parentCommentId` (= rootCommentId ветки кандидата)
- `IncomingRequest` — тикет из Linear. `linearIssueId` — unique key
- Нет отдельной сущности "кандидат до интервью"

**Webhook payload для Comment:**
- `data.id` — ID комментария (это и есть `rootCommentId` для кандидата)
- `data.body` — тело комментария
- `data.issue?.id` — ID тикета
- `data.parent?.id` — ID родительского комментария (null/undefined = это root comment = новый кандидат)

---

### Что нужно реализовать

#### 1. Новая модель в Prisma (`apps/api/prisma/schema.prisma`)

```prisma
model PipelineCandidate {
  id             String   @id @default(uuid())
  linearIssueId  String
  rootCommentId  String   @unique  // Linear comment ID, ключ идемпотентности
  candidateName  String?           // из CV через LLM
  level          String?           // из CV через LLM
  cvUrl          String
  cvText         String?  @db.Text
  role           String?           // с IncomingRequest на момент создания
  clientName     String?           // с IncomingRequest на момент создания
  cvSubmittedAt  DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([linearIssueId])
  @@index([cvSubmittedAt])
}
```

Создать миграцию через `npx prisma migrate dev --name add_pipeline_candidate`.

#### 2. Webhook (`apps/api/src/routes/webhooks/linear.ts`)

В блоке `type === 'Comment' && action === 'create'`, ПОСЛЕ существующей логики `cv_sent`, добавить:

```ts
// Только root-комментарии = новые кандидаты (у reply есть data.parent?.id)
const isRootComment = !data.parent?.id;

if (hasCVLink && isRootComment) {
  const cvUrl = extractCVUrl(commentBody); // из linear.parser.ts
  if (cvUrl) {
    // Запускаем в фоне, не блокируя ответ webhook
    setImmediate(async () => {
      try {
        const cvText = await extractCVText(cvUrl);
        const [candidateName, level] = await Promise.all([
          extractNameFromCV(cvText),
          detectLevelFromCV(cvText),
        ]);

        // Берём role/clientName из IncomingRequest
        const req = await prisma.incomingRequest.findUnique({
          where: { linearIssueId: issueId },
          select: { role: true, clientName: true },
        });

        await prisma.pipelineCandidate.upsert({
          where: { rootCommentId: data.id },
          create: {
            linearIssueId: issueId,
            rootCommentId: data.id,
            candidateName: candidateName ?? undefined,
            level: level ?? undefined,
            cvUrl,
            cvText,
            role: req?.role ?? undefined,
            clientName: req?.clientName ?? undefined,
          },
          update: {
            // если CV ссылка пришла снова — обновляем данные
            cvUrl,
            cvText,
            candidateName: candidateName ?? undefined,
            level: level ?? undefined,
          },
        });
      } catch (err) {
        fastify.log.warn({ err }, 'Failed to create PipelineCandidate');
      }
    });
  }
}
```

Также: при смене `clientName` тикета (блок `updatedFrom?.title !== undefined`) — дополнительно делать `prisma.pipelineCandidate.updateMany({ where: { linearIssueId }, data: { clientName: newClientName } })`.

#### 3. Новый API endpoint (`apps/api/src/routes/candidates.ts` или отдельный файл)

```
GET /pipeline-candidates
```

Query params:
- `search` — поиск по имени (ilike)
- `hasInterviews` — `'yes'` | `'no'` | undefined (all)
- `clientName` — фильтр по клиенту
- `role` — фильтр по роли
- `from` / `to` — фильтр по `cvSubmittedAt`
- `page` (default 1), `limit` (default 20)

Логика: `PipelineCandidate` LEFT JOIN с `Interview` по `(linearIssueId, rootCommentId = parentCommentId)`. Возвращать:

```ts
Array<{
  id: string;
  candidateName: string | null;
  cvUrl: string;
  level: string | null;
  role: string | null;
  clientName: string | null;
  cvSubmittedAt: string;        // ISO
  linearIssueId: string;
  interviewCount: number;       // сколько интервью уже есть
  lastStage: string | null;     // последняя стадия (manager_call / technical / final_result)
  lastDecision: string | null;  // последнее decision
}>
```

JOIN с `Interview`:
```ts
const interviews = await prisma.interview.findMany({
  where: { linearIssueId: { in: issueIds }, parentCommentId: { in: commentIds } },
  select: { linearIssueId: true, parentCommentId: true, stage: true, decision: true, createdAt: true },
});
// затем map: для каждого PipelineCandidate найти его интервью по (linearIssueId + parentCommentId === rootCommentId)
```

#### 4. Frontend

**Тип** (`apps/web/src/api/client.ts`) — добавить `PipelineCandidateItem` и метод `pipelineCandidatesApi.getList(params)`.

**Страница Candidates** (`apps/web/src/pages/CandidatesPage.tsx`) — добавить вторую вкладку (или отдельный раздел ниже существующей таблицы) **"In Pipeline"** с таблицей:

| Имя | Роль | Клиент | Уровень | CV отправлен | Статус интервью |
|---|---|---|---|---|---|
| Ivan Petrov | Backend | Acme | Middle | 12 Apr 2026 | No interviews |
| Anna Lee | QA | Google | Junior | 10 Apr 2026 | Manager Call |

Колонка «Статус интервью» — бейдж:
- `No interviews yet` (серый) — если `interviewCount === 0`
- `Manager Call` (синий) — если последняя стадия `manager_call`
- `Technical` (фиолетовый) — `technical`
- `Hired` (зелёный) — `decision === 'hired'`
- `Rejected` (красный) — `decision === 'rejected'`

Фильтры для этой таблицы: `Search by name`, `Role`, `Client`, `Has interviews: All / No / Yes`.

Скелетон загрузки — аналогично существующему (строки с `Skeleton` компонентом).

---

### Важные детали и ограничения

1. **Идемпотентность**: `rootCommentId` — `@unique`. Если webhook придёт дважды — `upsert` не задублирует запись.
2. **Только root comments**: `!data.parent?.id` — это строгое условие. Reply-комментарии (транскрипты, фидбек) содержат visualcv крайне редко и создавать по ним кандидата не нужно.
3. **Не блокировать webhook**: вся работа с CV (скачивание, LLM) — в `setImmediate` или через очередь. Webhook должен отвечать 200 за < 1 сек.
4. **Существующие кандидаты**: у записей `PipelineCandidate` нет бэкфилла — будут появляться только по новым CV после деплоя.
5. **Связь с Interview**: через пару `(linearIssueId, rootCommentId ↔ parentCommentId)`. `Interview.parentCommentId` уже пишется как `rootCommentId` ветки кандидата при каждом анализе.
6. **`extractCVUrl`** сейчас не экспортируется из `linear.service.ts` — нужно либо переэкспортировать, либо перенести функцию туда из `linear.parser.ts`.
7. **Обновление `role`/`clientName`**: при смене заголовка тикета — синхронизировать и в `PipelineCandidate.updateMany`.
