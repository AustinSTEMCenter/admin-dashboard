import "server-only";

import { createPrivateKey, createSign } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const TIME_ZONE = "America/Chicago";

const PARTY_SIZE_HEADER = "Total number of guests (including yourself)?";
const ORGANIZATION_HEADER = "Organization, Company, or School (if applicable)";
const TITLE_HEADER = "Job Title (if applicable)";
const SOURCE_HEADER = "How did you hear about this event?";
const OPT_IN_HEADER = "Would you like to receive updates from Austin STEM Center?";

const REQUIRED_HEADERS = [
  "guest_id",
  "name",
  "email",
  "phone_number",
  "created_at",
  "approval_status",
  "checked_in_at",
  PARTY_SIZE_HEADER,
  ORGANIZATION_HEADER,
  TITLE_HEADER,
  SOURCE_HEADER,
  OPT_IN_HEADER,
] as const;

const LEADERSHIP_TITLE_PATTERN =
  /\b(chief|ceo|cfo|cto|coo|president|founder|co-founder|cofounder|executive director|head of school|vice president|vp|board member|board president|board of directors|superintendent|principal|dean|professor|commissioner|council member|mayor|senator|representative)\b/i;

const STRATEGIC_ORGANIZATION_PATTERN =
  /\b(first|school|academy|college|university|education|stem|robotics|foundation|school district|isd|makerspace|women in technology)\b/i;

type ServiceAccountConfig = {
  email: string;
  privateKey: string;
  spreadsheetId: string;
  preferredSheetName?: string;
};

type ServiceAccountConfigResult =
  | { status: "configured"; config: ServiceAccountConfig }
  | { status: "missing" }
  | { status: "invalid_private_key" };

type CachedAccessToken = {
  token: string;
  expiresAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleSpreadsheetMetadata = {
  properties?: {
    title?: string;
  };
  sheets?: Array<{
    properties?: {
      title?: string;
      index?: number;
      sheetType?: string;
      gridProperties?: {
        rowCount?: number;
        columnCount?: number;
      };
    };
  }>;
};

type GoogleSheetValues = {
  values?: unknown[][];
};

type RegistrationTrendPoint = {
  date: string;
  label: string;
  registrations: number;
};

export type PriorityGuestCandidate = {
  guestId: string;
  name: string;
  organization: string;
  title: string;
  reasons: string[];
  score: number;
};

export type HeadcountFollowUp = {
  guestId: string;
  name: string;
  organization: string;
  title: string;
  response: string;
};

export type GrandOpeningDashboardData = {
  spreadsheetTitle: string;
  sheetName: string;
  loadedAt: string;
  latestRegistrationAt: string | null;
  registrations: number;
  approvedRegistrations: number;
  checkedInRegistrations: number;
  exactHeadcount: number;
  minimumHeadcount: number;
  openEndedPartyCount: number;
  updateOptIns: number;
  partySizeDistribution: Array<{ label: string; registrations: number }>;
  registrationTrend: RegistrationTrendPoint[];
  sourceDistribution: Array<{ label: string; registrations: number }>;
  priorityGuestCandidates: PriorityGuestCandidate[];
  headcountFollowUps: HeadcountFollowUp[];
  dataQuality: {
    missingPhone: number;
    missingOrganization: number;
    missingTitle: number;
    missingSource: number;
    duplicateEmailGroups: number;
    duplicatePhoneGroups: number;
  };
};

export type GrandOpeningDashboardResult =
  | { status: "connected"; data: GrandOpeningDashboardData }
  | { status: "not_configured" }
  | { status: "invalid_credentials" }
  | { status: "needs_permission" }
  | { status: "invalid_data" }
  | { status: "unavailable" };

class GoogleSheetsRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleSheetsRequestError";
    this.status = status;
  }
}

let cachedAccessToken: CachedAccessToken | undefined;

function getConfig(): ServiceAccountConfigResult {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const spreadsheetId = process.env.LUMA_GUESTS_SPREADSHEET_ID?.trim();
  const preferredSheetName = process.env.LUMA_GUESTS_SHEET_NAME?.trim();

  if (!email || !privateKey || !spreadsheetId) {
    return { status: "missing" };
  }

  if (
    !privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.endsWith("-----END PRIVATE KEY-----")
  ) {
    return { status: "invalid_private_key" };
  }

  try {
    createPrivateKey(privateKey);
  } catch {
    return { status: "invalid_private_key" };
  }

  return {
    status: "configured",
    config: { email, privateKey, spreadsheetId, preferredSheetName },
  };
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function getAccessToken(config: ServiceAccountConfig) {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: config.email,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = encodeBase64Url(signer.sign(config.privateKey));

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !body.access_token) {
    throw new GoogleSheetsRequestError(
      response.status,
      body.error_description ?? body.error ?? "Google authentication failed",
    );
  }

  cachedAccessToken = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600),
  };

  return body.access_token;
}

