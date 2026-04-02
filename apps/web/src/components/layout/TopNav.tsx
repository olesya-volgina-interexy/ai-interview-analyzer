import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Plus, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TopNavProps {
  onNewAnalysis: () => void;
}

export function TopNav({ onNewAnalysis }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="relative flex-shrink-0 mt-2">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-slate-900 whitespace-nowrap">Interview AI</span>

        <nav className="hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 bg-white rounded-lg px-8 py-1.5 shadow-sm border border-slate-200">
          <NavItem to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" />
          <NavItem to="/interviews" icon={<FileText size={16} />} label="Interviews" />
        </nav>

        <Button
          onClick={onNewAnalysis}
          size="sm"
          className="hidden sm:flex gap-2 p-5 rounded-lg"
        >
          <Plus size={16} />
          <span className="hidden lg:inline">New Analysis</span>
        </Button>

        <button
          className="sm:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className={cn(
        'sm:hidden overflow-hidden transition-all duration-300 ease-in-out',
        mobileOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="border-t px-4 py-3 flex flex-col gap-1">
          <MobileNavItem
            to="/"
            icon={<LayoutDashboard size={16} />}
            label="Dashboard"
            onClick={() => setMobileOpen(false)}
          />
          <MobileNavItem
            to="/interviews"
            icon={<FileText size={16} />}
            label="Interviews"
            onClick={() => setMobileOpen(false)}
          />
          <div className="mt-2 pt-2 border-t">
            <Button
              onClick={() => { onNewAnalysis(); setMobileOpen(false); }}
              size="sm"
              className="w-full gap-2 p-5 rounded-lg"
            >
              <Plus size={16} />
              New Analysis
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition-colors',
        '[&.active]:bg-slate-100 [&.active]:text-slate-900 [&.active]:font-medium'
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </Link>
  );
}

function MobileNavItem({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100 transition-colors',
        '[&.active]:bg-slate-100 [&.active]:text-slate-900 [&.active]:font-medium'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
