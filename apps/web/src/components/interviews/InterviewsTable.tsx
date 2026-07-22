import type { InterviewListItem } from '@/api/client';
import { formatDate } from '@/lib/format';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { PaginationFooter } from '@/components/ui/PaginationFooter';

const RESULT_STYLE: Record<string, { bg: string; color: string }> = {
  hire:     { bg: '#EAF3DE', color: '#3B6D11' },
  hired:    { bg: '#EAF3DE', color: '#3B6D11' },
  passed:   { bg: '#E6F1FB', color: '#185FA5' },
  rejected: { bg: '#FCEBEB', color: '#A32D2D' },
  no_hire:  { bg: '#FCEBEB', color: '#A32D2D' },
  uncertain:{ bg: '#FAEEDA', color: '#854F0B' },
  on_hold:  { bg: '#F1EFE8', color: '#5F5E5A' },
};

const STAGE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  manager_call: { bg: '#E6F1FB', color: '#185FA5', label: 'Manager Call' },
  technical:    { bg: '#F1EFE8', color: '#5F5E5A', label: 'Technical' },
  final_result: { bg: '#EEEDFE', color: '#534AB7', label: 'Final Result' },
};

function getRecommendation(item: InterviewListItem): string {
  const a = item.analysis as any;
  if (item.stage === 'manager_call') return a?.stageResult ?? '—';
  if (item.stage === 'technical')    return a?.recommendation ?? '—';
  return a?.decision ?? '—';
}

interface InterviewsTableProps {
  data: InterviewListItem[];
  isLoading: boolean;
  onRowClick: (id: string) => void;
  page?: number;
  hasNext?: boolean;
  onPageChange?: (page: number) => void;
}

export function InterviewsTable({ data, isLoading, onRowClick, page, hasNext, onPageChange }: InterviewsTableProps) {
  const showPagination = !!onPageChange && page !== undefined && (page > 1 || hasNext);

  if (isLoading) {
    return <TableSkeleton />;
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
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
            <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[11%]" style={{ color: '#3D52D9' }}>Date</th>
            <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[20%]" style={{ color: '#3D52D9' }}>Candidate</th>
            <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[17%]" style={{ color: '#3D52D9' }}>Role</th>
            <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[13%]" style={{ color: '#3D52D9' }}>Client</th>
            <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[11%]" style={{ color: '#3D52D9' }}>Manager</th>
            <th className="hidden md:table-cell text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[13%]" style={{ color: '#3D52D9' }}>Stage</th>
            <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[11%]" style={{ color: '#3D52D9' }}>Result</th>
            <th className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wide md:w-[8%]" style={{ color: '#3D52D9' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => {
            const rec = getRecommendation(item);
            const score = (item.analysis as any)?.score;
            const resultStyle = RESULT_STYLE[rec];
            const stageStyle = STAGE_STYLE[item.stage];
            const name = item.candidateName;
            const avatarColor = name ? getAvatarColor(name) : null;

            return (
              <tr
                key={item.id}
                onClick={() => onRowClick(item.id)}
                className="cursor-pointer transition-colors"
                style={{
                  borderBottom: idx < data.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="hidden md:table-cell px-3 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatDate(item.analysisDate ?? item.createdAt)}
                </td>
                <td className="px-3 py-3 max-w-0">
                  <div className="flex items-center gap-2">
                    {name && avatarColor ? (
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: avatarColor.bg, color: avatarColor.color }}
                      >
                        {getInitials(name)}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full overflow-hidden" style={{ background: '#d7d7d7' }}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="8" r="4" fill="#ededed" />
                          <ellipse cx="12" cy="19" rx="7" ry="5" fill="#ededed" />
                        </svg>
                      </div>
                    )}
                    <span className="font-medium truncate" style={{ color: name ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                      {name ?? '—'}
                    </span>
                  </div>
                </td>
                <td className="hidden md:table-cell px-3 py-3 truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {item.role} <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{item.level}</span>
                </td>
                <td className="hidden md:table-cell px-3 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.clientName ?? '—'}
                </td>
                <td className="hidden md:table-cell px-3 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.managerName ?? '—'}
                </td>
                <td className="hidden md:table-cell px-3 py-3">
                  {stageStyle ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: stageStyle.bg, color: stageStyle.color }}
                    >
                      {stageStyle.label}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{item.stage}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {rec !== '—' && resultStyle ? (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: resultStyle.bg, color: resultStyle.color }}
                    >
                      {rec.replace('_', ' ')}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {score !== undefined
                    ? <><span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{score}</span><span style={{ color: 'var(--color-text-tertiary)' }}>/100</span></>
                    : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showPagination && (
        <PaginationFooter page={page ?? 1} hasNext={!!hasNext} onPageChange={onPageChange!} />
      )}
    </div>
  );
}