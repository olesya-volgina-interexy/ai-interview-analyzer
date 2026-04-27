// Единое логирование ошибок пайплайна: помечаем стадию и достаём
// максимум контекста из ошибки (OpenAI / axios / Linear SDK / fetch).

export type PipelineStage =
  | 'cv'
  | 'embed'
  | 'rag'
  | 'llm'
  | 'db'
  | 'qdrant'
  | 'linear';

function truncate(value: unknown, max = 2000): unknown {
  if (value === undefined || value === null) return value;
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (str.length <= max) return typeof value === 'string' ? value : value;
    return str.slice(0, max) + '…[truncated]';
  } catch {
    return String(value);
  }
}

// Раскладываем ошибку на все поля, которые реально встречаются
// в SDK: OpenAI (err.status / err.error / err.code / err.param),
// axios (err.response?.data / err.response?.status / err.code),
// Qdrant ApiError (err.data / err.status / err.url / err.headers),
// Linear (err.type / err.errors), fetch (err.cause).
export function describeError(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== 'object') {
    return { message: String(err) };
  }
  const e = err as any;
  return {
    name: e.name,
    message: e.message,
    status: e.status ?? e.statusCode ?? e.response?.status,
    statusText: e.statusText ?? e.response?.statusText,
    code: e.code,
    type: e.type,
    param: e.param,
    url: e.url,
    data: truncate(e.data),
    responseData: truncate(e.response?.data),
    responseBody: truncate(e.response?.body),
    errorField: truncate(e.error),
    errorsField: truncate(e.errors),
    cause: e.cause ? describeError(e.cause) : undefined,
  };
}

export function logStageError(
  stage: PipelineStage,
  err: unknown,
  context?: Record<string, unknown>
): void {
  console.error(`[stage:${stage}] failed`, {
    ...describeError(err),
    ...(context ?? {}),
  });
}

// Запускает шаг пайплайна с единым логом ошибки и тегом стадии.
// Ошибку пробрасываем дальше — BullMQ пометит job как failed.
export async function runStage<T>(
  stage: PipelineStage,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logStageError(stage, err, context);
    throw err;
  }
}
