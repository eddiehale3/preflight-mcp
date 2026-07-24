# preflight-mcp

An MCP server that assembles the preflight information required by **14 CFR
§91.103** ("Preflight action"), so a Claude-based assistant can put together
a real go/no-go briefing for a route — not a generic weather wrapper, but a
tool set scoped to what the regulation actually requires a pilot in command
to know before flying.

## Regulatory mapping

| §91.103 requirement | Tool | Status |
|---|---|---|
| (a) Weather reports and forecasts | `get_metar_taf` | implemented |
| (b) Runway lengths at airports of intended use | `get_airport_info` | implemented |
| (b) Takeoff/landing distance data | `aircraft_performance` | implemented (seeded with approximate Cessna 172R/S data) |
| (a) Fuel requirements | `estimate_fuel` | implemented |
| (a) Alternatives if the flight can't be completed | `find_alternates` | implemented (requires a candidate airport list — see limitations) |
| (a) Known ATC traffic delays | — | not built; no clean free data source |
| NOTAMs (part of "all available information") | `get_notams` | stub only — needs FAA API credentials |

## Setup

```bash
npm install
npm run build
```

For local development without a build step:

```bash
npm run dev
```

Run the test suite with `npm test`, or `npm run typecheck` for a type-only check.

## Tools

### `get_metar_taf`

Fetches decoded current METAR and TAF data for one or more ICAO airport
identifiers from the free, no-auth aviationweather.gov API.

```json
// input
{ "airportIds": ["KXNA", "KTUL"], "reportTypes": ["metar", "taf"] }
```

```json
// output (abridged)
{
  "results": [
    {
      "airportId": "KXNA",
      "metar": { "raw": "...", "flightCategory": "VFR", "ceilingFt": null, "windSpeedKt": 6, ... },
      "taf": { "raw": "...", "forecasts": [ { "ceilingFt": 4000, ... } ] }
    }
  ],
  "notFound": []
}
```

An airport id found in only one of METAR/TAF has the other field set to
`null` (not an error). An id absent from both is listed in `notFound`.
`ceilingFt` is decoded from the lowest broken/overcast cloud layer — the
single most decision-relevant field for a VFR go/no-go call.

### `get_airport_info`

Fetches runway lengths/widths/surfaces and field elevation for a single
ICAO airport identifier.

```json
// input
{ "airportId": "KXNA" }
```

```json
// output
{
  "airportId": "KXNA",
  "name": "FAYETTEVILLE/SPRINGDALE/ROGERS/NORTHWEST ARKANSAS NTL",
  "fieldElevationFt": 1286,
  "lat": 36.2816,
  "lon": -94.3078,
  "runways": [
    { "id": "16L/34R", "lengthFt": 8801, "widthFt": 150, "surface": "Concrete", "alignmentDegMagnetic": 160 }
  ],
  "warnings": []
}
```

An unknown airport id is a hard error (this tool takes a single required
input, unlike the batch weather tool).

### `aircraft_performance`

Computes takeoff or landing ground roll and total distance over a 50ft
obstacle, given density-altitude-relevant conditions.

```json
// input
{
  "operation": "takeoff",
  "pressureAltitudeFt": 2000,
  "temperatureC": 25,
  "weightLbs": 2500,
  "headwindKt": 5,
  "runwaySurface": "paved",
  "obstacleHeightFt": 50
}
```

```json
// output
{
  "groundRollFt": 1009,
  "totalDistanceOverObstacleFt": 1781,
  "adjustments": {
    "baseGroundRollFt": 1096,
    "baseOverObstacleFt": 1934,
    "weightAdjustmentPct": -0.025,
    "windAdjustmentFt": -105,
    "surfaceAdjustmentFt": 0
  },
  "warnings": [
    "Weight adjustment below max gross is an approximation (linear rule of thumb), not a charted lighter-weight table."
  ]
}
```

