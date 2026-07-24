import { z } from "zod";

export const icaoId = z
  .string()
  .regex(/^[A-Za-z0-9]{4}$/, "must be a 4-character ICAO identifier")
  .transform((s) => s.toUpperCase());

const SURFACE_CODES: Record<string, string> = {
  C: "Concrete",
  A: "Asphalt",
  T: "Turf",
  G: "Gravel",
  D: "Dirt",
  W: "Water",
  U: "Unknown/other",
};

export function decodeSurface(code: string | null | undefined): string {
  if (!code) return "Unknown/other";
  const upper = code.trim().toUpperCase();
  const decoded = SURFACE_CODES[upper];
  return decoded ?? `${code} (unmapped code)`;
}
