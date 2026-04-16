import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RefreshCw } from 'lucide-react';

interface RequestsData {
  total: number;
  byStatus: Record<string, number>;
  byClient: Record<string, number>;
  byRole: Record<string, number>;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bar: string }> = {
  hired: { label: 'Hired', dot: 'bg-green-500', bar: 'bg-green-500' },
  technical: { label: 'Technical', dot: 'bg-blue-500', bar: 'bg-blue-500' },
  manager_call: { label: 'Manager call', dot: 'bg-purple-400', bar: 'bg-purple-400' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-400', bar: 'bg-blue-400' },
  new: { label: 'New', dot: 'bg-slate-300', bar: 'bg-slate-300' },
  rejected: { label: 'Rejected', dot: 'bg-red-400', bar: 'bg-red-400' },
  lost: { label: 'Lost', dot: 'bg-slate-400', bar: 'bg-slate-400' },
};

export function RequestsStatsCard({
  requests,
  period,
  onRefresh,
  isRefreshing,
}: {
  requests: RequestsData;
  period: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <Card className="w-full border-none shadow-sm bg-white overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[15px] font-semibold text-slate-800">
          Incoming requests
        </CardTitle>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}
          <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-medium whitespace-nowrap">
            {period}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="text-5xl font-bold text-slate-900 tracking-tight">
          {requests.total}
        </div>

        <Tabs defaultValue="status" className="w-full">
          <TabsList variant="line" className="w-full justify-start mb-4">
            <TabsTrigger value="status" className="text-[10px] uppercase tracking-wider font-bold">
              By Status
            </TabsTrigger>
            <TabsTrigger value="client" className="text-[10px] uppercase tracking-wider font-bold">
              By Client
            </TabsTrigger>
          </TabsList>

          {/* Таб со статусами */}
          <TabsContent 
            value="status" 
            className="mt-0 outline-none 
              data-[state=active]:animate-in 
              data-[state=active]:fade-in-0 
              data-[state=active]:slide-in-from-right-2 
              duration-300"
          >
            <div className="space-y-4">
              {Object.entries(requests.byStatus).map(([status, count]) => {
                const config = STATUS_CONFIG[status] || { 
                  label: status.replace('_', ' '), 
                  dot: 'bg-slate-300', 
                  bar: 'bg-slate-300' 
                };
                const percentage = requests.total > 0 ? (count / requests.total) * 100 : 0;

                return (
                  <div key={status} className="grid grid-cols-[120px_1fr_30px] items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
                      <span className="text-sm font-medium text-slate-700 whitespace-nowrap capitalize">
                        {config.label}
                      </span>
                    </div>
                    
                    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                      {/* Анимация полоски через CSS Transition */}
                      <div 
                        className={`h-full rounded-full transition-all duration-700 ease-out ${config.bar}`} 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <span className="text-sm font-bold text-slate-800 text-right">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Таб с клиентами */}
          <TabsContent 
            value="client" 
            className="mt-0 outline-none 
              data-[state=active]:animate-in 
              data-[state=active]:fade-in-0 
              data-[state=active]:slide-in-from-right-2 
              duration-300"
          >
            <div className="space-y-3">
              {Object.keys(requests.byClient).length > 0 ? (
                Object.entries(requests.byClient).map(([client, count]) => (
                  <div key={client} className="flex justify-between items-center text-sm">
                    <span className="text-slate-600 font-medium truncate pr-4">
                      {client}
                    </span>
                    <span className="font-bold text-slate-800">
                      {count}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400 py-2">No client data available</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}