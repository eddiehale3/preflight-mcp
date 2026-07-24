import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId, decodeSurface } from "../lib/schemas.js";
import { fetchAirports } from "../lib/awcClient.js";
import { metersToFeet } from "../lib/units.js";
import { PreflightError, toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  airportId: icaoId,
};
const inputSchema = z.object(inputShape);

export type GetAirportInfoInput = z.infer<typeof inputSchema>;

interface DecodedRunway {
  id: string;
  lengthFt: number | null;
  widthFt: number | null;
  surface: string;
  alignmentDegMagnetic: number;
}

export async function handleGetAirportInfo(input: GetAirportInfoInput) {
  const { found, notFound } = await fetchAirports([input.airportId]);
  if (notFound.length > 0 || found.length === 0) {
    throw new PreflightError("airport_not_found", `No airport data found for ${input.airportId}`, {
      airportId: input.airportId,
    });
  }

  const airport = found[0];
  if (!airport) {
    throw new PreflightError("airport_not_found", `No airport data found for ${input.airportId}`, {
      airportId: input.airportId,
    });
  }

  const warnings: string[] = [];
  const runways: DecodedRunway[] = airport.runways.map((rwy) => {
    const match = /^(\d+)\s*[xX]\s*(\d+)$/.exec(rwy.dimension.trim());
    let lengthFt: number | null = null;
    let widthFt: number | null = null;
    if (match) {
      lengthFt = Number(match[1]);
      widthFt = Number(match[2]);
    } else {
      warnings.push(`Could not parse runway dimension "${rwy.dimension}" for ${rwy.id}`);
    }
    return {
      id: rwy.id,
      lengthFt,
      widthFt,
      surface: decodeSurface(rwy.surface),
      alignmentDegMagnetic: rwy.alignment,
    };
  });

  return {
    airportId: airport.icaoId,
    name: airport.name,
    fieldElevationFt: Math.round(metersToFeet(airport.elev)),
    lat: airport.lat,
    lon: airport.lon,
    runways,
    warnings,
  };
}

export function registerGetAirportInfo(server: McpServer): void {
  server.tool(
    "get_airport_info",
    "Fetch runway lengths/widths/surfaces and field elevation for a single ICAO airport identifier, satisfying the 14 CFR 91.103(b) requirement to know runway lengths at airports of intended use. Throws a clear error if the airport id is unknown.",
    inputShape,
    async (input) => {
      try {
        const result = await handleGetAirportInfo(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
