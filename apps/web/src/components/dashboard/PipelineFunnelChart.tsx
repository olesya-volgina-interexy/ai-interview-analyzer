import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PipelineData {
  reachedCvSent: number;
  totalCvSent: number;
  reachedManagerCall: number;
  reachedTechnical: number;
  reachedFinalResult: number;
  hired: number;
  onHold: number;
  conversion: {
    managerCallToTechnical: number;
    technicalToHired: number;
  };
}

const COLORS: Record<string, string> = {
  'CV Sent': '#06b6d4',
  'Manager Call': '#3b82f6',
  'Technical': '#8b5cf6',
  'Final Result': '#f59e0b',
  'On Hold': '#94a3b8',
  'Hired': '#10b981',
};

export function PipelineFunnelChart({ pipeline }: { pipeline: PipelineData }) {
  const data = [
    { name: 'CV Sent', value: pipeline.reachedCvSent },
    { name: 'Manager Call', value: pipeline.reachedManagerCall },
    { name: 'Technical', value: pipeline.reachedTechnical },
    { name: 'Final Result', value: pipeline.reachedFinalResult },
    { name: 'On Hold', value: pipeline.onHold },
    { name: 'Hired', value: pipeline.hired },
  ].filter(d => d.value > 0);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barSize={40}>
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={24} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              cursor={{ fill: '#f1f5f9' }}
            />
            <Bar dataKey="value" name="Candidates" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={COLORS[d.name] ?? '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-3 text-xs text-slate-500 flex-wrap">
          {pipeline.totalCvSent > 0 && (
            <span>Total CVs: <b className="text-slate-700">{pipeline.totalCvSent}</b></span>
          )}
          <span>→ Technical: <b className="text-slate-700">{pipeline.conversion.managerCallToTechnical}%</b></span>
          <span>→ Hired: <b className="text-slate-700">{pipeline.conversion.technicalToHired}%</b></span>
        </div>
      </CardContent>
    </Card>
  );
}