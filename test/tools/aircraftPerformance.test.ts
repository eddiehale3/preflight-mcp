import { describe, it, expect } from "vitest";
import { handleAircraftPerformance } from "../../src/tools/aircraftPerformance.js";
import { interpolate, TAKEOFF_TABLE_STD_WEIGHT } from "../../src/data/c172-performance.js";

describe("interpolate", () => {
  it("returns exact table values at a grid point", () => {
    const result = interpolate(TAKEOFF_TABLE_STD_WEIGHT, 0, 0);
    expect(result.groundRollFt).toBe(850);
    expect(result.overObstacleFt).toBe(1500);
    expect(result.extrapolated).toBe(false);
  });

  it("interpolates between grid points", () => {
    const result = interpolate(TAKEOFF_TABLE_STD_WEIGHT, 0, 10);
    // Midpoint between temp 0 (850) and temp 20 (960) at PA 0.
    expect(result.groundRollFt).toBe(905);
    expect(result.extrapolated).toBe(false);
  });

  it("flags extrapolation outside the charted range", () => {
    const result = interpolate(TAKEOFF_TABLE_STD_WEIGHT, 9000, 0);
    expect(result.extrapolated).toBe(true);
  });
});

describe("handleAircraftPerformance", () => {
  it("computes base takeoff performance at max gross, standard conditions", () => {
    const result = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: 0,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    expect(result.groundRollFt).toBe(850);
    expect(result.totalDistanceOverObstacleFt).toBe(1500);
    expect(result.adjustments.weightAdjustmentPct).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("reduces distance for headwind", () => {
    const noWind = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: 0,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    const withHeadwind = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: 9,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    expect(withHeadwind.groundRollFt).toBeLessThan(noWind.groundRollFt);
  });

  it("increases distance for tailwind more steeply than it reduces for headwind", () => {
    const withTailwind = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: -9,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    expect(withTailwind.groundRollFt).toBeGreaterThan(850);
  });

  it("increases ground roll on grass vs paved", () => {
    const paved = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: 0,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    const grass = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2550,
      headwindKt: 0,
      runwaySurface: "grass",
      obstacleHeightFt: 50,
    });
    expect(grass.groundRollFt).toBeGreaterThan(paved.groundRollFt);
    expect(grass.adjustments.surfaceAdjustmentFt).toBeGreaterThan(0);
  });

  it("reduces distance for lighter weight and flags the approximation", () => {
    const result = handleAircraftPerformance({
      operation: "takeoff",
      pressureAltitudeFt: 0,
      temperatureC: 0,
      weightLbs: 2350,
      headwindKt: 0,
      runwaySurface: "paved",
      obstacleHeightFt: 50,
    });
    expect(result.groundRollFt).toBeLessThan(850);
    expect(result.warnings.some((w) => w.includes("approximation"))).toBe(true);
  });

  it("rejects obstacle heights other than 50ft", () => {
    expect(() =>
      handleAircraftPerformance({
        operation: "takeoff",
        pressureAltitudeFt: 0,
        temperatureC: 0,
        weightLbs: 2550,
        headwindKt: 0,
        runwaySurface: "paved",
        obstacleHeightFt: 35,
      }),
    ).toThrow(/50ft obstacle/);
  });
});
