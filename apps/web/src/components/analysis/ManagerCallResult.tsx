import type { ManagerCallAnalysis } from '@shared/schemas';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STAGE_RESULT_CONFIG = {
  passed:   { label: 'Passed',  className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  on_hold:  { label: 'On Hold', className: 'bg-yellow-100 text-yellow-800' },
};

export function ManagerCallResult({ analysis }: { analysis: ManagerCallAnalysis }) {
  const stageResult = STAGE_RESULT_CONFIG[analysis.stageResult] ?? {
    label: analysis.stageResult,
    className: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge className={stageResult.className}>{stageResult.label}</Badge>
        <span className="text-xs text-slate-400">Manager Call</span>
      </div>

      {/* Overall Impression */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Overall Impression</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">{analysis.overallImpression}</p>
        </CardContent>
      </Card>

      {/* Soft Skills */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">💬 Soft Skills</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: 'Communication', value: analysis.softSkills.communication },
            { label: 'Motivation', value: analysis.softSkills.motivation },
            { label: 'Culture Fit', value: analysis.softSkills.cultureFit },
            { label: 'Salary Expectations', value: analysis.softSkills.salaryExpectations },
            { label: 'Clarity of Thought', value: analysis.softSkills.clarityOfThought },
          ].map(({ label, value }) => (
            <div key={label}>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
              <p className="text-sm text-slate-700 mt-0.5">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-700">✓ Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-700">• {s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">✗ Weaknesses</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-slate-700">• {w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Broker Soft Fit */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🎯 Broker Soft Fit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analysis.brokerSoftFit.coveredRequirements.length > 0 && (
            <div>
              <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Covered</span>
              <ul className="mt-1 space-y-0.5">
                {analysis.brokerSoftFit.coveredRequirements.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700">• {r}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.brokerSoftFit.missingRequirements.length > 0 && (
            <div>
              <span className="text-xs font-medium text-red-600 uppercase tracking-wide">Missing</span>
              <ul className="mt-1 space-y-0.5">
                {analysis.brokerSoftFit.missingRequirements.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700">• {r}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-slate-600 pt-1 border-t">{analysis.brokerSoftFit.fitSummary}</p>
        </CardContent>
      </Card>

      {/* Risks */}
      {analysis.risks.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-800">⚠️ Risks</CardTitle>
          </CardHeader>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">Decision Breakers</CardTitle>
          </CardHeader>
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Reasoning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">{analysis.reasoning}</p>
        </CardContent>
      </Card>

      {/* Recommendation for Recruiter */}
      <Card className="border-[#5067F4]/20 bg-[#5067F4]/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-[#5067F4]">📋 Recommendation for Recruiter</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#5067F4]/80">{analysis.recommendation}</p>
        </CardContent>
      </Card>

    </div>
  );
}