import Image from "next/image";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowUpRight,
  ArrowRight,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  ListChecks,
  MapPin,
  Search,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  GOOGLE_WORKSPACE_OAUTH_SCOPES,
  getGoogleWorkspaceData,
  type GoogleCalendarEvent,
  type GoogleDataResult,
  type GoogleDriveFile,
} from "@/lib/google-workspace";
import { getClickUpData, type ClickUpData, type ClickUpTask } from "@/lib/clickup";
import { chicagoDayKey, getWeekDays, TIME_ZONE, type WeekDay } from "@/lib/week";
import { cn } from "@/lib/utils";

const CALENDAR_URL = "https://calendar.google.com";
const DRIVE_URL = "https://drive.google.com";
const CLICKUP_URL = "https://app.clickup.com";

export const dynamic = "force-dynamic";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 border border-foreground/40 px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
    >
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function SectionHeader({
  index,
  logo,
  title,
  detail,
}: {
  index: string;
  logo: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center border border-border bg-white p-2">
        {/* unoptimized: the default image optimizer refuses SVGs */}
        <Image src={logo} alt="" width={24} height={24} unoptimized className="size-full object-contain" />
      </div>
      <div>
        <h2 className="flex items-baseline gap-2 text-sm font-semibold uppercase tracking-widest">
          <span className="font-mono text-chart-2" aria-hidden="true">
            {index}
          </span>
          {title}
        </h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex min-h-56 flex-col items-center justify-center border border-dashed border-border px-6 py-8 text-center">
      {Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden="true" /> : null}
      <p className={cn("text-sm font-medium", Icon && "mt-3")}>{title}</p>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}

function GoogleConnectionNotice({
  service,
  status,
}: {
  service: string;
  status: Exclude<GoogleDataResult<unknown>["status"], "connected">;
}) {
  const title =
    status === "needs_reconnect"
      ? `${service} needs to be reconnected`
      : `${service} is not connected`;

  const message =
    status === "needs_reconnect"
      ? "Your Google connection expired and could not be refreshed. Reconnect your account to resume loading data."
      : status === "needs_permission"
        ? "Google did not grant the required read-only permission. Confirm the Calendar and Drive APIs are enabled, then reconnect your account."
        : status === "unavailable"
          ? "Google could not be reached right now. Please try again in a moment."
          : "Connect your Google account to securely show your own data in this dashboard.";

  return (
    <EmptyState title={title} message={message}>
      {status !== "unavailable" ? (
        <Link
          href="/account"
          className="mt-4 bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
        >
          {status === "needs_reconnect" ? "Reconnect Google" : "Connect Google data"}
        </Link>
      ) : null}
    </EmptyState>
  );
}

function groupEventsByDay(events: GoogleCalendarEvent[], days: WeekDay[]) {
  const grouped = new Map<string, GoogleCalendarEvent[]>(days.map((day) => [day.key, []]));
  const sundayKey = days[0].key;

  for (const event of events) {
    let key = event.start.date ?? (event.start.dateTime ? chicagoDayKey(new Date(event.start.dateTime)) : sundayKey);

    // Ongoing events that started before this week still belong on Sunday.
    if (key < sundayKey) {
      key = sundayKey;
    }

    grouped.get(key)?.push(event);
  }

  return grouped;
}

function formatEventTime(event: GoogleCalendarEvent) {
  if (event.start.date || !event.start.dateTime) {
    return "All day";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(event.start.dateTime));
}

function EventChip({ event }: { event: GoogleCalendarEvent }) {
  return (
    <a
      href={event.htmlLink ?? CALENDAR_URL}
      target="_blank"
      rel="noreferrer"
      className="block border-l-2 border-foreground bg-secondary px-2 py-1.5 transition-colors hover:bg-accent"
    >
      <span className="block truncate text-xs font-medium">{event.title || "Untitled event"}</span>
      <span className="mt-0.5 block font-mono text-[10px] uppercase text-muted-foreground">
        {formatEventTime(event)}
      </span>
      {event.location ? (
        <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </span>
      ) : null}
    </a>
  );
}

function CalendarWeekView({ calendar }: { calendar: GoogleDataResult<GoogleCalendarEvent[]> }) {
  if (calendar.status !== "connected") {
    return <GoogleConnectionNotice service="Google Calendar" status={calendar.status} />;
  }

  const days = getWeekDays();
  const grouped = groupEventsByDay(calendar.data, days);

  return (
    <>
      {/* Week grid on tablet and up */}
      <div className="mt-6 hidden overflow-hidden border border-border md:grid md:grid-cols-7 md:divide-x md:divide-border">
        {days.map((day) => (
          <div
            key={day.key}
            className={cn(
              "flex min-h-48 flex-col p-2",
              day.isToday && "bg-secondary/40",
              day.isPast && "opacity-60",
            )}
          >
            <p className="flex items-center gap-1.5 px-1 pb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {day.isToday ? <span className="size-1.5 bg-chart-2" aria-hidden="true" /> : null}
              <span className={cn(day.isToday && "font-semibold text-chart-2")}>{day.weekday}</span>{" "}
              {day.dayLabel}
            </p>
            <div className="flex flex-col gap-1.5">
              {(grouped.get(day.key) ?? []).map((event) => (
                <EventChip key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stacked days on phones */}
      <div className="mt-6 divide-y divide-border border border-border md:hidden">
        {days.map((day) => {
          const events = grouped.get(day.key) ?? [];

          return (
            <div
              key={day.key}
              className={cn(
                "flex gap-3 px-4 py-3",
                day.isToday && "bg-secondary/40",
                day.isPast && "opacity-60",
              )}
            >
              <p className="w-16 shrink-0 pt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className={cn("block", day.isToday && "font-semibold text-chart-2")}>
                  {day.weekday}
                </span>
                {day.dayLabel}
              </p>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {events.length > 0 ? (
                  events.map((event) => <EventChip key={event.id} event={event} />)
                ) : (
                  <p className="pt-1.5 text-xs text-muted-foreground">No events</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatModifiedTime(modifiedTime?: string) {
  if (!modifiedTime) {
    return "Recently updated";
  }

  const differenceInHours = Math.max(
    0,
    Math.round((Date.now() - new Date(modifiedTime).getTime()) / (60 * 60 * 1000)),
  );

  if (differenceInHours < 1) {
    return "Updated this hour";
  }

  if (differenceInHours < 24) {
    return `Updated ${differenceInHours}h ago`;
  }

  const differenceInDays = Math.round(differenceInHours / 24);
  return `Updated ${differenceInDays}d ago`;
}

function DriveFileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/vnd.google-apps.folder") {
    return <FolderOpen className="size-5 shrink-0 text-chart-3" aria-hidden="true" />;
  }

  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return <FileSpreadsheet className="size-5 shrink-0 text-chart-4" aria-hidden="true" />;
  }

  return <FileText className="size-5 shrink-0 text-chart-1" aria-hidden="true" />;
}

function DriveContent({ drive }: { drive: GoogleDataResult<GoogleDriveFile[]> }) {
  if (drive.status !== "connected") {
    return <GoogleConnectionNotice service="Google Drive" status={drive.status} />;
  }

  if (drive.data.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No Drive files found"
        message="Files that you can access in Google Drive will appear here."
      />
    );
  }

  return (
    <div className="mt-6 divide-y divide-border overflow-hidden border border-border">
      {drive.data.map((file) => (
        <a
          key={file.id}
          href={file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary"
        >
          <DriveFileIcon mimeType={file.mimeType} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{file.name || "Untitled file"}</span>
            <span className="mt-0.5 block font-mono text-[11px] uppercase text-muted-foreground">
              {formatModifiedTime(file.modifiedTime)}
            </span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const due = new Date(Number(dueDate));
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(due);

  return { label: `Due ${label}`, overdue: due.getTime() < Date.now() };
}

function ClickUpTaskRow({ task }: { task: ClickUpTask }) {
  const due = formatDueDate(task.due_date);

  return (
    <a
      href={task.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary"
    >
      <span
        className="size-2.5 shrink-0"
        style={{ backgroundColor: task.status.color }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.name}</span>
        <span className="mt-0.5 block truncate font-mono text-[11px] uppercase text-muted-foreground">
          {task.list.name}
          {due ? (
            <>
              {" · "}
              <span className={cn(due.overdue && "text-destructive")}>{due.label}</span>
            </>
          ) : null}
        </span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

function ClickUpContent({ clickup }: { clickup: ClickUpData }) {
  if (clickup.status === "not_configured") {
    return (
      <div className="mt-6 flex min-h-56 flex-col items-center justify-center border border-dashed border-border px-6 py-8 text-center">
        <span className="border border-border bg-secondary px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-widest text-secondary-foreground">
          Coming soon
        </span>
        <p className="mt-3 text-sm font-medium">ClickUp tasks will live here</p>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Soon you&apos;ll be able to connect ClickUp and see the tasks assigned to you across our
          workspace.
        </p>
      </div>
    );
  }

  if (clickup.status === "unavailable") {
    return (
      <EmptyState
        title="ClickUp could not be reached"
        message="Please try again in a moment."
      />
    );
  }

  if (clickup.status !== "connected") {
    return (
      <EmptyState
        title={
          clickup.status === "needs_reconnect"
            ? "ClickUp needs to be reconnected"
            : "ClickUp is not connected"
        }
        message={
          clickup.status === "needs_reconnect"
            ? "Access to ClickUp was revoked. Reconnect your account to resume loading your tasks."
            : "Connect your ClickUp account to see the tasks assigned to you across our workspace."
        }
      >
        <a
          href="/api/clickup/connect"
          className="mt-4 bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
        >
          {clickup.status === "needs_reconnect" ? "Reconnect ClickUp" : "Connect ClickUp"}
        </a>
      </EmptyState>
    );
  }

  if (clickup.tasks.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No open tasks assigned to you"
        message="Tasks assigned to you in ClickUp will appear here."
      />
    );
  }

  return (
    <div className="mt-6 divide-y divide-border overflow-hidden border border-border">
      {clickup.tasks.map((task) => (
        <ClickUpTaskRow key={task.id} task={task} />
      ))}
    </div>
  );
}

export default async function Dashboard() {
  const [workspace, clickup] = await Promise.all([getGoogleWorkspaceData(), getClickUpData()]);
  const week = getWeekDays();

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6">
          <div className="flex items-center justify-between gap-4 border-t-2 border-foreground pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>Austin STEM Center · Internal Operations</span>
            <span className="text-right">
              WK {week[0].key} → {week[6].key}
            </span>
          </div>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
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
              <h1 className="text-lg font-semibold uppercase tracking-widest sm:text-xl">
                Admin dashboard
              </h1>
            </div>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="hidden font-mono text-[11px] uppercase tracking-widest text-muted-foreground sm:inline">
                Your workspace
              </span>
              <UserButton
                userProfileProps={{
                  additionalOAuthScopes: { google: GOOGLE_WORKSPACE_OAUTH_SCOPES },
                }}
              />
            </div>
          </div>
        </header>

        <Link
          href="/events/grand-opening"
          className="group flex flex-col justify-between gap-5 border border-chart-2 border-l-4 bg-card p-5 transition-colors hover:bg-secondary sm:flex-row sm:items-center sm:p-6"
        >
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center bg-chart-2 text-white">
              <UsersRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-chart-2">
                Live event operations
              </p>
              <h2 className="mt-1 text-lg font-semibold uppercase tracking-widest">
                Grand Opening guest dashboard
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Headcount, registration activity, priority guest review, and follow-up flags.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 self-end text-xs font-semibold uppercase tracking-widest sm:self-auto">
            Open dashboard
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>

        <section className="border border-border border-t-2 border-t-foreground bg-card p-5 text-card-foreground sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <SectionHeader
              index="01"
              logo="/logos/google-calendar.svg"
              title="Google Calendar"
              detail="This week, Sunday through Saturday, from your primary calendar."
            />
            <ExternalLink href={CALENDAR_URL}>Open Calendar</ExternalLink>
          </div>
          <CalendarWeekView calendar={workspace.calendar} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="border border-border border-t-2 border-t-foreground bg-card p-5 text-card-foreground sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <SectionHeader
                index="02"
                logo="/logos/google-drive.svg"
                title="Google Drive"
                detail="Your eight most recently modified Drive files."
              />
              <ExternalLink href={DRIVE_URL}>Open Drive</ExternalLink>
            </div>
            <div className="mt-5 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Search className="size-3.5" aria-hidden="true" />
              Metadata only — file contents stay in Google Drive.
            </div>
            <DriveContent drive={workspace.drive} />
          </section>

          <section className="border border-border border-t-2 border-t-foreground bg-card p-5 text-card-foreground sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <SectionHeader
                index="03"
                logo="/logos/clickup.svg"
                title="ClickUp Tasks"
                detail="Open tasks assigned to you, ordered by due date."
              />
              <ExternalLink href={CLICKUP_URL}>Open ClickUp</ExternalLink>
            </div>
            <ClickUpContent clickup={clickup} />
          </section>
        </section>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>Design reference</span>
          <a
            href="/design/vibe-lab.html"
            target="_blank"
            rel="noreferrer"
            className="text-foreground transition-colors hover:text-chart-2"
          >
            Public-site vibe lab ↗
          </a>
          <a
            href="/design/joyful-discovery-mock.html"
            target="_blank"
            rel="noreferrer"
            className="text-foreground transition-colors hover:text-chart-2"
          >
            Joyful admin mock ↗
          </a>
        </footer>
      </main>
    </div>
  );
}
