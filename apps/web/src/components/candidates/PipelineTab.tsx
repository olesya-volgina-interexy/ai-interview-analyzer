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

const STAGE_LABELS: Record<string, string> = {
  manager_call: 'Manager Call',
  technical: 'Technical',
  final_result: 'Final',
};

function PipelineBadge({ item }: { item: PipelineCandidateItem }) {
  if (item.interviewCount === 0) {
    return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#94a3b8' }}>No interviews yet</span>;
  }
  if (item.lastDecision === 'hired') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EAF3DE', color: '#3B6D11' }}>Hired</span>;
  }
  if (item.lastDecision === 'rejected') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#FCEBEB', color: '#A32D2D' }}>Rejected</span>;
  }
  if (item.lastStage === 'technical') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEEDFE', color: '#534AB7' }}>Technical</span>;
  }
  if (item.lastStage === 'manager_call') {
    return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E6F1FB', color: '#185FA5' }}>Manager Call</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>{STAGE_LABELS[item.lastStage ?? ''] ?? item.lastStage}</span>;
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
      limit: limit + 1,
    }).then(r => r.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['interviews', 'roles'],
    queryFn: () => interviewsApi.getRoles().then(r => r.data),
  });

  const items = data ?? [];

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
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Client</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%]" style={{ color: '#3D52D9' }}>Level</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>CV Sent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[16%]" style={{ color: '#3D52D9' }}>Interview Status</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, limit).map((c, idx) => {
                const name = c.candidateName ?? '—';
                const avatar = getAvatarColor(name);
                return (
                  <tr
                    key={c.id}
                    className="transition-colors"
                    style={{ borderBottom: idx < items.slice(0, limit).length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
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
                      {formatDate(c.cvSubmittedAt)}
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
