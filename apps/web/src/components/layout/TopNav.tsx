import { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { LayoutDashboard, FileText, Users, Plus, Menu, X, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useLayout } from '@/context/LayoutContext';

interface TopNavProps {
  onNewAnalysis: () => void;
}

export function TopNav({ onNewAnalysis }: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { dateRange, setDateRange } = useLayout();
  const now = new Date();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={cn(
      'sticky top-0 z-50 flex-shrink-0 pt-2 transition-all duration-300',
      scrolled ? 'bg-transparent pointer-events-none' : 'bg-slate-50'
    )}>
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <span className={cn(
          'font-semibold text-slate-900 whitespace-nowrap transition-all duration-300',
          scrolled ? 'opacity-0 -translate-x-4' : 'opacity-100 translate-x-0'
        )}>Interview AI</span>

        <nav className={cn(
          'hidden sm:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-sm border border-slate-200/70 transition-all duration-300 pointer-events-auto',
          scrolled && 'shadow-lg shadow-slate-200/50'
        )}>
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <NavItem to="/interviews" icon={<FileText size={18} />} label="Interviews" />
          <NavItem to="/candidates" icon={<Users size={18} />} label="Candidates" />
          <div className="w-px h-7 bg-slate-200 mx-1.5" />
          <button
            onClick={onNewAnalysis}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#5067F4] hover:bg-[#3d52d9] transition-colors"
          >
            <Plus size={18} />
            <span className="hidden lg:inline">New Analysis</span>
          </button>
        </nav>

        <Popover>
          <PopoverTrigger className={cn(
            'hidden sm:flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-slate-200/70 bg-white/90 backdrop-blur-md hover:bg-slate-50 shadow-sm transition-all duration-300 pointer-events-auto',
            scrolled && 'shadow-lg shadow-slate-200/50'
          )}>
            <CalendarIcon size={14} className="text-slate-400" />
            {dateRange.from && dateRange.to
              ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`
              : 'Select period'}
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-[400px] p-0" align="end">
            <div className="flex gap-1 p-2 border-b justify-between">
              {[
                { label: 'This month', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }) },
                { label: 'Last month', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) }) },
                { label: 'Last 3 months', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }) },
                { label: 'This year', fn: () => ({ from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) }) },
              ].map(({ label, fn }) => {
                const isActive = dateRange.from?.getMonth() === fn().from.getMonth() &&
                  dateRange.from?.getFullYear() === fn().from.getFullYear();
                return (
                  <button
                    key={label}
                    onClick={() => setDateRange(fn())}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#5067F4]/10 text-[#5067F4] border-[#5067F4]/30'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range: any) => { if (range?.from && range?.to) setDateRange(range); }}
              numberOfMonths={1}
              classNames={{ root: 'w-full', month: 'flex w-full flex-col gap-4' }}
            />
          </PopoverContent>
        </Popover>

        <button
          className={cn(
            'sm:hidden p-1.5 rounded-md text-slate-600 hover:bg-slate-100 transition-all duration-300 pointer-events-auto',
            scrolled ? 'opacity-0 -translate-x-4' : 'opacity-100 translate-x-0'
          )}
          onClick={() => setMobileOpen(prev => !prev)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className={cn(
        'sm:hidden overflow-hidden transition-all duration-300 ease-in-out bg-slate-50',
        mobileOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
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
          <MobileNavItem
            to="/candidates"
            icon={<Users size={16} />}
            label="Candidates"
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
        'flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors',
        '[&.active]:bg-[#5067F4]/10 [&.active]:text-[#5067F4] [&.active]:font-medium'
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
        '[&.active]:bg-[#5067F4]/10 [&.active]:text-[#5067F4] [&.active]:font-medium'
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
