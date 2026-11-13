import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Polyline, useMapEvents } from 'react-leaflet';
import { EditControl } from 'marwan-yasser-react-leaflet-draw';
import L from 'leaflet';
import 'leaflet-geosearch/dist/geosearch.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_URL = import.meta.env.VITE_API_URL || "https://sheet-set-backend.onrender.com"; 

// --- Toast Component ---
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#dc3545' : '#28a745', color: 'white',
      padding: '10px 20px', borderRadius: '8px', zIndex: 9999, fontWeight: 'bold',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }}>
      {message}
    </div>
  );
}

// --- Map Controls ---
function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({
      provider, style: 'bar', showMarker: true, showPopup: false,
      autoClose: true, retainZoomLevel: false, animateZoom: true,
      keepResult: false, searchLabel: 'Search address or suburb...',
    });
    map.addControl(searchControl);
    return () => map.removeControl(searchControl);
  }, [map]);
  return null;
}

function LocateControl() {
  const map = useMap();
  useEffect(() => {
    const locateControl = L.control({ position: 'topleft' });
    locateControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      div.innerHTML = '<button title="Locate Me" style="background:white; border:none; font-size:20px; padding:4px 8px; cursor:pointer; border-radius:4px;">🎯</button>';
      L.DomEvent.disableClickPropagation(div);
      div.onclick = () => map.locate({ setView: true, maxZoom: 20 });
      return div;
    };
    locateControl.addTo(map);
    return () => {
      locateControl.remove();
      map.off('locationfound');
      map.off('locationerror');
    };
  }, [map]);
  return null;
}

function MapClickHandler({ active, onClick }) {
  useMapEvents({
    click(e) {
      if (active) onClick(e);
    }
  });
  return null;
}

