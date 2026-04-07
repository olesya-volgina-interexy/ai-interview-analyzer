import type { CandidateAnalysis } from '@shared/schemas';
import { FinalResult } from './FinalResult';
import { ManagerCallResult } from './ManagerCallResult';
import { TechnicalResult } from './TechnicalResult';

export function AnalysisResult({ analysis }: { analysis: CandidateAnalysis }) {
  if (analysis.stage === 'manager_call') {
    return <ManagerCallResult analysis={analysis} />;
  }
  if (analysis.stage === 'final_result') {
    return <FinalResult analysis={analysis} />;
  }
  return <TechnicalResult analysis={analysis} />;
}