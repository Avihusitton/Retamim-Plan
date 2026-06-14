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
import { Building2, ChevronDown, ChevronUp, RefreshCw, AlertCircle, ArrowDownToLine, Eye } from 'lucide-react';
import { generateMassing } from '../utils/buildingMassing';
import { wgs84ToLocalMeters } from '../utils/coordsToMeters';
import { getSunPosition } from '../utils/solarCalculator';
import { createPlotGround } from '../utils/plotGround';
import FloorPlanAutoTracer from './FloorPlanAutoTracer';

// ─── Compass Texture Generation ─────────────────────────────────────────────
const createCompassTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;
  const r = 200;

  // Outer circle
  ctx.strokeStyle = '#8c765c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Inner circle
  ctx.strokeStyle = '#a68c70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 20, 0, 2 * Math.PI);
  ctx.stroke();

  // Tick marks
  ctx.strokeStyle = '#8c765c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 360; i += 15) {
    const rad = (i * Math.PI) / 180;
    const len = i % 90 === 0 ? 15 : i % 45 === 0 ? 10 : 5;
    const x1 = cx + (r - 20) * Math.sin(rad);
    const y1 = cy - (r - 20) * Math.cos(rad);
    const x2 = cx + (r - 20 - len) * Math.sin(rad);
    const y2 = cy - (r - 20 - len) * Math.cos(rad);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draw Cardinal directions
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // N (North is top of canvas -> x=cx, y=cy - r + 45)
  ctx.fillStyle = '#c85a32';
  ctx.fillText('N', cx, cy - r + 45);

  // S (South is bottom)
  ctx.fillStyle = '#6e5842';
  ctx.fillText('S', cx, cy + r - 45);

  // E (East is right)
  ctx.fillText('E', cx + r - 45, cy);

  // W (West is left)
  ctx.fillText('W', cx - r + 45, cy);

  // Draw pointers
  ctx.fillStyle = '#c85a32';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 15, cy);
  ctx.lineTo(cx, cy - r + 70);
  ctx.fill();

  ctx.fillStyle = '#e57a53';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 15, cy);
  ctx.lineTo(cx, cy - r + 70);
  ctx.fill();

  ctx.fillStyle = '#5c4a37';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.lineTo(cx, cy + r - 70);
  ctx.fill();

  ctx.fillStyle = '#7a644e';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 12, cy);
  ctx.lineTo(cx, cy + r - 70);
  ctx.fill();

  ctx.fillStyle = '#69543f';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 12);
  ctx.lineTo(cx + r - 70, cy);
  ctx.fill();

  ctx.fillStyle = '#856e57';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + 12);
  ctx.lineTo(cx + r - 70, cy);
  ctx.fill();

  ctx.fillStyle = '#544230';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - 12);
  ctx.lineTo(cx - r + 70, cy);
  ctx.fill();

  ctx.fillStyle = '#6e5842';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + 12);
  ctx.lineTo(cx - r + 70, cy);
  ctx.fill();

  // Center cap
  ctx.fillStyle = '#ffd8a8';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
  ctx.fill();

  ctx.strokeStyle = '#8c765c';
  ctx.lineWidth = 2;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
};

// ─── Default values ─────────────────────────────────────────────────────────
const DEFAULT_FOOTPRINT = '[[0,0],[10,0],[10,6],[0,6]]';
const DEFAULT_HEIGHT    = 8;

// ─── Lot boundary — mirrors plotGround.js plotCorners [sceneX, sceneZ] ───────
// Street is on the EAST side (positive sceneX).
// Setback rule: 5m from street edge (outward normal X > 0.5), 3m all others.
const LOT_CORNERS = [
   5.65,  17.54,
   9.32,   8.05,
  11.24,   0.43,
  12.70, -10.75,
 -17.64, -17.30,
 -21.25,   2.05,
];

/**
 * computeBuildableEnvelope
 * Parallel-edge inset of the lot polygon.
 * Uses the same algorithm as plotGround.js § "Setback outline".
 * Returns array of {x, z} objects (scene XZ).
 *
 * @param {number[]} corners  Flat [x,z, x,z, ...] array
 * @returns {{x:number, z:number}[]}
 */
