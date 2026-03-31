import type { CVMatch } from '@shared/schemas';

export function CVMatchBlock({ cvMatch }: { cvMatch: CVMatch }) {
  return (
    <div className="rounded border p-3 text-sm text-slate-500">
      CVMatchBlock — TODO (score: {cvMatch.cvMatchScore})
    </div>
  );
}
