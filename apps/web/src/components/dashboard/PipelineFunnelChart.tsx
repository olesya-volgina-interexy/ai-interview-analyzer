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

export function PipelineFunnelChart({ pipeline }: { pipeline: PipelineData }) {
  const stages = [
    { key: 'manager_call', label: 'Manager Call', color: '#3b82f6', value: pipeline.reachedManagerCall, conv: null as number | null },
    { key: 'technical', label: 'Technical', color: '#8b5cf6', value: pipeline.reachedTechnical, conv: pipeline.conversion.managerCallToTechnical },
    { key: 'hired', label: 'Hired', color: '#10b981', value: pipeline.hired, conv: pipeline.conversion.technicalToHired },
  ];
  const max = Math.max(...stages.map(s => s.value), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Candidate Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-xs text-slate-500">CVs sent to clients</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-slate-900">{pipeline.totalCvSent}</span>
            <span className="text-xs text-slate-400">
              across {pipeline.reachedCvSent} {pipeline.reachedCvSent === 1 ? 'vacancy' : 'vacancies'}
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stages</p>
          {stages.map(s => (
            <div key={s.key} className="grid grid-cols-[88px_1fr_1.5rem_2.75rem] items-center gap-3">
              <span className="text-xs font-medium text-slate-600">{s.label}</span>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${(s.value / max) * 100}%`, background: s.color }}
                />
              </div>
              <b className="text-right text-xs tabular-nums text-slate-800">{s.value}</b>
              <span className="text-right text-xs tabular-nums text-slate-400">
                {s.conv != null ? `${s.conv}%` : ''}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
