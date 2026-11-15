import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Estimator from './pages/Estimator';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        
        {/* PREMIUM HEADER */}
        <header>
          <div>
            <h1 className="header-title">MITCHELL'S</h1>
            <p className="header-subtitle">Metal Roofing</p>
          </div>
        </header>

        {/* PAGES */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/estimator" element={<Estimator />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>

        {/* BOTTOM NAVIGATION */}
        <nav className="bottom-nav">
          <NavLink to="/" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-icon">🏠</span>
            <span>Home</span>
          </NavLink>
          <NavLink to="/estimator" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-icon">📐</span>
            <span>Estimator</span>
          </NavLink>
          <NavLink to="/invoices" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-icon">📄</span>
            <span>Invoices</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}>
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </NavLink>
        </nav>

      </div>
    </BrowserRouter>
  );
}
