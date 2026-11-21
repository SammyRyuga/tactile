import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { convert } from "html-to-text";
import ipaddr from "ipaddr.js";

const byteLimit = 320_000;
const transferLimit = 1_000_000;
const redirectLimit = 3;
const globalIPv6 = ipaddr.IPv6.parse("2000::");

export type SourceRead = {
  text?: string;
  status?: number;
  reason?: string;
  truncated?: boolean;
};
type FetchResult = SourceRead & { redirect?: string };

function publicAddress(value: string) {
  const address = ipaddr.parse(value);
  return (
    address.range() === "unicast" &&
    (address instanceof ipaddr.IPv4 || address.match(globalIPv6, 3))
  );
}

function validUrl(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    !ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) &&
    url.hostname.includes(".")
  );
}

function fetchPage(url: URL, signal: AbortSignal): Promise<FetchResult> {
  return new Promise((resolve) => {
    const req = request(
      url,
      {
        signal,
        agent: false,
        lookup(hostname, options, callback) {
          // Pin the address so the TLS connection cannot re-resolve the name.
          void lookup(hostname, { all: true })
            .then((records) => {
              const pinned = records[0];
              if (
                !pinned ||
                records.some(({ address }) => !publicAddress(address))
              ) {
                callback(
                  Object.assign(new Error("Source address blocked"), {
                    code: "EACCESSPOLICY",
                  }),
                  "",
                  0,
                );
              } else if (options.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            })
            .catch((error: NodeJS.ErrnoException) => callback(error, "", 0));
        },
        headers: {
          Accept: "text/html, text/plain",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const status = response.statusCode;
        const type = response.headers["content-type"]?.toLowerCase() ?? "";
        const encoding =
          response.headers["content-encoding"]?.toLowerCase() ?? "identity";
        const redirect = response.headers.location;
        if (status && [301, 302, 303, 307, 308].includes(status) && redirect) {
          resolve({ status, redirect });
          response.destroy();
          return;
        }
        if (status !== 200 || !/^text\/(?:html|plain)(?:;|$)/.test(type)) {
          resolve({
            status,
            reason:
              status !== 200 ? "HTTP response" : "Unsupported content type",
          });
          response.destroy();
          return;
        }
        const decoders = {
          gzip: createGunzip,
          deflate: createInflate,
          br: createBrotliDecompress,
        };
        const decoder = Object.hasOwn(decoders, encoding)
          ? decoders[encoding as keyof typeof decoders]()
          : undefined;
        if (!decoder && encoding !== "identity") {
          resolve({ status, reason: "Unsupported content encoding" });
          response.destroy();
          return;
        }
        const decoded = decoder ? response.pipe(decoder) : response;
        const chunks: Buffer[] = [];
        let bytes = 0;
        let transferred = 0;
        let finished = false;
        function finish(truncated: boolean) {
          if (finished) return;
          finished = true;
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const text = (
              type.startsWith("text/plain")
                ? body
                : convert(body, {
                    wordwrap: false,
                    selectors: [
                      { selector: "a", options: { ignoreHref: true } },
                      ...[
                        "script",
                        "style",
                        "nav",
                        "header",
                        "footer",
                        "img",
                        "noscript",
                        "[hidden]",
                      ].map((selector) => ({ selector, format: "skip" })),
                    ],
                  })
            ).trim();
            resolve(
              text
                ? { status, text, truncated }
                : { status, reason: "No static page text", truncated },
            );
          } catch {
            resolve({ status, reason: "Page parsing failed", truncated });
          }
          if (truncated) {
            decoded.destroy();
            response.destroy();
          }
        }
        response.on("data", (chunk: Buffer) => {
          transferred += chunk.length;
          if (transferred > transferLimit) finish(true);
        });
        function streamFailed() {
          resolve({
            status,
            reason: signal.aborted
              ? "Request timed out or was canceled"
              : "Response body interrupted",
          });
          decoder?.destroy();
        }
        response.on("error", streamFailed);
        decoder?.on("error", () => {
          resolve({ status, reason: "Compressed body could not be read" });
          response.destroy();
        });
        decoded.on("data", (chunk: Buffer) => {
          if (finished) return;
          const remaining = byteLimit - bytes;
          chunks.push(chunk.subarray(0, remaining));
          bytes += Math.min(chunk.length, remaining);
          if (chunk.length > remaining) finish(true);
        });
        decoded.on("end", () => finish(false));
      },
    );
    req.on("error", (error: NodeJS.ErrnoException) =>
      resolve({
        reason:
          error.code === "EACCESSPOLICY"
            ? "Non-public address blocked"
            : signal.aborted
              ? "Request timed out or was canceled"
              : "Network request failed",
      }),
    );
    req.end();
  });
}

export async function readSource(
  raw: string,
  signal: AbortSignal,
): Promise<SourceRead> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(7000)]);
  let current = raw;
  let previous: URL | undefined;
  let redirectStatus: number | undefined;
  for (let redirects = 0; redirects <= redirectLimit; redirects++) {
    const url: URL | null = URL.parse(current, previous?.href);
    if (!url || !validUrl(url))
      return { status: redirectStatus, reason: "URL blocked by source policy" };
    const result = await fetchPage(url, deadline);
    if (!result.redirect) return result;
    current = result.redirect;
    previous = url;
    redirectStatus = result.status;
  }
  return { status: redirectStatus, reason: "Too many redirects" };
}

function terms(text: string) {
  return new Set(text.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? []);
}

export function sourceExcerpt(text: string, claim: string, citedText = "") {
  const words = terms(claim);
  const citation = citedText.replace(/\s+/g, " ").trim();
  const normalized = text.replace(/\s+/g, " ").trim();
  const exact =
    citation.length >= 24
      ? normalized.toLowerCase().indexOf(citation.toLowerCase())
      : -1;
  if (exact >= 0) {
    const start = Math.max(0, exact - 300);
    return normalized.slice(start, start + 1350);
  }
  const citationWords = terms(citation);
  let best = "";
  let bestScore = -1;
  for (let offset = 0; offset < normalized.length; offset += 850) {
    const passage = normalized.slice(offset, offset + 1350);
    const available = terms(passage);
    const score =
      [...words].filter((word) => available.has(word)).length +
      2 * [...citationWords].filter((word) => available.has(word)).length;
    if (score > bestScore) {
      best = passage;
      bestScore = score;
    }
  }
  return best;
}
