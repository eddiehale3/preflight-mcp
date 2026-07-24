/**
 * SEED DATA — approximate values modeled on commonly published Cessna 172R/S
 * (IO-360, 2550 lb max gross) POH performance charts: flaps-up normal takeoff
 * and flaps-30 normal landing, paved level dry runway, zero wind, at max gross
 * weight. These are placeholders for interpolation-logic development, not a
 * substitute for your aircraft's actual POH. Replace via DEFAULT_AIRCRAFT's
 * swap point in config.ts once you've confirmed your specific airframe's
 * charted numbers (this table only covers 172R/S at 2550 lb).
 */

export interface PerfDataPoint {
  pressureAltitudeFt: number;
  temperatureC: number;
  groundRollFt: number;
  overObstacleFt: number;
}

export const TAKEOFF_TABLE_STD_WEIGHT: PerfDataPoint[] = [
  { pressureAltitudeFt: 0, temperatureC: 0, groundRollFt: 850, overObstacleFt: 1500 },
  { pressureAltitudeFt: 0, temperatureC: 20, groundRollFt: 960, overObstacleFt: 1690 },
  { pressureAltitudeFt: 0, temperatureC: 40, groundRollFt: 1090, overObstacleFt: 1915 },
  { pressureAltitudeFt: 2000, temperatureC: 0, groundRollFt: 935, overObstacleFt: 1650 },
  { pressureAltitudeFt: 2000, temperatureC: 20, groundRollFt: 1060, overObstacleFt: 1870 },
  { pressureAltitudeFt: 2000, temperatureC: 40, groundRollFt: 1205, overObstacleFt: 2125 },
  { pressureAltitudeFt: 4000, temperatureC: 0, groundRollFt: 1035, overObstacleFt: 1830 },
  { pressureAltitudeFt: 4000, temperatureC: 20, groundRollFt: 1180, overObstacleFt: 2085 },
  { pressureAltitudeFt: 4000, temperatureC: 40, groundRollFt: 1345, overObstacleFt: 2380 },
  { pressureAltitudeFt: 6000, temperatureC: 0, groundRollFt: 1155, overObstacleFt: 2045 },
  { pressureAltitudeFt: 6000, temperatureC: 20, groundRollFt: 1325, overObstacleFt: 2340 },
  { pressureAltitudeFt: 6000, temperatureC: 40, groundRollFt: 1520, overObstacleFt: 2685 },
  { pressureAltitudeFt: 8000, temperatureC: 0, groundRollFt: 1300, overObstacleFt: 2305 },
  { pressureAltitudeFt: 8000, temperatureC: 20, groundRollFt: 1500, overObstacleFt: 2655 },
  { pressureAltitudeFt: 8000, temperatureC: 40, groundRollFt: 1735, overObstacleFt: 3070 },
];

export const LANDING_TABLE_STD_WEIGHT: PerfDataPoint[] = [
  { pressureAltitudeFt: 0, temperatureC: 0, groundRollFt: 520, overObstacleFt: 1280 },
  { pressureAltitudeFt: 0, temperatureC: 20, groundRollFt: 545, overObstacleFt: 1335 },
  { pressureAltitudeFt: 0, temperatureC: 40, groundRollFt: 575, overObstacleFt: 1395 },
  { pressureAltitudeFt: 2000, temperatureC: 0, groundRollFt: 545, overObstacleFt: 1335 },
  { pressureAltitudeFt: 2000, temperatureC: 20, groundRollFt: 575, overObstacleFt: 1395 },
  { pressureAltitudeFt: 2000, temperatureC: 40, groundRollFt: 605, overObstacleFt: 1460 },
  { pressureAltitudeFt: 4000, temperatureC: 0, groundRollFt: 570, overObstacleFt: 1395 },
  { pressureAltitudeFt: 4000, temperatureC: 20, groundRollFt: 605, overObstacleFt: 1460 },
  { pressureAltitudeFt: 4000, temperatureC: 40, groundRollFt: 640, overObstacleFt: 1525 },
  { pressureAltitudeFt: 6000, temperatureC: 0, groundRollFt: 600, overObstacleFt: 1460 },
  { pressureAltitudeFt: 6000, temperatureC: 20, groundRollFt: 635, overObstacleFt: 1525 },
  { pressureAltitudeFt: 6000, temperatureC: 40, groundRollFt: 670, overObstacleFt: 1595 },
  { pressureAltitudeFt: 8000, temperatureC: 0, groundRollFt: 630, overObstacleFt: 1525 },
  { pressureAltitudeFt: 8000, temperatureC: 20, groundRollFt: 665, overObstacleFt: 1595 },
  { pressureAltitudeFt: 8000, temperatureC: 40, groundRollFt: 705, overObstacleFt: 1665 },
];

