import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMetars, fetchTafs, fetchAirports, decodeCeilingFt } from "../../src/lib/awcClient.js";

const KXNA_METAR = [
  {
    icaoId: "KXNA",
    receiptTime: "2026-07-24T01:57:52.437Z",
    obsTime: 1784857980,
    reportTime: "2026-07-24T02:00:00.000Z",
    temp: 26.7,
    dewp: 18.9,
    wdir: 100,
    wspd: 6,
    visib: "10+",
    altim: 1018,
    metarType: "METAR",
    rawOb: "METAR KXNA 240153Z 10006KT 10SM CLR 27/19 A3006 RMK AO2 SLP164 T02670189",
    lat: 36.2897,
    lon: -94.3115,
    elev: 390,
    name: "Fayetteville/NW Arkansas Rgnl, AR, US",
    clouds: [],
    fltCat: "VFR",
  },
];

const KXNA_TAF = [
  {
    icaoId: "KXNA",
    issueTime: "2026-07-23T23:31:00.000Z",
    validTimeFrom: 1784851200,
    validTimeTo: 1784937600,
    rawTAF: "TAF KXNA 232331Z 2400/2424 13008KT P6SM SCT250",
    lat: 36.28975,
    lon: -94.31152,
    elev: 390,
    name: "Fayetteville/NW Arkansas Rgnl",
    fcsts: [
      {
        timeFrom: 1784851200,
        timeTo: 1784854800,
        fcstChange: null,
        wdir: 130,
        wspd: 8,
        wgst: null,
        visib: "6+",
        wxString: null,
        clouds: [{ cover: "SCT", base: 25000, type: null }],
      },
    ],
  },
];

const KXNA_AIRPORT = [
  {
    icaoId: "KXNA",
    name: "FAYETTEVILLE/SPRINGDALE/ROGERS/NORTHWEST ARKANSAS NTL ",
    lat: 36.2816,
    lon: -94.3078,
    elev: 392,
    runways: [
      { id: "16L/34R", dimension: "8801x150", surface: "C", alignment: 160 },
      { id: "16R/34L", dimension: "8800x150", surface: "C", alignment: 160 },
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

describe("fetchMetars", () => {
  it("parses a found metar and reports no notFound ids", async () => {
    mockFetchOnce(200, KXNA_METAR);
    const result = await fetchMetars(["KXNA"]);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]?.icaoId).toBe("KXNA");
    expect(result.notFound).toEqual([]);
  });

  it("reports unknown ids as notFound on HTTP 204", async () => {
    mockFetchOnce(204, null);
    const result = await fetchMetars(["ZZZZ"]);
    expect(result.found).toEqual([]);
    expect(result.notFound).toEqual(["ZZZZ"]);
  });

  it("diffs partial results across multiple requested ids", async () => {
    mockFetchOnce(200, KXNA_METAR);
    const result = await fetchMetars(["KXNA", "ZZZZ"]);
    expect(result.found).toHaveLength(1);
    expect(result.notFound).toEqual(["ZZZZ"]);
  });
});

describe("fetchTafs", () => {
  it("parses a found taf", async () => {
    mockFetchOnce(200, KXNA_TAF);
    const result = await fetchTafs(["KXNA"]);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]?.rawTAF).toContain("TAF KXNA");
    expect(result.notFound).toEqual([]);
  });
});

describe("fetchAirports", () => {
  it("parses runway data", async () => {
    mockFetchOnce(200, KXNA_AIRPORT);
    const result = await fetchAirports(["KXNA"]);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]?.runways).toHaveLength(2);
    expect(result.found[0]?.runways[0]?.dimension).toBe("8801x150");
  });
});

describe("decodeCeilingFt", () => {
  it("returns null when sky is clear", () => {
    expect(decodeCeilingFt([])).toBeNull();
  });

  it("returns null for scattered/few layers only (not a ceiling)", () => {
    expect(decodeCeilingFt([{ cover: "SCT", base: 3500 }, { cover: "FEW", base: 5000 }])).toBeNull();
  });

  it("returns the lowest BKN/OVC base", () => {
    expect(
      decodeCeilingFt([
        { cover: "SCT", base: 2000 },
        { cover: "BKN", base: 4000 },
        { cover: "OVC", base: 2500 },
      ]),
    ).toBe(2500);
  });
});
