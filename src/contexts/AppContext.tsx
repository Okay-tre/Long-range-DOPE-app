import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { loadState, saveState, type AppState } from '../lib/appState';

type AppContextType = {
  state: AppState;
  setState: (state: AppState) => void;
  navigate: (path: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState());
  const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || '/equipment');

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Handle hash changes for navigation
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash.slice(1) || '/equipment');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path: string) => {
    window.location.hash = path;
    setCurrentPath(path);
  };

  const contextValue: AppContextType = {
    state,
    setState,
    navigate,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Legacy hook for current path (used by Router)
export function useCurrentPath() {
  return window.location.hash.slice(1) || '/equipment';
}
