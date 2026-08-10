#!/bin/bash
# Double-click this file to launch a local server and open the demo.
# (Needed because browsers block loading the .glb file directly from file://.)
cd "$(dirname "$0")"
PORT=8082
echo "Starting local server at http://localhost:$PORT ..."
open "http://localhost:$PORT" 2>/dev/null || true
python3 -m http.server $PORT
