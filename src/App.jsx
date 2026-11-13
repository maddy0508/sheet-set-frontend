import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'marwan-yasser-react-leaflet-draw';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_URL = "https://sheet-set-backend.onrender.com"; 

function App() {
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  const [mapCenter, setMapCenter] = useState([-33.8688, 151.2093]);
  
  const [showSettings, setShowSettings] = useState(false);
  
  const [settings, setSettings] = useState({
    companyName: "Acme Roofing",
    abn: "12 345 678 901",
    phone: "0400 000 000",
    metalCostPerMeter: 15.00,
    laborRatePerSheet: 45.00
  });

  useEffect(() => {
    const saved = localStorage.getItem('sheetSetSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setMapCenter([position.coords.latitude, position.coords.longitude]);
      });
    }
  }, []);

  const saveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem('sheetSetSettings', JSON.stringify(settings));
    setShowSettings(false);
  };

  const handleSettingChange = (e) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const latLngToMeters = (latLngs) => {
    const origin = latLngs[0];
    const R = 6371000; 
    return latLngs.map((ll, index) => {
      const dLat = (ll.lat - origin.lat) * Math.PI / 180;
      const dLng = (ll.lng - origin.lng) * Math.PI / 180;
      const x = dLng * R * Math.cos(origin.lat * Math.PI / 180);
      const y = dLat * R;
      return [index === 0 ? 0 : x, index === 0 ? 0 : y];
    });
  };

  const onCreated = (e) => {
    const latLngs = e.layer.getLatLngs()[0];
    setDrawnCoords(latLngs.map(ll => ({ lat: ll.lat, lng: ll.lng })));
  };

  const onEdited = (e) => {
    e.layers.eachLayer((layer) => {
      const latLngs = layer.getLatLngs()[0];
      setDrawnCoords(latLngs.map(ll => ({ lat: ll.lat, lng: ll.lng })));
    });
  };

  const onDeleted = () => {
    setDrawnCoords(null);
    setExteriorMeters(null);
    setResult(null);
    setError(null);
  };

  const calculateRoof = async () => {
    if (!drawnCoords) {
      setError("Please draw a roof on the map first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const extMeters = latLngToMeters(drawnCoords);
      setExteriorMeters(extMeters);
      
      const response = await axios.post(`${API_URL}/calculate`, {
        exterior: extMeters,
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

  const generateInvoice = () => {
    if (!result) return;

    const totalSheetsMatch = result.summary.match(/Total Sheets: (\d+)/);
    const totalMetersMatch = result.summary.match(/Linear Meters Ordered: ([\d.]+)/);
    
    const totalSheets = totalSheetsMatch ? parseInt(totalSheetsMatch[1]) : 0;
    const totalMeters = totalMetersMatch ? parseFloat(totalMetersMatch[1]) : 0;

    const materialCost = totalMeters * parseFloat(settings.metalCostPerMeter);
    const laborCost = totalSheets * parseFloat(settings.laborRatePerSheet);
    const totalCost = materialCost + laborCost;

    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.text(settings.companyName, 14, 20);
    doc.setFontSize(10);
    doc.text(`ABN: ${settings.abn}`, 14, 28);
    doc.text(`Phone: ${settings.phone}`, 14, 33);
    
    doc.setFontSize(18);
    doc.text("INVOICE", 150, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 150, 28);
    
    doc.setFontSize(12);
    doc.text("Job Location:", 14, 50);
    doc.setFontSize(10);
    doc.text("Lat/Lng from Map", 14, 56);

    doc.autoTable({
      startY: 70,
      head: [['Description', 'Qty', 'Unit Rate', 'Total']],
      body: [
        ['Metal Sheets (Cut & Packed)', `${totalSheets} sheets`, '-', '-'],
        ['Metal Coil Required', `${totalMeters.toFixed(2)} m`, `$${parseFloat(settings.metalCostPerMeter).toFixed(2)}/m`, `$${materialCost.toFixed(2)}`],
        ['Installation Labor', `${totalSheets} sheets`, `$${parseFloat(settings.laborRatePerSheet).toFixed(2)}/sheet`, `$${laborCost.toFixed(2)}`]
      ],
      theme: 'grid',
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 123, 255] }
    });

    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Due: $${totalCost.toFixed(2)}`, 14, finalY + 20);

    doc.save(`Invoice_${new Date().getTime()}.pdf`);
  };

  let svgViewBox = "0 0 100 100";
  if (exteriorMeters && exteriorMeters.length > 0) {
    const xs = exteriorMeters.map(p => p[0]);
    const ys = exteriorMeters.map(p => p[1]);
    const minX = Math.min(...xs) - 2;
    const minY = Math.min(...ys) - 2;
    const maxX = Math.max(...xs) + 2;
    const maxY = Math.max(...ys) + 2;
    svgViewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>📐 Sheet Set</h1>
          <p>{showSettings ? "Business Settings" : "Trace a roof to generate a cut list"}</p>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          style={{ background: '#6c757d', padding: '8px 12px', fontSize: '14px', width: 'auto' }}
        >
          {showSettings ? "Back to Calculator" : "⚙️ Settings"}
        </button>
      </header>

      {showSettings ? (
        <form onSubmit={saveSettings} className="settings-form">
          <div className="input-group">
            <label>Company Name</label>
            <input type="text" name="companyName" value={settings.companyName} onChange={handleSettingChange} required />
          </div>
          <div className="input-group">
            <label>ABN</label>
            <input type="text" name="abn" value={settings.abn} onChange={handleSettingChange} />
          </div>
          <div className="input-group">
            <label>Phone</label>
            <input type="text" name="phone" value={settings.phone} onChange={handleSettingChange} />
          </div>
          <div className="input-group">
            <label>Metal Cost per Meter ($)</label>
            <input type="number" step="0.01" name="metalCostPerMeter" value={settings.metalCostPerMeter} onChange={handleSettingChange} required />
          </div>
          <div className="input-group">
            <label>Labor Rate per Sheet ($)</label>
            <input type="number" step="0.01" name="laborRatePerSheet" value={settings.laborRatePerSheet} onChange={handleSettingChange} required />
          </div>
          <button type="submit" style={{ marginTop: '10px' }}>Save Settings</button>
        </form>
      ) : (
        <>
          <div className="map-wrapper" style={{ height: '350px', width: '100%', marginBottom: '20px' }}>
            <MapContainer center={mapCenter} zoom={18} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='Tiles &copy; Esri'
              />
              <FeatureGroup>
                <EditControl
                  position="topright"
                  onCreated={onCreated}
                  onEdited={onEdited}
                  onDeleted={onDeleted}
                  draw={{
                    rectangle: false, circle: false, circlemarker: false,
                    polyline: false, marker: false,
                    polygon: { allowIntersection: false, shapeOptions: { color: '#007bff' } }
                  }}
                />
              </FeatureGroup>
            </MapContainer>
          </div>

          <div className="controls">
            <div className="input-group">
              <label>Pitch: {pitch}°</label>
              <input type="range" min="10" max="60" value={pitch} onChange={(e) => setPitch(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Sheet Width: {width}mm</label>
              <input type="range" min="500" max="1000" value={width} onChange={(e) => setWidth(e.target.value)} />
            </div>
            <button onClick={calculateRoof} disabled={loading || !drawnCoords}>
              {loading ? "Calculating..." : "Calculate Roof"}
            </button>
          </div>

          {error && <div className="error">{error}</div>}

          {result && exteriorMeters && (
            <div className="results">
              <div className="stats">
                <h3>Order Summary</h3>
                <pre>{result.summary}</pre>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button onClick={downloadCSV} className="download-btn" style={{ flex: 1 }}>📥 Download CSV</button>
                  <button onClick={generateInvoice} className="download-btn" style={{ flex: 1, background: '#17a2b8' }}>🧾 Generate Invoice</button>
                </div>
              </div>
              
              <div className="visualizer">
                <h3>Shop Drawing</h3>
                <svg viewBox={svgViewBox} width="100%" height="auto" style={{background: '#f8f9fa', border: '1px solid #ccc'}}>
                  <polygon points={exteriorMeters.map(p => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke="black" strokeWidth="0.2" />
                  {result.sheets.map((sheet, i) => (
                    <line key={i} x1={sheet.start[0]} y1={sheet.start[1]} x2={sheet.end[0]} y2={sheet.end[1]} stroke="red" strokeWidth="0.1" opacity="0.6" />
                  ))}
                </svg>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