**Seeded with approximate Cessna 172R/S (2450–2550 lb, Lycoming IO-360) POH
performance data** — see [Known limitations](#known-limitations). Inputs
outside the charted pressure-altitude/temperature range are extrapolated
and flagged in `warnings` rather than silently returned as if charted.

### `estimate_fuel`

Basic burn-rate × time fuel planning with Part 91 reserve minimums and an
explicit go/no-go verdict.

```json
// input
{
  "route": [{ "airportId": "KXNA" }, { "airportId": "KTUL", "distanceNm": 85 }],
  "cruiseSpeedKt": 110,
  "fuelBurnGph": 8.5,
  "usableFuelGal": 50,
  "flightRules": "day-vfr"
}
```

```json
// output (abridged)
{
  "legs": [{ "from": "KXNA", "to": "KTUL", "distanceNm": 85, "estimatedTimeMin": 46 }],
  "reserveMinutes": 30,
  "tripFuelGal": 6.57,
  "totalRequiredGal": 10.82,
  "fuelMarginGal": 39.18,
  "goNoGo": "go",
  "reason": "Usable fuel exceeds required fuel by 39.2 gal."
}
```

This tool does not call `get_airport_info` itself — if you omit
`distanceNm` for a leg, fetch both airports' coordinates first and compute
the distance before calling this tool.

### `find_alternates`

Finds alternate airports meeting minimum ceiling/visibility, checked
against current METAR.

```json
// input
{
  "airportId": "KXNA",
  "radiusNm": 50,
  "minCeilingFt": 1000,
  "minVisibilitySm": 3,
  "candidateAirportIds": ["KFYV", "KROG", "KBVX"]
}
```

**Requires `candidateAirportIds`** — see [Known limitations](#known-limitations).

### `get_notams` (stub)

Registered with its real intended schema so it appears in the tool list,
but the handler always returns a "not implemented" error. See
[Known limitations](#known-limitations).

## Known limitations

- **No ATC-delay data.** §91.103(a) also asks pilots to consider known ATC
  traffic delays; there's no clean free API for this, so it isn't built.
- **`find_alternates` has no geo-radius search.** aviationweather.gov's
  airport endpoint only accepts specific ids, not a "within N nm" query, so
  this tool requires the caller to supply `candidateAirportIds`. A future
  version could use the FAA NASR airport dataset (there's prior art for
  this in a sibling project, `skyfleet-aviation-data`) to support true
  radius-based discovery.
- **`get_notams` needs FAA API credentials.** The FAA NOTAM Search API at
  `api.faa.gov` requires a registered `client_id`/`client_secret`. Register
  at https://api.faa.gov and wire the credentials into a future
  implementation of `src/tools/getNotams.ts`.
- **`aircraft_performance` is seeded with approximate data**, not your
  exact aircraft's charted POH numbers. Once you've confirmed your
  aircraft's actual performance charts, replace the tables in
  `src/data/c172-performance.ts` — `DEFAULT_AIRCRAFT` in
  `src/data/config.ts` is the intended swap point.

## Adding to Claude Desktop or Claude Code

**Claude Desktop** (`claude_desktop_config.json`), using the built output.
Replace `/absolute/path/to/preflight-mcp` with wherever you cloned this repo:

```json
{
  "mcpServers": {
    "preflight": {
      "command": "node",
      "args": ["/absolute/path/to/preflight-mcp/dist/index.js"]
    }
  }
}
```

**Claude Code** — use the `claude mcp add` CLI rather than editing config by
hand. Dev-mode via `tsx` directly against source (no build step, faster
iteration):

```bash
claude mcp add --scope user preflight -- npx tsx /absolute/path/to/preflight-mcp/src/index.ts
```

Or against the built output:

```bash
claude mcp add --scope user preflight -- node /absolute/path/to/preflight-mcp/dist/index.js
```

`--scope user` makes the server available in every project. Use
`--scope project` instead if you want it scoped to a single project's
`.mcp.json` (shareable via that project's repo). Verify registration with
`claude mcp list`, then start a **new** Claude Code session — existing
sessions won't pick up a newly added server.

Both approaches produce the same underlying `command`/`args` you'd write by
hand into a `.mcp.json`:

```json
{
  "mcpServers": {
    "preflight": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/preflight-mcp/src/index.ts"]
    }
  }
}
```

Both use stdio transport — no auth or network exposure required, since the
server runs locally alongside the client.
