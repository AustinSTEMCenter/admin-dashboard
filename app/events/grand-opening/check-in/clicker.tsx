"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, LogIn, LogOut, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CounterKey } from "@/lib/checkin-counter";
import { inRoomAfterSetTotal, type Counts } from "@/lib/checkin-counter-rules";
import { cn } from "@/lib/utils";

import { adjust, getCounts, reset, setArrivals, setInRoom } from "./actions";

const POLL_MS = 5000;

type Props = { initial: Counts; capacity: number | null };

export function Clicker({ initial, capacity }: Props) {
  const [counts, setCounts] = useState<Counts>(initial);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  // Taps are applied optimistically at once, but the server calls run one at
  // a time (queue) so each response reflects every earlier tap from this
  // phone. Only the newest issued request's response is applied, so an older
  // response can never drag the number back below what's already been tapped.
  const seq = useRef(0);
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const applyServer = useCallback((mine: number, next: Counts) => {
    if (mine === seq.current) {
      setCounts(next);
      setSyncedAt(Date.now());
    }
  }, []);

  const run = useCallback(
    (optimistic: (c: Counts) => Counts, action: () => Promise<Counts>) => {
      const mine = ++seq.current;
      pending.current += 1;
      setCounts(optimistic);
      setError(null);
      queue.current = queue.current
        .then(async () => {
          try {
            applyServer(mine, await action());
          } catch (err) {
            console.error("check-in counter action failed", err);
            // The write may or may not have landed (e.g. a timeout after Redis
            // applied it), so don't tell the greeter to just tap again.
            setError(
              "Couldn't confirm that tap. The numbers below were re-synced from the server — check them before tapping again.",
            );
            try {
              applyServer(++seq.current, await getCounts());
            } catch {
              // keep the optimistic value; the next successful poll will correct it
            }
          } finally {
            pending.current -= 1;
          }
        });
    },
    [applyServer],
  );

  // Poll so a second phone sees this one's taps. Skipped while a tap is in flight.
  useEffect(() => {
    const id = setInterval(async () => {
      if (pending.current > 0 || document.hidden) return;
      try {
        const mine = ++seq.current;
        applyServer(mine, await getCounts());
      } catch {
        // transient; the tile shows the last synced time
      }
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [applyServer]);

  const add = (key: CounterKey, n: number) =>
    run(
      (c) => ({ ...c, [key]: Math.max(0, c[key] + n) }),
      () => adjust(key, n),
    );

  const inRoom = counts.arrivals - counts.departures;
  const overCounted = inRoom < 0;
  const inRoomShown = Math.max(0, inRoom);
  const pct = capacity ? inRoomShown / capacity : 0;
  const capacityTone =
    capacity === null ? null : pct >= 1 ? "text-destructive" : pct >= 0.9 ? "text-chart-2" : "text-chart-4";
  const agoSec = Math.max(0, Math.round((now - syncedAt) / 1000));

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3">
        <Tile label="Checked in" value={counts.arrivals} detail="Total tonight · on the public board" accent="text-chart-1" />
        <Tile
          label="In the room now"
          value={inRoomShown}
          detail={
            capacity !== null
              ? `${inRoomShown} / ${capacity} · ${Math.round(pct * 100)}% of capacity`
              : `${counts.departures} left so far`
          }
          accent={capacityTone ?? "text-chart-4"}
        />
      </section>

      {overCounted ? (
        <Notice tone="warn">
          Departures exceed arrivals by {Math.abs(inRoom)}. Someone probably left without being counted in — use
          “Adjust” below to correct.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Panel icon={<LogIn className="size-5 text-chart-1" aria-hidden="true" />} title="Arrivals" hint="Tap once per person walking in.">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Button
            size="lg"
            className="h-24 text-4xl font-semibold tabular-nums"
            onClick={() => add("arrivals", 1)}
            aria-label="Add one arrival"
          >
            <Plus className="size-8" aria-hidden="true" /> 1
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-24 w-24 flex-col text-base"
            onClick={() => add("arrivals", -1)}
            aria-label="Undo one arrival"
          >
            <Minus className="size-5" aria-hidden="true" />
            undo
          </Button>
        </div>
        <AddN label="Group arriving" onSubmit={(n) => add("arrivals", n)} />
      </Panel>

      <Panel icon={<LogOut className="size-5 text-chart-2" aria-hidden="true" />} title="Departures" hint="Tap once per person leaving — takes one off the room count.">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Button
            size="lg"
            variant="secondary"
            className="h-20 text-3xl font-semibold tabular-nums"
            onClick={() => add("departures", 1)}
            aria-label="One person left"
          >
            <Minus className="size-7" aria-hidden="true" /> 1
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-20 w-24 flex-col text-base"
            onClick={() => add("departures", -1)}
            aria-label="Undo one departure"
          >
            <Plus className="size-5" aria-hidden="true" />
            undo
          </Button>
        </div>
        <AddN label="Group leaving" verb="Remove" onSubmit={(n) => add("departures", n)} />
      </Panel>

      <details className="group border border-border bg-card">
        <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground group-open:text-foreground">
          Adjust / correct counts
        </summary>
        <div className="flex flex-col gap-5 border-t border-border px-5 py-5">
          <p className="text-sm text-muted-foreground">
            These overwrite the live numbers. Use them after a manual headcount, or if two greeters got out of sync.
          </p>
          <SetN
            label="Set total checked in to"
            max={MAX_TOTAL}
            onSubmit={(n) =>
              confirmThen(
                `Set total checked in to ${n} (currently ${counts.arrivals})? "In the room now" will read ${inRoomAfterSetTotal(counts, n)}.`,
                () =>
                  run(
                    (c) => ({ arrivals: n, departures: n - inRoomAfterSetTotal(c, n) }),
                    () => setArrivals(n),
                  ),
              )
            }
          />
          <SetN
            label="Set in the room now to"
            max={counts.arrivals}
            onSubmit={(n) =>
              confirmThen(`Set in-room count to ${n}? Total checked in stays ${counts.arrivals}.`, () =>
                run((c) => ({ ...c, departures: c.arrivals - n }), () => setInRoom(n)),
              )
            }
          />
          <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">Zero both counters (do this before doors open).</p>
            <Button
              variant="destructive"
              onClick={() =>
                confirmThen("Reset BOTH counters to zero? This can't be undone.", () =>
                  run(() => ({ arrivals: 0, departures: 0 }), () => reset()),
                )
              }
            >
              <RotateCcw aria-hidden="true" /> Reset
            </Button>
          </div>
        </div>
      </details>

      <p className="text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Live · synced {agoSec < 2 ? "just now" : `${agoSec}s ago`}
      </p>
    </div>
  );
}

function confirmThen(message: string, fn: () => void) {
  if (window.confirm(message)) fn();
}

function Tile({ label, value, detail, accent }: { label: string; value: number; detail: string; accent: string }) {
  return (
    <article className="border border-border bg-card p-4 sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-6xl font-semibold tabular-nums sm:text-7xl", accent)}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground sm:text-sm">{detail}</p>
    </article>
  );
}

function Panel({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-border border-t-2 border-t-foreground bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        {icon}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 border bg-card p-4 text-sm",
        tone === "error" ? "border-destructive text-destructive" : "border-chart-2",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function useNumberField(min: number, max: number) {
  const [raw, setRaw] = useState("");
  const value = raw.trim() === "" ? NaN : Number(raw);
  const valid = Number.isSafeInteger(value) && value >= min && value <= max;
  return { raw, setRaw, value, valid, clear: () => setRaw("") };
}

// Mirror the server-side limits in actions.ts.
const MAX_STEP = 500;
const MAX_TOTAL = 10_000;

function AddN({
  label,
  verb = "Add",
  onSubmit,
}: {
  label: string;
  verb?: string;
  onSubmit: (n: number) => void;
}) {
  const field = useNumberField(2, MAX_STEP);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!field.valid) return;
    onSubmit(field.value);
    field.clear();
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-[1fr_auto] gap-3">
      <Input
        type="number"
        inputMode="numeric"
        min={2}
        max={MAX_STEP}
        step={1}
        placeholder={`${label} — how many?`}
        value={field.raw}
        onChange={(e) => field.setRaw(e.target.value)}
        className="h-12 text-lg"
        aria-label={label}
      />
      <Button type="submit" variant="outline" size="lg" className="h-12 px-5 text-base" disabled={!field.valid}>
        {verb} {field.valid ? field.value : ""}
      </Button>
    </form>
  );
}

function SetN({ label, max, onSubmit }: { label: string; max: number; onSubmit: (n: number) => void }) {
  const field = useNumberField(0, max);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!field.valid) return;
    onSubmit(field.value);
    field.clear();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={field.raw}
          onChange={(e) => field.setRaw(e.target.value)}
          className="h-11"
          aria-label={label}
        />
        <Button type="submit" variant="outline" className="h-11 px-5" disabled={!field.valid}>
          Set
        </Button>
      </div>
    </form>
  );
}
