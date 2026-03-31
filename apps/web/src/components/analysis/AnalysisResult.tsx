import type { CandidateAnalysis } from '@shared/schemas';
import { ManagerCallResult } from './ManagerCallResult';
import { TechnicalResult } from './TechnicalResult';

export function AnalysisResult({ analysis }: { analysis: CandidateAnalysis }) {
  if (analysis.stage === 'manager_call') {
    return <ManagerCallResult analysis={analysis} />;
  }
  return <TechnicalResult analysis={analysis} />;
}