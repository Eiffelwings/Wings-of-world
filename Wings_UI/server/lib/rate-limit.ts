import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

const IS_TEST = process.env.NODE_ENV === "test";

function createLimiter(opts: {
  windowMs: number;
  max: number;
  name: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: IS_TEST ? 0 : opts.max, // 0 disables in tests
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => IS_TEST,
    handler: (req: Request, res: Response) => {
      const log = (req as any).log;
      log?.warn({ limiter: opts.name, ip: req.ip }, "rate limit exceeded");
      res.status(429).json({
        error: "Too many requests",
        limiter: opts.name,
        retryAfter: Math.ceil(opts.windowMs / 1000),
      });
    },
    keyGenerator: (req: Request) => {
      // Prefer authenticated user id when present, else IP.
      const userId = (req as any).userId;
      return userId ? `user:${userId}` : ipKeyGenerator(req.ip || "unknown");
    },
  });
}

// Generic API limiter: 600 req / 5 min per key (~2 req/sec sustained)
export const apiLimiter = createLimiter({
  windowMs: 5 * 60_000,
  max: 600,
  name: "api",
});

// Chat / agent endpoints: more expensive — tighter limit.
export const chatLimiter = createLimiter({
  windowMs: 60_000,
  max: 30,
  name: "chat",
});

// Webhook ingest: protect against payload spam from compromised sources.
export const webhookIngestLimiter = createLimiter({
  windowMs: 60_000,
  max: 120,
  name: "webhook-ingest",
});
