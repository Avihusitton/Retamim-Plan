# Security Checklist — Retamim-Plan
> Read and check before every new feature commit.
> Version: 1.0.0 | Created: 2026-06-10

## 1. Secrets & Environment Variables
- [ ] No API keys hardcoded in source files
- [ ] AI service API key stored in `.env.local` (not committed to git)
- [ ] `.env.local` is listed in `.gitignore`
- [ ] No keys in aiService.js — must read from `import.meta.env`

## 2. User Input Security
- [ ] Land coordinate inputs are validated: type check, range check, non-empty polygon
- [ ] AI-parsed text is sanitized before rendering to screen
- [ ] No user-provided data is passed unsanitized to canvas rendering functions

## 3. AI-Generated Code Cleanup
- [ ] No placeholder API keys in code (YOUR_API_KEY, sk-test-xxx, etc.)
- [ ] No unused packages in package.json
- [ ] No `next`, `express`, or server-side packages in dependencies (this is a CSR Vite app)

## 4. Domain-Specific Checks
- [ ] Disclaimer text ("כלי זה אינו תחליף לייעוץ אדריכלי מקצועי") visible on every output view
- [ ] Building setback values sourced from climate-config.json — not hardcoded in any component
- [ ] solar_orientation_rules read from climate-config.json — not hardcoded in src/

## 5. Build Check
- [ ] `npm run build` completes without errors before any git push
- [ ] No console errors when running `npm run dev`
- [ ] No broken imports (check after moving/renaming files)
