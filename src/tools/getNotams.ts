import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId } from "../lib/schemas.js";
import { getFaaNotamCredentials, fetchNotams } from "../lib/faaNotamClient.js";
import { PreflightError, toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  airportId: icaoId,
};
const inputSchema = z.object(inputShape);

export type GetNotamsInput = z.infer<typeof inputSchema>;

export async function handleGetNotams(input: GetNotamsInput) {
  const credentials = getFaaNotamCredentials();
  if (!credentials) {
    throw new PreflightError(
      "notams_not_configured",
      "FAA NOTAM API credentials are not configured. Register for the NOTAM Search API at https://api.faa.gov, then set FAA_NOTAM_CLIENT_ID and FAA_NOTAM_CLIENT_SECRET in this server's environment — see README.md.",
    );
  }

  const { notams, totalCount } = await fetchNotams(input.airportId, credentials);
  return { airportId: input.airportId, notams, totalCount };
}

export function registerGetNotams(server: McpServer): void {
  server.tool(
    "get_notams",
    "Fetch current NOTAMs for an airport from the FAA NOTAM Search API, satisfying the 14 CFR 91.103 requirement to review all available information. Requires FAA_NOTAM_CLIENT_ID and FAA_NOTAM_CLIENT_SECRET to be set in this server's environment (register at https://api.faa.gov); returns a clear 'not configured' error if they're unset rather than silently omitting NOTAMs from a briefing.",
    inputShape,
    async (input) => {
      try {
        const result = await handleGetNotams(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
