import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const extension = "EXT_meshopt_compression";
const webp = "EXT_texture_webp";
const align = (size) => Math.ceil(size / 4) * 4;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function usesStandardSrgb(png) {
  for (let offset = 8; offset + 12 <= png.length; ) {
    if (png.toString("ascii", offset + 4, offset + 8) === "sRGB") return true;
    offset += png.readUInt32BE(offset) + 12;
  }
  return false;
}

async function packTextures(model, binary) {
  const replacements = new Map();
  const converted = new Set();
  const cache = new Map();
  const used = new Set(model.textures?.map(({ source }) => source));
  for (const [index, image] of (model.images ?? []).entries()) {
    if (image.mimeType !== "image/png" || !used.has(index)) continue;
    const view = model.bufferViews[image.bufferView];
    const offset = view.byteOffset ?? 0;
    const original = binary.subarray(offset, offset + view.byteLength);
    if (!usesStandardSrgb(original)) continue;
    const key = hash(original);
    if (!cache.has(key)) {
      const metadata = await sharp(original).metadata();
      // Leave profile-tagged, alpha, and high bit-depth sources in PNG.
      if (
        metadata.hasProfile ||
        metadata.hasAlpha ||
        metadata.depth !== "uchar" ||
        (metadata.orientation && metadata.orientation !== 1)
      ) {
        cache.set(key, undefined);
        continue;
      }
      const encoded = await sharp(original)
        .webp({ lossless: true, effort: 6 })
        .toBuffer();
      const unchanged =
        encoded.length < original.length &&
        (await sharp(encoded).raw().toBuffer()).equals(
          await sharp(original).raw().toBuffer(),
        );
      cache.set(key, unchanged ? encoded : undefined);
    }
    const replacement = cache.get(key);
    if (!replacement) continue;
    image.mimeType = "image/webp";
    replacements.set(image.bufferView, replacement);
    converted.add(index);
  }
  if (converted.size) {
    for (const texture of model.textures) {
      if (!converted.has(texture.source)) continue;
      texture.extensions ??= {};
      texture.extensions[webp] = { source: texture.source };
      delete texture.source;
    }
    model.extensionsUsed = [...(model.extensionsUsed ?? []), webp];
    model.extensionsRequired = [...(model.extensionsRequired ?? []), webp];
  }
  return replacements;
}

async function packGlb(source) {
  const jsonLength = source.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  const binary = source.subarray(jsonEnd + 8);
  if (
    source.toString("ascii", 0, 4) !== "glTF" ||
    source.readUInt32LE(4) !== 2 ||
    source.readUInt32LE(8) !== source.length ||
    source.toString("ascii", 16, 20) !== "JSON" ||
    source.toString("ascii", jsonEnd + 4, jsonEnd + 8) !== "BIN\0" ||
    source.readUInt32LE(jsonEnd) !== binary.length
  )
    throw new Error("Expected a glTF 2.0 file with one embedded binary chunk.");
  const model = JSON.parse(source.toString("utf8", 20, jsonEnd));
  if (model.buffers.length !== 1 || model.buffers[0].uri)
    throw new Error("Expected one embedded glTF buffer.");

  const accessors = Map.groupBy(
    model.accessors.filter(({ bufferView }) => bufferView !== undefined),
    ({ bufferView }) => bufferView,
  );
  const imageViews = new Set(model.images?.map(({ bufferView }) => bufferView));
  const packedImages = await packTextures(model, binary);
  const chunks = [];
  const positions = new Map();
  const encodedBuffers = new Map();
  let length = 0;
  let fallbackLength = 0;

  function append(bytes) {
    const key = hash(bytes);
    const previous = positions.get(key);
    if (previous?.bytes.equals(bytes)) return previous.offset;
    const offset = length;
    chunks.push(bytes, Buffer.alloc(align(bytes.length) - bytes.length));
    length += align(bytes.length);
    positions.set(key, { bytes, offset });
    return offset;
  }

  for (const [index, view] of model.bufferViews.entries()) {
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (
      view.buffer !== 0 ||
      start < 0 ||
      end > binary.length ||
      view.extensions
    )
      throw new Error("Unsupported buffer view in the input GLB.");
    const original = binary.subarray(start, end);
    const candidates = accessors.get(index);
    // A complete, tightly packed accessor supplies the exact storage stride.
    // Keep shared layouts and partial accessors unchanged.
    if (!imageViews.has(index) && candidates?.length === 1) {
      const { count, byteOffset, sparse } = candidates[0];
      const stride = view.byteStride ?? view.byteLength / count;
      const mode = view.target === 34963 ? "INDICES" : "ATTRIBUTES";
      const validStride =
        mode === "INDICES"
          ? stride === 2 || stride === 4
          : Number.isInteger(stride) &&
            stride > 0 &&
            stride <= 256 &&
            stride % 4 === 0;
      if (
        !byteOffset &&
        !sparse &&
        validStride &&
        stride * count === original.length
      ) {
        const key = `${mode}:${stride}:${hash(original)}`;
        let encoded = encodedBuffers.get(key);
        if (!encoded?.original.equals(original)) {
          const bytes = Buffer.from(
            MeshoptEncoder.encodeGltfBuffer(original, count, stride, mode),
          );
          encoded = { original, bytes };
          encodedBuffers.set(key, encoded);
        }
        // Keep small views raw when the extension metadata would cost more.
        if (encoded.bytes.length + 144 < original.length) {
          view.buffer = 1;
          view.byteOffset = fallbackLength;
          fallbackLength += align(original.length);
          view.extensions = {
            [extension]: {
              buffer: 0,
              byteOffset: append(encoded.bytes),
              byteLength: encoded.bytes.length,
              byteStride: stride,
              count,
              mode,
            },
          };
          continue;
        }
      }
    }
    const packedImage = packedImages.get(index);
    view.byteOffset = append(packedImage ?? original);
    if (packedImage) view.byteLength = packedImage.length;
  }
  model.buffers[0].byteLength = length;
  if (fallbackLength) {
    model.buffers.push({
      byteLength: fallbackLength,
      extensions: { [extension]: { fallback: true } },
    });
    model.extensionsUsed = [...(model.extensionsUsed ?? []), extension];
    model.extensionsRequired = [...(model.extensionsRequired ?? []), extension];
  }
  const metadata = Buffer.from(JSON.stringify(model));
  const paddedJson = align(metadata.length);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson + length, 8);
  header.writeUInt32LE(paddedJson, 12);
  header.write("JSON", 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(length);
  binHeader.write("BIN\0", 4);
  return Buffer.concat([
    header,
    metadata,
    Buffer.alloc(paddedJson - metadata.length, 32),
    binHeader,
    ...chunks,
  ]);
}

const [, , input, output] = process.argv;
const destination = resolve(output);
await MeshoptEncoder.ready;
const model = await packGlb(await readFile(input));
const directory = await mkdtemp(
  join(dirname(destination), "control-room-pack-"),
);
const suffixes = ["", ".gz", ".br"];
try {
  const files = [
    ["", model],
    [".gz", await promisify(gzip)(model)],
    [
      ".br",
      await promisify(brotliCompress)(model, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
      }),
    ],
  ];
  for (const [suffix, bytes] of files)
    await writeFile(join(directory, `room.glb${suffix}`), bytes);
  for (const [suffix] of files)
    await rename(join(directory, `room.glb${suffix}`), destination + suffix);
} finally {
  await Promise.all(
    suffixes.map((suffix) =>
      rm(join(directory, `room.glb${suffix}`), { force: true }),
    ),
  );
  await rmdir(directory);
}
