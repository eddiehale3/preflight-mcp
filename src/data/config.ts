export const PART_91_FUEL_RESERVE_MINUTES = {
  "day-vfr": 30,
  "night-vfr": 45,
  ifr: 45,
} as const;

export type FlightRules = keyof typeof PART_91_FUEL_RESERVE_MINUTES;

/**
 * Swap point for aircraft-specific performance data. Points at the seed table in
 * c172-performance.ts; replace with your own POH-derived table without touching
 * tool code once you've confirmed/entered your actual aircraft's numbers.
 */
export const DEFAULT_AIRCRAFT = {
  model: "Cessna 172R/S",
  engine: "Lycoming IO-360",
  maxGrossWeightLbs: 2550,
  emptyWeightLbs: 1680,
};
