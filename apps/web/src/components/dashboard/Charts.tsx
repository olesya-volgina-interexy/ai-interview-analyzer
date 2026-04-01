import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InterviewStats } from '@/api/client';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface ChartsProps {
  stats: InterviewStats | undefined;
}

export function Charts({ stats }: ChartsProps) {
  if (!stats) return null;

  const roleData = Object.entries(stats.byRole ?? {}).map(([name, value]) => ({
    name,
    value,
  }));

  const stageData = [
    { name: 'Manager Call', value: stats.byStage?.manager_call ?? 0 },
    { name: 'Technical', value: stats.byStage?.technical ?? 0 },
  ].filter(d => d.value > 0);

  if (roleData.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4">

      {/* By Role */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Interviews by Role</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={roleData} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={24} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Bar dataKey="value" name="Interviews" radius={[4, 4, 0, 0]}>
                {roleData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* By Stage */}
      {stageData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Interviews by Stage</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stageData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {stageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

    </div>
  );
}