import type { BrokerRequestMatch } from '@shared/schemas';
import { matchScoreColors, ScoreBar, TagSection } from './MatchBlock';

interface Props {
  brokerMatch: BrokerRequestMatch;
}

export function BrokerMatchBlock({ brokerMatch }: Props) {
  const { coveredRequirements, missingRequirements, notAssessedRequirements, brokerMatchScore, brokerFitSummary, brokerProxyScore } = brokerMatch;
  const { barColor, pillClass } = matchScoreColors(brokerMatchScore);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-900">Broker Match</span>
        {brokerMatchScore > 0 ? (
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pillClass}`}>
            {brokerMatchScore}%
          </span>
        ) : notAssessedRequirements && notAssessedRequirements.length > 0 && brokerProxyScore !== undefined ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              Not tested in interview
            </span>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              CV estimate: {brokerProxyScore}%
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">
            {brokerMatchScore}%
          </span>
        )}
      </div>

      <ScoreBar value={brokerMatchScore} color={barColor} />

      <TagSection label="Covered" items={coveredRequirements} tone="positive" />
      <TagSection label="Missing" items={missingRequirements} tone="negative" />
      <TagSection label="Not Assessed" items={notAssessedRequirements ?? []} tone="neutral" />

      {brokerFitSummary && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 leading-relaxed">{brokerFitSummary}</p>
        </div>
      )}
    </div>
  );
}
