import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { AppProvider } from './contexts/AppContext';
import { Router } from './components/Router';
import { Navigation } from './components/Navigation';

import { EquipmentPage } from './pages/EquipmentPage';
import { CalculatorPage } from './pages/CalculatorPage';
import { DOPEPage } from './pages/DOPEpage';
import { LogPage } from './pages/logPage';

const routes = [
  { path: '/equipment',  component: <EquipmentPage /> },
  { path: '/calculator', component: <CalculatorPage /> },
  { path: '/dope',       component: <DOPEPage /> },
  { path: '/log',        component: <LogPage /> },
];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <Navigation />          {/* ⬅️ mount header/nav here */}
      <Router routes={routes} defaultPath="/equipment" />
    </AppProvider>
  </React.StrictMode>
);
