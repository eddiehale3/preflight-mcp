import { describe, it, expect } from "vitest";
import { haversineDistanceNm, initialBearingDeg } from "../../src/lib/geo.js";

describe("haversineDistanceNm", () => {
  it("returns 0 for identical points", () => {
    const point = { lat: 36.2897, lon: -94.3115 };
    expect(haversineDistanceNm(point, point)).toBeCloseTo(0, 5);
  });

  it("computes a known distance between KXNA and KTUL (~85nm)", () => {
    const kxna = { lat: 36.2897, lon: -94.3115 };
    const ktul = { lat: 36.1984, lon: -95.8881 };
    const distance = haversineDistanceNm(kxna, ktul);
    expect(distance).toBeGreaterThan(75);
    expect(distance).toBeLessThan(95);
  });
});

describe("initialBearingDeg", () => {
  it("returns ~0 for due north", () => {
    const from = { lat: 36.0, lon: -94.0 };
    const to = { lat: 37.0, lon: -94.0 };
    expect(initialBearingDeg(from, to)).toBeCloseTo(0, 0);
  });

  it("returns ~90 for due east", () => {
    const from = { lat: 36.0, lon: -94.0 };
    const to = { lat: 36.0, lon: -93.0 };
    expect(initialBearingDeg(from, to)).toBeCloseTo(90, 0);
  });

  it("returns ~180 for due south", () => {
    const from = { lat: 37.0, lon: -94.0 };
    const to = { lat: 36.0, lon: -94.0 };
    expect(initialBearingDeg(from, to)).toBeCloseTo(180, 0);
  });

  it("returns a value in [0, 360)", () => {
    const from = { lat: 36.0, lon: -94.0 };
    const to = { lat: 35.5, lon: -94.5 };
    const bearing = initialBearingDeg(from, to);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});
