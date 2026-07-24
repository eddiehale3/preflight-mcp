import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TAKEOFF_TABLE_STD_WEIGHT, LANDING_TABLE_STD_WEIGHT, interpolate } from "../data/c172-performance.js";
import { DEFAULT_AIRCRAFT } from "../data/config.js";
import { toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  operation: z.enum(["takeoff", "landing"]),
  pressureAltitudeFt: z.number().min(0).max(10000),
  temperatureC: z.number().min(-20).max(50),
  weightLbs: z.number().min(1400).max(2550),
  headwindKt: z.number().default(0),
  runwaySurface: z.enum(["paved", "grass"]).default("paved"),
  obstacleHeightFt: z.number().default(50),
};
const inputSchema = z.object(inputShape);

export type AircraftPerformanceInput = z.infer<typeof inputSchema>;

const WEIGHT_REDUCTION_PCT_PER_200LB = 0.1;
const HEADWIND_REDUCTION_PCT_PER_9KT = 0.1;
const TAILWIND_PENALTY_PCT_PER_2KT = 0.1;
const GRASS_SURFACE_INCREASE_PCT = {
  takeoff: 0.15,
  landing: 0.1,
};

export function handleAircraftPerformance(input: AircraftPerformanceInput) {
  const warnings: string[] = [];

  if (input.obstacleHeightFt !== 50) {
    throw new Error(
      "Seed performance table is only charted for a 50ft obstacle (POH standard). Use obstacleHeightFt: 50, or supply your own charted data for other obstacle heights.",
    );
  }

  const table = input.operation === "takeoff" ? TAKEOFF_TABLE_STD_WEIGHT : LANDING_TABLE_STD_WEIGHT;
  const base = interpolate(table, input.pressureAltitudeFt, input.temperatureC);
  if (base.extrapolated) {
    warnings.push("Input pressure altitude/temperature is outside the charted table range — extrapolated, treat as approximate.");
  }

  const baseGroundRollFt = base.groundRollFt;
  const baseOverObstacleFt = base.overObstacleFt;

  // Weight adjustment: approximate ~10% reduction per 200 lb below max gross.
  const weightDeltaLbs = DEFAULT_AIRCRAFT.maxGrossWeightLbs - input.weightLbs;
  const weightAdjustmentPct = weightDeltaLbs > 0 ? -(weightDeltaLbs / 200) * WEIGHT_REDUCTION_PCT_PER_200LB : 0;
  if (weightDeltaLbs > 0) {
    warnings.push(
      "Weight adjustment below max gross is an approximation (linear rule of thumb), not a charted lighter-weight table.",
    );
  }
  const weightFactor = 1 + weightAdjustmentPct;
  let groundRollFt = baseGroundRollFt * weightFactor;
  let overObstacleFt = baseOverObstacleFt * weightFactor;

  // Wind adjustment: headwind reduces distance, tailwind increases it more steeply.
  const groundRollAfterWeight = groundRollFt;
  const overObstacleAfterWeight = overObstacleFt;
  let windFactor: number;
  if (input.headwindKt >= 0) {
    windFactor = 1 - (input.headwindKt / 9) * HEADWIND_REDUCTION_PCT_PER_9KT;
  } else {
    windFactor = 1 + (Math.abs(input.headwindKt) / 2) * TAILWIND_PENALTY_PCT_PER_2KT;
  }
  groundRollFt = groundRollAfterWeight * windFactor;
  overObstacleFt = overObstacleAfterWeight * windFactor;
  const windAdjustmentFt = overObstacleFt - overObstacleAfterWeight;

  // Surface adjustment: grass increases ground roll; climb segment (to obstacle) unaffected,
  // so the over-obstacle distance shifts by the same absolute delta as ground roll.
  const groundRollBeforeSurface = groundRollFt;
  let surfaceAdjustmentFt = 0;
  if (input.runwaySurface === "grass") {
    const pct = GRASS_SURFACE_INCREASE_PCT[input.operation];
    const increasedGroundRoll = groundRollBeforeSurface * (1 + pct);
    surfaceAdjustmentFt = increasedGroundRoll - groundRollBeforeSurface;
    groundRollFt = increasedGroundRoll;
    overObstacleFt = overObstacleFt + surfaceAdjustmentFt;
  }

  return {
    groundRollFt: Math.round(groundRollFt),
    totalDistanceOverObstacleFt: Math.round(overObstacleFt),
    adjustments: {
      baseGroundRollFt,
      baseOverObstacleFt,
      weightAdjustmentPct: Math.round(weightAdjustmentPct * 1000) / 1000,
      windAdjustmentFt: Math.round(windAdjustmentFt),
      surfaceAdjustmentFt: Math.round(surfaceAdjustmentFt),
    },
    warnings,
  };
}

export function registerAircraftPerformance(server: McpServer): void {
  server.tool(
    "aircraft_performance",
    `Compute takeoff or landing ground roll and total distance over a 50ft obstacle for a ${DEFAULT_AIRCRAFT.model} (${DEFAULT_AIRCRAFT.engine}), satisfying the 14 CFR 91.103(b) requirement to know takeoff/landing distance data. Seeded with approximate POH-style performance data — see tool warnings for extrapolation/approximation caveats.`,
    inputShape,
    async (input) => {
      try {
        const result = handleAircraftPerformance(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
