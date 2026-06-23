import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { clientsApi, getErrorMessage } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Search, X, GitMerge, Loader2 } from 'lucide-react';

type SortKey = 'name' | 'interviewCount' | 'hireRate' | 'requestCount' | 'lastInterviewAt';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function hireRateColor(rate: number) {
  if (rate >= 70) return { bg: '#EAF3DE', color: '#3B6D11' };
  if (rate >= 40) return { bg: '#FAEEDA', color: '#854F0B' };
  return { bg: '#FCEBEB', color: '#A32D2D' };
}

export function ClientsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const limit = 20;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('interviewCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [canonicalChoice, setCanonicalChoice] = useState('');
  const [newCanonical, setNewCanonical] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const [mergeMode, setMergeMode] = useState(false);
  const toggleMergeMode = () => {
    setMergeMode(prev => {
      if (prev) clearSelection();
      return !prev;
    });
  };

  const openMerge = () => {
    const first = [...selected][0] ?? '';
    setCanonicalChoice(first);
    setNewCanonical('');
    setMergeError(null);
    setMergeOpen(true);
  };

  const mergeMutation = useMutation({
    mutationFn: ({ canonical, aliases }: { canonical: string; aliases: string[] }) =>
      clientsApi.mergeClients(canonical, aliases).then(r => r.data),
    onSuccess: () => {
      setMergeOpen(false);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: err => setMergeError(getErrorMessage(err)),
  });

  const confirmMerge = () => {
    const canonical = (newCanonical.trim() || canonicalChoice).trim();
    if (!canonical) {
      setMergeError('Pick or type a canonical name.');
      return;
    }
    const aliases = [...selected].filter(n => n !== canonical);
    if (aliases.length === 0) {
      setMergeError('Select at least one other client to fold into the canonical name.');
      return;
    }
    setMergeError(null);
    mergeMutation.mutate({ canonical, aliases });
  };

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1" style={{ color: sortKey === k ? '#534AB7' : '#cbd5e1' }}>
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, limit],
    queryFn: () => clientsApi.getClients(page, limit).then(r => r.data),
  });

  const rawItems = data?.items ?? [];
  const total = data?.total ?? 0;

  const query = debouncedSearch.trim().toLowerCase();
  const filtered = query
    ? rawItems.filter(c => c.name.toLowerCase().includes(query))
    : rawItems;

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return mul * a.name.localeCompare(b.name);
    if (sortKey === 'interviewCount') return mul * (a.interviewCount - b.interviewCount);
    if (sortKey === 'hireRate') return mul * (a.hireRate - b.hireRate);
    if (sortKey === 'requestCount') return mul * (a.requestCount - b.requestCount);
    if (sortKey === 'lastInterviewAt') {
      const at = a.lastInterviewAt ? new Date(a.lastInterviewAt).getTime() : 0;
      const bt = b.lastInterviewAt ? new Date(b.lastInterviewAt).getTime() : 0;
      return mul * (at - bt);
    }
    return 0;
  });

  const hasNext = page * limit < total;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <span className="text-sm text-slate-400">
          {query ? `${sorted.length} of ${total}` : `${total} records`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by client name..."
            className="h-8 pl-8 pr-3 text-sm rounded-full border border-slate-200 outline-none w-64 transition-colors"
            style={search ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : { background: 'white', color: '#475569' }}
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="h-8 px-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
          >
            <X size={12} /> Clear
          </button>
        )}

        <button
          onClick={toggleMergeMode}
          className="ml-auto h-8 px-4 flex items-center gap-1.5 text-sm font-medium rounded-lg transition-colors"
          style={mergeMode
            ? { background: 'white', color: '#3D52D9', border: '1px solid #D9DEFB' }
            : { background: '#5067F4', color: 'white' }}
        >
          {mergeMode ? <X size={14} /> : <GitMerge size={14} />}
          {mergeMode ? 'Cancel' : 'Merge clients'}
        </button>
      </div>

      {mergeMode && (
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ background: '#EEF0FE', borderColor: '#D9DEFB' }}>
          <span className="text-sm font-medium" style={{ color: '#3D52D9' }}>
            {selected.size > 0 ? `${selected.size} selected` : 'Select 2 or more clients to merge'}
          </span>
          <Button
            size="sm"
            onClick={openMerge}
            disabled={selected.size < 2}
            className="h-8 gap-1.5"
          >
            <GitMerge size={14} />
            Merge into one client
          </Button>
          {selected.size > 0 && (
            <button
              onClick={clearSelection}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : !rawItems.length ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Clients appear here once they show up in Linear ticket titles."
        />
      ) : !sorted.length ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-slate-500">No clients match “{debouncedSearch}”.</p>
          <p className="text-xs text-slate-400 mt-1">Try a different name or clear the search.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                {mergeMode && <th className="w-[44px] px-3 py-3" />}
                <th
                  onClick={() => toggleSort('name')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[30%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Client<SortIcon k="name" />
                </th>
                <th
                  onClick={() => toggleSort('interviewCount')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Interviews<SortIcon k="interviewCount" />
                </th>
                <th
                  onClick={() => toggleSort('hireRate')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Hire Rate<SortIcon k="hireRate" />
                </th>
                <th
                  onClick={() => toggleSort('requestCount')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Requests<SortIcon k="requestCount" />
                </th>
                <th
                  onClick={() => toggleSort('lastInterviewAt')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[24%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Last Interview<SortIcon k="lastInterviewAt" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, idx) => {
                const rateStyle = hireRateColor(c.hireRate);
                return (
                  <tr
                    key={c.name}
                    onClick={() => mergeMode
                      ? toggleSelect(c.name)
                      : navigate({ to: '/clients/$name', params: { name: c.name } })}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: idx < sorted.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {mergeMode && (
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(c.name)}
                          onChange={() => toggleSelect(c.name)}
                          className="h-4 w-4 cursor-pointer accent-[#534AB7] align-middle"
                          aria-label={`Select ${c.name}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#EEF0FE', color: '#3D52D9' }}>
                          <Building2 size={14} />
                        </div>
                        <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.interviewCount}</td>
                    <td className="px-4 py-3">
                      {c.interviewCount > 0 ? (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: rateStyle.bg, color: rateStyle.color }}
                        >
                          {c.hireRate}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.requestCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {formatDate(c.lastInterviewAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(page > 1 || hasNext) && (
            <div className="flex items-center justify-center gap-3 p-3 border-t border-slate-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-400">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNext}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      <Dialog open={mergeOpen} onOpenChange={o => !o && setMergeOpen(false)}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge clients</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-1 py-2">
            <p className="text-sm text-slate-500">
              Pick the name to keep — the others fold into it. Interviews, requests and stats
              are grouped under it. You can undo this later from the client's page.
            </p>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Keep this name</span>
              <div className="space-y-1 rounded-md border border-slate-200 p-2 max-h-52 overflow-y-auto scrollbar-thin">
                {[...selected].map(name => (
                  <label
                    key={name}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="canonical"
                      checked={!newCanonical.trim() && canonicalChoice === name}
                      onChange={() => { setCanonicalChoice(name); setNewCanonical(''); }}
                      className="accent-[#534AB7]"
                    />
                    <span className="text-sm text-slate-700 truncate">{name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">
                Or type a new canonical name
              </span>
              <Input
                value={newCanonical}
                onChange={e => setNewCanonical(e.target.value)}
                placeholder="e.g. HAYS"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white"
              />
            </div>

            {mergeError && <p className="text-sm text-red-600">{mergeError}</p>}

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={confirmMerge} disabled={mergeMutation.isPending} className="gap-2">
                {mergeMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Merge {selected.size} clients
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
