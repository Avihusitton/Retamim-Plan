/**
 * FloorPlanAutoTracer.jsx
 * -----------------------
 * Accepts a floor-plan image (upload / drag-drop), uses OpenCV.js (CDN,
 * 100% local) to auto-detect the largest exterior contour, then provides
 * a rich in-canvas editor:
 *   • Drag mode  — drag any corner dot to move it
 *   • Add mode   — click anywhere on the canvas to insert a new point
 *                  (inserted between the two nearest edge endpoints)
 *   • Delete     — right-click a dot OR click × in the sidebar list
 *   • Sidebar    — scrollable list with inline numeric editing per point
 *
 * OpenCV.js must be loaded in index.html:
 *   <script async src="https://docs.opencv.org/4.8.0/opencv.js"></script>
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Upload, CheckCheck, RotateCcw, Move, Plus, Trash2 } from 'lucide-react';

// ─── OpenCV readiness helper ─────────────────────────────────────────────────
const waitForCV = () =>
  new Promise((resolve) => {
    const check = setInterval(() => {
      if (window.cv?.Mat) { clearInterval(check); resolve(); }
    }, 100);
  });

// ─── Contour detection (pure OpenCV) ─────────────────────────────────────────
const detectContours = (imgElement) => {
  const cv = window.cv;
  const src = cv.imread(imgElement);
  const gray = new cv.Mat(), blurred = new cv.Mat();
  const edges = new cv.Mat(), contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 50, 150);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() === 0) {
    src.delete(); gray.delete(); blurred.delete();
    edges.delete(); contours.delete(); hierarchy.delete();
    return [];
  }

  let maxArea = 0, maxIdx = 0;
  for (let i = 0; i < contours.size(); i++) {
    const a = cv.contourArea(contours.get(i));
    if (a > maxArea) { maxArea = a; maxIdx = i; }
  }

  const contour = contours.get(maxIdx);
  const approx  = new cv.Mat();
  const epsilon  = 0.02 * cv.arcLength(contour, true);
  cv.approxPolyDP(contour, approx, epsilon, true);

  const corners = [];
  for (let i = 0; i < approx.rows; i++)
    corners.push([approx.intAt(i, 0), approx.intAt(i, 1)]);

  src.delete(); gray.delete(); blurred.delete(); edges.delete();
  contours.delete(); hierarchy.delete(); approx.delete();
  return corners;
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────
/** Squared distance from point P to segment AB */
const ptSegDistSq = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
};

/** Find the edge index (0-based) of the polygon edge closest to point P */
const nearestEdge = (pts, p) => {
  let bestDist = Infinity, bestEdge = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const d = ptSegDistSq(p, pts[i], pts[j]);
    if (d < bestDist) { bestDist = d; bestEdge = i; }
  }
  return bestEdge;
};

// ─── Canvas drawing ───────────────────────────────────────────────────────────
const COLORS = { poly: '#3b82f6', dot: '#ef4444', hover: '#f59e0b', add: '#10b981', selected: '#a855f7' };

