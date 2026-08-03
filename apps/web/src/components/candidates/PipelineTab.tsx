import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { interviewsApi, pipelineCandidatesApi, getErrorMessage, type PipelineCandidateItem } from '@/api/client';
import { formatDate } from '@/lib/format';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { PaginationFooter } from '@/components/ui/PaginationFooter';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

const STAGE_PILLS: Record<string, { label: string; bg: string; color: string }> = {
  manager_call: { label: 'Manager Call', bg: '#E6F1FB', color: '#185FA5' },
  technical: { label: 'Technical', bg: '#EEEDFE', color: '#534AB7' },
  final_result: { label: 'Final', bg: '#f1f5f9', color: '#64748b' },
};

// Финальную стадию подписываем исходом, а не словом "Final" — оно ничего
// не говорит о результате.
const DECISION_PILLS: Record<string, { label: string; bg: string; color: string }> = {
  hired: { label: 'Hired', bg: '#EAF3DE', color: '#3B6D11' },
  rejected: { label: 'Rejected', bg: '#FCEBEB', color: '#A32D2D' },
};

// Дата последнего прикрепления резюме. Если резюме на эту вакансию присылали
// несколько раз, строка свёрнута (см. группировку в /pipeline-candidates) —
// показываем счётчик, а полный список дат отдаём по наведению.
// dropUp — у обёртки таблицы overflow-hidden, поэтому для нижних строк
// раскрываем список вверх, иначе он обрезается.
function CvSentCell({ item, dropUp }: { item: PipelineCandidateItem; dropUp: boolean }) {
  const count = item.cvCount ?? 1;
  if (count <= 1) return <>{formatDate(item.cvSubmittedAt)}</>;

  return (
    <span className="group relative inline-flex items-center gap-1.5">
      <span>{formatDate(item.cvSubmittedAt)}</span>
      <span
        className="inline-flex items-center justify-center rounded-full px-1.5 font-medium cursor-default"
        style={{ background: '#EEEDFE', color: '#534AB7', fontSize: 10, minWidth: 18, lineHeight: '16px' }}
      >
        ×{count}
      </span>
      <span
        className={`pointer-events-none absolute left-0 z-20 hidden min-w-44 rounded-lg border p-2.5 shadow-lg group-hover:block ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        style={{ background: 'var(--color-background-primary, #fff)', borderColor: '#D9DEFB' }}
      >
        <span className="block font-semibold" style={{ color: '#3D52D9', fontSize: 10 }}>
          {count} CVs sent for this vacancy
        </span>
        {item.cvSubmittedDates?.map((d, i) => (
          <span key={d + i} className="mt-1 block whitespace-nowrap" style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
            {formatDate(d)}
            {i === 0 && <span style={{ color: 'var(--color-text-tertiary)' }}> · latest</span>}
          </span>
        ))}
      </span>
    </span>
  );
}

function PipelineBadge({ item }: { item: PipelineCandidateItem }) {
  const stages = item.stages ?? [];
  if (!stages.length) {
    return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#94a3b8' }}>No interviews yet</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {stages.map(({ stage, decision }) => {
        const pill =
          (stage === 'final_result' && decision ? DECISION_PILLS[decision] : null) ??
          STAGE_PILLS[stage] ??
          { label: stage, bg: '#f1f5f9', color: '#64748b' };
        return (
          <span
            key={stage}
            className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
            style={{ background: pill.bg, color: pill.color }}
          >
            {pill.label}
          </span>
        );
      })}
    </div>
  );
}

export function PipelineTab() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [hasInterviews, setHasInterviews] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const debouncedSearch = useDebouncedValue(search, 300);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['pipeline-candidates', debouncedSearch, roleFilter, clientFilter, hasInterviews, page],
    queryFn: () => pipelineCandidatesApi.getList({
      search: debouncedSearch || undefined,
      role: roleFilter || undefined,
      clientName: clientFilter || undefined,
      hasInterviews: (hasInterviews as any) || undefined,
      page,
      limit,
    }).then(r => r.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['interviews', 'roles'],
    queryFn: () => interviewsApi.getRoles().then(r => r.data),
  });

  const items = data ?? [];
  const visible = items.slice(0, limit);

  return (
    <div className="space-y-4">
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name..."
        activeCount={[roleFilter, hasInterviews].filter(Boolean).length}
        onClear={() => { setSearch(''); setRoleFilter(''); setClientFilter(''); setHasInterviews(''); setPage(1); }}
        filters={
          <>
            <FilterSelect
              activeColor="#534AB7"
              value={roleFilter || undefined}
              placeholder="All Roles"
              options={(roles && roles.length > 0
                ? roles
                : ['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile']
              ).map(r => ({ value: r, label: r }))}
              onChange={v => { setRoleFilter(v ?? ''); setPage(1); }}
              triggerClass="w-full sm:w-auto sm:min-w-40"
            />

            <FilterSelect
              activeColor="#3B6D11"
              value={hasInterviews || undefined}
              placeholder="Has interviews: All"
              options={[
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]}
              onChange={v => { setHasInterviews(v ?? ''); setPage(1); }}
              triggerClass="w-full sm:w-auto sm:min-w-40"
            />
          </>
        }
      />

      {isError ? (
        <ErrorMessage error={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton />
      ) : !items.length ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-slate-500">No pipeline candidates found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[22%]" style={{ color: '#3D52D9' }}>Name</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Role</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[16%]" style={{ color: '#3D52D9' }}>Client</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[9%]" style={{ color: '#3D52D9' }}>Level</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[13%]" style={{ color: '#3D52D9' }}>CV Sent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[22%]" style={{ color: '#3D52D9' }}>Interview Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c, idx) => {
                const name = c.candidateName ?? '—';
                const avatar = getAvatarColor(name);
                return (
                  <tr
                    key={c.id}
                    className="transition-colors"
                    style={{ borderBottom: idx < visible.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                          style={{ background: avatar.bg, color: avatar.color }}
                        >
                          {c.candidateName ? getInitials(c.candidateName) : '?'}
                        </div>
                        <a
                          href={c.cvUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium truncate hover:underline"
                          style={{ color: 'var(--color-text-primary)' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {name}
                        </a>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.role ?? '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.clientName ?? '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.level ?? '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      <CvSentCell item={c} dropUp={visible.length > 3 && idx >= visible.length - 3} />
                    </td>
                    <td className="px-4 py-3">
                      <PipelineBadge item={c} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(page > 1 || items.length > limit) && (
            <PaginationFooter page={page} hasNext={items.length > limit} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}
