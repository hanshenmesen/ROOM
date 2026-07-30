# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-31
- Primary product surfaces: intake screen, single demo résumé, explorable Three.js villa
- Evidence reviewed: `docs/PRODUCT.md`, `docs/TEMPLATE_RESEARCH.md`, `lib/rag/reference-catalog.ts`, `components/RoomStudio.tsx`, `components/WorldCanvas.tsx`, `app/globals.css`

## Brand
- Personality: playful architectural studio, handcrafted digital diorama, personal and discoverable
- Trust signals: visible résumé-to-exhibit mapping, familiar room names, immediate demo generation
- Avoid: unnecessary room proliferation, generic SaaS dashboard chrome, an empty public museum, runtime-generated texture walls, unrestricted free-walk navigation

## Product goals
- Goals: perfect one résumé-to-museum demo behind the existing villa entrance; make spatial discovery happen through the architecture; couple every navigation step to a camera transition
- Non-goals: multiple demo personas, free-walk keyboard controls, photorealism, publishing workflows
- Success signals: a visitor feels positioned at human eye height, sees the next space revealed by an opening door, follows one continuous camera path across each threshold, and can move closer to a selected résumé exhibit

## Personas and jobs
- Primary personas: creative developers, designers, artists, and professionals who want a distinctive portfolio
- User jobs: preview the concept quickly; submit a résumé; understand how personal information becomes architecture
- Key contexts of use: desktop exploration; this MVP's visual acceptance is desktop-only

## Information architecture
- Primary navigation: personal URL, file upload, one featured demo; generated world uses the front door, in-world room doors, a single return-home control, back controls, and exhibit selection
- Core routes/screens: single intake screen and single generated-house screen
- Content hierarchy: promise → one demo → villa exterior → museum ground floor → geometric résumé exhibits / project objects / visitor corner → stairs → second-floor password gate → private bedroom diary
- Content-to-object mapping: identity and biography → portrait frame; work and education → chronological timeline; skills and tools → compact capability matrix; achievements and measurable impact → highlight plaque; contact links → contact card; projects → paired side-wall posters and rotating low-plinth image cards; visitor messages → corner board; private text and images → bedroom diary

## Design principles
- One entrance, two roles: the first shot remains the small villa facade; its door fades into the supplied Mardou museum, whose ground floor holds résumé content and whose second floor contains the password-gated local diary bedroom
- Spatial navigation first: never begin with a dollhouse overview or room tabs; the door, room thresholds, and exhibits are the primary navigation targets
- Camera follows intent: entering the villa, entering a room, and selecting an exhibit each produces a progressively closer camera composition
- Bounded mouse look: desktop pointer movement rotates the visitor's gaze within an authored yaw/pitch envelope so side walls and corners can be inspected without exposing the room shell. Click-driven door and exhibit camera routes always take priority; after arrival, focused exhibits permit only a small observation offset.
- Oblique display, frontal reading: showroom objects may sit at side-facing angles; selecting one moves the camera along that object's own facing vector until its content is readable head-on
- Human-scale occlusion: exterior, public showroom, and private bedroom coexist in one coordinate system; walls and the locked bedroom door hide the private interior until access succeeds
- Fixed viewpoints: each stage has an authored eye-level camera position and target; the exterior camera sits below the facade midpoint and looks slightly upward
- Full-frame embodiment: the canvas is the visitor's field of view, never a black presentation stage around a room model; interior frames must be filled by floor, walls, ceiling, doors, furniture, and light
- Threshold orientation: after crossing a side door, the camera stands just inside that exact doorway and faces into the room from that side, preserving the direction of travel
- Human room scale: interior rooms are substantially larger than their exhibit clusters; the eye sits at 1.66 m and begins one human step inside the threshold, never outside the room shell
- Expanded floor plan: the public showroom and private bedroom use twice the previous width and depth while retaining human-height ceilings and objects. The villa threshold remains fixed, so the extra depth extends inward rather than separating the facade from the entrance.
- Continuous thresholds: door rotation and camera travel begin together; the camera follows authored approach, threshold, and arrival waypoints without teleporting, unmounting the destination, or exposing an empty gap
- Entry clearance: exhibit layouts leave a walkable buffer between the threshold and the first interactive object so nothing appears pressed against the visitor's face on entry
- Object-level reference boundary: open-source projects supply individually named display-support nodes such as a catalog table, screen, lamp, shelf, books, contact letter, radio, skill object, globe, bench, and lantern. Decorative furniture without an information role is excluded; complete rooms, terrain, vehicles, and original layouts are never inserted.
- Information before decoration: every retained object must help present, index, illuminate, archive, or navigate résumé content. Empty visual filler is removed even when a suitable model is available.
- Dense but legible: the doubled public showroom reserves the front wall for résumé reading, hangs each side wall's two project posters at one shared height with generous horizontal spacing, and places four low plinths at the corners of a centered, walkable square. The visitor corner and open archive occupy opposite entrance corners. No standing project frame, table, or room-name sign may rise into the direct entrance-to-résumé-wall sightline.
- Geometric project representation: projects use rotating combinations of primitive geometry and semantic color. Project imagery remains in parsed data for compatibility but is never requested by the 3D museum renderer; readable content lives in the HTML detail panel.
- Résumé becomes architecture: the full résumé remains parsed and traceable inside the public showroom; every authored information surface is clickable and has a fixed close-view camera composition
- Local personal memory: the private bedroom is not another résumé category. Its diary stores text and optional images in browser local storage, never through the server in this MVP.
- Private-room first view: the bedroom door is taller than the public-room display furniture and carries no floating placard. After crossing its threshold, the diary desk sits on the doorway's center axis, faces the arriving visitor head-on, and the open book tilts slightly upward for immediate recognition.
- Texture boundary: the museum adds no ROOM-authored WebGL textures, project image textures, canvas text surfaces, or environment cube maps. The unmodified GLB retains only its own embedded materials.
- Password boundary: the MVP uses a transparent local demo password to prove the locked-room interaction; it is a spatial concept gate, not production authentication
- Tradeoffs: use perspective projection and staged cinematic movement rather than free-walk controls; both interiors remain mounted for uninterrupted threshold travel

