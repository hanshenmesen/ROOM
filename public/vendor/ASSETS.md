# Vendored 3D assets

The MVP stores these files locally so the demo does not depend on a deployment or third-party CDN.

## Mardou Museum

- Source: project-owner supplied archive at `/Users/zhanghanshuo/buildathon_1/the-mardou-museum.zip`.
- Copied: only the original `MardouMuseumResult.glb`; duplicate external PNG exports are excluded because the GLB already embeds its materials.
- Runtime adaptation: ROOM treats the GLB as a read-only museum shell, hides the sample Picture and Bix nodes, and overlays only ROOM-owned geometry and interactions.
- Rights: owner-supplied asset; provenance and commercial permissions must be confirmed before distribution. See `mardou/README.md`.

## Joan Ramos Refusta environment map

- Source: https://github.com/jrefusta/joan-portfolio
- Pinned commit: `081030cf5fa0f43e39e7d727789f138d704a211c`
- License: MIT; the upstream license is preserved at `joan/LICENSE`.
- Copied: only the six environment-map faces used by the renderer.
- Runtime adaptation: the current two-room demo uses the cube environment map for reflections and does not ship or load Joan's room meshes.

## Maxime Morel 3D room portfolio

- Source: https://github.com/maxime-mrl/3D-room-portofolio
- Pinned commit: `43536e14e7997708dd11bb0b8413e1337f9588ac`
- License: MIT; the upstream license is preserved at `maxime/LICENSE.txt`.
- Copied: `scene-final.gltf`, including its embedded geometry and materials.
- Runtime adaptation: ROOM extracts only individually named display-support nodes such as `table`, `screen`, `desk lamp`, `shelve`, `book`, and `letter`, normalizes each independently, and places it in ROOM-owned coordinates. Decorative furniture without an information role, the upstream room shell, and the original arrangement are never rendered.

## Bruno Simon Folio 2025

- Source: https://github.com/brunosimon/folio-2025
- Pinned commit: `41046b57eeed8d156d9c3fd7fa259900baef7816`.
- License: MIT; the upstream license is preserved at `bruno/LICENSE.md`.
- Copied: only the standalone `benches.glb` and `lanterns.glb` prop files.
- Runtime adaptation: ROOM extracts one named `benchPhysicalDynamic` node for the visitor-message corner and individual `lantern` nodes for the central project display. Bruno's terrain, areas, vehicle, physics, shaders, and complete world are not loaded.

## Three.js decoders

- Source: the repository's installed `three` package (`0.185.x`).
- License: MIT.
- Copied: browser runtime files required by `DRACOLoader`.

## Commercialization note

The current build is a local, non-commercial prototype. Before any commercial distribution, review upstream asset credits again and replace or separately clear any third-party material whose rights are not fully covered by the repository license.
