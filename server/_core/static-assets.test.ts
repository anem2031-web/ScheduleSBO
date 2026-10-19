import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { request } from "node:http";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { createStaticAssetHandler } from "./static-assets";

const asset = "/assets/index-AbCd1234.js";
const script = 'console.log("complete build contents");\n'.repeat(200);
const html = "<!DOCTYPE html><html><body>Application shell</body></html>".repeat(50);
let directory: string;
let server: Server;
let port: number;

function get(url: string, headers: Record<string, string> = {}, method = "GET") {
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: url, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "workforce-static-"));
  await fs.mkdir(path.join(directory, "assets"));
  await fs.writeFile(path.join(directory, asset.slice(1)), script);
  await fs.writeFile(path.join(directory, "index.html"), html);
  await fs.writeFile(path.join(directory, "plain.js"), "small");
  await fs.writeFile(path.join(directory, "assets/font-AbCd1234.woff2"), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(directory, ".secret"), "private");
  const { precompressAssets } = await import("../../scripts/precompress-assets.mjs");
  await precompressAssets(directory);
  const app = express();
  app.use(createStaticAssetHandler(directory));
  server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  port = (server.address() as import("node:net").AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await fs.rm(directory, { recursive: true, force: true });
});

describe("production asset delivery", () => {
  it("precompresses real text only and preserves source files", async () => {
    expect(await fs.readFile(path.join(directory, asset.slice(1)), "utf8")).toBe(script);
    expect(await fs.stat(path.join(directory, asset.slice(1) + ".br")).then(s => s.size)).toBeLessThan(Buffer.byteLength(script));
    await expect(fs.stat(path.join(directory, "plain.js.br"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(directory, "assets/font-AbCd1234.woff2.br"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("negotiates Brotli and preserves JavaScript MIME and immutable cache", async () => {
    const response = await get(asset, { "Accept-Encoding": "br, gzip" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("br");
    expect(response.headers["content-type"]).toMatch(/javascript/);
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers.vary).toContain("Accept-Encoding");
    expect(brotliDecompressSync(response.body).toString()).toBe(script);
    expect(Number(response.headers["content-length"])).toBe(response.body.length);
  });

  it("serves gzip to clients that do not support Brotli", async () => {
    const response = await get(asset + "?version=old", { "Accept-Encoding": "gzip" });
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(response.body).toString()).toBe(script);
  });

  it("uses quality values and never sends an explicitly forbidden encoding", async () => {
    const response = await get(asset, { "Accept-Encoding": "br;q=0,gzip;q=1,identity;q=0" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    const preferred = await get(asset, { "Accept-Encoding": "br;q=0.5,gzip;q=0.9,identity;q=0" });
    expect(preferred.headers["content-encoding"]).toBe("gzip");
  });

  it("supports wildcard negotiation with an explicit Brotli exclusion", async () => {
    const response = await get(asset, { "Accept-Encoding": "br;q=0,*;q=1,identity;q=0" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
  });

  it("falls back to identity when the header is missing or compression excluded", async () => {
    for (const headers of [{}, { "Accept-Encoding": "br;q=0,gzip;q=0" }]) {
      const response = await get(asset, headers);
      expect(response.status).toBe(200);
      expect(response.headers["content-encoding"]).toBeUndefined();
      expect(response.body.toString()).toBe(script);
    }
  });

  it("returns 406 when no available representation is allowed", async () => {
    const response = await get(asset, { "Accept-Encoding": "br;q=0,gzip;q=0,identity;q=0" });
    expect(response.status).toBe(406);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await get("/plain.js", { "Accept-Encoding": "gzip,identity;q=0" })).status).toBe(406);
  });

  it("supports HEAD and conditional requests for the selected representation", async () => {
    const first = await get(asset, { "Accept-Encoding": "br" });
    const head = await get(asset, { "Accept-Encoding": "br" }, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers["content-length"]).toBe(first.headers["content-length"]);
    expect(head.headers.etag).toBe(first.headers.etag);
    const unchanged = await get(asset, { "Accept-Encoding": "br", "If-None-Match": first.headers.etag! });
    expect(unchanged.status).toBe(304);
    expect(unchanged.body.length).toBe(0);
    expect(unchanged.headers["cache-control"]).toContain("immutable");
    const modified = await get(asset, { "Accept-Encoding": "br", "If-Modified-Since": first.headers["last-modified"]! });
    expect(modified.status).toBe(304);
    const identity = await get(asset);
    expect(identity.headers.etag).not.toBe(first.headers.etag);
  });

  it("serves ranges safely without returning truncated compressed streams", async () => {
    const plain = await get(asset, { Range: "bytes=0-6" });
    expect(plain.status).toBe(206);
    expect(plain.body.toString()).toBe(script.slice(0, 7));
    const compressed = await get(asset, { Range: "bytes=0-6", "Accept-Encoding": "br" });
    expect(compressed.status).toBe(200);
    expect(brotliDecompressSync(compressed.body).toString()).toBe(script);
    expect(compressed.headers["content-range"]).toBeUndefined();
  });

  it("revalidates the app shell and unhashed assets rather than caching them indefinitely", async () => {
    for (const url of ["/", "/login", "/schedules?week=2026-10-17", "/index.html"]) {
      const response = await get(url, { "Accept-Encoding": "gzip", Accept: "text/html" });
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["content-type"]).toMatch(/text\/html/);
      expect(gunzipSync(response.body).toString()).toBe(html);
    }
    expect((await get("/plain.js")).headers["cache-control"]).toBe("no-cache");
  });

  it("keeps missing chunks, API routes, sidecars and private paths out of the SPA fallback", async () => {
    for (const url of ["/assets/missing.js", "/assets/missing", "/missing.css", "/api/unknown", "/api%2Funknown", asset + ".gz", "/.secret", "/%2e%2e/secret", "/%5Csecret", "/%00"]) {
      const response = await get(url);
      expect(response.status, url).toBe(404);
      expect(response.headers["cache-control"], url).toBe("no-store");
      expect(response.body.toString(), url).not.toContain("Application shell");
    }
    expect((await get("/route", { Accept: "application/json" })).status).toBe(404);
    expect((await get("/%broken")).status).toBe(400);
  });

  it("does not serve HTML for mutation methods", async () => {
    expect((await get("/schedules", {}, "POST")).status).toBe(405);
    expect((await get("/api/unknown", {}, "POST")).status).toBe(404);
  });
});
