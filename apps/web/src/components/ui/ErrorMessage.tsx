import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './button';

interface ErrorMessageProps {
  error: string | null;
  onRetry?: () => void;
  className?: string;
}

function getIcon(error: string) {
  if (error.toLowerCase().includes('connect') || error.toLowerCase().includes('network')) {
    return <WifiOff size={20} className="text-red-500 shrink-0" />;
  }
  return <AlertCircle size={20} className="text-red-500 shrink-0" />;
}

export function ErrorMessage({ error, onRetry, className }: ErrorMessageProps) {
  if (!error) return null;

  return (
    <div className={`rounded-md border border-red-200 bg-red-50 p-4 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        {getIcon(error)}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">Something went wrong</p>
          <p className="text-sm text-red-600 mt-0.5">{error}</p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="shrink-0 gap-1.5 border-red-200 text-red-700 hover:bg-red-100"
          >
            <RefreshCw size={14} />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}