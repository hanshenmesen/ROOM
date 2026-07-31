# The Mardou Museum coordinate picker

Double-click `start-server.command`, or run it from Terminal, then open
`http://localhost:8082`.

Controls: drag to orbit, right-drag to pan, use the wheel to zoom, and
left-click a surface to record its XYZ coordinate. Individual points can be
copied, or all sampled points can be copied as JSON.

The supplied GLB is a self-contained BluffTitler export with 18 nodes, 11
meshes, 8 materials, and embedded textures. Its authored bounds are roughly
104.6 x 35.0 x 200.0 arbitrary units, centered near `(0, 0, -500)`; the
picker derives camera limits and marker scale from those bounds at runtime.

The model must be served over HTTP. Opening `index.html` directly through a
`file://` URL will prevent the browser from fetching the GLB.

The application-space placement registry now lives in
`../../components/MardouMuseumLayout.ts`. The accompanying
`../../scripts/audit-mardou-layout.mjs` raycasts against the same GLB and
fails when an authored camera, route, frame, or pedestal has no supporting
floor or less than 1.2 units of structural clearance. The facade scan also
identifies `x=2` as the clear entrance line; the former `x=0` route intersects
the curved wall.
