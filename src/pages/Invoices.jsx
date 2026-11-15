import React from 'react';

export default function Invoices() {
  return (
    <div className="page-content" style={{ padding: '20px' }}>
      <div className="dash-card">
        <h3>Saved Invoices</h3>
        <p style={{ color: 'var(--text-sub)' }}>No invoices created yet. Go to the Estimator to create one.</p>
      </div>
    </div>
  );
}
