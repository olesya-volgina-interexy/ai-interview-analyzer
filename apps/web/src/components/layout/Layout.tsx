import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { AnalyzeModal } from '../modals/AnalyzeModal';

export function Layout({ children }: { children: React.ReactNode }) {
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar onNewAnalysis={() => setAnalyzeOpen(true)} />

      <main className="flex-1 overflow-auto">
        {children}
      </main>

      <AnalyzeModal
        open={analyzeOpen}
        onClose={() => setAnalyzeOpen(false)}
      />
    </div>
  );
}