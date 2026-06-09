import { useState } from 'react';
import { Sun, Wind, Home, Settings, Map, BookOpen, Key, Copy, Check, Bot } from 'lucide-react';
import useStore from './store/useStore';
import { systemPrompt, analyzeNeeds } from './services/aiService';
import Visualization2D from './components/Visualization2D';
import { printWithCloneNode } from './utils/printUtils';

const App = () => {
  const {
    apiKey, setApiKey,
    userNeeds, setUserNeeds,
    aiMode, setAiMode,
    aiResponse, setAiResponse,
    analysisResult, setAnalysisResult,
    isLoading, setIsLoading,
    season, setSeason,
    timeOfDay, setTimeOfDay,
    showWind, setShowWind
  } = useStore();

  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const generatedPrompt = `הוראות מערכת (System Prompt):
${systemPrompt}

דרישות המשתמש:
${userNeeds}`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleManualSubmit = () => {
    try {
      setErrorMsg('');
      const parsed = JSON.parse(aiResponse);
      setAnalysisResult(parsed);
    } catch {
      setErrorMsg('התשובה שהודבקה אינה בפורמט JSON תקין. ודא שהעתקת את התשובה המלאה מה-AI.');
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
    } catch (e) {
      setErrorMsg('שגיאה בתקשורת עם ה-AI: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-desert-100 text-desert-900 font-sans">
      <header className="bg-desert-800 text-desert-100 shadow-md p-4 print-only:hidden no-print">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Home className="w-8 h-8 text-terracotta-400" />
            <h1 className="text-2xl font-bold">אדריכלות מדבר חכמה</h1>
          </div>
          <nav className="hidden md:flex gap-6">
            <button className="flex items-center gap-2 hover:text-terracotta-300 transition-colors">
              <BookOpen className="w-5 h-5" />
              <span>הגדרת צרכים</span>
            </button>
            <button className="flex items-center gap-2 hover:text-terracotta-300 transition-colors">
              <Map className="w-5 h-5" />
              <span>הדמיית העמדה</span>
            </button>
            <button className="flex items-center gap-2 hover:text-terracotta-300 transition-colors">
              <Settings className="w-5 h-5" />
              <span>הגדרות AI</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Sidebar / Inputs */}
        <div className="lg:col-span-4 flex flex-col gap-6 no-print">

          <section className="bg-white p-6 rounded-xl shadow-sm border border-desert-200">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-desert-800">
              <span className="w-8 h-8 rounded-full bg-desert-200 flex items-center justify-center text-desert-700">1</span>
              מהם הצרכים שלך?
            </h2>

            {/* Mode Switcher */}
            <div className="flex bg-desert-100 p-1 rounded-lg mb-4">
              <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${aiMode === 'manual' ? 'bg-white shadow-sm text-terracotta-600' : 'text-desert-600 hover:text-desert-800'}`}
                onClick={() => setAiMode('manual')}
              >
                <Bot className="w-4 h-4" />
                מצב ידני (חינם)
              </button>
              <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${aiMode === 'api' ? 'bg-white shadow-sm text-terracotta-600' : 'text-desert-600 hover:text-desert-800'}`}
                onClick={() => setAiMode('api')}
              >
                <Key className="w-4 h-4" />
                מצב אוטומטי (API)
              </button>
            </div>

            {aiMode === 'api' && (
               <div className="mb-4">
                 <label className="block text-sm text-desert-700 mb-1">מפתח OpenAI API:</label>
                 <input
                   type="password"
                   value={apiKey}
                   onChange={(e) => setApiKey(e.target.value)}
                   className="w-full p-2 text-sm border border-desert-300 rounded focus:ring-1 focus:ring-terracotta-400 focus:border-terracotta-400 bg-desert-50"
                   placeholder="sk-..."
                 />
               </div>
            )}

            <p className="text-sm text-desert-600 mb-2">
              תאר במילים שלך איזה בית אתה חולם לבנות, באזור המדבר:
            </p>
            <textarea
              className="w-full h-24 p-3 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 focus:border-terracotta-400 bg-desert-50 resize-none text-sm"
              placeholder="לדוגמה: אני רוצה בית מואר אבל שלא יתחמם מדי בקיץ..."
              value={userNeeds}
              onChange={(e) => setUserNeeds(e.target.value)}
            ></textarea>

            {aiMode === 'manual' ? (
              <div className="mt-4 border-t border-desert-200 pt-4">
                <p className="text-sm text-desert-600 mb-2">1. העתק את הפרומפט ל-ChatGPT:</p>
                <div className="relative">
                  <div className="bg-earth-100 text-earth-800 p-3 rounded-lg text-xs h-20 overflow-y-auto mb-2 font-mono" dir="ltr">
                    {generatedPrompt}
                  </div>
                  <button
                    onClick={handleCopyPrompt}
                    className="absolute top-2 right-2 bg-white/80 p-1.5 rounded shadow-sm hover:bg-white text-desert-600"
                    title="העתק פרומפט"
                  >
                    {copySuccess ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-sm text-desert-600 mb-2 mt-4">2. הדבק את התשובה שקיבלת (JSON):</p>
                <textarea
                  className="w-full h-24 p-3 border border-desert-300 rounded-lg focus:ring-2 focus:ring-terracotta-400 focus:border-terracotta-400 bg-desert-50 resize-none text-sm font-mono"
                  placeholder='{"recommendations": [...], "layout": {...}}'
                  value={aiResponse}
                  onChange={(e) => setAiResponse(e.target.value)}
                  dir="ltr"
                ></textarea>
                <button
                  onClick={handleManualSubmit}
                  className="mt-4 w-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  הצג תוצאות
                </button>
              </div>
            ) : (
              <button
                onClick={handleApiSubmit}
                disabled={isLoading}
                className="mt-4 w-full bg-terracotta-600 hover:bg-terracotta-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'מנתח...' : 'נתח דרישות אוטומטית'}
              </button>
            )}

            {errorMsg && (
              <p className="mt-3 text-red-600 text-sm">{errorMsg}</p>
            )}
          </section>

          <section className="bg-white p-6 rounded-xl shadow-sm border border-desert-200">
             <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-desert-800">
              <span className="w-8 h-8 rounded-full bg-desert-200 flex items-center justify-center text-desert-700">2</span>
              ניתוח והמלצות אדריכל
            </h2>
            <div className="bg-desert-50 p-4 rounded-lg min-h-[200px] border border-desert-200 text-desert-700 text-sm">
              {!analysisResult ? (
                <div className="text-desert-500 italic">
                  הזן דרישות ובצע ניתוח כדי לראות את המלצות האדריכל המומחה.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-terracotta-700 mb-2 border-b border-terracotta-200 pb-1">המלצות מרכזיות:</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {analysisResult.recommendations?.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-bold text-terracotta-700 mb-2 border-b border-terracotta-200 pb-1">נתוני העמדה:</h3>
                    <ul className="space-y-1">
                      <li><span className="font-medium">כיוון:</span> {analysisResult.layout?.orientation}</li>
                      <li><span className="font-medium">זווית:</span> {analysisResult.layout?.houseRotationDegree}°</li>
                      <li><span className="font-medium">שמש קיץ:</span> {analysisResult.layout?.sunPath?.summer}</li>
                      <li><span className="font-medium">שמש חורף:</span> {analysisResult.layout?.sunPath?.winter}</li>
                      <li><span className="font-medium">רוח עיקרית:</span> {analysisResult.layout?.windProtection?.direction}</li>
                      <li><span className="font-medium">הגנה מרוח:</span> {analysisResult.layout?.windProtection?.strategy}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>

        {/* Main Visualization Area */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="bg-white p-6 rounded-xl shadow-sm border border-desert-200 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6 no-print">
               <h2 className="text-xl font-bold flex items-center gap-2 text-desert-800">
                <span className="w-8 h-8 rounded-full bg-desert-200 flex items-center justify-center text-desert-700">3</span>
                הדמיית העמדה, שמש ורוח (2D)
              </h2>
              <button
                onClick={printWithCloneNode}
                className="text-sm bg-earth-600 hover:bg-earth-700 text-white py-1.5 px-3 rounded-md transition-colors"
              >
                ייצא ל-PDF / הדפס
              </button>
            </div>

            {/* Print Only Header */}
            <div className="print-only mb-6 pb-4 border-b border-desert-300">
              <h1 className="text-3xl font-bold text-desert-800 mb-2">אדריכלות מדבר חכמה - דו"ח העמדה</h1>
              <p className="text-desert-700">הופק באמצעות מנוע ניתוח AI.</p>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-6 p-4 bg-desert-50 rounded-lg border border-desert-200 no-print">
              <div className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-terracotta-500" />
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="bg-white border border-desert-300 rounded-md py-1 px-2 text-sm focus:ring-terracotta-400"
                >
                  <option value="summer">קיץ</option>
                  <option value="winter">חורף</option>
                  <option value="transition">עונות מעבר</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="bg-white border border-desert-300 rounded-md py-1 px-2 text-sm focus:ring-terracotta-400"
                >
                  <option value="morning">בוקר (08:00)</option>
                  <option value="noon">צהריים (12:00)</option>
                  <option value="evening">אחה"צ (16:00)</option>
                </select>
              </div>
               <div className="flex items-center gap-2 border-r border-desert-300 pr-4">
                  <Wind className="w-5 h-5 text-earth-500" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showWind}
                      onChange={(e) => setShowWind(e.target.checked)}
                      className="rounded text-earth-600 focus:ring-earth-500"
                    />
                    הצג רוחות
                  </label>
               </div>
            </div>

            {/* Canvas/SVG Area */}
            <Visualization2D />
          </section>
        </div>

      </main>
    </div>
  );
};

export default App;
