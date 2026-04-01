import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { AnalyzeModal } from '../modals/AnalyzeModal';
import { LayoutContext } from '@/context/LayoutContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <LayoutContext.Provider value={{ openNewAnalysis: () => setAnalyzeOpen(true) }}>
      <div className="flex h-screen bg-slate-50">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          onNewAnalysis={() => { setAnalyzeOpen(true); setSidebarOpen(false); }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <header className="md:hidden h-14 border-b bg-white flex items-center px-4 gap-3 flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Menu size={20} />
            </button>
            <span className="font-semibold text-slate-900">Interview AI</span>
          </header>

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        <AnalyzeModal
          open={analyzeOpen}
          onClose={() => setAnalyzeOpen(false)}
        />
      </div>
    </LayoutContext.Provider>
  );
}