import { Fragment } from 'react';
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
    houseZoom
  } = useStore();

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

  // 3. Coordinate conversions for the Sun in polar view
  // Center of SVG is (200, 200). Outer horizon circle radius is 150.
  const cx = 200;
  const cy = 200;
  const horizonRadius = 150;

  // Compute sun position coordinates in SVG space
  const getSvgCoords = (az, elev) => {
    // Distance from center: zenith (90 deg) is 0, horizon (0 deg) is horizonRadius
    // Below horizon, we clamp distance at horizonRadius
    const dist = horizonRadius * (1 - Math.max(0, elev) / 90);
    // Azimuth: 0 is North (-Y), 90 is East (+X), 180 is South (+Y), 270 is West (-X)
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

  // Center, scale, and rotate corners
  const corners = convertedCorners.map(([xm, ym]) => {
    // Translate relative to center of bounding box
    const x = xm - midX;
    const y = ym - midY;
    // Rotate
    const rx = x * Math.cos(rotRad) - y * Math.sin(rotRad);
    const ry = x * Math.sin(rotRad) + y * Math.cos(rotRad);
    // Convert to SVG coordinates relative to center (cx, cy)
    return [cx + rx * scale, cy + ry * scale];
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

      {/* SVG Container */}
      <div className="relative w-full max-w-[420px] aspect-square rounded-xl overflow-hidden bg-desert-50 border border-desert-200">
        
        {/* Directions Labels */}
        <div className="absolute inset-0 pointer-events-none select-none text-xs font-bold text-desert-700 p-2">
          <div className="absolute top-2 left-1/2 -translate-x-1/2">צ (North)</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">ד (South)</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2">מ (East)</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2">מערב (West)</div>
        </div>

        <svg viewBox="0 0 400 400" className="w-full h-full select-none">
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

          {/* 1. Sky / Ground Circle */}
          <rect 
            x="0" 
            y="0" 
            width="400" 
            height="400" 
            fill={isNight ? "url(#sky-night)" : isSunset ? "url(#sky-sunset)" : "url(#sky-day)"} 
          />

          {/* Compass Dial Outer Ring */}
          <circle cx={cx} cy={cy} r={horizonRadius} fill={groundColor} stroke={skyRingColor} strokeWidth="2" />
          <circle cx={cx} cy={cy} r={horizonRadius + 12} fill="none" stroke={skyRingColor} strokeWidth="1" strokeDasharray="3 5" opacity="0.5" />

          {/* Starfield in Night Mode */}
          {isNight && (
            <g opacity="0.8">
              {stars.map((star, idx) => (
                <circle key={idx} cx={star.x} cy={star.y} r={star.r} fill="#fff" className="animate-pulse" />
              ))}
            </g>
          )}

          {/* Grid lines */}
          <g stroke={isNight ? "#2e3745" : "#e5d8bf"} strokeWidth="1" opacity="0.4">
            <line x1={cx - horizonRadius} y1={cy} x2={cx + horizonRadius} y2={cy} />
            <line x1={cx} y1={cy - horizonRadius} x2={cx} y2={cy + horizonRadius} />
            <circle cx={cx} cy={cy} r={horizonRadius * 0.66} fill="none" />
            <circle cx={cx} cy={cy} r={horizonRadius * 0.33} fill="none" />
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
          <span className="w-3 h-3 rounded-full bg-[#fbbf24] border border-[#d97706]"></span>
          <span>נתיב ומיקום שמש</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-3 bg-slate-400/40 rounded-sm border border-slate-400"></span>
          <span>הצללה מוטלת</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="w-3 h-1.5 inline-block bg-sky-500 rounded-sm"></span>
          <span>רוחות מנושבות</span>
        </div>
      </div>
    </div>
  );
};

export default Visualization2D;
