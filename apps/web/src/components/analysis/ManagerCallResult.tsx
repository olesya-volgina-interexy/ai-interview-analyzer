import type { ManagerCallAnalysis } from '@shared/schemas';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MessageSquare, Zap, Users, DollarSign, Brain } from 'lucide-react';

const RESULT_STYLE: Record<string, { bg: string; color: string }> = {
  passed:   { bg: '#E6F1FB', color: '#185FA5' },
  rejected: { bg: '#FCEBEB', color: '#A32D2D' },
  on_hold:  { bg: '#FAEEDA', color: '#854F0B' },
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

const SOFT_SKILLS_CONFIG: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
  'Communication':      { icon: <MessageSquare size={14} />, bg: '#E6F1FB', color: '#185FA5' },
  'Motivation':         { icon: <Zap size={14} />,           bg: '#EAF3DE', color: '#3B6D11' },
  'Culture Fit':        { icon: <Users size={14} />,         bg: '#EEEDFE', color: '#534AB7' },
  'Salary Expectations':{ icon: <DollarSign size={14} />,    bg: '#FAEEDA', color: '#854F0B' },
  'Clarity of Thought': { icon: <Brain size={14} />,         bg: '#E1F5EE', color: '#0F6E56' },
};

function SoftSkillCard({ label, value }: { label: string; value: string }) {
  const config = SOFT_SKILLS_CONFIG[label] ?? { icon: null, bg: '#F1EFE8', color: '#5F5E5A' };
  const isEmpty = !value || value.toLowerCase() === 'not mentioned';

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--color-border-tertiary)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 w-full" style={{ background: config.bg }}>
        <span style={{ color: config.color }}>{config.icon}</span>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: config.color }}>{label}</p>
      </div>
      <div className="px-4 py-3" style={{ background: 'var(--color-background-primary)' }}>
        <p className="text-sm leading-relaxed" style={{
          color: isEmpty ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
          fontStyle: isEmpty ? 'italic' : 'normal'
        }}>
          {isEmpty ? 'Not mentioned' : value}
        </p>
      </div>
    </div>
  );
}

export function ManagerCallResult({ analysis }: { analysis: ManagerCallAnalysis }) {
  const rs = RESULT_STYLE[analysis.stageResult] ?? { bg: '#F1EFE8', color: '#5F5E5A' };
  const filteredRisks = analysis.risks.filter(r => r && r.toLowerCase() !== 'not mentioned');

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: rs.bg, color: rs.color }}>
          {analysis.stageResult.replace('_', ' ')}
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Manager Call</span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="softskills">Soft Skills</TabsTrigger>
          <TabsTrigger value="brokerfit">Broker Fit</TabsTrigger>
          <TabsTrigger value="decision">Decision</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="text-sm leading-relaxed px-3 py-2.5 rounded-lg" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}>
            {analysis.overallImpression}
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

        {/* Soft Skills */}
        <TabsContent value="softskills" className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SoftSkillCard label="Communication" value={analysis.softSkills.communication} />
            <SoftSkillCard label="Motivation" value={analysis.softSkills.motivation} />
            <SoftSkillCard label="Culture Fit" value={analysis.softSkills.cultureFit} />
            <SoftSkillCard label="Clarity of Thought" value={analysis.softSkills.clarityOfThought} />
            <div className="sm:col-span-2">
              <SoftSkillCard label="Salary Expectations" value={analysis.softSkills.salaryExpectations} />
            </div>
          </div>
        </TabsContent>

        {/* Broker Fit */}
        <TabsContent value="brokerfit" className="space-y-3 pt-4">
          {analysis.brokerSoftFit.coveredRequirements.length > 0 && (
            <div>
              <SectionTitle>Covered</SectionTitle>
              <ItemList items={analysis.brokerSoftFit.coveredRequirements} variant="strength" />
            </div>
          )}
          {analysis.brokerSoftFit.missingRequirements.length > 0 && (
            <div>
              <SectionTitle>Missing</SectionTitle>
              <ItemList items={analysis.brokerSoftFit.missingRequirements} variant="weakness" />
            </div>
          )}
          {analysis.brokerSoftFit.fitSummary && (
            <div>
              <SectionTitle>Summary</SectionTitle>
              <div className="text-m rounded-md leading-relaxed">
                {analysis.brokerSoftFit.fitSummary}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Decision */}
        <TabsContent value="decision" className="space-y-3 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <SectionTitle>Stage Result</SectionTitle>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full mb-2" style={{ background: rs.bg, color: rs.color }}>
              {analysis.stageResult.replace('_', ' ')}
            </span>
          </div>

          {analysis.decisionBreakers.length > 0 && (
            <div>
              <SectionTitle>Decision Breakers</SectionTitle>
              <ItemList items={analysis.decisionBreakers} variant="weakness" />
            </div>
          )}

          {filteredRisks.length > 0 && (
            <div>
              <SectionTitle>Risks</SectionTitle>
              <ItemList items={filteredRisks} variant="risk" />
            </div>
          )}

          {analysis.decisionBreakers.length === 0 && filteredRisks.length === 0 && (
            <div className="text-xs px-3 py-2 rounded-md italic" style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)' }}>
              No decision breakers or risks identified
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}