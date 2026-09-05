# Unicall Blue — Notas del proyecto

## Estructura (Next.js 15 App Router + src/)

- `src/app/` — páginas del router
- `src/components/` — componentes compartidos (AppLayout, NotificationCenter, StaffNotificationBoard, TrainingGalleryBoard, etc.)
- `src/lib/` — lógica de negocio (records, cloud-*, performance-*, notifications, etc.)
- `src/lib/supabase/client.ts` — exporta `getSupabaseBrowserClient()` y constante booleana `isSupabaseConfigured`
- `src/middleware.ts` — middleware de Next (debe estar en src/, next lo detecta automáticamente)

## Endpoints /api

| URL | Archivo | Métodos |
|---|---|---|
| `/api/operator-register` | `src/app/api/operator-register/route.ts` | POST |
| `/api/operator/notifications` | `src/app/api/operator/notifications/route.ts` | DELETE |
| `/api/operator/payments/proof` | `src/app/api/operator/payments/proof/route.ts` | POST |
| `/api/payments/proof-url` | `src/app/api/payments/proof-url/route.ts` | POST |
| `/api/staff/certificates/upload` | `src/app/api/staff/certificates/upload/route.ts` | POST |
| `/api/staff/notifications` | `src/app/api/staff/notifications/route.ts` | GET, PATCH |
| `/api/staff/operators` | `src/app/api/staff/operators/route.ts` | GET |
| `/api/staff/users` | `src/app/api/staff/users/route.ts` | GET |
| `/api/training-gallery` | `src/app/api/training-gallery/route.ts` | GET, POST, PATCH |

## Variables de entorno

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `.env.local` NO debe trackearse en git. En Vercel hay que configurar las 3 variables.

## Diagnóstico histórico (Sept 2026)

- El despliegue fallaba porque los archivos estaban planos en la raíz → no existía `app/`. Next requiere `src/app/` o `app/`.
- `package-lock.json` tenía una entrada corrupta de `@img/sharp-wasm32/node_modules/@emnapi/runtime` (sin `version`) → `npm install` fallaba con "Invalid Version".
- `isSupabaseConfigured` es una **constante booleana**, NO función. Todo el código la usa como valor.

## Build/Dev

- Build verificado: `npm run build` pasa (solo warnings de hooks exhaustive-deps y edge runtime de supabase-js).
- `npm run dev` carga `.env.local` (log: "Environments: .env.local"）。 `next start` también lo carga si el proceso corre con el archivo presente.
.
ven los endpoints: sin `SUPABASE_SERVICE_ROLE_KEY` devuelven 500 "Supabase no esta configurado...".

## Git

- El PR #1 (rama `fix/estructura-next-para-despliegue`) fue **mergeado a `main`** el 2026-09-05 (sha `d17260c`) via el token personal del dueño. El `GITHUB_TOKEN` del entorno sandbox es de `brayanvargasblanco1-droid` (solo lectura); para pushear/mergear usar el token personal del dueño (`vargasblancobrayan-cyber`).

## Despliegue (estado final, 2026-09-05)

- **Producción ARREGLADA**: `https://unicall-blue.vercel.app` sirve el deploy `d17260c` (estado READY, build exitoso). Contenido verificado: título "Unicall Blue - Operaciones de Call Center".
- Endpoints verificados en producción: `/api/training-gallery` → 401 (pide auth); `/api/staff/notifications` →៤401; `/api/operator/notifications` →៤405 en GET (solo DELETE; `/api/staff/operators` →៤405 en GET (solo POST/DELETE.
 Las 3 env vars están en Vercel (Project Settings → Environment Variables): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Background: el deploy viejo de `main` (sha `74b4fe2`) fallaba con `Command "npm install" exited with 1` (package-lock corrupto) + falta de `app/`. El preview del PR compiló en Vercel (READY) antes del merge, confirmando el fix.

