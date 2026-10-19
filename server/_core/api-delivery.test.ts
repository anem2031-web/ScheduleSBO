import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request } from "node:http";
import type { Server } from "node:http";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { createApiDeliveryMiddleware } from "./api-delivery";

const payload = { workers: Array.from({ length: 400 }, (_, index) => ({ id: index, name: "عامل تجريبي", hours: 9, notes: "scheduled" })) };
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
  const app = express();
  app.use("/api", createApiDeliveryMiddleware());
  app.get("/api/workers", (_req, res) => res.json(payload));
  app.get("/api/error", (_req, res) => res.status(403).cookie("session", "retained", { httpOnly: true }).json({ error: "forbidden", detail: "permission".repeat(1000) }));
  app.get("/api/empty", (_req, res) => res.status(204).end());
  app.get("/api/events", (_req, res) => res.type("text/event-stream").end("data: " + "event".repeat(1000) + "\n\n"));
  app.get("/api/stream", (_req, res) => {
    res.type("application/json");
    res.write('{"workers":');
    res.write(JSON.stringify(payload.workers));
    res.end("}");
  });
  app.get("/asset", (_req, res) => res.type("text/plain").end("outside API"));
  server = await new Promise(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  port = (server.address() as import("node:net").AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

describe("private API compression", () => {
  it("compresses large JSON and prevents caching private worker data", async () => {
    const response = await get("/api/workers", { "Accept-Encoding": "gzip" });
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers.vary).toContain("Accept-Encoding");
    expect(JSON.parse(gunzipSync(response.body).toString())).toEqual(payload);
    expect(response.body.length).toBeLessThan(Buffer.byteLength(JSON.stringify(payload)) / 4);
  });

  it("negotiates Brotli and identity without changing JSON", async () => {
    const br = await get("/api/workers", { "Accept-Encoding": "br, gzip" });
    expect(br.headers["content-encoding"]).toBe("br");
    expect(JSON.parse(brotliDecompressSync(br.body).toString())).toEqual(payload);
    const plain = await get("/api/workers", { "Accept-Encoding": "identity" });
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(JSON.parse(plain.body.toString())).toEqual(payload);
  });

  it("preserves errors, authentication cookies and HEAD", async () => {
    const error = await get("/api/error", { "Accept-Encoding": "gzip" });
    expect(error.status).toBe(403);
    expect(error.headers["set-cookie"]?.[0]).toContain("session=retained");
    expect(error.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(JSON.parse(gunzipSync(error.body).toString()).error).toBe("forbidden");
    const head = await get("/api/workers", { "Accept-Encoding": "gzip" }, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers["cache-control"]).toBe("private, no-store");
  });

  it("leaves 204 and server-sent event streams uncompressed", async () => {
    const empty = await get("/api/empty", { "Accept-Encoding": "gzip" });
    expect(empty.status).toBe(204);
    expect(empty.body.length).toBe(0);
    expect(empty.headers["content-encoding"]).toBeUndefined();
    const events = await get("/api/events", { "Accept-Encoding": "gzip" });
    expect(events.headers["content-encoding"]).toBeUndefined();
    expect(events.body.toString()).toMatch(/^data: event/);
  });

  it("supports ordinary chunked JSON streams and leaves non-API routes unchanged", async () => {
    const stream = await get("/api/stream", { "Accept-Encoding": "gzip" });
    expect(JSON.parse(gunzipSync(stream.body).toString())).toEqual(payload);
    const outside = await get("/asset", { "Accept-Encoding": "gzip" });
    expect(outside.headers["cache-control"]).toBeUndefined();
    expect(outside.headers["content-encoding"]).toBeUndefined();
  });
});
