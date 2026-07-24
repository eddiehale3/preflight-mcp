import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId } from "../lib/schemas.js";
import { PART_91_FUEL_RESERVE_MINUTES } from "../data/config.js";
import { PreflightError, toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  route: z
    .array(
      z.object({
        airportId: icaoId,
        distanceNm: z.number().min(0).optional(),
      }),
    )
    .min(2),
  cruiseSpeedKt: z.number().min(1),
  fuelBurnGph: z.number().min(0.1),
  usableFuelGal: z.number().min(0.1),
  flightRules: z.enum(["day-vfr", "night-vfr", "ifr"]),
  reserveMinutesOverride: z.number().min(0).optional(),
  taxiFuelGal: z.number().min(0).default(0),
};
const inputSchema = z.object(inputShape);

export type EstimateFuelInput = z.infer<typeof inputSchema>;

export function handleEstimateFuel(input: EstimateFuelInput) {
  const legs: Array<{ from: string; to: string; distanceNm: number; estimatedTimeMin: number }> = [];

  for (let i = 0; i < input.route.length - 1; i++) {
    const from = input.route[i];
    const to = input.route[i + 1];
    if (!from || !to) continue;

    if (to.distanceNm === undefined) {
      throw new PreflightError(
        "missing_leg_distance",
        `No distanceNm supplied for the leg from ${from.airportId} to ${to.airportId}. Supply distanceNm per leg, or fetch coordinates via get_airport_info and compute distance before calling this tool.`,
        { from: from.airportId, to: to.airportId },
      );
    }

    const estimatedTimeMin = (to.distanceNm / input.cruiseSpeedKt) * 60;
    legs.push({
      from: from.airportId,
      to: to.airportId,
      distanceNm: to.distanceNm,
      estimatedTimeMin,
    });
  }

  const totalEnrouteTimeMin = legs.reduce((sum, leg) => sum + leg.estimatedTimeMin, 0);
  const reserveMinutes = input.reserveMinutesOverride ?? PART_91_FUEL_RESERVE_MINUTES[input.flightRules];
  const reserveGal = (reserveMinutes / 60) * input.fuelBurnGph;
  const tripFuelGal = (totalEnrouteTimeMin / 60) * input.fuelBurnGph;
  const taxiGal = input.taxiFuelGal;
  const totalRequiredGal = tripFuelGal + reserveGal + taxiGal;
  const fuelMarginGal = input.usableFuelGal - totalRequiredGal;
  const goNoGo: "go" | "no-go" = fuelMarginGal >= 0 ? "go" : "no-go";

  return {
    legs,
    totalEnrouteTimeMin: Math.round(totalEnrouteTimeMin),
    reserveMinutes,
    reserveGal: Math.round(reserveGal * 100) / 100,
    taxiGal,
    tripFuelGal: Math.round(tripFuelGal * 100) / 100,
    totalRequiredGal: Math.round(totalRequiredGal * 100) / 100,
    usableFuelGal: input.usableFuelGal,
    fuelMarginGal: Math.round(fuelMarginGal * 100) / 100,
    goNoGo,
    reason:
      goNoGo === "no-go"
        ? `Required fuel (${totalRequiredGal.toFixed(1)} gal) exceeds usable fuel (${input.usableFuelGal.toFixed(1)} gal) by ${Math.abs(fuelMarginGal).toFixed(1)} gal.`
        : `Usable fuel exceeds required fuel by ${fuelMarginGal.toFixed(1)} gal.`,
  };
}

export function registerEstimateFuel(server: McpServer): void {
  server.tool(
    "estimate_fuel",
    "Compute trip fuel, Part 91 reserve fuel, and a go/no-go fuel margin for a route, satisfying the 14 CFR 91.103(a) requirement to consider fuel requirements. This is a basic burn-rate x time model (no climb/descent profile). Distance per leg must be supplied directly, or derived by the caller from get_airport_info coordinates first.",
    inputShape,
    async (input) => {
      try {
        const result = handleEstimateFuel(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
