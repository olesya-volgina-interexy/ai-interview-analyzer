import { Link } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarProps {
  onNewAnalysis: () => void;
}

export function Sidebar({ onNewAnalysis }: SidebarProps) {
  return (
    <aside className="w-60 h-screen border-r bg-white flex flex-col">
      {/* Логотип */}
      <div className="h-16 flex items-center px-6 border-b">
        <span className="font-semibold text-slate-900">Interview AI</span>
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
        <NavItem to="/" icon={<LayoutDashboard size={16} />} label="Dashboard" />
        <NavItem to="/interviews" icon={<FileText size={16} />} label="Interviews" />
      </nav>
    </aside>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
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