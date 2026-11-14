import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Polyline, useMapEvents } from 'react-leaflet';
import { EditControl } from 'marwan-yasser-react-leaflet-draw';
import L from 'leaflet';
import 'leaflet-geosearch/dist/geosearch.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const API_URL = import.meta.env.VITE_API_URL || "https://sheet-set-backend.onrender.com"; 

// --- 3D Mesh Component ---
const RoofMesh = ({ vertices, faces }) => {
  const geometry = useMemo(() => {
    if (!vertices || !faces) return null;
    const triangles = [];
    faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) triangles.push([face[0], face[i], face[i+1]]);
    });
    return {
      positions: new Float32Array(vertices.flat()),
      indices: new Uint32Array(triangles.flat())
    };
  }, [vertices, faces]);

  if (!geometry) return null;

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={geometry.positions.length / 3} array={geometry.positions} itemSize={3} />
        <bufferAttribute attach="index" count={geometry.indices.length} array={geometry.indices} itemSize={1} />
      </bufferGeometry>
      <meshStandardMaterial color="#3D5A7A" side={2} flatShading={true} metalness={0.5} roughness={0.5} />
    </mesh>
  );
};

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? 'var(--danger)' : 'var(--success)', color: 'white',
      padding: '12px 24px', borderRadius: '8px', zIndex: 9999, fontWeight: '600',
      boxShadow: 'var(--shadow-lg)', backdropFilter: 'blur(10px)'
    }}>
      {message}
    </div>
  );
}

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({ 
      provider, style: 'bar', showMarker: true, showPopup: false, 
      autoClose: true, retainZoomLevel: false, animateZoom: true, 
      keepResult: false, searchLabel: 'Search address...',
    });
    map.addControl(searchControl);
    return () => map.removeControl(searchControl);
  }, [map]);
  return null;
}

function LocateControl() {
  const map = useMap();
  useEffect(() => {
    const locateControl = L.control({ position: 'bottomleft' });
    locateControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.innerHTML = '<button title="Locate Me" style="background:#1A1D24; border:1px solid rgba(255,255,255,0.1); color:white; font-size:18px; padding:12px; cursor:pointer; border-radius:50%; box-shadow:0 4px 12px rgba(0,0,0,0.3);">🎯</button>';
      L.DomEvent.disableClickPropagation(div);
      div.onclick = () => map.locate({ setView: true, maxZoom: 20 });
      return div;
    };
    locateControl.addTo(map);
    return () => { locateControl.remove(); map.off('locationfound'); map.off('locationerror'); };
  }, [map]);
  return null;
}

function MapClickHandler({ active, onClick }) {
  useMapEvents({ click(e) { if (active) onClick(e); } });
  return null;
}

