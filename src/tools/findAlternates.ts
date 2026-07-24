import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId } from "../lib/schemas.js";
import { fetchAirports, fetchMetars, decodeCeilingFt } from "../lib/awcClient.js";
import { haversineDistanceNm, initialBearingDeg } from "../lib/geo.js";
import { PreflightError, toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  airportId: icaoId,
  radiusNm: z.number().min(1).max(200).default(50),
  minCeilingFt: z.number().min(0).default(1000),
  minVisibilitySm: z.number().min(0).default(3),
  candidateAirportIds: z.array(icaoId).min(1).optional(),
};
const inputSchema = z.object(inputShape);

export type FindAlternatesInput = z.infer<typeof inputSchema>;

function parseVisibilitySm(visib: string | null): number | null {
  if (visib === null) return null;
  const match = /^(\d+(?:\.\d+)?)/.exec(visib);
  return match ? Number(match[1]) : null;
}

export async function handleFindAlternates(input: FindAlternatesInput) {
  if (!input.candidateAirportIds || input.candidateAirportIds.length === 0) {
    throw new PreflightError(
      "candidates_required",
      "find_alternates has no bulk geo-radius search available from its data source (aviationweather.gov only accepts specific airport ids, not a radius query). Supply candidateAirportIds — nearby airports the caller already knows from route context.",
      { airportId: input.airportId },
    );
  }

  const warnings: string[] = [];

  const [originResult, candidateAirports, candidateMetars] = await Promise.all([
    fetchAirports([input.airportId]),
    fetchAirports(input.candidateAirportIds),
    fetchMetars(input.candidateAirportIds),
  ]);

  const origin = originResult.found[0];
  if (!origin) {
    throw new PreflightError("airport_not_found", `No airport data found for origin ${input.airportId}`, {
      airportId: input.airportId,
    });
  }

  if (candidateAirports.notFound.length > 0) {
    warnings.push(`No airport data found for candidates: ${candidateAirports.notFound.join(", ")}`);
  }

  const metarById = new Map(candidateMetars.found.map((m) => [m.icaoId.toUpperCase(), m]));

  const alternates = candidateAirports.found
    .map((candidate) => {
      const distanceNm = haversineDistanceNm(origin, candidate);
      const bearingDeg = initialBearingDeg(origin, candidate);
      const metar = metarById.get(candidate.icaoId.toUpperCase());

      let currentCeilingFt: number | null = null;
      let currentVisibilitySm: string | null = null;
      let meetsMinimums = false;

      if (!metar) {
        warnings.push(`No current weather available for ${candidate.icaoId} — cannot confirm minimums.`);
      } else {
        currentCeilingFt = decodeCeilingFt(metar.clouds);
        currentVisibilitySm = metar.visib === null ? null : String(metar.visib);
        const visibilityNum = parseVisibilitySm(currentVisibilitySm);
        const ceilingOk = currentCeilingFt === null || currentCeilingFt >= input.minCeilingFt;
        const visibilityOk = visibilityNum !== null && visibilityNum >= input.minVisibilitySm;
        meetsMinimums = ceilingOk && visibilityOk;
      }

      return {
        airportId: candidate.icaoId,
        distanceNm: Math.round(distanceNm * 10) / 10,
        bearingDeg: Math.round(bearingDeg),
        currentCeilingFt,
        currentVisibilitySm,
        meetsMinimums,
      };
    })
    .filter((alt) => alt.distanceNm <= input.radiusNm);

  return {
    originAirportId: origin.icaoId,
    alternates,
    warnings,
  };
}

export function registerFindAlternates(server: McpServer): void {
  server.tool(
    "find_alternates",
    "Find alternate airports near a given airport that currently meet minimum ceiling/visibility, satisfying the 14 CFR 91.103(a) requirement to consider alternatives if the flight cannot be completed as planned. IMPORTANT: this tool has no bulk geo-radius search — you must supply candidateAirportIds (nearby airports you already know from route context); it does not discover candidates on its own.",
    inputShape,
    async (input) => {
      try {
        const result = await handleFindAlternates(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
