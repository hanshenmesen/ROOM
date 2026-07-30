# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-30
- Primary product surfaces: intake screen, single demo résumé, explorable Three.js villa
- Evidence reviewed: `docs/PRODUCT.md`, `docs/TEMPLATE_RESEARCH.md`, `lib/rag/reference-catalog.ts`, `components/RoomStudio.tsx`, `components/WorldCanvas.tsx`, `app/globals.css`

## Brand
- Personality: playful architectural studio, handcrafted digital diorama, personal and discoverable
- Trust signals: visible résumé-to-exhibit mapping, familiar room names, immediate demo generation
- Avoid: monochrome gallery minimalism, unnecessary room proliferation, generic SaaS dashboard chrome, empty white-box rooms, importing a complete third-party room scene

## Product goals
- Goals: perfect one résumé-to-villa demo; make spatial discovery happen through the villa itself; couple every navigation step to a camera transition
- Non-goals: multiple demo personas, free-walk keyboard controls, photorealism, publishing workflows
- Success signals: a visitor feels positioned at human eye height, watches doors open before crossing their thresholds, never sees the interiors of rooms they have not entered, and can move closer to a selected résumé exhibit

## Personas and jobs
- Primary personas: creative developers, designers, artists, and professionals who want a distinctive portfolio
- User jobs: preview the concept quickly; submit a résumé; understand how personal information becomes architecture
- Key contexts of use: desktop exploration first, mobile preview second

## Information architecture
- Primary navigation: personal URL, file upload, one featured demo; generated world uses the front door, in-world room doors, back controls, and exhibit selection
- Core routes/screens: single intake screen and single generated-house screen
- Content hierarchy: promise → one demo → villa exterior → living room introduction → portfolio room → individual project

## Design principles
- One small house, two interiors: the first shot must read as a small villa facade; the living room and portfolio room share its foundation, exterior shell, roof language, materials, and lighting
- Spatial navigation first: never begin with a dollhouse overview or room tabs; the door, room thresholds, and exhibits are the primary navigation targets
- Camera follows intent: entering the villa, entering a room, and selecting an exhibit each produces a progressively closer camera composition
- Human-scale occlusion: exterior, living room, focused room, and focused exhibit are separate visibility stages; inactive room interiors must not render through walls
- Fixed viewpoints: each stage has an authored eye-level camera position and target; the exterior camera sits below the facade midpoint and looks slightly upward
- Full-frame embodiment: the canvas is the visitor's field of view, never a black presentation stage around a room model; interior frames must be filled by floor, walls, ceiling, doors, furniture, and light
- Threshold orientation: after crossing a side door, the camera stands just inside that exact doorway and faces into the room from that side, preserving the direction of travel
- Human room scale: interior rooms are substantially larger than their exhibit clusters; the eye sits at 1.66 m and begins one human step inside the threshold, never outside the room shell
- Threshold cut: the door completes its opening before the stage cuts directly to the authored position inside; room changes never fly the camera through an unrendered void or reveal the whole room from outside
- Entry clearance: exhibit layouts leave a walkable buffer between the threshold and the first interactive object so nothing appears pressed against the visitor's face on entry
- Object-level reference boundary: open-source projects supply individually named furniture and prop nodes; every chair, table, lamp, shelf, book, cup, or device is cloned, normalized, and placed separately. Their complete rooms and original layouts are never inserted.
- Dense but legible: the living room reads as a furnished introduction; the portfolio room contains a desk setup and four clearly separated project markers with unambiguous hover states
- Résumé becomes architecture: the full résumé remains parsed and traceable, while this focused MVP surfaces four projects as the only in-room interactive exhibits
- Tradeoffs: use perspective projection and staged cinematic movement rather than free-walk controls; each interior gets a complete enclosing shell and only the current room is rendered

## Visual language
- Color: warm terracotta and walnut architecture, cream plaster, moss and teal rooms, violet and amber emissive accents; exterior gaps use sky and landscape color, interior gaps use the current room envelope—never black stage color
- Typography: editorial oversized Chinese headline, compact mono labels, readable sans-serif supporting text
- Spacing/layout rhythm: spacious intake composition; full-viewport 3D field of view; compact floating controls
- Shape/radius/elevation: architectural hard edges with selectively rounded UI cards; layered podium, facade, roof beams, furniture, and lighting
- Motion: cinematic camera easing across exterior, living room, doorway, room, and exhibit distances; doors visibly open before the camera moves through them
- Imagery/iconography: ROOM authors the walls, doors, cameras, and layout; individually extracted open-source objects provide furniture detail without embedding complete source scenes.

## Components
- Existing components to reuse: `RoomStudio`, `WorldCanvas`, URL form, upload zone, exhibit detail
- New/changed components: single featured résumé card, exterior villa facade, animated front door, authored living room envelope, one animated portfolio-room door, object-level room dressing, contextual back navigation
- Variants and states: exterior, exterior-door-opening, living room, room-door-opening, focused room, focused exhibit; idle/hover/selected objects; loading and input error
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
- Performance constraints: render only the active authored room and its object set, never load complete vendor room scenes, keep one canvas and two principal real-time lights, and cap mobile DPR
- Compatibility constraints: preserve Cloudflare-compatible build; local-only delivery for this iteration
- Test/screenshot expectations: pipeline tests, build, rendered HTML smoke test, and browser verification of low exterior → door opening → eye-level living room → isolated room → exhibit camera states

## Open questions
- [ ] Should future themes change only materials/lighting or also the house topology? / product / affects the world schema
- [ ] Should users edit the parsed résumé before house generation? / product / affects intake flow
