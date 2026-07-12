// api-config.ts

const ENV_URL = process.env.NEXT_PUBLIC_API_URL;
const LAN_URL = "http://192.168.1.87:9095";
const CF_ACCESS_CLIENT_ID = process.env.NEXT_PUBLIC_CF_ACCESS_CLIENT_ID;
const CF_ACCESS_CLIENT_SECRET = process.env.NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET;

let resolvedUrl: string | null = null;

export function getApiHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
  const headers = new Headers(extraHeaders);

  if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", CF_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", CF_ACCESS_CLIENT_SECRET);
  }

  return headers;
}

async function probe(url: string, timeout = 1200): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url + "/reviews/health", {
      signal: controller.signal,
      headers: getApiHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

export async function getApiBaseUrl(): Promise<string> {
  if (resolvedUrl) return resolvedUrl;

  if (ENV_URL) {
    resolvedUrl = ENV_URL;
    return ENV_URL;
  }

  const lanOk = await probe(LAN_URL);
  if (lanOk) {
    resolvedUrl = LAN_URL;
    return LAN_URL;
  }

  throw new Error("No se pudo conectar al backend.");
}

export const API_BASE_URL = getApiBaseUrl();
