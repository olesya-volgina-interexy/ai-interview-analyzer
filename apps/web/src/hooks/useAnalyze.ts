import { useState, useCallback, useRef } from 'react';
import { analyzeApi, type JobStatus } from '../api/client';
import type { AnalyzeRequest } from '@shared/schemas';

export type AnalyzeState = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

export function useAnalyze() {
  const [state, setState] = useState<AnalyzeState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<JobStatus['result'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAnalysis = useCallback(async (data: AnalyzeRequest) => {
    setState('pending');
    setProgress(0);
    setResult(null);
    setError(null);

    try {
      const { data: { jobId } } = await analyzeApi.start(data);
      setState('processing');

      const poll = async () => {
        try {
          const { data: status } = await analyzeApi.getStatus(jobId);
          setProgress(Number(status.progress));

          if (status.state === 'completed') {
            setResult(status.result ?? null);
            setState('completed');
            return;
          }

          if (status.state === 'failed') {
            setError('Analysis failed. Please try again.');
            setState('failed');
            return;
          }

          pollRef.current = setTimeout(poll, 2000);
        } catch {
          setError('Connection error. Please check your network.');
          setState('failed');
        }
      };

      pollRef.current = setTimeout(poll, 1500);
    } catch {
      setError('Failed to start analysis. Please try again.');
      setState('failed');
    }
  }, []);

  const reset = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setState('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return { state, progress, result, error, startAnalysis, reset };
}