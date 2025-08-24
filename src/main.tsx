import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "./contexts/AppContext";
import Navigation from "./components/Navigation";
import { Router } from "./components/Router";

// PAGES
import { EquipmentPage } from "./pages/EquipmentPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { LogPage } from "./pages/logPage";
import DOPEPage from "./pages/DOPEpage";

import "./index.css";

const ROUTES = [
  { path: "/equipment", label: "Equipment", component: <EquipmentPage /> },
  { path: "/calc",      label: "Ballistic Calculator", component: <CalculatorPage /> },
  { path: "/log",       label: "Log", component: <LogPage /> },
  { path: "/dope",      label: "DOPE", component: <DOPEPage /> },
];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <Navigation routes={ROUTES} />
      <Router routes={ROUTES} defaultPath="/equipment" />
    </AppProvider>
  </React.StrictMode>
);
