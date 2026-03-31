import type { BrokerRequestMatch } from '@shared/schemas';

export function BrokerMatchBlock({ brokerMatch }: { brokerMatch: BrokerRequestMatch }) {
  return (
    <div className="rounded border p-3 text-sm text-slate-500">
      BrokerMatchBlock — TODO (score: {brokerMatch.brokerMatchScore})
    </div>
  );
}
