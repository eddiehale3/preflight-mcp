import { describe, it, expect, vi, afterEach } from "vitest";
import { handleGetNotams } from "../../src/tools/getNotams.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("handleGetNotams", () => {
  it("throws a clear not-configured error when credentials are missing", async () => {
    vi.stubEnv("FAA_NOTAM_CLIENT_ID", "");
    vi.stubEnv("FAA_NOTAM_CLIENT_SECRET", "");
    await expect(handleGetNotams({ airportId: "KJLN" })).rejects.toThrow(/not configured/);
  });

  it("fetches and returns NOTAMs once credentials are configured", async () => {
    vi.stubEnv("FAA_NOTAM_CLIENT_ID", "test-id");
    vi.stubEnv("FAA_NOTAM_CLIENT_SECRET", "test-secret");
    const body = {
      pageNum: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
      items: [
        {
          properties: {
            coreNOTAMData: {
              notam: {
                id: "1",
                number: "A0001/26",
                type: "N",
                issued: "2026-01-01T00:00:00.000Z",
                location: "KJLN",
                effectiveStart: "2026-01-01T00:00:00.000Z",
                effectiveEnd: "PERM",
                text: "RWY 13/31 CLSD",
                classification: "DOM",
              },
            },
          },
        },
      ],
    };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));

    const result = await handleGetNotams({ airportId: "KJLN" });
    expect(result.airportId).toBe("KJLN");
    expect(result.totalCount).toBe(1);
    expect(result.notams[0]?.number).toBe("A0001/26");
  });
});
