import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AnalyzeForm } from '../analyze/AnalyzeForm';
import { AnalyzeProgress } from '../analyze/AnalyzeProgress';
import { AnalysisResult } from '../analysis/AnalysisResult';
import { useAnalyze } from '@/hooks/useAnalyze';
import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';

interface AnalyzeModalProps {
  open: boolean;
  onClose: () => void;
}

export function AnalyzeModal({ open, onClose }: AnalyzeModalProps) {
  const { state, progress, result, error, startAnalysis, reset } = useAnalyze();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleViewInHistory = () => {
    queryClient.invalidateQueries({ queryKey: ['interviews'] });
    reset();
    onClose();
    navigate({ to: '/interviews' });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[80%] max-w-none max-h-[90vh] overflow-y-auto scrollbar-thin bg-white">
        <DialogHeader>
          <DialogTitle>
            {state === 'idle' && 'New Analysis'}
            {(state === 'pending' || state === 'processing') && 'Analyzing...'}
            {state === 'completed' && 'Analysis Complete'}
            {state === 'failed' && 'Analysis Failed'}
          </DialogTitle>
        </DialogHeader>

        {state === 'idle' && (
          <AnalyzeForm onSubmit={startAnalysis} />
        )}

        {(state === 'pending' || state === 'processing') && (
          <AnalyzeProgress progress={progress} />
        )}

        {state === 'completed' && result && (
          <div className="space-y-4">
            <AnalysisResult analysis={result.analysis} />
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={reset}>New Analysis</Button>
              <Button variant="outline" onClick={handleClose}>Close</Button>
              <Button onClick={handleViewInHistory}>View in History →</Button>
            </div>
          </div>
        )}

        {state === 'failed' && (
          <div className="text-center py-8 space-y-4">
            <p className="text-red-600">{error}</p>
            <Button onClick={reset}>Try Again</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}