async function fetchGoogleJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GoogleSheetsRequestError(response.status, `Google Sheets returned ${response.status}`);
  }

  return (await response.json()) as T;
}

function columnLabel(columnCount: number) {
  let value = columnCount;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function quoteSheetName(sheetName: string) {
  return `'${sheetName.replaceAll("'", "''")}'`;
}

function cellValue(row: unknown[], index: number | undefined) {
  if (index === undefined) {
    return "";
  }

  const value = row[index];
  return value === null || value === undefined ? "" : String(value).trim();
}

function chicagoDayKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function formatDayLabel(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function duplicateGroupCount(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value.includes("@")
      ? value.toLowerCase().trim()
      : value.replace(/\D/g, "");
    if (normalized) {
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.values()].filter((count) => count > 1).length;
}

function parseDashboardData(
  spreadsheetTitle: string,
  sheetName: string,
  values: unknown[][],
): GrandOpeningDashboardData | null {
  const headers = (values[0] ?? []).map((value) => String(value ?? "").trim());
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));

  if (REQUIRED_HEADERS.some((header) => !headerIndexes.has(header))) {
    return null;
  }

  const rows = values
    .slice(1)
    .filter((row) => row.some((value) => value !== null && value !== undefined && String(value).trim()));
  const index = (header: string) => headerIndexes.get(header);
  const distribution = new Map<string, number>();
  const sources = new Map<string, number>();
  const registrationsByDay = new Map<string, number>();
  const emails: string[] = [];
  const phones: string[] = [];
  const priorityGuestCandidates: PriorityGuestCandidate[] = [];
  const headcountFollowUps: HeadcountFollowUp[] = [];
  let approvedRegistrations = 0;
  let checkedInRegistrations = 0;
  let exactHeadcount = 0;
  let minimumHeadcount = 0;
  let openEndedPartyCount = 0;
  let updateOptIns = 0;
  let missingPhone = 0;
  let missingOrganization = 0;
  let missingTitle = 0;
  let missingSource = 0;
  let latestRegistrationAt: string | null = null;

  for (const row of rows) {
    const guestId = cellValue(row, index("guest_id"));
    const name = cellValue(row, index("name")) || "Unnamed guest";
    const email = cellValue(row, index("email"));
    const phone = cellValue(row, index("phone_number"));
    const createdAt = cellValue(row, index("created_at"));
    const approvalStatus = cellValue(row, index("approval_status")).toLowerCase();
    const checkedInAt = cellValue(row, index("checked_in_at"));
    const partySize = cellValue(row, index(PARTY_SIZE_HEADER));
    const organization = cellValue(row, index(ORGANIZATION_HEADER));
    const title = cellValue(row, index(TITLE_HEADER));
    const source = cellValue(row, index(SOURCE_HEADER));
    const optIn = cellValue(row, index(OPT_IN_HEADER)).toLowerCase();

    if (email) emails.push(email);
    if (phone) phones.push(phone);
    if (!phone) missingPhone += 1;
    if (!organization) missingOrganization += 1;
    if (!title) missingTitle += 1;
    if (!source) missingSource += 1;
    if (approvalStatus === "approved") approvedRegistrations += 1;
    if (checkedInAt) checkedInRegistrations += 1;
    if (optIn === "yes") updateOptIns += 1;

    const createdAtTime = Date.parse(createdAt);
    if (
      Number.isFinite(createdAtTime) &&
      (!latestRegistrationAt || createdAtTime > Date.parse(latestRegistrationAt))
    ) {
      latestRegistrationAt = createdAt;
    }

    const dayKey = chicagoDayKey(createdAt);
    if (dayKey) {
      registrationsByDay.set(dayKey, (registrationsByDay.get(dayKey) ?? 0) + 1);
    }

    const sourceLabel = source || "Not provided";
    sources.set(sourceLabel, (sources.get(sourceLabel) ?? 0) + 1);

    if (partySize === "5+") {
      openEndedPartyCount += 1;
      minimumHeadcount += 5;
      distribution.set("5+", (distribution.get("5+") ?? 0) + 1);
      headcountFollowUps.push({ guestId, name, organization, title, response: partySize });
    } else {
      const parsedPartySize = Number(partySize);
      if (Number.isFinite(parsedPartySize) && parsedPartySize >= 1) {
        exactHeadcount += parsedPartySize;
        minimumHeadcount += parsedPartySize;
        distribution.set(partySize, (distribution.get(partySize) ?? 0) + 1);
      }
    }

    const reasons: string[] = [];
    let score = 0;
    const titleIsLeadership = LEADERSHIP_TITLE_PATTERN.test(title) && !/domestic ceo/i.test(title);
    const organizationIsStrategic = STRATEGIC_ORGANIZATION_PATTERN.test(organization);

    if (titleIsLeadership) {
      reasons.push("Leadership role");
      score += 2;
    }

    if (organizationIsStrategic) {
      reasons.push("STEM or education organization");
      score += 1;
    }

    if (score > 0) {
      priorityGuestCandidates.push({ guestId, name, organization, title, reasons, score });
    }
  }

  return {
    spreadsheetTitle,
    sheetName,
    loadedAt: new Date().toISOString(),
    latestRegistrationAt,
    registrations: rows.length,
    approvedRegistrations,
    checkedInRegistrations,
    exactHeadcount,
    minimumHeadcount,
    openEndedPartyCount,
    updateOptIns,
    partySizeDistribution: [...distribution.entries()]
      .sort(([left], [right]) => {
        if (left === "5+") return 1;
        if (right === "5+") return -1;
        return Number(left) - Number(right);
      })
      .map(([label, registrations]) => ({ label, registrations })),
    registrationTrend: [...registrationsByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, registrations]) => ({ date, label: formatDayLabel(date), registrations })),
    sourceDistribution: [...sources.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([label, registrations]) => ({ label, registrations })),
    priorityGuestCandidates: priorityGuestCandidates.sort(
      (left, right) => right.score - left.score || left.name.localeCompare(right.name),
    ),
    headcountFollowUps: headcountFollowUps.sort((left, right) => left.name.localeCompare(right.name)),
    dataQuality: {
      missingPhone,
      missingOrganization,
      missingTitle,
      missingSource,
      duplicateEmailGroups: duplicateGroupCount(emails),
      duplicatePhoneGroups: duplicateGroupCount(phones),
    },
  };
}

