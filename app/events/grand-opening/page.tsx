import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  MailCheck,
  UsersRound,
} from "lucide-react";

import { GOOGLE_WORKSPACE_OAUTH_SCOPES } from "@/lib/google-workspace";
import {
  getGrandOpeningDashboardData,
  type GrandOpeningDashboardData,
} from "@/lib/luma-guests";
import { cn } from "@/lib/utils";

const TIME_ZONE = "America/Chicago";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No timestamp available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  accent?: "orange" | "green" | "blue";
}) {
  return (
    <article className="border border-border bg-card p-5 text-card-foreground">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-3 text-4xl font-semibold tabular-nums",
          accent === "orange" && "text-chart-2",
          accent === "green" && "text-chart-4",
          accent === "blue" && "text-chart-1",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

function BarList({
  items,
  colorClass = "bg-chart-1",
}: {
  items: Array<{ label: string; registrations: number }>;
  colorClass?: string;
}) {
  const maximum = Math.max(...items.map((item) => item.registrations), 1);

  return (
    <div className="mt-6 space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {item.registrations}
            </span>
          </div>
          <div className="h-2 bg-secondary" aria-hidden="true">
            <div
              className={cn("h-full", colorClass)}
              style={{ width: `${Math.max((item.registrations / maximum) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DataState({
  status,
}: {
  status:
    | "not_configured"
    | "invalid_credentials"
    | "needs_permission"
    | "invalid_data"
    | "unavailable";
}) {
  const content = {
    not_configured: {
      title: "Grand Opening data is not configured",
      message:
        "Add the Sheets service-account environment variables described in the README, then redeploy the dashboard.",
    },
    invalid_credentials: {
      title: "The Google service-account key is invalid",
      message:
        "Replace GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY with the complete private_key value from the downloaded JSON file, including the BEGIN and END PRIVATE KEY lines, then restart the development server.",
    },
    needs_permission: {
      title: "The dashboard cannot read the guest sheet",
      message:
        "Confirm the Google Sheets API is enabled and the source spreadsheet is shared with the configured service account as a viewer.",
    },
    invalid_data: {
      title: "The guest export has an unexpected structure",
      message:
        "Confirm the configured tab contains the original Luma header row and that the tab name matches the environment setting.",
    },
    unavailable: {
      title: "Grand Opening data is temporarily unavailable",
      message: "Google Sheets could not be reached. Try refreshing this page in a moment.",
    },
  }[status];

  return (
    <section className="border border-border border-t-2 border-t-destructive bg-card px-6 py-16 text-center">
      <AlertTriangle className="mx-auto size-6 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold uppercase tracking-widest">{content.title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{content.message}</p>
    </section>
  );
}

function DashboardContent({ data }: { data: GrandOpeningDashboardData }) {
  const optInRate = data.registrations
    ? Math.round((data.updateOptIns / data.registrations) * 100)
    : 0;
  const priorityGuests = data.priorityGuestCandidates.slice(0, 16);
  const sources = data.sourceDistribution.slice(0, 7);
  const qualityChecks = [
    { label: "Missing phone", value: data.dataQuality.missingPhone },
    { label: "Missing organization", value: data.dataQuality.missingOrganization },
    { label: "Missing title", value: data.dataQuality.missingTitle },
    { label: "Missing source", value: data.dataQuality.missingSource },
    { label: "Duplicate email groups", value: data.dataQuality.duplicateEmailGroups },
    { label: "Duplicate phone groups", value: data.dataQuality.duplicatePhoneGroups },
  ];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Registration records"
          value={data.registrations}
          detail={`${data.approvedRegistrations} approved · ${data.checkedInRegistrations} checked in`}
          accent="blue"
        />
        <MetricCard
          label="Minimum headcount"
          value={data.minimumHeadcount}
          detail={`${data.exactHeadcount} from exact party sizes, plus minimums for 5+`}
          accent="green"
        />
        <MetricCard
          label="Exact counts needed"
          value={data.openEndedPartyCount}
          detail="Registrations that selected 5+ guests"
          accent="orange"
        />
        <MetricCard
          label="ASC update opt-ins"
          value={data.updateOptIns}
          detail={`${optInRate}% of registration records`}
        />
      </section>

      {data.openEndedPartyCount > 0 ? (
        <section className="flex flex-col gap-3 border border-chart-2 bg-card p-5 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0 text-chart-2" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold uppercase tracking-widest">Capacity count is still open</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.minimumHeadcount} is a floor. Follow up with {data.openEndedPartyCount} parties that
              selected 5+ to get the true attendance count.
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 size-5 text-chart-1" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest">Registration activity</h2>
              <p className="mt-1 text-sm text-muted-foreground">Daily registrations in Central Time.</p>
            </div>
          </div>
          <BarList items={data.registrationTrend} colorClass="bg-chart-1" />
        </section>

        <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <UsersRound className="mt-0.5 size-5 text-chart-4" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest">Party sizes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Registration records by response.</p>
            </div>
          </div>
          <BarList items={data.partySizeDistribution} colorClass="bg-chart-4" />
        </section>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 size-5 text-chart-3" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest">How guests heard</h2>
              <p className="mt-1 text-sm text-muted-foreground">Top self-reported discovery sources.</p>
            </div>
          </div>
          <BarList items={sources} colorClass="bg-chart-3" />
        </section>

        <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 size-5 text-chart-5" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest">Data-quality review</h2>
              <p className="mt-1 text-sm text-muted-foreground">Flags only—no records are changed here.</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
            {qualityChecks.map((check) => (
              <div key={check.label} className="bg-card p-4">
                <p className="text-2xl font-semibold tabular-nums">{check.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{check.label}</p>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 size-5 text-chart-2" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest">Headcount follow-up</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Parties requiring an exact count. Contact details remain in the restricted source sheet.
              </p>
            </div>
          </div>
          <span className="border border-chart-2 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-chart-2">
            {data.headcountFollowUps.length} open
          </span>
        </div>

        {data.headcountFollowUps.length > 0 ? (
          <div className="mt-6 overflow-x-auto border border-border">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-secondary font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Registrant</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 text-right font-medium">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.headcountFollowUps.map((guest) => (
                  <tr key={guest.guestId || guest.name}>
                    <td className="px-4 py-3 font-medium">{guest.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{guest.organization || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{guest.title || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-chart-2">
                      {guest.response}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 flex items-center gap-2 border border-border bg-secondary/40 p-4 text-sm">
            <CheckCircle2 className="size-4 text-chart-4" aria-hidden="true" />
            Every party has an exact headcount.
          </div>
        )}
      </section>

      <section className="border border-border border-t-2 border-t-foreground bg-card p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest">Priority guest review</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Automatically surfaced from self-reported leadership titles and STEM or education organizations.
              This is a review queue, not a final VIP designation.
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Showing {priorityGuests.length} of {data.priorityGuestCandidates.length}
          </span>
        </div>

        <div className="mt-6 overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-secondary font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Why surfaced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {priorityGuests.map((guest) => (
                <tr key={guest.guestId || `${guest.name}-${guest.organization}`}>
                  <td className="px-4 py-3 font-medium">{guest.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{guest.organization || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{guest.title || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {guest.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="border border-border bg-secondary px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Restricted source · {data.spreadsheetTitle}</span>
        <span>
          Loaded {formatTimestamp(data.loadedAt)} · Latest registration {formatTimestamp(data.latestRegistrationAt)}
        </span>
      </footer>
    </>
  );
}

export default async function GrandOpeningDashboard() {
  const result = await getGrandOpeningDashboardData();

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6">
          <div className="flex items-center justify-between gap-4 border-t-2 border-foreground pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>Austin STEM Center · Event Operations</span>
            <span className="text-right">Grand Opening</span>
          </div>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <Link
                href="/dashboard"
                className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Admin dashboard
              </Link>
              <div className="flex items-center gap-4">
                <Image
                  src="/asc-logo-horizontal.png"
                  alt="Austin STEM Center"
                  width={1600}
                  height={467}
                  priority
                  className="h-10 w-auto sm:h-12"
                />
                <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
                <div>
                  <h1 className="text-lg font-semibold uppercase tracking-widest sm:text-xl">
                    Grand Opening
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">Guest intelligence and capacity planning</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <Link
                href="/events/grand-opening/check-in"
                className="inline-flex items-center gap-2 border border-foreground px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
              >
                Door check-in counter
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
              <span className="hidden font-mono text-[11px] uppercase tracking-widest text-muted-foreground sm:inline">
                Internal only
              </span>
              <UserButton
                userProfileProps={{
                  additionalOAuthScopes: { google: GOOGLE_WORKSPACE_OAUTH_SCOPES },
                }}
              />
            </div>
          </div>
        </header>

        {result.status === "connected" ? <DashboardContent data={result.data} /> : <DataState status={result.status} />}

        <Link
          href="/dashboard"
          className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-widest transition-colors hover:text-chart-2"
        >
          Return to admin dashboard
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </main>
    </div>
  );
}
