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

- Rama actual de trabajo: `fix/estructura-next-para-despliegue` (commit `37ce248`）。
- El `GITHUB_TOKEN` del entorno es de `brayanvargasblanco1-droid` y tiene solo **lectura** en este repo (pull:true, push:false) → no se puede pushear/PFR desde este entorno.
 El repo es público (`vargasblancobrayan-cyber/unicall-blue`)。