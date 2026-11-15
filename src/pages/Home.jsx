import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const savedJobs = JSON.parse(localStorage.getItem('sheetSetJobs') || '[]');

  return (
    <div className="page-content">
      <div className="dashboard-grid">
        <div className="dash-card" style={{ background: 'linear-gradient(135deg, #284050 0%, #202020 100%)' }}>
          <h3>Welcome Back</h3>
          <div className="value" style={{ fontSize: '20px', marginBottom: '15px' }}>Ready to estimate?</div>
          <button className="btn btn-primary" onClick={() => navigate('/estimator')}>📐 Start New Estimate</button>
        </div>

        <div className="dash-card">
          <h3>Recent Jobs</h3>
          {savedJobs.length === 0 ? (
            <p style={{ color: 'var(--text-sub)' }}>No jobs saved yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {savedJobs.slice(0, 3).map((job, i) => (
                <div key={i} style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <strong style={{ color: 'var(--silver-light)' }}>{job.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--silver-dark)' }}>{job.result.sheets?.length || 0} sheets</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
