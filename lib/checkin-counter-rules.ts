// Pure helpers shared by the server actions and the client clicker
// (lib/checkin-counter.ts is server-only, so this lives apart).

export type Counts = { arrivals: number; departures: number };

/**
 * What "in the room now" becomes when the total is overwritten to `total`.
 * If nobody has been counted out yet, everyone checked in is in the room, so
 * it follows the total. Otherwise the room count is something the greeter has
 * been tracking, so it stays put (clamped to the new total).
 */
export function inRoomAfterSetTotal(current: Counts, total: number): number {
  const room = Math.max(0, current.arrivals - current.departures);
  return current.departures === 0 ? total : Math.min(total, room);
}
