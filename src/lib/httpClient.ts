import { PreflightError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    throw new PreflightError("upstream_unavailable", `Failed to reach ${url}`, {
      cause: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return null;
  }

  if (response.status === 400) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const apiError =
      body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : "bad request";
    throw new PreflightError("bad_request", apiError, { url });
  }

  if (!response.ok) {
    throw new PreflightError("upstream_unavailable", `Upstream returned HTTP ${response.status}`, { url });
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new PreflightError("upstream_unavailable", "Upstream returned invalid JSON", {
      url,
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