function computeBuildableEnvelope(corners) {
  const n = corners.length / 2;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const j   = (i + 1) % n;
    const ax  = corners[i * 2],     az  = corners[i * 2 + 1];
    const bx  = corners[j * 2],     bz  = corners[j * 2 + 1];
    const dx  = bx - ax,            dz  = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const ux  = dx / len,           uz  = dz / len;
    // Inward normal (CW winding verified in plotGround.js)
    const nx  =  uz;   // dz/len
    const nz  = -ux;   // -dx/len
    // Outward X-component → street edge when > 0.5
    const outwardX = -uz;
    const d   = outwardX > 0.5 ? 5 : 3;
    edges.push({ px: ax + nx * d, pz: az + nz * d, ux, uz });
  }
  // Intersect consecutive offset edges to get inset vertices
  const pts = [];
  for (let i = 0; i < n; i++) {
    const e1    = edges[(i - 1 + n) % n];
    const e2    = edges[i];
    const denom = e1.ux * e2.uz - e1.uz * e2.ux;
    if (Math.abs(denom) < 1e-9) {
      pts.push({ x: e2.px, z: e2.pz });
    } else {
      const t = ((e2.px - e1.px) * e2.uz - (e2.pz - e1.pz) * e2.ux) / denom;
      pts.push({ x: e1.px + t * e1.ux, z: e1.pz + t * e1.uz });
    }
  }
  return pts;
}

/**
 * pointInPolygon — ray-casting test.
 * @param {number} px  @param {number} pz
 * @param {{x,z}[]} poly
 * @returns {boolean}
 */
function pointInPolygon(px, pz, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, zi = poly[i].z;
    const xj = poly[j].x, zj = poly[j].z;
    const intersect = ((zi > pz) !== (zj > pz)) &&
      (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * validateFootprintInsideEnvelope
 * Footprint points are in local-meter [x, y] where y maps to scene Z.
 * The mesh is centered on XZ origin, so we test each footprint corner
 * against the buildable envelope in scene XZ directly — the footprint
 * origin is the centroid of the points which sits at scene [0,0,0].
 *
 * @param {[number,number][]} footprintPoints  [[x,y], ...]
 * @param {{x,z}[]} envelope
 * @returns {{ valid: boolean, violations: {point:[number,number], distanceOutside:number}[] }}
 */
function validateFootprintInsideEnvelope(footprintPoints, envelope) {
  // Compute centroid of footprint (to match the centering done in handleGenerate)
  const cx = footprintPoints.reduce((s, p) => s + p[0], 0) / footprintPoints.length;
  const cy = footprintPoints.reduce((s, p) => s + p[1], 0) / footprintPoints.length;

  const violations = [];
  for (const [fx, fy] of footprintPoints) {
    // Footprint centred: scene X = fx - cx,  scene Z = fy - cy
    const sx = fx - cx;
    const sz = fy - cy;
    if (!pointInPolygon(sx, sz, envelope)) {
      // Estimate distance outside: minimum distance to any envelope edge
      let minDist = Infinity;
      const n = envelope.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const ex1 = envelope[j].x, ez1 = envelope[j].z;
        const ex2 = envelope[i].x, ez2 = envelope[i].z;
        const edx = ex2 - ex1, edz = ez2 - ez1;
        const lenSq = edx * edx + edz * edz;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((sx - ex1) * edx + (sz - ez1) * edz) / lenSq)) : 0;
        const nearX = ex1 + t * edx, nearZ = ez1 + t * edz;
        const dist  = Math.hypot(sx - nearX, sz - nearZ);
        if (dist < minDist) minDist = dist;
      }
      violations.push({ point: [fx, fy], distanceOutside: Math.round(minDist * 100) / 100 });
    }
  }
  return { valid: violations.length === 0, violations };
}

