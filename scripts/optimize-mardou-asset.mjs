import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INPUT_PATH = new URL("../public/vendor/mardou/MardouMuseumResult.glb", import.meta.url);
const outputArgument = process.argv[2];
if (!outputArgument) throw new Error("usage: node scripts/optimize-mardou-asset.mjs <output.glb>");

function parseGlb(buffer) {
  if (buffer.toString("utf8", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error("expected a GLB 2.0 source asset");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  const binaryHeaderOffset = 20 + jsonLength;
  const binaryLength = buffer.readUInt32LE(binaryHeaderOffset);
  const binaryOffset = binaryHeaderOffset + 8;
  return { binary: buffer.subarray(binaryOffset, binaryOffset + binaryLength), json };
}

function padded(buffer, fill = 0) {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, fill)]) : buffer;
}

function buildGlb(json, binary) {
  const jsonChunk = padded(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryChunk = padded(binary);
  const result = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  result.write("glTF", 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonChunk.length, 12);
  result.write("JSON", 16);
  jsonChunk.copy(result, 20);
  const binaryHeaderOffset = 20 + jsonChunk.length;
  result.writeUInt32LE(binaryChunk.length, binaryHeaderOffset);
  result.write("BIN\0", binaryHeaderOffset + 4);
  binaryChunk.copy(result, binaryHeaderOffset + 8);
  return result;
}

function runSips(args) {
  execFileSync("sips", args, { stdio: "ignore" });
}

const source = await readFile(INPUT_PATH);
const { binary, json } = parseGlb(source);
const alreadyOptimized = source.length <= 20 * 1024 * 1024
  && json.images?.[0]?.mimeType === "image/jpeg"
  && json.images?.[3]?.mimeType === "image/jpeg";
if (alreadyOptimized) {
  await writeFile(outputArgument, source);
  console.log(`Mardou asset is already optimized (${source.length} bytes).`);
  process.exit(0);
}
const workingDirectory = await mkdtemp(join(tmpdir(), "room-mardou-"));

try {
  const replacements = new Map();
  for (const imageIndex of [0, 3, 4]) {
    const image = json.images[imageIndex];
    const view = json.bufferViews[image.bufferView];
    const inputPath = join(workingDirectory, `${imageIndex}.png`);
    await writeFile(inputPath, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));

    if (imageIndex === 0) {
      const outputPath = join(workingDirectory, `${imageIndex}.jpg`);
      runSips(["-s", "format", "jpeg", "-s", "formatOptions", "86", inputPath, "--out", outputPath]);
      replacements.set(imageIndex, { bytes: await readFile(outputPath), mimeType: "image/jpeg" });
      continue;
    }

    const resizedPath = join(workingDirectory, `${imageIndex}-1024.png`);
    runSips(["--resampleWidth", "1024", inputPath, "--out", resizedPath]);
    if (imageIndex === 3) {
      const outputPath = join(workingDirectory, `${imageIndex}.jpg`);
      runSips(["-s", "format", "jpeg", "-s", "formatOptions", "84", resizedPath, "--out", outputPath]);
      replacements.set(imageIndex, { bytes: await readFile(outputPath), mimeType: "image/jpeg" });
    } else {
      replacements.set(imageIndex, { bytes: await readFile(resizedPath), mimeType: "image/png" });
    }
  }

  const imageByBufferView = new Map(json.images.map((image, index) => [image.bufferView, index]));
  const binaryParts = [];
  let binaryLength = 0;
  json.bufferViews.forEach((view, viewIndex) => {
    const imageIndex = imageByBufferView.get(viewIndex);
    const replacement = imageIndex === undefined ? undefined : replacements.get(imageIndex);
    const bytes = replacement?.bytes
      ?? binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const alignedOffset = Math.ceil(binaryLength / 4) * 4;
    if (alignedOffset > binaryLength) binaryParts.push(Buffer.alloc(alignedOffset - binaryLength));
    view.byteOffset = alignedOffset;
    view.byteLength = bytes.length;
    binaryParts.push(bytes);
    binaryLength = alignedOffset + bytes.length;
    if (replacement) json.images[imageIndex].mimeType = replacement.mimeType;
  });

  const optimizedBinary = Buffer.concat(binaryParts);
  json.buffers[0].byteLength = optimizedBinary.length;
  await writeFile(outputArgument, buildGlb(json, optimizedBinary));
} finally {
  await rm(workingDirectory, { force: true, recursive: true });
}
