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

## D-022 · Subida directa a Storage con URL firmada

Los archivos (hasta 25 MB) no pasan por las funciones serverless (límite de 4,5 MB en Vercel): el servidor crea una URL de subida
firmada en `originals/{user}/{envelope}/uploads/…`, el navegador sube directamente y `finalizeUpload` valida (tipo real por
magic bytes, PDF sin JavaScript/XFA/cifrado), convierte imágenes/DOCX, calcula SHA-256 y mueve el archivo a su ruta definitiva.

## D-023 · Borrador creado con el primer archivo

`/app/send` no crea borradores vacíos: el borrador nace con la primera subida y la URL pasa a `/app/send/{id}` con
`history.replaceState` (sin remontar el wizard). El paso 2 se autoguarda (debounce 0,9 s) solo con firmantes completos.

## D-024 · Página de firmas siempre nueva

El PDF firmado añade siempre una **página de firmas** al final (con el tamaño de la última página) en lugar de intentar
dibujar sobre la última página: detectar espacio libre de forma fiable exige analizar el contenido y podría tapar texto.
Después va una página de resumen de evidencias con QR, y todas las páginas llevan el pie con el código de verificación.

## D-025 · `.tsr` fuera del PDF + sello PAdES opcional

Adjuntar el `.tsr` dentro del PDF cambiaría su hash (el sello es sobre esos bytes). El `.tsr` se descarga aparte (app y
`/verificar`) y es la evidencia legal principal. Opcionalmente (`PADES_DOC_TIMESTAMP=true`), antes de calcular el hash
final se incrusta un _document timestamp_ PAdES (`/DocTimeStamp`, `ETSI.RFC3161`) para que Adobe Reader muestre el sello
en el panel de firmas. Consume un sello adicional de la TSA por documento y, si falla, el cierre continúa sin él.

## D-026 · Fuentes estándar PDF (WinAnsi)

Los PDF usan Helvetica/Courier estándar (sin incrustar fuentes, PDFs ligeros y deterministas). Cubren español e inglés;
caracteres fuera de WinAnsi se transliteran (Ł→L, ś→s) o se sustituyen por "?" sin romper la generación.

## D-027 · pdf.js _legacy_ en el navegador

La build moderna de pdf.js v6 usa APIs JS muy recientes (p. ej. `Map.prototype.getOrInsertComputed`) ausentes en muchos
móviles. Se usa `pdfjs-dist/legacy`, con el worker empaquetado por Next (sin CDN).

## D-028 · TSA de pruebas local

Para desarrollo y e2e sin acceso a Mensatek, `TSA_PROVIDER=test` usa una TSA RFC 3161 implementada con pkijs y una clave
desechable (`tests/fixtures/tsa`). Sus tokens se verifican con OpenSSL pero no tienen valor legal.

## D-029 · Consentimiento y lectura

El botón "Continuar a la firma" se habilita cuando se llega al final de cada documento (evento `scrolled_to_end`) **o**
cuando el firmante marca "He leído el documento completo" (alternativa accesible si el scroll no se detecta).

## D-030 · Stripe dirigido por webhooks

El estado de la suscripción se refleja solo desde eventos `customer.subscription.*` (no se consulta la API en el webhook),
las firmas mensuales se conceden en `invoice.paid` (10 firmas hasta el fin del periodo de la línea de factura) y los packs en
`checkout.session.completed` / `async_payment_succeeded` con el catálogo `credit_packs` como fuente de verdad del nº de firmas.
Idempotencia doble: tabla `stripe_events` (por id de evento) y claves únicas del ledger (por factura / payment intent).
Adaptado a la API `2026-08-26.dahlia` del SDK v22 (periodos en `items.data[].current_period_*`, suscripción en `invoice.parent`).

## D-031 · Packs sin suscripción y precios con IVA incluido

Los packs se pueden comprar sin suscripción. Todos los precios se crean con `tax_behavior: inclusive` y Stripe Tax
(`automatic_tax`), así el precio mostrado (9 €, 15 €, 49 €, 199 €) es el final para el cliente.

## D-032 · Stripe inaccesible en el entorno de desarrollo

La red del sandbox bloquea `api.stripe.com`. Checkout y Customer Portal no se han podido ejecutar aquí; el webhook se prueba
de extremo a extremo con eventos firmados localmente (`tests/e2e/stripe-webhook.spec.ts`). En un entorno con red, usar
`stripe listen --forward-to localhost:3000/api/stripe/webhook` y tarjetas de test.

## D-033 · CSP con nonce en la app y el firmante

`/app` y `/sign` (rutas con datos y la captura biométrica) usan una CSP estricta generada en `proxy.ts` por petición:
`script-src 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `connect-src` limitado a Supabase y Sentry. Las
páginas de marketing son estáticas (no pueden llevar nonce por petición) y usan una CSP base desde `next.config.ts` con
`'unsafe-inline'` solo para scripts. Las cookies de sesión de Supabase se emiten `HttpOnly`, `SameSite=Lax` y `Secure` en
producción (el cliente de navegador no las lee: toda la autenticación pasa por el servidor).

## D-034 · Sentry sin datos personales

Sentry solo se activa con `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`. Recogida de datos por defecto desactivada (sin IP, sin
cookies, sin cuerpos), y `beforeSend` elimina tokens de firmante de las URLs, cabeceras y breadcrumbs. Sin Session Replay.

## D-035 · Purga de biometría por cron

`/api/cron/retention` (diario) borra el JSON biométrico cifrado de las firmas de sobres cerrados hace más de
`BIOMETRIC_RETENTION_YEARS` (5 por defecto) y marca `biometric_purged_at`. El PDF firmado, el certificado de evidencias y
el `.tsr` se conservan (su hash sigue siendo verificable); el certificado ya incluye las métricas agregadas.
