#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGetMetarTaf } from "./tools/getMetarTaf.js";
import { registerGetAirportInfo } from "./tools/getAirportInfo.js";
import { registerAircraftPerformance } from "./tools/aircraftPerformance.js";
import { registerEstimateFuel } from "./tools/estimateFuel.js";
import { registerFindAlternates } from "./tools/findAlternates.js";
import { registerGetNotams } from "./tools/getNotams.js";

const server = new McpServer({ name: "preflight-mcp", version: "0.1.0" });

registerGetMetarTaf(server);
registerGetAirportInfo(server);
registerAircraftPerformance(server);
registerEstimateFuel(server);
registerFindAlternates(server);
registerGetNotams(server);

const transport = new StdioServerTransport();
await server.connect(transport);
