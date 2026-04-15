import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { TopNav } from './TopNav';
import { AnalyzeModal } from '../modals/AnalyzeModal';
import { LayoutContext } from '@/context/LayoutContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  });

  return (
    <LayoutContext.Provider value={{
      openNewAnalysis: () => setAnalyzeOpen(true),
      dateRange,
      setDateRange,
    }}>
      <div className="flex flex-col min-h-screen bg-slate-50">
        <TopNav onNewAnalysis={() => setAnalyzeOpen(true)} />

        <main className="flex-1 overflow-auto">
          {children}
        </main>

        <AnalyzeModal
          open={analyzeOpen}
          onClose={() => setAnalyzeOpen(false)}
        />
      </div>
    </LayoutContext.Provider>
  );
}
