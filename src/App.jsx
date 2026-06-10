import { useState, useEffect } from 'react';
import { 
  Sun, Wind, Home, Settings, Map, BookOpen, Key, Copy, Check, 
  Bot, Compass, Globe, Sliders, AlertCircle, FileText, RotateCw 
} from 'lucide-react';
import useStore from './store/useStore';
import { systemPrompt, analyzeNeeds } from './services/aiService';
import { parseAiText } from './utils/aiParser';
import { getHebrewMonthName, getDayOfYearForMonth } from './utils/solarCalculator';
import Visualization2D from './components/Visualization2D';
import { printWithCloneNode } from './utils/printUtils';

const locationPresets = [
  { name: 'רתמים', lat: 31.0543, lng: 34.6974 },
  { name: 'באר שבע', lat: 31.2529, lng: 34.7971 },
  { name: 'מצפה רמון', lat: 30.6080, lng: 34.8030 },
  { name: 'ערד', lat: 31.2612, lng: 35.2148 },
  { name: 'אילת', lat: 29.5577, lng: 34.9519 },
  { name: 'תל אביב', lat: 32.0853, lng: 34.7818 },
];

const App = () => {
  const {
    apiKey, setApiKey,
    userNeeds, setUserNeeds,
    aiMode, setAiMode,
    aiResponse, setAiResponse,
    analysisResult, setAnalysisResult,
    isLoading, setIsLoading,
    latitude, longitude, locationName, setCoordinates,
    houseRotation, setHouseRotation,
    windDirection, setWindDirection,
    windSpeed, setWindSpeed,
    hour, setHour,
    dayOfYear, setDayOfYear,
    showWind, setShowWind,
    buildingHeight, setBuildingHeight,
    houseCorners, setHouseCorners
  } = useStore();

  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('רתמים');
  
  // Track selected month (1-12) locally to map to day of the year
  const [selectedMonth, setSelectedMonth] = useState(6); // June default
  
  // Custom coordinates input states
  const [customLat, setCustomLat] = useState(latitude.toString());
  const [customLng, setCustomLng] = useState(longitude.toString());

  // Local state for corners text field
  const [cornersInputVal, setCornersInputVal] = useState('');

  // Helper to parse corners from text input
  const parseCornersText = (text) => {
    const numbers = text.match(/-?\d+(\.\d+)?/g);
    if (!numbers || numbers.length < 6 || numbers.length % 2 !== 0) {
      return null;
    }
    const corners = [];
    for (let i = 0; i < numbers.length; i += 2) {
      corners.push([parseFloat(numbers[i]), parseFloat(numbers[i+1])]);
    }
    return corners;
  };

  useEffect(() => {
    if (houseCorners && houseCorners.length > 0) {
      const formatted = houseCorners.map(([x, y]) => `(${x}, ${y})`).join(', ');
      setCornersInputVal(formatted);
    }
  }, [houseCorners]);

  const handleCornersInputChange = (e) => {
    const val = e.target.value;
    setCornersInputVal(val);
    const parsed = parseCornersText(val);
    if (parsed && parsed.length >= 3) {
      setHouseCorners(parsed);
    }
  };

  // Update store when month changes
  useEffect(() => {
    const day = getDayOfYearForMonth(selectedMonth);
    setDayOfYear(day);
  }, [selectedMonth, setDayOfYear]);

  // Sync preset selection with coordinate store
  const handlePresetChange = (presetName) => {
    setSelectedPreset(presetName);
    if (presetName === 'custom') return;
    
    const preset = locationPresets.find(p => p.name === presetName);
    if (preset) {
      setCoordinates(preset.lat, preset.lng, preset.name);
      setCustomLat(preset.lat.toString());
      setCustomLng(preset.lng.toString());
    }
  };

  const handleCustomCoordsSubmit = () => {
    const latVal = parseFloat(customLat);
    const lngVal = parseFloat(customLng);
    if (isNaN(latVal) || latVal < -90 || latVal > 90) {
      setErrorMsg('קו רוחב לא תקין. ערך תקין בין 90- ל-90');
      return;
    }
    if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      setErrorMsg('קו אורך לא תקין. ערך תקין בין 180- ל-180');
      return;
    }
    setErrorMsg('');
    setSelectedPreset('custom');
    setCoordinates(latVal, lngVal, 'מיקום מותאם אישית');
  };

  const generatedPrompt = `הוראות מערכת (System Prompt):
${systemPrompt}

דרישות המשתמש:
${userNeeds}`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Handle parsing the plain-text AI description pasted by the user
  const handleApplyAiText = () => {
    if (!aiResponse.trim()) {
      setErrorMsg('אנא הדבק את תיאור התכנון מה-AI תחילה.');
      return;
    }
    
    setErrorMsg('');
    const parsed = parseAiText(aiResponse);
    
    if (parsed) {
      // Update store states
      setHouseRotation(parsed.houseRotationDegree);
      setWindDirection(parsed.windDirection);
      if (parsed.corners && parsed.corners.length >= 3) {
        setHouseCorners(parsed.corners);
      }
      
      // Update analysis result structure to render in recommendations card
      setAnalysisResult({
        recommendations: parsed.recommendations,
        layout: {
          orientation: parsed.orientation,
          houseRotationDegree: parsed.houseRotationDegree,
          corners: parsed.corners,
          sunPath: {
            summer: 'שמש גבוהה ומחממת',
            winter: 'שמש נמוכה וחודרת'
          },
          windProtection: {
            direction: parsed.windDirection,
            strategy: parsed.windStrategy
          }
        }
      });
    } else {
      setErrorMsg('לא הצלחנו לפענח את הטקסט. ודא שהעתקת את תיאור התכנון המלא.');
    }
  };

  const handleApiSubmit = async () => {
    if (!apiKey) {
      setErrorMsg('אנא הזן מפתח API');
      return;
    }
    if (!userNeeds) {
      setErrorMsg('אנא הזן את דרישותיך מהבית');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const result = await analyzeNeeds(apiKey, userNeeds);
      setAnalysisResult(result);
      
      // Sync manual sliders with AI results
      if (result.layout) {
        if (result.layout.houseRotationDegree !== undefined) {
          setHouseRotation(result.layout.houseRotationDegree);
        }
        if (result.layout.windProtection?.direction) {
          setWindDirection(result.layout.windProtection.direction.toLowerCase());
        }
        if (result.layout.corners && Array.isArray(result.layout.corners) && result.layout.corners.length >= 3) {
          setHouseCorners(result.layout.corners);
        }
      }
    } catch (e) {
      setErrorMsg('שגיאה בתקשורת עם ה-AI: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-desert-100 text-desert-900 font-sans antialiased" dir="rtl">
      
      {/* Header */}
      <header className="bg-desert-800 text-desert-100 shadow-md p-4 print-only:hidden no-print">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-terracotta-600 p-2 rounded-lg text-white">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">אדריכלות מדבר חכמה</h1>
              <p className="text-xs text-desert-300">סימולטור העמדת בית, שמש ורוחות - רתמים והנגב</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <span className="bg-desert-700 py-1 px-3 rounded-full text-desert-200 border border-desert-600 flex items-center gap-1">
              <Globe className="w-4 h-4 text-terracotta-400" />
              <span>{locationName}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Sidebar Controls (4 columns wide) */}
        <div className="lg:col-span-5 flex flex-col gap-6 no-print">

          {/* Location and Coordinates Card */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-desert-200">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-desert-800 border-b border-desert-100 pb-2">
              <Globe className="w-5 h-5 text-terracotta-600" />
              הגדרת מיקום וקורדינטות
            </h2>
            
            <div className="space-y-4">
              {/* Preset Selector */}
              <div>
                <label className="block text-sm font-medium text-desert-700 mb-1">בחר יישוב / מיקום מהיר:</label>
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full p-2 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 focus:border-terracotta-400 bg-desert-50 text-sm"
                >
                  {locationPresets.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                  <option value="custom">קורדינטות מותאמות אישית...</option>
                </select>
              </div>

              {/* Coordinates input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-desert-600 mb-0.5">קו רוחב (Latitude):</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLat}
                    onChange={(e) => {
                      setCustomLat(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="w-full p-2 border border-desert-300 rounded-lg focus:ring-1 focus:ring-terracotta-400 text-sm font-mono bg-desert-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-desert-600 mb-0.5">קו אורך (Longitude):</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={customLng}
                    onChange={(e) => {
                      setCustomLng(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="w-full p-2 border border-desert-300 rounded-lg focus:ring-1 focus:ring-terracotta-400 text-sm font-mono bg-desert-50"
                  />
                </div>
              </div>

              {/* Apply Coordinates Button */}
              {selectedPreset === 'custom' && (
                <button
                  onClick={handleCustomCoordsSubmit}
                  className="w-full bg-desert-800 hover:bg-desert-950 text-white font-medium py-1.5 px-3 rounded-lg text-sm transition-colors"
                >
                  החל קורדינטות מותאמות
                </button>
              )}
            </div>
          </section>

          {/* AI Plan Input / Integration Card */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-desert-200">
            <div className="flex justify-between items-center mb-3 border-b border-desert-100 pb-2">
              <h2 className="text-lg font-bold flex items-center gap-2 text-desert-800">
                <FileText className="w-5 h-5 text-terracotta-600" />
                תיאור ותכנון אדריכלי מ-AI
              </h2>
              <div className="flex bg-desert-100 p-0.5 rounded-lg text-xs">
                <button
                  className={`px-2.5 py-1 rounded-md transition-colors ${aiMode === 'manual' ? 'bg-white shadow-sm text-terracotta-700 font-bold' : 'text-desert-600'}`}
                  onClick={() => setAiMode('manual')}
                >
                  הדבקת טקסט (חינם)
                </button>
                <button
                  className={`px-2.5 py-1 rounded-md transition-colors ${aiMode === 'api' ? 'bg-white shadow-sm text-terracotta-700 font-bold' : 'text-desert-600'}`}
                  onClick={() => setAiMode('api')}
                >
                  חיבור API
                </button>
              </div>
            </div>

            {aiMode === 'api' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-desert-700 mb-1">מפתח OpenAI API (sk-...):</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full p-2 text-sm border border-desert-300 rounded-lg focus:ring-1 focus:ring-terracotta-400 bg-desert-50 font-mono"
                    placeholder="הזן מפתח API מ-OpenAI"
                  />
                </div>
                <div>
                  <label className="block text-xs text-desert-700 mb-1">חלומות/דרישות מהבית המדברי שלך:</label>
                  <textarea
                    value={userNeeds}
                    onChange={(e) => setUserNeeds(e.target.value)}
                    placeholder="לדוגמה: בית בגודל 150 מ&quot;ר ברתמים, עם פטיו פנימי לקירור פסיבי, חלונות גדולים הפונים לשמש החורף אך מוצלים בקיץ..."
                    className="w-full h-20 p-2.5 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 bg-desert-50 text-sm resize-none"
                  />
                </div>
                <button
                  onClick={handleApiSubmit}
                  disabled={isLoading}
                  className="w-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {isLoading ? 'מנתח דרישות באמצעות AI...' : 'שגר ניתוח אדריכלי אוטומטי'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-desert-600 leading-relaxed">
                  העתק את ההוראות מטה לכל מנוע AI (כמו ChatGPT או Claude) והדבק את התשובה (טקסט חופשי או JSON) בתיבה לקבלת סימולציה והעמדה מיידית.
                </p>
                
                {/* User Input Prompt Builder */}
                <div>
                  <label className="block text-xs font-bold text-desert-700 mb-1">1. הגדר צרכים וחלום (אופציונלי):</label>
                  <textarea
                    value={userNeeds}
                    onChange={(e) => setUserNeeds(e.target.value)}
                    placeholder="לדוגמה: בית מדברי מואר ברתמים עם הגנה מסופות חול צפון-מערביות..."
                    className="w-full h-14 p-2 border border-desert-300 rounded-lg focus:ring-1 focus:ring-terracotta-400 bg-desert-50 text-xs resize-none"
                  />
                </div>

                <div className="relative">
                  <div className="bg-desert-50 text-desert-800 p-2 border border-desert-200 rounded-lg text-[10px] h-16 overflow-y-auto font-mono scrollbar-thin" dir="ltr">
                    {generatedPrompt}
                  </div>
                  <button
                    onClick={handleCopyPrompt}
                    className="absolute top-2 right-2 bg-white/95 p-1 rounded border border-desert-200 shadow-xs hover:bg-desert-100 text-desert-700 transition-colors"
                    title="העתק פרומפט"
                  >
                    {copySuccess ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-desert-700 mb-1">2. הדבק את תיאור התכנון מה-AI:</label>
                  <textarea
                    className="w-full h-24 p-2.5 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 bg-desert-50 text-xs font-mono"
                    placeholder="הדבק כאן את תוצאת ה-AI (פסקה חופשית שמתארת העמדה, כיווני רוח והמלצות, או אובייקט JSON)..."
                    value={aiResponse}
                    onChange={(e) => setAiResponse(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleApplyAiText}
                  className="w-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  החל ונתח תכנון AI
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </section>

          {/* Manual Simulation Overrides & Fine-tuning */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-desert-200">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-desert-800 border-b border-desert-100 pb-2">
              <Sliders className="w-5 h-5 text-terracotta-600" />
              בקרת סימולציה וכיוונון ידני
            </h2>

            <div className="space-y-4">
              {/* House Rotation Slider */}
              <div>
                <div className="flex justify-between text-xs font-medium text-desert-700 mb-1">
                  <span>זווית העמדת הבית (סיבוב):</span>
                  <span className="font-mono text-terracotta-600 font-bold">{houseRotation}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={houseRotation}
                  onChange={(e) => setHouseRotation(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                />
                <div className="flex justify-between text-[10px] text-desert-500 px-1 mt-0.5">
                  <span>0° (צפון)</span>
                  <span>90° (מזרח)</span>
                  <span>180° (דרום)</span>
                  <span>270° (מערב)</span>
                  <span>360°</span>
                </div>
              </div>

              {/* Month Selector */}
              <div>
                <div className="flex justify-between text-xs font-medium text-desert-700 mb-1">
                  <span>חודש בשנה (עונות):</span>
                  <span className="text-terracotta-600 font-bold">חודש {selectedMonth} - {getHebrewMonthName(selectedMonth)}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                />
                <div className="flex justify-between text-[10px] text-desert-500 px-1 mt-0.5">
                  <span>ינואר (חורף)</span>
                  <span>אפריל (אביב)</span>
                  <span>יולי (קיץ)</span>
                  <span>אוקטובר (סתיו)</span>
                </div>
              </div>

              {/* Hour of Day Slider */}
              <div>
                <div className="flex justify-between text-xs font-medium text-desert-700 mb-1">
                  <span>שעה ביום (00:00 - 24:00):</span>
                  <span className="font-mono text-terracotta-600 font-bold">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                />
                <div className="flex justify-between text-[10px] text-desert-500 px-1 mt-0.5">
                  <span>חצות</span>
                  <span>06:00 (זריחה)</span>
                  <span>12:00 (צהריים)</span>
                  <span>18:00 (שקיעה)</span>
                  <span>חצות</span>
                </div>
              </div>

              {/* Wind Direction Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-desert-700 mb-1">כיוון רוח נושבת:</label>
                  <select
                    value={windDirection}
                    onChange={(e) => setWindDirection(e.target.value)}
                    className="w-full p-2 border border-desert-300 rounded-lg focus:ring-1 focus:ring-terracotta-400 bg-desert-50 text-xs"
                  >
                    <option value="nw">צפון-מערבית (NW)</option>
                    <option value="w">מערבית (W)</option>
                    <option value="sw">דרום-מערבית (SW)</option>
                    <option value="s">דרומית (S)</option>
                    <option value="se">דרום-מזרחית (SE)</option>
                    <option value="e">מזרחית (E)</option>
                    <option value="ne">צפון-מזרחית (NE)</option>
                    <option value="n">צפונית (N)</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-medium text-desert-700 mb-1">
                    <span>עוצמת רוח:</span>
                    <span className="font-mono text-terracotta-600 font-bold">{windSpeed} קשר</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                  />
                </div>
              </div>

              {/* Building Height Selector */}
              <div>
                <div className="flex justify-between text-xs font-medium text-desert-700 mb-1">
                  <span>גובה המבנה (קנה מידה של צל):</span>
                  <span className="font-mono text-terracotta-600 font-bold">{buildingHeight} מ' ({(buildingHeight / 2.8).toFixed(0)} קומות)</span>
                </div>
                <input
                  type="range"
                  min="2.8"
                  max="11.2"
                  step="2.8"
                  value={buildingHeight}
                  onChange={(e) => setBuildingHeight(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-desert-200 rounded-lg appearance-none cursor-pointer accent-terracotta-600"
                />
                <div className="flex justify-between text-[10px] text-desert-500 px-1 mt-0.5">
                  <span>2.8 מ' (קומה 1)</span>
                  <span>5.6 מ' (2 קומות)</span>
                  <span>8.4 מ' (3 קומות)</span>
                  <span>11.2 מ' (4 קומות)</span>
                </div>
              </div>

              {/* House Corners Text Editor */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-desert-700 flex justify-between items-center">
                  <span>פינות המבנה במטרים (נ"צ יחסיות):</span>
                  <button 
                    type="button"
                    onClick={() => setHouseCorners([[0, 0], [12, 0], [12, 9], [0, 9]])}
                    className="text-[10px] text-terracotta-600 hover:text-terracotta-800 font-bold underline cursor-pointer"
                  >
                    אפס למלבן ברירת מחדל
                  </button>
                </label>
                <input
                  type="text"
                  value={cornersInputVal}
                  onChange={handleCornersInputChange}
                  placeholder="לדוגמה: (0,0), (12,0), (12,9), (0,9)"
                  className="w-full p-2 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 focus:border-terracotta-400 bg-desert-50 text-xs font-mono text-desert-800"
                />
                <p className="text-[10px] text-desert-500 leading-tight">
                  הזן רשימת נקודות (x,y) במטרים. ניתן להזין צורות מורכבות (כגון L, חצר פנימית וכדומה).
                </p>
              </div>

              {/* Show Wind Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="showWindCheck"
                  checked={showWind}
                  onChange={(e) => setShowWind(e.target.checked)}
                  className="rounded text-terracotta-600 focus:ring-terracotta-500 h-4 w-4 border-desert-300"
                />
                <label htmlFor="showWindCheck" className="text-xs font-medium text-desert-700 cursor-pointer select-none">
                  הצג זרמי רוח בהדמיה
                </label>
              </div>

            </div>
          </section>

        </div>

        {/* Main Simulation Panel & Recommendations (7 columns wide) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* SVG Simulation */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-desert-200 flex flex-col">
            <div className="flex justify-between items-center mb-4 no-print">
              <h2 className="text-lg font-bold flex items-center gap-2 text-desert-800">
                <Compass className="w-5 h-5 text-terracotta-600" />
                הדמיית העמדה, רוח והצללה (2D)
              </h2>
              <button
                onClick={printWithCloneNode}
                className="text-xs bg-desert-800 hover:bg-desert-950 text-white font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <span>ייצא ל-PDF / הדפס</span>
              </button>
            </div>

            {/* Print Header */}
            <div className="print-only mb-6 pb-4 border-b border-desert-300 text-center">
              <h1 className="text-2xl font-bold text-desert-900">דו&quot;ח העמדה ואדריכלות מדבר חכמה</h1>
              <p className="text-xs text-desert-600 mt-1">
                הופק עבור מיקום: {locationName} ({latitude.toFixed(4)}°, {longitude.toFixed(4)}°) | זווית העמדה: {houseRotation}°
              </p>
            </div>

            <Visualization2D />
          </section>

          {/* Recommendations and Analysis Output Panel */}
          <section className="bg-white p-5 rounded-xl shadow-sm border border-desert-200">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-desert-800 border-b border-desert-100 pb-2">
              <BookOpen className="w-5 h-5 text-terracotta-600" />
              ניתוח והמלצות לתכנון מדברי חכם
            </h2>

            {!analysisResult ? (
              <div className="bg-desert-50 rounded-lg p-5 border border-desert-200 text-center">
                <p className="text-sm text-desert-600 italic">
                  הדבק תיאור תכנון מה-AI בתיבת הטקסט או בצע ניתוח אוטומטי כדי לראות את ההמלצות האדריכליות המפורטות.
                </p>
                <div className="mt-4 flex gap-4 justify-center text-xs text-desert-500">
                  <span>✓ ניתוח כיווני פתחים</span>
                  <span>✓ הגנות מרוח וסופות חול</span>
                  <span>✓ ניצול הפרשי טמפרטורות</span>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* recommendations list */}
                <div>
                  <h3 className="text-sm font-bold text-terracotta-700 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-terracotta-600 rounded-sm"></span>
                    המלצות תכנון מרכזיות:
                  </h3>
                  <ul className="space-y-2">
                    {analysisResult.recommendations?.map((rec, idx) => (
                      <li key={idx} className="text-sm text-desert-800 bg-desert-50 p-2.5 rounded-lg border border-desert-100 leading-relaxed">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* technical specs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-desert-50 p-4 rounded-xl border border-desert-200 text-xs text-desert-800">
                  <div>
                    <h4 className="font-bold text-desert-900 border-b border-desert-200 pb-1 mb-2">פרטי העמדה נוכחיים:</h4>
                    <ul className="space-y-1.5">
                      <li>
                        <span className="font-medium text-desert-600">כיוון העמדה:</span> {analysisResult.layout?.orientation || 'מזרח-מערב'}
                      </li>
                      <li>
                        <span className="font-medium text-desert-600">זווית סיבוב:</span> {houseRotation}°
                      </li>
                      <li>
                        <span className="font-medium text-desert-600">מסלול שמש קיץ:</span> {analysisResult.layout?.sunPath?.summer || 'שמש גבוהה מעל המבנה'}
                      </li>
                      <li>
                        <span className="font-medium text-desert-600">מסלול שמש חורף:</span> {analysisResult.layout?.sunPath?.winter || 'שמש נמוכה חודרת פתחים דרומיים'}
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-desert-900 border-b border-desert-200 pb-1 mb-2">תנאי רוח והגנות:</h4>
                    <ul className="space-y-1.5">
                      <li>
                        <span className="font-medium text-desert-600">כיוון רוח נושבת:</span> {windDirection.toUpperCase()}
                      </li>
                      <li>
                        <span className="font-medium text-desert-600">אסטרטגיית הגנה:</span> {analysisResult.layout?.windProtection?.strategy || 'נטיעת עצים וקירות חוסמי חול'}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>

      </main>
    </div>
  );
};

export default App;
