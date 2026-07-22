import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ALL = '__all__';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string | undefined;
  options: FilterOption[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  triggerClass?: string;
  activeColor?: string;
}

export function FilterSelect({
  value,
  options,
  placeholder,
  onChange,
  triggerClass,
  activeColor = '#334155',
}: FilterSelectProps) {
  const isActive = !!value;
  const activeLabel = isActive
    ? options.find(o => o.value === value)?.label ?? value
    : placeholder;

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v: string | null) => onChange(!v || v === ALL ? undefined : v)}
    >
      <SelectTrigger
        className={cn(
          'h-8 w-auto rounded-full border px-3 text-sm transition-colors',
          isActive
            ? 'border-transparent text-white hover:opacity-90 [&_svg]:!text-white/70'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&_svg]:!text-slate-400',
          triggerClass
        )}
        style={isActive ? { background: activeColor, color: 'white' } : undefined}
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