export async function getGrandOpeningDashboardData(): Promise<GrandOpeningDashboardResult> {
  const configResult = getConfig();

  if (configResult.status === "missing") {
    return { status: "not_configured" };
  }

  if (configResult.status === "invalid_private_key") {
    return { status: "invalid_credentials" };
  }

  const { config } = configResult;

  try {
    const accessToken = await getAccessToken(config);
    const metadataFields = encodeURIComponent(
      "properties.title,sheets.properties(title,index,sheetType,gridProperties(rowCount,columnCount))",
    );
    const metadata = await fetchGoogleJson<GoogleSpreadsheetMetadata>(
      `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(config.spreadsheetId)}?fields=${metadataFields}`,
      accessToken,
    );
    const gridSheets = (metadata.sheets ?? [])
      .filter((sheet) => sheet.properties?.sheetType === "GRID" && sheet.properties.title)
      .sort((left, right) => (left.properties?.index ?? 0) - (right.properties?.index ?? 0));
    const selectedSheet = config.preferredSheetName
      ? gridSheets.find((sheet) => sheet.properties?.title === config.preferredSheetName)
      : gridSheets[0];
    const sheetName = selectedSheet?.properties?.title;

    if (!sheetName) {
      return { status: "invalid_data" };
    }

    const rowCount = Math.max(selectedSheet.properties?.gridProperties?.rowCount ?? 1, 1);
    const columnCount = Math.max(selectedSheet.properties?.gridProperties?.columnCount ?? 1, 1);
    const range = `${quoteSheetName(sheetName)}!A1:${columnLabel(columnCount)}${rowCount}`;
    const values = await fetchGoogleJson<GoogleSheetValues>(
      `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      accessToken,
    );
    const dashboard = parseDashboardData(metadata.properties?.title ?? "Grand Opening Registrants", sheetName, values.values ?? []);

    return dashboard ? { status: "connected", data: dashboard } : { status: "invalid_data" };
  } catch (error) {
    console.error("Failed to load the Grand Opening guest dashboard", error);

    if (error instanceof GoogleSheetsRequestError && [401, 403, 404].includes(error.status)) {
      return { status: "needs_permission" };
    }

    return { status: "unavailable" };
  }
}
