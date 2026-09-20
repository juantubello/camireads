// api-config.ts
//
// Resolución de la URL del backend.
//
// ⚠️ Antes esta config tenía un fallback a `http://192.168.1.87:9095` — o sea,
// PRODUCCIÓN, la base con años de reseñas escritas a mano. Si alguien levantaba
// el front sin `NEXT_PUBLIC_API_URL` (build de Docker mal armado, `.env.local`
// faltante, un `npm run dev` en otra máquina), el front apuntaba a producción
// sin avisarle a nadie. Ahora falta la variable => error explícito y ruidoso.
// La URL del backend nunca se adivina.

const ENV_URL = process.env.NEXT_PUBLIC_API_URL?.trim()
const CF_ACCESS_CLIENT_ID = process.env.NEXT_PUBLIC_CF_ACCESS_CLIENT_ID
const CF_ACCESS_CLIENT_SECRET = process.env.NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET

export const MISSING_API_URL_MESSAGE =
  'Falta configurar NEXT_PUBLIC_API_URL: el frontend no sabe a qué backend pegarle. ' +
  'Definila en .env.local (sandbox: http://127.0.0.1:9096) y reiniciá el dev server. ' +
  'No se asume ninguna URL por defecto, y mucho menos la de producción.'

export function getApiHeaders(extraHeaders: HeadersInit = {}): HeadersInit {
  const headers = new Headers(extraHeaders)

  if (CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', CF_ACCESS_CLIENT_ID)
    headers.set('CF-Access-Client-Secret', CF_ACCESS_CLIENT_SECRET)
  }

  return headers
}

/** Versión sincrónica: útil para validar temprano o para código no async. */
export function requireApiBaseUrl(): string {
  if (!ENV_URL) throw new Error(MISSING_API_URL_MESSAGE)
  return ENV_URL.replace(/\/+$/, '')
}

export async function getApiBaseUrl(): Promise<string> {
  return requireApiBaseUrl()
}

export const API_BASE_URL = getApiBaseUrl()
// Si la variable falta, `API_BASE_URL` queda rechazada. Le enganchamos un
// handler vacío para que no dispare un "unhandled rejection" al importar el
// módulo: quien la await-ea sigue recibiendo el error con el mensaje completo.
API_BASE_URL.catch(() => {})

/**
 * El backend manda el motivo del error en el JSON (`message`). Esto lo saca
 * para mostrarlo tal cual en la UI, en vez de un "algo salió mal" genérico.
 */
export async function readApiError(
  response: Response,
  fallback = 'No pude completar la operación.',
): Promise<string> {
  try {
    const raw = await response.text()
    if (!raw) return `${fallback} (HTTP ${response.status})`

    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string }
      const message = parsed?.message || parsed?.error
      if (message) return message
    } catch {
      // no era JSON: devolvemos el texto crudo, recortado
    }

    return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw
  } catch {
    return `${fallback} (HTTP ${response.status})`
  }
}
