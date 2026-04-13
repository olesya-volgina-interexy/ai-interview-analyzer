import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { InterviewListItem } from '@/api/client';

const RECOMMENDATION_STYLE: Record<string, string> = {
  hire:         'bg-green-100 text-green-800',
  no_hire:      'bg-red-100 text-red-800',
  uncertain:    'bg-yellow-100 text-yellow-800',
  passed:       'bg-blue-100 text-blue-800',
  rejected:     'bg-red-100 text-red-800',
  on_hold:      'bg-slate-100 text-slate-600',
  hired:        'bg-green-100 text-green-800',
};

const STAGE_LABEL: Record<string, string> = {
  manager_call: 'Manager Call',
  technical:    'Technical',
  final_result: 'Final Result',
};

function getRecommendation(item: InterviewListItem): string {
  const a = item.analysis as any;
  if (item.stage === 'manager_call') return a?.stageResult ?? '—';
  if (item.stage === 'technical')    return a?.recommendation ?? '—';
  return a?.decision ?? '—';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface InterviewsTableProps {
  data: InterviewListItem[];
  isLoading: boolean;
  onRowClick: (id: string) => void;
}

export function InterviewsTable({ data, isLoading, onRowClick }: InterviewsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-slate-500">No interviews yet.</p>
        <p className="text-xs text-slate-400 mt-1">Click "New Analysis" to add one.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[11%]">Date</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[20%]">Candidate</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[18%]">Role</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[13%]">Client</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[12%]">Manager</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[12%]">Stage</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[13%]">AI Result</th>
            <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[8%]">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map(item => {
            const rec = getRecommendation(item);
            const score = (item.analysis as any)?.score;

            return (
              <tr
                key={item.id}
                onClick={() => onRowClick(item.id)}
                className="hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                  {formatDate(item.createdAt)}
                </td>
                <td className="px-3 py-3 font-medium text-slate-900 truncate max-w-0">
                  {item.candidateName ?? '—'}
                </td>
                <td className="px-3 py-3 text-slate-600 truncate">
                  {item.role} <span className="text-slate-400">{item.level}</span>
                </td>
                <td className="px-3 py-3 text-slate-600 truncate">
                  {item.clientName ?? '—'}
                </td>
                <td className="px-3 py-3 text-slate-600 truncate">
                  {item.managerName ?? '—'}
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-slate-500">
                    {STAGE_LABEL[item.stage] ?? item.stage}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {rec !== '—' ? (
                    <Badge className={`${RECOMMENDATION_STYLE[rec] ?? 'bg-slate-100 text-slate-600'} whitespace-nowrap`}>
                      {rec.replace('_', ' ')}
                    </Badge>
                  ) : '—'}
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                  {score !== undefined ? `${score}/100` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}