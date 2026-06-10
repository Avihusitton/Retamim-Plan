# Product Context: Retamim-Plan (Desert Architect Simulator)

## The Tool
- Name: Retamim-Plan / Desert Architect
- Purpose: Help homeowners, architects, and designers plan an optimal house layout
  given a land plot — accounting for area, shape, solar orientation, wind, and local Israeli climate.

## Target Users
- Primary: Homeowners in Israel planning a new private residential build (personal use tool).
- Secondary: Architects wanting a quick AI-assisted starting point for client briefs.
- Anti-Persona: Do NOT target commercial real-estate developers. Residential private homes only.

## Core Value Proposition
Answer the question: "Given THIS specific land plot, what is the best house I can build here?"
Factors considered: sunlight, airflow, building regulations, room placement logic, visual privacy from neighbors.

## Domain Constraints (Non-Negotiable)
- The tool NEVER generates a final plan. It generates SUGGESTIONS.
- A licensed architect must approve any plan before construction.
- MUST display this disclaimer on every output screen:
  "כלי זה אינו תחליף לייעוץ אדריכלי או הנדסי מקצועי"
- Solar data must reference climate-config.json — not static estimates hardcoded in components.
- Building setback values (קווי בניין) must be configurable per municipality — never hardcoded.

## Primary User Flow
1. User inputs land parameters (area, shape, region, orientation) — or pastes AI-generated WGS84 description.
2. aiParser.js extracts polygon vertices from the description.
3. Visualization2D.jsx renders the plot to screen.
4. Floor plan suggestions are generated with rationale per room.

## Critical Constraints
- Personal tool — no e-commerce, no user accounts, no payment processing.
- No data saved server-side — everything runs in the browser.
- No deployment needed — runs locally via `npm run dev`.

## Output Language
- UI text: Hebrew (RTL)
- Code and comments: English
- Climate/technical data labels: English with Hebrew tooltips
