import { ArrowLeft } from 'lucide-react';

interface NotFoundStateProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle?: string;
  containerClassName?: string;
}

export function NotFoundState({
  backLabel,
  onBack,
  title,
  subtitle,
  containerClassName = 'p-4 md:p-6',
}: NotFoundStateProps) {
  return (
    <div className={containerClassName}>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
      >
        <ArrowLeft size={16} /> {backLabel}
      </button>
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-slate-500">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
