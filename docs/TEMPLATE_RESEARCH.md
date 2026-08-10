# Template and asset research

This catalog seeds the Template Scout Agent. A publicly visible repository is not automatically open source. Code and assets enter production only after the repository license, bundled asset licenses, and provenance have been recorded.

## Recommended study order

- **Room experiences:** Joan Ramos Refusta → Soo-ah’s Room Folio → Andrii Babintsev → Maxime Morel
- **Game-world interaction:** Bruno Simon
- **Retro-computer interaction:** Henry Heffernan
- **Fast templates:** MingPV → ladunjexa → Sanidhyy

Phase 1 implements the multi-room experience only. Racing remains deferred.

## A. Confirmed open source

| Reference | Similarity and useful patterns | License status |
| --- | --- | --- |
| [Joan Ramos Refusta](https://github.com/jrefusta/joan-portfolio) | ★★★ 3D room, computer OS, arcade, gallery, Tetris, Rubik’s cube, CSS3D screens and baked lighting | MIT |
| [Bruno Simon 2025](https://github.com/brunosimon/folio-2025) | ★★★ Drivable complete 3D world; strong onboarding, controls, quality settings, physics and world architecture | MIT |
| Bruno Simon 2019 | ★★★ Earlier drivable portfolio and a useful simpler baseline | MIT |
| [Henry Heffernan](https://os.henryheffernan.com/) | ★★★ 1990s room and retro computer with playable Doom and Oregon Trail | MIT; capture canonical repository URL before reuse |
| [Soo-ah’s Room Folio](https://github.com/andrewwoan/sooahs-room-folio) | ★★★ Refined interior, hotspot project presentation, Blender assets, tutorial-friendly structure, day/night theming | MIT |
| Andrii Babintsev | ★★★ 3D office with more than ten interactive objects, physics and mini-games | MIT; capture canonical repository URL before reuse |
| [Maxime Morel](https://github.com/maxime-mrl/3D-room-portofolio) | ★★★ Low-poly room portfolio, hover and click interactions | MIT |
| MingPV 3D Portfolio | ★★ Nuxt + Three.js; a relatively complete template for adaptation | Apache-2.0; capture canonical repository URL |
| [React 18 3D Portfolio](https://github.com/ladunjexa/reactjs18-3d-portfolio) | ★ Computer model, Earth, stars, and conventional portfolio sections | MIT |
| [Sanidhyy 3D Portfolio](https://github.com/sanidhyy/3D_Portfolio) | ★ React Three Fiber developer portfolio starting point | MIT |
| Md Amiruddin 3D Portfolio | ★★ Blender scene combined with a Three.js personal introduction | MIT; capture canonical repository URL |
| Akash Malhotra 3D Portfolio | ★ General React/Three.js portfolio starting point | MIT; capture canonical repository URL |
| CodeBucks Creative Portfolio | ★★ Next.js, Three.js, animation and creative navigation | MIT; capture canonical repository URL |
| [Jayant Potdar](https://github.com/Jayant-1/3D-Portfolio) | ★★ Space environment, desktop computer, keyboard navigation and Earth model | MIT |

“Confirmed open source” makes these projects eligible for deeper technical study. It does not automatically make every bundled model, texture, font, sound, or game ROM reusable.

## B. Source visible, but not approved for reuse

These projects may inform visual and interaction research. They must not be copied, modified, or redistributed unless permission and licensing are resolved.

| Reference | Situation | ROOM policy |
| --- | --- | --- |
| David Heckhoff | Vue, Three.js, GLSL and GSAP; custom license prohibits commercial use | Research only |
| Amr Khamis | Three.js, R3F, GLSL and GSAP; CC BY-NC-ND 4.0 | Research only; no derivatives |
| [AT010303 Room Portfolio](https://github.com/AT010303/Room_Portfolio) | ★★★ Room, Mario emulator, music and theme switching; no LICENSE | Research only |
| [Rowobin 3D Room Portfolio](https://github.com/Rowobin/3D-Room-Portfolio) | ★★★ Room-style portfolio; no LICENSE | Research only |
| [Adrian Hajdin 3D Developer Portfolio](https://github.com/adrianhajdin/3d-portfolio) | Widely circulated Three.js tutorial project; no clear license | Research only |
| Adrian Hajdin newer portfolio | Newer tutorial-style Three.js implementation; no clear license | Research only |
| Forrest Knight | Personal 3D portfolio; no LICENSE | Research only |
| 0xFloyd Portfolio | Early immersive Three.js portfolio; no LICENSE | Research only |
| 3D Sky Island | ★★ Floating-island scene; no LICENSE | Research only |
| [KpG782 3D Portfolio](https://github.com/KpG782/3D_Portfolio) | README and GitHub license metadata conflict | Research only until resolved |
| János Litkei | Website footer says MIT, but no reliable public source repository was located | Visual reference only |

GitHub’s licensing guidance notes that a public repository without a license remains protected by default copyright rules. ROOM therefore treats “source visible” and “open source” as different states.

## C. Strong visual references without confirmed source

“Not found” means no reliable corresponding repository has been cataloged yet; it does not imply that the author has declared the work closed source.

| Reference | Style |
| --- | --- |
| Jesse’s Ramen | ★★★ Cyberpunk ramen shop and classic 3D personal-site reference |
| Merouane Bali | ★★★ Sci-fi isometric space with character-led navigation |
| Robin Payot | ★★★ Long-form immersive 3D world |
| Jordan Breton | ★★★ Gamified 3D world |
| Thibault Introvigne | ★★★ “Space Gamefolio” |
| Bilal El Moussaoui | ★★ Strong motion and 3D narrative |
| Siobhán Hardt | ★★ Colorful, character-driven 3D space |
| Michael Durkin | ★★ Immersive WebGL portfolio |
| Mike Fernandez | ★★ Interactive 3D developer introduction |
| Simon Tessier | ★★ Creative developer portfolio |
| Evan Provan | ★★ WebGL/Three.js narrative site |
| Maël Ruffini | ★★ Scene-based work showcase |
| Pierre Mouchan | ★★ Interactive creative-developer portfolio |
| Andrea Toffanello | ★★ Experimental Three.js personal site |
| Richard Ekwonye | ★★ Highly art-directed Three.js and animation portfolio |

## Scout Agent extraction contract

For every candidate, record:

1. Canonical live URL and source repository.
2. Navigation style: orbit, first-person, guided camera, teleport, portals.
3. Scene topology: monolithic model, room graph, streamed zones.
4. Content mapping: monitor, poster, shelf, trophy, timeline, character.
5. Interaction implementation: raycast, HTML overlay, CSS3D, physics trigger.
6. Lighting: realtime, baked lightmaps, environment maps, postprocessing.
7. Mobile strategy and accessible HTML fallback.
8. Loading strategy, model size, textures, LOD, compression and measured performance.
9. Comment or social interaction patterns.
10. Code license, asset licenses, attribution and redistribution restrictions.
11. Adoptable patterns and failure modes.
12. Evidence URL and audit date for every conclusion.

## Approved asset candidates

These sources state permissive CC0 terms. Every downloaded artifact still needs an asset manifest and content hash.

| Source | Use |
| --- | --- |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | 277 modular glTF components for rooms and corridors; CC0 |
| [Quaternius Ultimate Modular Sci-Fi Pack](https://quaternius.com/packs/ultimatemodularscifi.html) | Modular interiors and props; CC0 |
| [Kenney Modular Space Kit](https://opengameart.org/content/modular-space-kit) | Optimized modular rooms, corridors, doors and stairs with glTF files; CC0 |

## License gates

- **Approved:** standard compatible license and verified asset provenance.
- **Quarantined:** code is open source but bundled assets have not been audited.
- **Research only:** unknown, custom, noncommercial, or no-derivatives license.
- **Blocked:** provenance conflict or explicit restriction incompatible with ROOM.

Code licenses never automatically cover bundled 3D models, textures, fonts, music, games, or trademarks. Every production asset needs a source URL, license evidence, attribution text, content hash and human approval.
