import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { candidatesApi, interviewsApi, pipelineCandidatesApi, linearApi, preparationsApi, type PipelineCandidateItem, type PreparationItem } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search, X, FileText, Phone, MessageSquare, Settings, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { CreatePreparationDocModal } from '@/components/modals/CreatePreparationDocModal';

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

const TYPE_CONFIG = {
  call: { label: 'Call', icon: Phone, bg: '#FEF9EE', color: '#854F0B', border: '#F5E6C8' },
  message: { label: 'Message', icon: MessageSquare, bg: '#FEF9EE', color: '#854F0B', border: '#F5E6C8' },
  call_setup: { label: 'Call + Setup', icon: Settings, bg: '#EEF0FE', color: '#534AB7', border: '#D9DEFB' },
};

const RECENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fresh: { label: 'All good', color: '#3B6D11', bg: '#EAF3DE' },
  aging: { label: 'Time to re-prep', color: '#854F0B', bg: '#FEF3C7' },
  stale: { label: 'Re-prep needed', color: '#A32D2D', bg: '#FCEBEB' },
};


function CandidateCombobox({ value, onChange, candidates }: {
  value: string;
  onChange: (v: string) => void;
  candidates: string[];
}) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (inputValue.trim()) onChange(inputValue.trim());
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputValue, onChange]);

  const filtered = candidates.filter(name =>
    !inputValue || name.toLowerCase().includes(inputValue.toLowerCase())
  );
  const exactMatch = candidates.some(n => n.toLowerCase() === inputValue.trim().toLowerCase());
  const showNewOption = inputValue.trim().length > 0 && !exactMatch;

  const selectCandidate = (name: string) => {
    onChange(name);
    setInputValue(name);
    setIsOpen(false);
  };

  const avatar = value ? getAvatarColor(value) : null;

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        Candidate <span className="text-red-500">*</span>
      </label>
      <div className="relative" ref={wrapperRef}>
        <div className="flex items-center w-full h-10 rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-[#534AB7] transition-colors">
          {value && avatar && (
            <div
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ml-3"
              style={{ background: avatar.bg, color: avatar.color }}
            >
              {getInitials(value)}
            </div>
          )}
          <input
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setIsOpen(true); if (!e.target.value) onChange(''); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length === 1) selectCandidate(filtered[0]);
                else if (inputValue.trim()) selectCandidate(inputValue.trim());
              }
            }}
            placeholder="Type or select candidate..."
            className="flex-1 h-full px-3 text-sm outline-none bg-transparent"
          />
        </div>

        {isOpen && (filtered.length > 0 || showNewOption) && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-xl bg-white shadow-lg ring-1 ring-slate-200/70 p-1 max-h-52 overflow-y-auto">
            {filtered.map(name => {
              const av = getAvatarColor(name);
              return (
                <button
                  key={name}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectCandidate(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 text-left transition-colors"
                >
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium"
                    style={{ background: av.bg, color: av.color }}
                  >
                    {getInitials(name)}
                  </div>
                  {name}
                </button>
              );
            })}
            {showNewOption && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectCandidate(inputValue.trim())}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 text-left transition-colors border-t border-slate-100 mt-1 pt-2"
              >
                <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium bg-[#EEF0FE] text-[#534AB7]">+</div>
                <span>Add <strong>{inputValue.trim()}</strong> as new candidate</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreparationModal({ open, onOpenChange, editItem }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem?: PreparationItem | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editItem;

  const [candidate, setCandidate] = useState('');
  const [role, setRole] = useState('');
  const [date, setDate] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [type, setType] = useState<'message' | 'call' | 'call_setup'>('call_setup');

  const dateChanged = isEdit && date !== originalDate;

  useEffect(() => {
    if (open && editItem) {
      const d = editItem.preparationDate.split('T')[0];
      setCandidate(editItem.candidateName);
      setRole(editItem.linearIssueId);
      setDate(d);
      setOriginalDate(d);
      setType(editItem.type);
    } else if (open && !editItem) {
      setCandidate('');
      setRole('');
      setDate('');
      setOriginalDate('');
      setType('call_setup');
    }
  }, [open, editItem]);

  const { data: linearIssues } = useQuery({
    queryKey: ['linear-issues'],
    queryFn: () => linearApi.getIssues({ first: 100 }).then(r => r.data),
    enabled: open,
  });

  const { data: candidatesList } = useQuery({
    queryKey: ['candidates-list'],
    queryFn: () => candidatesApi.getList({ limit: 100 }).then(r =>
      [...new Set(r.data.map(c => c.candidateName))].sort()
    ),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const issue = linearIssues?.find(i => i.id === role);
      const payload = {
        candidateName: candidate,
        linearIssueId: role,
        linearIssueTitle: issue?.title ?? editItem?.linearIssueTitle ?? '',
        preparationDate: date,
        type,
      };
      if (isEdit && !dateChanged) return preparationsApi.update(editItem.id, { ...payload, isNewSession: false });
      if (isEdit && dateChanged) return preparationsApi.create(payload);
      return preparationsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] });
      queryClient.invalidateQueries({ queryKey: ['preparation-stats'] });
      onOpenChange(false);
    },
  });

  const canSave = !!candidate && !!role && !!date;

  const selectedAvatar = candidate ? getAvatarColor(candidate) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0" showCloseButton={true}>
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{isEdit ? 'Edit Preparation' : 'New Preparation'}</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {isEdit ? 'Update the preparation details' : 'Log a prep session you ran with a candidate before an interview'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Candidate */}
          <CandidateCombobox
            value={candidate}
            onChange={setCandidate}
            candidates={candidatesList ?? []}
          />

          {/* Role / Vacancy */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Role / Vacancy <span className="text-red-500">*</span>
            </label>
            <Select value={role || ALL} onValueChange={(v: string | null) => setRole(!v || v === ALL ? '' : v)}>
              <SelectTrigger className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                <SelectValue>{role ? (linearIssues?.find(i => i.id === role)?.title ?? role) : 'Select role...'}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-lg ring-slate-200/70 p-1 max-h-60 overflow-y-auto">
                <SelectItem value={ALL} className="rounded-lg text-slate-400">Select role...</SelectItem>
                {(linearIssues ?? []).map(issue => (
                  <SelectItem key={issue.id} value={issue.id} className="rounded-lg">
                    {issue.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preparation date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Preparation date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white outline-none focus:border-[#534AB7] transition-colors"
              />
            </div>
          </div>

          {/* Preparation type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Preparation type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'message' as const, label: 'Message', desc: 'Async written brief' },
                { value: 'call' as const, label: 'Call', desc: 'Voice prep session' },
                { value: 'call_setup' as const, label: 'Call + Setup', desc: 'Call + env / IDE setup' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-colors',
                    type === opt.value
                      ? 'border-[#534AB7] bg-[#F8F7FF]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    type === opt.value ? 'border-[#534AB7]' : 'border-slate-300'
                  )}>
                    {type === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-[#534AB7]" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-xl border-t px-6 py-4" style={{ background: '#EEEDFE' }}>
          <DialogClose render={
            <Button variant="outline" className="rounded-lg h-10 px-5 bg-white border-slate-200" />
          }>
            Cancel
          </DialogClose>
          <Button
            className="rounded-lg h-10 px-5 text-white disabled:opacity-50"
            style={{ background: '#534AB7' }}
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving...' : isEdit && dateChanged ? 'Save as new session' : isEdit ? 'Update preparation' : 'Save preparation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreparationTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [recencyFilter, setRecencyFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<PreparationItem | null>(null);
  const [prepDocModalOpen, setPrepDocModalOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['preparations', debouncedSearch, typeFilter, recencyFilter],
    queryFn: () => preparationsApi.list({
      search: debouncedSearch || undefined,
      type: typeFilter || undefined,
      recency: recencyFilter || undefined,
      limit: 50,
    }).then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => preparationsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preparations'] }),
  });

  const [deleteTarget, setDeleteTarget] = useState<PreparationItem | null>(null);
  const [historyCandidate, setHistoryCandidate] = useState<string | null>(null);

  const hasFilters = !!search || !!typeFilter || !!recencyFilter || !!dateFilter;
  const items = (data ?? []).filter(item => {
    if (!dateFilter) return true;
    const now = new Date();
    const prepDate = new Date(item.preparationDate);
    const diff = now.getTime() - prepDate.getTime();
    const DAY = 24 * 60 * 60 * 1000;
    if (dateFilter === 'week' && diff > 7 * DAY) return false;
    if (dateFilter === 'month' && diff > 30 * DAY) return false;
    if (dateFilter === '3months' && diff > 90 * DAY) return false;
    if (dateFilter === '6months' && diff > 180 * DAY) return false;
    if (dateFilter === 'year' && diff > 365 * DAY) return false;
    if (dateFilter === '2years' && diff > 730 * DAY) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by candidate..."
            className="h-8 pl-8 pr-3 text-sm rounded-full border border-slate-200 outline-none w-56 transition-colors"
            style={search ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : { background: 'white', color: '#475569' }}
          />
        </div>

        <FilterSelect
          filterKey="role"
          value={typeFilter}
          placeholder="All Types"
          options={[
            { value: 'call', label: 'Call' },
            { value: 'message', label: 'Message' },
            { value: 'call_setup', label: 'Call + Setup' },
          ]}
          onChange={v => setTypeFilter(v)}
          triggerClass="min-w-36"
        />

        <FilterSelect
          filterKey="result"
          value={recencyFilter}
          placeholder="All Recency"
          options={[
            { value: 'fresh', label: 'Fresh' },
            { value: 'aging', label: 'Aging' },
            { value: 're-prep needed', label: 'Re-prep needed' },
          ]}
          onChange={v => setRecencyFilter(v)}
          triggerClass="min-w-36"
        />

        <FilterSelect
          filterKey="role"
          value={dateFilter}
          placeholder="Any date"
          options={[
            { value: 'week', label: 'Last week' },
            { value: 'month', label: 'Last month' },
            { value: '3months', label: 'Last 3 months' },
            { value: '6months', label: 'Last 6 months' },
            { value: 'year', label: 'Last year' },
            { value: '2years', label: 'Last 2 years' },
          ]}
          onChange={v => setDateFilter(v)}
          triggerClass="min-w-32"
        />

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setRecencyFilter(''); setDateFilter(''); }}
            className="h-8 px-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
          >
            <X size={12} /> Clear
          </button>
        )}

        <div className="flex-1" />
        <button
          onClick={() => setPrepDocModalOpen(true)}
          className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center gap-2 bg-[#5067F4] hover:bg-[#3d52d9] transition-colors"
        >
          <FileText size={14} />
          Create prep doc
        </button>
        <button
          onClick={() => setModalOpen(true)}
          className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center gap-2 bg-[#5067F4] hover:bg-[#3d52d9] transition-colors"
        >
          + New Preparation
        </button>
      </div>

      <CreatePreparationDocModal
        open={prepDocModalOpen}
        onClose={() => setPrepDocModalOpen(false)}
      />

      <PreparationModal
        open={modalOpen}
        onOpenChange={open => { setModalOpen(open); if (!open) setEditItem(null); }}
        editItem={editItem}
      />

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-[640px] p-0 gap-0" showCloseButton={false}>
          <div className="p-6 space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Delete preparation?</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                This action cannot be undone. The following record will be removed:
              </DialogDescription>
            </DialogHeader>

            {deleteTarget && (() => {
              const av = getAvatarColor(deleteTarget.candidateName);
              const tc = TYPE_CONFIG[deleteTarget.type];
              const rc = RECENCY_CONFIG[deleteTarget.recency] ?? RECENCY_CONFIG.fresh;
              const TIcon = tc.icon;
              return (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#FAFAFA' }}>
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{ background: av.bg, color: av.color }}
                    >
                      {getInitials(deleteTarget.candidateName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{deleteTarget.candidateName}</div>
                      <div className="text-xs text-slate-400 truncate">{deleteTarget.linearIssueTitle}</div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}
                    >
                      <TIcon size={10} />{tc.label}
                    </span>
                    <span
                      className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: rc.bg, color: rc.color }}
                    >
                      {rc.label}
                    </span>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                    {formatDate(deleteTarget.preparationDate)}
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center justify-end gap-3 rounded-b-xl border-t px-6 py-4 bg-slate-50">
            <DialogClose render={
              <Button variant="outline" className="rounded-lg h-9 px-4 bg-white border-slate-200" />
            }>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              className="rounded-lg h-9 px-4"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyCandidate} onOpenChange={open => { if (!open) setHistoryCandidate(null); }}>
        <DialogContent className="sm:max-w-[640px] p-0 gap-0" showCloseButton={true}>
          <div className="p-6 pb-0">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Preparation History</DialogTitle>
              <DialogDescription className="text-sm text-slate-400">
                All preparation sessions for {historyCandidate}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            {(() => {
              const historyItems = (items ?? []).filter(i => i.candidateName === historyCandidate);
              if (!historyItems.length) return <p className="text-sm text-slate-400 text-center py-4">No records found</p>;
              return (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#3D52D9' }}>Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#3D52D9' }}>Candidate</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#3D52D9' }}>Vacancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.map((h, idx) => {
                        const av = getAvatarColor(h.candidateName);
                        return (
                          <tr
                            key={h.id}
                            style={{ borderBottom: idx < historyItems.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                          >
                            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                              {formatDate(h.preparationDate)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium"
                                  style={{ background: av.bg, color: av.color }}
                                >
                                  {getInitials(h.candidateName)}
                                </div>
                                <span className="text-sm font-medium truncate">{h.candidateName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                              {h.linearIssueTitle}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <div className={cn('transition-all duration-200', (modalOpen || !!deleteTarget || !!historyCandidate) && 'blur-sm pointer-events-none')}>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : !items.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <p className="text-base font-medium text-slate-600">No preparations yet</p>
          <p className="text-sm text-slate-400 mt-1">Click "+ New Preparation" to create the first one</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Candidate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[28%]" style={{ color: '#3D52D9' }}>Role / Vacancy</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[16%]" style={{ color: '#3D52D9' }}>Recency</th>
                <th className="px-4 py-3 w-[10%]" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const avatar = getAvatarColor(item.candidateName);
                const typeConf = TYPE_CONFIG[item.type];
                const recConf = RECENCY_CONFIG[item.recency] ?? RECENCY_CONFIG.fresh;
                const TypeIcon = typeConf.icon;

                return (
                  <tr
                    key={item.id}
                    onClick={() => setHistoryCandidate(item.candidateName)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: idx < items.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {formatDate(item.preparationDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                          style={{ background: avatar.bg, color: avatar.color }}
                        >
                          {getInitials(item.candidateName)}
                        </div>
                        <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {item.candidateName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.linearIssueTitle}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: typeConf.bg, color: typeConf.color, border: `1px solid ${typeConf.border}` }}
                      >
                        <TypeIcon size={12} />
                        {typeConf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full"
                        style={{ background: recConf.bg, color: recConf.color }}
                      >
                        {recConf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          className="p-1.5 rounded-md hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                          onClick={e => { e.stopPropagation(); setEditItem(item); setModalOpen(true); }}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="p-1.5 rounded-md hover:bg-red-50 transition-colors text-red-300 hover:text-red-500"
                          onClick={e => { e.stopPropagation(); setDeleteTarget(item); }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
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
  const [activeTab, setActiveTab] = useState<'analyzed' | 'pipeline' | 'preparation'>('analyzed');
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
        <button
          onClick={() => setActiveTab('preparation')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'preparation'
              ? 'border-[#534AB7] text-[#534AB7]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Preparation
        </button>
      </div>

      {activeTab === 'pipeline' && <PipelineTab />}
      {activeTab === 'preparation' && <PreparationTab />}

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