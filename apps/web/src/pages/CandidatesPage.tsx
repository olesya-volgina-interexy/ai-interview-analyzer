import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { candidatesApi, interviewsApi, pipelineCandidatesApi, type PipelineCandidateItem } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const AVATAR_COLORS = [
  { bg: '#E6F1FB', color: '#185FA5' },
  { bg: '#EEEDFE', color: '#534AB7' },
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#FAEEDA', color: '#854F0B' },
  { bg: '#E1F5EE', color: '#0F6E56' },
  { bg: '#FBEAF0', color: '#993556' },
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

const ACTIVE_COLORS: Record<string, string> = {
  role:   '#534AB7',
  result: '#3B6D11',
};

const ALL = '__all__';

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

function PipelineTab() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [hasInterviews, setHasInterviews] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
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

  const hasFilters = !!roleFilter || !!clientFilter || !!hasInterviews || !!search;
  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="h-8 pl-8 pr-3 text-sm rounded-full border border-slate-200 outline-none w-52 transition-colors"
            style={search ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : { background: 'white', color: '#475569' }}
          />
        </div>

        <FilterSelect
          filterKey="role"
          value={roleFilter}
          placeholder="All Roles"
          options={(roles && roles.length > 0
            ? roles
            : ['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile']
          ).map(r => ({ value: r, label: r }))}
          onChange={v => { setRoleFilter(v); setPage(1); }}
          triggerClass="min-w-40"
        />

        <FilterSelect
          filterKey="result"
          value={hasInterviews}
          placeholder="Has interviews: All"
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          onChange={v => { setHasInterviews(v); setPage(1); }}
          triggerClass="min-w-40"
        />

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); setClientFilter(''); setHasInterviews(''); setPage(1); }}
            className="h-8 px-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
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
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%]" style={{ color: '#3D52D9' }}>Level</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>CV Sent</th>
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
                    <td className="px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.role ?? '—'}</td>
                    <td className="px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{c.clientName ?? '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.level ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
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
                disabled={items.length <= limit}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

function FilterSelect({
  filterKey, value, options, placeholder, onChange, triggerClass,
}: {
  filterKey: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string) => void;
  triggerClass?: string;
}) {
  const isActive = !!value;
  const color = ACTIVE_COLORS[filterKey] ?? '#334155';
  const activeLabel = isActive
    ? options.find(o => o.value === value)?.label ?? value
    : placeholder;

  return (
    <Select
      value={value || ALL}
      onValueChange={(v: string | null) => onChange(!v || v === ALL ? '' : v)}
    >
      <SelectTrigger
        className={cn(
          'h-8 w-auto rounded-full border px-3 text-sm transition-colors',
          isActive
            ? 'border-transparent text-white hover:opacity-90 [&_svg]:!text-white/70'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&_svg]:!text-slate-400',
          triggerClass
        )}
        style={isActive ? { background: color, color: 'white' } : undefined}
      >
        <SelectValue>{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-xl shadow-lg ring-slate-200/70 p-1 min-w-40">
        <SelectItem value={ALL} className="rounded-lg text-slate-500">
          {placeholder}
        </SelectItem>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="rounded-lg">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CandidatesPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'analyzed' | 'pipeline'>('analyzed');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const fetchLimit = limit + 1;
  const [roleFilter, setRoleFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [sortKey, setSortKey] = useState<'totalInterviews' | 'avgScore' | 'lastInterviewAt'>('lastInterviewAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1" style={{ color: sortKey === k ? '#534AB7' : '#cbd5e1' }}>
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const { data, isLoading } = useQuery({
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

  const hasFilters = !!roleFilter || !!resultFilter || !!search;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Candidates</h1>
        {activeTab === 'analyzed' && <span className="text-sm text-slate-400">{data?.length ?? 0} records</span>}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('analyzed')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'analyzed'
              ? 'border-[#534AB7] text-[#534AB7]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Analyzed
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'pipeline'
              ? 'border-[#534AB7] text-[#534AB7]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          In Pipeline
        </button>
      </div>

      {activeTab === 'pipeline' && <PipelineTab />}

      {activeTab === 'analyzed' && <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="h-8 pl-8 pr-3 text-sm rounded-full border border-slate-200 outline-none w-52 transition-colors"
              style={search ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : { background: 'white', color: '#475569' }}
            />
          </div>

          <FilterSelect
            filterKey="role"
            value={roleFilter}
            placeholder="All Roles"
            options={(roles && roles.length > 0
              ? roles
              : ['Backend','Frontend','Fullstack','DevOps','QA','Mobile']
            ).map(r => ({ value: r, label: r }))}
            onChange={v => { setRoleFilter(v); setPage(1); }}
            triggerClass="min-w-96"
          />

          <FilterSelect
            filterKey="result"
            value={resultFilter}
            placeholder="All Results"
            options={[
              { value: 'hired', label: 'Hired' },
              { value: 'not_hired', label: 'Not Hired' },
            ]}
            onChange={v => { setResultFilter(v); setPage(1); }}
            triggerClass="min-w-40"
          />

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setRoleFilter(''); setResultFilter(''); setPage(1); }}
              className="h-8 px-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
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
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[28%]" style={{ color: '#3D52D9' }}>Roles</th>
                <th
                  onClick={() => toggleSort('totalInterviews')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Interviews<SortIcon k="totalInterviews" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%]" style={{ color: '#3D52D9' }}>Hired</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%]" style={{ color: '#3D52D9' }}>Rejected</th>
                <th
                  onClick={() => toggleSort('avgScore')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[10%] cursor-pointer select-none"
                  style={{ color: '#3D52D9' }}
                >
                  Score<SortIcon k="avgScore" />
                </th>
                <th
                  onClick={() => toggleSort('lastInterviewAt')}
                  className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[12%] cursor-pointer select-none"
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
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      {c.successful > 0
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#EAF3DE', color: '#3B6D11' }}>{c.successful}</span>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.failed > 0
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#A32D2D' }}>{c.failed}</span>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.avgScore !== null
                        ? <><span className="font-medium" style={{ color: scoreColor }}>{c.avgScore}</span><span style={{ color: 'var(--color-text-tertiary)' }}>/100</span></>
                        : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {formatDate(c.lastInterviewAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(page > 1 || (data && data.length > limit)) && (
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
                disabled={(data?.length ?? 0) <= limit}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}