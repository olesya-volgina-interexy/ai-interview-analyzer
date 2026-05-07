import { useState, useCallback, useRef } from 'react';
import { preparationApi, getErrorMessage } from '../api/client';
import type { GeneratePreparationDocRequest, PreparationDoc } from '@shared/schemas';

export type PreparationState = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

export function usePreparationDoc() {
  const [state, setState] = useState<PreparationState>('idle');
  const [progress, setProgress] = useState(0);
  const [doc, setDoc] = useState<PreparationDoc | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const MAX_RETRIES = 3;

  const generate = useCallback(async (data: GeneratePreparationDocRequest) => {
    setState('pending');
    setProgress(0);
    setDoc(null);
    setDocId(null);
    setError(null);
    retriesRef.current = 0;

    try {
      const { data: created } = await preparationApi.generate(data);
      setDocId(created.id);
      setState('processing');

      const poll = async () => {
        try {
          const { data: status } = await preparationApi.getStatus(created.id);
          setProgress(Number(status.progress));
          retriesRef.current = 0;

          if (status.status === 'completed') {
            if (status.doc) setDoc(status.doc);
            setState('completed');
            return;
          }

          if (status.status === 'failed') {
            setError(status.error ?? 'Document generation failed.');
            setState('failed');
            return;
          }

          pollRef.current = setTimeout(poll, 2000);
        } catch (err) {
          retriesRef.current += 1;
          if (retriesRef.current >= MAX_RETRIES) {
            setError(getErrorMessage(err));
            setState('failed');
            return;
          }
          pollRef.current = setTimeout(poll, 3000);
        }
      };

      pollRef.current = setTimeout(poll, 1500);
    } catch (err) {
      setError(getErrorMessage(err));
      setState('failed');
    }
  }, []);

  const reset = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setState('idle');
    setProgress(0);
    setDoc(null);
    setDocId(null);
    setError(null);
    retriesRef.current = 0;
  }, []);

  return {
    state,
    progress,
    doc,
    docId,
    markdown: doc?.markdown ?? null,
    error,
    generate,
    reset,
  };
}
