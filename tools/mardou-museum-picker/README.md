# The Mardou Museum coordinate picker

Double-click `start-server.command`, or run it from Terminal, then open
`http://localhost:8082`.

Controls: click the canvas to enter Pointer Lock, use W/A/S/D or the arrow
keys to move, move the mouse for unrestricted 360°/180° first-person look,
Space/Shift to rise or descend, and left-click to record the surface under
the center crosshair. Press Esc to release the pointer; Delete/Backspace
removes the latest sample. Individual points can be copied, or all sampled
points can be copied as JSON.

The supplied GLB is a self-contained BluffTitler export with 18 nodes, 11
meshes, 8 materials, and embedded textures. Its authored bounds are roughly
104.6 x 35.0 x 200.0 arbitrary units, centered near `(0, 0, -500)`; the
picker derives camera limits and marker scale from those bounds at runtime.
It also raycasts a camera-radius probe against the architectural meshes so
walking stops at walls and can slide along them instead of relying only on
the model's outer bounding box. `Picture_1` is retained but hidden by
default because it overlaps the primary `Picture` node.

The model must be served over HTTP. Opening `index.html` directly through a
`file://` URL will prevent the browser from fetching the GLB.

The application-space placement registry now lives in
`../../components/MardouMuseumLayout.ts`. The accompanying
`../../scripts/audit-mardou-layout.mjs` raycasts against the same GLB and
fails when an authored camera, route, frame, or pedestal has no supporting
floor or less than 1.2 units of structural clearance. The facade scan also
identifies `x=2` as the clear entrance line; the former `x=0` route intersects
the curved wall.
