import { describe, it, expect, vi, afterEach } from "vitest";
import { handleGetAirportInfo } from "../../src/tools/getAirportInfo.js";

const KJLN_AIRPORT_RAW = [
  {
    icaoId: "KJLN",
    name: "JOPLIN/JOPLIN RGNL",
    lat: 37.1532,
    lon: -94.4988,
    elev: 298, // meters, as returned by aviationweather.gov — NOT feet
    runways: [
      { id: "13/31", dimension: "6501x150", surface: "A", alignment: 138 },
      { id: "18/36", dimension: "6502x100", surface: "C", alignment: 182 },
    ],
  },
];

function mockFetchOnce(status: number, body: unknown) {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleGetAirportInfo", () => {
  it("converts the API's meters-denominated elevation to feet", async () => {
    mockFetchOnce(200, KJLN_AIRPORT_RAW);
    const result = await handleGetAirportInfo({ airportId: "KJLN" });
    // 298m * 3.28084 ft/m ≈ 978ft — the real published field elevation for Joplin Regional,
    // versus the raw (wrong) value of 298 that a naive passthrough would report.
    expect(result.fieldElevationFt).toBe(978);
  });

  it("throws a clear error for an unknown airport id", async () => {
    mockFetchOnce(204, null);
    await expect(handleGetAirportInfo({ airportId: "ZZZZ" })).rejects.toThrow(/No airport data found/);
  });
});
