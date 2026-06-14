# Retamim-Plan (Desert Architect) — Full Technical Documentation
> Purpose: Complete guide for every developer (including AI Agent) who will work on this project.
> Written to prevent repeating mistakes and to document WHY decisions were made.

## 1. Project Overview
Desert architecture simulator. Given a land plot (area, shape, orientation) and climate data (region, sun angles, prevailing wind),
the tool generates optimized floor plan suggestions with spatial and environmental reasoning.
The tool is advisory only — outputs require review by a licensed architect.

## 2. Tech Stack
| Parameter | Value |
|-----------|-------|
| Framework | Vite 8 + React 19 (CSR — no SSR) |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 (via @tailwindcss/vite plugin) |
| Icons | lucide-react |
| AI Integration | src/services/aiService.js (external AI for parsing) |
| Build Tool | Vite (not Next.js) |
| Runtime | Browser only — personal local tool |
| Repo URL | https://github.com/Avihusitton/Retamim-Plan.git |

## 3. Folder Structure
```
Retamim-Plan/
├── src/
│   ├── App.jsx                  # Root component — main simulator UI
│   ├── main.jsx                 # Vite entry point
│   ├── index.css                # Global styles
│   ├── components/
│   │   └── Visualization2D.jsx  # 2D floor plan canvas
│   ├── services/
│   │   └── aiService.js         # AI integration (parsing land descriptions)
│   ├── store/
│   │   └── useStore.jsx         # Zustand global state
│   └── utils/
│       ├── aiParser.js          # WGS84 coordinate parser (regex hardened)
│       └── solarCalculator.js   # Solar angle calculations
├── public/
├── climate-config.json          # Regional climate profiles (source of truth)
├── .github/workflows/
│   └── monitor-runtime-errors.yml
├── index.html
├── vite.config.js
├── package.json
├── AGENTS.md
├── ARCHITECTURE.md
├── AUDIT.md
├── SECURITY_CHECKLIST.md
└── product-context.md
```

## 4. State Management (Zustand — src/store/useStore.jsx)
Single store holds:
- `landPlot` — current land input (area, vertices, orientation, region)
- `climateProfile` — loaded from climate-config.json
- `suggestions` — generated floor plan suggestions
- `simulationState` — current simulation step

No Redux. No React Context for global state — Zustand is the single source of truth.

## 5. Core Data Models

### LandPlot
```js
{
  vertices: [{ lat: number, lng: number }],  // WGS84 polygon, minimum 3 points
  area_sqm: number,
  orientation_north_deg: number,             // 0 = geographic north
  region: string                             // key into climate-config.json
}
```

### ClimateProfile (from climate-config.json)
```js
{
  label: string,
  avg_temp_summer_c: number,
  avg_temp_winter_c: number,
  prevailing_wind_direction_deg: number,
  solar_hours_per_day_monthly: number[],    // 12 values
  summer_shading_critical: boolean,
  winter_solar_gain_desired: boolean
}
```

### FloorPlanSuggestion
```js
{
  rooms: [{
    name: string,
    orientation: "north" | "south" | "east" | "west",
    area_sqm: number,
    rationale: string
  }],
  disclaimer: "כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי"
}
```

## 6. AI Parser — aiParser.js
- Parses multi-line WGS84 coordinate descriptions from AI output
- Regex hardened for reliable vertex extraction (minimum 14 vertices for complex polygons)
- MUST stay in sync with Visualization2D.jsx coordinate scaling

## 7. Known Issues & Lessons Learned
> Append a new entry here every time something takes more than 30 minutes to debug.

Format:
```
### [DATE] — [Short title]
Problem: [What went wrong]
Root cause: [Why it happened]
Fix: [What was done]
Prevention: [What to check next time]
```

### 2026-06-10 — aiParser.js regex for multi-line WGS84
Problem: Parser failed on complex AI-generated coordinate descriptions spanning multiple lines.
Root cause: Regex was not handling newlines and varied spacing between coordinate pairs.
Fix: Hardened regex with global flag and explicit whitespace handling.
Prevention: Always test parser with real AI-generated output (not ideal single-line format).

## 8. CI/CD
This is a personal local tool — no deployment pipeline.
GitHub is used only for backup and version history.

## 9. Safe Working Rules

Before every git push:
- [ ] `npm run build` completes without errors
- [ ] No import errors or broken component references
- [ ] climate-config.json is not bypassed with hardcoded values
- [ ] Disclaimer text is present on all output views

## 10. Dependency Version Lock
| Package | Version | Why This Version |
|---------|---------|-----------------|
| react | ^19.2.7 | Latest stable — project started with it |
| react-dom | ^19.2.7 | Must match react |
| vite | ^8.0.12 | Latest — no breaking issues found |
| tailwindcss | ^4.3.0 | v4 with Vite plugin (no postcss config needed) |
| zustand | ^5.0.14 | Latest stable |
| lucide-react | ^1.17.0 | Icon library |

> DO NOT add `next`, `express`, or any server framework — this is a pure CSR browser app.

## 11. Domain Decision Log
> The agent MUST append an entry here every time a non-obvious design decision is made.

### 2026-06-10 — Solar Orientation Default
Decision: Default north = 0° geographic north (not magnetic north).
Reason: Israeli building code (תקן 1045) references geographic north.
Owner approved: Yes.

### 2026-06-10 — No Hardcoded Building Setbacks
Decision: Building setbacks (קווי בניין) stored in climate-config.json per region.
Reason: Setbacks vary by municipality. Hardcoding causes silent bugs.
Owner approved: Yes.

### 2026-06-10 — Vite CSR (no SSR/Next.js)
Decision: Pure client-side Vite app, no server-side rendering.
Reason: Personal local tool — no need for SSR, API routes, or deployment infrastructure.
Owner approved: Yes.

### 2026-06-14 — FloorPlanAutoTracer: OpenCV.js via CDN (no npm package)
Component: `src/components/FloorPlanAutoTracer.jsx`
Decision: OpenCV.js is loaded from the official CDN (`https://docs.opencv.org/4.8.0/opencv.js`)
via a `<script async>` tag in `index.html`, NOT as an npm package.
Reason: The npm package for OpenCV.js (`opencv.js`) is 8MB+ and complicates Vite bundling.
The CDN approach loads asynchronously, polled via `window.cv?.Mat`.
Pixel→meter conversion uses `x_meters = px / pixelsPerMeter` and `y_meters = (imgHeight - py) / pixelsPerMeter` to properly align the coordinate origin with the bottom-left corner.
The contour algorithm: Canny edge detection → findContours (RETR_EXTERNAL) →
approxPolyDP (epsilon = 2% arc length) → largest contour by area.
All OpenCV Mats are explicitly deleted to prevent WASM heap leaks.
Owner approved: Yes.
