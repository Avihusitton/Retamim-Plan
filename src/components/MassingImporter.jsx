/**
 * MassingImporter.jsx
 * -------------------
 * Collapsible panel that accepts a JSON footprint + height,
 * generates a 3D extruded massing mesh, and renders it in an
 * embedded Three.js canvas — fully client-side, no backend.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Building2, ChevronDown, ChevronUp, RefreshCw, AlertCircle, ArrowDownToLine } from 'lucide-react';
import { generateMassing } from '../utils/buildingMassing';
import { wgs84ToLocalMeters } from '../utils/coordsToMeters';
import { getSunPosition } from '../utils/solarCalculator';

// ─── Default values ─────────────────────────────────────────────────────────
const DEFAULT_FOOTPRINT = '[[0,0],[10,0],[10,6],[0,6]]';
const DEFAULT_HEIGHT    = 8;

// ─── Component ───────────────────────────────────────────────────────────────
const MassingImporter = () => {
  // Panel open/closed
  const [isOpen, setIsOpen] = useState(false);

  // Form state
  const [footprintJson, setFootprintJson] = useState(DEFAULT_FOOTPRINT);
  const [height,        setHeight]        = useState(DEFAULT_HEIGHT);
  const [error,         setError]         = useState('');
  const [bbInfo,        setBbInfo]        = useState(null);  // { width, depth, height }

  // WGS84 converter state
  const [wgs84Input, setWgs84Input] = useState('');
  const [wgs84Error, setWgs84Error] = useState('');

  // Three.js refs
  const mountRef    = useRef(null);
  const sceneRef    = useRef(null);
  const cameraRef   = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const meshRef     = useRef(null);
  const rafRef      = useRef(null);
  const sunLightRef = useRef(null);

  // Date and Time Simulation state
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedHour, setSelectedHour] = useState(12.0);

  // Live calculated solar values for label display
  const { azimuth, elevation } = (() => {
    const dateObj = new Date(selectedDate);
    const start = new Date(dateObj.getFullYear(), 0, 0);
    const diff = dateObj - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay) || 180;
    return getSunPosition(31.0546, dayOfYear, selectedHour);
  })();

  // Helper to update DirectionalLight position live from sun path
  const updateSunPosition = (dateStr, hrVal, directionalLightInstance) => {
    const light = directionalLightInstance || sunLightRef.current;
    if (!light) return;

    const dateObj = new Date(dateStr);
    const start = new Date(dateObj.getFullYear(), 0, 0);
    const diff = dateObj - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay) || 180;

    const { azimuth: az, elevation: el } = getSunPosition(31.0546, dayOfYear, hrVal);

    // Convert coordinates: Azimuth 0° = North = negative Z. Azimuth 90° = East = positive X.
    const azRad = (az * Math.PI) / 180;
    const elRad = (el * Math.PI) / 180;
    const dist = 50;

    const x = dist * Math.cos(elRad) * Math.sin(azRad);
    const y = dist * Math.sin(elRad);
    const z = -dist * Math.cos(elRad) * Math.cos(azRad);

    light.position.set(x, y, z);

    // Turn off lighting/shadows if the sun is below horizon
    if (el <= 0) {
      light.intensity = 0;
      light.castShadow = false;
    } else {
      light.intensity = 1.4;
      light.castShadow = true;
    }
  };

  // ── Initialize Three.js scene ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return; // don't create renderer until panel is open

    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f7f4ee');
    sceneRef.current = scene;

    // Camera
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(15, 12, 18);
    camera.lookAt(5, 0, 3);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.shadowMap.enabled  = true;
    renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    // Lighting
    const ambient = new THREE.AmbientLight(0xfff8f0, 0.6);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff3cc, 1.4);
    sun.castShadow    = true;
    sun.shadow.mapSize.width  = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far  = 100;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
    sun.shadow.camera.right = sun.shadow.camera.top   =  30;
    
    // Explicitly target the coordinate origin where footprint is generated
    sun.target.position.set(0, 0, 0);
    scene.add(sun.target);
    scene.add(sun);
    sunLightRef.current = sun;

    // Set initial position
    updateSunPosition(selectedDate, selectedHour, sun);

    // Ground plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#e6d8c0', roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper (10m grid)
    const grid = new THREE.GridHelper(60, 60, '#c2a880', '#d4c4a8');
    grid.position.y = 0.01;
    scene.add(grid);

    // Axes helper (X=red, Y=green, Z=blue)
    scene.add(new THREE.AxesHelper(5));

    // Animate loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w2 = mount.clientWidth;
      const h2 = mount.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    });
    ro.observe(mount);

    // Auto-generate with default values on first open
    handleGenerate(scene);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Update light position live on date/hour changes
  useEffect(() => {
    updateSunPosition(selectedDate, selectedHour);
  }, [selectedDate, selectedHour, isOpen]);

  // ── WGS84 → metres converter ───────────────────────────────────────────────
  const handleWgs84Convert = () => {
    setWgs84Error('');
    let parsed;
    try {
      parsed = JSON.parse(wgs84Input);
      if (!Array.isArray(parsed) || parsed.length < 2) throw new Error();
      for (const p of parsed) {
        if (!Array.isArray(p) || p.length < 2 ||
            typeof p[0] !== 'number' || typeof p[1] !== 'number') throw new Error();
      }
    } catch {
      setWgs84Error('שגיאה: הזן מערך JSON תקין של [[lon,lat], ...] לפחות 2 נקודות');
      return;
    }
    try {
      const meters = wgs84ToLocalMeters(parsed);
      setFootprintJson(JSON.stringify(meters));
      console.log('[coordsToMeters] WGS84 → metres:', meters);
    } catch (err) {
      setWgs84Error(`שגיאת המרה: ${err.message}`);
    }
  };

  // ── Generate / replace mesh ────────────────────────────────────────────────
  const handleGenerate = (scene) => {
    setError('');
    const targetScene = scene || sceneRef.current;
    if (!targetScene) return;

    // Parse footprint
    let points;
    try {
      points = JSON.parse(footprintJson);
      if (!Array.isArray(points) || points.length < 3) throw new Error();
      for (const p of points) {
        if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
          throw new Error();
        }
      }
    } catch {
      setError('שגיאה: יש להזין מערך JSON תקין, לדוגמה: [[0,0],[10,0],[10,6],[0,6]]');
      return;
    }

    const h = parseFloat(height);
    if (isNaN(h) || h <= 0 || h > 100) {
      setError('שגיאה: גובה חייב להיות מספר בין 1 ל-100');
      return;
    }

    // Remove old mesh
    if (meshRef.current) {
      targetScene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current.material.dispose();
      meshRef.current = null;
    }

    // Generate new geometry
    let geometry;
    try {
      geometry = generateMassing(points, h);
    } catch (err) {
      setError(`שגיאה ביצירת הגאומטריה: ${err.message}`);
      return;
    }

    // Read bounding box (already computed inside generateMassing)
    const bb     = geometry.boundingBox;
    const width  = parseFloat((bb.max.x - bb.min.x).toFixed(2));
    const bbH    = parseFloat((bb.max.y - bb.min.y).toFixed(2));
    const depth  = parseFloat((bb.max.z - bb.min.z).toFixed(2));
    setBbInfo({ width, height: bbH, depth });

    // Create mesh
    const material = new THREE.MeshStandardMaterial({
      color:     0xaaaaaa,
      roughness: 0.7,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;

    // Center footprint on XZ origin and sit on Y=0
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    mesh.position.set(-center.x, -bb.min.y, -center.z);

    targetScene.add(mesh);
    meshRef.current = mesh;

    // Reposition camera to frame the building nicely
    if (cameraRef.current && controlsRef.current) {
      const maxDim = Math.max(width, depth, bbH);
      cameraRef.current.position.set(maxDim * 1.5, maxDim, maxDim * 1.8);
      controlsRef.current.target.set(0, bbH / 2, 0);
      controlsRef.current.update();
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="bg-white rounded-xl shadow-sm border border-desert-200 overflow-hidden">

      {/* Header / Toggle */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-desert-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-desert-800">
          <Building2 className="w-5 h-5 text-terracotta-600" />
          <h2 className="text-lg font-bold">מחולל מסה תלת-ממדי (Building Massing 3D)</h2>
        </div>
        {isOpen
          ? <ChevronUp   className="w-5 h-5 text-desert-500" />
          : <ChevronDown className="w-5 h-5 text-desert-500" />
        }
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div className="p-5 border-t border-desert-100 flex flex-col gap-4">

          {/* ── WGS84 Converter (optional helper) ── */}
          <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-desert-700">
              🌐 המרת קואורדינטות WGS84 → מטרים <span className="font-normal text-desert-500">(אופציונלי)</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-9">
                <label className="block text-xs text-desert-600 mb-1">הדבק קואורדינטות WGS84 (אופציונלי):</label>
                <textarea
                  rows={3}
                  value={wgs84Input}
                  onChange={e => setWgs84Input(e.target.value)}
                  className="w-full p-2.5 border border-desert-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-terracotta-400 resize-none"
                  placeholder='[[34.694, 31.054], [34.695, 31.053], ...]'
                />
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={handleWgs84Convert}
                  className="w-full bg-desert-700 hover:bg-desert-900 text-white font-semibold py-2.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs"
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  המר למטרים
                </button>
              </div>
            </div>
            {wgs84Error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{wgs84Error}</span>
              </div>
            )}
            <p className="text-[10px] text-desert-400">
              הנקודה הראשונה תהפוך לנקודת ייחוס [0,0]. הקואורדינטות יועברו אוטומטית לשדה הבסיס שלמטה.
            </p>
          </div>

          {/* Form row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">

            {/* Footprint JSON */}
            <div className="md:col-span-7">
              <label className="block text-xs font-semibold text-desert-700 mb-1">
                נקודות בסיס (JSON) — מטרים:
              </label>
              <textarea
                rows={3}
                value={footprintJson}
                onChange={e => setFootprintJson(e.target.value)}
                className="w-full p-2.5 border border-desert-300 rounded-lg text-xs font-mono bg-desert-50 focus:ring-2 focus:ring-terracotta-400 resize-none"
                placeholder='[[0,0],[10,0],[10,6],[0,6]]'
              />
              <p className="text-[10px] text-desert-500 mt-0.5">
                הזן מערך JSON של נקודות [x, y] במטרים. לפחות 3 נקודות.
              </p>
            </div>

            {/* Height + button */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-desert-700 mb-1">
                גובה (מטרים):
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={height}
                onChange={e => setHeight(e.target.value)}
                className="w-full p-2.5 border border-desert-300 rounded-lg text-sm font-mono bg-desert-50 focus:ring-2 focus:ring-terracotta-400"
              />
            </div>

            <div className="md:col-span-3">
              <button
                onClick={() => handleGenerate(null)}
                className="w-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                הפק מסה תלת-ממדית
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Bounding box info */}
          {bbInfo && !error && (
            <div className="flex gap-4 text-xs text-desert-700 bg-desert-50 px-4 py-2 rounded-lg border border-desert-200">
              <span>📐 <strong>רוחב:</strong> {bbInfo.width} מ'</span>
              <span>📐 <strong>עומק:</strong> {bbInfo.depth} מ'</span>
              <span>📏 <strong>גובה:</strong> {bbInfo.height} מ'</span>
              <span className="text-desert-400">| ✓ 1 יחידה = 1 מטר</span>
            </div>
          )}

          {/* ── Sun Position Controls ── */}
          <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-desert-200 pb-2 flex-wrap gap-2">
              <p className="text-xs font-semibold text-desert-700 flex items-center gap-1.5">
                ☀️ סימולציית תאורת שמש והצללה בזמן אמת
              </p>
              <span className="text-xs font-bold text-terracotta-600 bg-white px-2.5 py-1 rounded-full border border-desert-200">
                שמש: אזימוט {Math.round(azimuth)}° | גובה {Math.round(elevation)}°
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* Date Input */}
              <div className="md:col-span-4">
                <label className="block text-xs text-desert-600 mb-1">תאריך:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="w-full p-2 border border-desert-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-terracotta-400"
                />
              </div>

              {/* Time Slider */}
              <div className="md:col-span-8">
                <div className="flex justify-between text-xs text-desert-600 mb-1">
                  <span>שעה ביום (05:00 - 21:00):</span>
                  <span className="font-bold text-desert-800 font-mono">
                    {(() => {
                      const hh = Math.floor(selectedHour).toString().padStart(2, '0');
                      const mm = selectedHour % 1 === 0 ? '00' : '30';
                      return `${hh}:${mm}`;
                    })()}
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="21"
                  step="0.5"
                  value={selectedHour}
                  onChange={e => setSelectedHour(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                />
                <div className="flex justify-between text-[9px] text-desert-400 mt-1">
                  <span>זריחה (05:00)</span>
                  <span>צהריים (13:00)</span>
                  <span>שקיעה (21:00)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Three.js Canvas */}
          <div
            ref={mountRef}
            className="w-full rounded-xl overflow-hidden border border-desert-200 bg-desert-50"
            style={{ height: 420 }}
          />

          {/* Controls hint */}
          <p className="text-[10px] text-desert-400 text-center">
            🖱 גרור לסיבוב · Scroll להתקרבות / התרחקות · לחיצה ימנית להזזה
          </p>

          {/* Disclaimer per AGENTS.md domain rule */}
          <p className="text-[10px] text-desert-500 text-center italic border-t border-desert-100 pt-2">
            כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי
          </p>

        </div>
      )}
    </section>
  );
};

export default MassingImporter;
