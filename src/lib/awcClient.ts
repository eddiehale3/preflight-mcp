import { fetchJson } from "./httpClient.js";

const BASE_URL = "https://aviationweather.gov/api/data";

interface RawCloudLayer {
  cover: string;
  base: number | null;
  type?: string | null;
}

export interface RawMetar {
  icaoId: string;
  reportTime: string;
  temp: number | null;
  dewp: number | null;
  wdir: number | "VRB" | null;
  wspd: number | null;
  wgst: number | null;
  visib: string | number | null;
  altim: number | null;
  rawOb: string;
  clouds: RawCloudLayer[];
  fltCat?: "VFR" | "MVFR" | "IFR" | "LIFR" | null;
}

interface RawTafForecast {
  timeFrom: number;
  timeTo: number;
  fcstChange: string | null;
  wdir: number | "VRB" | null;
  wspd: number | null;
  wgst: number | null;
  visib: string | number | null;
  wxString: string | null;
  clouds: RawCloudLayer[];
}

export interface RawTaf {
  icaoId: string;
  issueTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  rawTAF: string;
  fcsts: RawTafForecast[];
}

export interface RawAirport {
  icaoId: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  runways: Array<{
    id: string;
    dimension: string;
    surface: string;
    alignment: number;
  }>;
}

function csv(ids: string[]): string {
  return ids.join(",");
}

function diffFound<T extends { icaoId: string }>(
  requested: string[],
  found: T[],
): { found: T[]; notFound: string[] } {
  const foundIds = new Set(found.map((item) => item.icaoId.toUpperCase()));
  const notFound = requested.filter((id) => !foundIds.has(id.toUpperCase()));
  return { found, notFound };
}

export async function fetchMetars(ids: string[]): Promise<{ found: RawMetar[]; notFound: string[] }> {
  const data = await fetchJson<RawMetar[]>(`${BASE_URL}/metar?ids=${csv(ids)}&format=json`);
  return diffFound(ids, data ?? []);
}

export async function fetchTafs(ids: string[]): Promise<{ found: RawTaf[]; notFound: string[] }> {
  const data = await fetchJson<RawTaf[]>(`${BASE_URL}/taf?ids=${csv(ids)}&format=json`);
  return diffFound(ids, data ?? []);
}

export async function fetchAirports(ids: string[]): Promise<{ found: RawAirport[]; notFound: string[] }> {
  const data = await fetchJson<RawAirport[]>(`${BASE_URL}/airport?ids=${csv(ids)}&format=json`);
  return diffFound(ids, data ?? []);
}

export function decodeCeilingFt(clouds: RawCloudLayer[]): number | null {
  const ceilingLayers = clouds.filter(
    (layer) => (layer.cover === "BKN" || layer.cover === "OVC") && layer.base !== null,
  );
  if (ceilingLayers.length === 0) return null;
  return Math.min(...ceilingLayers.map((layer) => layer.base as number));
}
