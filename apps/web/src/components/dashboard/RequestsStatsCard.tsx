import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RequestsData {
  total: number;
  byStatus: Record<string, number>;
  byClient: Record<string, number>;
  byRole: Record<string, number>;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  manager_call: 'Manager Call',
  technical: 'Technical',
  hired: 'Hired',
  rejected: 'Rejected',
  on_hold: 'On Hold',
  dropped: 'Dropped',
};

const STATUS_COLOR: Record<string, string> = {
  hired: 'text-green-600',
  rejected: 'text-red-500',
  on_hold: 'text-slate-400',
  dropped: 'text-slate-400',
};

export function RequestsStatsCard({ requests }: { requests: RequestsData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Incoming Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold text-slate-900">{requests.total}</div>

        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">By Status</p>
          <div className="space-y-1">
            {Object.entries(requests.byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between text-sm">
                <span className={STATUS_COLOR[status] ?? 'text-slate-600'}>
                  {STATUS_LABEL[status] ?? status}
                </span>
                <span className="font-medium text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {Object.keys(requests.byClient).length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">By Client</p>
            <div className="space-y-1">
              {Object.entries(requests.byClient).map(([client, count]) => (
                <div key={client} className="flex justify-between text-sm">
                  <span className="text-slate-600 truncate">{client}</span>
                  <span className="font-medium text-slate-700">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}