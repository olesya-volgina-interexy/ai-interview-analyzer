import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface CandidatesData {
  avgScoreByLevel: Array<{ level: string; avgScore: number }>;
  avgScoreByRole: Array<{ role: string; avgScore: number }>;
}

const LEVEL_ORDER = ['Junior', 'Middle', 'Senior'];
const SCORE_COLOR = (score: number) =>
  score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-500';

export function CandidateInsightsCard({ candidates }: { candidates: CandidatesData }) {
  const levelsSorted = [...candidates.avgScoreByLevel].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Candidate Scores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {levelsSorted.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Avg score by level
            </p>
            <div className="flex gap-3">
              {levelsSorted.map(({ level, avgScore }) => (
                <div key={level} className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">{level}</p>
                  <p className={`text-xl font-semibold ${SCORE_COLOR(avgScore)}`}>{avgScore}</p>
                  <p className="text-xs text-slate-400">/100</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {candidates.avgScoreByRole.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Avg score by role
            </p>
            {candidates.avgScoreByRole.length >= 3 ? (
              <ResponsiveContainer width="100%" height={180}>
                <RadarChart data={candidates.avgScoreByRole}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="role" tick={{ fontSize: 11 }} />
                  <Radar
                    dataKey="avgScore"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.15}
                    name="Avg Score"
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v: any) => [`${v}/100`, 'Avg Score']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="space-y-1.5">
                {candidates.avgScoreByRole.map(({ role, avgScore }) => (
                  <div key={role} className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">{role}</span>
                    <span className={`font-medium ${SCORE_COLOR(avgScore)}`}>{avgScore}/100</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}