import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { clientsApi } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2 } from 'lucide-react';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function hireRateColor(rate: number) {
  if (rate >= 70) return { bg: '#EAF3DE', color: '#3B6D11' };
  if (rate >= 40) return { bg: '#FAEEDA', color: '#854F0B' };
  return { bg: '#FCEBEB', color: '#A32D2D' };
}

export function ClientsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, limit],
    queryFn: () => clientsApi.getClients(page, limit).then(r => r.data),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = page * limit < total;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <span className="text-sm text-slate-400">{total} records</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
        </div>
      ) : !items.length ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Clients appear here once they show up in Linear ticket titles."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr style={{ background: '#EEF0FE', borderBottom: '0.5px solid #D9DEFB' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[34%]" style={{ color: '#3D52D9' }}>Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Interviews</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Hire Rate</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[14%]" style={{ color: '#3D52D9' }}>Requests</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide w-[24%]" style={{ color: '#3D52D9' }}>Last Interview</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c, idx) => {
                const rateStyle = hireRateColor(c.hireRate);
                return (
                  <tr
                    key={c.name}
                    onClick={() => navigate({ to: '/clients/$name', params: { name: c.name } })}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: idx < items.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#EEF0FE', color: '#3D52D9' }}>
                          <Building2 size={14} />
                        </div>
                        <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.interviewCount}</td>
                    <td className="px-4 py-3">
                      {c.interviewCount > 0 ? (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: rateStyle.bg, color: rateStyle.color }}
                        >
                          {c.hireRate}%
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{c.requestCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      {formatDate(c.lastInterviewAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(page > 1 || hasNext) && (
            <div className="flex items-center justify-center gap-3 p-3 border-t border-slate-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-400">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNext}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
