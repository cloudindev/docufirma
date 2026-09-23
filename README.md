# DocuFirma

Firma electrónica avanzada (biométrica) con sello de tiempo cualificado RFC 3161 para autónomos y pymes —
[docufirma.es](https://docufirma.es).

- Producto, stack y convenciones: [`CLAUDE.md`](./CLAUDE.md)
- Plan y estado: [`docs/PLAN.md`](./docs/PLAN.md) · Decisiones: [`docs/DECISIONS.md`](./docs/DECISIONS.md)
- Marco legal (eIDAS, RGPD, retención): [`docs/LEGAL.md`](./docs/LEGAL.md) · API pública: [`docs/API.md`](./docs/API.md)

## Desarrollo local

Requisitos: Node ≥ 20.9 (recomendado 22), pnpm 10, y **o bien** Docker (Supabase CLI) **o bien** un PostgreSQL ≥ 15.

```bash
pnpm install
cp .env.example .env.local        # rellena lo que necesites (ver comentarios)

# Opción A — Supabase oficial (Docker)
pnpm supabase:start               # copia las claves que imprime a .env.local

# Opción B — sin Docker: GoTrue + PostgREST + emulador de Storage en :54321
pnpm stack:up                     # escribe las claves en .env.local (usa LOCAL_PG_ADMIN_URL)

pnpm dev                          # http://localhost:3000
```

Sin Resend configurado, los emails se escriben en `.local-stack/mail/` (outbox). Con `TSA_PROVIDER=test` los sellos
los emite una TSA local de pruebas (sin valor legal).

| Comando                                    | Qué hace                                             |
| ------------------------------------------ | ---------------------------------------------------- |
| `pnpm typecheck && pnpm lint && pnpm test` | Comprobaciones rápidas (TS, ESLint, Vitest)          |
| `pnpm test:db`                             | Tests SQL de RLS, créditos y sobres (Postgres local) |
| `E2E_WITH_BACKEND=1 pnpm test:e2e`         | Playwright contra build de producción + backend      |
| `pnpm db:types` / `pnpm supabase:types`    | Regenera `types/database.ts`                         |
| `pnpm email:dev`                           | Previsualiza los emails (react-email)                |

## Despliegue desde cero (≈ 30 minutos)

### 1. Supabase (UE · Frankfurt)

1. Crea un proyecto en [supabase.com](https://supabase.com) en la región **eu-central-1 (Frankfurt)**. Plan Pro
   recomendado (backups diarios + **PITR**, que conviene activar en _Database → Backups_).
2. Aplica el esquema:
   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <ref>
   pnpm supabase:push                 # migraciones de supabase/migrations (tablas, RLS, funciones, buckets)
   ```
3. **Authentication → URL Configuration**: _Site URL_ `https://docufirma.es`; _Redirect URLs_
   `https://docufirma.es/auth/callback` y `https://docufirma.es/auth/confirm` (añade las de preview de Vercel si las usas).
4. **Authentication → Email Templates**: pega el contenido de `supabase/templates/*.html` (confirmación, magic link,
   recuperación, cambio de email) con los asuntos de `supabase/config.toml`. Son bilingües y apuntan a `/auth/confirm`.
5. **Authentication → SMTP**: usa Resend (host `smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key)
   con remitente `no-reply@mail.docufirma.es`.
6. (Opcional) **Google**: activa el proveedor con tu OAuth client (redirect `https://<ref>.supabase.co/auth/v1/callback`)
   y pon `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`.
7. Copia de _Project Settings → API_: URL, `anon` key y `service_role` key.

### 2. Stripe

1. Activa **Stripe Tax** (registro de IVA en España) y el **Customer Portal** en el dashboard.
2. Crea productos y precios (Pro 9 €/mes IVA incl. y packs 25/100/500, todos `tax_behavior=inclusive`), sincroniza los
   packs con la tabla `credit_packs` y crea la configuración del portal:
   ```bash
   STRIPE_SECRET_KEY=sk_live_... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm stripe:setup --portal
   ```
   Guarda el `STRIPE_PRICE_PRO_MONTHLY` que imprime.
3. **Developers → Webhooks**: endpoint `https://docufirma.es/api/stripe/webhook` con los eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`. Copia el _signing secret_.

### 3. Resend

Añade el dominio `mail.docufirma.es` y crea en tu DNS los registros que indica Resend: **SPF** (TXT/MX de `send`),
**DKIM** (TXT `resend._domainkey`) y **DMARC** (`_dmarc.docufirma.es`, empieza con `v=DMARC1; p=none; rua=mailto:…` y
sube a `quarantine` cuando los informes estén limpios). Crea una API key con permiso de envío.

### 4. Mensatek (sello de tiempo cualificado)

Con las credenciales HTTP Basic del panel de Mensatek rellena `MENSATEK_TSA_USER` / `MENSATEK_TSA_PASSWORD`
(`MENSATEK_TSA_ENDPOINT` = `…/tsaMENSATEK`, 1 crédito por sello; `…/tsaFNMT` usa la TSA de FNMT, 2 créditos).
Recomendado: exporta la cadena de certificados de la TSA a `TSA_TRUSTED_CERTS_PEM` para validar la cadena de cada token.
`PADES_DOC_TIMESTAMP=true` añade además un sello PAdES visible en Adobe Reader (un sello extra por documento).

### 5. Vercel

1. Importa el repositorio en Vercel (framework Next.js, `pnpm install`, región de funciones **fra1** ya fijada en
   `vercel.json`).
2. Variables de entorno (Production y Preview) según `.env.example`. Genera los secretos así:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # EVIDENCE_ENCRYPTION_KEY
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # CRON_SECRET
   ```
   Nunca definas `TSA_PROVIDER` ni `RATE_LIMIT_DISABLED` en producción.
3. **Dominios**: `docufirma.es` como principal y `www.docufirma.es` redirigido (la app también redirige `www` → apex).
4. **Crons**: los ejecuta Supabase (`pg_cron` + `pg_net`), no Vercel, así que funcionan también en el plan Hobby. La
   migración `…101000_scheduled_jobs.sql` programa recordatorios (cada hora), caducidad (cada hora), reintento de sellos
   (cada 5 min) y purga biométrica (diaria). Cuando el dominio ya responda, en Supabase → _SQL Editor_ ejecuta una vez:
   ```sql
   select vault.create_secret('https://docufirma.es', 'app_url');
   select vault.create_secret('<el mismo valor que CRON_SECRET en Vercel>', 'cron_secret');
   ```
   Compruébalo en _Integrations → Cron_ (historial de ejecuciones) y en la tabla `net._http_response` (respuestas 200).
   Si cambias `CRON_SECRET`, actualiza el secreto con `vault.update_secret`.
5. (Opcional) **Sentry**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` y, para subir source maps, `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`.
6. Despliega y comprueba: registro → email de confirmación → envío de un sobre → firma desde el móvil → PDF firmado y
   certificado de evidencias → `/es/verificar` con el código.

### 6. Rotación de la clave de evidencias

La biometría se cifra con AES-256-GCM. Para rotar: genera una clave nueva, pon la actual en
`EVIDENCE_ENCRYPTION_KEYS_OLD` (lista separada por comas) y la nueva en `EVIDENCE_ENCRYPTION_KEY`. Los datos antiguos se
siguen descifrando por su _key id_; los nuevos usan la clave nueva. **Nunca** borres una clave antigua mientras queden
evidencias cifradas con ella (retención: `BIOMETRIC_RETENTION_YEARS`).

## CI

`.github/workflows/ci.yml`: en cada PR, formato + lint + typecheck + Vitest y los tests SQL contra Postgres; en `main`,
además la batería Playwright completa contra el build de producción con el backend local (`pnpm stack:up`).
