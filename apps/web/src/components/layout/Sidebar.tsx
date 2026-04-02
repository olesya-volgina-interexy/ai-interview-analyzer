import { Link } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarProps {
  onNewAnalysis: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ onNewAnalysis, isOpen, onClose }: SidebarProps) {
  return (
    <aside className={cn(
      'w-60 h-screen border-r bg-white flex flex-col flex-shrink-0',
      'fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out',
      'md:static md:translate-x-0',
      isOpen ? 'translate-x-0' : '-translate-x-full'
    )}>
      {/* Логотип */}
      <div className="h-16 flex items-center px-6 border-b gap-2">
        <span className="font-semibold text-slate-900 flex-1">Interview AI</span>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Кнопка New Analysis */}
      <div className="p-4">
        <Button onClick={onNewAnalysis} className="w-full gap-2">
          <Plus size={16} />
          New Analysis
        </Button>
      </div>

      {/* Навигация */}
      <nav className="flex-1 px-3 space-y-1">
        <NavItem to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" onNavigate={onClose} />
        <NavItem to="/interviews" icon={<FileText size={16} />} label="Interviews" onNavigate={onClose} />
      </nav>
    </aside>
  );
}

function NavItem({ to, icon, label, onNavigate }: { to: string; icon: React.ReactNode; label: string; onNavigate?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
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