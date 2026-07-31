# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-31
- Primary product surfaces: animated process-blueprint landing, intake screen, single demo résumé, explorable Three.js museum
- Evidence reviewed: `docs/PRODUCT.md`, `docs/TEMPLATE_RESEARCH.md`, `lib/rag/reference-catalog.ts`, `components/ProductFlowLanding.tsx`, `components/RoomStudio.tsx`, `components/WorldCanvas.tsx`, `app/globals.css`, the user-provided `ROOM_可编辑重建版.pptx` and `图片 2.pdf`, `public/assets/blueprint/parts/`, `/Users/hanchen/Documents/room-materials/components/SceneMaterials.tsx`, `/Users/hanchen/Documents/room-materials/public/assets/materials/ASSETS.md`

## Brand
- Personality: playful architectural studio, handcrafted digital diorama, personal and discoverable
- Trust signals: visible résumé-to-exhibit mapping, familiar room names, immediate demo generation
- Avoid: monochrome gallery minimalism, unnecessary room proliferation, generic SaaS dashboard chrome, an empty public showroom, importing a complete third-party room scene

## Product goals
- Goals: explain the résumé-to-space mechanism before intake; perfect one résumé-to-museum demo; make spatial discovery happen through the museum itself; couple every navigation step to a camera transition
- Non-goals: multiple demo personas, free-walk keyboard controls, photorealism, publishing workflows
- Success signals: a visitor feels positioned at human eye height, sees the next space revealed by an opening door, follows one continuous camera path across each threshold, and can move closer to a selected résumé exhibit

## Personas and jobs
- Primary personas: creative developers, designers, artists, and professionals who want a distinctive portfolio
- User jobs: preview the concept quickly; submit a résumé; understand how personal information becomes architecture
- Key contexts of use: desktop exploration; this MVP's visual acceptance is desktop-only

## Information architecture
- Primary navigation: one quiet start-creation action over the process artwork plus a return-to-process action on intake; personal URL, file upload, saved recent profiles, one permanent featured demo; generated world uses the front door, stairs, a single return-home control, back controls, and exhibit selection
- Core routes/screens: interactive process landing, intake screen, Agent parsing/move-in desk, loading cover, and generated-museum screen
- Content hierarchy: single-screen process artwork → intake, saved profile, or permanent demo → parsing/move-in diary desk → 100% scene-loading cover → museum exterior → public showroom → front résumé wall / project islands / visitor corner → open second-floor gallery → password-gated diary book
- Content-to-object mapping: identity and biography → portrait frame; work and education → chronological timeline; skills and tools → compact capability matrix; achievements and measurable impact → highlight plaque; contact links → contact card; projects → paired side-wall posters and rotating low-plinth image cards; visitor messages → corner board; private text and images → bedroom diary

