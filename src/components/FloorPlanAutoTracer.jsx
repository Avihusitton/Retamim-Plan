/**
 * FloorPlanAutoTracer.jsx — OpenCV.js contour tracer + polygon editor + scale calibration
 * Requires in index.html: <script async src="https://docs.opencv.org/4.8.0/opencv.js"></script>
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, Upload, CheckCheck, RotateCcw, Move, Plus, Trash2, Crosshair } from 'lucide-react';

// ── OpenCV readiness ──────────────────────────────────────────────────────────
const waitForCV = () => new Promise(resolve => {
  const t = setInterval(() => { if (window.cv?.Mat) { clearInterval(t); resolve(); } }, 100);
});

// ── Contour detection ─────────────────────────────────────────────────────────
const detectContours = (imgEl) => {
  const cv = window.cv;
  const src = cv.imread(imgEl), gray = new cv.Mat(), blurred = new cv.Mat();
  const edges = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 50, 150);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  if (contours.size() === 0) {
    [src,gray,blurred,edges,contours,hierarchy].forEach(m=>m.delete()); return [];
  }
  let maxA = 0, maxI = 0;
  for (let i = 0; i < contours.size(); i++) { const a = cv.contourArea(contours.get(i)); if (a > maxA) { maxA=a; maxI=i; } }
  const approx = new cv.Mat();
  cv.approxPolyDP(contours.get(maxI), approx, 0.02 * cv.arcLength(contours.get(maxI), true), true);
  const pts = [];
  for (let i = 0; i < approx.rows; i++) pts.push([approx.intAt(i,0), approx.intAt(i,1)]);
  [src,gray,blurred,edges,contours,hierarchy,approx].forEach(m=>m.delete());
  return pts;
};

// ── Geometry helpers ──────────────────────────────────────────────────────────
const ptSegDistSq = ([px,py],[ax,ay],[bx,by]) => {
  const dx=bx-ax, dy=by-ay;
  if (!dx && !dy) return (px-ax)**2+(py-ay)**2;
  const t = Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));
  return (px-ax-t*dx)**2+(py-ay-t*dy)**2;
};
const nearestEdge = (pts, p) => {
  let best=Infinity, ei=0;
  pts.forEach((_,i) => { const d=ptSegDistSq(p,pts[i],pts[(i+1)%pts.length]); if(d<best){best=d;ei=i;} });
  return ei;
};
const bboxMeters = (pts, ppm) => {
  if (!pts.length || !ppm) return null;
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  return {
    w: Math.round(((Math.max(...xs)-Math.min(...xs))/ppm)*10)/10,
    h: Math.round(((Math.max(...ys)-Math.min(...ys))/ppm)*10)/10,
  };
};

// ── Canvas draw ───────────────────────────────────────────────────────────────
const redrawCanvas = (canvas, imgEl, pts, mode, hoverIdx, selIdx, calibPts) => {
  if (!canvas || !imgEl || pts.length < 2) return;
  canvas.width = imgEl.naturalWidth; canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const lw = Math.max(2, canvas.width/300);
  const r  = Math.max(7, canvas.width/75);

  // Polygon
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  pts.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.closePath();
  ctx.fillStyle='rgba(59,130,246,0.07)'; ctx.fill();
  ctx.strokeStyle='#3b82f6'; ctx.lineWidth=lw; ctx.stroke();

  // Add-mode midpoint hints
  if (mode==='add') pts.forEach((_,i)=>{
    const j=(i+1)%pts.length, mx=(pts[i][0]+pts[j][0])/2, my=(pts[i][1]+pts[j][1])/2;
    ctx.beginPath(); ctx.arc(mx,my,r*0.4,0,2*Math.PI);
    ctx.fillStyle='rgba(16,185,129,0.6)'; ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
  });

  // Corner dots
  pts.forEach(([x,y],i)=>{
    const sel=i===selIdx, hov=i===hoverIdx;
    ctx.beginPath(); ctx.arc(x,y,r*(sel||hov?1.3:1),0,2*Math.PI);
    ctx.fillStyle = sel?'#a855f7':hov?'#f59e0b':'#ef4444';
    ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff';
    ctx.font=`bold ${Math.round(r*1.05)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(i+1,x,y);
  });

  // Calibration overlay
  if (calibPts?.length) {
    calibPts.forEach(([x,y])=>{
      ctx.beginPath(); ctx.arc(x,y,r*1.1,0,2*Math.PI);
      ctx.fillStyle='#f97316'; ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-r,y); ctx.lineTo(x+r,y);
      ctx.moveTo(x,y-r); ctx.lineTo(x,y+r);
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    });
    if (calibPts.length===2) {
      const [[x1,y1],[x2,y2]] = calibPts;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
      ctx.setLineDash([8,4]); ctx.strokeStyle='#f97316'; ctx.lineWidth=lw*1.2; ctx.stroke();
      ctx.setLineDash([]);
      const mx=(x1+x2)/2, my=(y1+y2)/2;
      const dist=Math.round(Math.hypot(x2-x1,y2-y1));
      ctx.fillStyle='rgba(249,115,22,0.9)'; ctx.strokeStyle='#fff';
      ctx.font=`bold ${Math.round(r)}px sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.lineWidth=3; ctx.strokeText(`${dist}px`,mx,my-r*1.8);
      ctx.fillText(`${dist}px`,mx,my-r*1.8);
    }
  }
};

// ── Component ─────────────────────────────────────────────────────────────────
const FloorPlanAutoTracer = ({ onCornersExtracted }) => {
  const [status,    setStatus]    = useState('idle');
  const [errorMsg,  setErrorMsg]  = useState('');
  const [imgSrc,    setImgSrc]    = useState(null);
  const [corners,   setCorners]   = useState([]);
  const [ppm,       setPpm]       = useState(20);
  const [mode,      setMode]      = useState('drag'); // drag | add | calibrate
  const [dragIdx,   setDragIdx]   = useState(null);
  const [hoverIdx,  setHoverIdx]  = useState(-1);
  const [selIdx,    setSelIdx]    = useState(-1);
  const [calibPts,  setCalibPts]  = useState([]);    // up to 2 [x,y] pixel points
  const [calibM,    setCalibM]    = useState('');    // known real distance in meters
  const [confirmed,  setConfirmed] = useState(false); // flash ✓ after import without closing

  const imgRef = useRef(null), canvasRef = useRef(null);

  const redraw = useCallback((pts, m, hi, si, cp) => {
    redrawCanvas(canvasRef.current, imgRef.current, pts, m, hi, si, cp);
  }, []);

  useEffect(() => {
    if (status==='done') redraw(corners, mode, hoverIdx, selIdx, calibPts);
  }, [corners, mode, hoverIdx, selIdx, calibPts, status, redraw]);

  // canvas pixel coords from mouse/touch event
  const cvCoords = e => {
    const c=canvasRef.current, r=c.getBoundingClientRect();
    const sx=c.width/r.width, sy=c.height/r.height;
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    return [(cx-r.left)*sx,(cy-r.top)*sy];
  };
  const hitR = () => { const c=canvasRef.current; return c?Math.max(12,c.width/55):18; };
  const hitIdx = (mx,my) => corners.findIndex(([x,y])=>Math.hypot(x-mx,y-my)<hitR());

  // ── Pointer events ──────────────────────────────────────────────────────────
  const onMouseDown = e => {
    if (status!=='done') return;
    const [mx,my] = cvCoords(e);

    if (mode==='calibrate') {
      e.preventDefault();
      setCalibPts(prev => prev.length>=2 ? [[mx,my]] : [...prev,[mx,my]]);
      return;
    }
    if (mode==='drag') {
      const idx=hitIdx(mx,my);
      if (idx!==-1) { e.preventDefault(); setSelIdx(idx); setDragIdx(idx); }
      else setSelIdx(-1);
    }
    if (mode==='add') {
      const ei=nearestEdge(corners,[mx,my]);
      const next=[...corners]; next.splice(ei+1,0,[Math.round(mx),Math.round(my)]);
      setCorners(next); setMode('drag'); setSelIdx(ei+1);
    }
  };

  const onMouseMove = e => {
    if (status!=='done') return;
    const [mx,my]=cvCoords(e);
    if (dragIdx!==null) {
      e.preventDefault();
      const c=canvasRef.current;
      const nx=Math.max(0,Math.min(c.width,mx)), ny=Math.max(0,Math.min(c.height,my));
      setCorners(prev => { const n=prev.map((p,i)=>i===dragIdx?[nx,ny]:p); redraw(n,mode,dragIdx,selIdx,calibPts); return n; });
      return;
    }
    const hi=hitIdx(mx,my); if(hi!==hoverIdx) setHoverIdx(hi);
  };

  const onMouseUp = () => setDragIdx(null);
  const onCtxMenu = e => {
    if (status!=='done') return; e.preventDefault();
    const [mx,my]=cvCoords(e); const idx=hitIdx(mx,my); if(idx!==-1) delPt(idx);
  };

  // ── Point ops ───────────────────────────────────────────────────────────────
  const delPt = idx => {
    if (corners.length<=3) return;
    setCorners(p=>p.filter((_,i)=>i!==idx)); if(selIdx===idx) setSelIdx(-1);
  };
  const updPt = (idx,axis,val) => {
    const v=parseInt(val,10); if(isNaN(v)) return;
    setCorners(p=>p.map((pt,i)=>i===idx?(axis===0?[v,pt[1]]:[pt[0],v]):pt));
  };

  // ── Calibration ──────────────────────────────────────────────────────────────
  const applyCalib = () => {
    if (calibPts.length!==2 || !calibM) return;
    const [[x1,y1],[x2,y2]] = calibPts;
    const distPx = Math.hypot(x2-x1,y2-y1);
    const distM  = parseFloat(calibM);
    if (!distM || distM<=0) return;
    setPpm(Math.round((distPx/distM)*10)/10);
    setCalibPts([]); setCalibM(''); setMode('drag');
  };

  // ── File upload ──────────────────────────────────────────────────────────────
  const handleFile = async file => {
    if (!file?.type.startsWith('image/')) { setErrorMsg('יש להעלות תמונה (PNG/JPG)'); setStatus('error'); return; }
    setErrorMsg(''); setStatus('loading-cv'); setCorners([]); setImgSrc(null);
    const reader=new FileReader();
    reader.onload = async e => {
      setImgSrc(e.target.result);
      try {
        await waitForCV(); setStatus('processing');
        await new Promise(r=>setTimeout(r,80));
        const img=imgRef.current; if(!img) throw new Error('תמונה לא נטענה');
        const pts=detectContours(img);
        if (pts.length<3) { setErrorMsg('לא נמצא קונטור. נסה תמונה עם גבולות ברורים.'); setStatus('error'); return; }
        setCorners(pts); setStatus('done');
      } catch(err) { setErrorMsg(`שגיאה: ${err.message}`); setStatus('error'); }
    };
    reader.readAsDataURL(file);
  };

  const onDrop = e => { e.preventDefault(); handleFile(e.dataTransfer?.files?.[0]); };

  const handleReset = () => {
    setStatus('idle'); setImgSrc(null); setCorners([]); setErrorMsg('');
    setDragIdx(null); setHoverIdx(-1); setSelIdx(-1); setMode('drag');
    setCalibPts([]); setCalibM('');
  };

  const handleConfirm = () => {
    const h=imgRef.current?.naturalHeight??0;
    onCornersExtracted(corners.map(([px,py])=>[
      Math.round((px/ppm)*100)/100,
      Math.round(((h-py)/ppm)*100)/100,
    ]));
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2500);
  };

  const cursor = () => {
    if (mode==='calibrate') return 'crosshair';
    if (mode==='add') return 'cell';
    if (dragIdx!==null) return 'grabbing';
    if (hoverIdx!==-1) return 'grab';
    return 'default';
  };

  const bbox = bboxMeters(corners, ppm);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="bg-desert-50 border border-desert-200 rounded-xl p-4 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-desert-700">📐 זיהוי קונטור מתכנית קומה (OpenCV.js)</p>
        {status!=='idle' && (
          <button onClick={handleReset} className="flex items-center gap-1 text-[10px] text-desert-500 hover:text-red-600 transition-colors">
            <RotateCcw className="w-3 h-3"/> אפס
          </button>
        )}
      </div>

      {/* Upload zone */}
      {status==='idle' && (
        <label onDrop={onDrop} onDragOver={e=>e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-desert-300 rounded-xl p-6 cursor-pointer hover:border-terracotta-400 hover:bg-white transition-colors">
          <Upload className="w-7 h-7 text-desert-400"/>
          <span className="text-xs text-desert-600 font-semibold">גרור סכמה לכאן או לחץ להעלאה</span>
          <span className="text-[10px] text-desert-400">PNG / JPG</span>
          <input type="file" accept="image/*" className="hidden" onChange={e=>handleFile(e.target.files?.[0])}/>
        </label>
      )}

      {/* Spinner */}
      {(status==='loading-cv'||status==='processing') && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-8 h-8 border-4 border-terracotta-200 border-t-terracotta-600 rounded-full animate-spin"/>
          <span className="text-xs text-desert-600 font-semibold">
            {status==='loading-cv'?'🔍 טוען OpenCV...':'🔍 מזהה קונטורים...'}
          </span>
          {imgSrc && <img ref={imgRef} src={imgSrc} alt="" className="hidden" crossOrigin="anonymous"/>}
        </div>
      )}

      {/* Error */}
      {status==='error' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0"/><span>{errorMsg}</span>
        </div>
      )}

      {/* ── Done state ── */}
      {status==='done' && (<>

        {/* Scale bar — PPM + live dimensions */}
        <div className="flex items-center gap-3 flex-wrap bg-white border border-desert-200 rounded-lg px-3 py-2">
          <span className="text-[11px] text-desert-600 font-medium whitespace-nowrap">קנה מידה:</span>
          <input type="number" min={0.1} max={9999} step={0.1} value={ppm}
            onChange={e=>setPpm(parseFloat(e.target.value)||20)}
            className="w-20 p-1 border border-desert-300 rounded text-xs font-mono text-center bg-desert-50 focus:ring-2 focus:ring-orange-400 focus:outline-none"/>
          <span className="text-[11px] text-desert-500">px/מ'</span>
          <button onClick={()=>{ setMode(m=>m==='calibrate'?'drag':'calibrate'); setCalibPts([]); }}
            title="כייל לפי מרחק ידוע"
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors
              ${mode==='calibrate'
                ?'bg-orange-500 text-white border-orange-500 shadow-sm'
                :'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'}`}>
            <Crosshair className="w-3.5 h-3.5"/> כייל
          </button>
          {bbox && (
            <span className="mr-auto text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
              {bbox.w} × {bbox.h} מ'
            </span>
          )}
        </div>

        {/* Calibration panel */}
        {mode==='calibrate' && (
          <div className="flex items-center gap-2 flex-wrap bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs">
            <Crosshair className="w-4 h-4 text-orange-600 flex-shrink-0"/>
            <span className="text-orange-700 font-semibold">
              {calibPts.length===0 && 'לחץ על נקודה ראשונה על הסכמה'}
              {calibPts.length===1 && 'לחץ על נקודה שנייה'}
              {calibPts.length===2 && 'הזן את המרחק האמיתי:'}
            </span>
            {calibPts.length===2 && (<>
              <input type="number" min={0.1} step={0.1} value={calibM}
                onChange={e=>setCalibM(e.target.value)}
                placeholder="מ'"
                className="w-20 p-1 border border-orange-300 rounded font-mono text-center bg-white focus:ring-2 focus:ring-orange-400 focus:outline-none"/>
              <span className="text-orange-600">מ'</span>
              <button onClick={applyCalib}
                disabled={!calibM}
                className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold px-3 py-1 rounded-lg transition-colors">
                <CheckCheck className="w-3.5 h-3.5"/> אשר כיול
              </button>
              <button onClick={()=>setCalibPts([])} className="text-orange-500 hover:text-orange-700 underline">אפס נקודות</button>
            </>)}
          </div>
        )}

        {/* Edit mode toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-desert-500 font-semibold uppercase tracking-wide">עריכה:</span>
          {[
            {id:'drag', icon:<Move className="w-3.5 h-3.5"/>, label:'גרור', color:'blue'},
            {id:'add',  icon:<Plus className="w-3.5 h-3.5"/>, label:'הוסף נקודה', color:'emerald'},
          ].map(({id,icon,label,color})=>(
            <button key={id} onClick={()=>setMode(id)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors
                ${mode===id
                  ?`bg-${color}-600 text-white border-${color}-600 shadow-sm`
                  :`bg-white text-desert-600 border-desert-300 hover:border-${color}-400 hover:text-${color}-600`}`}>
              {icon}{label}
            </button>
          ))}
          {mode==='add' && <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">לחץ על הקנבס</span>}
          <span className="mr-auto text-[10px] text-desert-400">{corners.length} נקודות · לחצן ימני = מחיקה</span>
        </div>

        {/* Canvas + sidebar */}
        <div className="flex gap-3 items-start">
          {/* Canvas */}
          <div className="relative rounded-xl overflow-hidden border border-desert-200 bg-white select-none flex-1" style={{touchAction:'none'}}>
            <img ref={imgRef} src={imgSrc} alt="תכנית קומה" className="w-full block"
              crossOrigin="anonymous" onLoad={()=>redraw(corners,mode,hoverIdx,selIdx,calibPts)}/>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
              style={{cursor:cursor()}}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              onMouseLeave={()=>{setDragIdx(null);setHoverIdx(-1);}}
              onContextMenu={onCtxMenu}
              onTouchStart={onMouseDown} onTouchMove={onMouseMove} onTouchEnd={onMouseUp}/>
          </div>

          {/* Sidebar */}
          <div className="w-44 flex-shrink-0 flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            <p className="text-[10px] font-semibold text-desert-600 uppercase tracking-wide sticky top-0 bg-desert-50 pb-1">נקודות (px)</p>
            {corners.map(([x,y],i)=>(
              <div key={i} onClick={()=>setSelIdx(i===selIdx?-1:i)}
                className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 cursor-pointer text-[10px] transition-colors
                  ${selIdx===i?'border-purple-400 bg-purple-50':'border-desert-200 bg-white hover:border-blue-300'}`}>
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold flex-shrink-0">{i+1}</span>
                <input type="number" value={Math.round(x)} onClick={e=>e.stopPropagation()}
                  onChange={e=>updPt(i,0,e.target.value)}
                  className="w-14 p-0.5 border border-desert-200 rounded text-[10px] font-mono text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                <span className="text-desert-400">,</span>
                <input type="number" value={Math.round(y)} onClick={e=>e.stopPropagation()}
                  onChange={e=>updPt(i,1,e.target.value)}
                  className="w-14 p-0.5 border border-desert-200 rounded text-[10px] font-mono text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                <button onClick={e=>{e.stopPropagation();delPt(i);}} disabled={corners.length<=3}
                  className="mr-auto text-desert-400 hover:text-red-500 disabled:opacity-30 flex-shrink-0">
                  <Trash2 className="w-3 h-3"/>
                </button>
              </div>
            ))}
            <button onClick={()=>setMode('add')}
              className="flex items-center justify-center gap-1 border border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 rounded-lg py-1 text-[10px] font-semibold transition-colors">
              <Plus className="w-3 h-3"/> הוסף נקודה
            </button>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <p className="text-[10px] text-desert-500 italic">גרור נקודות · לחצן ימני = מחיקה · כייל לפי מרחק ידוע</p>
          <button id="btn-floor-plan-confirm" onClick={handleConfirm}
            className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-lg transition-colors text-xs shadow-sm
              ${confirmed
                ? 'bg-blue-600 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'}`}>
            <CheckCheck className="w-4 h-4"/>
            {confirmed ? '✓ יובא לשדה הבסיס' : '← אשר ויבא'}
          </button>
        </div>
      </>)}

      <p className="text-[10px] text-desert-400 italic text-center">כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי</p>
    </div>
  );
};

export default FloorPlanAutoTracer;
