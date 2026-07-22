import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { preparationsApi, getErrorMessage, type PreparationItem } from '@/api/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { PREP_TYPE_CONFIG as TYPE_CONFIG } from '@/lib/badges';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { CreatePreparationDocModal } from '@/components/modals/CreatePreparationDocModal';
import { FilterBar } from '@/components/ui/FilterBar';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { PreparationModal } from './PreparationModal';

const RECENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fresh: { label: 'All good', color: '#3B6D11', bg: '#EAF3DE' },
  aging: { label: 'Time to re-prep', color: '#854F0B', bg: '#FEF3C7' },
  stale: { label: 'Re-prep needed', color: '#A32D2D', bg: '#FCEBEB' },
};

export function PreparationTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [recencyFilter, setRecencyFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<PreparationItem | null>(null);
  const [prepDocModalOpen, setPrepDocModalOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
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
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by candidate..."
        activeCount={[typeFilter, recencyFilter, dateFilter].filter(Boolean).length}
        onClear={() => { setSearch(''); setTypeFilter(''); setRecencyFilter(''); setDateFilter(''); }}
        filters={
          <>
            <FilterSelect
              activeColor="#534AB7"
              value={typeFilter || undefined}
              placeholder="All Types"
              options={[
                { value: 'call', label: 'Call' },
                { value: 'message', label: 'Message' },
                { value: 'call_setup', label: 'Call + Setup' },
              ]}
              onChange={v => setTypeFilter(v ?? '')}
              triggerClass="w-full sm:w-auto sm:min-w-36"
            />

            <FilterSelect
              activeColor="#3B6D11"
              value={recencyFilter || undefined}
              placeholder="All Recency"
              options={[
                { value: 'fresh', label: 'Fresh' },
                { value: 'aging', label: 'Aging' },
                { value: 're-prep needed', label: 'Re-prep needed' },
              ]}
              onChange={v => setRecencyFilter(v ?? '')}
              triggerClass="w-full sm:w-auto sm:min-w-36"
            />

            <FilterSelect
              activeColor="#534AB7"
              value={dateFilter || undefined}
              placeholder="Any date"
              options={[
                { value: 'week', label: 'Last week' },
                { value: 'month', label: 'Last month' },
                { value: '3months', label: 'Last 3 months' },
                { value: '6months', label: 'Last 6 months' },
                { value: 'year', label: 'Last year' },
                { value: '2years', label: 'Last 2 years' },
              ]}
              onChange={v => setDateFilter(v ?? '')}
              triggerClass="w-full sm:w-auto sm:min-w-32"
            />
          </>
        }
        actions={
          <>
            <button
              onClick={() => setPrepDocModalOpen(true)}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 bg-[#5067F4] hover:bg-[#3d52d9] transition-colors w-full sm:w-auto"
            >
              <FileText size={14} />
              Create prep doc
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 bg-[#5067F4] hover:bg-[#3d52d9] transition-colors w-full sm:w-auto"
            >
              + New Preparation
            </button>
          </>
        }
      />

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
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                        <th className="hidden md:table-cell text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide w-[20%]" style={{ color: '#3D52D9' }}>Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide w-[35%]" style={{ color: '#3D52D9' }}>Candidate</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide w-[45%]" style={{ color: '#3D52D9' }}>Vacancy</th>
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
                            <td className="hidden md:table-cell px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
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
      {isError ? (
        <ErrorMessage error={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton />
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
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[18%]" style={{ color: '#3D52D9' }}>Candidate</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[28%]" style={{ color: '#3D52D9' }}>Role / Vacancy</th>
                <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Type</th>
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
                    <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
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
                    <td className="hidden md:table-cell px-4 py-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.linearIssueTitle}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3">
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
