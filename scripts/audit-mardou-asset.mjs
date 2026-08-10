import { readFile } from "node:fs/promises";

const MODEL_PATH = new URL("../public/vendor/mardou/MardouMuseumResult.glb", import.meta.url);
const REQUIRED_NODE_NAMES = [
  "Floor",
  "Chrome",
  "Ceiling",
  "Walls",
  "Picture",
  "bix_eye_lower",
  "bix_body",
  "bix_eye_upper",
  "Bix_Hair",
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseGlb(buffer) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("invalid GLB magic");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("expected GLB 2.0");
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("GLB header length mismatch");

  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.toString("utf8", offset + 4, offset + 8);
    chunks.push({ byteLength, dataOffset: offset + 8, type });
    offset += 8 + byteLength;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === "JSON");
  const binaryChunk = chunks.find((chunk) => chunk.type === "BIN\0");
  if (!jsonChunk || !binaryChunk) throw new Error("GLB must contain JSON and BIN chunks");
  const json = JSON.parse(buffer.toString("utf8", jsonChunk.dataOffset, jsonChunk.dataOffset + jsonChunk.byteLength));
  return { binaryChunk, json };
}

const modelPath = option("--file") ?? MODEL_PATH;
const buffer = await readFile(modelPath);
const maxBytes = Number(option("--max-bytes") ?? Number.POSITIVE_INFINITY);
if (!Number.isFinite(maxBytes) && maxBytes !== Number.POSITIVE_INFINITY) throw new Error("--max-bytes must be numeric");
const { binaryChunk, json } = parseGlb(buffer);

const nodeNames = new Set((json.nodes ?? []).map((node) => node.name).filter(Boolean));
const missingNames = REQUIRED_NODE_NAMES.filter((name) => !nodeNames.has(name));
if (missingNames.length) throw new Error(`missing required nodes: ${missingNames.join(", ")}`);
if ((json.nodes?.length ?? 0) < 18) throw new Error("museum node count regressed");
if ((json.meshes?.length ?? 0) < 11) throw new Error("museum mesh count regressed");
if ((json.images?.length ?? 0) !== 6) throw new Error("museum embedded image count changed unexpectedly");
if (json.buffers?.[0]?.byteLength > binaryChunk.byteLength) throw new Error("declared binary buffer exceeds BIN chunk");

for (const [index, view] of (json.bufferViews ?? []).entries()) {
  const end = (view.byteOffset ?? 0) + view.byteLength;
  if (end > binaryChunk.byteLength) throw new Error(`bufferView ${index} exceeds BIN chunk`);
}

console.log(JSON.stringify({
  bytes: buffer.length,
  images: json.images.length,
  materials: json.materials?.length ?? 0,
  meshes: json.meshes.length,
  nodes: json.nodes.length,
  status: buffer.length <= maxBytes ? "pass" : "fail",
}, null, 2));

if (buffer.length > maxBytes) {
  throw new Error(`museum GLB is ${buffer.length} bytes; limit is ${maxBytes}`);
}
