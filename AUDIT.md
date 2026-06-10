# Project Audit — Retamim-Plan (Desert Architect)
> Last Updated: 2026-06-10 | Update this file after every major structural change.

## 1. File Structure (Actual)
```
Retamim-Plan/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── components/Visualization2D.jsx
│   ├── services/aiService.js
│   ├── store/useStore.jsx
│   └── utils/
│       ├── aiParser.js
│       └── solarCalculator.js
├── public/
├── climate-config.json
├── .github/workflows/monitor-runtime-errors.yml
├── index.html
├── vite.config.js
├── package.json
├── AGENTS.md
├── ARCHITECTURE.md
├── AUDIT.md
├── SECURITY_CHECKLIST.md
└── product-context.md
```

## 2. Framework & Runtime
| Parameter | Value |
|-----------|-------|
| Framework | Vite 8 + React 19 |
| State | Zustand 5 |
| Build | Vite (CSR — no SSR) |
| Runtime | Browser only |

## 3. Key Files
| File | Purpose |
|------|---------|
| src/App.jsx | Main UI — simulation controls and layout |
| src/components/Visualization2D.jsx | 2D canvas rendering of land plot |
| src/services/aiService.js | AI integration for parsing land descriptions |
| src/utils/aiParser.js | WGS84 regex parser (hardened multi-line) |
| src/utils/solarCalculator.js | Solar angle calculations |
| src/store/useStore.jsx | Zustand global state |
| climate-config.json | Regional climate profiles (source of truth) |

## 4. External API Calls
| File | Calls | Purpose |
|------|-------|---------|
| src/services/aiService.js | External AI API | Parse land descriptions into WGS84 coordinates |

> Agent: Update this table every time you add a new fetch() or external API call.

## 5. State Management
- Zustand (useStore.jsx) — global state for land input, climate, and generated suggestions
- No Redux. No React Context for global state.

## 6. Known Regressions to Watch
- aiParser.js regex: Must handle multi-line AI output with varied whitespace
- Visualization2D.jsx: Must correctly center and scale arbitrary 14-vertex polygons to local metric grid
- Keep aiParser.js and Visualization2D.jsx coordinate systems in sync