## Design principles
- Reference-first introduction: rebuild the supplied editable PPT artwork as independently positioned web elements rather than using a flattened slide background. Keep the original ROOM mark, pixel people, document illustrations, Agent pictograms, generated house, and color relationships, but organize them into a balanced three-stage input → Agent pipeline → house composition. Avoid added navigation bars, side rails, generic cards, or scrolling. Motion belongs to the extracted visual elements and their connectors.
- Anchored creation action: “开始创建” is the sole primary action and remains in the viewport's lower-right corner, independent of the three-stage diagram.
- Directional handoff: the landing exits toward the left and intake enters from the right; intake exposes a visible “查看流程” control that reverses the transition without a route reload.
- Honest scene reveal: the 3D canvas remains fully covered until tracked resources reach 100% and the Suspense scene has committed; retain the completed state for 1.2 seconds so the first visible frame is stable.
- One small house, two roles: the first shot must read as a small villa facade; the public showroom holds all résumé content while the password-gated private bedroom holds a local personal diary
- Spatial navigation first: never begin with a dollhouse overview or room tabs; the door, room thresholds, and exhibits are the primary navigation targets
- Camera follows intent: entering the villa, entering a room, and selecting an exhibit each produces a progressively closer camera composition
- Bounded mouse look: desktop pointer movement rotates the visitor's gaze within an authored yaw/pitch envelope so side walls and corners can be inspected without exposing the room shell. Click-driven door and exhibit camera routes always take priority; after arrival, focused exhibits permit only a small observation offset.
- Oblique display, frontal reading: showroom objects may sit at side-facing angles; selecting one moves the camera along that object's own facing vector until its content is readable head-on
- Human-scale occlusion: exterior, public showroom, and the second-floor gallery coexist in one coordinate system; architecture controls sightlines without using a password to block spatial exploration
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
- Paired project representation: each project has one rotating flat image card on a low central plinth and one readable side-wall poster. Either object opens the same résumé-backed project detail, but each owns an authored camera focus that matches its physical orientation. Parsed website or résumé images should populate the card first; this demo renders a project-cover image fallback from the parsed title and summary.
- Résumé becomes architecture: the full résumé remains parsed and traceable inside the public showroom; every authored information surface is clickable and has a fixed close-view camera composition
- Abstract portrait only: a source photo is an identity input, never a public exhibit. Creating a world automatically sends that photo to the configured image service, and the 3D portrait remains behind the loading cover until generation settles. The generated image never overwrites the saved source URL or its evidence; a non-photographic placeholder is used if generation fails, with a retry action in the profile detail.
- Playful deconstructed face: generated portraits use black ink-like strokes on warm white, broken contours, loops, sharp angles, asymmetrical negative space, and intentionally non-anatomical facial cues. They must never become a realistic, painted, or merely stylized version of the source photograph.
- Local personal memory: the second-floor diary is not another résumé category. Its text and optional images stay in browser local storage and require an owner or visitor credential before reading; the surrounding second-floor space remains open.
- Productive parsing wait: as soon as a URL or document enters the Agent pipeline, intake becomes a move-in desk where the user can write text and select images for the private diary. Diary content is saved locally and is never included in the Agent request or uploaded to the server.
- Persistent generated people: every successfully parsed profile is stored locally, deduplicated by profile ID, and surfaced newest-first in the intake Demo / 最近生成 area. A saved card recompiles and opens the same profile without running Agent parsing again; the permanent Han Chen demo remains available.
- Private-room first view: the bedroom door is taller than the public-room display furniture and carries no floating placard. After crossing its threshold, the diary desk sits on the doorway's center axis, faces the arriving visitor head-on, and the open book tilts slightly upward for immediate recognition.
- Parsed project imagery: a source project's own thumbnail or embedded image is the preferred rotating exhibit. Before a source provides one, the demo renders the same parsed project content into a flat cover image; it must never fall back to an abstract 3D sculpture.
- Password boundary: the MVP uses transparent local demo passwords only when the diary book is opened. Owner mode can read and write; visitor mode can only read. The second-floor gallery itself never requires authentication.
- Tradeoffs: use perspective projection and staged cinematic movement rather than free-walk controls; both interiors remain mounted for uninterrupted threshold travel

## Visual language
- Color: warm terracotta and walnut architecture, cream plaster, moss and teal rooms, violet and amber emissive accents; exterior gaps use sky and landscape color, interior gaps use the current room envelope—never black stage color
- Material system: reuse the local lime-plaster, walnut-herringbone, terracotta-roof, and woven-rug texture sets from the isolated materials branch. They belong to architecture and display furniture only; parsed résumé/project images remain the content layer.
- Typography: editorial oversized Chinese headline, compact mono labels, readable sans-serif supporting text
- Spacing/layout rhythm: spacious intake composition; full-viewport 3D field of view; compact floating controls
- Shape/radius/elevation: architectural hard edges with selectively rounded UI cards; layered podium, facade, roof beams, furniture, and lighting
- Motion: a quiet page handoff plus independent document drift, process-trace, sequential Agent, visitor, and house-light animation; then one continuous centripetal, arc-length camera curve across entrance corners and authored spline routes elsewhere. Door motion and camera travel stay synchronized; idle desktop views smoothly follow the pointer while focused views use a reduced range.
- Imagery/iconography: the landing uses the transparent source artwork extracted from the editable PPTX, with HTML/CSS owning labels, connectors, and layout. ROOM authors data-driven portrait, timeline, tool matrix, plaques, thematic project posters, walls, doors, cameras, and layout; individually extracted open-source screens and archive objects support the content without competing with it. AI portrait art uses pure black expressive strokes on warm white with no gray, color, shading, realistic texture, or filled facial planes.

## Components
- Existing components to reuse: `RoomStudio`, `WorldCanvas`, URL form, upload zone, exhibit detail
- New/changed components: `ProductFlowLanding`, independently positioned PPT artwork and three-stage flow, bidirectional intake handoff, parsing move-in diary desk, saved-profile demo list, single permanent featured résumé card, loading cover, museum exterior, animated front door, authored public showroom, portrait/timeline/skill frame variants, abstract portrait status/retry control, information plaques, project islands, open-archive dressing, visitor message board, diary access gate, private diary desk, contextual back navigation
- Variants and states: blueprint idle/leaving/reduced-motion, intake entering/idle/leaving, no saved profiles/saved profiles, Agent parsing, parsing-ready, loading below 100%, portrait-generating gate, loading-complete hold, exterior, front-door-opening, public showroom, open second-floor gallery, focused wall/project exhibit, profile portrait generating/abstract/error states, visitor-board editor, diary password prompt/error, owner diary editor, visitor diary reader; idle/hover/selected objects
- Token/component ownership: UI tokens in `app/globals.css`; world palette in `lib/agents/creative-director.ts`; spatial geometry in `components/WorldCanvas.tsx`

