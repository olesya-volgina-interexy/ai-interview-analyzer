import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PipelineData {
  reachedManagerCall: number;
  reachedTechnical: number;
  reachedFinalResult: number;
  hired: number;
  conversion: {
    managerCallToTechnical: number;
    technicalToHired: number;
  };
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];

export function PipelineFunnelChart({ pipeline }: { pipeline: PipelineData }) {
  const data = [
    { name: 'Manager Call', value: pipeline.reachedManagerCall },
    { name: 'Technical', value: pipeline.reachedTechnical },
    { name: 'Final Result', value: pipeline.reachedFinalResult },
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
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-3 text-xs text-slate-500 flex-wrap">
          <span>→ Technical: <b className="text-slate-700">{pipeline.conversion.managerCallToTechnical}%</b></span>
          <span>→ Hired: <b className="text-slate-700">{pipeline.conversion.technicalToHired}%</b></span>
        </div>
      </CardContent>
    </Card>
  );
}