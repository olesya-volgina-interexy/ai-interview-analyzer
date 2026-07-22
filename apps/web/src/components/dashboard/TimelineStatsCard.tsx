import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { STAGE_COLORS, STAGE_LABELS } from '@shared/schemas';

interface StageStat {
  key: string;
  label: string;
  avgDaysCompleted: number | null;
  completedCount: number;
  currentOccupancy: number;
  avgDaysInFlight: number | null;
  skippedCount: number;
  regressionInCount: number;
  regressionOutCount: number;
  revisitCount: number;
}

interface TransitionStat {
  from: string;
  to: string;
  count: number;
  avgDays: number | null;
  kind: 'step' | 'skip' | 'regression' | 'exit' | 'reopen';
  skipsOver: string[];
}

interface TimingData {
  avgTriageToManagerCallDays: number | null;
  avgManagerToTechnicalDays: number | null;
  avgTechnicalToFinalDays: number | null;
  avgTotalDays: number | null;
  avgDaysToHired: number | null;
  stages: StageStat[];
  transitions: TransitionStat[];
  trend: Array<{ month: string; count: number }>;
}

function formatDuration(days: number | null | undefined): string {
  if (days == null) return '—';
  if (days >= 1) return `${Math.round(days)}d`;
  const hours = days * 24;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return `${Math.max(Math.round(hours * 60), 1)}m`;
}

// Bar-segment width for a stage: real dwell/in-flight days where we have
// them. A stage that was only ever jumped over (never dwelled in, never
// occupied) still gets a small "phantom" sliver so the skip renders as a
// visible dashed bridge in the bar instead of silently vanishing.
function stageWeight(stage: StageStat, phantomWeight: number): { weight: number; isSkipOnly: boolean } {
  const real = stage.avgDaysCompleted ?? stage.avgDaysInFlight;
  if (real != null) return { weight: real, isSkipOnly: false };
  const isSkipOnly = stage.currentOccupancy === 0 && stage.skippedCount > 0;
  return { weight: isSkipOnly ? phantomWeight : 0, isSkipOnly };
}

