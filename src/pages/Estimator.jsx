import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Polyline, useMapEvents } from 'react-leaflet';
import { EditControl } from 'marwan-yasser-react-leaflet-draw';
import { useLocation } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet-geosearch/dist/geosearch.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import RoofMesh from '../RoofMesh';
import InvoiceForm from '../components/InvoiceForm';

const API_URL = import.meta.env.VITE_API_URL || "https://sheet-set-backend.onrender.com";

// --- BULLETPROOF MAP SIZING FIX ---
function MapResizer() {
  const map = useMap();
  const location = useLocation();

  useEffect(() => {
    // Force resize on route change
    const timer = setTimeout(() => map.invalidateSize(), 250);
    
    // Observe physical size changes (e.g., keyboard opening, orientation change)
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(map.getContainer());
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [map, location.pathname]);

  return null;
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
      div.innerHTML = '<button style="background:#283030; border:1px solid #405860; color:#E8E8E8; font-size:18px; padding:10px; cursor:pointer; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.5);">🎯</button>';
      L.DomEvent.disableClickPropagation(div);
      div.onclick = () => map.locate({ setView: true, maxZoom: 20 });
      return div;
    };
    locateControl.addTo(map);
    return () => { locateControl.remove(); map.off('locationfound'); map.off('locationerror'); };
  }, [map]);
  return null;
}

function MapClickHandler({ activeTool, onClick }) {
  useMapEvents({ 
    click(e) { 
      if (activeTool === 'auto' || activeTool === 'calibrate') onClick(e); 
    } 
  });
  return null;
}

