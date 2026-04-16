import type { FinalResultAnalysis } from '@shared/schemas';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const DECISION_STYLE: Record<string, { bg: string; color: string }> = {
  hired:    { bg: '#EAF3DE', color: '#3B6D11' },
  rejected: { bg: '#FCEBEB', color: '#A32D2D' },
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

function SummaryCard({ title, text, bg, color }: { title: string; text: string; bg: string; color: string }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--color-border-tertiary)' }}>
      <div className="px-4 py-2.5 w-full" style={{ background: bg }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{title}</p>
      </div>
      <div className="px-4 py-3" style={{ background: 'var(--color-background-primary)' }}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{text}</p>
      </div>
    </div>
  );
}

export function FinalResult({ analysis }: { analysis: FinalResultAnalysis }) {
  const ds = DECISION_STYLE[analysis.decision] ?? { bg: '#F1EFE8', color: '#5F5E5A' };
  const filteredRisks = analysis.risks.filter(r => r && r.toLowerCase() !== 'not mentioned');

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: ds.bg, color: ds.color }}>
          {analysis.decision}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Final Result</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="summary">Stage Summaries</TabsTrigger>
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

          <div className="px-3 py-2.5 rounded-lg" style={{ background: '#E6F1FB' }}>
            <p className="text-xs font-medium mb-1" style={{ color: '#185FA5' }}>Recommendation</p>
            <p className="text-sm leading-relaxed" style={{ color: '#185FA5' }}>{analysis.recommendation}</p>
          </div>
        </TabsContent>

        {/* Stage Summaries */}
        <TabsContent value="summary" className="space-y-3 pt-4">
          <SummaryCard
            title="Technical Interview"
            text={analysis.technicalSummary}
            bg="#EEEDFE"
            color="#534AB7"
          />
          <SummaryCard
            title="Manager Call"
            text={analysis.softSkillsSummary}
            bg="#E6F1FB"
            color="#185FA5"
          />
        </TabsContent>

        {/* Decision */}
        <TabsContent value="decision" className="space-y-3 pt-4">
          {filteredRisks.length > 0 && (
            <div>
              <SectionTitle>Risks</SectionTitle>
              <ItemList items={filteredRisks} variant="risk" />
            </div>
          )}

          {analysis.decisionBreakers.length > 0 && (
            <div>
              <SectionTitle>Decision Breakers</SectionTitle>
              <ItemList items={analysis.decisionBreakers} variant="weakness" />
            </div>
          )}

          {filteredRisks.length === 0 && analysis.decisionBreakers.length === 0 && (
            <div className="text-xs px-3 py-2 rounded-md italic" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)' }}>
              No risks or decision breakers identified
            </div>
          )}

          <div className="px-3 py-2.5 rounded-lg mt-2" style={{ background: ds.bg }}>
            <p className="text-xs font-medium mb-1" style={{ color: ds.color }}>Final Decision</p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: ds.color }}>
              {analysis.decision.toUpperCase()}
            </p>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}