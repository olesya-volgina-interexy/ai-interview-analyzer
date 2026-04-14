import { useState, useEffect  } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { candidatesApi } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function CandidatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const fetchLimit = limit + 1;
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<'all' | 'hired' | 'not_hired'>('all');
  const [sortKey, setSortKey] = useState<'totalInterviews' | 'avgScore' | 'lastInterviewAt'>('lastInterviewAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1 text-slate-300">
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', debouncedSearch, page],
    queryFn: () => candidatesApi.getList({
      search: debouncedSearch || undefined,
      page,
      limit: fetchLimit,
    }).then(r => r.data),
  });

  const filtered = (data ?? []).filter(c => {
    if (roleFilter && !c.roles.includes(roleFilter)) return false;
    if (resultFilter === 'hired' && c.successful === 0) return false;
    if (resultFilter === 'not_hired' && c.successful > 0) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'lastInterviewAt') return mul * (new Date(a.lastInterviewAt).getTime() - new Date(b.lastInterviewAt).getTime());
    if (sortKey === 'avgScore') return mul * ((a.avgScore ?? -1) - (b.avgScore ?? -1));
    if (sortKey === 'totalInterviews') return mul * (a.totalInterviews - b.totalInterviews);
    return 0;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Candidates</h1>
        <span className="text-sm text-slate-500">{data?.length ?? 0} records</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="pl-8 h-8 text-sm"
          />
        </div>

        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-600"
        >
          <option value="">All Roles</option>
          {['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={resultFilter}
          onChange={e => { setResultFilter(e.target.value as any); setPage(1); }}
          className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-600"
        >
          <option value="all">All Results</option>
          <option value="hired">Hired</option>
          <option value="not_hired">Not Hired</option>
        </select>

        {(roleFilter || resultFilter !== 'all') && (
          <button
            onClick={() => { setRoleFilter(''); setResultFilter('all'); setPage(1); }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : !data?.length ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-slate-500">No candidates found.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[20%]">Candidate</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[27%]">Roles</th>
                <th
                  onClick={() => toggleSort('totalInterviews')}
                  className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[12%] cursor-pointer hover:text-slate-700 select-none"
                >
                  Interviews<SortIcon k="totalInterviews" />
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[11%]">Hired</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[11%]">Rejected</th>
                <th
                  onClick={() => toggleSort('avgScore')}
                  className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[10%] cursor-pointer hover:text-slate-700 select-none"
                >
                  Avg Score<SortIcon k="avgScore" />
                </th>
                <th
                  onClick={() => toggleSort('lastInterviewAt')}
                  className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide w-[12%] cursor-pointer hover:text-slate-700 select-none"
                >
                  Last Interview<SortIcon k="lastInterviewAt" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.slice(0, limit).map(c => (
                <tr
                  key={c.candidateName}
                  onClick={() => navigate({ to: '/candidates/$name', params: { name: c.candidateName } })}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 font-medium text-slate-900 truncate">
                    {c.candidateName}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.roles.slice(0, 2).map(r => (
                        <Badge key={r} className="bg-slate-100 text-slate-600 text-xs">{r}</Badge>
                      ))}
                      {c.roles.length > 2 && (
                        <span className="text-xs text-slate-400">+{c.roles.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{c.totalInterviews}</td>
                  <td className="px-3 py-3">
                    {c.successful > 0
                      ? <span className="text-green-600 font-medium">{c.successful}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {c.failed > 0
                      ? <span className="text-red-500 font-medium">{c.failed}</span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {c.avgScore !== null ? `${c.avgScore}/100` : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                    {formatDate(c.lastInterviewAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(page > 1 || (data && data.length > limit)) && (
                <div className="flex items-center justify-center gap-3 pt-2">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    ← Previous
                </button>
                <span className="text-sm text-slate-500">Page {page}</span>
                <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(data?.length ?? 0) < limit}
                    className="text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    Next →
                </button>
                </div>
            )}
        </div>
      )}
    </div>
  );
}