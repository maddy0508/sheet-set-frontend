import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Estimator from './pages/Estimator';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';

function getPageTitle(path) {
  switch(path) {
    case '/': return ['Dashboard', 'Overview & recent jobs'];
    case '/estimator': return ['Estimator', 'Measure & quote roofs'];
    case '/invoices': return ['Invoices', 'Quotes & invoices'];
    case '/settings': return ['Settings', 'Company & pricing'];
    default: return ['Sheet-Set', 'Mitchell\'s Metal Roofing'];
  }
}

function AppLayout() {
  const location = useLocation();
  const isEstimator = location.pathname === '/estimator';
  const [title, subtitle] = getPageTitle(location.pathname);

  return (
    <div className="app-shell">
      
      {/* DYNAMIC HEADER */}
      <header>
        <div>
          <h1 className="header-title">{title}</h1>
          <p className="header-subtitle">{subtitle}</p>
        </div>
      </header>

      {/* PAGE CONTENT */}
      <div className="page-content" style={{ position: 'relative' }}>
        
        {/* Non-Estimator Pages */}
        <div style={{ display: isEstimator ? 'none' : 'block', height: '100%', animation: 'fadeIn 0.25s ease-out' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>

        {/* Estimator is ALWAYS mounted, just hidden. This prevents the Leaflet map from breaking. */}
        <div style={{ 
          display: isEstimator ? 'block' : 'none', 
          position: 'absolute', 
          top: 0, left: 0, right: 0, bottom: 0 
        }}>
          <Estimator />
        </div>
      </div>

      {/* BOTTOM NAVIGATION */}
      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
          <span className="nav-icon">🏠</span><span>Home</span>
        </NavLink>
        <NavLink to="/estimator" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
          <span className="nav-icon">📐</span><span>Estimator</span>
        </NavLink>
        <NavLink to="/invoices" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
          <span className="nav-icon">📄</span><span>Invoices</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
          <span className="nav-icon">⚙️</span><span>Settings</span>
        </NavLink>
      </nav>

    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
