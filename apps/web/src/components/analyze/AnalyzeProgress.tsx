import { StepProgress } from '@/components/ui/StepProgress';

const STEPS = [
  { label: 'Downloading CV', threshold: 10 },
  { label: 'Creating embedding', threshold: 25 },
  { label: 'Finding similar cases', threshold: 40 },
  { label: 'AI analysis', threshold: 55 },
  { label: 'Saving results', threshold: 85 },
  { label: 'Done', threshold: 100 },
];

export function AnalyzeProgress({ progress }: { progress: number }) {
  return <StepProgress steps={STEPS} progress={progress} footnote="This usually takes 15–30 seconds..." />;
}
