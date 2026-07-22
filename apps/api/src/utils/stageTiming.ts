import {
  STAGE_ORDER,
  STAGE_LABELS,
  TERMINAL_STATUSES,
  classifyTransition,
  type TransitionKind,
} from '@shared/schemas';

const DAY_MS = 86_400_000;

// A single request's history array beyond this size is treated as data
// corruption / a runaway webhook loop, not a real candidate journey — it is
// excluded from aggregation entirely rather than allowed to dominate an average.
const MAX_HISTORY_ROWS_PER_REQUEST = 50;

export interface StatusHistoryRow {
  incomingRequestId: string;
  status: string;
  enteredAt: Date;
}

export interface StageStat {
  key: string;
  label: string;
  avgDaysCompleted: number | null; // mean per-visit dwell (candidates who left the stage)
  completedCount: number;          // number of completed VISITS, not distinct candidates
  currentOccupancy: number;        // how many requests are sitting here right now (or as of `to`)
  avgDaysInFlight: number | null;  // mean elapsed time for those still here
  skippedCount: number;            // times this stage was jumped over by a forward skip
  regressionInCount: number;       // times a candidate was moved BACK into this stage
  regressionOutCount: number;      // times a candidate was moved backward OUT of this stage
  revisitCount: number;            // completed visits beyond the first (loops through this stage)
}

export interface TransitionStat {
  from: string;
  to: string;
  count: number;
  avgDays: number | null;
  kind: TransitionKind;
  skipsOver: string[];
}

export interface StageTimingResult {
  stages: StageStat[];
  transitions: TransitionStat[];
  milestones: {
    triageToManagerCall: number[];
    managerToTechnical: number[];
    daysToHired: number[];
    techToHired: number[];
  };
  // Requests excluded for exceeding MAX_HISTORY_ROWS_PER_REQUEST.
  pathologicalRequestCount: number;
}

function avgPrecise(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
}

function inRange(d: Date, from: Date, to: Date): boolean {
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}

