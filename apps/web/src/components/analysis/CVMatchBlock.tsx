import type { CVMatch } from '@shared/schemas';

interface Props {
  cvMatch: CVMatch;
}

export function CVMatchBlock({ cvMatch }: Props) {
  const { confirmedSkills, unconfirmedSkills, declaredSkills, discrepancies, cvMatchScore } = cvMatch;

  const barColor =
    cvMatchScore >= 70 ? '#639922' :
    cvMatchScore >= 40 ? '#BA7517' :
    '#E24B4A';

  const pillClass =
    cvMatchScore >= 70 ? 'bg-green-100 text-green-800' :
    cvMatchScore >= 40 ? 'bg-amber-100 text-amber-800' :
    'bg-red-100 text-red-800';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-900">CV Match</span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pillClass}`}>
          {cvMatchScore}%
        </span>
      </div>

      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${cvMatchScore}%`, background: barColor }}
        />
      </div>

      {confirmedSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Confirmed</p>
          <div className="flex flex-wrap gap-1.5">
            {confirmedSkills.map(skill => (
              <span key={skill} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-800 border border-green-200">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {unconfirmedSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Unconfirmed</p>
          <div className="flex flex-wrap gap-1.5">
            {unconfirmedSkills.map(skill => (
              <span key={skill} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {declaredSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Declared</p>
          <div className="flex flex-wrap gap-1.5">
            {declaredSkills.map(skill => (
              <span key={skill} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

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