export default function Estimator() {
  const [inputMode, setInputMode] = useState('map');
  const [mapMode, setMapMode] = useState('draw');
  const [viewMode, setViewMode] = useState('2d');
  const [showResults, setShowResults] = useState(false);
  const [activeTool, setActiveTool] = useState('none'); 
  
  const [pitch, setPitch] = useState(30);
  const [width, setWidth] = useState(760);
  const [manualWidth, setManualWidth] = useState(10);
  const [manualLength, setManualLength] = useState(20);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [drawnCoords, setDrawnCoords] = useState(null);
  const [exteriorMeters, setExteriorMeters] = useState(null);
  const [mapCenter, setMapCenter] = useState([-27.5598, 151.9507]);
  
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [realWorldLength, setRealWorldLength] = useState("");
  const [scaleFactor, setScaleFactor] = useState(1);

  const [showInvoice, setShowInvoice] = useState(false);

  const drawControlRef = useRef(null);
  const featureGroupRef = useRef(null);
  
  const [settings, setSettings] = useState({ companyName: "Mitchell's Metal Roofing", abn: "0435 918 594", metalCostPerMeter: 15.00, laborRatePerSheet: 45.00, markupPercentage: 20.0, taxPercentage: 10.0, overhangMm: 150 });

  useEffect(() => {
    const savedSettings = localStorage.getItem('sheetSetSettings');
    if (savedSettings) { try { setSettings({ ...settings, ...JSON.parse(savedSettings) }); } catch (e) {} }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]));
    }
  }, []);

  const handleMapClick = (e) => {
    if (activeTool === 'calibrate') {
      if (calibrationPoints.length === 2) setCalibrationPoints([calibrationPoints[0], e.latlng]);
      else setCalibrationPoints([...calibrationPoints, e.latlng]);
    } else if (activeTool === 'auto') {
      handleAutoOutlineClick(e);
    }
  };

  const handleAutoOutlineClick = async (e) => {
    setActiveTool('none'); setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/get-footprint?lat=${e.latlng.lat}&lng=${e.latlng.lng}`);
      if (res.data.error) alert(res.data.error);
      else {
        if (featureGroupRef.current) featureGroupRef.current.clearLayers();
        const polygon = L.polygon(res.data.polygon.map(p => [p.lat, p.lng]), { color: '#E8E8E8', weight: 3 });
        featureGroupRef.current.addLayer(polygon);
        onCreated({ layer: polygon });
      }
    } catch (err) { alert("Failed to fetch footprint. Check backend connection."); }
    setLoading(false);
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || !realWorldLength) return;
    const p1 = calibrationPoints[0], p2 = calibrationPoints[1];
    const metersArray = latLngToMeters([p1, p2], false);
    const distInMeters = Math.hypot(metersArray[1][0], metersArray[1][1]);
    if (distInMeters <= 0) return;
    setScaleFactor(parseFloat(realWorldLength) / distInMeters);
    setActiveTool('none'); setMapMode('draw'); setCalibrationPoints([]); setRealWorldLength("");
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

  const onCreated = (e) => {
    setDrawnCoords(e.layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng })));
    setActiveTool('none');
  };
  const onEdited = (e) => e.layers.eachLayer((layer) => setDrawnCoords(layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng }))));
  const onDeleted = () => { setDrawnCoords(null); setExteriorMeters(null); setResult(null); setActiveTool('none'); };

  const calculateRoof = async () => {
    let extMeters = [];
    if (inputMode === 'map') {
      if (!drawnCoords) return;
      extMeters = latLngToMeters(drawnCoords, true);
    } else {
      const w = parseFloat(manualWidth), l = parseFloat(manualLength);
      if (isNaN(w) || isNaN(l) || w <= 0 || l <= 0) return alert("Please enter valid dimensions");
      extMeters = [[0,0], [w,0], [w,l], [0,l]];
    }
    setLoading(true); setResult(null); setExteriorMeters(extMeters);
    try {
      const response = await axios.post(API_URL + "/calculate", {
        exterior: extMeters, pitch_deg: pitch, sheet_width_mm: width, overhang_mm: parseFloat(settings.overhangMm)
      });
      setResult(response.data); setShowResults(true);
    } catch (err) {
      const raw = err.response?.data?.detail || err.message || "";
      if (raw.includes("POLYGONIZATION_FAILED")) alert("Calculation Failed:\n\nYour shape crosses over itself or has a gap. Please delete it and try again.");
      else if (raw.includes("CGAL_SKELETON_FAILED")) alert("Calculation Failed:\n\nThis roof shape is too complex for our engine. Try simplifying the corners.");
      else alert("Calculation Failed:\n\n" + raw);
    }
    setLoading(false);
  };

  const activateTool = (tool) => {
    setActiveTool(tool);
    if (drawControlRef.current) {
      drawControlRef.current._toolbars.draw._modes.polygon.handler.disable();
      drawControlRef.current._toolbars.edit._modes.edit.handler.disable();
      drawControlRef.current._toolbars.edit._modes.remove.handler.disable();
    }
    if (tool === 'draw') drawControlRef.current._toolbars.draw._modes.polygon.handler.enable();
    else if (tool === 'edit') { drawControlRef.current._toolbars.edit._modes.edit.handler.enable(); alert("Tap the shape to show the drag handles."); }
    else if (tool === 'delete') drawControlRef.current._toolbars.edit._modes.remove.handler.enable();
  };

  const saveJob = () => {
    if (!result) return;
    const name = prompt("Enter a name for this job:", "Job " + new Date().toLocaleDateString());
    if (!name) return;
    const saved = JSON.parse(localStorage.getItem('sheetSetJobs') || '[]');
    saved.push({ name, result, exteriorMeters, pitch, width, settings });
    localStorage.setItem('sheetSetJobs', JSON.stringify(saved));
    alert("Job saved to browser.");
  };

  const shareJob = () => {
    if (!result) return;
    const data = { result, exteriorMeters };
    const encoded = btoa(JSON.stringify(data));
    const url = `${window.location.origin}${window.location.pathname}?job=${encoded}`;
    navigator.clipboard.writeText(url).then(() => alert("Share link copied!")).catch(() => prompt("Copy this link:", url));
  };

  let svgViewBox = "0 0 100 100";
  if (exteriorMeters && exteriorMeters.length > 0) {
    const xs = exteriorMeters.map(p => p[0]), ys = exteriorMeters.map(p => p[1]);
    svgViewBox = (Math.min(...xs) - 2) + " " + (Math.min(...ys) - 2) + " " + (Math.max(...xs) - Math.min(...xs) + 4) + " " + (Math.max(...ys) - Math.min(...ys) + 4);
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      
      <div className="map-container-wrapper" style={{ flex: 1, opacity: inputMode === 'manual' ? 0.3 : 1, pointerEvents: inputMode === 'manual' ? 'none' : 'auto' }}>
        <MapContainer center={mapCenter} zoom={19} style={{ height: '100%', width: '100%' }}>
          
          <MapResizer />

          <TileLayer 
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" 
            attribution='&copy; Google'
            maxZoom={22} 
            maxNativeZoom={20}
          />
          
          <SearchControl /> <LocateControl /> 
          <MapClickHandler activeTool={activeTool} onClick={handleMapClick} />
          
          {activeTool === 'calibrate' && (<>{calibrationPoints.map((pt, i) => <Marker key={i} position={pt} />)}{calibrationPoints.length === 2 && <Polyline positions={calibrationPoints} color="#E8E8E8" />}</>)}
          
          {!showResults && (
            <FeatureGroup ref={featureGroupRef}>
              <EditControl 
                position="topright" onCreated={onCreated} onEdited={onEdited} onDeleted={onDeleted} 
                onMounted={(control) => drawControlRef.current = control} 
                draw={{ rectangle: false, circle: false, circlemarker: false, polyline: false, marker: false, polygon: { allowIntersection: false, shapeOptions: { color: '#E8E8E8', weight: 3 } } }} 
              />
            </FeatureGroup>
          )}
        </MapContainer>

        {!showResults && inputMode === 'map' && (
          <div className="floating-toolbar">
            <button className={`tool-btn ${activeTool === 'draw' ? 'active' : ''}`} onClick={() => activateTool('draw')} title="Draw">⬡</button>
            <button className={`tool-btn ${activeTool === 'edit' ? 'active' : ''}`} onClick={() => activateTool('edit')} title="Edit">✏️</button>
            <button className={`tool-btn ${activeTool === 'delete' ? 'active' : ''}`} onClick={() => activateTool('delete')} title="Delete" style={{ color: '#ff4444', borderColor: 'rgba(255,68,68,0.3)' }}>🗑️</button>
            <button className={`tool-btn ${activeTool === 'auto' ? 'active' : ''}`} onClick={() => activateTool('auto')} title="Auto-Outline" style={{ color: '#00E676', borderColor: 'rgba(0,230,118,0.3)' }}>⚡</button>
          </div>
        )}
      </div>

      {!showResults && (
        <div className="bottom-sheet">
          {mapMode === 'draw' && (
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px', marginBottom: '10px' }}>
              <button style={{ flex: 1, padding: '8px', background: inputMode === 'map' ? 'var(--silver-mid)' : 'transparent', color: inputMode === 'map' ? '#000' : '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }} onClick={() => setInputMode('map')}>Draw on Map</button>
              <button style={{ flex: 1, padding: '8px', background: inputMode === 'manual' ? 'var(--silver-mid)' : 'transparent', color: inputMode === 'manual' ? '#000' : '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }} onClick={() => setInputMode('manual')}>Manual Entry</button>
            </div>
          )}
          
          {activeTool === 'calibrate' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ color: 'var(--silver-light)', fontWeight: 'bold', fontSize: '12px' }}>Enter Real Length (m):</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="number" placeholder="e.g. 10" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={applyCalibration}>Apply</button>
              </div>
            </div>
          ) : inputMode === 'map' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--silver-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: scaleFactor === 1 ? '#ffcc00' : '#00E676' }}></span>
                  {scaleFactor === 1 ? 'Standard Scale' : 'Calibrated'}
                </div>
                <button style={{ background: 'transparent', color: 'var(--silver-mid)', border: 'none', fontSize: '11px', textDecoration: 'underline' }} onClick={() => { setActiveTool('calibrate'); setCalibrationPoints([]); }}>Calibrate</button>
              </div>
              <div className="input-row">
                <div className="input-group"><label>Pitch: {pitch}°</label><input type="range" min="10" max="60" value={pitch} onChange={e => setPitch(e.target.value)} /></div>
                <div className="input-group"><label>Width: {width}mm</label><input type="range" min="500" max="1000" value={width} onChange={e => setWidth(e.target.value)} /></div>
              </div>
            </>
          ) : (
            <div style={{ padding: '10px 0' }}>
              <div className="input-row">
                <div className="input-group"><label>Width (m)</label><input type="number" value={manualWidth} onChange={e => setManualWidth(e.target.value)} /></div>
                <div className="input-group"><label>Length (m)</label><input type="number" value={manualLength} onChange={e => setManualLength(e.target.value)} /></div>
              </div>
              <div className="input-row">
                <div className="input-group"><label>Pitch: {pitch}°</label><input type="range" min="10" max="60" value={pitch} onChange={e => setPitch(e.target.value)} /></div>
                <div className="input-group"><label>Width: {width}mm</label><input type="range" min="500" max="1000" value={width} onChange={e => setWidth(e.target.value)} /></div>
              </div>
            </div>
          )}
          
          <button className="btn btn-primary" style={{ width: '100%', padding: '15px', marginTop: '10px', fontSize: '16px' }} onClick={calculateRoof} disabled={loading || (inputMode === 'map' && !drawnCoords)}>
            {loading ? "ANALYZING..." : "☑️ Calculate Roof"}
          </button>
        </div>
      )}

      {showResults && result && exteriorMeters && (
        <div className="hud-sheet" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: 'var(--bg-body)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '25px', paddingBottom: '100px' }}>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: 'var(--silver-mid)', fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase' }}>TOTAL SHEETS</div>
              <h2 style={{ fontSize: '28px', fontWeight: '800', margin: '5px 0', color: 'var(--silver-light)' }}>
                {result.total_faces === 2 ? 'Gable Roof' : result.total_faces === 4 ? 'Hip Roof' : 'Complex Roof'}
              </h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>{pitch}° pitch</div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>{width} mm cover</div>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>{settings.overhangMm} mm overhang</div>
              </div>
            </div>

            <div className="data-grid">
              <div className="data-card"><div className="data-label">TOTAL SHEETS</div><div className="data-value">{result.sheets?.length || 0}</div></div>
              <div className="data-card"><div className="data-label">ROOF AREA</div><div className="data-value">{(result.roof_area_m2 || 0).toFixed(1)}<span style={{fontSize:'18px'}}> m²</span></div></div>
              <div className="data-card">
                <div className="data-label">COILS / LINEAR</div>
                <div className="data-value">{result.total_coils || 0} <span style={{fontSize:'18px'}}>coils</span></div>
                <div style={{ fontSize: '12px', color: 'var(--silver-dark)' }}>{(result.total_stock_m || 0).toFixed(1)} meters ordered</div>
              </div>
              <div className="data-card">
                <div className="data-label">WASTE</div>
                <div className="data-value">{(result.total_waste_pct || 0).toFixed(1)}<span style={{fontSize:'18px'}}> %</span></div>
                <div style={{ fontSize: '12px', color: result.total_waste_pct < 5 ? '#00E676' : result.total_waste_pct < 10 ? '#ffcc00' : '#ff4444', marginTop: '4px' }}>
                  {result.total_waste_pct < 5 ? 'Excellent ✅' : result.total_waste_pct < 10 ? 'Normal 🟡' : 'High ⚠️'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '16px', color: 'var(--silver-light)' }}>Measurement</h3>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '3px' }}>
                <button style={{ padding: '5px 15px', background: viewMode === '2d' ? 'var(--silver-mid)' : 'transparent', color: viewMode === '2d' ? '#000' : '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }} onClick={() => setViewMode('2d')}>2D</button>
                <button style={{ padding: '5px 15px', background: viewMode === '3d' ? 'var(--silver-mid)' : 'transparent', color: viewMode === '3d' ? '#000' : '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }} onClick={() => setViewMode('3d')}>3D</button>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '15px', marginBottom: '25px', border: '1px solid #405860' }}>
              {viewMode === '2d' ? (
                <svg viewBox={svgViewBox} width="100%" height="200">
                  <polygon points={exteriorMeters.map(p => p[0] + "," + p[1]).join(' ')} fill="rgba(232, 232, 232, 0.05)" stroke="#E8E8E8" strokeWidth="0.3" />
                  {result.sheets?.map((sheet, i) => (<line key={i} x1={sheet.start[0]} y1={sheet.start[1]} x2={sheet.end[0]} y2={sheet.end[1]} stroke="rgba(255,255,255,0.4)" strokeWidth="0.1" />))}
                </svg>
              ) : (
                <div style={{ height: '200px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {result.mesh_vertices ? (<Canvas camera={{ position: [20, 20, 20], fov: 50 }}><ambientLight intensity={0.5} /><directionalLight position={[10, 10, 10]} intensity={1} /><RoofMesh vertices={result.mesh_vertices} faces={result.mesh_faces} /><OrbitControls /></Canvas>) : <p style={{ color: 'var(--silver-dark)' }}>Update backend for 3D</p>}
                </div>
              )}
            </div>

            <h3 style={{ fontSize: '16px', marginBottom: '15px', color: 'var(--silver-light)' }}>Trims & Flashings</h3>
            <div className="trims-grid">
              <div className="trim-card">
                <div className="trim-title">Ridge capping</div>
                <div className="trim-val">{(result.trims && result.trims.ridge_capping_m) || 0} m</div>
                <div style={{ fontSize: '10px', color: 'var(--silver-dark)' }}>{(result.trims && result.trims.ridge_count) || 0} ridge</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Hip capping</div>
                <div className="trim-val">{(result.trims && result.trims.hip_capping_m) || 0} m</div>
                <div style={{ fontSize: '10px', color: 'var(--silver-dark)' }}>{(result.trims && result.trims.hip_count) || 0} hips</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Valley capping</div>
                <div className="trim-val">{(result.trims && result.trims.valley_capping_m) || 0} m</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Eaves / gutter</div>
                <div className="trim-val">{(result.trims && result.trims.eaves_gutter_m) || 0} m</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '15px', background: 'var(--bg-panel)', borderTop: '1px solid var(--accent-gunmetal)', display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', flexDirection: 'column' }} onClick={() => { const blob = new Blob([result.csv_data], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cut_list.csv'; a.click(); }}><span style={{fontSize:'18px'}}>📥</span><span style={{fontSize:'10px'}}>CSV</span></button>
            <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', flexDirection: 'column' }} onClick={saveJob}><span style={{fontSize:'18px'}}>💾</span><span style={{fontSize:'10px'}}>Save</span></button>
            <button className="btn btn-secondary" style={{ flex: 1, padding: '10px', flexDirection: 'column' }} onClick={shareJob}><span style={{fontSize:'18px'}}>🔗</span><span style={{fontSize:'10px'}}>Share</span></button>
            
            <button className="btn btn-primary" style={{ flex: 2, display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowInvoice(true)}><span>📄</span> Invoice</button>
            
            <button className="btn btn-secondary" style={{ padding: '10px' }} onClick={() => setShowResults(false)}>✕</button>
          </div>
        </div>
      )}

      {showInvoice && result && (
        <InvoiceForm 
          result={result} 
          pitch={pitch} 
          onClose={() => setShowInvoice(false)} 
        />
      )}

    </div>
  );
}