## Visual language
- Color: warm terracotta and walnut architecture, cream plaster, moss and teal rooms, violet and amber emissive accents; exterior gaps use sky and landscape color, interior gaps use the current room envelope—never black stage color
- Typography: editorial oversized Chinese headline, compact mono labels, readable sans-serif supporting text
- Spacing/layout rhythm: spacious intake composition; full-viewport 3D field of view; compact floating controls
- Shape/radius/elevation: architectural hard edges with selectively rounded UI cards; layered podium, facade, roof beams, furniture, and lighting
- Motion: centripetal spline camera tracking across exterior, living room, doorway, room, and exhibit distances; door motion and camera travel stay synchronized; idle desktop views smoothly follow the pointer while focused views use a reduced range
- Imagery/iconography: ROOM authors data-driven portrait, timeline, tool matrix, plaques, thematic project posters, walls, doors, cameras, and layout; individually extracted open-source screens and archive objects support the content without competing with it.

## Components
- Existing components to reuse: `RoomStudio`, `WorldCanvas`, URL form, upload zone, exhibit detail
- New/changed components: single featured résumé card, exterior villa facade, animated front door, authored public showroom, portrait/timeline/skill frame variants, information plaques, horizontal side-wall project archive, rotating project-image plinths, open-archive dressing, visitor message board, password gate, private diary desk, contextual back navigation
- Variants and states: exterior, front-door-opening, public showroom, focused wall/project exhibit, visitor-board editor, password prompt, password error, private-bedroom-opening, private diary editor; idle/hover/selected objects
- Token/component ownership: UI tokens in `app/globals.css`; world palette in `lib/agents/creative-director.ts`; spatial geometry in `components/WorldCanvas.tsx`

## Accessibility
- Target standard: keyboard-operable form, tabs, buttons, and room navigation; readable HTML detail for selected exhibits
- Keyboard/focus behavior: the featured demo and contextual navigation use buttons; the private bedroom has a keyboard-accessible password form with focused input, cancel, and submit actions; guestbook and diary editors use labeled native form controls
- Contrast/readability: dark text on warm light UI; translucent world overlays retain opaque backing
- Screen-reader semantics: tablist/tab/tabpanel relationships and named world region
- Reduced motion and sensory considerations: CSS reduced-motion support; camera motion remains gradual and non-flashing

## Responsive behavior
- Supported visual-acceptance device: desktop 1280×720 and wider
- Layout adaptations: the intake screen may still collapse through existing CSS, but the 3D showroom has one authored desktop composition and no narrow-screen spatial rearrangement
- Pointer behavior: every exhibit responds to click; hover is enhancement only

## Interaction states
- Loading: inline progress message while URL/file is read
- Empty: intake screen includes one immediately usable featured résumé
- Error: concise form message near the input
- Success: transition directly into the generated house; a correct bedroom password opens the door and starts the camera route; saved guestbook and diary entries reappear after refresh in the same browser
- Disabled: generation buttons communicate disabled state through opacity
- Offline/slow network: local demo résumés remain available without network access

## Content voice
- Tone: direct, imaginative, architectural
- Terminology: house for the complete result; room for a semantic section; exhibit for an individual résumé item
- Microcopy rules: describe the transformation concretely; avoid agent/RAG/security jargon in the primary experience

## Implementation constraints
- Framework/styling system: Next/vinext, React Three Fiber, Three.js, repository-native CSS
- Design-token constraints: extend existing CSS variables rather than add a second design system
- Performance constraints: preload the original owner-supplied GLB behind the villa entrance, cap canvas DPR, keep real-time lights at four or fewer, hide bundled demo exhibits at runtime, and cap diary image uploads at 1 MB
- Compatibility constraints: preserve Cloudflare-compatible build; local-only delivery for this iteration
- Test/screenshot expectations: pipeline tests, lint, build, rendered HTML smoke test, and desktop browser verification at 1280×720 of exterior → public showroom → wall focus → central project focus → visitor message persistence → password error → password success → diary persistence → return paths

## Open questions
- [ ] Should future themes change only materials/lighting or also the house topology? / product / affects the world schema
- [ ] Should users edit the parsed résumé before house generation? / product / affects intake flow
- [ ] Should source project thumbnails always override semantic poster art, or should users choose per project? / product / affects ingestion schema and creative-direction controls
- [ ] Should production passwords be owner-defined access codes or authenticated sharing links? / product / affects the eventual security boundary
- [ ] Should guestbook entries remain local per visitor or eventually sync to the portfolio owner's shared backend? / product / affects moderation and ownership
