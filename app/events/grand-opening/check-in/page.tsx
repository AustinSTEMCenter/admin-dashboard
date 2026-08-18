import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { readCounts, type Counts } from "@/lib/checkin-counter";

import { Clicker } from "./clicker";

export const dynamic = "force-dynamic";

function capacityFromEnv(): number | null {
  const raw = process.env.GRAND_OPENING_CAPACITY;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default async function CheckInCounterPage() {
  const configured = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  let initial: Counts | null = null;
  if (configured) {
    try {
      initial = await readCounts();
    } catch (err) {
      console.error("check-in counter: initial read failed", err);
    }
  }

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-border pb-4">
          <div className="flex items-center justify-between gap-4 border-t-2 border-foreground pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>Austin STEM Center · Door</span>
            <span>Grand Opening</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Link
                href="/events/grand-opening"
                className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Grand Opening dashboard
              </Link>
              <h1 className="text-lg font-semibold uppercase tracking-widest sm:text-xl">Check-in counter</h1>
            </div>
            <UserButton />
          </div>
        </header>

        {initial ? (
          <Clicker initial={initial} capacity={capacityFromEnv()} />
        ) : (
          <section className="border border-border border-t-2 border-t-destructive bg-card px-6 py-12 text-center">
            <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold uppercase tracking-widest">
              {configured ? "Counter is unreachable" : "Counter is not configured"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {configured
                ? "Upstash Redis did not respond. Refresh in a moment; if it keeps failing, check the KV_REST_API_* environment variables."
                : "Connect the Upstash Redis store to this project in Vercel Storage, then redeploy."}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
