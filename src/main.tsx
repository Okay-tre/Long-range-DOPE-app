import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { Router } from './components/Router';

import { EquipmentPage } from './pages/EquipmentPage';
import { CalculatorPage } from './pages/CalculatorPage';
import { DOPEPage } from './pages/DOPEpage';
import { LogPage } from './pages/logPage';   // 👈 switched to named import

const routes = [
  { path: '/equipment',  component: <EquipmentPage /> },
  { path: '/calculator', component: <CalculatorPage /> },
  { path: '/dope',       component: <DOPEPage /> },
  { path: '/log',        component: <LogPage /> },
];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router routes={routes} defaultPath="/equipment" />
  </React.StrictMode>
);
