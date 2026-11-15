import React, { useState, useEffect, useMemo, useRef } from 'react';
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

const RoofMesh = ({ vertices, faces }) => {
  const geometry = useMemo(() => {
    if (!vertices || !faces) return null;
    const triangles = [];
    faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) triangles.push([face[0], face[i], face[i+1]]);
    });
    return { positions: new Float32Array(vertices.flat()), indices: new Uint32Array(triangles.flat()) };
  }, [vertices, faces]);
  if (!geometry) return null;
  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={geometry.positions.length / 3} array={geometry.positions} itemSize={3} />
        <bufferAttribute attach="index" count={geometry.indices.length} array={geometry.indices} itemSize={1} />
      </bufferGeometry>
      <meshStandardMaterial color="#00E5FF" emissive="#003344" side={2} flatShading={true} metalness={0.8} roughness={0.2} />
    </mesh>
  );
};

function SearchControl() {
  const map = useMap();
  useEffect(() => {
    const provider = new OpenStreetMapProvider();
    const searchControl = new GeoSearchControl({ 
      provider, style: 'bar', showMarker: true, showPopup: false, autoClose: true, 
      retainZoomLevel: false, animateZoom: true, keepResult: false, searchLabel: 'Search address...',
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
      div.innerHTML = '<button title="Locate Me" style="background:#0A0F19; border:1px solid rgba(0,229,255,0.3); color:#00E5FF; font-size:18px; padding:12px; cursor:pointer; border-radius:12px; box-shadow:0 0 15px rgba(0,229,255,0.1);">🎯</button>';
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
  const [mapCenter, setMapCenter] = useState([-27.5598, 151.9507]); 
  
  const [showSettings, setShowSettings] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [realWorldLength, setRealWorldLength] = useState("");
  const [scaleFactor, setScaleFactor] = useState(1);

  const drawControlRef = useRef(null);
  
  const [settings, setSettings] = useState({
    companyName: "Mitchell's Metal Roofing", abn: "0435 918 594",
    metalCostPerMeter: 15.00, laborRatePerSheet: 45.00, markupPercentage: 20.0, taxPercentage: 10.0, overhangMm: 150
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('sheetSetSettings');
    if (savedSettings) { try { setSettings({ ...settings, ...JSON.parse(savedSettings) }); } catch (e) {} }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => setMapCenter([pos.coords.latitude, pos.coords.longitude]));
    }
  }, []);

  const handleMapClick = (e) => {
    if (!isCalibrating) return;
    if (calibrationPoints.length >= 2) setCalibrationPoints([e.latlng]); 
    else setCalibrationPoints([...calibrationPoints, e.latlng]);
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || !realWorldLength) return;
    const p1 = calibrationPoints[0], p2 = calibrationPoints[1];
    const metersArray = latLngToMeters([p1, p2], false);
    const distInMeters = Math.hypot(metersArray[1][0], metersArray[1][1]);
    if (distInMeters <= 0) return;
    setScaleFactor(parseFloat(realWorldLength) / distInMeters);
    setIsCalibrating(false); setMapMode('draw'); setCalibrationPoints([]); setRealWorldLength("");
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
    if (!drawnCoords) return;
    setLoading(true); setResult(null);
    const extMeters = latLngToMeters(drawnCoords, true);
    setExteriorMeters(extMeters);

    try {
      const response = await axios.post(API_URL + "/calculate", { 
        exterior: extMeters, pitch_deg: pitch, sheet_width_mm: width, overhang_mm: parseFloat(settings.overhangMm) 
      });
      setResult(response.data);
      setShowResults(true);
    } catch (err) { alert("Calculation failed. Backend might be asleep."); }
    setLoading(false);
  };

  // --- CUSTOM MAP CONTROLS ---
  const startDrawing = () => {
    if (drawControlRef.current) drawControlRef.current._toolbars.draw._modes.polygon.handler.enable();
  };

  const startEditing = () => {
    if (drawControlRef.current) drawControlRef.current._toolbars.edit._modes.edit.handler.enable();
  };

  const deleteShape = () => {
    if (drawControlRef.current) drawControlRef.current._toolbars.edit._modes.remove.handler.enable();
  };

  let svgViewBox = "0 0 100 100";
  if (exteriorMeters && exteriorMeters.length > 0) {
    const xs = exteriorMeters.map(p => p[0]), ys = exteriorMeters.map(p => p[1]);
    svgViewBox = (Math.min(...xs) - 2) + " " + (Math.min(...ys) - 2) + " " + (Math.max(...xs) - Math.min(...xs) + 4) + " " + (Math.max(...ys) - Math.min(...ys) + 4);
  }

  return (
    <div className="container">
      <header>
        <div>
          <h1 className="header-title">SHEET SET</h1>
          <p className="header-subtitle">MITCHELL'S METAL ROOFING</p>
        </div>
        <button className="tool-btn" onClick={() => setShowSettings(true)}>⚙️</button>
      </header>

      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Settings</h3>
            <div className="input-group"><label>Company Name</label><input type="text" value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} /></div>
            <div className="input-group"><label>Phone</label><input type="text" value={settings.abn} onChange={e => setSettings({...settings, abn: e.target.value})} /></div>
            <button className="btn-primary-hud" style={{ padding: '15px', width: '100%', marginTop: '10px' }} onClick={() => { localStorage.setItem('sheetSetSettings', JSON.stringify(settings)); setShowSettings(false); }}>Save</button>
            <button className="btn-icon" style={{ color: 'var(--text-sub)', width: '100%', marginTop: '10px' }} onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="map-container-wrapper">
        <MapContainer center={mapCenter} zoom={19} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" maxZoom={22} maxNativeZoom={20} />
          <SearchControl />
          <LocateControl />
          <MapClickHandler active={isCalibrating} onClick={handleMapClick} />

          {isCalibrating && (
            <>
              {calibrationPoints.map((pt, i) => <Marker key={i} position={pt} />)}
              {calibrationPoints.length === 2 && <Polyline positions={calibrationPoints} color="#00E5FF" />}
            </>
          )}

          {!isCalibrating && !showResults && (
            <FeatureGroup>
              <EditControl 
                position="topright" 
                onCreated={onCreated} 
                onEdited={onEdited} 
                onDeleted={onDeleted} 
                onMounted={(control) => drawControlRef.current = control}
                draw={{ 
                  rectangle: false, circle: false, circlemarker: false, polyline: false, marker: false, 
                  polygon: { allowIntersection: false, shapeOptions: { color: '#00E5FF', weight: 3 } }
                }} 
              />
            </FeatureGroup>
          )}
        </MapContainer>

        {/* FLOATING TOOLBAR WITH CUSTOM EDIT/DELETE */}
        {!isCalibrating && !showResults && (
          <div className="floating-toolbar">
            <button className="tool-btn" onClick={startDrawing} title="Draw New Shape">⬡</button>
            <button className="tool-btn" onClick={startEditing} title="Edit Shape Points">✏️</button>
            <button className="tool-btn" onClick={deleteShape} title="Delete Shape" style={{ color: '#ff4444', borderColor: 'rgba(255,68,68,0.3)' }}>🗑️</button>
          </div>
        )}

        {!showResults && (
          <div className="map-bottom-controls">
            {mapMode === 'calibrate' && (
              <div className="scale-pill" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <span>Enter Real Length:</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="number" placeholder="Meters" value={realWorldLength} onChange={e => setRealWorldLength(e.target.value)} style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '5px', borderRadius: '4px', width: '80px' }} />
                  <button style={{ background: 'var(--brand-cyan)', color: '#000', border: 'none', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold' }} onClick={applyCalibration}>Apply</button>
                </div>
              </div>
            )}
            
            {!isCalibrating && (
              <div className="scale-pill">
                <span className="dot"></span> {scaleFactor === 1 ? 'Standard Scale' : 'Scale Calibrated'}
              </div>
            )}

            {mapMode === 'draw' ? (
              <button className="btn-draw-main" onClick={drawnCoords ? calculateRoof : startDrawing} disabled={loading}>
                {loading ? "ANALYZING..." : drawnCoords ? "☑️ Calculate Roof" : "⬡ Draw Roof"}
              </button>
            ) : (
              <button className="btn-draw-main" style={{ borderColor: 'var(--text-sub)', color: 'var(--text-sub)' }} onClick={() => { setMapMode('draw'); setIsCalibrating(false); }}>
                Cancel Calibration
              </button>
            )}
          </div>
        )}
      </div>

      {showResults && result && exteriorMeters && (
        <div className="hud-sheet">
          <div className="hud-scroll-area">
            <div className="hud-header">
              <div className="hud-tag">TOTAL SHEETS</div>
              <h2 className="hud-title">Hip roof · L-shape</h2>
              <p style={{ color: 'var(--text-sub)', fontSize: '12px' }}>Traced from map</p>
              <div className="hud-badges">
                <div className="hud-badge">{pitch}° pitch</div>
                <div className="hud-badge">{width} mm cover</div>
                <div className="hud-badge">{settings.overhangMm} mm overhang</div>
              </div>
            </div>

            <div className="data-grid">
              <div className="data-card">
                <div className="data-label">TOTAL SHEETS</div>
                <div className="data-value">{result.sheets.length}</div>
              </div>
              <div className="data-card">
                <div className="data-label">ROOF AREA</div>
                <div className="data-value">{result.roof_area_m2.toFixed(1)}<span style={{fontSize:'18px'}}> m²</span></div>
              </div>
              <div className="data-card">
                <div className="data-label">LINEAR COIL</div>
                <div className="data-value">{result.summary.match(/Ordered: ([\d.]+)m/)?.[1] || 0}<span style={{fontSize:'18px'}}> m</span></div>
              </div>
              <div className="data-card">
                <div className="data-label">WASTE</div>
                <div className="data-value">{result.total_waste_pct.toFixed(1)}<span style={{fontSize:'18px'}}> %</span></div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '16px' }}>Measurement</h3>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px' }}>
                <button style={{ padding: '5px 15px', background: viewMode === '2d' ? 'var(--brand-cyan)' : 'transparent', color: viewMode === '2d' ? '#000' : '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setViewMode('2d')}>2D</button>
                <button style={{ padding: '5px 15px', background: viewMode === '3d' ? 'var(--brand-cyan)' : 'transparent', color: viewMode === '3d' ? '#000' : '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }} onClick={() => setViewMode('3d')}>3D</button>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '16px', padding: '15px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '25px' }}>
              {viewMode === '2d' ? (
                <svg viewBox={svgViewBox} width="100%" height="200" style={{display: 'block'}}>
                  <polygon points={exteriorMeters.map(p => p[0] + "," + p[1]).join(' ')} fill="rgba(0, 229, 255, 0.05)" stroke="#00E5FF" strokeWidth="0.3" />
                  {result.sheets?.map((sheet, i) => (<line key={i} x1={sheet.start[0]} y1={sheet.start[1]} x2={sheet.end[0]} y2={sheet.end[1]} stroke="rgba(255,255,255,0.4)" strokeWidth="0.1" />))}
                </svg>
              ) : (
                <div style={{ height: '200px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {result.mesh_vertices ? (
                    <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
                      <ambientLight intensity={0.5} />
                      <directionalLight position={[10, 10, 10]} intensity={1} />
                      <RoofMesh vertices={result.mesh_vertices} faces={result.mesh_faces} />
                      <OrbitControls />
                    </Canvas>
                  ) : <p style={{ color: 'var(--text-sub)' }}>Update backend for 3D</p>}
                </div>
              )}
            </div>

            <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>Trims & Flashings</h3>
            <div className="trims-grid">
              <div className="trim-card">
                <div className="trim-title">Ridge capping</div>
                <div className="trim-val">{result.trims?.ridge_capping_m || 0} m</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Hip capping</div>
                <div className="trim-val">{result.trims?.hip_capping_m || 0} m</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Valley capping</div>
                <div className="trim-val">{result.trims?.valley_capping_m || 0} m</div>
              </div>
              <div className="trim-card">
                <div className="trim-title">Eaves / gutter</div>
                <div className="trim-val">{result.trims?.eaves_gutter_m || 0} m</div>
              </div>
            </div>
          </div>

          <div className="hud-bottom-bar">
            <button className="btn-icon" onClick={() => {
              const blob = new Blob([result.csv_data], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'cut_list.csv'; a.click();
            }}><span>📥</span>CSV</button>
            <button className="btn-icon"><span>💾</span>Save</button>
            <button className="btn-icon"><span>🔗</span>Share</button>
            <button className="btn-primary-hud" onClick={() => setShowResults(false)}>Results</button>
          </div>
        </div>
      )}
    </div>
  );
    }
