/**
 * FloorPlanAutoTracer.jsx
 * -----------------------
 * Accepts a floor-plan image (upload / drag-drop), uses OpenCV.js (CDN,
 * 100% local) to auto-detect the largest exterior contour, lets the user
 * drag individual corner dots to correct the result, then calls
 * onCornersExtracted([[x,y], ...]) with pixel→meter converted corners.
 *
 * OpenCV.js must be loaded in index.html:
 *   <script async src="https://docs.opencv.org/4.8.0/opencv.js"
 *           onload="window.openCvReady=true"></script>
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Upload, CheckCheck, RotateCcw } from 'lucide-react';

// ─── OpenCV readiness helper ─────────────────────────────────────────────────
const waitForOpenCV = () =>
  new Promise((resolve) => {
    if (window.cv && window.cv.Mat) return resolve();
    const id = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(id);
        resolve();
      }
    }, 100);
  });

// ─── Contour detection (pure OpenCV) ─────────────────────────────────────────
const detectContours = (imgElement) => {
  const cv = window.cv;
  const src       = cv.imread(imgElement);
  const gray      = new cv.Mat();
  const blurred   = new cv.Mat();
  const edges     = new cv.Mat();
  const contours  = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 50, 150);
  cv.findContours(
    edges, contours, hierarchy,
    cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE
  );

  if (contours.size() === 0) {
    src.delete(); gray.delete(); blurred.delete();
    edges.delete(); contours.delete(); hierarchy.delete();
    return [];
  }

  // Largest contour by area
  let maxArea = 0, maxIdx = 0;
  for (let i = 0; i < contours.size(); i++) {
    const area = cv.contourArea(contours.get(i));
    if (area > maxArea) { maxArea = area; maxIdx = i; }
  }

  // Approximate polygon (Douglas-Peucker)
  const contour = contours.get(maxIdx);
  const approx  = new cv.Mat();
  const epsilon = 0.02 * cv.arcLength(contour, true);
  cv.approxPolyDP(contour, approx, epsilon, true);

  const corners = [];
  for (let i = 0; i < approx.rows; i++) {
    corners.push([approx.intAt(i, 0), approx.intAt(i, 1)]);
  }

  src.delete(); gray.delete(); blurred.delete(); edges.delete();
  contours.delete(); hierarchy.delete(); approx.delete();
  // Note: contour is a view into MatVector — do not delete separately

  return corners; // pixel [x, y]
};

// ─── Component ────────────────────────────────────────────────────────────────
const FloorPlanAutoTracer = ({ onCornersExtracted }) => {
  const [status,          setStatus]         = useState('idle');
  // idle | loading-cv | processing | done | error
  const [errorMsg,        setErrorMsg]       = useState('');
  const [imgSrc,          setImgSrc]         = useState(null);   // data URL
  const [corners,         setCorners]        = useState([]);     // pixel [x,y]
  const [pixelsPerMeter,  setPixelsPerMeter] = useState(20);
  const [draggingIdx,     setDraggingIdx]    = useState(null);

  const imgRef       = useRef(null);
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);

  // ── Draw overlay (polygon + draggable dots) onto canvas ──────────────────
  const drawOverlay = useCallback((pts, img) => {
    const canvas  = canvasRef.current;
    const imgEl   = img || imgRef.current;
    if (!canvas || !imgEl) return;

    canvas.width  = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pts.length < 2) return;

    // Polygon
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.lineWidth   = Math.max(2, canvas.width / 300);
    ctx.stroke();
    ctx.fillStyle   = 'rgba(255,80,80,0.08)';
    ctx.fill();

    // Corner dots
    const r = Math.max(6, canvas.width / 80);
    pts.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle   = '#ef4444';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      // Index label
      ctx.fillStyle  = '#fff';
      ctx.font       = `bold ${Math.round(r * 1.1)}px sans-serif`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, x, y);
    });
  }, []);

  // Re-draw whenever corners change
  useEffect(() => {
    if (status === 'done') drawOverlay(corners);
  }, [corners, status, drawOverlay]);

  // ── File upload handler ───────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setErrorMsg('יש להעלות קובץ תמונה (PNG / JPG / WEBP)');
      setStatus('error');
      return;
    }
    setErrorMsg('');
    setStatus('loading-cv');
    setCorners([]);
    setImgSrc(null);

    // Load image into state
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImgSrc(dataUrl);

      // Wait for OpenCV then process
      try {
        await waitForOpenCV();
        setStatus('processing');

        // Give React one tick to render the <img> element
        await new Promise(r => setTimeout(r, 80));

        const img = imgRef.current;
        if (!img) throw new Error('תמונה לא נטענה');
        const pts = detectContours(img);

        if (pts.length < 3) {
          setErrorMsg('לא נמצא קונטור ברור בתמונה. נסה תמונה עם גבולות ברורים יותר.');
          setStatus('error');
          return;
        }
        setCorners(pts);
        setStatus('done');
      } catch (err) {
        setErrorMsg(`שגיאה בזיהוי קונטורים: ${err.message}`);
        setStatus('error');
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Drag-and-drop file ────────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  // ── Dot dragging on canvas ────────────────────────────────────────────────
  const canvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
      (clientX - rect.left)  * scaleX,
      (clientY - rect.top)   * scaleY,
    ];
  };

  const hitRadius = () => {
    const canvas = canvasRef.current;
    return canvas ? Math.max(12, canvas.width / 60) : 20;
  };

  const onMouseDown = (e) => {
    if (status !== 'done' || corners.length === 0) return;
    const [mx, my] = canvasCoords(e);
    const hr = hitRadius();
    const idx = corners.findIndex(([x, y]) =>
      Math.hypot(x - mx, y - my) < hr
    );
    if (idx !== -1) {
      e.preventDefault();
      setDraggingIdx(idx);
    }
  };

  const onMouseMove = (e) => {
    if (draggingIdx === null) return;
    e.preventDefault();
    const [mx, my] = canvasCoords(e);
    const canvas   = canvasRef.current;
    const nx = Math.max(0, Math.min(canvas.width,  mx));
    const ny = Math.max(0, Math.min(canvas.height, my));
    setCorners(prev => {
      const next = prev.map((p, i) => i === draggingIdx ? [nx, ny] : p);
      drawOverlay(next);
      return next;
    });
  };

  const onMouseUp = () => setDraggingIdx(null);

  // ── Confirm: convert pixels → meters and call callback ───────────────────
  const handleConfirm = () => {
    const ppm = Math.max(1, Number(pixelsPerMeter) || 20);
    const metersCorners = corners.map(([px, py]) => [
      Math.round((px / ppm) * 100) / 100,
      Math.round((py / ppm) * 100) / 100,
    ]);
    onCornersExtracted(metersCorners);
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStatus('idle');
    setImgSrc(null);
    setCorners([]);
    setErrorMsg('');
    setDraggingIdx(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-desert-700 flex items-center gap-1.5">
          🖼 זיהוי אוטומטי של קונטור תכנית קומה (OpenCV.js)
        </p>
        {status !== 'idle' && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[10px] text-desert-500 hover:text-desert-800 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            אפס
          </button>
        )}
      </div>

      {/* Upload zone */}
      {status === 'idle' && (
        <label
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-desert-300 rounded-xl p-6 cursor-pointer hover:border-terracotta-400 hover:bg-white transition-colors"
        >
          <Upload className="w-7 h-7 text-desert-400" />
          <span className="text-xs text-desert-600 font-semibold">
            גרור תמונה לכאן, או לחץ לבחירה
          </span>
          <span className="text-[10px] text-desert-400">PNG / JPG / WEBP</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </label>
      )}

      {/* Scale input — shown when idle or processing */}
      {(status === 'idle' || status === 'done') && (
        <div className="flex items-center gap-2 text-xs text-desert-700">
          <label htmlFor="ftc-ppm" className="whitespace-nowrap">
            קנה מידה:
          </label>
          <input
            id="ftc-ppm"
            type="number"
            min={1}
            max={500}
            value={pixelsPerMeter}
            onChange={e => setPixelsPerMeter(e.target.value)}
            className="w-20 p-1.5 border border-desert-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-terracotta-400"
          />
          <span className="text-desert-500">פיקסלים = 1 מ'</span>
        </div>
      )}

      {/* Loading / processing spinner */}
      {(status === 'loading-cv' || status === 'processing') && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-8 h-8 border-4 border-terracotta-200 border-t-terracotta-600 rounded-full animate-spin" />
          <span className="text-xs text-desert-600 font-semibold">
            {status === 'loading-cv' ? 'טוען OpenCV...' : 'מזהה קונטורים...'}
          </span>
          {/* Keep image mounted (hidden) so OpenCV can read it */}
          {imgSrc && (
            <img
              ref={imgRef}
              src={imgSrc}
              alt=""
              className="hidden"
              crossOrigin="anonymous"
            />
          )}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg || 'שגיאה לא ידועה'}</span>
        </div>
      )}

      {/* Result: image + canvas overlay */}
      {status === 'done' && imgSrc && (
        <div
          ref={containerRef}
          className="relative rounded-xl overflow-hidden border border-desert-200 bg-white select-none"
          style={{ touchAction: 'none' }}
        >
          {/* Base image */}
          <img
            ref={imgRef}
            src={imgSrc}
            alt="תכנית קומה"
            className="w-full block"
            crossOrigin="anonymous"
            onLoad={() => drawOverlay(corners)}
          />
          {/* Overlay canvas — positioned absolutely on top */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: draggingIdx !== null ? 'grabbing' : 'crosshair' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onMouseDown}
            onTouchMove={onMouseMove}
            onTouchEnd={onMouseUp}
          />
        </div>
      )}

      {/* Done state — info + actions */}
      {status === 'done' && (
        <>
          <p className="text-[10px] text-desert-500 text-center italic">
            לא מדויק? גרור את הנקודות האדומות לתיקון
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-desert-600 bg-white border border-desert-200 rounded-full px-2.5 py-1">
              {corners.length} פינות זוהו
            </span>
            <button
              id="btn-floor-plan-confirm"
              onClick={handleConfirm}
              className="flex items-center gap-2 bg-terracotta-600 hover:bg-terracotta-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-xs"
            >
              <CheckCheck className="w-4 h-4" />
              ← אשר ויבא לתכנון
            </button>
          </div>
        </>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-desert-400 italic">
        כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי
      </p>
    </div>
  );
};

export default FloorPlanAutoTracer;
