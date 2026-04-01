import { createContext, useContext } from 'react';

interface LayoutContextValue {
  openNewAnalysis: () => void;
}

export const LayoutContext = createContext<LayoutContextValue>({
  openNewAnalysis: () => {},
});

export const useLayout = () => useContext(LayoutContext);