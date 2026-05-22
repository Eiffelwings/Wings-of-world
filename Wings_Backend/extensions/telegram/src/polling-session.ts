import fs from "node:fs";
import path from "node:path";
import { type RunOptions, run } from "@grammyjs/runner";
import { computeBackoff, sleepWithAbort } from "mechanical-wings/plugin-sdk/infra-runtime";
import { formatErrorMessage } from "mechanical-wings/plugin-sdk/infra-runtime";
import { formatDurationPrecise } from "mechanical-wings/plugin-sdk/infra-runtime";
import { resolveStateDir } from "mechanical-wings/plugin-sdk/state-paths";
import { withTelegramApiErrorLogging } from "./api-logging.js";
import { resolveTelegramAccount } from "./accounts.js";
import { createTelegramBot } from "./bot.js";
import { resolveTelegramApiBase, resolveTelegramFetch, type TelegramTransport } from "./fetch.js";
import { isRecoverableTelegramNetworkError } from "./network-errors.js";
import { TelegramPollingTransportState } from "./polling-transport-state.js";

const TELEGRAM_POLL_RESTART_POLICY = {
  initialMs: 2000,
  maxMs: 30_000,
  factor: 1.8,
  jitter: 0.25,
};

const POLL_STALL_THRESHOLD_MS = 90_000;
const POLL_WATCHDOG_INTERVAL_MS = 30_000;
const POLL_STOP_GRACE_MS = 15_000;
const TELEGRAM_POLLER_LOCK_FILE = path.join(resolveStateDir(), "telegram-poller.lock.json");
const TELEGRAM_POLLER_LOCK_STALE_MS = 90_000;
const TELEGRAM_POLLER_INSTANCE_ID = `telegram_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

const waitForGracefulStop = async (stop: () => Promise<void>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stop(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, POLL_STOP_GRACE_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

type TelegramBot = ReturnType<typeof createTelegramBot>;

type TelegramPollerLock = {
  pid: number;
  instanceId: string;
  acquiredAt: string;
  heartbeatAt: string;
};

function loadTelegramPollerLock(): TelegramPollerLock | null {
  if (!fs.existsSync(TELEGRAM_POLLER_LOCK_FILE)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(TELEGRAM_POLLER_LOCK_FILE, "utf-8"));
    const stat = fs.statSync(TELEGRAM_POLLER_LOCK_FILE);
    if (
      typeof raw?.pid !== "number" ||
      !Number.isFinite(raw.pid) ||
      typeof raw?.instanceId !== "string" ||
      !raw.instanceId.trim()
    ) {
      return null;
    }
    return {
      pid: raw.pid,
      instanceId: raw.instanceId.trim(),
      acquiredAt:
        typeof raw?.acquiredAt === "string" && raw.acquiredAt.trim()
          ? raw.acquiredAt
          : new Date(stat.mtimeMs).toISOString(),
      heartbeatAt: new Date(stat.mtimeMs).toISOString(),
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removeTelegramPollerLock() {
  if (fs.existsSync(TELEGRAM_POLLER_LOCK_FILE)) {
    fs.unlinkSync(TELEGRAM_POLLER_LOCK_FILE);
  }
}

function getTelegramPollerLockAgeMs(): number {
  try {
    const stat = fs.statSync(TELEGRAM_POLLER_LOCK_FILE);
    return Math.max(0, Date.now() - stat.mtimeMs);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function getActiveTelegramPollerLock() {
  const lock = loadTelegramPollerLock();
  if (!lock) return null;
  const stale = getTelegramPollerLockAgeMs() > TELEGRAM_POLLER_LOCK_STALE_MS;
  if (stale || !isProcessAlive(lock.pid)) return null;
  return lock;
}

function acquireTelegramPollerLock() {
  const now = new Date();
  const current = getActiveTelegramPollerLock();
  if (current) {
    const ownedByThisProcess =
      current.pid === process.pid && current.instanceId === TELEGRAM_POLLER_INSTANCE_ID;
    if (!ownedByThisProcess) {
      return {
        ok: false,
        reason: `Another local Wings Telegram poller is active (pid ${current.pid}, heartbeat ${current.heartbeatAt}).`,
      };
    }
  } else if (fs.existsSync(TELEGRAM_POLLER_LOCK_FILE)) {
    removeTelegramPollerLock();
  }

  try {
    const fd = fs.openSync(TELEGRAM_POLLER_LOCK_FILE, "wx", 0o600);
    try {
      fs.writeFileSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          instanceId: TELEGRAM_POLLER_INSTANCE_ID,
          acquiredAt: now.toISOString(),
          heartbeatAt: now.toISOString(),
        }),
      );
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === "EEXIST") {
      const active = getActiveTelegramPollerLock();
      return {
        ok: false,
        reason: active
          ? `Another local Wings Telegram poller is active (pid ${active.pid}, heartbeat ${active.heartbeatAt}).`
          : "Another local Wings Telegram poller is starting up.",
      };
    }
    throw err;
  }
}

function refreshTelegramPollerLock() {
  if (!fs.existsSync(TELEGRAM_POLLER_LOCK_FILE)) {
    return;
  }
  const current = loadTelegramPollerLock();
  if (!current) {
    return;
  }
  if (current.pid !== process.pid || current.instanceId !== TELEGRAM_POLLER_INSTANCE_ID) {
    return;
  }
  const now = new Date();
  try {
    fs.utimesSync(TELEGRAM_POLLER_LOCK_FILE, now, now);
  } catch {
    // Best-effort heartbeat.
  }
}

function releaseTelegramPollerLock() {
  const current = loadTelegramPollerLock();
  if (!current) {
    return;
  }
  if (current.pid !== process.pid || current.instanceId !== TELEGRAM_POLLER_INSTANCE_ID) {
    return;
  }
  removeTelegramPollerLock();
}

async function deleteWebhookDirect(params: {
  token: string;
  config: TelegramPollingSessionOpts["config"];
  accountId: string;
  proxyFetch?: typeof fetch;
  telegramTransport?: TelegramTransport;
  signal?: AbortSignal;
}): Promise<void> {
  const account = resolveTelegramAccount({
    cfg: params.config ?? {},
    accountId: params.accountId,
  });
  const apiBase = resolveTelegramApiBase(account.config.apiRoot);
  const fetchImpl =
    params.telegramTransport?.fetch ??
    resolveTelegramFetch(params.proxyFetch, {
      network: account.config.network,
    });
  const response = await fetchImpl(`${apiBase}/bot${params.token}/deleteWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false }),
    ...(params.signal ? { signal: params.signal } : {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Telegram deleteWebhook HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }
}

