export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.06em' }}>
      {children}
    </p>
  );
}

export function ItemList({ items, variant }: { items: string[]; variant: 'strength' | 'weakness' | 'risk' | 'neutral' }) {
  const styles = {
    strength: { bg: '#EAF3DE', color: '#27500A' },
    weakness: { bg: '#FCEBEB', color: '#791F1F' },
    risk:     { bg: '#FAEEDA', color: '#633806' },
    neutral:  { bg: '#F1EFE8', color: '#5F5E5A' },
  };
  const s = styles[variant];

  if (!items.length || (items.length === 1 && items[0].toLowerCase().includes('not mentioned'))) {
    return (
      <div className="text-xs px-3 py-2 rounded-md italic" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)' }}>
        Not mentioned
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={i} className="text-xs px-3 py-2 rounded-md leading-relaxed" style={{ background: s.bg, color: s.color }}>
          {item}
        </div>
      ))}
    </div>
  );
}

export function StrengthsWeaknessesGrid({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <SectionTitle>Strengths</SectionTitle>
        <ItemList items={strengths} variant="strength" />
      </div>
      <div>
        <SectionTitle>Weaknesses</SectionTitle>
        <ItemList items={weaknesses} variant="weakness" />
      </div>
    </div>
  );
}
