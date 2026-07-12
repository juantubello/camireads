# Deploy con Cloudflare Tunnel

Objetivo: publicar CamiReads en `camireads.casapipis.net` sin tocar la app de finanzas.

## Arquitectura

- Cloudflare Tunnel: `camireads.casapipis.net -> http://localhost:18080`.
- `camireads-nginx`: escucha solo en `127.0.0.1:18080`.
- `/`: proxyea al frontend `camireads-web:3000`.
- `/api/`: proxyea al backend publicado localmente en `host.docker.internal:9095`.
- El frontend se compila con `NEXT_PUBLIC_API_URL=/api`.

## Variables locales del servidor

Crear un `.env` local en esta carpeta del servidor. No commitear valores reales.

```bash
cd ~/camireads/app/frontend/camireads
nano .env
```

Contenido:

```env
NEXT_PUBLIC_CF_ACCESS_CLIENT_ID=REEMPLAZAR
NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET=REEMPLAZAR
```

Notas:

- Estos valores se inyectan en el build del frontend.
- Si quedan vacios, la app funciona sin headers de Service Auth.
- Si se completan, cada llamada al backend CamiReads manda `CF-Access-Client-Id` y `CF-Access-Client-Secret`.

## Rebuild del frontend y Nginx

```bash
cd ~/camireads/app/frontend/camireads
git pull origin main
docker compose up -d --build camireads-web camireads-nginx
docker compose ps
```

Probar desde el servidor:

```bash
curl -I http://localhost:18080
curl http://localhost:18080/api/reviews/health
```

## Cloudflare Tunnel

Agregar un ingress nuevo antes del `http_status:404`:

```yaml
- hostname: camireads.casapipis.net
  service: http://localhost:18080
```

Reiniciar:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

## Cloudflare Zero Trust

Crear una app Access self-hosted para:

```text
camireads.casapipis.net
```

Policies recomendadas:

- `Allow`: solo Juan y Camila.
- `Service Auth`: equivalente a la policy que ya existe para Postman/finanzas.

## Importante

No tocar `~/finance`, `finance-nginx`, ni el ingress actual de `casapipis.net`.
