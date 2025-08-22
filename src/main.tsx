import React from 'react';
import ReactDOM from 'react-dom/client';
import Router from './components/Router'; // 👈 default export from Router.tsx
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
