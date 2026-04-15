import type { TechnicalAnalysis } from '@shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CVMatchBlock } from './CVMatchBlock';
import { BrokerMatchBlock } from './BrokerMatchBlock';

const RECOMMENDATION_CONFIG = {
  hire:     { label: 'Hire',      className: 'bg-green-100 text-green-800' },
  no_hire:  { label: 'No Hire',   className: 'bg-red-100 text-red-800' },
  uncertain:{ label: 'Uncertain', className: 'bg-yellow-100 text-yellow-800' },
};

export function TechnicalResult({ analysis }: { analysis: TechnicalAnalysis }) {
  const rec = RECOMMENDATION_CONFIG[analysis.recommendation];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Badge className={rec.className}>{rec.label}</Badge>
          {analysis.technicalLevel && (
            <span className="text-sm text-slate-600">{analysis.technicalLevel}</span>
          )}
        </div>
        {analysis.score !== undefined && (
          <div className="flex items-center gap-2">
            <div className="w-24 bg-slate-200 rounded-full h-2">
              <div
                className="bg-[#5067F4] h-2 rounded-full"
                style={{ width: `${analysis.score}%` }}
              />
            </div>
            <span className="text-sm font-medium">{analysis.score}/100</span>
          </div>
        )}
      </div>

      {/* Overall Assessment */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Overall Assessment</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-700">{analysis.overallAssessment}</p></CardContent>
      </Card>

      {/* CV Match + Broker Match */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CVMatchBlock cvMatch={analysis.cvMatch} />
        <BrokerMatchBlock brokerMatch={analysis.brokerRequestMatch} />
      </div>

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">✓ Strengths</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-700">• {s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">✗ Weaknesses</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-slate-700">• {w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Decision Breakers */}
      {analysis.decisionBreakers.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">Decision Breakers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.decisionBreakers.map((d, i) => (
                <li key={i} className="text-sm text-red-700">• {d}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Reasoning */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Reasoning</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-700">{analysis.reasoning}</p></CardContent>
      </Card>
    </div>
  );
}