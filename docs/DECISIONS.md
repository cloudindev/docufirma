# Decisiones de producto y arquitectura

Registro de decisiones tomadas cuando la especificación no las resolvía (o cuando el entorno obligó a adaptarla).
Formato: fecha · decisión · motivo.

## D-001 · Next.js 16.3 en lugar de 15

La especificación pide "Next.js 15+". Se usa la última estable (16.3). Consecuencias:

- El antiguo `middleware.ts` se llama `proxy.ts` (runtime Node.js, no Edge).
- `params`, `searchParams`, `cookies()` y `headers()` son siempre asíncronos.
- `next lint` ya no existe: `pnpm lint` ejecuta la CLI de ESLint.

## D-002 · Tailwind v4 sin `tailwind.config`

Tailwind v4 se configura en CSS. Los design tokens viven como variables CSS en `app/globals.css`
y se exponen a Tailwind con `@theme inline` (p. ej. `bg-primary`, `text-ink-muted`, `rounded-lg`, `shadow-card`).
No hay `tailwind.config.ts`.

## D-003 · Botones `rounded-full`

Se elige `rounded-full` para todos los botones (primario, secundario, terciario) por coherencia con la estética aireada de la referencia.
Inputs y cards usan `rounded-xl` / `rounded-lg`.

## D-004 · Fuente Inter servida localmente

Se usa `@fontsource-variable/inter` con `next/font/local` en lugar de `next/font/google`.
Evita la dependencia de red en build y no envía IPs de visitantes a Google (RGPD).

## D-005 · Componentes shadcn/ui escritos a mano

Se sigue la API y el estilo de shadcn/ui (Radix vía el paquete `radix-ui`, `cva`, `cn`) pero los componentes se escriben
en `components/ui/` directamente, sin la CLI (el registro no es accesible desde el entorno de desarrollo). Son equivalentes y editables.

## D-006 · Rutas localizadas con carpetas en inglés

Las carpetas del App Router usan nombres en inglés (`pricing`, `how-it-works`, `verify`, `legal/[slug]`)
y `next-intl` traduce los pathnames: `/es/precios` ↔ `/en/pricing`, `/es/como-funciona` ↔ `/en/how-it-works`, `/es/verificar` ↔ `/en/verify`.
El área privada (`/app/**`) y la vista de firma (`/sign/[token]`) no se traducen en la URL. El prefijo de locale es siempre visible (`localePrefix: 'always'`).

## D-007 · Rama de trabajo y `main`

La especificación pide trabajar sobre `main`. El entorno de desarrollo asigna además la rama `claude/vibrant-curie-f8cckf`.
Se hace commit en esa rama y, al cerrar cada fase, se publica el mismo commit en `main` y en la rama asignada.

## D-008 · Playwright con Chromium preinstalado

`playwright.config.ts` acepta `PLAYWRIGHT_CHROMIUM_PATH` para usar un Chromium existente (imágenes de CI o sandbox sin descargas).
Sin la variable se usa el navegador gestionado por Playwright (`pnpm exec playwright install chromium`).

## D-009 · Mensatek inaccesible desde el entorno de desarrollo

La política de red del sandbox de desarrollo bloquea `api.mensatek.com`. La integración RFC 3161 se prueba contra una TSA de pruebas
generada localmente (mismo formato TSQ/TSR). Las credenciales reales solo viven en `.env.local` (ignorado) y en Vercel.
Cuando haya red, `pnpm tsx scripts/tsa-probe.ts` obtiene un TSR real para `tests/fixtures`.

## D-010 · Libro mayor de créditos

- El saldo nunca se guarda: se calcula sumando `credit_ledger` (append-only, protegido por trigger).
- `reserve` (−1) al enviar, `consume` (marcador 0) al firmar, `release` (+1) al rechazar/cancelar/expirar.
- Las filas mensuales (grant, reserve, release) llevan el `expires_at` de su ciclo; solo cuenta el ciclo vigente más reciente,
  así las firmas mensuales **no se acumulan** aunque Stripe envíe la factura siguiente antes de tiempo.
