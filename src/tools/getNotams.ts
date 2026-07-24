import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { icaoId } from "../lib/schemas.js";
import { PreflightError, toToolErrorContent } from "../lib/errors.js";

const inputShape = {
  airportId: icaoId,
};

export function registerGetNotams(server: McpServer): void {
  server.tool(
    "get_notams",
    "NOT IMPLEMENTED. Would fetch current NOTAMs for an airport, supporting the 14 CFR 91.103 requirement to review all available information. Registered as a stub so briefing tools see NOTAMs as an explicit gap rather than silently never checking. Requires FAA NOTAM Search API credentials (client_id/client_secret from api.faa.gov) — see README for setup once available.",
    inputShape,
    async () => {
      try {
        throw new PreflightError(
          "not_implemented",
          "NOTAM data requires FAA API credentials (api.faa.gov client_id/secret), which are not yet configured. See README.md for setup instructions.",
        );
      } catch (err) {
        return toToolErrorContent(err);
      }
    },
  );
}
