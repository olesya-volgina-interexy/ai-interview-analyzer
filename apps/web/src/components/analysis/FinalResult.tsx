import type { FinalResultAnalysis } from '@shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DECISION_CONFIG = {
  hired:    { label: 'Hired',    className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
};

export function FinalResult({ analysis }: { analysis: FinalResultAnalysis }) {
  const decision = DECISION_CONFIG[analysis.decision];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge className={decision.className}>{decision.label}</Badge>
        <span className="text-xs text-slate-400">Final Result</span>
      </div>

      {/* Overall Assessment */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Overall Assessment</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-700">{analysis.overallAssessment}</p></CardContent>
      </Card>

      {/* Summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Technical Summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-slate-700">{analysis.technicalSummary}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Soft Skills Summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-slate-700">{analysis.softSkillsSummary}</p></CardContent>
        </Card>
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

      {/* Risks */}
      {analysis.risks.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-800">⚠️ Risks</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.risks.map((r, i) => (
                <li key={i} className="text-sm text-yellow-800">• {r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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

      {/* Recommendation */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-800">📋 Recommendation</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-blue-800">{analysis.recommendation}</p></CardContent>
      </Card>

    </div>
  );
}
