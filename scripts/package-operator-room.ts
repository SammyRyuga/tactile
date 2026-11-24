import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { constants, createBrotliCompress, createGzip } from "node:zlib";
import {
  roomAssetBuild,
  roomAssetBytes,
  roomAssetFilename,
  roomAssetSha256,
  roomAssetSource,
  roomAttributionFilename,
} from "../shared/operator-room-asset.ts";

const source = join(roomAssetSource, "control-room.glb");
const hash = createHash("sha256");
for await (const chunk of createReadStream(source)) hash.update(chunk);
if (
  (await stat(source)).size !== roomAssetBytes ||
  hash.digest("hex") !== roomAssetSha256
) {
  throw new Error("Operator Room GLB does not match the approved asset.");
}

await mkdir(roomAssetBuild, { recursive: true });
const destination = join(roomAssetBuild, roomAssetFilename);
await copyFile(source, destination);
await copyFile(
  join(roomAssetSource, roomAttributionFilename),
  join(roomAssetBuild, roomAttributionFilename),
);
await pipeline(
  createReadStream(destination),
  createGzip({ level: 6 }),
  createWriteStream(destination + ".gz"),
);
await pipeline(
  createReadStream(destination),
  createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 5,
      [constants.BROTLI_PARAM_SIZE_HINT]: roomAssetBytes,
    },
  }),
  createWriteStream(destination + ".br"),
);
console.log(`Packaged Operator Room ${roomAssetFilename}`);
