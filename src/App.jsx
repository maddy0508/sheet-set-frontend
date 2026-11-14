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
    
    // Triangulate faces (compas might return quads/trapezoids)
    const triangles = [];
    faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) {
        triangles.push([face[0], face[i], face[i+1]]);
      }
    });

    const positions = new Float32Array(vertices.flat());
    const indices = new Uint32Array(triangles.flat());

    return { positions, indices };
  }, [vertices, faces]);

  if (!geometry) return null;

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={geometry.positions.length / 3} array={geometry.positions} itemSize={3} />
        <bufferAttribute attach="index" count={geometry.indices.length} array={geometry.indices} itemSize={1} />
      </bufferGeometry>
      <meshStandardMaterial color="#2A4360" side={2} flatShading={true} />
    </mesh>
  );
};

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  if (!message) return null;
  return <div className={"toast " + (type === 'error' ? 'error' : 'success')}>{message}</div>;
}

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({ provider, style: 'bar', showMarker: true, showPopup: false, autoClose: true, retainZoomLevel: false, animateZoom: true, keepResult: false, searchLabel: 'Search address...' });
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
      div.innerHTML = '<button title="Locate Me" style="background:white; border:none; font-size:20px; padding:6px 10px; cursor:pointer; color: var(--brand-slate);">🎯</button>';
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
  const [viewMode, setViewMode] = useState('2d'); // '2d' or '3d'
  
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  const [mapCenter, setMapCenter] = useState([-33.8688, 151.2093]);
  
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showSettings, setShowSettings] = useState(false);
  const [showJobsPanel, setShowJobsPanel] = useState(false);
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

    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('share');
    if (sharedData) {
      try {
        const decoded = JSON.parse(atob(sharedData));
        setJobAddress(decoded.address || "Shared Job"); setPitch(decoded.pitch || 30);
        setWidth(decoded.width || 760); setExteriorMeters(decoded.exterior);
        setResult(decoded.result); setIsReadOnly(true);
      } catch (e) { setToast({ message: "Invalid share link", type: 'error' }); }
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

  const loadJob = (job) => {
    setScaleFactor(1); setCalibrationPoints([]); setRealWorldLength("");
    setJobAddress(job.address); setPitch(job.pitch || 30); setWidth(job.width || 760);
    setExteriorMeters(job.exterior); setResult(job.result); setShowJobsPanel(false); setIsReadOnly(false);
    showToast("Job loaded", "success");
  };

  const deleteJob = (id, e) => {
    e.stopPropagation();
    const updated = savedJobs.filter(j => j.id !== id);
    setSavedJobs(updated); localStorage.setItem('sheetSetJobs', JSON.stringify(updated));
  };

  const shareJob = () => {
    if (!result || !exteriorMeters) { showToast("Calculate a roof before sharing.", "error"); return; }
    const data = { address: jobAddress, pitch, width, exterior: exteriorMeters, result: { summary: result.summary, csv_data: result.csv_data, sheets: result.sheets, mesh_vertices: result.mesh_vertices, mesh_faces: result.mesh_faces } };
    const encoded = btoa(JSON.stringify(data));
    const shareUrl = window.location.origin + window.location.pathname + "?share=" + encoded;
    navigator.clipboard.writeText(shareUrl).then(() => showToast("Share link copied!", "success")).catch(() => prompt("Copy this link:", shareUrl));
  };

  const resetJob = () => {
    setDrawnCoords(null); setExteriorMeters(null); setResult(null); setJobAddress("");
    setScaleFactor(1); setCalibrationPoints([]); setRealWorldLength("");
    showToast("Ready for new job", "success");
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
      
      <header>
        <div className="logo-container">
          {/* Logo completely removed as requested */}
          <div>
            <h1 className="header-title">SHEET SET</h1>
            <p className="header-subtitle">Job Calculator</p>
          </div>
        </div>
        <div className="header-actions">
          {!isReadOnly && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowJobsPanel(!showJobsPanel)}>📁 Jobs</button>
              <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>⚙️ Settings</button>
            </>
          )}
        </div>
      </header>

      {showJobsPanel && (
        <div className="section-padding" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--brand-slate)' }}>Saved Jobs</h3>
          {savedJobs.length === 0 ? <p>No saved jobs yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {savedJobs.map(job => (
                <div key={job.id} className="job-item" onClick={() => loadJob(job)}>
                  <div><strong>{job.address}</strong><small>{job.date}</small></div>
                  <button className="btn btn-danger btn-sm" onClick={(e) => deleteJob(job.id, e)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showSettings && !isReadOnly && (
        <div className="section-padding" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-light)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--brand-slate)' }}>Settings</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="input-group"><label>Company Name</label><input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} /></div>
            <div className="input-group"><label>Phone</label><input type="text" value={settings.abn} onChange={e => setSettings({...settings, abn: e.target.value})} /></div>
            <div className="input-group"><label>Metal Cost / m ($)</label><input type="number" value={settings.metalCostPerMeter} onChange={e => setSettings({...settings, metalCostPerMeter: e.target.value})} /></div>
            <div className="input-group"><label>Labor Rate / Sheet ($)</label><input type="number" value={settings.laborRatePerSheet} onChange={e => setSettings({...settings, laborRatePerSheet: e.target.value})} /></div>
            <div className="input-group"><label>Markup (%)</label><input type="number" value={settings.markupPercentage} onChange={e => setSettings({...settings, markupPercentage: e.target.value})} /></div>
            <div className="input-group"><label>Tax (%)</label><input type="number" value={settings.taxPercentage} onChange={e => setSettings({...settings, taxPercentage: e.target.value})} /></div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '10px' }} onClick={() => { localStorage.setItem('sheetSetSettings', JSON.stringify(settings)); setShowSettings(false); showToast("Settings saved"); }}>Save Settings</button>
        </div>
      )}

      {!showSettings && !showJobsPanel && (
        <>
          {!isReadOnly && (
            <div className="mode-toggle">
              <button className={mapMode === 'draw' ? 'active' : ''} onClick={() => { setMapMode('draw'); setIsCalibrating(false); }}>📐 Draw Roof</button>
              <button className={mapMode === 'calibrate' ? 'active' : ''} onClick={() => { setMapMode('calibrate'); setIsCalibrating(true); setCalibrationPoints([]); }}>📏 Calibrate Scale</button>
            </div>
          )}

          <div className="map-container-wrapper">
            {!isReadOnly && (
              <div className="instruction-banner">
                {mapMode === 'calibrate' ? "Click 2 points on a known wall, enter the length below, and hit Apply." : !drawnCoords ? "Use the polygon tool in the top right to trace the roof." : "Shape drawn. Click Calculate Roof below."}
              </div>
            )}

            <div className="map-wrapper">
              <MapContainer center={mapCenter} zoom={18} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={22} maxNativeZoom={18} />
                <SearchControl />
                <LocateControl />
                <MapClickHandler active={isCalibrating} onClick={handleMapClick} />
                {isCalibrating && (
                  <>
                    {calibrationPoints.map((pt, i) => <Marker key={i} position={pt} />)}
                    {calibrationPoints.length === 2 && <Polyline positions={calibrationPoints} color="var(--brand-slate)" />}
                  </>
                )}
                {!isCalibrating && (
                  <FeatureGroup>
                    <EditControl position="topright" onCreated={onCreated} onEdited={onEdited} onDeleted={onDeleted} draw={{ rectangle: false, circle: false, circlemarker: false, polyline: false, marker: false, polygon: { allowIntersection: false, shapeOptions: { color: 'var(--brand-slate)' } } }} />
                  </FeatureGroup>
                )}
              </MapContainer>
            </div>

            {mapMode === 'calibrate' && (
              <div className="calibration-panel" style={{ margin: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="number" placeholder="Real length (meters)" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={applyCalibration}>Apply</button>
              </div>
            )}
          </div>

          {!isReadOnly && (
            <div className="section-padding" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div className="input-group" style={{ flex: 1 }}><label>Pitch: {pitch}°</label><input type="range" min="10" max="60" value={pitch} onChange={e => setPitch(e.target.value)} /></div>
                <div className="input-group" style={{ flex: 1 }}><label>Sheet Width: {width}mm</label><input type="range" min="500" max="1000" value={width} onChange={e => setWidth(e.target.value)} /></div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '18px' }} onClick={calculateRoof} disabled={loading || !drawnCoords}>{loading ? "⏳ Calculating..." : "Calculate Roof"}</button>
            </div>
          )}

          {result && exteriorMeters && (
            <div className="results">
              <div className="stats-card">
                <h3 style={{ marginTop: 0, color: 'var(--brand-slate)' }}>Order Summary</h3>
                <pre>{result.summary}</pre>
                <div className="actions-grid">
                  <button className="btn btn-success" onClick={() => { const blob = new Blob([result.csv_data], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cut_list.csv'; a.click(); }}>📥 CSV</button>
                  <button className="btn btn-primary" onClick={generateInvoice}>🧾 Invoice</button>
                  {!isReadOnly && <button className="btn btn-secondary" onClick={saveJob}>💾 Save Job</button>}
                  <button className="btn btn-secondary" onClick={shareJob}>🔗 Share</button>
                  {!isReadOnly && <button className="btn btn-secondary" onClick={resetJob}>🔄 New Job</button>}
                </div>
              </div>
              
              <div className="stats-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, border: 'none', padding: 0, color: 'var(--brand-slate)' }}>Visualizer</h3>
                  <div className="mode-toggle" style={{ margin: 0, border: 'none' }}>
                    <button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}>2D Plan</button>
                    <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D View</button>
                  </div>
                </div>

                {viewMode === '2d' ? (
                  <svg viewBox={svgViewBox} width="100%" height="auto" style={{border: '1px solid var(--border-light)', borderRadius: '8px'}}>
                    <polygon points={exteriorMeters.map(p => p[0] + "," + p[1]).join(' ')} fill="none" stroke="var(--charcoal)" strokeWidth="0.2" />
                    {result.sheets?.map((sheet, i) => (<line key={i} x1={sheet.start[0]} y1={sheet.start[1]} x2={sheet.end[0]} y2={sheet.end[1]} stroke="var(--brand-slate)" strokeWidth="0.15" opacity="0.8" />))}
                  </svg>
                ) : (
                  <div style={{ height: '400px', width: '100%', background: '#111', borderRadius: '8px', overflow: 'hidden' }}>
                    <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
                      <ambientLight intensity={0.6} />
                      <directionalLight position={[10, 10, 10]} intensity={0.8} />
                      <RoofMesh vertices={result.mesh_vertices} faces={result.mesh_faces} />
                      <OrbitControls />
                    </Canvas>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
