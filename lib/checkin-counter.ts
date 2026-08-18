import "server-only";

/*
 * Grand-opening check-in counter — two integers in Upstash Redis.
 *
 *   go:arrivals    total guests checked in (shown on the public board)
 *   go:departures  guests who have left (admin only; in-room = arrivals − departures)
 *
 * All mutations are single atomic Redis commands so several greeters can tap
 * at once without losing counts. Talks to the Upstash REST API with plain
 * fetch — no client dependency for four commands.
 *
 * Env (injected by the Vercel ↔ Upstash integration):
 *   KV_REST_API_URL, KV_REST_API_TOKEN
 *
 * The same read path lives in web/ascweb/lib/grand-opening/checkin-counter.ts;
 * keep the key names in sync.
 */

const KEYS = { arrivals: "go:arrivals", departures: "go:departures" } as const;
export type CounterKey = keyof typeof KEYS;

export type { Counts } from "./checkin-counter-rules";
import type { Counts } from "./checkin-counter-rules";

type RedisResponse = { result?: unknown; error?: string };

async function redis(command: (string | number)[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN not set");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash responded ${res.status}`);
  const data = (await res.json()) as RedisResponse;
  if (data.error) throw new Error(`upstash: ${data.error}`);
  return data.result;
}

function toCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`unexpected counter value: ${String(value)}`);
  return n;
}

export async function readCounts(): Promise<Counts> {
  const result = await redis(["MGET", KEYS.arrivals, KEYS.departures]);
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("unexpected MGET response");
  }
  return { arrivals: toCount(result[0]), departures: toCount(result[1]) };
}

// INCRBY, then floor at zero — in one Lua script so an undo past zero can't
// race a concurrent tap (a separate SET 0 could erase it).
const INCR_FLOORED =
  "local v = redis.call('INCRBY', KEYS[1], ARGV[1]) " +
  "if v < 0 then redis.call('SET', KEYS[1], 0) return 0 end return v";

/** Atomically add `n` (may be negative; result never below 0). Returns the new value. */
export async function addTo(key: CounterKey, n: number): Promise<number> {
  return toCount(await redis(["EVAL", INCR_FLOORED, 1, KEYS[key], n]));
}

/**
 * Overwrite both counters at once (MSET is atomic). Not atomic w.r.t. taps
 * that are in flight at the same moment — confirm-guarded in the UI.
 */
export async function setCounts(next: Counts): Promise<void> {
  await redis([
    "MSET",
    KEYS.arrivals,
    Math.max(0, next.arrivals),
    KEYS.departures,
    Math.max(0, next.departures),
  ]);
}

export async function resetCounts(): Promise<void> {
  await redis(["DEL", KEYS.arrivals, KEYS.departures]);
}
