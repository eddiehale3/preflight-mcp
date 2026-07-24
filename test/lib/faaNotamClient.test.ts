import { describe, it, expect, vi, afterEach } from "vitest";
import { getFaaNotamCredentials, fetchNotams } from "../../src/lib/faaNotamClient.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getFaaNotamCredentials", () => {
  it("returns null when neither env var is set", () => {
    vi.stubEnv("FAA_NOTAM_CLIENT_ID", "");
    vi.stubEnv("FAA_NOTAM_CLIENT_SECRET", "");
    expect(getFaaNotamCredentials()).toBeNull();
  });

  it("returns null when only one env var is set", () => {
    vi.stubEnv("FAA_NOTAM_CLIENT_ID", "abc");
    vi.stubEnv("FAA_NOTAM_CLIENT_SECRET", "");
    expect(getFaaNotamCredentials()).toBeNull();
  });

  it("returns credentials when both env vars are set", () => {
    vi.stubEnv("FAA_NOTAM_CLIENT_ID", "abc");
    vi.stubEnv("FAA_NOTAM_CLIENT_SECRET", "xyz");
    expect(getFaaNotamCredentials()).toEqual({ clientId: "abc", clientSecret: "xyz" });
  });
});

describe("fetchNotams", () => {
  const creds = { clientId: "abc", clientSecret: "xyz" };

  it("decodes a well-formed response", async () => {
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
    const result = await fetchNotams("KJLN", creds);
    expect(result.totalCount).toBe(1);
    expect(result.notams).toHaveLength(1);
    expect(result.notams[0]?.number).toBe("A0001/26");
    expect(result.notams[0]?.text).toBe("RWY 13/31 CLSD");
  });

  it("returns an empty list when there are no active NOTAMs", async () => {
    const body = { pageNum: 1, pageSize: 20, totalCount: 0, totalPages: 0, items: [] };
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    const result = await fetchNotams("KJLN", creds);
    expect(result.notams).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("throws a clear error on 401 (bad credentials)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(fetchNotams("KJLN", creds)).rejects.toThrow(/rejected the configured credentials/);
  });

  it("throws on other non-2xx statuses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(fetchNotams("KJLN", creds)).rejects.toThrow(/HTTP 500/);
  });
});