// Computes per-stage dwell/occupancy/skip/regression stats plus funnel
// milestone samples from a request's full status history. See
// docs/fix-time-on-stages-plan.md for the design this implements:
//
//  - Dwell for a completed visit A → B is attributed to the period by B's
//    enteredAt (when the candidate LEFT A), not by the request's receivedAt
//    (RC-0 fix) — a candidate created last month but moving this month is
//    counted correctly.
//  - Skips, backward moves (regressions) and re-opens are classified from
//    each status's rank in STAGE_ORDER (via classifyTransition) — never
//    hardcoded — so a regression is never mistaken for a forward skip.
//  - A request's LAST history row (as of `now`, capped at `to`) becomes an
//    "in-flight" sample instead of contributing nothing until it moves on.
//  - Milestones (triage→manager_call, manager_call→technical, →hired) use
//    FIRST arrival at each stage, independent of the per-stage dwell model,
//    so a later bounce-back never resets or double-counts funnel duration.
export function computeStageTiming(
  historyRows: StatusHistoryRow[],
  opts: { from: Date; to: Date; now: Date }
): StageTimingResult {
  const { from, to, now } = opts;
  const asOf = now.getTime() < to.getTime() ? now : to;

  // historyRows is assumed sorted by enteredAt ascending (caller's query
  // orders it); grouping preserves that order within each request.
  const byRequest = new Map<string, StatusHistoryRow[]>();
  for (const row of historyRows) {
    const list = byRequest.get(row.incomingRequestId);
    if (list) list.push(row);
    else byRequest.set(row.incomingRequestId, [row]);
  }

  const dwell: Record<string, number[]> = {};
  const completedCount: Record<string, number> = {};
  const inFlight: Record<string, number[]> = {};
  const currentOccupancy: Record<string, number> = {};
  const skippedCount: Record<string, number> = {};
  const regressionInCount: Record<string, number> = {};
  const regressionOutCount: Record<string, number> = {};
  const revisitCount: Record<string, number> = {};
  const transitionsMap = new Map<string, {
    from: string; to: string; count: number; days: number[]; kind: TransitionKind; skipsOver: string[];
  }>();

  const triageToManagerCall: number[] = [];
  const managerToTechnical: number[] = [];
  const daysToHired: number[] = [];
  const techToHired: number[] = [];
  let pathologicalRequestCount = 0;

  for (const entries of byRequest.values()) {
    if (entries.length > MAX_HISTORY_ROWS_PER_REQUEST) {
      pathologicalRequestCount++;
      continue;
    }

    const visitedBefore = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const A = entries[i];
      const isRevisit = visitedBefore.has(A.status);
      visitedBefore.add(A.status);

      if (i < entries.length - 1) {
        const B = entries[i + 1];
        if (!inRange(B.enteredAt, from, to)) continue;

        const days = Math.max(0, (B.enteredAt.getTime() - A.enteredAt.getTime()) / DAY_MS);
        (dwell[A.status] ??= []).push(days);
        completedCount[A.status] = (completedCount[A.status] ?? 0) + 1;
        if (isRevisit) revisitCount[A.status] = (revisitCount[A.status] ?? 0) + 1;

        const { kind, skipsOver } = classifyTransition(A.status, B.status);
        const key = `${A.status}→${B.status}`;
        const t = transitionsMap.get(key) ?? { from: A.status, to: B.status, count: 0, days: [] as number[], kind, skipsOver };
        t.count++;
        t.days.push(days);
        transitionsMap.set(key, t);

        if (kind === 'skip') {
          for (const s of skipsOver) skippedCount[s] = (skippedCount[s] ?? 0) + 1;
        } else if (kind === 'regression') {
          regressionOutCount[A.status] = (regressionOutCount[A.status] ?? 0) + 1;
          regressionInCount[B.status] = (regressionInCount[B.status] ?? 0) + 1;
        }
      } else if (!TERMINAL_STATUSES.has(A.status)) {
        const elapsed = (asOf.getTime() - A.enteredAt.getTime()) / DAY_MS;
        if (elapsed >= 0) {
          (inFlight[A.status] ??= []).push(elapsed);
          currentOccupancy[A.status] = (currentOccupancy[A.status] ?? 0) + 1;
        }
      }
    }

    // Milestones anchor on FIRST arrival at each stage, attributed to the
    // period by when that arrival happened — never by the request's
    // receivedAt (same RC-0 fix as the per-stage dwell above).
    const first = entries[0];
    const mc = entries.find(e => e.status === 'manager_call');
    const tc = entries.find(e => e.status === 'technical');
    const hiredEntry = entries.find(e => e.status === 'hired');

    if (first && mc && inRange(mc.enteredAt, from, to)) {
      triageToManagerCall.push((mc.enteredAt.getTime() - first.enteredAt.getTime()) / DAY_MS);
    }
    if (mc && tc && inRange(tc.enteredAt, from, to)) {
      managerToTechnical.push((tc.enteredAt.getTime() - mc.enteredAt.getTime()) / DAY_MS);
    }
    if (first && hiredEntry && inRange(hiredEntry.enteredAt, from, to)) {
      daysToHired.push((hiredEntry.enteredAt.getTime() - first.enteredAt.getTime()) / DAY_MS);
    }
    if (tc && hiredEntry && hiredEntry.enteredAt.getTime() >= tc.enteredAt.getTime() && inRange(hiredEntry.enteredAt, from, to)) {
      techToHired.push((hiredEntry.enteredAt.getTime() - tc.enteredAt.getTime()) / DAY_MS);
    }
  }

  const stages: StageStat[] = STAGE_ORDER.map(key => ({
    key,
    label: STAGE_LABELS[key] ?? key,
    avgDaysCompleted: avgPrecise(dwell[key] ?? []),
    completedCount: completedCount[key] ?? 0,
    currentOccupancy: currentOccupancy[key] ?? 0,
    avgDaysInFlight: avgPrecise(inFlight[key] ?? []),
    skippedCount: skippedCount[key] ?? 0,
    regressionInCount: regressionInCount[key] ?? 0,
    regressionOutCount: regressionOutCount[key] ?? 0,
    revisitCount: revisitCount[key] ?? 0,
  }));

  // 'hired' is a destination, not a stage candidates dwell in and leave —
  // its "duration" is the funnel's final step (Tech Call → Hired), same
  // special case the old avgTimePerStage.hired computation used.
  const hiredStage = stages.find(s => s.key === 'hired');
  if (hiredStage) {
    hiredStage.avgDaysCompleted = avgPrecise(techToHired);
    hiredStage.completedCount = techToHired.length;
  }

  const transitions: TransitionStat[] = [...transitionsMap.values()].map(t => ({
    from: t.from,
    to: t.to,
    count: t.count,
    avgDays: avgPrecise(t.days),
    kind: t.kind,
    skipsOver: t.skipsOver,
  }));

  return {
    stages,
    transitions,
    milestones: { triageToManagerCall, managerToTechnical, daysToHired, techToHired },
    pathologicalRequestCount,
  };
}