const drawOverlay = (canvas, imgEl, pts, mode, hoverIdx, selectedIdx) => {
  if (!canvas || !imgEl || pts.length < 2) return;
  canvas.width  = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lw = Math.max(2, canvas.width / 300);
  const r  = Math.max(7, canvas.width / 75);

  // Polygon fill + stroke
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle   = 'rgba(59,130,246,0.07)';
  ctx.fill();
  ctx.strokeStyle = COLORS.poly;
  ctx.lineWidth   = lw;
  ctx.stroke();

  // Edge midpoint hint in Add mode
  if (mode === 'add') {
    for (let i = 0; i < pts.length; i++) {
      const j  = (i + 1) % pts.length;
      const mx = (pts[i][0] + pts[j][0]) / 2;
      const my = (pts[i][1] + pts[j][1]) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.45, 0, 2 * Math.PI);
      ctx.fillStyle   = 'rgba(16,185,129,0.55)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Corner dots
  pts.forEach(([x, y], i) => {
    const isHovered  = i === hoverIdx;
    const isSelected = i === selectedIdx;
    const color = isSelected ? COLORS.selected : (isHovered ? COLORS.hover : COLORS.dot);

    ctx.beginPath();
    ctx.arc(x, y, r * (isHovered || isSelected ? 1.25 : 1), 0, 2 * Math.PI);
    ctx.fillStyle   = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2.5;
    ctx.fill();
    ctx.stroke();

    // Index label
    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.round(r * 1.05)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(i + 1, x, y);
  });
};

// ─── Component ────────────────────────────────────────────────────────────────
const FloorPlanAutoTracer = ({ onCornersExtracted }) => {
  const [status,         setStatus]        = useState('idle');
  const [errorMsg,       setErrorMsg]      = useState('');
  const [imgSrc,         setImgSrc]        = useState(null);
  const [corners,        setCorners]       = useState([]);
  const [pixelsPerMeter, setPPM]           = useState(20);
  const [mode,           setMode]          = useState('drag'); // 'drag' | 'add'
  const [draggingIdx,    setDraggingIdx]   = useState(null);
  const [hoverIdx,       setHoverIdx]      = useState(-1);
  const [selectedIdx,    setSelectedIdx]   = useState(-1);

  const imgRef    = useRef(null);
  const canvasRef = useRef(null);

  // ── Redraw helper (reads latest state from args) ──────────────────────────
  const redraw = useCallback((pts, m, hi, si) => {
    drawOverlay(canvasRef.current, imgRef.current, pts, m, hi, si);
  }, []);

  useEffect(() => {
    if (status === 'done') redraw(corners, mode, hoverIdx, selectedIdx);
  }, [corners, mode, hoverIdx, selectedIdx, status, redraw]);

  // ── Canvas coordinate helper ──────────────────────────────────────────────
  const canvasCoords = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return [(cx - r.left) * sx, (cy - r.top) * sy];
  };

  const hitR = () => {
    const c = canvasRef.current;
    return c ? Math.max(12, c.width / 55) : 18;
  };

  const hitIdx = (pts, mx, my) => {
    const hr = hitR();
    return pts.findIndex(([x, y]) => Math.hypot(x - mx, y - my) < hr);
  };

  // ── Pointer events ────────────────────────────────────────────────────────
  const onMouseMove = (e) => {
    if (status !== 'done') return;
    const [mx, my] = canvasCoords(e);

    if (draggingIdx !== null) {
      e.preventDefault();
      const c = canvasRef.current;
      const nx = Math.max(0, Math.min(c.width,  mx));
      const ny = Math.max(0, Math.min(c.height, my));
      setCorners(prev => {
        const next = prev.map((p, i) => i === draggingIdx ? [nx, ny] : p);
        redraw(next, mode, draggingIdx, selectedIdx);
        return next;
      });
      return;
    }

    // Hover highlight
    const hi = hitIdx(corners, mx, my);
    if (hi !== hoverIdx) setHoverIdx(hi);
  };

  const onMouseDown = (e) => {
    if (status !== 'done') return;
    const [mx, my] = canvasCoords(e);

    if (mode === 'drag') {
      const idx = hitIdx(corners, mx, my);
      if (idx !== -1) {
        e.preventDefault();
        setSelectedIdx(idx);
        setDraggingIdx(idx);
      } else {
        setSelectedIdx(-1);
      }
    }

    if (mode === 'add') {
      // Insert new point on nearest edge
      const ei   = nearestEdge(corners, [mx, my]);
      const next = [...corners];
      next.splice(ei + 1, 0, [Math.round(mx), Math.round(my)]);
      setCorners(next);
      setMode('drag');         // auto-switch to drag so user can immediately adjust
      setSelectedIdx(ei + 1);
    }
  };

  const onMouseUp = () => setDraggingIdx(null);

  const onContextMenu = (e) => {
    if (status !== 'done') return;
    e.preventDefault();
    const [mx, my] = canvasCoords(e);
    const idx = hitIdx(corners, mx, my);
    if (idx !== -1) deletePoint(idx);
  };

  // ── Point management ──────────────────────────────────────────────────────
  const deletePoint = (idx) => {
    if (corners.length <= 3) return; // minimum polygon
    setCorners(prev => prev.filter((_, i) => i !== idx));
    if (selectedIdx === idx) setSelectedIdx(-1);
  };

  const updatePointCoord = (idx, axis, value) => {
    const v = parseInt(value, 10);
    if (isNaN(v)) return;
    setCorners(prev => prev.map((p, i) => i === idx ? (axis === 0 ? [v, p[1]] : [p[0], v]) : p));
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file?.type.startsWith('image/')) {
      setErrorMsg('יש להעלות תמונה (PNG / JPG)'); setStatus('error'); return;
    }
    setErrorMsg(''); setStatus('loading-cv'); setCorners([]); setImgSrc(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      setImgSrc(e.target.result);
      try {
        await waitForCV(); setStatus('processing');
        await new Promise(r => setTimeout(r, 80));
        const img = imgRef.current;
        if (!img) throw new Error('תמונה לא נטענה');
        const pts = detectContours(img);
        if (pts.length < 3) { setErrorMsg('לא נמצא קונטור — נסה תמונה עם גבולות ברורים יותר.'); setStatus('error'); return; }
        setCorners(pts); setStatus('done');
      } catch (err) { setErrorMsg(`שגיאה: ${err.message}`); setStatus('error'); }
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]); };

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const ppm = Math.max(1, Number(pixelsPerMeter) || 20);
    const h   = imgRef.current?.naturalHeight ?? 0;
    onCornersExtracted(corners.map(([px, py]) => [
      Math.round((px / ppm) * 100) / 100,
      Math.round(((h - py) / ppm) * 100) / 100,
    ]));
  };

  const handleReset = () => {
    setStatus('idle'); setImgSrc(null); setCorners([]);
    setErrorMsg(''); setDraggingIdx(null); setHoverIdx(-1); setSelectedIdx(-1); setMode('drag');
  };

  // ── Canvas cursor style ───────────────────────────────────────────────────
  const cursorStyle = () => {
    if (mode === 'add') return 'cell';
    if (draggingIdx !== null) return 'grabbing';
    if (hoverIdx !== -1) return 'grab';
    return 'default';
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-desert-700">
          📐 זיהוי קונטור מתכנית קומה (OpenCV.js)
        </p>
        {status !== 'idle' && (
          <button onClick={handleReset}
            className="flex items-center gap-1 text-[10px] text-desert-500 hover:text-red-600 transition-colors">
            <RotateCcw className="w-3 h-3" /> אפס
          </button>
        )}
      </div>

      {/* Upload zone */}
      {status === 'idle' && (
        <label onDrop={onDrop} onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-desert-300 rounded-xl p-6 cursor-pointer hover:border-terracotta-400 hover:bg-white transition-colors">
          <Upload className="w-7 h-7 text-desert-400" />
          <span className="text-xs text-desert-600 font-semibold">גרור סכמה לכאן או לחץ להעלאה</span>
          <span className="text-[10px] text-desert-400">PNG / JPG</span>
          <input type="file" accept="image/*" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />
        </label>
      )}

      {/* Scale input */}
      {(status === 'idle' || status === 'done') && (
        <div className="flex items-center gap-2 text-xs text-desert-700">
          <label htmlFor="ftc-ppm" className="whitespace-nowrap font-medium">1 מטר = כמה פיקסלים?</label>
          <input id="ftc-ppm" type="number" min={1} max={500} value={pixelsPerMeter}
            onChange={e => setPPM(e.target.value)}
            className="w-20 p-1.5 border border-desert-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-terracotta-400 focus:outline-none" />
        </div>
      )}

      {/* Spinner */}
      {(status === 'loading-cv' || status === 'processing') && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-8 h-8 border-4 border-terracotta-200 border-t-terracotta-600 rounded-full animate-spin" />
          <span className="text-xs text-desert-600 font-semibold">
            {status === 'loading-cv' ? '🔍 טוען OpenCV...' : '🔍 מזהה קונטורים...'}
          </span>
          {imgSrc && <img ref={imgRef} src={imgSrc} alt="" className="hidden" crossOrigin="anonymous" />}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── Done state: toolbar + canvas + sidebar ── */}
      {status === 'done' && (
        <>
          {/* Mode toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-desert-500 font-semibold uppercase tracking-wide ml-1">מצב עריכה:</span>
            <button
              onClick={() => setMode('drag')}
              title="גרור נקודות"
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors
                ${mode === 'drag'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-desert-600 border-desert-300 hover:border-blue-400 hover:text-blue-600'}`}
            >
              <Move className="w-3.5 h-3.5" /> גרור
            </button>
            <button
              onClick={() => setMode('add')}
              title="הוסף נקודה חדשה"
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors
                ${mode === 'add'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white text-desert-600 border-desert-300 hover:border-emerald-400 hover:text-emerald-600'}`}
            >
              <Plus className="w-3.5 h-3.5" /> הוסף נקודה
            </button>
            {mode === 'add' && (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                לחץ על הקנבס להוספה
              </span>
            )}
            <span className="mr-auto text-[10px] text-desert-500">
              {corners.length} נקודות · לחצן ימני למחיקה
            </span>
          </div>

          {/* Canvas + sidebar — two column layout */}
          <div className="flex gap-3 items-start">

            {/* Canvas */}
            <div className="relative rounded-xl overflow-hidden border border-desert-200 bg-white select-none flex-1"
              style={{ touchAction: 'none' }}>
              <img ref={imgRef} src={imgSrc} alt="תכנית קומה" className="w-full block"
                crossOrigin="anonymous" onLoad={() => redraw(corners, mode, hoverIdx, selectedIdx)} />
              <canvas ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ cursor: cursorStyle() }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => { setDraggingIdx(null); setHoverIdx(-1); }}
                onContextMenu={onContextMenu}
                onTouchStart={onMouseDown}
                onTouchMove={onMouseMove}
                onTouchEnd={onMouseUp}
              />
            </div>

            {/* Point list sidebar */}
            <div className="w-44 flex-shrink-0 flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-0.5">
              <p className="text-[10px] font-semibold text-desert-600 uppercase tracking-wide sticky top-0 bg-desert-50 pb-1">
                רשימת נקודות (px)
              </p>
              {corners.map(([x, y], i) => (
                <div
                  key={i}
                  onClick={() => setSelectedIdx(i === selectedIdx ? -1 : i)}
                  className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 cursor-pointer transition-colors text-[10px]
                    ${selectedIdx === i
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-desert-200 bg-white hover:border-blue-300'}`}
                >
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <input
                    type="number"
                    value={Math.round(x)}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updatePointCoord(i, 0, e.target.value)}
                    className="w-14 p-0.5 border border-desert-200 rounded text-[10px] font-mono text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-desert-400">,</span>
                  <input
                    type="number"
                    value={Math.round(y)}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updatePointCoord(i, 1, e.target.value)}
                    className="w-14 p-0.5 border border-desert-200 rounded text-[10px] font-mono text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onClick={e => { e.stopPropagation(); deletePoint(i); }}
                    disabled={corners.length <= 3}
                    title="מחק נקודה"
                    className="mr-auto text-desert-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {/* Add row button */}
              <button
                onClick={() => setMode('add')}
                className="flex items-center justify-center gap-1 border border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg py-1 text-[10px] font-semibold transition-colors"
              >
                <Plus className="w-3 h-3" /> הוסף נקודה
              </button>
            </div>
          </div>

          {/* Actions footer */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <p className="text-[10px] text-desert-500 italic">
              גרור נקודות · לחצן ימני = מחיקה · הוסף נקודה על הקצה
            </p>
            <button id="btn-floor-plan-confirm" onClick={handleConfirm}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-xs shadow-sm">
              <CheckCheck className="w-4 h-4" />
              ← אשר ויבא
            </button>
          </div>
        </>
      )}

      <p className="text-[10px] text-desert-400 italic text-center">
        כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי
      </p>
    </div>
  );
};

export default FloorPlanAutoTracer;
