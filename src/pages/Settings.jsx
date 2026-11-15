import React, { useState, useEffect } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({ companyName: "Mitchell's Metal Roofing", abn: "0435 918 594" });

  useEffect(() => {
    const saved = localStorage.getItem('sheetSetSettings');
    if (saved) setSettings(JSON.parse(saved));
  }, []);

  const save = () => {
    localStorage.setItem('sheetSetSettings', JSON.stringify(settings));
    alert("Settings saved.");
  };

  return (
    <div className="page-content" style={{ padding: '20px' }}>
      <div className="dash-card">
        <h3>Company Details</h3>
        <div className="input-group">
          <label>Company Name</label>
          <input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} />
        </div>
        <div className="input-group">
          <label>Phone / ABN</label>
          <input type="text" value={settings.abn} onChange={e => setSettings({...settings, abn: e.target.value})} />
        </div>
        <button className="btn btn-primary" style={{ marginTop: '15px' }} onClick={save}>Save Settings</button>
      </div>
    </div>
  );
}