interface InterpolationResult {
  groundRollFt: number;
  overObstacleFt: number;
  extrapolated: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bracket(sortedValues: number[], value: number): { low: number; high: number; extrapolated: boolean } {
  const min = sortedValues[0] as number;
  const max = sortedValues[sortedValues.length - 1] as number;
  if (value <= min) return { low: min, high: sortedValues[1] ?? min, extrapolated: value < min };
  if (value >= max) {
    const secondToLast = sortedValues[sortedValues.length - 2] ?? max;
    return { low: secondToLast, high: max, extrapolated: value > max };
  }
  for (let i = 0; i < sortedValues.length - 1; i++) {
    const low = sortedValues[i] as number;
    const high = sortedValues[i + 1] as number;
    if (value >= low && value <= high) {
      return { low, high, extrapolated: false };
    }
  }
  return { low: min, high: max, extrapolated: false };
}

function findPoint(table: PerfDataPoint[], altitude: number, temp: number): PerfDataPoint {
  const point = table.find((p) => p.pressureAltitudeFt === altitude && p.temperatureC === temp);
  if (!point) {
    throw new Error(`Performance table is not a complete rectangular grid: missing point at ${altitude}ft/${temp}C`);
  }
  return point;
}

export function interpolate(
  table: PerfDataPoint[],
  pressureAltitudeFt: number,
  temperatureC: number,
): InterpolationResult {
  const altitudes = [...new Set(table.map((p) => p.pressureAltitudeFt))].sort((a, b) => a - b);
  const temps = [...new Set(table.map((p) => p.temperatureC))].sort((a, b) => a - b);

  const altBracket = bracket(altitudes, pressureAltitudeFt);
  const tempBracket = bracket(temps, temperatureC);

  const p00 = findPoint(table, altBracket.low, tempBracket.low);
  const p01 = findPoint(table, altBracket.low, tempBracket.high);
  const p10 = findPoint(table, altBracket.high, tempBracket.low);
  const p11 = findPoint(table, altBracket.high, tempBracket.high);

  const altSpan = altBracket.high - altBracket.low;
  const tempSpan = tempBracket.high - tempBracket.low;
  const altT = altSpan === 0 ? 0 : (pressureAltitudeFt - altBracket.low) / altSpan;
  const tempT = tempSpan === 0 ? 0 : (temperatureC - tempBracket.low) / tempSpan;

  const groundRollLow = lerp(p00.groundRollFt, p01.groundRollFt, tempT);
  const groundRollHigh = lerp(p10.groundRollFt, p11.groundRollFt, tempT);
  const groundRollFt = lerp(groundRollLow, groundRollHigh, altT);

  const overObstacleLow = lerp(p00.overObstacleFt, p01.overObstacleFt, tempT);
  const overObstacleHigh = lerp(p10.overObstacleFt, p11.overObstacleFt, tempT);
  const overObstacleFt = lerp(overObstacleLow, overObstacleHigh, altT);

  return {
    groundRollFt: Math.round(groundRollFt),
    overObstacleFt: Math.round(overObstacleFt),
    extrapolated: altBracket.extrapolated || tempBracket.extrapolated,
  };
}
