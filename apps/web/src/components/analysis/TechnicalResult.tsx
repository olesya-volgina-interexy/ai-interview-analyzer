import type { TechnicalAnalysis } from '@shared/schemas';
import { CVMatchBlock } from './CVMatchBlock';
import { BrokerMatchBlock } from './BrokerMatchBlock';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const REC_STYLE: Record<string, { bg: string; color: string }> = {
  hire:      { bg: '#EAF3DE', color: '#3B6D11' },
  no_hire:   { bg: '#FCEBEB', color: '#A32D2D' },
  uncertain: { bg: '#FAEEDA', color: '#854F0B' },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.06em' }}>
      {children}
    </p>
  );
}

function ItemList({ items, variant }: { items: string[]; variant: 'strength' | 'weakness' | 'risk' | 'neutral' }) {
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

export function TechnicalResult({ analysis }: { analysis: TechnicalAnalysis }) {
  const rec = REC_STYLE[analysis.recommendation] ?? { bg: '#F1EFE8', color: '#5F5E5A' };

  return (
    <div className="space-y-4">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: rec.bg, color: rec.color }}>
            {analysis.recommendation.replace('_', ' ')}
          </span>
          {analysis.technicalLevel && (
            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
              {analysis.technicalLevel}
            </span>
          )}
        </div>
        {analysis.score !== undefined && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-background-secondary)' }}>
              <div className="h-full rounded-full" style={{
                width: `${analysis.score}%`,
                background: analysis.score >= 75 ? '#639922' : analysis.score >= 50 ? '#BA7517' : '#E24B4A'
              }} />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {analysis.score}<span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>/100</span>
            </span>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="skills">Skills Match</TabsTrigger>
          <TabsTrigger value="broker">Broker Match</TabsTrigger>
          <TabsTrigger value="decision">Decision</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="text-sm leading-relaxed px-3 py-2.5 rounded-lg" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
            {analysis.overallAssessment}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionTitle>Strengths</SectionTitle>
              <ItemList items={analysis.strengths} variant="strength" />
            </div>
            <div>
              <SectionTitle>Weaknesses</SectionTitle>
              <ItemList items={analysis.weaknesses} variant="weakness" />
            </div>
          </div>

          <div>
            <SectionTitle>Reasoning</SectionTitle>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{analysis.reasoning}</p>
          </div>
        </TabsContent>

        {/* Skills Match */}
        <TabsContent value="skills" className="pt-4">
          <CVMatchBlock cvMatch={analysis.cvMatch} />
        </TabsContent>

        {/* Broker Match */}
        <TabsContent value="broker" className="pt-4">
          <BrokerMatchBlock brokerMatch={analysis.brokerRequestMatch} />
        </TabsContent>

        {/* Decision */}
        <TabsContent value="decision" className="space-y-3 pt-4">
          {analysis.decisionBreakers.length > 0 ? (
            <div>
              <SectionTitle>Decision Breakers</SectionTitle>
              <ItemList items={analysis.decisionBreakers} variant="weakness" />
            </div>
          ) : (
            <div className="text-xs px-3 py-2 rounded-md italic" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)' }}>
              No decision breakers identified
            </div>
          )}

          <div className="px-3 py-2.5 rounded-lg mt-2" style={{ background: rec.bg }}>
            <p className="text-xs font-medium mb-1" style={{ color: rec.color }}>Final Recommendation</p>
            <p className="text-sm leading-relaxed font-medium" style={{ color: rec.color }}>
              {analysis.recommendation.replace('_', ' ').toUpperCase()}
            </p>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}