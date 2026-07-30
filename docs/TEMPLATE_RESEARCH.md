# Template and asset research

This catalog gives the Template Scout Agent an initial reference set. A reference entry is not automatically reusable. Code and assets enter production only after a license and provenance audit.

## Room portfolio references

| Reference | Useful pattern | Current reuse status |
| --- | --- | --- |
| [AT010303/Room_Portfolio](https://github.com/AT010303/Room_Portfolio) | React Three Fiber room with many clickable objects, theme switching, embedded games and media | Reference only; license must be verified |
| [maxime-mrl/3D-room-portofolio](https://github.com/maxime-mrl/3D-room-portofolio) | Vanilla Three.js + Blender room, object hover/click interactions | MIT reported by GitHub; verify asset provenance separately |
| [jrefusta/joan-portfolio](https://github.com/jrefusta/joan-portfolio) | Detailed room, CSS3D screens, baked lighting, shader-based props and games | Reference only pending license audit |
| [BeyramTaglietti/beyram.dev](https://github.com/BeyramTaglietti/beyram.dev) | Compact Blender/R3F room and monitor-focused interaction | Reference only pending license audit |
| [ItO210/3d-portfolio-website](https://github.com/ItO210/3d-portfolio-website) | Room portfolio implementation and HTML/3D integration experiments | Reference only pending license audit |
| [Bruno Simon portfolio](https://bruno-simon.com/) | Interaction onboarding, device controls, quality settings, guided discovery and recovery | Architectural inspiration; verify each source/asset license |
| [Third Room](https://thirdroom.io/docs/guides/developers.html) | Larger virtual-world architecture, glTF scenes, interactions, collisions and extensibility | Architecture reference; audit repository license before reuse |

## What the Scout Agent should extract

For every candidate:

1. Navigation style: orbit, first-person, guided camera, teleport, portals.
2. Scene topology: monolithic model, room graph, streamed zones.
3. Content mapping: monitor, poster, shelf, trophy, timeline, character.
4. Interaction implementation: raycast, HTML overlay, CSS3D, physics trigger.
5. Lighting: realtime, baked lightmaps, environment maps, postprocessing.
6. Mobile strategy and accessibility fallback.
7. Loading strategy, model size, texture size, LOD and compression.
8. Comment or social interaction patterns.
9. Source license, asset license, attribution, and redistribution restrictions.
10. Ideas worth adopting and failure modes to avoid.

## Approved asset candidates

These are promising because their source pages state permissive CC0 terms, but each downloaded artifact still needs a manifest entry and checksum.

| Source | Use |
| --- | --- |
| [Quaternius Modular Sci-Fi Megakit](https://quaternius.com/packs/modularscifimegakit.html) | 277 modular glTF components for rooms and corridors; CC0 |
| [Quaternius Ultimate Modular Sci-Fi Pack](https://quaternius.com/packs/ultimatemodularscifi.html) | Modular interiors and props; CC0 |
| [Kenney Modular Space Kit](https://opengameart.org/content/modular-space-kit) | Optimized modular rooms, corridors, doors and stairs with glTF files; CC0 |

## License gates

- Unknown license: research and screenshots only.
- Copyleft code: may inform architecture, but cannot be copied until project licensing is decided.
- Code license does not automatically cover bundled 3D models, textures, fonts, or music.
- Every accepted asset needs a source URL, license snapshot, attribution text, and content hash.
- Generated assets must retain generation metadata and human approval.
