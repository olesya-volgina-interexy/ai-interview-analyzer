import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface LevelScore {
  level: string;
  avgScore: number;
}

interface RoleScore {
  role: string;
  avgScore: number;
}

const LEVEL_ORDER = ['Junior', 'Middle', 'Senior', 'Architect'];

const SCORE_TEXT = (score: number) =>
  score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-500';
const SCORE_BAR = (score: number) =>
  score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
const SCORE_GRADIENT = (score: number) =>
  score >= 75
    ? 'from-green-50 to-white ring-green-100'
    : score >= 50
    ? 'from-yellow-50 to-white ring-yellow-100'
    : 'from-red-50 to-white ring-red-100';

/* ---------- Levels — narrow card, always 3 sub-blocks ---------- */
export function LevelScoresCard({ levels }: { levels: LevelScore[] }) {
  const rows = LEVEL_ORDER.map(level => {
    const found = levels.find(l => l.level === level);
    return { level, avgScore: found?.avgScore ?? null };
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Avg Score by Level</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex flex-col gap-2 h-full">
          {rows.map(({ level, avgScore }) => {
            const hasScore = avgScore !== null;
            const gradient = hasScore
              ? SCORE_GRADIENT(avgScore as number)
              : 'from-slate-50 to-white ring-slate-100';
            const textColor = hasScore ? SCORE_TEXT(avgScore as number) : 'text-slate-300';
            const barColor = hasScore ? SCORE_BAR(avgScore as number) : 'bg-slate-200';
            const barWidth = hasScore ? Math.min(100, Math.max(0, avgScore as number)) : 0;

            return (
              <div
                key={level}
                className={`flex-1 rounded-xl bg-gradient-to-br ${gradient} ring-1 p-3 flex flex-col`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    {level}
                  </span>
                  <span className="text-[10px] text-slate-400">/100</span>
                </div>
                <div className={`text-2xl font-bold leading-none mb-2 ${textColor}`}>
                  {hasScore ? avgScore : '—'}
                </div>
                <div className="mt-auto h-1 bg-slate-200/70 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Roles — wider card with the radar chart ---------- */
export function RoleScoresCard({ roles }: { roles: RoleScore[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Avg Score by Role</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {roles.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            No data
          </div>
        ) : roles.length >= 3 ? (
          <div className="flex-1 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={roles} outerRadius="80%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="role" tick={{ fontSize: 12, fill: '#475569' }} />
                <Radar
                  dataKey="avgScore"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  name="Avg Score"
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(v: any) => [`${v}/100`, 'Avg Score']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-1.5">
            {roles.map(({ role, avgScore }) => (
              <div key={role} className="flex justify-between items-center text-sm">
                <span className="text-slate-600">{role}</span>
                <span className={`font-medium ${SCORE_TEXT(avgScore)}`}>{avgScore}/100</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
