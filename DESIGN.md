# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-30
- Primary product surfaces: intake screen, single demo résumé, explorable Three.js villa
- Evidence reviewed: `docs/PRODUCT.md`, `docs/TEMPLATE_RESEARCH.md`, `lib/rag/reference-catalog.ts`, `components/RoomStudio.tsx`, `components/WorldCanvas.tsx`, `app/globals.css`

## Brand
- Personality: playful architectural studio, handcrafted digital diorama, personal and discoverable
- Trust signals: visible résumé-to-exhibit mapping, familiar room names, immediate demo generation
- Avoid: monochrome gallery minimalism, five disconnected platforms, generic SaaS dashboard chrome, empty white-box rooms

## Product goals
- Goals: perfect one résumé-to-villa demo; make spatial discovery happen through the villa itself; couple every navigation step to a camera transition
- Non-goals: multiple demo personas, free-walk keyboard controls, photorealism, asset-heavy procedural generation, publishing workflows
- Success signals: a visitor can enter through the front door, land in the living room, choose among two rooms on each side, and move closer to a selected résumé exhibit

## Personas and jobs
- Primary personas: creative developers, designers, artists, and professionals who want a distinctive portfolio
- User jobs: preview the concept quickly; submit a résumé; understand how personal information becomes architecture
- Key contexts of use: desktop exploration first, mobile preview second

## Information architecture
- Primary navigation: personal URL, file upload, one featured demo; generated world uses the front door, in-world room doors, back controls, and exhibit selection
- Core routes/screens: single intake screen and single generated-house screen
- Content hierarchy: promise → one demo → villa exterior → living room introduction → four semantic rooms → individual exhibit

## Design principles
- One house, many rooms: the first shot must read as a small villa facade; all semantic rooms share its foundation, exterior shell, roof language, materials, and lighting
- Spatial navigation first: never begin with a dollhouse overview or room tabs; the door, room thresholds, and exhibits are the primary navigation targets
- Camera follows intent: entering the villa, entering a room, and selecting an exhibit each produces a progressively closer camera composition
- Dense but legible: rooms contain furniture, props, signage, plants, fixtures, and exhibits, while interactive objects retain clear hover states
- Résumé becomes architecture: projects become display artifacts, skills become consoles, experience becomes a timeline, achievements become sculptural signals
- Tradeoffs: use a staged cinematic camera rather than free-walk controls; hide the facade after entry so interiors remain legible without destroying the sense of one building

## Visual language
- Color: warm terracotta and walnut architecture, cream plaster, moss and teal rooms, violet and amber emissive accents; dark UI framing for contrast
- Typography: editorial oversized Chinese headline, compact mono labels, readable sans-serif supporting text
- Spacing/layout rhythm: spacious intake composition; dense 3D scene; compact floating controls
- Shape/radius/elevation: architectural hard edges with selectively rounded UI cards; layered podium, facade, roof beams, furniture, and lighting
- Motion: cinematic camera easing across exterior, living room, room, and exhibit distances; hover lift and restrained emissive pulses
- Imagery/iconography: procedural Three.js diorama inspired by Joan Ramos Refusta, Soo-ah’s Room Folio, Maxime Morel, and Jesse’s Ramen; no copied assets

## Components
- Existing components to reuse: `RoomStudio`, `WorldCanvas`, URL form, upload zone, exhibit detail
- New/changed components: single featured résumé card, exterior villa facade, clickable front door, living-room introduction, four in-world room doors, contextual back navigation
- Variants and states: exterior, living room, focused room, focused exhibit; idle/hover/selected objects; loading and input error
- Token/component ownership: UI tokens in `app/globals.css`; world palette in `lib/agents/creative-director.ts`; spatial geometry in `components/WorldCanvas.tsx`

## Accessibility
- Target standard: keyboard-operable form, tabs, buttons, and room navigation; readable HTML detail for selected exhibits
- Keyboard/focus behavior: the featured demo and contextual navigation use buttons; all spatial destinations also have accessible HTML buttons
- Contrast/readability: dark text on warm light UI; translucent world overlays retain opaque backing
- Screen-reader semantics: tablist/tab/tabpanel relationships and named world region
- Reduced motion and sensory considerations: CSS reduced-motion support; camera motion remains gradual and non-flashing

## Responsive behavior
- Supported breakpoints/devices: desktop 1280+, tablet 681–920, mobile up to 680
- Layout adaptations: intake columns collapse on mobile; demo card remains below input; contextual navigation stays compact; detail panel becomes full-width
- Touch/hover differences: every exhibit responds to click/tap; hover is enhancement only

## Interaction states
- Loading: inline progress message while URL/file is read
- Empty: intake screen includes one immediately usable featured résumé
- Error: concise form message near the input
- Success: transition directly into the generated house
- Disabled: generation buttons communicate disabled state through opacity
- Offline/slow network: local demo résumés remain available without network access

## Content voice
- Tone: direct, imaginative, architectural
- Terminology: house for the complete result; room for a semantic section; exhibit for an individual résumé item
- Microcopy rules: describe the transformation concretely; avoid agent/RAG/security jargon in the primary experience

## Implementation constraints
- Framework/styling system: Next/vinext, React Three Fiber, Three.js, repository-native CSS
- Design-token constraints: extend existing CSS variables rather than add a second design system
- Performance constraints: procedural geometry, shared materials where practical, one canvas, two principal real-time lights, mobile DPR cap
- Compatibility constraints: preserve Cloudflare-compatible build; local-only delivery for this iteration
- Test/screenshot expectations: pipeline tests, build, rendered HTML smoke test, and browser verification of door → living room → room → exhibit camera states

## Open questions
- [ ] Should future themes change only materials/lighting or also the house topology? / product / affects the world schema
- [ ] Should users edit the parsed résumé before house generation? / product / affects intake flow
