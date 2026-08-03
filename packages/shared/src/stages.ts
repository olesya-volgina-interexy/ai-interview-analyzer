// Single source of truth for the recruiting pipeline's stage model — shared
// between the API and the web dashboard so the "Broker's Call = manager_call
// / Tech Call = technical" naming trap only has to be resolved in one place.

export const STAGE_ORDER = [
  'triage',
  'in_progress',
  'client_review',
  'manager_call',
  'technical',
  'hired',
] as const;

export type Stage = typeof STAGE_ORDER[number];

// Statuses that are not part of the linear funnel (used to keep them out of
// the funnel bars / classify transitions into them as 'exit').
export const OFFRAMP_STATUSES = new Set([
  'on_hold',
  'lost',
  'rejected',
  'dropped',
  'cv_sent',
  'new',
]);

// Statuses where a candidate's journey is genuinely over — no further
// movement is expected, so a request whose last entry is one of these is
// never "in-flight" (unlike on_hold/cv_sent/new, which are paused, not done).
export const TERMINAL_STATUSES = new Set(['hired', 'lost', 'rejected', 'dropped']);

// Display labels — the ONLY place the internal-key ↔ Linear-name mapping is
// resolved for UI purposes. `manager_call` really is Linear's "Broker's
// Call"; `technical` really is Linear's "Tech Call".
export const STAGE_LABELS: Record<string, string> = {
  triage: 'Triage',
  in_progress: 'In Progress',
  client_review: 'Client Review',
  manager_call: "Broker's Call",
  technical: 'Tech Call',
  hired: 'Hired',
  on_hold: 'On Hold',
  lost: 'Lost',
  rejected: 'Rejected',
  cv_sent: 'CV Sent',
  new: 'New',
  dropped: 'Dropped',
};

export const STAGE_COLORS: Record<string, string> = {
  triage: '#60A5FA',
  in_progress: '#38BDF8',
  client_review: '#2DD4BF',
  manager_call: '#A78BFA',
  technical: '#8B5CF6',
  hired: '#10B981',
};

// Index within the funnel; -1 for off-ramp/unknown statuses.
export function stageRank(status: string): number {
  return STAGE_ORDER.indexOf(status as Stage);
}

export function isFunnelStage(status: string): boolean {
  return stageRank(status) >= 0;
}

// Linear workflow state name (any case, e.g. "On hold" vs "On Hold") →
// internal status key. Case-insensitive so the API's webhook handler (which
// receives Linear's stored casing) and the GraphQL stats query (which has
// been observed to return different casing for the same state) agree.
const LINEAR_STATE_TO_STATUS: Record<string, string> = {
  'triage': 'triage',
  'in progress': 'in_progress',
  'client review': 'client_review',
  "broker's call": 'manager_call',
  'tech call': 'technical',
  'hired': 'hired',
  'lost': 'lost',
  'on hold': 'on_hold',
  'backlog': 'new',
  'todo': 'new',
  'duplicate': 'duplicate',
};

// Приводим имя стейта к виду ключа карты выше: типографские апострофы и
// двойные пробелы — обычный результат ручного ввода в Linear, а для
// "Broker's Call" такое расхождение раньше означало нерезолвнутый статус и,
// как следствие, полностью отключённый триггер анализа.
function normalizeStateName(stateName: string): string {
  return stateName
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function mapLinearStateToStatus(stateName: string | null | undefined): string | undefined {
  if (!stateName) return undefined;
  const key = normalizeStateName(stateName);
  if (LINEAR_STATE_TO_STATUS[key]) return LINEAR_STATE_TO_STATUS[key];

  // Some workflows suffix a parenthetical qualifier onto a state name to mark
  // a sub-flow (observed in production: "Client Review (CV)" instead of
  // plain "Client Review") — these still represent the same underlying
  // pipeline stage, so strip the suffix and retry before giving up. Without
  // this, an unrecognized state name silently maps to `undefined`, and the
  // webhook handler skips writing ANY history row for it — the transition
  // becomes completely invisible to time-on-stage stats, not just mislabeled.
  const withoutSuffix = key.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return withoutSuffix !== key ? LINEAR_STATE_TO_STATUS[withoutSuffix] : undefined;
}

export type TransitionKind = 'step' | 'skip' | 'regression' | 'exit' | 'reopen';

export interface TransitionClassification {
  kind: TransitionKind;
  // Funnel stages that were jumped over, in order — only populated for 'skip'.
  skipsOver: string[];
}

// Classifies a status transition A → B purely from each status's position in
// STAGE_ORDER, so adding/reordering a stage there is the only place that
// needs to change — no transition table to keep in sync by hand.
export function classifyTransition(from: string, to: string): TransitionClassification {
  const rankFrom = stageRank(from);
  const rankTo = stageRank(to);

  if (rankTo < 0) {
    return { kind: 'exit', skipsOver: [] };
  }
  if (rankFrom < 0) {
    return { kind: 'reopen', skipsOver: [] };
  }
  if (rankTo < rankFrom) {
    return { kind: 'regression', skipsOver: [] };
  }
  if (rankTo - rankFrom >= 2) {
    return { kind: 'skip', skipsOver: STAGE_ORDER.slice(rankFrom + 1, rankTo) as unknown as string[] };
  }
  return { kind: 'step', skipsOver: [] };
}
