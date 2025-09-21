import "server-only";

const SAR_API_BASE = process.env.SAR_API_BASE;

if (!SAR_API_BASE) {
  console.warn("[server-api] SAR_API_BASE env var is not set. API routes will fail until it is configured.");
}

const baseUrl = SAR_API_BASE?.endsWith("/") ? SAR_API_BASE : SAR_API_BASE ? `${SAR_API_BASE}/` : undefined;

export class BackendRequestError extends Error {
  readonly status: number;
  readonly payload: string;

  constructor(message: string, status: number, payload: string) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

interface BackendRequestInit extends RequestInit {
  searchParams?: Record<string, string | number | undefined>;
}

export async function callBackend(path: string, init: BackendRequestInit = {}): Promise<Response> {
  if (!baseUrl) {
    throw new BackendRequestError("SAR_API_BASE is not configured", 500, "Missing SAR_API_BASE env var");
  }

  const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(trimmedPath, baseUrl);

  if (init.searchParams) {
    const entries = Object.entries(init.searchParams).filter(([, value]) => value !== undefined);
    for (const [key, value] of entries) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new BackendRequestError(
      `Backend request to ${url.pathname} failed with ${response.status}`,
      response.status,
      text,
    );
  }

  return response;
}

export async function callBackendJson<T>(path: string, init: BackendRequestInit = {}): Promise<T> {
  const response = await callBackend(path, init);
  return (await response.json()) as T;
}