// --- Main App ---
export default function App() {
  // --- Core States ---
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  const [mapCenter, setMapCenter] = useState([-33.8688, 151.2093]);
  
  // --- UI States ---
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [showSettings, setShowSettings] = useState(false);
  const [showJobsPanel, setShowJobsPanel] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [jobAddress, setJobAddress] = useState("");

  // --- Calibration States ---
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [realWorldLength, setRealWorldLength] = useState("");
  const [scaleFactor, setScaleFactor] = useState(1);

  // --- Job Saving States ---
  const [savedJobs, setSavedJobs] = useState([]);
  
  // --- Settings State ---
  const [settings, setSettings] = useState({
    companyName: "Acme Roofing", abn: "12 345 678 901", phone: "0400 000 000",
    metalCostPerMeter: 15.00, laborRatePerSheet: 45.00,
    markupPercentage: 20.0, taxPercentage: 10.0, overhangMm: 150
  });

  // --- Initialization ---
  useEffect(() => {
    const savedSettings = localStorage.getItem('sheetSetSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...settings, ...parsed });
      } catch (e) { console.error(e); }
    }
    
    const saved = localStorage.getItem('sheetSetJobs');
    if (saved) {
      try { setSavedJobs(JSON.parse(saved)); } catch (e) { console.error(e); }
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]));
    }

    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('share');
    if (sharedData) {
      try {
        const decoded = JSON.parse(atob(sharedData));
        setJobAddress(decoded.address || "Shared Job");
        setPitch(decoded.pitch || 30);
        setWidth(decoded.width || 760);
        setExteriorMeters(decoded.exterior);
        setResult(decoded.result);
        setIsReadOnly(true);
        setToast({ message: "Loaded shared job", type: 'success' });
      } catch (e) {
        setToast({ message: "Invalid share link", type: 'error' });
      }
    }
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // --- Calibration Logic ---
  const handleMapClick = (e) => {
    if (!isCalibrating) return;
    if (calibrationPoints.length >= 2) setCalibrationPoints([e.latlng]); 
    else setCalibrationPoints([...calibrationPoints, e.latlng]);
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || !realWorldLength) {
      showToast("Please mark 2 points and enter the real length.", "error");
      return;
    }
    
    const p1 = calibrationPoints[0];
    const p2 = calibrationPoints[1];
    
    const metersArray = latLngToMeters([p1, p2], false);
    const distInMeters = Math.hypot(metersArray[1][0], metersArray[1][1]);
    
    if (distInMeters <= 0) {
       showToast("Points are too close together.", "error");
       return;
    }

    const factor = parseFloat(realWorldLength) / distInMeters;
    setScaleFactor(factor);
    setIsCalibrating(false);
    setCalibrationPoints([]);
    setRealWorldLength("");
    
    showToast("Scale calibrated: 1 map unit = " + factor.toFixed(2) + " actual meters", "success");
  };

  const latLngToMeters = (latLngs, applyScale = true) => {
    const origin = latLngs[0];
    const R = 6371000; 
    return latLngs.map((ll, index) => {
      const dLat = (ll.lat - origin.lat) * Math.PI / 180;
      const dLng = (ll.lng - origin.lng) * Math.PI / 180;
      let x = dLng * R * Math.cos(origin.lat * Math.PI / 180);
      let y = dLat * R;
      if (applyScale && scaleFactor !== 1) {
        x = x * scaleFactor;
        y = y * scaleFactor;
      }
      return [index === 0 ? 0 : x, index === 0 ? 0 : y];
    });
  };

  // --- Map Draw Logic ---
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
  };

  const calculateRoof = async () => {
    if (!drawnCoords) {
      showToast("Please draw a roof on the map first.", "error");
      return;
    }
    setLoading(true);
    setResult(null);

    const extMeters = latLngToMeters(drawnCoords, true);
    setExteriorMeters(extMeters);

    try {
      const response = await axios.post(API_URL + "/calculate", {
        exterior: extMeters,
        pitch_deg: pitch,
        sheet_width_mm: width,
        overhang_mm: parseFloat(settings.overhangMm)
      });
      setResult(response.data);
      showToast("Calculation successful", "success");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to connect to backend", "error");
    }
    setLoading(false);
  };

  // --- Job Save/Load/Share Logic ---
  const saveJob = () => {
    if (!result || !exteriorMeters) {
      showToast("Calculate a roof before saving.", "error");
      return;
    }
    const newJob = {
      id: Date.now().toString(),
      address: jobAddress || "Unknown Address",
      date: new Date().toLocaleDateString(),
      exterior: exteriorMeters,
      result: result,
      pitch, width
    };
    const updatedJobs = [newJob, ...savedJobs];
    setSavedJobs(updatedJobs);
    localStorage.setItem('sheetSetJobs', JSON.stringify(updatedJobs));
    showToast("Job saved", "success");
  };

  const loadJob = (job) => {
    setScaleFactor(1);
    setCalibrationPoints([]);
    setRealWorldLength("");
    
    setJobAddress(job.address);
    setPitch(job.pitch || 30);
    setWidth(job.width || 760);
    setExteriorMeters(job.exterior);
    setResult(job.result);
    setShowJobsPanel(false);
    setIsReadOnly(false);
    showToast("Job loaded", "success");
  };

  const deleteJob = (id, e) => {
    e.stopPropagation();
    const updated = savedJobs.filter(j => j.id !== id);
    setSavedJobs(updated);
    localStorage.setItem('sheetSetJobs', JSON.stringify(updated));
    showToast("Job deleted", "success");
  };

  const shareJob = () => {
    if (!result || !exteriorMeters) {
      showToast("Calculate a roof before sharing.", "error");
      return;
    }
    const data = {
      address: jobAddress, pitch, width, exterior: exteriorMeters,
      result: {
        summary: result.summary, csv_data: result.csv_data, sheets: result.sheets
      }
    };
    const encoded = btoa(JSON.stringify(data));
    
    const shareUrl = window.location.origin + window.location.pathname + "?share=" + encoded;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Share link copied to clipboard!", "success");
    }).catch(() => {
      prompt("Copy this share link:", shareUrl);
    });
  };

  const resetJob = () => {
    setDrawnCoords(null);
    setExteriorMeters(null);
    setResult(null);
    setJobAddress("");
    setScaleFactor(1);
    setCalibrationPoints([]);
    setRealWorldLength("");
    showToast("Ready for new job", "success");
  };

  // --- Invoice Logic ---
  const generateInvoice = () => {
    if (!result || !result.summary) return;
    let totalSheets = 0, totalMeters = 0;
    try {
      const sMatch = result.summary.match(/Total Sheets:\s*(\d+)/i);
      const mMatch = result.summary.match(/Linear Meters Ordered:\s*([\d.]+)/i);
      if (sMatch) totalSheets = parseInt(sMatch[1], 10);
      if (mMatch) totalMeters = parseFloat(mMatch[1]);
    } catch (e) { alert("System error parsing summary."); return; }

    const baseMaterial = totalMeters * parseFloat(settings.metalCostPerMeter);
    const baseLabor = totalSheets * parseFloat(settings.laborRatePerSheet);
    const subtotal = baseMaterial + baseLabor;
    const markup = subtotal * (parseFloat(settings.markupPercentage) / 100);
    const preTax = subtotal + markup;
    const tax = preTax * (parseFloat(settings.taxPercentage) / 100);
    const finalTotal = preTax + tax;

    const doc = new jsPDF();
    doc.setFontSize(22); doc.text(settings.companyName, 14, 20);
    
    doc.setFontSize(10); doc.text("ABN: " + settings.abn + " | Phone: " + settings.phone, 14, 28);
    doc.setFontSize(18); doc.text("INVOICE", 150, 20);
    doc.setFontSize(10); doc.text("Date: " + new Date().toLocaleDateString(), 150, 28);
    
    doc.setFontSize(12); doc.text("Job Address:", 14, 50);
    doc.setFontSize(10); doc.text(jobAddress || "Traced from map", 14, 56);

    doc.autoTable({
      startY: 70,
      head: [['Description', 'Qty', 'Rate', 'Total']],
      body: [
        ['Metal Coil Required', totalMeters.toFixed(2) + " m", "$" + settings.metalCostPerMeter, "$" + baseMaterial.toFixed(2)],
        ['Installation Labor', totalSheets + " sheets", "$" + settings.laborRatePerSheet, "$" + baseLabor.toFixed(2)]
      ],
      theme: 'grid', headStyles: { fillColor: [0, 123, 255] }
    });

    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(11);
    
    doc.text("Subtotal:", 130, finalY + 10); doc.text("$" + subtotal.toFixed(2), 180, finalY + 10, { align: 'right' });
    doc.text("Markup (" + settings.markupPercentage + "%):", 130, finalY + 18); doc.text("$" + markup.toFixed(2), 180, finalY + 18, { align: 'right' });
    doc.text("Tax (" + settings.taxPercentage + "%):", 130, finalY + 26); doc.text("$" + tax.toFixed(2), 180, finalY + 26, { align: 'right' });
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Total Due:", 130, finalY + 38); doc.text("$" + finalTotal.toFixed(2), 180, finalY + 38, { align: 'right' });
    
    doc.save("Invoice_" + (jobAddress || 'Job') + ".pdf");
  };

  // --- Render Helpers ---
  let svgViewBox = "0 0 100 100";
  if (exteriorMeters && exteriorMeters.length > 0) {
    const xs = exteriorMeters.map(p => p[0]);
    const ys = exteriorMeters.map(p => p[1]);
    svgViewBox = (Math.min(...xs) - 2) + " " + (Math.min(...ys) - 2) + " " + (Math.max(...xs) - Math.min(...xs) + 4) + " " + (Math.max(...ys) - Math.min(...ys) + 4);
  }

  return (
    <div className="container" style={{ maxWidth: '900px', paddingBottom: '50px' }}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '' })} />
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0 }}>📐 Sheet Set</h1>
          <p style={{ margin: 0, color: '#666' }}>{isReadOnly ? "View Only" : "Job Calculator"}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {!isReadOnly && (
            <button className="btn btn-secondary" onClick={() => setShowJobsPanel(!showJobsPanel)}>
              📁 Jobs ({savedJobs.length})
            </button>
          )}
          {!isReadOnly && (
            <button className="btn btn-secondary" onClick={() => setShowSettings(!showSettings)}>
              ⚙️ Settings
            </button>
          )}
        </div>
      </header>

      {/* JOBS PANEL */}
      {showJobsPanel && (
        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ccc' }}>
          <h3 style={{ marginTop: 0 }}>Saved Jobs</h3>
          {savedJobs.length === 0 ? <p>No saved jobs yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {savedJobs.map(job => {
                const sheetCount = (job.result?.summary || '').match(/Total Sheets:\s*(\d+)/i)?.[1] || '?';
                return (
                  <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <div onClick={() => loadJob(job)} style={{ cursor: 'pointer', flex: 1 }}>
                      <strong>{job.address}</strong>
                      <div style={{ fontSize: '12px', color: '#666' }}>{job.date} | {sheetCount} Sheets</div>
                    </div>
                    <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={(e) => deleteJob(job.id, e)}>Delete</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && !isReadOnly && (
        <form onSubmit={(e) => { e.preventDefault(); localStorage.setItem('sheetSetSettings', JSON.stringify(settings)); setShowSettings(false); showToast("Settings saved"); }} style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0 }}>Company Settings</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div className="input-group"><label>Company Name</label><input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} /></div>
            <div className="input-group"><label>ABN / Phone</label><input type="text" value={settings.abn} onChange={e => setSettings({...settings, abn: e.target.value})} /></div>
            <div className="input-group"><label>Metal Cost / m ($)</label><input type="number" value={settings.metalCostPerMeter} onChange={e => setSettings({...settings, metalCostPerMeter: e.target.value})} /></div>
            <div className="input-group"><label>Labor Rate / Sheet ($)</label><input type="number" value={settings.laborRatePerSheet} onChange={e => setSettings({...settings, laborRatePerSheet: e.target.value})} /></div>
            <div className="input-group"><label>Markup (%)</label><input type="number" value={settings.markupPercentage} onChange={e => setSettings({...settings, markupPercentage: e.target.value})} /></div>
            <div className="input-group"><label>Tax (%)</label><input type="number" value={settings.taxPercentage} onChange={e => setSettings({...settings, taxPercentage: e.target.value})} /></div>
          </div>
          <button type="submit" className="btn btn-success" style={{ marginTop: '15px' }}>Save Settings</button>
        </form>
      )}

      {/* MAIN CONTENT */}
      {!showSettings && (
        <>
          {!isReadOnly && (
            <div style={{ marginBottom: '15px' }}>
              <input 
                type="text" 
                placeholder="Enter Job Address or Client Name..." 
                value={jobAddress}
                onChange={e => setJobAddress(e.target.value)}
                style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '8px', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {!isReadOnly && (
            <div className="map-wrapper" style={{ height: '400px', width: '100%', marginBottom: '15px', position: 'relative' }}>
              <MapContainer center={mapCenter} zoom={18} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={22} maxNativeZoom={18} />
                <SearchControl />
                <LocateControl />
                
                <MapClickHandler active={isCalibrating} onClick={handleMapClick} />

                {isCalibrating && (
                  <>
                    {calibrationPoints.map((pt, i) => <Marker key={i} position={pt} />)}
                    {calibrationPoints.length === 2 && <Polyline positions={calibrationPoints} color="red" />}
                  </>
                )}

                {!isCalibrating && (
                  <FeatureGroup>
                    <EditControl
                      position="topright"
                      onCreated={onCreated} onEdited={onEdited} onDeleted={onDeleted}
                      draw={{ rectangle: false, circle: false, circlemarker: false, polyline: false, marker: false, polygon: { allowIntersection: false } }}
                    />
                  </FeatureGroup>
                )}
              </MapContainer>
              
              <div style={{ position: 'absolute', top: '10px', left: '50px', zIndex: 1000, background: 'white', padding: '10px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                {isCalibrating ? (
                  <div>
                    <p style={{ margin: '0 0 5px 0', fontSize: '12px' }}>Click 2 points on a known wall</p>
                    <input type="number" placeholder="Real length (m)" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ width: '100px', padding: '4px', marginBottom: '5px' }} />
                    <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={applyCalibration}>Apply</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px', marginLeft: '5px' }} onClick={() => setIsCalibrating(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '14px' }} onClick={() => setIsCalibrating(true)}>
                    📐 Calibrate Scale {scaleFactor !== 1 && "(" + scaleFactor.toFixed(2) + "x)"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CONTROLS */}
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Pitch: {pitch}°</label>
                <input type="range" min="10" max="60" value={pitch} onChange={e => setPitch(e.target.value)} />
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label>Sheet Width: {width}mm</label>
                <input type="range" min="500" max="1000" value={width} onChange={e => setWidth(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ flex: 1, height: '50px' }} onClick={calculateRoof} disabled={loading || !drawnCoords}>
                {loading ? "⏳ Calculating..." : "Calculate Roof"}
              </button>
            </div>
          )}

          {/* RESULTS */}
          {result && exteriorMeters && (
            <div className="results" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="stats" style={{ background: '#e9ecef', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Order Summary</h3>
                <pre style={{ background: 'transparent', padding: 0, margin: 0 }}>{result.summary}</pre>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap' }}>
                  <button className="btn btn-success" onClick={() => {
                    const blob = new Blob([result.csv_data], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'cut_list.csv'; a.click();
                  }}>📥 CSV</button>
                  
                  <button className="btn btn-primary" onClick={generateInvoice}>🧾 Invoice</button>
                  
                  {!isReadOnly && <button className="btn btn-secondary" onClick={saveJob}>💾 Save Job</button>}
                  <button className="btn btn-secondary" onClick={shareJob}>🔗 Share</button>
                  {!isReadOnly && <button className="btn btn-secondary" onClick={resetJob}>🔄 New Job</button>}
                </div>
              </div>
              
              <div className="visualizer" style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ccc' }}>
                <h3 style={{ marginTop: 0 }}>Shop Drawing</h3>
                <svg viewBox={svgViewBox} width="100%" height="auto">
                  <polygon points={exteriorMeters.map(p => p[0] + "," + p[1]).join(' ')} fill="none" stroke="black" strokeWidth="0.2" />
                  {result.sheets?.map((sheet, i) => (
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
                    <input type="number" placeholder="Real length (m)" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ width: '100px', padding: '4px', marginBottom: '5px' }} />
                    <button className="btn btn-primary" style
