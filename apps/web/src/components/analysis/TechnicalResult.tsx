import type { TechnicalAnalysis } from '@shared/schemas';
import { CVMatchBlock } from './CVMatchBlock';
import { BrokerMatchBlock } from './BrokerMatchBlock';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SectionTitle, ItemList, StrengthsWeaknessesGrid } from './shared';

const REC_STYLE: Record<string, { bg: string; color: string }> = {
  hire:      { bg: '#EAF3DE', color: '#3B6D11' },
  no_hire:   { bg: '#FCEBEB', color: '#A32D2D' },
  uncertain: { bg: '#FAEEDA', color: '#854F0B' },
};

const LANG_VERDICT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  meets_requirement:  { bg: '#EAF3DE', color: '#27500A', label: 'Meets requirement' },
  borderline:         { bg: '#FAEEDA', color: '#633806', label: 'Borderline' },
  below_requirement:  { bg: '#FCEBEB', color: '#791F1F', label: 'Below requirement' },
  not_assessed:       { bg: '#F1EFE8', color: '#5F5E5A', label: 'Not assessed' },
};

const SENTIMENT_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  positive: { bg: '#EAF3DE', color: '#27500A', dot: '#639922' },
  negative: { bg: '#FCEBEB', color: '#791F1F', dot: '#E24B4A' },
  neutral:  { bg: '#F1EFE8', color: '#5F5E5A', dot: '#9A9893' },
};

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

          <StrengthsWeaknessesGrid strengths={analysis.strengths} weaknesses={analysis.weaknesses} />

          {analysis.risks && analysis.risks.length > 0 && (
            <div>
              <SectionTitle>Risks & Red Flags</SectionTitle>
              <ItemList items={analysis.risks} variant="risk" />
            </div>
          )}

          {analysis.languageAssessment && (() => {
            const la = analysis.languageAssessment;
            const v = LANG_VERDICT_STYLE[la.verdict] ?? LANG_VERDICT_STYLE.not_assessed;
            return (
              <div>
                <SectionTitle>Language Assessment</SectionTitle>
                <div className="px-3 py-2.5 rounded-lg" style={{ background: v.bg }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium uppercase tracking-wide" style={{ color: v.color, letterSpacing: '0.06em' }}>
                      {v.label}
                    </span>
                    <span className="text-xs" style={{ color: v.color, opacity: 0.85 }}>
                      Required: {la.requiredLevel} · Demonstrated: {la.demonstratedLevel}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: v.color }}>{la.evidence}</p>
                </div>
              </div>
            );
          })()}

          {analysis.interviewerSentiment && analysis.interviewerSentiment.length > 0 && (
            <div>
              <SectionTitle>Interviewer Reactions</SectionTitle>
              <div className="flex flex-col gap-1.5">
                {analysis.interviewerSentiment.map((s, i) => {
                  const st = SENTIMENT_STYLE[s.interpretation] ?? SENTIMENT_STYLE.neutral;
                  return (
                    <div key={i} className="text-xs px-3 py-2 rounded-md leading-relaxed flex items-start gap-2" style={{ background: st.bg, color: st.color }}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                      <div className="flex-1">
                        <span className="italic">"{s.signal}"</span>
                        {s.topic && (
                          <span className="ml-1.5 opacity-75">— {s.topic}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            {analysis.recommendation === 'uncertain' && analysis.reasoning && (
              <p className="text-xs leading-relaxed mt-1.5 opacity-90" style={{ color: rec.color }}>
                {analysis.reasoning}
              </p>
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}