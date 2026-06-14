import { Fragment, useState } from 'react';
import useStore from '../store/useStore';
import { getSunPosition } from '../utils/solarCalculator';

const Visualization2D = () => {
  const {
    latitude,
    longitude,
    locationName,
    houseRotation,
    windDirection,
    windSpeed,
    hour,
    dayOfYear,
    showWind,
    buildingHeight,
    houseCorners,
    setHouseCorners,
    houseZoom,
    canvasSize
  } = useStore();

  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [markedPoints, setMarkedPoints] = useState([]);

  // 1. Calculate Solar Position
  const sunPos = getSunPosition(latitude, dayOfYear, hour);
  const { elevation, azimuth } = sunPos;
  const isNight = elevation <= 0;

  // 2. Map Wind Direction to Degrees
  const windMap = {
    'n': 0, 'ne': 45, 'e': 90, 'se': 135, 's': 180, 'sw': 225, 'w': 270, 'nw': 315
  };
  const windAngle = windMap[windDirection.toLowerCase()] !== undefined 
    ? windMap[windDirection.toLowerCase()] 
    : 315;

  // 3. SVG center
  const cx = 200;
  const cy = 200;
  const horizonRadius = 150; // kept for solar path rendering

  // Plot corners in meters [x=East+, y=North+] — from plotGround.js
  // Street is on the EAST side (positive x)
  const PLOT_CORNERS_M = [
    [5.65,  17.54],
    [9.32,   8.05],
    [11.24,  0.43],
    [12.70, -10.75],
    [-17.64,-17.30],
    [-21.25,  2.05],
  ];
  // Street setback = 5m (east), neighbour setback = 3m (all others)
  const STREET_SETBACK = 5;
  const NEIGHBOUR_SETBACK = 3;

  // Compute bounding box of plot for scaling
  const plotXs = PLOT_CORNERS_M.map(p => p[0]);
  const plotYs = PLOT_CORNERS_M.map(p => p[1]);
  const plotMinX = Math.min(...plotXs);
  const plotMaxX = Math.max(...plotXs);
  const plotMinY = Math.min(...plotYs);
  const plotMaxY = Math.max(...plotYs);
  const plotW = plotMaxX - plotMinX;
  const plotH = plotMaxY - plotMinY;
  // Scale so plot fills ~320px with 40px margin each side
  const PLOT_SVG_SIZE = 320;
  const plotScale = PLOT_SVG_SIZE / Math.max(plotW, plotH);
  const plotOffX = cx - ((plotMinX + plotMaxX) / 2) * plotScale;
  // Y axis: North=up → invert y
  const plotOffY = cy + ((plotMinY + plotMaxY) / 2) * plotScale;

  // Convert plot meter coords to SVG coords
  const mToSvg = (mx, my) => ([
    plotOffX + mx * plotScale,
    plotOffY - my * plotScale   // invert Y so North is up
  ]);

  // SVG polygon points string for the plot boundary
  const plotSvgPoints = PLOT_CORNERS_M.map(([mx, my]) => mToSvg(mx, my).map(v => v.toFixed(1)).join(',')).join(' ');

  // Setback polygon: shrink each edge inward
  // Simple uniform offset using centroid-based shrink per vertex
  const plotCentroidX = PLOT_CORNERS_M.reduce((s,p)=>s+p[0],0)/PLOT_CORNERS_M.length;
  const plotCentroidY = PLOT_CORNERS_M.reduce((s,p)=>s+p[1],0)/PLOT_CORNERS_M.length;

  // For each vertex, determine setback distance based on proximity to east (street)
  // East boundary: vertices with x close to plotMaxX get 5m setback, others 3m
  // We compute per-edge normals and offset inward
  const n = PLOT_CORNERS_M.length;
  const setbackCorners = PLOT_CORNERS_M.map((pt, i) => {
    const prev = PLOT_CORNERS_M[(i - 1 + n) % n];
    const next = PLOT_CORNERS_M[(i + 1) % n];
    // Edge vectors
    const e1x = pt[0] - prev[0]; const e1y = pt[1] - prev[1];
    const e2x = next[0] - pt[0]; const e2y = next[1] - pt[1];
    // Inward normals (rotate 90° toward centroid)
    const len1 = Math.hypot(e1x, e1y) || 1;
    const len2 = Math.hypot(e2x, e2y) || 1;
    // Normal of edge1 (left-hand inward for CCW polygon)
    const n1x = e1y / len1; const n1y = -e1x / len1;
    const n2x = e2y / len2; const n2y = -e2x / len2;
    // Bisector
    let bx = n1x + n2x; let by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    // Setback distance: east-facing vertices → 5m, others → 3m
    const isEastFacing = pt[0] > plotCentroidX + (plotW * 0.2);
    const dist = isEastFacing ? STREET_SETBACK : NEIGHBOUR_SETBACK;
    return [pt[0] + bx * dist, pt[1] + by * dist];
  });
  const setbackSvgPoints = setbackCorners.map(([mx, my]) => mToSvg(mx, my).map(v => v.toFixed(1)).join(',')).join(' ');

  // Street edge line on east side — from northmost to southmost east vertex
  const eastVerts = [...PLOT_CORNERS_M].sort((a,b)=>b[0]-a[0]).slice(0,2);
  const streetLineStart = mToSvg(eastVerts[0][0] + 2, eastVerts[0][1]);
  const streetLineEnd   = mToSvg(eastVerts[1][0] + 2, eastVerts[1][1]);

  // Compute sun position coordinates in SVG space (polar, centered on cx,cy)
  const getSvgCoords = (az, elev) => {
    const dist = horizonRadius * (1 - Math.max(0, elev) / 90);
    const rad = (az - 90) * Math.PI / 180;
    return {
      x: cx + dist * Math.cos(rad),
      y: cy + dist * Math.sin(rad)
    };
  };

  const sunCoords = getSvgCoords(azimuth, elevation);

  // 4. Calculate Sun Path Trajectory for the current day
  const trajectoryPoints = [];
  for (let h = 5; h <= 19; h += 0.25) {
    const pos = getSunPosition(latitude, dayOfYear, h);
    if (pos.elevation > -5) { // show slightly below horizon
      const coords = getSvgCoords(pos.azimuth, pos.elevation);
      trajectoryPoints.push(`${coords.x.toFixed(1)},${coords.y.toFixed(1)}`);
    }
  }
  const trajectoryPath = trajectoryPoints.length > 0 ? `M ${trajectoryPoints.join(' L ')}` : '';

  // 5. Detect if coordinates are in WGS84 degrees and convert to meters
  const isGPS = houseCorners.some(([c1, c2]) => (c1 > 28 && c1 < 37) || (c2 > 28 && c2 < 37));

  let convertedCorners = houseCorners;
  if (isGPS) {
    convertedCorners = houseCorners.map(([c1, c2]) => {
      // Israel coordinates: longitude ~34.7 (c1/c2), latitude ~31.0 (c1/c2)
      const isC1Lon = c1 > 33 && c1 < 36;
      const lon = isC1Lon ? c1 : c2;
      const lat = isC1Lon ? c2 : c1;
      return [
        lon * 95207,
        -lat * 111132 // Invert Y axis for latitude so higher lat (North) goes UP
      ];
    });
  }

  // Calculate bounding box of the custom corners to center the house
  const xs = convertedCorners.map(c => c[0]);
  const ys = convertedCorners.map(c => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Scale: dynamic scale so the house layout fits perfectly within a ~120px bounding box
  const footprintWidth = maxX - minX;
  const footprintHeight = maxY - minY;
  const maxFootprintDim = Math.max(footprintWidth, footprintHeight);
  const scale = (maxFootprintDim > 0 ? 120 / maxFootprintDim : (80 / 12)) * houseZoom;

  const handleSvgClick = (e) => {
    if (!isMarkingMode) return;
    const svgElement = e.currentTarget;
    const rect = svgElement.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 400;
    const clickY = ((e.clientY - rect.top) / rect.height) * 400;
    setMarkedPoints(prev => [...prev, [clickX, clickY]]);
  };

  const handleGenerate3D = () => {
    if (markedPoints.length < 3) return;

    const rRad = (houseRotation * Math.PI) / 180;
    
    const converted = markedPoints.map(([px, py]) => {
      const rx = (px - cx) / scale;
      const ry = (py - cy) / scale;
      const x = rx * Math.cos(rRad) + ry * Math.sin(rRad);
      const y = -rx * Math.sin(rRad) + ry * Math.cos(rRad);
      return [x, y];
    });

    const x0 = converted[0][0];
    const y0 = converted[0][1];
    
    const finalPoints = converted.map(([x, y]) => [
      parseFloat((x - x0).toFixed(2)),
      parseFloat((y - y0).toFixed(2))
    ]);

    setHouseCorners(finalPoints);

    const event = new CustomEvent('generate-3d-massing', {
      detail: {
        footprint: finalPoints,
        height: buildingHeight
      }
    });
    window.dispatchEvent(event);

    setIsMarkingMode(false);
    setMarkedPoints([]);
  };

  // Calculate House Shadow based on buildingHeight (standard 2.8m per floor)
  const elevRad = elevation * Math.PI / 180;
  let shadowLength = 0;
  
  if (!isNight && elevation > 0) {
    const shadowLengthInMeters = buildingHeight / Math.tan(elevRad);
    // Cap shadow length to avoid infinite shadow length at sunset/sunrise
    shadowLength = Math.min(250, shadowLengthInMeters * scale);
  }
  
  const azRad = azimuth * Math.PI / 180;
  const dx = -Math.sin(azRad) * shadowLength; 
  const dy = Math.cos(azRad) * shadowLength;

  const rotRad = houseRotation * Math.PI / 180;

  // Center, scale, and rotate house corners — anchored to plot coordinate system
  const corners = convertedCorners.map(([xm, ym]) => {
    const x = xm - midX;
    const y = ym - midY;
    // Rotate by houseRotation
    const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
    const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
    // Place house centroid at SVG center; use plotScale for consistency
    return [cx + rx * scale, cy - ry * scale]; // invert Y so North=up
  });

  // Project corners of the shadow
  const shadowCorners = corners.map(([vx, vy]) => [vx + dx, vy + dy]);

  // Build wall shadow polygons for each edge of the custom house shape
  const wallShadowPolygons = corners.map((v, i) => {
    const j = (i + 1) % corners.length;
    const vi = corners[i];
    const vj = corners[j];
    const si = shadowCorners[i];
    const sj = shadowCorners[j];
    return `${vi[0].toFixed(1)},${vi[1].toFixed(1)} ${vj[0].toFixed(1)},${vj[1].toFixed(1)} ${sj[0].toFixed(1)},${sj[1].toFixed(1)} ${si[0].toFixed(1)},${si[1].toFixed(1)}`;
  });
  const capPoints = shadowCorners.map(s => `${s[0].toFixed(1)},${s[1].toFixed(1)}`).join(' ');

  // Build house points path for SVG rendering
  const housePoints = corners.map(v => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join(' ');

  // Create inner courtyard by scaling down corners towards center (cx, cy)
  const courtyardPoints = corners.map(([vx, vy]) => {
    const k = 0.65; // scale factor
    const px = cx + (vx - cx) * k;
    const py = cy + (vy - cy) * k;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');

  // 6. Dynamic Colors based on solar elevation
  let groundColor = '#f5ebdb'; // Bright sand
  let skyRingColor = '#e6d8c0'; // Sky horizon line
  let courtyardColor = '#e6d8c0'; 
  let houseColor = '#c2a176';
  let houseStroke = '#9e7446';
  let isSunset = elevation > 0 && elevation < 12;

  if (isNight) {
    groundColor = '#242a22';      // Dark desaturated earth
    skyRingColor = '#323a30';     // Dark horizon
    courtyardColor = '#242a22';
    houseColor = '#4e3b2b';       // Darkened wood/clay
    houseStroke = '#32251a';
  } else if (isSunset) {
    // Warm sunset gradient
    groundColor = '#e7ab97';      // Terracotta tint
    skyRingColor = '#e29782';     // Sunset horizon
    courtyardColor = '#e7ab97';
    houseColor = '#ab7c5c';
    houseStroke = '#80563b';
  }

  // Wind animation speed based on wind speed
  const windAnimDuration = Math.max(0.6, Math.min(4, 30 / Math.max(2, windSpeed)));

  // Generate stars for night mode
  const stars = [
    { x: 90, y: 110, r: 1 }, { x: 130, y: 70, r: 1.5 }, { x: 280, y: 80, r: 1.2 },
    { x: 310, y: 140, r: 1 }, { x: 180, y: 90, r: 1 }, { x: 220, y: 60, r: 1.8 },
    { x: 100, y: 290, r: 1.5 }, { x: 300, y: 300, r: 1.2 }, { x: 250, y: 320, r: 1 },
    { x: 70, y: 200, r: 1.2 }, { x: 330, y: 220, r: 1.5 }
  ];

  return (
    <div className="flex-grow bg-white rounded-xl border border-desert-200 p-4 shadow-sm flex flex-col items-center">
      
      {/* Simulation Info */}
      <div className="w-full flex flex-wrap justify-between items-center mb-3 text-sm text-desert-800 border-b border-desert-100 pb-2">
        <div>
          <span className="font-bold">מיקום:</span> {locationName} ({latitude.toFixed(4)}°, {longitude.toFixed(4)}°)
        </div>
        <div className="flex gap-4">
          <div>
            <span className="font-bold">גובה שמש:</span> {elevation.toFixed(1)}° 
            {isNight ? ' (לילה)' : isSunset ? ' (שקיעה/זריחה)' : ' (יום)'}
          </div>
          <div>
            <span className="font-bold">זווית שמש:</span> {azimuth.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* Marking mode controls */}
      <div className="w-full mb-3 flex flex-col gap-2 bg-desert-50 p-2.5 rounded-xl border border-desert-200 text-xs no-print">
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsMarkingMode(!isMarkingMode);
              if (!isMarkingMode) {
                setMarkedPoints([]);
              }
            }}
            className={`flex-grow font-bold py-1.5 px-3 rounded-lg transition-colors border ${
              isMarkingMode 
                ? 'bg-terracotta-600 text-white border-terracotta-700 hover:bg-terracotta-700' 
                : 'bg-white text-desert-700 border-desert-300 hover:bg-desert-50'
            }`}
          >
            {isMarkingMode ? '🛑 ביטול סימון' : '📍 סמן פינות בניין'}
          </button>

          {isMarkingMode && markedPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setMarkedPoints([])}
              className="bg-white text-desert-700 border border-desert-300 font-medium py-1.5 px-3 rounded-lg hover:bg-desert-50 transition-colors"
            >
              נקה נקודות
            </button>
          )}
        </div>

        {isMarkingMode && (
          <div className="text-[10px] text-desert-600 leading-tight">
            לחץ על השרטוט למטה כדי לסמן פינות. {markedPoints.length} נקודות סומנו.
            {markedPoints.length >= 3 && (
              <button
                type="button"
                onClick={handleGenerate3D}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1 text-xs"
              >
                <span>הפק מסה 3D 🚀</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* SVG Container — width/height driven by canvasSize store value */}
      <div
        className="relative aspect-square rounded-xl overflow-hidden bg-desert-50 border border-desert-200 mx-auto"
        style={{ width: canvasSize, height: canvasSize, cursor: isMarkingMode ? 'crosshair' : 'default' }}
      >
        
        {/* Directions Labels */}
        <div className="absolute inset-0 pointer-events-none select-none text-xs font-bold text-desert-700 p-2">
          <div className="absolute top-2 left-1/2 -translate-x-1/2">צ (North)</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">ד (South)</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2">מ (East)</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2">מערב (West)</div>
        </div>

        <svg viewBox="0 0 400 400" className="w-full h-full select-none" onClick={handleSvgClick}>
          <defs>
            {/* Blur filter for soft shadows */}
            <filter id="shadow-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            {/* Radial gradient for sun glow */}
            <radialGradient id="sun-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
              <stop offset="30%" stopColor="#fbbf24" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            {/* Sky Background Gradients */}
            <linearGradient id="sky-day" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fcf9f2" />
              <stop offset="100%" stopColor="#f3e8d2" />
            </linearGradient>
            <linearGradient id="sky-sunset" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbcfe8" />
              <stop offset="50%" stopColor="#fecdd3" />
              <stop offset="100%" stopColor="#ffedd5" />
            </linearGradient>
            <linearGradient id="sky-night" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill={isNight ? "#94a3b8" : "#78350f"} />
            </marker>
          </defs>

          {/* 1. Background fill */}
          <rect x="0" y="0" width="400" height="400"
            fill={isNight ? "url(#sky-night)" : isSunset ? "url(#sky-sunset)" : "url(#sky-day)"} />

          {/* Starfield in Night Mode */}
          {isNight && (
            <g opacity="0.8">
              {stars.map((star, idx) => (
                <circle key={idx} cx={star.x} cy={star.y} r={star.r} fill="#fff" className="animate-pulse" />
              ))}
            </g>
          )}

          {/* ── PLOT BOUNDARY (קו מגרש) ── */}
          {/* Street / road strip to east */}
          <rect
            x={streetLineStart[0]} y={Math.min(streetLineStart[1], streetLineEnd[1]) - 10}
            width="30" height={Math.abs(streetLineStart[1] - streetLineEnd[1]) + 20}
            fill={isNight ? "#1e2a1a" : "#d0cfc8"} opacity="0.7"
          />
          {/* Street label */}
          <text
            x={streetLineStart[0] + 15}
            y={(streetLineStart[1] + streetLineEnd[1]) / 2}
            fontSize="9" fill={isNight ? "#94a3b8" : "#555"}
            textAnchor="middle" transform={`rotate(-90,${streetLineStart[0]+15},${(streetLineStart[1]+streetLineEnd[1])/2})`}
          >רחוב</text>

          {/* Plot fill */}
          <polygon
            points={plotSvgPoints}
            fill={isNight ? "#1e2d1e" : "#e8f0e0"}
            stroke="#2d8a4e"
            strokeWidth="2"
          />

          {/* Setback line — אזור מותר לבנייה */}
          <polygon
            points={setbackSvgPoints}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.85"
          />

          {/* Street edge line (red) */}
          <line
            x1={streetLineStart[0]} y1={streetLineStart[1]}
            x2={streetLineEnd[0]}   y2={streetLineEnd[1]}
            stroke="#cc2222" strokeWidth="2"
          />

          {/* Grid cross-hair (light) */}
          <g stroke={isNight ? "#2e3745" : "#c8d8b8"} strokeWidth="0.5" opacity="0.5">
            <line x1="200" y1="20" x2="200" y2="380" />
            <line x1="20" y1="200" x2="380" y2="200" />
          </g>

          {/* 2. Sun Trajectory Path */}
          {!isNight && trajectoryPath && (
            <path 
              d={trajectoryPath} 
              fill="none" 
              stroke="#fbbf24" 
              strokeWidth="2" 
              strokeDasharray="4 6" 
              opacity={isSunset ? "0.4" : "0.6"} 
            />
          )}

          {/* 3. Shadow Rendering */}
          {!isNight && shadowLength > 0 && (
            <g opacity="0.35" filter="url(#shadow-blur)">
              {/* Wall shadow polygons */}
              {wallShadowPolygons.map((pts, idx) => (
                <polygon key={idx} points={pts} fill="#0f172a" />
              ))}
              {/* Shadow cap */}
              <polygon points={capPoints} fill="#0f172a" />
            </g>
          )}

          {/* 4. The House */}
          <g>
            {/* Outer Walls */}
            <polygon 
              points={housePoints} 
              fill={houseColor} 
              stroke={houseStroke} 
              strokeWidth="2.5" 
            />

            {/* Inner Desert Courtyard / Patio (Passive Cooling Design) */}
            <polygon 
              points={courtyardPoints} 
              fill={isNight ? "#fbbf24" : courtyardColor} 
              stroke={isNight ? "#f59e0b" : houseStroke} 
              strokeWidth="1.5" 
              opacity={isNight ? 0.9 : 1}
              className={isNight ? "animate-pulse" : ""}
            />

            {/* Visual House orientation arrow indicator */}
            <line 
              x1={cx} 
              y1={cy} 
              x2={corners[0] ? ((corners[0][0] + (corners[1] ? corners[1][0] : corners[0][0])) / 2).toFixed(1) : cx} 
              y2={corners[0] ? ((corners[0][1] + (corners[1] ? corners[1][1] : corners[0][1])) / 2).toFixed(1) : cy} 
              stroke={isNight ? "#94a3b8" : "#78350f"} 
              strokeWidth="1.5" 
              strokeDasharray="2 3" 
              opacity="0.6"
              markerEnd="url(#arrow)"
            />
          </g>

          {/* 5. Sun Element */}
          {!isNight && (
            <g transform={`translate(${sunCoords.x.toFixed(1)}, ${sunCoords.y.toFixed(1)})`}>
              {/* Sun Glow */}
              <circle cx="0" cy="0" r="28" fill="url(#sun-glow)" />
              {/* Sun Body */}
              <circle cx="0" cy="0" r="12" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5" />
              {/* Rays */}
              <line x1="0" y1="-18" x2="0" y2="-13" stroke="#d97706" strokeWidth="1.5" />
              <line x1="0" y1="13" x2="0" y2="18" stroke="#d97706" strokeWidth="1.5" />
              <line x1="-18" y1="0" x2="-13" y2="0" stroke="#d97706" strokeWidth="1.5" />
              <line x1="13" y1="0" x2="18" y2="0" stroke="#d97706" strokeWidth="1.5" />
            </g>
          )}

          {/* 6. Wind Elements (Toggled) */}
          {showWind && (
            <g transform={`rotate(${windAngle}, ${cx}, ${cy})`}>
              <style>{`
                .wind-vector {
                  stroke-dasharray: 12 10;
                  animation: windFlow ${windAnimDuration}s linear infinite;
                }
                @keyframes windFlow {
                  0% { stroke-dashoffset: 44; }
                  100% { stroke-dashoffset: 0; }
                }
              `}</style>
              {/* Wind Arrows coming from the top (0 deg) representing the source direction */}
              <g stroke={isNight ? "#38bdf8" : "#0284c7"} strokeWidth="2.5" opacity={isNight ? "0.4" : "0.6"} fill="none">
                {/* Wind stream 1 */}
                <path d="M 160 30 L 160 120" className="wind-vector" />
                <path d="M 155 110 L 160 120 L 165 110" />
                
                {/* Wind stream 2 (behind the house/deflected if hitting house) */}
                <path d="M 200 20 L 200 110" className="wind-vector" />
                <path d="M 195 100 L 200 110 L 205 100" />
                
                {/* Wind stream 3 */}
                <path d="M 240 30 L 240 120" className="wind-vector" />
                <path d="M 235 110 L 240 120 L 245 110" />
              </g>
            </g>
          )}

          {/* Render Marked Points */}
          {markedPoints.map(([px, py], idx) => (
            <g key={idx}>
              <circle
                cx={px}
                cy={py}
                r="6"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle
                cx={px}
                cy={py}
                r="5"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <text
                x={px}
                y={py - 10}
                fontSize="10"
                fontWeight="bold"
                fill="#ef4444"
                textAnchor="middle"
              >
                {idx + 1}
              </text>
            </g>
          ))}

          {/* Render lines connecting marked points */}
          {markedPoints.length > 1 && (
            <polyline
              points={markedPoints.map(([px, py]) => `${px},${py}`).join(' ')}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}

          {/* Close the polygon if 3+ points */}
          {markedPoints.length >= 3 && (
            <line
              x1={markedPoints[markedPoints.length - 1][0]}
              y1={markedPoints[markedPoints.length - 1][1]}
              x2={markedPoints[0][0]}
              y2={markedPoints[0][1]}
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {/* Night Indicator text overlay */}
        {isNight && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/80 text-yellow-400 text-xs py-1 px-3 rounded-full font-bold">
            השמש שקעה (לילה)
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="w-full mt-3 grid grid-cols-3 gap-2 text-xs text-desert-800 bg-desert-50 p-2 rounded-lg border border-desert-100">
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-0.5 inline-block bg-[#2d8a4e]"></span>
          <span>קו מגרש</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2"/></svg>
          <span>קו בנייה (5מ׳/3מ׳)</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-0.5 inline-block bg-[#cc2222]"></span>
          <span>קו רחוב</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-3 rounded-full bg-[#fbbf24] border border-[#d97706]"></span>
          <span>נתיב שמש</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-3 bg-slate-400/40 rounded-sm border border-slate-400"></span>
          <span>הצללה</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-1.5 inline-block bg-sky-500 rounded-sm"></span>
          <span>רוחות</span>
        </div>
      </div>
    </div>
  );
};

export default Visualization2D;
