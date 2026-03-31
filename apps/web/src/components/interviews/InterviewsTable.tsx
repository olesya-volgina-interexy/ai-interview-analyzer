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
};

const STAGE_LABEL: Record<string, string> = {
  manager_call: 'Manager Call',
  technical:    'Technical',
};

function getRecommendation(item: InterviewListItem): string {
  const a = item.analysis as any;
  return a?.recommendation ?? a?.stageResult ?? '—';
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
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Candidate</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Role</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Client</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Stage</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">AI Result</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Score</th>
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
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {formatDate(item.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {item.candidateName ?? '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.role} <span className="text-slate-400">{item.level}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {item.clientName ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-500">
                    {STAGE_LABEL[item.stage] ?? item.stage}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {rec !== '—' ? (
                    <Badge className={RECOMMENDATION_STYLE[rec] ?? 'bg-slate-100 text-slate-600'}>
                      {rec.replace('_', ' ')}
                    </Badge>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
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