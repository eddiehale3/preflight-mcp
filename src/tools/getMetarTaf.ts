import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId } from "../lib/schemas.js";
import { fetchMetars, fetchTafs, decodeCeilingFt, type RawMetar, type RawTaf } from "../lib/awcClient.js";
import { toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  airportIds: z.array(icaoId).min(1).max(20),
  reportTypes: z.array(z.enum(["metar", "taf"])).default(["metar", "taf"]),
};
const inputSchema = z.object(inputShape);

export type GetMetarTafInput = z.infer<typeof inputSchema>;

interface DecodedMetar {
  raw: string;
  observedAt: string;
  flightCategory: "VFR" | "MVFR" | "IFR" | "LIFR" | null;
  windDirDeg: number | "VRB" | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilitySm: string | null;
  ceilingFt: number | null;
  tempC: number | null;
  dewpointC: number | null;
  altimeterInHg: number | null;
}

interface DecodedTaf {
  raw: string;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  forecasts: Array<{
    from: string;
    to: string;
    changeIndicator: string | null;
    windDirDeg: number | "VRB" | null;
    windSpeedKt: number | null;
    visibilitySm: string | null;
    ceilingFt: number | null;
    wxString: string | null;
  }>;
}

function decodeMetar(raw: RawMetar): DecodedMetar {
  return {
    raw: raw.rawOb,
    observedAt: raw.reportTime,
    flightCategory: raw.fltCat ?? null,
    windDirDeg: raw.wdir,
    windSpeedKt: raw.wspd,
    windGustKt: raw.wgst,
    visibilitySm: raw.visib === null ? null : String(raw.visib),
    ceilingFt: decodeCeilingFt(raw.clouds),
    tempC: raw.temp,
    dewpointC: raw.dewp,
    altimeterInHg: raw.altim,
  };
}

function decodeTaf(raw: RawTaf): DecodedTaf {
  return {
    raw: raw.rawTAF,
    issuedAt: raw.issueTime,
    validFrom: new Date(raw.validTimeFrom * 1000).toISOString(),
    validTo: new Date(raw.validTimeTo * 1000).toISOString(),
    forecasts: raw.fcsts.map((f) => ({
      from: new Date(f.timeFrom * 1000).toISOString(),
      to: new Date(f.timeTo * 1000).toISOString(),
      changeIndicator: f.fcstChange,
      windDirDeg: f.wdir,
      windSpeedKt: f.wspd,
      visibilitySm: f.visib === null ? null : String(f.visib),
      ceilingFt: decodeCeilingFt(f.clouds),
      wxString: f.wxString,
    })),
  };
}

export async function handleGetMetarTaf(input: GetMetarTafInput) {
  const uniqueIds = [...new Set(input.airportIds)];
  const wantMetar = input.reportTypes.includes("metar");
  const wantTaf = input.reportTypes.includes("taf");

  const [metarResult, tafResult] = await Promise.all([
    wantMetar ? fetchMetars(uniqueIds) : Promise.resolve({ found: [] as RawMetar[], notFound: uniqueIds }),
    wantTaf ? fetchTafs(uniqueIds) : Promise.resolve({ found: [] as RawTaf[], notFound: uniqueIds }),
  ]);

  const metarById = new Map(metarResult.found.map((m) => [m.icaoId.toUpperCase(), m]));
  const tafById = new Map(tafResult.found.map((t) => [t.icaoId.toUpperCase(), t]));

  const results = uniqueIds.map((id) => {
    const metar = metarById.get(id);
    const taf = tafById.get(id);
    return {
      airportId: id,
      metar: metar ? decodeMetar(metar) : null,
      taf: taf ? decodeTaf(taf) : null,
    };
  });

  const notFound = uniqueIds.filter((id) => {
    const foundInMetar = wantMetar && metarById.has(id);
    const foundInTaf = wantTaf && tafById.has(id);
    return !foundInMetar && !foundInTaf;
  });

  return { results, notFound };
}

export function registerGetMetarTaf(server: McpServer): void {
  server.tool(
    "get_metar_taf",
    "Fetch decoded current METAR observations and TAF forecasts for one or more ICAO airport identifiers, satisfying the 14 CFR 91.103(a) requirement to review available weather reports and forecasts. An airport id found in only one of METAR/TAF is returned with the other field null (not an error); an id absent from both is listed in notFound.",
    inputShape,
    async (input) => {
      try {
        const result = await handleGetMetarTaf(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
