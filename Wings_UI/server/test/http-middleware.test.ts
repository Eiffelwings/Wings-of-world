import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { requestLogger, errorLogger } from "../lib/logger.js";
import {
  recordRequest,
  recordLlmCall,
  snapshot,
  toPrometheus,
  resetMetricsForTest,
} from "../lib/metrics.js";

// We construct small purpose-built Express apps per test instead of booting
// the whole Wings server. This keeps integration tests fast and isolated, and
// lets us assert middleware behaviour without spinning up dependencies.

describe("requestLogger middleware", () => {
  it("attaches a correlation ID to req and echoes it on the response", async () => {
    const app = express();
    app.use(requestLogger);
    app.get("/x", (req, res) => res.json({ id: req.id }));

    const res = await request(app).get("/x");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(res.body.id).toBe(res.headers["x-request-id"]);
  });

  it("respects a caller-provided x-request-id header", async () => {
    const app = express();
    app.use(requestLogger);
    app.get("/x", (req, res) => res.json({ id: req.id }));

    const res = await request(app)
      .get("/x")
      .set("x-request-id", "abc-123");
    expect(res.body.id).toBe("abc-123");
    expect(res.headers["x-request-id"]).toBe("abc-123");
  });
});

describe("errorLogger middleware", () => {
  it("returns a JSON error with the request id", async () => {
    const app = express();
    app.use(requestLogger);
    app.get("/boom", () => {
      throw new Error("kaboom");
    });
    app.use(errorLogger);

    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });

  it("preserves exposed client error status codes", async () => {
    const app = express();
    app.use(requestLogger);
    app.use(express.json());
    app.post("/json", (_req, res) => res.json({ ok: true }));
    app.use(errorLogger);

    const res = await request(app)
      .post("/json")
      .set("content-type", "application/json")
      .send("{");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/i);
    expect(res.body.requestId).toBeDefined();
  });
});

describe("rate limiting", () => {
  it("returns 429 once the per-window limit is exceeded", async () => {
    // Use a tiny limiter for the test (the production limiters skip tests
    // entirely when NODE_ENV=test, so we instantiate a fresh one here).
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 3,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    });

    const app = express();
    app.use(limiter);
    app.get("/r", (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const ok = await request(app).get("/r");
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app).get("/r");
    expect(blocked.status).toBe(429);
  });
});

describe("metrics middleware", () => {
  beforeEach(() => resetMetricsForTest());

  it("counts requests and exposes a JSON snapshot", async () => {
    const app = express();
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => recordRequest(req.path, res.statusCode, Date.now() - start));
      next();
    });
    app.get("/api/test", (_req, res) => res.json({ ok: true }));
    app.get("/api/test", (_req, res) => res.status(500).json({ error: "x" }));

    await request(app).get("/api/test");
    await request(app).get("/api/test");

    const snap = snapshot();
    const route = snap.routes.find((r) => r.path === "/api/test");
    expect(route).toBeDefined();
    expect(route!.count).toBe(2);
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snap.process.rssMb).toBeGreaterThan(0);
  });

  it("buckets dynamic IDs to keep cardinality bounded", async () => {
    recordRequest("/api/scheduled-tasks/sch_999_abc/run", 200, 5);
    recordRequest("/api/scheduled-tasks/sch_111_xyz/run", 200, 5);
    const snap = snapshot();
    const matching = snap.routes.filter((r) => r.path.includes("scheduled-tasks"));
    expect(matching).toHaveLength(1);
    expect(matching[0].count).toBe(2);
  });

  it("records LLM call statistics", () => {
    recordLlmCall({ promptTokens: 100, completionTokens: 50, costUsd: 0.0042 });
    recordLlmCall({ promptTokens: 200, completionTokens: 80, costUsd: 0.0091 });
    const snap = snapshot();
    expect(snap.llm.calls).toBe(2);
    expect(snap.llm.promptTokens).toBe(300);
    expect(snap.llm.completionTokens).toBe(130);
    expect(snap.llm.totalCostUsd).toBeCloseTo(0.0133);
  });

  it("renders a Prometheus exposition format", () => {
    recordRequest("/api/test", 200, 12);
    recordLlmCall({ promptTokens: 10, completionTokens: 5, costUsd: 0.001 });
    const text = toPrometheus();
    expect(text).toContain("# HELP wings_uptime_seconds");
    expect(text).toContain("wings_http_requests_total");
    expect(text).toContain("wings_llm_calls_total 1");
    expect(text).toContain("wings_llm_cost_usd_total");
  });
});