function StageBar({ stages }: { stages: StageStat[] }) {
  const realWeights = stages
    .map(s => s.avgDaysCompleted ?? s.avgDaysInFlight)
    .filter((d): d is number => d != null && d > 0);
  const phantomWeight = realWeights.length > 0
    ? Math.max(0.2, (realWeights.reduce((a, b) => a + b, 0) / realWeights.length) * 0.3)
    : 1;

  const segments = stages
    .map(s => ({ ...s, ...stageWeight(s, phantomWeight) }))
    .filter(s => s.weight > 0);

  const total = segments.reduce((sum, s) => sum + s.weight, 0);

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No completed stage transitions yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map(s => (
          <div
            key={s.key}
            title={
              s.isSkipOnly
                ? `${s.label}: skipped ${s.skippedCount}× — candidates jumped straight past this stage`
                : s.avgDaysCompleted != null
                ? `${s.label}: ${formatDuration(s.avgDaysCompleted)}`
                : `${s.label}: ~${formatDuration(s.avgDaysInFlight)} so far (${s.currentOccupancy} currently here)`
            }
            style={{
              width: `${(s.weight / total) * 100}%`,
              background: STAGE_COLORS[s.key] ?? '#94A3B8',
              opacity: s.isSkipOnly ? 0.4 : s.avgDaysCompleted == null ? 0.6 : 1,
              backgroundImage: s.isSkipOnly
                ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.6) 3px, rgba(255,255,255,0.6) 6px)'
                : undefined,
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        {stages.map(stage => (
          <StageLegendItem key={stage.key} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function StageLegendItem({ stage }: { stage: StageStat }) {
  const color = STAGE_COLORS[stage.key] ?? '#94A3B8';

  let valueLabel: string;
  let valueTitle: string | undefined;
  if (stage.avgDaysCompleted != null) {
    valueLabel = formatDuration(stage.avgDaysCompleted);
  } else if (stage.currentOccupancy > 0) {
    valueLabel = `~${formatDuration(stage.avgDaysInFlight)} ⏳`;
    valueTitle = `${stage.currentOccupancy} candidate(s) currently here, avg ${formatDuration(stage.avgDaysInFlight)} so far`;
  } else if (stage.skippedCount > 0 && stage.completedCount === 0) {
    valueLabel = 'skipped';
    valueTitle = `Jumped straight past this stage ${stage.skippedCount}× this period — nobody dwelled here`;
  } else {
    valueLabel = '—';
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-xs text-muted-foreground">{stage.label}</span>
        <span className="ml-auto text-xs font-medium text-foreground" title={valueTitle}>
          {valueLabel}
        </span>
      </div>
      {(stage.regressionInCount > 0 || stage.revisitCount > 0) && (
        <div className="flex items-center gap-1 pl-3.5">
          {stage.regressionInCount > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px]"
              title={`${stage.regressionInCount} candidate(s) sent back here from a later stage`}
            >
              ↩ {stage.regressionInCount}
            </Badge>
          )}
          {stage.revisitCount > 0 && (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[10px]"
              title={`${stage.revisitCount} extra visit(s) — candidates looped back through this stage`}
            >
              ↻ looped
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Only the exceptions get a row here — a plain forward A→B step is already
// represented by stage A's avgDaysCompleted in the bar/legend above, so
// repeating it in this list would just be the same number twice. This list
// exists to surface what the bar CAN'T show: which specific paths candidates
// actually took (skipped a stage, sent back, paused/lost, re-opened).
const KIND_ICON: Record<TransitionStat['kind'], string> = {
  step: '→',
  skip: '⤼',
  regression: '↩',
  exit: '✕',
  reopen: '↻',
};

const KIND_SORT_ORDER: TransitionStat['kind'][] = ['skip', 'regression', 'exit', 'reopen'];

function stageLabel(key: string): string {
  return STAGE_LABELS[key] ?? key;
}

function TransitionsDetail({ transitions }: { transitions: TransitionStat[] }) {
  const [open, setOpen] = useState(false);

  const exceptions = transitions
    .filter(t => t.kind !== 'step')
    .sort((a, b) => KIND_SORT_ORDER.indexOf(a.kind) - KIND_SORT_ORDER.indexOf(b.kind));

  if (exceptions.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
      >
        {open ? 'Hide transitions ▴' : 'Show transitions ▾'}
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {exceptions.map(t => (
            <div
              key={`${t.kind}:${t.from}->${t.to}`}
              className="rounded-lg border bg-muted/50 px-2.5 py-1.5"
              title={t.skipsOver.length > 0 ? `Skipped ${t.skipsOver.map(stageLabel).join(', ')}` : undefined}
            >
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-foreground">
                <span aria-hidden className="text-muted-foreground">{KIND_ICON[t.kind]}</span>
                {stageLabel(t.from)} → {stageLabel(t.to)}
              </div>
              <div className="mt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
                {t.count}× · avg {formatDuration(t.avgDays)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TimelineStatsCard({ timing }: { timing: TimingData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Time on Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-accent p-3">
          <p className="mb-1.5 text-xs leading-tight text-accent-foreground">
            Avg time from Triage to Hired
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium leading-none text-accent-foreground">
              {timing.avgDaysToHired ?? '—'}
            </span>
            {timing.avgDaysToHired != null && (
              <span className="text-xs text-accent-foreground">days avg</span>
            )}
          </div>
        </div>

        <StageBar stages={timing.stages} />
        <TransitionsDetail transitions={timing.transitions} />

        {timing.trend.length > 1 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Interviews per month
            </p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={timing.trend}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => v.slice(5)}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={20} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  labelFormatter={v => `Month: ${v}`}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Interviews"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
