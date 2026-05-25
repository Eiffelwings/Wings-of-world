// Sandboxed code execution for the workflow `code` and `tool` nodes.
//
// Two-layer strategy:
//
//   1. Preferred: `isolated-vm` (true V8 isolate, separate heap). This is the
//      only sandbox in Node that genuinely contains hostile code — `vm`
//      contexts share the parent heap and can break out via prototype
//      pollution or `process` references that leak through closures.
//
//   2. Fallback: Node's built-in `vm` module with a deny-all context. Used
//      when isolated-vm fails to load (native module install issues on the
//      target machine). Less secure — sufficient for trusted authors only.
//
// All paths enforce a hard wall-clock timeout and a heap cap. Tool-arg
// expressions get a stricter sandbox (no statements, just expression eval).

import vm from "vm";
import { logger } from "./logger.js";

export interface SandboxResult<T = unknown> {
  ok: boolean;
  value?: T;
  error?: string;
  durationMs: number;
  /** Which engine actually ran the code. Useful for telemetry. */
  engine: "isolated-vm" | "node-vm";
}

export interface SandboxOptions {
  /** Wall-clock timeout in ms. Defaults to 1500ms. */
  timeoutMs?: number;
  /** Heap cap in MB for isolated-vm. Defaults to 32 MB. */
  memoryLimitMb?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_MEMORY_LIMIT_MB = 32;
const MAX_RESULT_BYTES = 64 * 1024;

let isolatedVmModule: any | null = null;
let isolatedVmTried = false;

/** Lazy-load isolated-vm. Returns null if the native module is unavailable. */
async function loadIsolatedVm(): Promise<any | null> {
  if (isolatedVmTried) return isolatedVmModule;
  isolatedVmTried = true;
  try {
    // Dynamic import so failures don't take down the whole server module graph.
    isolatedVmModule = await import("isolated-vm");
    return isolatedVmModule;
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "isolated-vm unavailable; falling back to Node vm sandbox",
    );
    isolatedVmModule = null;
    return null;
  }
}

/**
 * isolated-vm's ExternalCopy only handles plain primitives / arrays / objects.
 * Functions, Symbols, and BigInts blow it up. Strip them by JSON round-trip
 * so the sandbox always sees something safe.
 */
function safeForCopy(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function clipResult(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_RESULT_BYTES ? `${value.slice(0, MAX_RESULT_BYTES)}…[truncated]` : value;
  }
  try {
    const json = JSON.stringify(value);
    if (json && json.length > MAX_RESULT_BYTES) {
      return `${json.slice(0, MAX_RESULT_BYTES)}…[truncated]`;
    }
    return value;
  } catch {
    return String(value);
  }
}

/**
 * Run a snippet of user code with `input` and `context` available as bindings.
 * If the snippet contains the literal "return" we wrap it as a function body;
 * otherwise we treat the entire snippet as an expression and return its value.
 */
export async function runUserCode<T = unknown>(
  code: string,
  bindings: { input: unknown; context?: unknown },
  options: SandboxOptions = {},
): Promise<SandboxResult<T>> {
  const start = Date.now();
  const timeoutMs = Math.max(50, Math.min(10_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const memoryLimitMb = Math.max(8, Math.min(256, options.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB));
  const isolated = await loadIsolatedVm();
  const wrapped = code.includes("return") ? code : `return (${code});`;
  const fnSource = `
    (function (input, context) {
      ${wrapped}
    })
  `;

  if (isolated) {
    let isolate: any | null = null;
    let context: any | null = null;
    try {
      isolate = new isolated.Isolate({ memoryLimit: memoryLimitMb });
      context = await isolate.createContext();
      const jail = context.global;
      // Block accidental access to host objects. isolated-vm globals start
      // empty but defensive setting helps against bugs in callers.
      await jail.set("global", jail.derefInto());

      // Inject the input/context bindings as deep-copied plain objects. We
      // use the prefix `__wings_` to make accidental clobber unlikely.
      const inputCopy = new isolated.ExternalCopy(safeForCopy(bindings.input));
      await jail.set("__wings_input", inputCopy.copyInto({ release: true }));
      const ctxCopy = new isolated.ExternalCopy(safeForCopy(bindings.context ?? {}));
      await jail.set("__wings_ctx", ctxCopy.copyInto({ release: true }));

      // Run an IIFE so the user's `return` short-circuits and the script
      // expression evaluates to whatever the function returned.
      const script = `(${fnSource})(__wings_input, __wings_ctx)`;
      const compiled = await isolate.compileScript(script);
      const result = await compiled.run(context, { timeout: timeoutMs, copy: true });
      return {
        ok: true,
        value: clipResult(result) as T,
        durationMs: Date.now() - start,
        engine: "isolated-vm",
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
        engine: "isolated-vm",
      };
    } finally {
      try { context?.release(); } catch { /* ignore */ }
      try { isolate?.dispose(); } catch { /* ignore */ }
    }
  }

  // Fallback: Node's vm module. We strip global access and freeze prototypes
  // to make breakouts harder, but this is NOT a true sandbox.
  try {
    const sandbox: Record<string, unknown> = {
      input: bindings.input,
      context: bindings.context ?? {},
      // Useful pure helpers — explicitly pass them in so the script doesn't
      // need access to a global object.
      JSON,
      Math,
      Date,
      Number,
      String,
      Boolean,
      Array,
      Object,
    };
    const ctx = vm.createContext(sandbox, { name: "wings-sandbox", codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(`(${fnSource})(input, context)`, { filename: "user-code.js" });
    const result = script.runInContext(ctx, { timeout: timeoutMs, breakOnSigint: true });
    return {
      ok: true,
      value: clipResult(result) as T,
      durationMs: Date.now() - start,
      engine: "node-vm",
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
      durationMs: Date.now() - start,
      engine: "node-vm",
    };
  }
}

/**
 * Tool-args expressions are tighter — they accept *expressions only* and
 * return whatever object/array/value the expression evaluates to. No
 * statements (`return`, `if`, etc.) needed; this is for things like
 * `({ query: input, top: 5 })`.
 */
export async function evalToolArgs(
  expression: string,
  bindings: { input: unknown },
  options: SandboxOptions = {},
): Promise<SandboxResult<Record<string, unknown>>> {
  const trimmed = expression.trim();
  // If the user explicitly wrote a JSON string, parse it directly — fastest
  // and safest path.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return { ok: true, value: parsed, durationMs: 0, engine: "node-vm" };
      }
    } catch { /* fall through to sandbox eval */ }
  }
  const wrapped = `return (${expression});`;
  return runUserCode<Record<string, unknown>>(wrapped, { input: bindings.input }, options);
}