type TelegramPollingSessionOpts = {
  token: string;
  config: Parameters<typeof createTelegramBot>[0]["config"];
  accountId: string;
  runtime: Parameters<typeof createTelegramBot>[0]["runtime"];
  proxyFetch: Parameters<typeof createTelegramBot>[0]["proxyFetch"];
  abortSignal?: AbortSignal;
  runnerOptions: RunOptions<unknown>;
  getLastUpdateId: () => number | null;
  persistUpdateId: (updateId: number) => Promise<void>;
  log: (line: string) => void;
  /** Pre-resolved Telegram transport to reuse across bot instances */
  telegramTransport?: TelegramTransport;
  /** Rebuild Telegram transport after stall/network recovery when marked dirty. */
  createTelegramTransport?: () => TelegramTransport;
};

export class TelegramPollingSession {
  #restartAttempts = 0;
  #webhookCleared = false;
  #forceRestarted = false;
  #lockAcquired = false;
  #activeRunner: ReturnType<typeof run> | undefined;
  #activeFetchAbort: AbortController | undefined;
  #transportState: TelegramPollingTransportState;

  constructor(private readonly opts: TelegramPollingSessionOpts) {
    this.#transportState = new TelegramPollingTransportState({
      log: opts.log,
      initialTransport: opts.telegramTransport,
      createTelegramTransport: opts.createTelegramTransport,
    });
  }

  get activeRunner() {
    return this.#activeRunner;
  }

  markForceRestarted() {
    this.#forceRestarted = true;
  }

  markTransportDirty() {
    this.#transportState.markDirty();
  }

  abortActiveFetch() {
    this.#activeFetchAbort?.abort();
  }

  async runUntilAbort(): Promise<void> {
    const lockStatus = acquireTelegramPollerLock();
    if (!lockStatus.ok) {
      this.opts.log(
        `[telegram] Polling skipped: ${lockStatus.reason ?? "another local poller is active."}`,
      );
      return;
    }
    this.#lockAcquired = true;

    const heartbeatInterval = setInterval(() => {
      refreshTelegramPollerLock();
    }, 10_000);
    heartbeatInterval.unref?.();

    try {
      while (!this.opts.abortSignal?.aborted) {
        const bot = await this.#createPollingBot();
        if (!bot) {
          continue;
        }

        const cleanupState = await this.#ensureWebhookCleanup(bot);
        if (cleanupState === "retry") {
          continue;
        }
        if (cleanupState === "exit") {
          return;
        }

        const state = await this.#runPollingCycle(bot);
        if (state === "exit") {
          return;
        }
      }
    } finally {
      clearInterval(heartbeatInterval);
      if (this.#lockAcquired) {
        releaseTelegramPollerLock();
        this.#lockAcquired = false;
      }
    }
  }

  async #waitBeforeRestart(buildLine: (delay: string) => string): Promise<boolean> {
    this.#restartAttempts += 1;
    const delayMs = computeBackoff(TELEGRAM_POLL_RESTART_POLICY, this.#restartAttempts);
    const delay = formatDurationPrecise(delayMs);
    this.opts.log(buildLine(delay));
    try {
      await sleepWithAbort(delayMs, this.opts.abortSignal);
    } catch (sleepErr) {
      if (this.opts.abortSignal?.aborted) {
        return false;
      }
      throw sleepErr;
    }
    return true;
  }

  async #waitBeforeRetryOnRecoverableSetupError(err: unknown, logPrefix: string): Promise<boolean> {
    if (this.opts.abortSignal?.aborted) {
      return false;
    }
    if (!isRecoverableTelegramNetworkError(err, { context: "unknown" })) {
      throw err;
    }
    return this.#waitBeforeRestart(
      (delay) => `${logPrefix}: ${formatErrorMessage(err)}; retrying in ${delay}.`,
    );
  }

  async #createPollingBot(): Promise<TelegramBot | undefined> {
    const fetchAbortController = new AbortController();
    this.#activeFetchAbort = fetchAbortController;
    const telegramTransport = this.#transportState.acquireForNextCycle();
    try {
      return createTelegramBot({
        token: this.opts.token,
        runtime: this.opts.runtime,
        proxyFetch: this.opts.proxyFetch,
        config: this.opts.config,
        accountId: this.opts.accountId,
        fetchAbortSignal: fetchAbortController.signal,
        updateOffset: {
          lastUpdateId: this.opts.getLastUpdateId(),
          onUpdateId: this.opts.persistUpdateId,
        },
        telegramTransport,
      });
    } catch (err) {
      await this.#waitBeforeRetryOnRecoverableSetupError(err, "Telegram setup network error");
      if (this.#activeFetchAbort === fetchAbortController) {
        this.#activeFetchAbort = undefined;
      }
      return undefined;
    }
  }

  async #ensureWebhookCleanup(bot: TelegramBot): Promise<"ready" | "retry" | "exit"> {
    if (this.#webhookCleared) {
      return "ready";
    }
    const telegramTransport = this.#transportState.current;
    try {
      try {
        await bot.api.deleteWebhook({ drop_pending_updates: false });
      } catch (err) {
        try {
          await deleteWebhookDirect({
            token: this.opts.token,
            config: this.opts.config,
            accountId: this.opts.accountId,
            proxyFetch: this.opts.proxyFetch,
            telegramTransport,
            signal: this.#activeFetchAbort?.signal,
          });
          this.opts.log(
            `Telegram webhook cleanup recovered with direct fetch after API client failure: ${formatErrorMessage(
              err,
            )}`,
          );
        } catch {
          await withTelegramApiErrorLogging({
            operation: "deleteWebhook",
            runtime: this.opts.runtime,
            fn: () => Promise.reject(err),
          });
        }
      }
      this.#webhookCleared = true;
      return "ready";
    } catch (err) {
      const shouldRetry = await this.#waitBeforeRetryOnRecoverableSetupError(
        err,
        "Telegram webhook cleanup failed",
      );
      return shouldRetry ? "retry" : "exit";
    }
  }

  async #confirmPersistedOffset(bot: TelegramBot): Promise<void> {
    const lastUpdateId = this.opts.getLastUpdateId();
    if (lastUpdateId === null || lastUpdateId >= Number.MAX_SAFE_INTEGER) {
      return;
    }
    try {
      await bot.api.getUpdates({ offset: lastUpdateId + 1, limit: 1, timeout: 0 });
    } catch {
      // Non-fatal: runner middleware still skips duplicates via shouldSkipUpdate.
    }
  }

  async #runPollingCycle(bot: TelegramBot): Promise<"continue" | "exit"> {
    await this.#confirmPersistedOffset(bot);

    let lastGetUpdatesAt = Date.now();
    let lastGetUpdatesStartedAt: number | null = null;
    let lastGetUpdatesFinishedAt: number | null = null;
    let lastGetUpdatesDurationMs: number | null = null;
    let lastGetUpdatesOutcome = "not-started";
    let lastGetUpdatesError: string | null = null;
    let lastGetUpdatesOffset: number | null = null;
    let inFlightGetUpdates = 0;
    let stopSequenceLogged = false;
    let stallDiagLoggedAt = 0;

    bot.api.config.use(async (prev, method, payload, signal) => {
      if (method !== "getUpdates") {
        return prev(method, payload, signal);
      }

      const startedAt = Date.now();
      lastGetUpdatesAt = startedAt;
      lastGetUpdatesStartedAt = startedAt;
      lastGetUpdatesOffset =
        payload && typeof payload === "object" && "offset" in payload
          ? ((payload as { offset?: number }).offset ?? null)
          : null;
      inFlightGetUpdates += 1;
      lastGetUpdatesOutcome = "started";
      lastGetUpdatesError = null;

      try {
        const result = await prev(method, payload, signal);
        const finishedAt = Date.now();
        lastGetUpdatesFinishedAt = finishedAt;
        lastGetUpdatesDurationMs = finishedAt - startedAt;
        lastGetUpdatesOutcome = Array.isArray(result) ? `ok:${result.length}` : "ok";
        return result;
      } catch (err) {
        const finishedAt = Date.now();
        lastGetUpdatesFinishedAt = finishedAt;
        lastGetUpdatesDurationMs = finishedAt - startedAt;
        lastGetUpdatesOutcome = "error";
        lastGetUpdatesError = formatErrorMessage(err);
        throw err;
      } finally {
        inFlightGetUpdates = Math.max(0, inFlightGetUpdates - 1);
      }
    });

    const runner = run(bot, this.opts.runnerOptions);
    this.#activeRunner = runner;
    refreshTelegramPollerLock();
    const fetchAbortController = this.#activeFetchAbort;
    const abortFetch = () => {
      fetchAbortController?.abort();
    };

    if (this.opts.abortSignal && fetchAbortController) {
      this.opts.abortSignal.addEventListener("abort", abortFetch, { once: true });
    }
    let stopPromise: Promise<void> | undefined;
    let stalledRestart = false;
    let forceCycleTimer: ReturnType<typeof setTimeout> | undefined;
    let forceCycleResolve: (() => void) | undefined;
    const forceCyclePromise = new Promise<void>((resolve) => {
      forceCycleResolve = resolve;
    });
    const stopRunner = () => {
      fetchAbortController?.abort();
      stopPromise ??= Promise.resolve(runner.stop())
        .then(() => undefined)
        .catch(() => {
          // Runner may already be stopped by abort/retry paths.
        });
      return stopPromise;
    };
    const stopBot = () => {
      return Promise.resolve(bot.stop())
        .then(() => undefined)
        .catch(() => {
          // Bot may already be stopped by runner stop/abort paths.
        });
    };
    const stopOnAbort = () => {
      if (this.opts.abortSignal?.aborted) {
        void stopRunner();
      }
    };

    const watchdog = setInterval(() => {
      if (this.opts.abortSignal?.aborted) {
        return;
      }

      const now = Date.now();
      const activeElapsed =
        inFlightGetUpdates > 0 && lastGetUpdatesStartedAt != null
          ? now - lastGetUpdatesStartedAt
          : 0;
      const idleElapsed =
        inFlightGetUpdates > 0 ? 0 : now - (lastGetUpdatesFinishedAt ?? lastGetUpdatesAt);
      const elapsed = inFlightGetUpdates > 0 ? activeElapsed : idleElapsed;

      if (elapsed > POLL_STALL_THRESHOLD_MS && runner.isRunning()) {
        if (stallDiagLoggedAt && now - stallDiagLoggedAt < POLL_STALL_THRESHOLD_MS / 2) {
          return;
        }
        stallDiagLoggedAt = now;
        this.#transportState.markDirty();
        stalledRestart = true;
        const elapsedLabel =
          inFlightGetUpdates > 0
            ? `active getUpdates stuck for ${formatDurationPrecise(elapsed)}`
            : `no completed getUpdates for ${formatDurationPrecise(elapsed)}`;
        this.opts.log(
          `[telegram] Polling stall detected (${elapsedLabel}); forcing restart. [diag inFlight=${inFlightGetUpdates} outcome=${lastGetUpdatesOutcome} startedAt=${lastGetUpdatesStartedAt ?? "n/a"} finishedAt=${lastGetUpdatesFinishedAt ?? "n/a"} durationMs=${lastGetUpdatesDurationMs ?? "n/a"} offset=${lastGetUpdatesOffset ?? "n/a"}${lastGetUpdatesError ? ` error=${lastGetUpdatesError}` : ""}]`,
        );
        void stopRunner();
        void stopBot();
        if (!forceCycleTimer) {
          forceCycleTimer = setTimeout(() => {
            if (this.opts.abortSignal?.aborted) {
              return;
            }
            this.opts.log(
              `[telegram] Polling runner stop timed out after ${formatDurationPrecise(POLL_STOP_GRACE_MS)}; forcing restart cycle.`,
            );
            forceCycleResolve?.();
          }, POLL_STOP_GRACE_MS);
        }
      }
    }, POLL_WATCHDOG_INTERVAL_MS);

    this.opts.abortSignal?.addEventListener("abort", stopOnAbort, { once: true });
    try {
      await Promise.race([runner.task(), forceCyclePromise]);
      if (this.opts.abortSignal?.aborted) {
        return "exit";
      }
      const reason = stalledRestart
        ? "polling stall detected"
        : this.#forceRestarted
          ? "unhandled network error"
          : "runner stopped (maxRetryTime exceeded or graceful stop)";
      this.#forceRestarted = false;
      this.opts.log(
        `[telegram][diag] polling cycle finished reason=${reason} inFlight=${inFlightGetUpdates} outcome=${lastGetUpdatesOutcome} startedAt=${lastGetUpdatesStartedAt ?? "n/a"} finishedAt=${lastGetUpdatesFinishedAt ?? "n/a"} durationMs=${lastGetUpdatesDurationMs ?? "n/a"} offset=${lastGetUpdatesOffset ?? "n/a"}${lastGetUpdatesError ? ` error=${lastGetUpdatesError}` : ""}`,
      );
      const shouldRestart = await this.#waitBeforeRestart(
        (delay) => `Telegram polling runner stopped (${reason}); restarting in ${delay}.`,
      );
      return shouldRestart ? "continue" : "exit";
    } catch (err) {
      this.#forceRestarted = false;
      if (this.opts.abortSignal?.aborted) {
        throw err;
      }
      const isConflict = isGetUpdatesConflict(err);
      if (isConflict) {
        this.#webhookCleared = false;
      }
      const isRecoverable = isRecoverableTelegramNetworkError(err, { context: "polling" });
      if (isRecoverable) {
        this.#transportState.markDirty();
      }
      if (!isConflict && !isRecoverable) {
        throw err;
      }
      const reason = isConflict ? "getUpdates conflict" : "network error";
      const errMsg = formatErrorMessage(err);
      this.opts.log(
        `[telegram][diag] polling cycle error reason=${reason} inFlight=${inFlightGetUpdates} outcome=${lastGetUpdatesOutcome} startedAt=${lastGetUpdatesStartedAt ?? "n/a"} finishedAt=${lastGetUpdatesFinishedAt ?? "n/a"} durationMs=${lastGetUpdatesDurationMs ?? "n/a"} offset=${lastGetUpdatesOffset ?? "n/a"} err=${errMsg}${lastGetUpdatesError ? ` lastGetUpdatesError=${lastGetUpdatesError}` : ""}`,
      );
      const shouldRestart = await this.#waitBeforeRestart(
        (delay) => `Telegram ${reason}: ${errMsg}; retrying in ${delay}.`,
      );
      return shouldRestart ? "continue" : "exit";
    } finally {
      clearInterval(watchdog);
      if (forceCycleTimer) {
        clearTimeout(forceCycleTimer);
      }
      this.opts.abortSignal?.removeEventListener("abort", abortFetch);
      this.opts.abortSignal?.removeEventListener("abort", stopOnAbort);
      await waitForGracefulStop(stopRunner);
      await waitForGracefulStop(stopBot);
      this.#activeRunner = undefined;
      if (this.#activeFetchAbort === fetchAbortController) {
        this.#activeFetchAbort = undefined;
      }
    }
  }
}

const isGetUpdatesConflict = (err: unknown) => {
  if (!err || typeof err !== "object") {
    return false;
  }
  const typed = err as {
    error_code?: number;
    errorCode?: number;
    description?: string;
    method?: string;
    message?: string;
  };
  const errorCode = typed.error_code ?? typed.errorCode;
  if (errorCode !== 409) {
    return false;
  }
  const haystack = [typed.method, typed.description, typed.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return haystack.includes("getupdates");
};
