// api-config.ts

const LAN_URL = "http://192.168.1.87:9095";
const VPN_URL = "http://100.72.146.39:9095";

let resolvedUrl: string | null = null;

async function probe(url: string, timeout = 1200): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url + "/reviews/health", { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

export async function getApiBaseUrl(): Promise<string> {
  if (resolvedUrl) return resolvedUrl;

  const lanOk = await probe(LAN_URL);
  if (lanOk) {
    resolvedUrl = LAN_URL;
    return LAN_URL;
  }

  const vpnOk = await probe(VPN_URL);
  if (vpnOk) {
    resolvedUrl = VPN_URL;
    return VPN_URL;
  }

  throw new Error("No se pudo conectar al backend. ¿Estás fuera de casa sin VPN?");
}

export const API_BASE_URL = getApiBaseUrl();
