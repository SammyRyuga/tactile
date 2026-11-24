import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { resolve } from "node:path";
import {
  roomAssetBuild,
  roomAssetFilename,
  roomAssetSource,
  roomAttributionFilename,
} from "../shared/operator-room-asset.ts";

export function operatorRoomAssets(dev: boolean) {
  const router = Router({ caseSensitive: true, strict: true });
  const root = resolve(dev ? roomAssetSource : roomAssetBuild);
  const model = dev ? "control-room.glb" : roomAssetFilename;
  const limitAssets = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.use((_request, response, next) => {
    response.set("Cross-Origin-Resource-Policy", "same-origin");
    next();
  });
  router.get(
    `/${roomAssetFilename}`,
    limitAssets,
    (request, response, next) => {
      response.vary("Accept-Encoding");
      const encoding = request.acceptsEncodings(
        dev || request.headers.range || !request.headers["accept-encoding"]
          ? ["identity"]
          : ["br", "gzip", "identity"],
      );
      if (!encoding) {
        response.sendStatus(406);
        return;
      }
      response.type("model/gltf-binary");
      const suffix =
        encoding === "identity" ? "" : encoding === "gzip" ? ".gz" : ".br";
      if (suffix) response.set("Content-Encoding", encoding);
      response.sendFile(
        model + suffix,
        {
          root,
          acceptRanges: !suffix,
          immutable: !dev,
          maxAge: dev ? 0 : "1y",
        },
        (error) => {
          if (!error || response.destroyed) return;
          if (!response.headersSent) response.removeHeader("Content-Encoding");
          next(error);
        },
      );
    },
  );
  router.get(
    `/${roomAttributionFilename}`,
    limitAssets,
    (_request, response) => {
      response.type("text/plain").sendFile(roomAttributionFilename, { root });
    },
  );
  router.use((_request, response) => {
    response.sendStatus(404);
  });
  return router;
}
