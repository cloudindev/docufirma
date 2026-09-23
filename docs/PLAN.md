# DocuFirma — Plan de ejecución

Fuente de verdad del producto: especificación original (PROMPT). Este plan se marca a medida que avanza el trabajo.
Leyenda: `[x]` hecho · `[~]` hecho parcialmente / pendiente de credenciales externas · `[ ]` pendiente.

## Fase 0 — Bootstrap

- [x] Next.js 16 (App Router) + TypeScript estricto + pnpm
- [x] Tailwind CSS v4 + design tokens (`app/globals.css`) + fuente Inter local
- [x] Componentes base estilo shadcn/ui (Button, Card, Input, Label, Textarea, Badge, Dialog, Table, Toast, EmptyState, PageHeader, Spinner)
- [x] next-intl (`es` por defecto, `en`), rutas localizadas, `proxy.ts`
- [x] ESLint + Prettier (+ plugin Tailwind)
- [x] Vitest + Testing Library, Playwright
- [x] Supabase CLI (`supabase/config.toml`)
- [x] Estructura de carpetas (`lib/*`, `components/*`, `emails/`, `tests/`, `docs/`)
- [x] `CLAUDE.md`, `docs/PLAN.md`, `docs/DECISIONS.md`, `.env.example`, `.gitignore`
- [x] Validación de entorno con zod (`lib/env.ts`)
- [x] Repo git + primer push

## Fase 1 — Base de datos y Auth

- [x] Migraciones: enums, tablas, triggers `updated_at`, `handle_new_user`, índices
- [x] Ledger de créditos en SQL (`get_available_credits`, reserve/consume/release con bloqueo)
- [x] RLS en todas las tablas + `envelope_events` append-only
- [x] Buckets privados de Storage + políticas
- [x] Tipos `types/database.ts`
- [x] Clientes Supabase (browser, server, admin) + sesión en `proxy.ts` + protección `/app/**`
- [x] Registro, login (contraseña, magic link, Google), recuperar/restablecer, callback
- [x] Onboarding (3 pasos) — la edición completa del perfil y el logo están en Ajustes (Fase 3)
- [x] Tests de migraciones contra Postgres local

- [x] Supabase local sin Docker (`pnpm stack:up`) + e2e de autenticación contra GoTrue real

## Fase 2 — Landing y páginas públicas

- [x] Header, Hero, Cómo funciona, Características, Legalidad, Precios, FAQ, CTA, Footer
- [x] `/precios`, `/como-funciona`, `/legal/*`, `/verificar` (UI + API pública por código y por hash, con rate limit)
- [x] SEO: metadata, OG image, sitemap, robots, JSON-LD `SoftwareApplication`
- [x] Ilustraciones SVG propias
- [x] `docs/LEGAL.md` y borradores de textos legales ES/EN
- [x] E2E de la parte pública

## Fase 3 — Área privada

- [x] Layout con sidebar colapsable + topbar (buscador, contador de firmas, avatar)
- [x] Dashboard (KPIs, últimos envíos)
- [x] Contactos (CRUD)
- [x] Ajustes (perfil, logo, idioma, notificaciones, contraseña, eliminar cuenta)
- [x] Lista de envíos (filtros, búsqueda, paginación) y detalle (timeline, firmantes, descargas, acciones)
- [x] Emails transaccionales (react-email + Resend / buzón local) y recordatorios manuales
- [x] E2E del área privada (panel, contactos, ajustes)

## Fase 4 — Wizard de envío

- [x] Subida a Storage (validación tipo/tamaño, escaneo PDF, SHA-256, nº páginas)
- [x] Conversión imagen→PDF (sharp + pdf-lib) y DOCX→PDF (Gotenberg opcional, `DOCX_CONVERTER_URL`)
- [x] Autosave de borrador, reordenar/eliminar documentos
- [x] Destinatarios con autocompletado, orden secuencial, caducidad, recordatorios, locale
- [x] Resumen con coste en firmas + modal sin créditos
- [x] `sendEnvelope` (reserva, tokens, código de verificación, eventos, emails)
- [x] Emails de invitación (react-email, ES/EN)
- [x] E2E del wizard (2 PDF + firmante + envío + email en buzón) y validaciones

## Fase 5 — Vista del firmante

- [ ] Validación de token (hash, caducidad, turno secuencial), rate limit, `noindex`, `no-referrer`
- [ ] Visor PDF (pdf.js) con scroll hasta el final / confirmación de lectura
- [ ] `SignaturePad` biométrico (Pointer Events: x, y, t, presión, tilt, tipo de puntero)
- [ ] Consentimiento versionado + `completeSignature` (FOR UPDATE, cifrado AES-256-GCM, evidencias)
- [ ] Rechazo con motivo, liberación de créditos, notificaciones

## Fase 6 — Cierre del sobre

- [ ] PDF firmado (bloques de firma, pie de verificación, página de evidencias, metadatos)
- [ ] `evidence.pdf` completo con QR
- [ ] TSA RFC 3161 (Mensatek): TSQ, petición, parseo, verificación
- [ ] Reintentos con backoff (`jobs`), eventos `tsa_granted`/`tsa_failed`
- [ ] Emails de cierre
- [ ] Verificación pública por código y por hash
- [ ] Crons: recordatorios, expiración, reintentos TSA

## Fase 7 — Stripe

- [ ] `scripts/stripe-setup.ts`
- [ ] Checkout (suscripción y packs), Customer Portal
- [ ] Webhook idempotente + grants mensuales + packs
- [ ] Gating de envío + página de Facturación

## Fase 8 — Endurecimiento

- [ ] CSP, HSTS, cabeceras de seguridad, rate limit en endpoints públicos
- [ ] Sentry cliente/servidor
- [ ] Accesibilidad y rendimiento
- [ ] PAdES DocTimeStamp (opcional) o `.tsr` embebido
- [ ] E2E Playwright completos
- [ ] GitHub Actions (lint + typecheck + unit; e2e en main)
- [ ] README de despliegue desde cero