// ─── Component ───────────────────────────────────────────────────────────────
const MassingImporter = () => {
  // Panel open/closed
  const [isOpen, setIsOpen] = useState(true);

  // Auto-tracer panel visibility
  const [showTracer, setShowTracer] = useState(false);

  // Form state
  const [footprintJson, setFootprintJson] = useState(DEFAULT_FOOTPRINT);
  const [height,        setHeight]        = useState(DEFAULT_HEIGHT);
  const [error,         setError]         = useState('');
  const [bbInfo,        setBbInfo]        = useState(null);  // { width, depth, height }

  // WGS84 converter state
  const [wgs84Input, setWgs84Input] = useState('');
  const [wgs84Error, setWgs84Error] = useState('');

  // Three.js refs
  const mountRef       = useRef(null);
  const sceneRef       = useRef(null);
  const cameraRef      = useRef(null);
  const rendererRef    = useRef(null);
  const controlsRef    = useRef(null);
  const meshRef        = useRef(null);
  const rafRef         = useRef(null);
  const sunLightRef    = useRef(null);
  const envelopeLineRef = useRef(null);  // yellow dashed buildable-envelope line

  // Setback validation state
  const [setbackStatus, setSetbackStatus] = useState(null); // null | { valid, violations }

  // Date and Time Simulation state
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedHour, setSelectedHour] = useState(12.0);

  // Shadow analysis state
  const [isAnalyzing,   setIsAnalyzing]   = useState(false);
  const [hasHeatmap,    setHasHeatmap]    = useState(false);
  const shadowTexRef    = useRef(null);   // CanvasTexture for heatmap
  const groundMeshRef   = useRef(null);   // ref to the large 120×120 ground mesh
  const origGroundMatRef = useRef(null);  // backup of original ground material

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

    // Compass rotating overlay logic
    const updateOverlay = () => {
      const camOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const angle = Math.atan2(camOffset.x, camOffset.z);
      const deg = (angle * 180) / Math.PI;
      const compassOverlay = document.getElementById('massing-compass-overlay');
      if (compassOverlay) {
        compassOverlay.style.transform = `rotate(${deg}deg)`;
      }
    };
    controls.addEventListener('change', updateOverlay);
    setTimeout(updateOverlay, 0);

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

    // Ground plane, plot fills, street and sidewalks
    createPlotGround(scene);

    // Compass rose ground overlay
    const compassTex = createCompassTexture();
    const compassGeo = new THREE.PlaneGeometry(6, 6);
    const compassMat = new THREE.MeshBasicMaterial({
      map: compassTex,
      transparent: true,
      depthWrite: false,
    });
    const compassMesh = new THREE.Mesh(compassGeo, compassMat);
    compassMesh.rotation.x = -Math.PI / 2;
    compassMesh.position.set(0, 0.02, 0);
    scene.add(compassMesh);

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

  // Listen for custom event 'generate-3d-massing' to generate geometry from 2D clicks
  useEffect(() => {
    const handleCustomGenerate = (e) => {
      const { footprint, height: newHeight } = e.detail;
      const jsonStr = JSON.stringify(footprint);
      setFootprintJson(jsonStr);
      if (newHeight) setHeight(newHeight);
      
      handleGenerate(sceneRef.current, footprint, newHeight || height);
    };
    window.addEventListener('generate-3d-massing', handleCustomGenerate);
    return () => {
      window.removeEventListener('generate-3d-massing', handleCustomGenerate);
    };
  }, [footprintJson, height]);

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
  const handleGenerate = (scene, footprintOverride, heightOverride) => {
    setError('');
    const targetScene = scene || sceneRef.current;
    if (!targetScene) return;

    // Parse footprint
    let points;
    const rawFootprint = footprintOverride !== undefined ? footprintOverride : footprintJson;
    const rawHeight = heightOverride !== undefined ? heightOverride : height;

    if (typeof rawFootprint === 'string') {
      try {
        points = JSON.parse(rawFootprint);
      } catch {
        setError('שגיאה: יש להזין מערך JSON תקין, לדוגמה: [[0,0],[10,0],[10,6],[0,6]]');
        return;
      }
    } else if (Array.isArray(rawFootprint)) {
      points = rawFootprint;
    } else {
      setError('שגיאה: פורמט נקודות לא תקין');
      return;
    }

    if (!Array.isArray(points) || points.length < 3) {
      setError('שגיאה: נדרשות לפחות 3 נקודות');
      return;
    }
    for (const p of points) {
      if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') {
        setError('שגיאה: פורמט נקודות לא תקין');
        return;
      }
    }

    const h = parseFloat(rawHeight);
    if (isNaN(h) || h <= 0 || h > 100) {
      setError('שגיאה: גובה חייב להיות מספר בין 1 ל-100');
      return;
    }

    // ── Setback validation ───────────────────────────────────────────────────
    const envelope = computeBuildableEnvelope(LOT_CORNERS);
    let workingPoints = points;

    // Auto-fit: if footprint violates envelope, shift it to the envelope centroid
    const firstCheck = validateFootprintInsideEnvelope(workingPoints, envelope);
    if (!firstCheck.valid) {
      // Centroid of envelope
      const envCx = envelope.reduce((s, p) => s + p.x, 0) / envelope.length;
      const envCz = envelope.reduce((s, p) => s + p.z, 0) / envelope.length;
      // Centroid of footprint (scene-centered)
      const fpCx = workingPoints.reduce((s, p) => s + p[0], 0) / workingPoints.length;
      const fpCz = workingPoints.reduce((s, p) => s + p[1], 0) / workingPoints.length;
      const dx = envCx - fpCx, dz = envCz - fpCz;
      workingPoints = workingPoints.map(([x, z]) => [x + dx, z + dz]);
    }

    const validation = validateFootprintInsideEnvelope(workingPoints, envelope);
    setSetbackStatus(validation);

    // Draw / refresh the envelope dashed line in the scene
    drawEnvelopeLine(targetScene);

    // Always continue — violation shows as amber warning only (never blocks)

    // Remove old mesh
    if (meshRef.current) {
      targetScene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current.material.dispose();
      meshRef.current = null;
    }

    // Generate new geometry (use auto-fitted points if available)
    let geometry;
    try {
      geometry = generateMassing(workingPoints, h);
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

  const handleSetTopDownView = () => {
    if (cameraRef.current && controlsRef.current) {
      // Set camera to look straight down.
      // Small offset in Z to prevent OrbitControls gimbal lock while keeping default Up vector.
      cameraRef.current.position.set(0, 45, 0.01);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  // ── Draw / refresh the buildable envelope dashed line in the scene ──────────
  const drawEnvelopeLine = (targetScene) => {
    const scene = targetScene || sceneRef.current;
    if (!scene) return;

    // Remove previous line
    if (envelopeLineRef.current) {
      scene.remove(envelopeLineRef.current);
      envelopeLineRef.current.geometry.dispose();
      envelopeLineRef.current.material.dispose();
      envelopeLineRef.current = null;
    }

    const env = computeBuildableEnvelope(LOT_CORNERS);
    const pts = env.map(p => new THREE.Vector3(p.x, 0.08, p.z));
    pts.push(pts[0].clone()); // close loop

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineDashedMaterial({
      color:      0xeab308,   // yellow-500
      dashSize:   0.8,
      gapSize:    0.4,
      linewidth:  1,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();  // required for dashed lines
    line.name = 'buildable-envelope';
    scene.add(line);
    envelopeLineRef.current = line;
  };

  // ── Daily Shadow Analysis ──────────────────────────────────────────────────
  const runShadowAnalysis = () => {
    const scene    = sceneRef.current;
    const renderer = rendererRef.current;
    const camera   = cameraRef.current;
    if (!scene || !renderer || !camera) return;

    setIsAnalyzing(true);

    // Find the 120×120 street-ground mesh to apply heatmap on
    let gndMesh = null;
    scene.traverse(obj => {
      if (obj.name === 'street-ground') gndMesh = obj;
    });
    if (!gndMesh) { setIsAnalyzing(false); return; }
    groundMeshRef.current  = gndMesh;
    origGroundMatRef.current = gndMesh.material;

    // --- Setup offscreen render target (256×256) ---
    const TEX_SIZE = 256;
    const rt = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE);
    const pixels = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

    // Shadow accumulator (how many time-steps this pixel is in shadow)
    const shadowCount = new Float32Array(TEX_SIZE * TEX_SIZE);
    let   steps = 0;

    // Orthographic camera looking straight down at ground
    const ortho = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 200);
    ortho.position.set(0, 100, 0);
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();

    // Temporarily give the ground a bright Lambert material so shadow is clearly dark
    const tempMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    gndMesh.material = tempMat;

    // Temp analysis light (we won't touch sunLightRef.current)
    const analysisLight = new THREE.DirectionalLight(0xffffff, 1.5);
    analysisLight.castShadow = true;
    analysisLight.shadow.mapSize.width  = 1024;
    analysisLight.shadow.mapSize.height = 1024;
    analysisLight.shadow.camera.near = 0.5;
    analysisLight.shadow.camera.far  = 200;
    analysisLight.shadow.camera.left = analysisLight.shadow.camera.bottom = -60;
    analysisLight.shadow.camera.right = analysisLight.shadow.camera.top   =  60;
    analysisLight.target.position.set(0, 0, 0);
    scene.add(analysisLight.target);
    scene.add(analysisLight);

    // Hide ambient to make shadow contrast sharp
    const ambientLights = [];
    scene.traverse(obj => { if (obj.isAmbientLight) ambientLights.push(obj); });
    ambientLights.forEach(a => { a.visible = false; });
    // Also hide main sun
    if (sunLightRef.current) sunLightRef.current.visible = false;

    // Calculate day-of-year from selectedDate
    const dateObj = new Date(selectedDate);
    const start   = new Date(dateObj.getFullYear(), 0, 0);
    const diff    = dateObj - start;
    const oneDay  = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay) || 180;

    // --- Loop over hours 6..18 step 0.5 ---
    for (let hour = 6; hour <= 18; hour += 0.5) {
      const { azimuth: az, elevation: el } = getSunPosition(31.0546, dayOfYear, hour);
      if (el <= 0) continue;   // sun below horizon — skip

      const azRad = (az * Math.PI) / 180;
      const elRad = (el * Math.PI) / 180;
      const dist  = 80;
      const lx = dist * Math.cos(elRad) * Math.sin(azRad);
      const ly = dist * Math.sin(elRad);
      const lz = -dist * Math.cos(elRad) * Math.cos(azRad);
      analysisLight.position.set(lx, ly, lz);
      analysisLight.shadow.needsUpdate = true;

      // Render into offscreen target
      renderer.setRenderTarget(rt);
      renderer.render(scene, ortho);
      renderer.readRenderTargetPixels(rt, 0, 0, TEX_SIZE, TEX_SIZE, pixels);
      renderer.setRenderTarget(null);

      // Accumulate: pixel brightness < 80 = in shadow
      for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
        const brightness = pixels[i * 4]; // red channel
        if (brightness < 80) shadowCount[i]++;
      }
      steps++;
    }

    // --- Build heatmap canvas ---
    const heatCanvas  = document.createElement('canvas');
    heatCanvas.width  = TEX_SIZE;
    heatCanvas.height = TEX_SIZE;
    const ctx = heatCanvas.getContext('2d');
    const imgData = ctx.createImageData(TEX_SIZE, TEX_SIZE);

    for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
      const ratio = steps > 0 ? Math.min(shadowCount[i] / steps, 1.0) : 0;
      // Gradient: ratio=1 → blue (always shadow), ratio=0 → red (always sun)
      // Intermediate yellow at ratio=0.5
      let r, g, b;
      if (ratio >= 0.5) {
        // Blue (0,0,255) → Yellow (255,255,0) as ratio goes 1→0.5
        const t = (ratio - 0.5) * 2; // 1 at ratio=1, 0 at ratio=0.5
        r = Math.round(255 * (1 - t));
        g = Math.round(255 * (1 - t));
        b = 255;
      } else {
        // Yellow (255,255,0) → Red (255,0,0) as ratio goes 0.5→0
        const t = ratio * 2; // 0 at ratio=0, 1 at ratio=0.5
        r = 255;
        g = Math.round(255 * t);
        b = 0;
      }
      // WebGL readback is bottom-to-top; flip vertically for canvas
      const flippedI = (TEX_SIZE - 1 - Math.floor(i / TEX_SIZE)) * TEX_SIZE + (i % TEX_SIZE);
      imgData.data[flippedI * 4]     = r;
      imgData.data[flippedI * 4 + 1] = g;
      imgData.data[flippedI * 4 + 2] = b;
      imgData.data[flippedI * 4 + 3] = 200; // semi-transparent
    }
    ctx.putImageData(imgData, 0, 0);

    // Apply texture to ground
    const heatTex = new THREE.CanvasTexture(heatCanvas);
    shadowTexRef.current = heatTex;
    gndMesh.material = new THREE.MeshBasicMaterial({
      map: heatTex,
      transparent: true,
      opacity: 0.85,
    });

    // Restore scene lighting
    ambientLights.forEach(a => { a.visible = true; });
    if (sunLightRef.current) sunLightRef.current.visible = true;
    scene.remove(analysisLight);
    scene.remove(analysisLight.target);
    analysisLight.dispose();
    tempMat.dispose();
    rt.dispose();

    setHasHeatmap(true);
    setIsAnalyzing(false);
  };

  const clearShadowAnalysis = () => {
    const gndMesh = groundMeshRef.current;
    if (gndMesh && origGroundMatRef.current) {
      if (gndMesh.material && gndMesh.material !== origGroundMatRef.current) {
        gndMesh.material.dispose();
      }
      gndMesh.material = origGroundMatRef.current;
    }
    if (shadowTexRef.current) {
      shadowTexRef.current.dispose();
      shadowTexRef.current = null;
    }
    groundMeshRef.current   = null;
    origGroundMatRef.current = null;
    setHasHeatmap(false);
  };


  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="bg-white rounded-xl shadow-sm border border-desert-200 overflow-hidden">

      {/* Header (Always Open) */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-desert-100 bg-desert-50">
        <div className="flex items-center gap-2 text-desert-800">
          <Building2 className="w-5 h-5 text-terracotta-600" />
          <h2 className="text-lg font-bold">מחולל מסה תלת-ממדי (Building Massing 3D)</h2>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4">

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

          {/* 📐 ייבוא מסכמה אוטומטי */}
          <div className="flex flex-col gap-2">
            <button
              id="btn-toggle-floor-plan-tracer"
              onClick={() => setShowTracer(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-desert-700 hover:text-terracotta-600 transition-colors self-start"
            >
              <span>{showTracer ? '▲' : '▼'}</span>
              📐 ייבוא מסכמה אוטומטי
            </button>
            {showTracer && (
              <FloorPlanAutoTracer
                onCornersExtracted={(corners) => {
                  setFootprintJson(JSON.stringify(corners));
                  // intentionally NOT closing the tracer — user can keep editing and re-import
                }}
              />
            )}
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

          {/* Setback validation status */}
          {setbackStatus && !error && setbackStatus.valid && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-300 text-green-800 text-xs p-2.5 rounded-lg">
              <span className="text-green-600 font-bold text-sm">✓</span>
              <span className="font-semibold">המבנה בתוך קווי הבניין החוקיים</span>
              <span className="text-green-600 text-[10px] mr-1">(5 מ' מהרחוב · 3 מ' מהשכנים)</span>
            </div>
          )}
          {setbackStatus && !error && !setbackStatus.valid && (
            <div className="flex flex-col gap-1 bg-amber-50 border border-amber-300 text-amber-900 text-xs p-2.5 rounded-lg">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>⚠️ אזהרה: גם לאחר מרכוז אוטומטי — חריגה מקווי בניין</span>
              </div>
              <p className="text-[10px] text-amber-700 pl-6">הבניין מוצג על המפה אך חורג מהמעטפת המותרת. ניתן לערוך את הבסיס ולנסות שוב.</p>
              {setbackStatus.violations.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-amber-800 pl-6">
                  <span>▸</span>
                  <span>נקודה [{v.point[0]}, {v.point[1]}] — חורגת ב-<strong>{v.distanceOutside} מ'</strong></span>
                </div>
              ))}
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

          {/* ── Daily Shadow Analysis ── */}
          <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-desert-700 flex items-center gap-1.5">
              🌡 ניתוח צל יומי — מפת חום (06:00–18:00)
            </p>
            <p className="text-[10px] text-desert-500">
              מחשב את כמות הצל המצטברת לפי שעות יום עבור התאריך הנבחר.
              כחול = תמיד בצל · צהוב = צל חלקי · אדום = תמיד בשמש
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                id="btn-daily-shadow-analysis"
                onClick={runShadowAnalysis}
                disabled={isAnalyzing}
                className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-wait text-white font-semibold py-2 px-4 rounded-lg transition-colors text-xs flex items-center gap-2"
              >
                {isAnalyzing ? '⏳ מנתח...' : '🌡 ניתוח צל יומי'}
              </button>
              {hasHeatmap && (
                <button
                  id="btn-clear-shadow-analysis"
                  onClick={clearShadowAnalysis}
                  className="bg-desert-500 hover:bg-desert-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-xs flex items-center gap-2"
                >
                  🗑 נקה ניתוח
                </button>
              )}
            </div>
          </div>

          {/* Three.js Canvas */}
          <div className="relative w-full rounded-xl overflow-hidden border border-desert-200 bg-desert-50">
            <div
              ref={mountRef}
              className="w-full"
              style={{ height: 420 }}
            />
            {/* Reset to 2D Top-down View button */}
            <button
              onClick={handleSetTopDownView}
              className="absolute top-4 left-4 bg-white/90 hover:bg-white text-desert-800 backdrop-blur-sm p-2 rounded-lg shadow-md border border-desert-200 hover:border-desert-300 font-semibold text-xs transition-all flex items-center gap-1.5 z-10 cursor-pointer select-none"
              title="אפס למבט על (דו-ממד)"
            >
              <Eye className="w-3.5 h-3.5 text-terracotta-600" />
              <span>מבט על (2D)</span>
            </button>

            {/* Compass Overlay in top-right */}
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-md border border-desert-200 flex items-center justify-center pointer-events-none z-10 select-none">
              <div
                id="massing-compass-overlay"
                className="w-10 h-10 flex items-center justify-center"
                style={{ transform: 'rotate(0deg)', transformOrigin: 'center' }}
              >
                <svg viewBox="0 0 100 100" className="w-10 h-10">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#8c765c" strokeWidth="4" />
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#a68c70" strokeWidth="1.5" />
                  <text x="50" y="20" fontSize="16" fontWeight="bold" fill="#c85a32" textAnchor="middle">N</text>
                  <text x="50" y="88" fontSize="14" fill="#6e5842" textAnchor="middle">S</text>
                  <text x="84" y="55" fontSize="14" fill="#6e5842" textAnchor="middle">E</text>
                  <text x="16" y="55" fontSize="14" fill="#6e5842" textAnchor="middle">W</text>
                  <polygon points="50,50 45,50 50,22" fill="#c85a32" />
                  <polygon points="50,50 55,50 50,22" fill="#e57a53" />
                  <polygon points="50,50 46,50 50,78" fill="#5c4a37" />
                  <polygon points="50,50 54,50 50,78" fill="#7a644e" />
                </svg>
              </div>
            </div>
          </div>

          {/* Controls hint */}
          <p className="text-[10px] text-desert-400 text-center">
            🖱 גרור לסיבוב · Scroll להתקרבות / התרחקות · לחיצה ימנית להזזה
          </p>

          {/* Disclaimer per AGENTS.md domain rule */}
          <p className="text-[10px] text-desert-500 text-center italic border-t border-desert-100 pt-2">
            כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי
          </p>

        </div>
    </section>
  );
};

export default MassingImporter;
