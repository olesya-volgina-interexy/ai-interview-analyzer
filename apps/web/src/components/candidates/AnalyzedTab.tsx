import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { candidatesApi, interviewsApi, getErrorMessage } from '@/api/client';
import { formatDate } from '@/lib/format';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { PaginationFooter } from '@/components/ui/PaginationFooter';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

export function AnalyzedTab() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const fetchLimit = limit + 1;
  const [roleFilter, setRoleFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [sortKey, setSortKey] = useState<'totalInterviews' | 'avgScore' | 'lastInterviewAt'>('lastInterviewAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const debouncedSearch = useDebouncedValue(search, 300);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1" style={{ color: sortKey === k ? '#534AB7' : '#cbd5e1' }}>
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['candidates', debouncedSearch, page, roleFilter, resultFilter],
    queryFn: () => candidatesApi.getList({
      search: debouncedSearch || undefined,
      page,
      limit: fetchLimit,
      role: roleFilter || undefined,
      result: (resultFilter as any) || undefined,
    }).then(r => r.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['interviews', 'roles'],
    queryFn: () => interviewsApi.getRoles().then(r => r.data),
  });

  const sorted = [...(data ?? [])].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'lastInterviewAt') return mul * (new Date(a.lastInterviewAt).getTime() - new Date(b.lastInterviewAt).getTime());
    if (sortKey === 'avgScore') return mul * ((a.avgScore ?? -1) - (b.avgScore ?? -1));
    if (sortKey === 'totalInterviews') return mul * (a.totalInterviews - b.totalInterviews);
    return 0;
  });

  return (
    <>
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name..."
        activeCount={[roleFilter, resultFilter].filter(Boolean).length}
        onClear={() => { setSearch(''); setRoleFilter(''); setResultFilter(''); setPage(1); }}
        filters={
          <>
            <FilterSelect
              activeColor="#534AB7"
              value={roleFilter || undefined}
              placeholder="All Roles"
              options={(roles && roles.length > 0
                ? roles
                : ['Backend','Frontend','Fullstack','DevOps','QA','Mobile']
              ).map(r => ({ value: r, label: r }))}
              onChange={v => { setRoleFilter(v ?? ''); setPage(1); }}
              triggerClass="w-full sm:w-auto sm:min-w-96"
            />

            <FilterSelect
              activeColor="#3B6D11"
              value={resultFilter || undefined}
              placeholder="All Results"
              options={[
                { value: 'hired', label: 'Hired' },
                { value: 'not_hired', label: 'Not Hired' },
              ]}
              onChange={v => { setResultFilter(v ?? ''); setPage(1); }}
              triggerClass="w-full sm:w-auto sm:min-w-40"
            />
          </>
        }
      />

    {isError ? (
      <ErrorMessage error={getErrorMessage(error)} onRetry={() => refetch()} />
    ) : isLoading ? (
      <TableSkeleton />
    ) : !sorted.length ? (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-slate-500">No candidates found.</p>
      </div>
    ) : (
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[22%]" style={{ color: '#3D52D9' }}>Candidate</th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[28%]" style={{ color: '#3D52D9' }}>Roles</th>
              <th
                onClick={() => toggleSort('totalInterviews')}
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%] cursor-pointer select-none"
                style={{ color: '#3D52D9' }}
              >
                Interviews<SortIcon k="totalInterviews" />
              </th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%]" style={{ color: '#3D52D9' }}>Hired</th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%]" style={{ color: '#3D52D9' }}>Rejected</th>
              <th
                onClick={() => toggleSort('avgScore')}
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%] cursor-pointer select-none"
                style={{ color: '#3D52D9' }}
              >
                Score<SortIcon k="avgScore" />
              </th>
              <th
                onClick={() => toggleSort('lastInterviewAt')}
                className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%] cursor-pointer select-none"
                style={{ color: '#3D52D9' }}
              >
                Last<SortIcon k="lastInterviewAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((c, idx) => {
              const avatar = getAvatarColor(c.candidateName);
              const scoreColor = c.avgScore !== null
                ? c.avgScore >= 80 ? '#3B6D11' : c.avgScore >= 60 ? '#854F0B' : '#A32D2D'
                : undefined;

              return (
                <tr
                  key={c.candidateName}
                  onClick={() => navigate({ to: '/candidates/$name', params: { name: c.candidateName } })}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: idx < sorted.slice(0, limit).length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: avatar.bg, color: avatar.color }}
                      >
                        {getInitials(c.candidateName)}
                      </div>
                      <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {c.candidateName}
                      </span>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.roles.slice(0, 2).map(r => (
                        <span key={r} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#e8edf1', color: '#4b4b4b' }}>
                          {r}
                        </span>
                      ))}
                      {c.roles.length > 2 && (
                        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>+{c.roles.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.totalInterviews}</td>
                  <td className="hidden md:table-cell px-4 py-3">
                    {c.successful > 0
                      ? <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#EAF3DE', color: '#3B6D11' }}>{c.successful}</span>
                      : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    {c.failed > 0
                      ? <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#A32D2D' }}>{c.failed}</span>
                      : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.avgScore !== null
                      ? <><span className="font-medium" style={{ color: scoreColor }}>{c.avgScore}</span><span style={{ color: 'var(--color-text-tertiary)' }}>/100</span></>
                      : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                    {formatDate(c.lastInterviewAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(page > 1 || (data && data.length > limit)) && (
          <PaginationFooter page={page} hasNext={(data?.length ?? 0) > limit} onPageChange={setPage} />
        )}
      </div>
    )}
    </>
  );
}
