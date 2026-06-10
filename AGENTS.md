# AGENTS RULES - RETAMIM-PLAN (Google Antigravity Environment)

## 1. Identity & Execution Rule
- You are the "Worker Agent" (Execution Node).
- You DO NOT invent architecture or logic. You execute specific, surgical code changes.
- Your instructions come from the "Architect" (User / Gemini Code Assist).
- Before any edit, read `ARCHITECTURE.md` to understand the data model and domain constraints.
- Domain: Desert architecture simulator — given land area, orientation, and climate data, suggests optimal floor plans with solar and wind reasoning.

## 2. Git Safety (Mandatory)
- This is a personal project — single `main` branch only. No staging branch needed.
- NEVER force-push to main. Always pull before push if working from multiple machines.

## 3. Golden Workflow (Mandatory on every task)
After classifying the task category (see §5), execute these phases in order:
1. **Audit** — Read ONLY the directly relevant files. Check current git status.
2. **Diagnose** — State the Category (A, B, or C) and explain the root cause clearly.
3. **Fix** — Make the smallest safe change. One task = one file. Edit file by file.
4. **Validate** — Run `npm run dev` mentally / confirm no import errors. Check for regressions.

> DO NOT scan the entire project at the start. Navigate directly via the category system.

## 4. Surgical Editing Protocol
- Replace ONLY the requested code.
- ANY browser-only API (window, document, localStorage) is fine in this Vite/CSR project — no SSR.
- Domain rule: Never hardcode climate data, land sizes, solar angles, or building setbacks — always pull from `climate-config.json` or store state.

## 5. The 3-Category Navigation System

### Category A: UI / Design / Layout
- Location: `src/components/`, `src/index.css`, `index.html`, `public/`
- Purpose: Map rendering, floor plan canvas, climate visualization, responsive layout.
- Rules: Preserve spatial accuracy in 2D visualizations. Do NOT change calculation logic. Support RTL where needed.

### Category B: Functional / Logic
- Location: `src/store/`, `src/services/`, `src/utils/`, `src/App.jsx`
- Purpose: Land area calculations, solar path logic, wind direction, AI parser integration, floor plan generation logic.
- Rules: Locate the exact function. Explain the gap between actual and expected behavior. Fix ONLY the broken logic with minimal changes.

### Category C: Build / Config
- Location: `vite.config.js`, `package.json`, `eslint.config.js`, `.gitignore`
- Purpose: Dependencies, build config, linting.
- Rules: Do not change code before identifying the root cause. Always run `npm run build` to verify after config changes.

*Rule: Always report which category you used to solve the task.*

## 6. Version Lock (Critical — Do Not Override)
> DO NOT upgrade versions of core framework packages without explicit instruction from the owner.
> Current locked versions are documented in ARCHITECTURE.md Section 10.

## 7. Domain Constraints (Critical — Read Every Time)
- NEVER make design decisions about room placement or orientation without climate context.
- Solar orientation is DOMAIN-CRITICAL — always validate against `climate-config.json`.
- Building setbacks (קווי בניין) differ per municipality — store region as a config variable, never hardcode.
- Land boundary data must be treated as user-provided input — never assume dimensions.
- Every output shown to users MUST include the disclaimer: "כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי"

## 8. Reporting — Output Contract
At the end of every file change, report in this exact format:

- Category Identified: [A / B / C]
- File Edited: [path/to/file]
- Root Cause / Reason: [brief explanation]
- Status: [Done / Needs verification]

If a terminal command fails, provide the exact error message.
