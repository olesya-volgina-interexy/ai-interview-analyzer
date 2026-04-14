import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QualityData {
  topDecisionBreakers: Array<{ text: string; count: number }>;
  topWeaknesses: Array<{ text: string; count: number }>;
  hireRateByRole: Array<{ role: string; hireRate: number; total: number }>;
}

function BarList({ items, color }: { items: Array<{ text: string; count: number }>; color: string }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs text-slate-600 mb-0.5">
            <span className="truncate pr-2 capitalize">{item.text}</span>
            <span className="font-medium flex-shrink-0">{item.count}x</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.count / max) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QualityStatsCard({ quality }: { quality: QualityData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Quality Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {quality.topDecisionBreakers.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Top rejection reasons
            </p>
            <BarList items={quality.topDecisionBreakers} color="#ef4444" />
          </div>
        )}

        {quality.topWeaknesses.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Top weaknesses
            </p>
            <BarList items={quality.topWeaknesses} color="#f59e0b" />
          </div>
        )}

        {quality.hireRateByRole.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Hire rate by role
            </p>
            <div className="space-y-1.5">
              {quality.hireRateByRole.map(({ role, hireRate, total }) => (
                <div key={role} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{role}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{total} interviews</span>
                    <span className={`font-medium ${hireRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                      {hireRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}