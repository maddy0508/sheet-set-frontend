import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const savedJobs = JSON.parse(localStorage.getItem('sheetSetJobs') || '[]');

  const totalJobs = savedJobs.length;
  const totalArea = savedJobs.reduce((sum, j) => sum + (j.result?.roof_area_m2 || 0), 0);
  const totalSheets = savedJobs.reduce((sum, j) => sum + (j.result?.sheets?.length || 0), 0);
  const avgWaste = totalJobs > 0 
    ? savedJobs.reduce((sum, j) => sum + (j.result?.total_waste_pct || 0), 0) / totalJobs 
    : 0;

  return (
    <div className="page-content" style={{ animation: 'fadeIn 0.25s ease-out' }}>
      <div className="dashboard-grid">
        
        {/* Quick Action */}
        <div className="dash-card" style={{ background: 'linear-gradient(135deg, #284050 0%, #202020 100%)' }}>
          <h3 style={{ color: '#E8E8E8' }}>Welcome Back</h3>
          <div className="value" style={{ fontSize: '20px', marginBottom: '15px' }}>Ready to estimate?</div>
          <button className="btn btn-primary" onClick={() => navigate('/estimator')}>📐 Start New Estimate</button>
        </div>

        {/* Stats Grid */}
        <div className="data-grid">
          <div className="data-card">
            <div className="data-label">TOTAL JOBS</div>
            <div className="data-value">{totalJobs}</div>
          </div>
          <div className="data-card">
            <div className="data-label">ROOF AREA</div>
            <div className="data-value">{totalArea.toFixed(0)}<span style={{fontSize:'14px'}}>m²</span></div>
          </div>
          <div className="data-card">
            <div className="data-label">TOTAL SHEETS</div>
            <div className="data-value">{totalSheets}</div>
          </div>
          <div className="data-card">
            <div className="data-label">AVG WASTE</div>
            <div className="data-value">{avgWaste.toFixed(1)}<span style={{fontSize:'14px'}}>%</span></div>
          </div>
        </div>

        {/* Recent Jobs List */}
        <div className="dash-card">
          <h3>Recent Jobs</h3>
          {savedJobs.length === 0 ? (
            <p style={{ color: 'var(--text-sub)' }}>No jobs saved yet. Start an estimate to see it here.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {savedJobs.slice(-3).reverse().map((job, i) => (
                <div key={i} style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', borderLeft: '3px solid var(--accent-gunmetal)' }}>
                  <strong style={{ color: 'var(--silver-light)' }}>{job.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--silver-dark)', marginTop: '4px' }}>
                    {job.result?.sheets?.length || 0} sheets · {(job.result?.roof_area_m2 || 0).toFixed(1)}m²
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
