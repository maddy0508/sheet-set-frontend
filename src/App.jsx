import React, { useState } from 'react';
import axios from 'axios';

// ⚠️ REPLACE THIS WITH YOUR RENDER URL WHEN IT IS LIVE
const API_URL = "https://sheet-set-backend.onrender.com/"; 

function App() {
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Hardcoded L-Shape for testing
  const exterior = [[0,0], [20,0], [20,10], [10,10], [10,20], [0,20]];

  const calculateRoof = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_URL}/calculate`, {
        exterior: exterior,
        pitch_deg: pitch,
        sheet_width_mm: width,
        overhang_mm: 150
      });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!result) return;
    const blob = new Blob([result.csv_data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'sheet_set_cut_list.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="container">
      <header>
        <h1>📐 Sheet Set</h1>
        <p>Production Calculator</p>
      </header>

      <div className="controls">
        <div className="input-group">
          <label>Pitch: {pitch}°</label>
          <input type="range" min="10" max="60" value={pitch} onChange={(e) => setPitch(e.target.value)} />
        </div>
        <div className="input-group">
          <label>Sheet Width: {width}mm</label>
          <input type="range" min="500" max="1000" value={width} onChange={(e) => setWidth(e.target.value)} />
        </div>
        <button onClick={calculateRoof} disabled={loading}>
          {loading ? "Calculating..." : "Calculate Roof"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <div className="stats">
            <h3>Order Summary</h3>
            <pre>{result.summary}</pre>
            <button onClick={downloadCSV} className="download-btn">📥 Download Machine CSV</button>
          </div>
          
          <div className="visualizer">
            <h3>Shop Drawing</h3>
            <svg viewBox="-2 -2 24 24" width="100%" height="auto" style={{background: '#f8f9fa', border: '1px solid #ccc'}}>
              <polygon 
                points={exterior.map(p => `${p[0]},${p[1]}`).join(' ')} 
                fill="none" 
                stroke="black" 
                strokeWidth="0.2" 
              />
              {result.sheets.map((sheet, i) => (
                <line 
                  key={i}
                  x1={sheet.start[0]} y1={sheet.start[1]} 
                  x2={sheet.end[0]} y2={sheet.end[1]} 
                  stroke="red" 
                  strokeWidth="0.1" 
                  opacity="0.6"
                />
              ))}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
