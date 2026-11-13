import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'marwan-yasser-react-leaflet-draw';

const API_URL = "https://sheet-set-backend.onrender.com"; 

function App() {
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  
  // Default center (Sydney), will override with geolocation
  const [mapCenter, setMapCenter] = useState([-33.8688, 151.2093]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setMapCenter([position.coords.latitude, position.coords.longitude]);
      });
    }
  }, []);

  const latLngToMeters = (latLngs) => {
    const origin = latLngs[0];
    const R = 6371000; // Earth radius in meters
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

  // Calculate SVG bounds dynamically
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
      <header>
        <h1>📐 Sheet Set</h1>
        <p>Trace a roof to generate a cut list</p>
      </header>

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
                polygon: {
                  allowIntersection: false,
                  shapeOptions: { color: '#007bff' }
                }
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
        {!drawnCoords && <p style={{fontSize: '12px', color: 'gray', textAlign: 'center'}}>Use the polygon tool (top right of map) to trace the roof.</p>}
      </div>

      {error && <div className="error">{error}</div>}

      {result && exteriorMeters && (
        <div className="results">
          <div className="stats">
            <h3>Order Summary</h3>
            <pre>{result.summary}</pre>
            <button onClick={downloadCSV} className="download-btn">📥 Download Machine CSV</button>
          </div>
          
          <div className="visualizer">
            <h3>Shop Drawing</h3>
            <svg viewBox={svgViewBox} width="100%" height="auto" style={{background: '#f8f9fa', border: '1px solid #ccc'}}>
              {/* The actual building footprint */}
              <polygon 
                points={exteriorMeters.map(p => `${p[0]},${p[1]}`).join(' ')} 
                fill="none" stroke="black" strokeWidth="0.2" 
              />
              {/* The sheets */}
              {result.sheets.map((sheet, i) => (
                <line 
                  key={i} x1={sheet.start[0]} y1={sheet.start[1]} 
                  x2={sheet.end[0]} y2={sheet.end[1]} 
                  stroke="red" strokeWidth="0.1" opacity="0.6"
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
