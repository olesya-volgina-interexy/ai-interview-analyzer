import type { CVMatch } from '@shared/schemas';
import { matchScoreColors, ScoreBar, TagSection } from './MatchBlock';

interface Props {
  cvMatch: CVMatch;
}

export function CVMatchBlock({ cvMatch }: Props) {
  const { confirmedSkills, unconfirmedSkills, declaredSkills, discrepancies, cvMatchScore } = cvMatch;
  const { barColor, pillClass } = matchScoreColors(cvMatchScore);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-900">CV Match</span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pillClass}`}>
          {cvMatchScore}%
        </span>
      </div>

      <ScoreBar value={cvMatchScore} color={barColor} />

      <TagSection label="Confirmed" items={confirmedSkills} tone="positive" />
      <TagSection label="Unconfirmed" items={unconfirmedSkills} tone="negative" />
      <TagSection label="Declared" items={declaredSkills} tone="neutral" />

      {discrepancies.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Discrepancies</p>
          <ul className="space-y-1">
            {discrepancies.map((d, i) => (
              <li key={i} className="text-xs text-slate-500 leading-relaxed">• {d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
