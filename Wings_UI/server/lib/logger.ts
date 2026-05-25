import pino from "pino";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

const IS_PROD = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PROD ? "info" : "debug");

export const logger = pino({
  level: LOG_LEVEL,
  base: { app: "wings-of-world", env: IS_PROD ? "production" : "development" },
  redact: {
    paths: [
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.secret",
      "*.token",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.headers['x-wings-of-world-signature']",
      "req.headers['x-wings-signature']",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(IS_PROD
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname,app,env",
            singleLine: false,
          },
        },
      }),
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      log?: pino.Logger;
      startTime?: number;
    }
  }
}

const NOISY_PATHS = new Set([
  "/api/system/readiness",
  "/api/system/health",
  "/healthz",
  "/readyz",
  "/metrics",
]);

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const correlationId = String(req.header("x-request-id") || randomUUID());
  req.id = correlationId;
  req.startTime = Date.now();
  req.log = logger.child({ requestId: correlationId });
  res.setHeader("x-request-id", correlationId);

  res.on("finish", () => {
    const durationMs = Date.now() - (req.startTime || Date.now());
    if (NOISY_PATHS.has(req.path)) return; // skip noisy poll paths
    const meta = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    };
    if (res.statusCode >= 500) req.log!.error(meta, "request failed");
    else if (res.statusCode >= 400) req.log!.warn(meta, "request error");
    else if (durationMs > 1500) req.log!.warn(meta, "slow request");
    else req.log!.info(meta, "request");
  });

  next();
}

export function errorLogger(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const log = req.log || logger;
  const status =
    typeof (err as any)?.status === "number"
      ? (err as any).status
      : typeof (err as any)?.statusCode === "number"
        ? (err as any).statusCode
        : 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const expose = safeStatus < 500 || Boolean((err as any)?.expose);
  log.error({ err, path: req.path, method: req.method }, "unhandled error");
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(safeStatus).json({
    error: expose || !IS_PROD ? err.message : "Internal server error",
    requestId: req.id,
  });
}
