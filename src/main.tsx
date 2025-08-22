import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { Router } from './components/Router';

import EquipmentPage from './pages/EquipmentPage';
import CalculatorPage from './pages/CalculatorPage';
import DOPEpage from './pages/DOPEpage';
import LogPage from './pages/logPage'; // filename is logPage.tsx (lower l)

const routes = [
  { path: '/equipment', component: <EquipmentPage /> },
  { path: '/calculator', component: <CalculatorPage /> },
  { path: '/dope', component: <DOPEpage /> },
  { path: '/log', component: <LogPage /> },
];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router routes={routes} defaultPath="/equipment" />
  </React.StrictMode>
);
