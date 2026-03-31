import type { ManagerCallAnalysis } from '@shared/schemas';

export function ManagerCallResult({ analysis }: { analysis: ManagerCallAnalysis }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">ManagerCallResult — TODO</p>
      <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto">
        {JSON.stringify(analysis, null, 2)}
      </pre>
    </div>
  );
}
