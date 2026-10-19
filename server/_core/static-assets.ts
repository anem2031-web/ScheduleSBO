import type { RequestHandler } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE = "no-cache";
const COMPRESSIBLE = /\.(?:js|mjs|css|html|svg|json|txt|webmanifest)$/i;

async function isRegularFile(filename: string) {
  try {
    return (await fs.stat(filename)).isFile();
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

/** Serve built assets, with compression done once at build time rather than on every request. */
export function createStaticAssetHandler(directory: string): RequestHandler {
  const root = path.resolve(directory);

  return async (req, res, next) => {
    try {
      // Unhandled API paths must never receive the application shell or public caching.
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        res.status(404).set("Cache-Control", "no-store").end();
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.status(405).set({ Allow: "GET, HEAD", "Cache-Control": "no-store" }).end();
        return;
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(req.path);
      } catch {
        res.status(400).set("Cache-Control", "no-store").end();
        return;
      }
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        res.status(404).set("Cache-Control", "no-store").end();
        return;
      }
      // Reject Windows separators, traversal, dotfiles and direct access to compressed sidecars.
      if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").some(part => part.startsWith(".")) || /\.(?:gz|br)$/i.test(pathname)) {
        res.status(404).set("Cache-Control", "no-store").end();
        return;
      }
      let relativePath = pathname.replace(/^\/+/, "");
      const absolutePath = path.resolve(root, relativePath);
      if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
        res.status(404).set("Cache-Control", "no-store").end();
        return;
      }

      if (!relativePath || !(await isRegularFile(absolutePath))) {
        // A missing chunk must be a real 404, so stale clients do not parse HTML as JavaScript.
        if (pathname.startsWith("/assets/") || path.posix.extname(pathname) || !req.accepts("html")) {
          res.status(404).set("Cache-Control", "no-store").end();
          return;
        }
        relativePath = "index.html";
        if (!(await isRegularFile(path.join(root, relativePath)))) {
          res.status(503).set("Cache-Control", "no-store").end();
          return;
        }
      }

      const compressed = COMPRESSIBLE.test(relativePath);
      const [hasBrotli, hasGzip] = compressed
        ? await Promise.all([isRegularFile(path.join(root, relativePath + ".br")), isRegularFile(path.join(root, relativePath + ".gz"))])
        : [false, false];
      const available = [...(hasBrotli ? ["br"] : []), ...(hasGzip ? ["gzip"] : []), "identity"];
      // Express delegates q values, wildcards and identity exclusions to its HTTP negotiator.
      const encoding = req.acceptsEncodings(...available);
      res.vary("Accept-Encoding");
      if (!encoding) {
        res.status(406).set("Cache-Control", "no-store").end();
        return;
      }

      const immutable = /^assets\/(?:.*\/)?[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(relativePath.replace(/\\/g, "/"));
      res.set("Cache-Control", immutable ? IMMUTABLE_CACHE : REVALIDATE_CACHE);
      res.type(path.extname(relativePath));
      if (encoding !== "identity") res.set("Content-Encoding", encoding);
      const filename = relativePath + (encoding === "br" ? ".br" : encoding === "gzip" ? ".gz" : "");
      // sendFile retains conditional GET, per-representation validators and HEAD semantics.
      // A range applies to the identity representation; compressed files are returned whole.
      res.sendFile(filename, {
        root,
        dotfiles: "deny",
        cacheControl: false,
        acceptRanges: encoding === "identity",
      }, error => {
        if (error) next(error);
      });
    } catch (error) {
      next(error);
    }
  };
}
