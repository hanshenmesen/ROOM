# Vendored 3D assets

The MVP stores these files locally so the demo does not depend on a deployment or third-party CDN.

## Joan Ramos Refusta portfolio room

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
- Runtime adaptation: ROOM extracts individually named nodes such as `chair`, `table`, `lamp`, `radio`, and `globe`, normalizes each object independently, and places it in ROOM-owned coordinates. The upstream room shell and its original arrangement are never rendered.

## Three.js decoders

- Source: the repository's installed `three` package (`0.185.x`).
- License: MIT.
- Copied: browser runtime files required by `DRACOLoader`.

## Commercialization note

The current build is a local, non-commercial prototype. Before any commercial distribution, review upstream asset credits again and replace or separately clear any third-party material whose rights are not fully covered by the repository license.
