import compression from "compression";
import type { RequestHandler } from "express";

/** Compress private API responses without making authenticated data cacheable. */
export function createApiDeliveryMiddleware(): RequestHandler {
  const compress = compression({
    threshold: 1024,
    level: 4,
    filter(req, res) {
      // Keep event streams immediately flushable and preserve normal streaming semantics.
      if (String(res.getHeader("Content-Type") ?? "").toLowerCase().startsWith("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  });

  return (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.vary("Accept-Encoding");
    compress(req, res, next);
  };
}
