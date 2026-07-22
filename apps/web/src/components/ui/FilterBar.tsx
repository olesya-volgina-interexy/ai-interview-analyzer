import { useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Filter controls (e.g. FilterSelects). Rendered inline on desktop and inside the modal on phones. */
  filters: ReactNode;
  /** Optional action buttons (e.g. "New"). Stay visible on phones below the search row. */
  actions?: ReactNode;
  /** Number of active filters — drives the badge on the phone filter button. */
  activeCount: number;
  onClear: () => void;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters,
  actions,
  activeCount,
  onClear,
}: FilterBarProps) {
  const [open, setOpen] = useState(false);

  const searchInput = (widthClass: string) => (
    <div className={cn('relative', widthClass)}>
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={searchValue}
        onChange={e => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-9 sm:h-8 pl-8 pr-3 text-sm rounded-full border border-slate-200 outline-none w-full transition-colors"
        style={searchValue
          ? { background: '#185FA5', color: 'white', borderColor: 'transparent' }
          : { background: 'white', color: '#475569' }}
      />
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Phone: search + filter button */}
      <div className="flex items-center gap-2 sm:hidden">
        {searchInput('flex-1 min-w-0')}
        <button
          onClick={() => setOpen(true)}
          aria-label="Filters"
          className="relative flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <SlidersHorizontal size={16} />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#5067F4] text-white text-[10px] font-semibold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Phone: actions */}
      {actions && <div className="grid grid-cols-2 gap-2 sm:hidden">{actions}</div>}

      {/* Tablet+: everything inline */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center gap-2">
        {searchInput('w-56')}
        {filters}
        {actions && (
          <>
            <div className="flex-1" />
            {actions}
          </>
        )}
      </div>

      {/* Phone filters modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">{filters}</div>
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={onClear}
              disabled={activeCount === 0}
              className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors"
            >
              Clear all
            </button>
            <Button onClick={() => setOpen(false)} className="rounded-lg">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
