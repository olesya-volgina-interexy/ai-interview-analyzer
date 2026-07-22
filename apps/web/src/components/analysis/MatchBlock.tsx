export function matchScoreColors(score: number) {
  const barColor = score >= 70 ? '#639922' : score >= 40 ? '#BA7517' : '#E24B4A';
  const pillClass = score >= 70 ? 'bg-green-100 text-green-800' : score >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
  return { barColor, pillClass };
}

export function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

const TONE_CLASS = {
  positive: 'bg-green-50 text-green-800 border border-green-200',
  negative: 'bg-red-50 text-red-800 border border-red-200',
  neutral: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export function TagSection({ label, items, tone }: { label: string; items: string[]; tone: keyof typeof TONE_CLASS }) {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={item} className={`text-xs px-2 py-0.5 rounded ${TONE_CLASS[tone]}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
