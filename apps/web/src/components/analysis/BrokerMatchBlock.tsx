import type { BrokerRequestMatch } from '@shared/schemas';

interface Props {
  brokerMatch: BrokerRequestMatch;
}

export function BrokerMatchBlock({ brokerMatch }: Props) {
  const { coveredRequirements, missingRequirements, brokerMatchScore, brokerFitSummary } = brokerMatch;

  const barColor =
    brokerMatchScore >= 70 ? '#639922' :
    brokerMatchScore >= 40 ? '#BA7517' :
    '#E24B4A';

  const pillClass =
    brokerMatchScore >= 70 ? 'bg-green-100 text-green-800' :
    brokerMatchScore >= 40 ? 'bg-amber-100 text-amber-800' :
    'bg-red-100 text-red-800';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-900">Broker Match</span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${pillClass}`}>
          {brokerMatchScore}%
        </span>
      </div>

      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${brokerMatchScore}%`, background: barColor }}
        />
      </div>

      {coveredRequirements.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Covered</p>
          <div className="flex flex-wrap gap-1.5">
            {coveredRequirements.map(req => (
              <span key={req} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-800 border border-green-200">
                {req}
              </span>
            ))}
          </div>
        </div>
      )}

      {missingRequirements.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Missing</p>
          <div className="flex flex-wrap gap-1.5">
            {missingRequirements.map(req => (
              <span key={req} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
                {req}
              </span>
            ))}
          </div>
        </div>
      )}

      {brokerFitSummary && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 leading-relaxed">{brokerFitSummary}</p>
        </div>
      )}
    </div>
  );
}