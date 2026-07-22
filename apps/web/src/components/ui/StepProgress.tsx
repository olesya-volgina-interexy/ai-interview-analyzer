import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export interface ProgressStep {
  label: string;
  threshold: number;
}

interface StepProgressProps {
  steps: ProgressStep[];
  progress: number;
  footnote: string;
}

export function StepProgress({ steps, progress, footnote }: StepProgressProps) {
  return (
    <div className="py-6 space-y-6">
      <Progress value={progress} className="h-2" />

      <div className="space-y-3">
        {steps.map((step) => {
          const done = progress >= step.threshold;
          const active = progress >= step.threshold - 20 && progress < step.threshold;

          return (
            <div key={step.label} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
              ) : active ? (
                <Loader2 size={18} className="text-[#5067F4] animate-spin shrink-0" />
              ) : (
                <Circle size={18} className="text-slate-300 shrink-0" />
              )}
              <span className={done ? 'text-slate-700' : active ? 'text-[#5067F4] font-medium' : 'text-slate-400'}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-slate-500">{footnote}</p>
    </div>
  );
}
