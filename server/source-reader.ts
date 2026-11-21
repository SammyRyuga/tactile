import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { convert } from "html-to-text";
import ipaddr from "ipaddr.js";

const byteLimit = 320_000;
const globalIPv6 = ipaddr.IPv6.parse("2000::");

function isPublic(value: string) {
  const address = ipaddr.parse(value);
  return (
    address.range() === "unicast" &&
    (address instanceof ipaddr.IPv4 || address.match(globalIPv6, 3))
  );
}

export async function readSource(
  raw: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".")
  )
    return;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const text = await new Promise<string | undefined>((resolve) => {
    const req = request(
      url,
      {
        signal: deadline,
        agent: false,
        lookup(hostname, options, callback) {
          // Return only the address we validated, preventing a second DNS lookup
          // between the policy check and the TLS connection.
          void lookup(hostname, { all: true })
            .then((records) => {
              const pinned = records[0];
              if (
                !pinned ||
                records.some(({ address }) => !isPublic(address))
              ) {
                callback(
                  Object.assign(new Error("Source address blocked"), {
                    code: "EHOSTUNREACH",
                  }),
                  "",
                  0,
                );
                return;
              }
              if (options.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            })
            .catch((error: NodeJS.ErrnoException) => callback(error, "", 0));
        },
        headers: {
          Accept: "text/html, text/plain",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const type = response.headers["content-type"]?.toLowerCase() ?? "";
        if (
          response.statusCode !== 200 ||
          !/^text\/(?:html|plain)(?:;|$)/.test(type) ||
          (response.headers["content-encoding"] ?? "identity") !== "identity"
        ) {
          response.destroy();
          resolve(undefined);
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("error", () => resolve(undefined));
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > byteLimit) {
            response.destroy();
            resolve(undefined);
          } else {
            chunks.push(chunk);
          }
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(
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
                      ].map((selector) => ({ selector, format: "skip" })),
                    ],
                  }),
            );
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    req.on("error", () => resolve(undefined));
    req.end();
  });
  return text?.trim() || undefined;
}

export function sourceExcerpt(text: string, claim: string) {
  const words = new Set(claim.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? []);
  const normalized = text.replace(/\s+/g, " ").trim();
  let best = "";
  let bestScore = -1;
  for (let offset = 0; offset < normalized.length; offset += 850) {
    const passage = normalized.slice(offset, offset + 1350);
    const terms = new Set(passage.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? []);
    const score = [...words].filter((word) => terms.has(word)).length;
    if (score > bestScore) {
      best = passage;
      bestScore = score;
    }
  }
  return best;
}
