import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/FilterSelect';
import { X, SlidersHorizontal } from 'lucide-react';

export interface Filters {
  role?: string;
  level?: string;
  stage?: string;
  clientName?: string;
  decision?: string;
  managerName?: string;
}

interface InterviewFiltersProps {
  value: Filters;
  onChange: (v: Filters) => void;
  managers?: string[];
  roles?: string[];
}

export function InterviewFilters({ value, onChange, managers = [], roles = [] }: InterviewFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const set = (key: keyof Filters, val: string | undefined) =>
    onChange({ ...value, [key]: val });

  const reset = () => onChange({});
  const activeCount = [value.role, value.level, value.stage, value.decision, value.managerName].filter(Boolean).length;
  const hasActiveFilters = Object.values(value).some(Boolean);

  const filterControls = (
    <>
      <FilterSelect
        activeColor="#534AB7"
        value={value.role}
        placeholder="All Roles"
        options={roles.length > 0
          ? roles.map(r => ({ value: r, label: r }))
          : ['Backend','Frontend','Fullstack','DevOps','QA','Mobile'].map(r => ({ value: r, label: r }))
        }
        onChange={v => set('role', v)}
        triggerClass="w-full sm:w-auto sm:min-w-96"
      />

      <FilterSelect
        activeColor="#185FA5"
        value={value.level}
        placeholder="All Levels"
        options={['Junior','Middle','Senior','Architect'].map(l => ({ value: l, label: l }))}
        onChange={v => set('level', v)}
        triggerClass="w-full sm:w-auto sm:min-w-40"
      />

      <FilterSelect
        activeColor="#0F6E56"
        value={value.stage}
        placeholder="All Stages"
        options={[
          { value: 'manager_call', label: 'Manager Call' },
          { value: 'technical', label: 'Technical' },
          { value: 'final_result', label: 'Final Result' },
        ]}
        onChange={v => set('stage', v)}
        triggerClass="w-full sm:w-auto sm:min-w-40"
      />

      <FilterSelect
        activeColor="#3B6D11"
        value={value.decision}
        placeholder="All Decisions"
        options={[
          { value: 'hired', label: 'Hired' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'uncertain', label: 'Uncertain' },
        ]}
        onChange={v => set('decision', v)}
        triggerClass="w-full sm:w-auto sm:min-w-40"
      />

      <FilterSelect
        activeColor="#854F0B"
        value={value.managerName}
        placeholder="All Managers"
        options={[
          ...managers.map(m => ({ value: m, label: m })),
          { value: '__uncertain__', label: 'Uncertain' },
        ]}
        onChange={v => set('managerName', v)}
        triggerClass="w-full sm:w-auto sm:min-w-40"
      />
    </>
  );

  return (
    <>
      {/* Phone: search + a filter button that opens the modal */}
      <div className="flex items-center gap-2 sm:hidden">
        <Input
          value={value.clientName ?? ''}
          onChange={e => set('clientName', e.target.value || undefined)}
          placeholder="Search by client..."
          className="h-9 text-sm rounded-full flex-1 transition-colors"
          style={value.clientName ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : {}}
        />
        <button
          onClick={() => setMobileOpen(true)}
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

      {/* Tablet+: inline filters + search */}
      <div className="hidden sm:flex sm:flex-wrap sm:items-center gap-2">
        {filterControls}
        <Input
          value={value.clientName ?? ''}
          onChange={e => set('clientName', e.target.value || undefined)}
          placeholder="Search by client..."
          className="h-8 text-sm rounded-full flex-1 min-w-44 transition-colors"
          style={value.clientName ? { background: '#185FA5', color: 'white', borderColor: 'transparent' } : {}}
        />
        {hasActiveFilters && (
          <button
            onClick={reset}
            className="h-8 px-3 flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Phone filters modal */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            {filterControls}
          </div>
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={reset}
              disabled={!hasActiveFilters}
              className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40 transition-colors"
            >
              Clear all
            </button>
            <Button onClick={() => setMobileOpen(false)} className="rounded-lg">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