## Accessibility
- Target standard: keyboard-operable form, tabs, buttons, and room navigation; readable HTML detail for selected exhibits
- Keyboard/focus behavior: the blueprint handoff, featured demo, contextual navigation, and portrait retry action use buttons; the diary has a keyboard-accessible password form with focused input, cancel, and submit actions; guestbook and diary editors use labeled native form controls
- Contrast/readability: dark text on warm light UI; translucent world overlays retain opaque backing
- Screen-reader semantics: tablist/tab/tabpanel relationships and named world region
- Reduced motion and sensory considerations: CSS reduced-motion support; camera motion remains gradual and non-flashing

## Responsive behavior
- Supported visual-acceptance device: desktop 1280×720 and wider
- Layout adaptations: the intake screen may still collapse through existing CSS, but the 3D showroom has one authored desktop composition and no narrow-screen spatial rearrangement
- Pointer behavior: every exhibit responds to click; hover is enhancement only

## Interaction states
- Loading: URL/file parsing moves into a dedicated progress workspace with a local-only text/image diary composer; after parsing is ready, the user explicitly enters. An opaque full-viewport architectural loading screen then keeps the 3D canvas hidden while local material maps, environment images, GLTF/DRACO objects, parsed project images, and the abstract portrait load. Progress is monotonic, displays a real 100% completion state only after portrait generation settles, then waits 1.2 seconds after both resource completion and scene commit before revealing the museum.
- Empty: intake screen includes one immediately usable featured résumé
- Error: concise form message near the input; portrait generation failures retain the abstract placeholder and offer retry without exposing the source photo
- Success: the stable generated museum appears after the completed loading hold; its parsed profile is listed in Demo / 最近生成 after refresh and can be reopened without parsing; a successful portrait generation updates the 3D portrait and exposes an AI-art label; stairs enter the second floor immediately; clicking the diary opens authentication, and valid owner/visitor credentials reveal the corresponding editable/read-only view; saved guestbook and diary entries reappear after refresh in the same browser
- Disabled: generation buttons communicate disabled state through opacity
- Offline/slow network: local demo résumés remain available without network access

## Content voice
- Tone: direct, imaginative, architectural
- Terminology: house for the complete result; room for a semantic section; exhibit for an individual résumé item
- Microcopy rules: describe the transformation concretely; avoid agent/RAG/security jargon in the primary experience

## Implementation constraints
- Framework/styling system: Next/vinext, React Three Fiber, Three.js, repository-native CSS
- Design-token constraints: extend existing CSS variables rather than add a second design system
- Performance constraints: begin preloading the shared museum GLB when the user advances to intake; retain both authored floors in one canvas; keep the scene's light-node count stable across floors; precompile the complete WebGL scene before ending the loading cover; use one continuous arc-length entrance curve and cap route delta so a slow frame cannot jump at a corner; gate first paint until scene resources reach 100%, portrait generation settles, shader compilation finishes, the scene commits, and the 1.2-second stability hold finishes; cap saved profiles at six, canvas DPR, diary images at 1 MB, and source portraits at 8 MB
- Privacy constraints: source portraits are fetched through the existing validated media proxy only for automatic abstract transformation; image-service credentials remain server-side, and source/generated image bytes are neither logged nor persisted by the server. Intake copy discloses the transformation before submission.
- Compatibility constraints: preserve Cloudflare-compatible build; local-only delivery for this iteration
- Test/screenshot expectations: landing-source regression, diary move-in regression, upstairs-preload regression, scene-entry gate regression, pipeline tests, lint, build, and rendered HTML smoke test. Interactive desktop acceptance remains user-led for this iteration.

## Open questions
- [ ] Should future themes change only materials/lighting or also the house topology? / product / affects the world schema
- [ ] Should users edit the parsed résumé before house generation? / product / affects intake flow
- [ ] Should source project thumbnails always override semantic poster art, or should users choose per project? / product / affects ingestion schema and creative-direction controls
- [ ] Should production passwords be owner-defined access codes or authenticated sharing links? / product / affects the eventual security boundary
- [ ] Should guestbook entries remain local per visitor or eventually sync to the portfolio owner's shared backend? / product / affects moderation and ownership
- [ ] Should generated portraits be saved to the portfolio or remain session-only by default? / product / affects storage, consent revocation, and publishing
