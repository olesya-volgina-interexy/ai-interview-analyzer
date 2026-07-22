import { mapLinearStateToStatus } from '@shared/schemas';

// Resolves a Linear workflow state to our internal stage key by its stable
// `id`, not its display `name` — a state's name can be edited in Linear at
// any time (this happened in production: "Client Review" → "Client Review
// (CV)"), silently breaking any name-based lookup and making the transition
// vanish from time-on-stage stats with no error anywhere. The id never
// changes for a given workflow state, so once we've resolved it once, a
// later rename can't break it again.
//
// The map is bootstrapped lazily: the first time we see a given state id, we
// resolve it by name (via mapLinearStateToStatus, which already tolerates
// parenthetical suffixes) and cache the result against the id. Every
// subsequent sighting of that id — renamed or not — reuses the cached value.
// A state whose name we don't recognize even on first sight logs a loud
// warning (once per id) instead of silently dropping the transition, so an
// unmapped/new workflow state is visible in logs the moment it's hit rather
// than only showing up as missing data on a dashboard days later.
const idToStage = new Map<string, string>();
const warnedUnknownIds = new Set<string>();

export interface LinearStateRef {
  id?: string | null;
  name?: string | null;
}

export interface StageResolverLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

const noopLogger: StageResolverLogger = { warn: () => {} };

export function resolveStage(state: LinearStateRef | null | undefined, logger: StageResolverLogger = noopLogger): string | undefined {
  if (!state?.id) {
    // No id on the payload (shouldn't happen for a real Linear WorkflowState,
    // but stay defensive) — fall back to name-only matching, unresolved
    // instances of this simply won't benefit from the rename-proofing.
    return mapLinearStateToStatus(state?.name);
  }

  const cached = idToStage.get(state.id);
  if (cached) return cached;

  const bootstrapped = mapLinearStateToStatus(state.name);
  if (bootstrapped) {
    idToStage.set(state.id, bootstrapped);
    return bootstrapped;
  }

  if (!warnedUnknownIds.has(state.id)) {
    warnedUnknownIds.add(state.id);
    logger.warn(
      { stateId: state.id, stateName: state.name },
      '[stageResolver] Unknown Linear workflow state — this transition will NOT be recorded in time-on-stage stats until the name mapping (packages/shared/src/stages.ts) is extended'
    );
  }
  return undefined;
}
