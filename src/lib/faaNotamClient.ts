import { PreflightError } from "./errors.js";

const FAA_NOTAM_BASE_URL = "https://external-api.faa.gov/notamapi/v1/notams";

export interface FaaCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * FAA NOTAM Search API credentials are never in this repo — they're read from
 * the server process's environment at call time, so nothing needs to change
 * here once a real client_id/client_secret pair is configured.
 */
export function getFaaNotamCredentials(): FaaCredentials | null {
  const clientId = process.env.FAA_NOTAM_CLIENT_ID;
  const clientSecret = process.env.FAA_NOTAM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Shapes below follow FAA's publicly documented NOTAM Search API v1 (geoJson
 * response format, ICAO/AIXM "core NOTAM data" schema). This account has no
 * registered credentials, so decodeNotam() has NOT been verified against a
 * live response. If real output doesn't match once credentials exist, this
 * is the only place that should need adjusting — fetchNotams()'s HTTP/auth
 * handling is independent of the payload shape.
 */
interface RawNotamCore {
  id: string;
  number: string;
  type: string;
  issued: string;
  location: string;
  effectiveStart: string;
  effectiveEnd: string;
  text: string;
  classification: string;
}

interface RawNotamItem {
  properties: {
    coreNOTAMData: {
      notam: RawNotamCore;
    };
  };
}

interface RawNotamResponse {
  pageNum: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  items: RawNotamItem[];
}

export interface DecodedNotam {
  number: string;
  type: string;
  issued: string;
  effectiveStart: string;
  effectiveEnd: string;
  text: string;
  classification: string;
}

function decodeNotam(raw: RawNotamCore): DecodedNotam {
  return {
    number: raw.number,
    type: raw.type,
    issued: raw.issued,
    effectiveStart: raw.effectiveStart,
    effectiveEnd: raw.effectiveEnd,
    text: raw.text,
    classification: raw.classification,
  };
}

export async function fetchNotams(
  icaoId: string,
  credentials: FaaCredentials,
  pageSize = 20,
): Promise<{ notams: DecodedNotam[]; totalCount: number }> {
  const url = `${FAA_NOTAM_BASE_URL}?icaoLocation=${icaoId}&pageSize=${pageSize}&responseFormat=geoJson`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      },
    });
  } catch (err) {
    throw new PreflightError("upstream_unavailable", "Failed to reach the FAA NOTAM API", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new PreflightError(
      "notams_unauthorized",
      "FAA NOTAM API rejected the configured credentials. Double-check FAA_NOTAM_CLIENT_ID and FAA_NOTAM_CLIENT_SECRET.",
      { status: response.status },
    );
  }

  if (!response.ok) {
    throw new PreflightError("upstream_unavailable", `FAA NOTAM API returned HTTP ${response.status}`, { icaoId });
  }

  const data = (await response.json()) as RawNotamResponse;
  const notams = (data.items ?? []).map((item) => decodeNotam(item.properties.coreNOTAMData.notam));
  return { notams, totalCount: data.totalCount ?? notams.length };
}
