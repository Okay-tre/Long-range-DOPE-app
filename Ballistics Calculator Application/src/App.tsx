import React from 'react';
import { AppProvider } from './contexts/AppContext';
import { Router } from './components/Router';
import { Navigation } from './components/Navigation';
import { CalculatorPage } from './pages/CalculatorPage';
import { LogPage } from './pages/LogPage';
import { DOPEPage } from './pages/DOPEPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { Toaster } from './components/ui/sonner';

const routes = [
  { path: '/equipment', component: <EquipmentPage /> },
  { path: '/calc', component: <CalculatorPage /> },
  { path: '/log', component: <LogPage /> },
  { path: '/dope', component: <DOPEPage /> },
];

export default function App() {
  // Set document title
  React.useEffect(() => {
    document.title = "Long Range DOPE Calculator";
  }, []);

  return (
    <AppProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="py-2 flex-1">
          <Router routes={routes} defaultPath="/equipment" />
        </main>
        
        {/* Footer with trademark */}
        <footer className="py-4 border-t bg-muted/30">
          <div className="container max-w-7xl mx-auto px-4">
            <div className="text-center text-xs text-muted-foreground">
              © 2025 Pirkanmaa Copper Golf Club™
            </div>
          </div>
        </footer>
        
        <Toaster />
      </div>
    </AppProvider>
  );
}