import { createContext, useContext } from 'react';
import type { DateRange } from 'react-day-picker';

interface LayoutContextValue {
  openNewAnalysis: () => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

const now = new Date();

export const LayoutContext = createContext<LayoutContextValue>({
  openNewAnalysis: () => {},
  dateRange: {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  },
  setDateRange: () => {},
});

export const useLayout = () => useContext(LayoutContext);