- Las firmas de prueba (`trial_grant`) viven en el pool `pack` (no caducan).
- Toda mutación pasa por funciones SQL `SECURITY DEFINER` con bloqueo de la fila del perfil (`FOR UPDATE`), invocables solo con service role.

## D-011 · Gating de envío por créditos, no por suscripción

La especificación dice que sin suscripción no se puede enviar, pero también que las firmas de prueba y los packs se pueden
usar/comprar sin suscripción. Regla aplicada: **se puede enviar si hay créditos suficientes** (mensuales, de pack o de prueba).
Las mensuales solo existen con una suscripción pagada, así que el plan sigue siendo la vía normal.

## D-012 · Tokens de firmante en tabla propia

`signers.token_hash` refleja el último token emitido, pero todos los tokens se guardan (solo su SHA-256) en `signer_access_tokens`.
Motivo: un recordatorio necesita un enlace nuevo (el token en claro no se guarda) y los enlaces de emails anteriores deben seguir
funcionando hasta la caducidad. En sobres secuenciales, el token del siguiente firmante se emite cuando le toca.

## D-013 · Artefactos firmados con `kind`

`signed_documents` guarda un registro por documento firmado (`kind = 'document'`) y uno por sobre para el certificado de evidencias
(`kind = 'evidence'`), cada uno con su propio sello de tiempo. Así el reintento de sellado trata ambos igual.

## D-014 · Estado del sobre durante el cierre

Cuando firma el último firmante se marca `all_signed_at` y se encola un job `close_envelope`. El sobre pasa a `completed`
solo cuando existen los PDF firmados y el certificado (el sellado de tiempo puede seguir pendiente y reintentarse).

## D-015 · Eliminación de cuenta

`delete_user_account` borra perfil, contactos, ledger, suscripción espejo, borradores y sobres no completados (con sus archivos).
Los sobres **completados** se desvinculan de la cuenta y se conservan durante el plazo de retención (art. 17.3.e RGPD: defensa
de reclamaciones), con los identificadores de red del remitente anonimizados. Se registra un hash del email en `deleted_accounts`.

## D-016 · Firmas de prueba configurables en BD

El trigger de alta lee `app_settings.trial_credits` (por defecto 3). `TRIAL_CREDITS` se usa para los textos de la UI; ambos deben coincidir
(`update public.app_settings set value = '0' where key = 'trial_credits'` desactiva el trial).

## D-017 · Supabase local sin Docker

Además del flujo oficial (`supabase start`), `pnpm stack:up` levanta GoTrue y PostgREST (binarios oficiales de GitHub),
un emulador del API de Storage y una pasarela con las mismas rutas que Kong, sobre un Postgres existente. Permite ejecutar
la app y los e2e en entornos sin Docker. `pnpm db:types` genera `types/database.ts` introspeccionando las migraciones.

## D-018 · Emails de Supabase Auth bilingües

Supabase no localiza plantillas por usuario; las plantillas de `supabase/templates` eligen idioma con `user_metadata.locale`
(Go templates). Enlazan a `/auth/confirm?token_hash=…` (flujo SSR recomendado).

## D-019 · Plantillas de email agrupadas

Las 9 plantillas pedidas se implementan en 4 componentes react-email con variantes (mismo diseño, menos duplicación):
`signer-invitation` (invitación y recordatorio), `envelope-notice` (visto, rechazado, caducado),
`envelope-completed` (remitente y firmante) y `account-notice` (bienvenida, pago fallido, pocas firmas).
Sin `RESEND_API_KEY` los emails se escriben en un buzón local (`EMAIL_OUTBOX_DIR`, por defecto `.local-stack/mail`), que usan los e2e.

## D-020 · Logo del remitente público por URL estable

El logo se guarda normalizado a PNG en el bucket privado `branding` y se sirve en `/api/branding/{userId}` (no es secreto).
Así los emails ya enviados no rompen la imagen al caducar una URL firmada.

## D-021 · Recordatorios manuales

"Recordar a pendientes" emite un token nuevo por firmante (los anteriores siguen válidos, D-012) y está limitado a uno por hora y firmante.
