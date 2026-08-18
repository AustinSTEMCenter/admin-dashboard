"use server";

import { auth } from "@clerk/nextjs/server";

import { inRoomAfterSetTotal } from "@/lib/checkin-counter-rules";
import {
  addTo,
  readCounts,
  resetCounts,
  setCounts,
  type Counts,
  type CounterKey,
} from "@/lib/checkin-counter";

// Guardrail against fat-fingered "Add 1100" — a single tap should never move
// a counter by more than a big group.
const MAX_STEP = 500;
const MAX_TOTAL = 10_000;

async function requireUser(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
}

function assertInt(n: number, min: number, max: number): void {
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid amount: ${n}`);
  }
}

export async function getCounts(): Promise<Counts> {
  await requireUser();
  return readCounts();
}

export async function adjust(key: CounterKey, n: number): Promise<Counts> {
  await requireUser();
  assertInt(n, -MAX_STEP, MAX_STEP);
  await addTo(key, n);
  return readCounts();
}

/** Set the total checked in; see inRoomAfterSetTotal for what the room count does. */
export async function setArrivals(n: number): Promise<Counts> {
  await requireUser();
  assertInt(n, 0, MAX_TOTAL);
  const current = await readCounts();
  const inRoom = inRoomAfterSetTotal(current, n);
  await setCounts({ arrivals: n, departures: n - inRoom });
  return readCounts();
}

/** Set "in the room now" by recomputing departures from the current total. */
export async function setInRoom(n: number): Promise<Counts> {
  await requireUser();
  const { arrivals } = await readCounts();
  // In-room can't exceed total checked in; the form mirrors this bound.
  assertInt(n, 0, arrivals);
  await setCounts({ arrivals, departures: arrivals - n });
  return readCounts();
}

export async function reset(): Promise<Counts> {
  await requireUser();
  await resetCounts();
  return readCounts();
}