export default function App() {
  const [mapMode, setMapMode] = useState('draw');
  const [viewMode, setViewMode] = useState('2d');
  const [showResults, setShowResults] = useState(false);
  
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  const [mapCenter, setMapCenter] = useState([-33.8688, 151.2093]);
  
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showSettings, setShowSettings] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [jobAddress, setJobAddress] = useState("");
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [realWorldLength, setRealWorldLength] = useState("");
  const [scaleFactor, setScaleFactor] = useState(1);
  const [savedJobs, setSavedJobs] = useState([]);
  
  const [settings, setSettings] = useState({
    companyName: "Mitchell's Metal Roofing", abn: "0435 918 594", phone: "",
    metalCostPerMeter: 15.00, laborRatePerSheet: 45.00, markupPercentage: 20.0, taxPercentage: 10.0, overhangMm: 150
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('sheetSetSettings');
    if (savedSettings) { try { setSettings({ ...settings, ...JSON.parse(savedSettings) }); } catch (e) {} }
    const saved = localStorage.getItem('sheetSetJobs');
    if (saved) { try { setSavedJobs(JSON.parse(saved)); } catch (e) {} }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]));
    }
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleMapClick = (e) => {
    if (!isCalibrating) return;
    if (calibrationPoints.length >= 2) setCalibrationPoints([e.latlng]); 
    else setCalibrationPoints([...calibrationPoints, e.latlng]);
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || !realWorldLength) { showToast("Please mark 2 points and enter the real length.", "error"); return; }
    const p1 = calibrationPoints[0], p2 = calibrationPoints[1];
    const metersArray = latLngToMeters([p1, p2], false);
    const distInMeters = Math.hypot(metersArray[1][0], metersArray[1][1]);
    if (distInMeters <= 0) { showToast("Points are too close.", "error"); return; }
    setScaleFactor(parseFloat(realWorldLength) / distInMeters);
    setIsCalibrating(false); setMapMode('draw'); setCalibrationPoints([]); setRealWorldLength("");
    showToast("Scale calibrated successfully", "success");
  };

  const latLngToMeters = (latLngs, applyScale = true) => {
    const origin = latLngs[0], R = 6371000; 
    return latLngs.map((ll, index) => {
      const dLat = (ll.lat - origin.lat) * Math.PI / 180, dLng = (ll.lng - origin.lng) * Math.PI / 180;
      let x = dLng * R * Math.cos(origin.lat * Math.PI / 180), y = dLat * R;
      if (applyScale && scaleFactor !== 1) { x = x * scaleFactor; y = y * scaleFactor; }
      return [index === 0 ? 0 : x, index === 0 ? 0 : y];
    });
  };

  const onCreated = (e) => setDrawnCoords(e.layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng })));
  const onEdited = (e) => e.layers.eachLayer((layer) => setDrawnCoords(layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng }))));
  const onDeleted = () => { setDrawnCoords(null); setExteriorMeters(null); setResult(null); };

  const calculateRoof = async () => {
    if (!drawnCoords) { showToast("Please draw a roof on the map first.", "error"); return; }
    setLoading(true); setResult(null);
    const extMeters = latLngToMeters(drawnCoords, true);
    setExteriorMeters(extMeters);

    try {
      const response = await axios.post(API_URL + "/calculate", { exterior: extMeters, pitch_deg: pitch, sheet_width_mm: width, overhang_mm: parseFloat(settings.overhangMm) });
      setResult(response.data);
      setShowResults(true);
      showToast("Calculation successful", "success");
    } catch (err) { showToast(err.response?.data?.detail || "Failed to connect to backend", "error"); }
    setLoading(false);
  };

  const saveJob = () => {
    if (!result || !exteriorMeters) { showToast("Calculate a roof before saving.", "error"); return; }
    const newJob = { id: Date.now().toString(), address: jobAddress || "Unknown Address", date: new Date().toLocaleDateString(), exterior: exteriorMeters, result, pitch, width };
    const updatedJobs = [newJob, ...savedJobs];
    setSavedJobs(updatedJobs); localStorage.setItem('sheetSetJobs', JSON.stringify(updatedJobs));
    showToast("Job saved", "success");
  };

  const generateInvoice = () => {
    if (!result || !result.summary) return;
    let totalSheets = 0, totalMeters = 0;
    try {
      const sMatch = result.summary.match(/Total Sheets:\s*(\d+)/i), mMatch = result.summary.match(/Linear Meters Ordered:\s*([\d.]+)/i);
      if (sMatch) totalSheets = parseInt(sMatch[1], 10);
      if (mMatch) totalMeters = parseFloat(mMatch[1]);
    } catch (e) { alert("System error parsing summary."); return; }

    const baseMaterial = totalMeters * parseFloat(settings.metalCostPerMeter), baseLabor = totalSheets * parseFloat(settings.laborRatePerSheet);
    const subtotal = baseMaterial + baseLabor, markup = subtotal * (parseFloat(settings.markupPercentage) / 100);
    const preTax = subtotal + markup, tax = preTax * (parseFloat(settings.taxPercentage) / 100), finalTotal = preTax + tax;

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text(settings.companyName, 14, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Phone: " + settings.abn, 14, 28);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("INVOICE", 150, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Date: " + new Date().toLocaleDateString(), 150, 28);
    doc.setFontSize(12); doc.text("Job Address:", 14, 50); doc.setFontSize(10); doc.text(jobAddress || "Traced from map", 14, 56);

    doc.autoTable({
      startY: 70, head: [['Description', 'Qty', 'Rate', 'Total']],
      body: [['Metal Coil Required', totalMeters.toFixed(2) + " m", "$" + settings.metalCostPerMeter, "$" + baseMaterial.toFixed(2)], ['Installation Labor', totalSheets + " sheets", "$" + settings.laborRatePerSheet, "$" + baseLabor.toFixed(2)]],
      theme: 'grid', headStyles: { fillColor: [42, 67, 96] }
    });

    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(11);
    doc.text("Subtotal:", 130, finalY + 10); doc.text("$" + subtotal.toFixed(2), 180, finalY + 10, { align: 'right' });
    doc.text("Markup (" + settings.markupPercentage + "%):", 130, finalY + 18); doc.text("$" + markup.toFixed(2), 180, finalY + 18, { align: 'right' });
    doc.text("Tax (" + settings.taxPercentage + "%):", 130, finalY + 26); doc.text("$" + tax.toFixed(2), 180, finalY + 26, { align: 'right' });
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Total Due:", 130, finalY + 38); doc.text("$" + finalTotal.toFixed(2), 180, finalY + 38, { align: 'right' });
    doc.save("Invoice_" + (jobAddress || 'Job') + ".pdf");
  };

  let svgViewBox = "0 0 100 100";
  if (exteriorMeters && exteriorMeters.length > 0) {
    const xs = exteriorMeters.map(p => p[0]), ys = exteriorMeters.map(p => p[1]);
    svgViewBox = (Math.min(...xs) - 2) + " " + (Math.min(...ys) - 2) + " " + (Math.max(...xs) - Math.min(...xs) + 4) + " " + (Math.max(...ys) - Math.min(...ys) + 4);
  }

  return (
    <div className="container">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />
      
      {/* HEADER */}
      <header>
        <div>
          <h1 className="header-title">SHEET SET</h1>
          <p className="header-subtitle">Mitchell's Metal Roofing</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>⚙️ Settings</button>
        </div>
      </header>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="results-overlay">
          <div className="results-card">
            <h3 style={{ marginTop: 0 }}>Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div className="input-group"><label>Company Name</label><input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} /></div>
              <div className="input-group"><label>Phone</label><input type="text" value={settings.abn} onChange={e => setSettings({...settings, abn: e.target.value})} /></div>
              <div className="input-group"><label>Metal Cost / m ($)</label><input type="number" value={settings.metalCostPerMeter} onChange={e => setSettings({...settings, metalCostPerMeter: e.target.value})} /></div>
              <div className="input-group"><label>Labor Rate / Sheet ($)</label><input type="number" value={settings.laborRatePerSheet} onChange={e => setSettings({...settings, laborRatePerSheet: e.target.value})} /></div>
              <div className="input-group"><label>Markup (%)</label><input type="number" value={settings.markupPercentage} onChange={e => setSettings({...settings, markupPercentage: e.target.value})} /></div>
              <div className="input-group"><label>Tax (%)</label><input type="number" value={settings.taxPercentage} onChange={e => setSettings({...settings, taxPercentage: e.target.value})} /></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { localStorage.setItem('sheetSetSettings', JSON.stringify(settings)); setShowSettings(false); showToast("Settings saved"); }}>Save Settings</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* RESULTS MODAL */}
      {showResults && result && exteriorMeters && (
        <div className="results-overlay">
          <div className="results-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Order Summary</h3>
              <button className="btn btn-secondary" onClick={() => setShowResults(false)}>✕ Close</button>
            </div>
            
            <pre>{result.summary}</pre>
            
            <div className="actions-grid">
              <button className="btn btn-success" onClick={() => { const blob = new Blob([result.csv_data], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cut_list.csv'; a.click(); }}>📥 CSV</button>
              <button className="btn btn-primary" onClick={generateInvoice}>🧾 Invoice</button>
              <button className="btn btn-secondary" onClick={saveJob}>💾 Save Job</button>
            </div>
            
            <div style={{ marginTop: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>Visualizer</h3>
                <div className="map-mode-toggle">
                  <button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D</button>
                  <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D</button>
                </div>
              </div>

              {viewMode === '2d' ? (
                <svg viewBox={svgViewBox} width="100%" height="auto" style={{border: '1px solid var(--border-light)', borderRadius: '8px', background: '#111'}}>
                  <polygon points={exteriorMeters.map(p => p[0] + "," + p[1]).join(' ')} fill="none" stroke="#3D5A7A" strokeWidth="0.3" />
                  {result.sheets?.map((sheet, i) => (<line key={i} x1={sheet.start[0]} y1={sheet.start[1]} x2={sheet.end[0]} y2={sheet.end[1]} stroke="#E8EBEE" strokeWidth="0.15" opacity="0.6" />))}
                </svg>
              ) : (
                <div style={{ height: '400px', width: '100%', background: '#111', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                  {result.mesh_vertices ? (
                    <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
                      <ambientLight intensity={0.6} />
                      <directionalLight position={[10, 10, 10]} intensity={0.8} />
                      <RoofMesh vertices={result.mesh_vertices} faces={result.mesh_faces} />
                      <OrbitControls />
                    </Canvas>
                  ) : (
                    <p style={{ textAlign: 'center', padding: '20px' }}>
                      🚧 3D view requires the updated backend.<br/>
                      Please deploy the new backend code to render the 3D model.<br/>
                      (2D view is still fully functional)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN MAP */}
      <div className="map-container-wrapper">
        <MapContainer center={mapCenter} zoom={18} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" maxZoom={22} maxNativeZoom={20} />
          <SearchControl />
          <LocateControl />
          <MapClickHandler active={isCalibrating} onClick={handleMapClick} />

          {isCalibrating && (
            <>
              {calibrationPoints.map((pt, i) => <Marker key={i} position={pt} />)}
              {calibrationPoints.length === 2 && <Polyline positions={calibrationPoints} color="#3D5A7A" />}
            </>
          )}

          {!isCalibrating && (
            <FeatureGroup>
              <EditControl 
                position="topright" 
                onCreated={onCreated} 
                onEdited={onEdited} 
                onDeleted={onDeleted} 
                draw={{ 
                  rectangle: false, circle: false, circlemarker: false, polyline: false, marker: false, 
                  polygon: { allowIntersection: false, shapeOptions: { color: '#3D5A7A' } }
                }} 
              />
            </FeatureGroup>
          )}
        </MapContainer>

        <div className="map-overlay-top">
          <div className="map-mode-toggle">
            <button className={mapMode === 'draw' ? 'active' : ''} onClick={() => { setMapMode('draw'); setIsCalibrating(false); }}>Draw Roof</button>
            <button className={mapMode === 'calibrate' ? 'active' : ''} onClick={() => { setMapMode('calibrate'); setIsCalibrating(true); setCalibrationPoints([]); }}>Calibrate</button>
          </div>
          <div style={{ background: 'rgba(26,29,36,0.9)', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <input type="text" placeholder="Enter Job Address..." value={jobAddress} onChange={e => setJobAddress(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '200px' }} />
          </div>
        </div>

        {mapMode === 'calibrate' && (
          <div className="map-actions" style={{ bottom: '20px', left: '20px', right: 'auto' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: '12px', display: 'flex', gap: '10px', border: '1px solid var(--border-light)' }}>
              <input type="number" placeholder="Real length (m)" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ width: '120px', padding: '8px' }} />
              <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={applyCalibration}>Apply</button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM INPUT BAR */}
      <div className="bottom-sheet">
        <div className="input-row">
          <div className="input-group">
            <label>Pitch: {pitch}°</label>
            <input type="range" min="10" max="60" value={pitch} onChange={e => setPitch(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Sheet Width: {width}mm</label>
            <input type="range" min="500" max="1000" value={width} onChange={e => setWidth(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ padding: '18px', fontSize: '18px', width: '100%' }} onClick={calculateRoof} disabled={loading || !drawnCoords}>
          {loading ? "⏳ Analyzing Geometry..." : "Calculate Roof"}
        </button>
      </div>
    </div>
  );
}
