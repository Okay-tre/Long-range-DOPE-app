import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { Router } from './components/Router';

// Pages
import { EquipmentPage } from './pages/EquipmentPage';   // named export
import { CalculatorPage } from './pages/CalculatorPage'; // named export
import DOPEpage from './pages/DOPEpage';                 // DEFAULT export
import LogPage from './pages/logPage';                   // DEFAULT export (keep unless error says otherwise)               

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
