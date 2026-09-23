@AGENTS.md

# DocuFirma — guía para agentes y desarrolladores

SaaS de firma electrónica avanzada (biométrica) con sello de tiempo cualificado RFC 3161 (Mensatek) para autónomos y pymes.
Producción: https://docufirma.es · Repo: https://github.com/cloudindev/docufirma

Plan y estado: `docs/PLAN.md` · Decisiones: `docs/DECISIONS.md` · Legal: `docs/LEGAL.md` · API/TSA: `docs/API.md`.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions, Route Handlers) + TypeScript `strict`. Ojo: `middleware.ts` ahora es `proxy.ts`, y `params`/`searchParams`/`cookies()`/`headers()` son asíncronos. Consulta `node_modules/next/dist/docs/` antes de usar APIs de Next.
- **Tailwind CSS v4** (tokens en `app/globals.css`, sin `tailwind.config`) + componentes estilo **shadcn/ui** en `components/ui` (Radix vía `radix-ui`, `cva`, `cn`).
- **next-intl 4**: locales `es` (default) y `en`, prefijo siempre visible, pathnames traducidos en `lib/i18n/routing.ts`.
- **Supabase**: Postgres + Auth + Storage (buckets privados). Migraciones SQL en `supabase/migrations`. RLS en todas las tablas.
- **Stripe** (Checkout, Portal, Webhooks, Tax) · **Resend** + `react-email` · **pdf-lib** / **pdfjs-dist** · **pkijs** + **asn1js** (RFC 3161).
- Tests: **Vitest** (unit, `tests/unit`) y **Playwright** (e2e, `tests/e2e`).
- Gestor de paquetes: **pnpm**. Node ≥ 20.9.

## Comandos

| Comando                                 | Qué hace                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev`                              | Servidor de desarrollo (Turbopack) en http://localhost:3000                                           |
| `pnpm build` / `pnpm start`             | Build y servidor de producción                                                                        |
| `pnpm lint` / `pnpm lint:fix`           | ESLint (flat config)                                                                                  |
| `pnpm typecheck`                        | `next typegen` + `tsc --noEmit`                                                                       |
| `pnpm format`                           | Prettier (con orden de clases Tailwind)                                                               |
| `pnpm test`                             | Vitest (unit)                                                                                         |
| `pnpm test:db`                          | Aplica las migraciones sobre un Postgres local efímero y ejecuta los tests SQL (`scripts/test-db.ts`) |
| `pnpm test:e2e`                         | Playwright (levanta `pnpm build && pnpm start` si no hay `E2E_BASE_URL`)                              |
| `pnpm email:dev`                        | Previsualización de plantillas de email en :3001                                                      |
| `pnpm stripe:setup`                     | Crea/lee productos y precios de Stripe y los sincroniza con `credit_packs`                            |
| `pnpm supabase:start` / `supabase:stop` | Supabase local (requiere Docker)                                                                      |
| `pnpm supabase:reset`                   | Recrea la BD local aplicando migraciones + `seed.sql`                                                 |
| `pnpm supabase:push`                    | Aplica migraciones al proyecto enlazado (`supabase link`)                                             |
| `pnpm supabase:migration <nombre>`      | Nueva migración vacía                                                                                 |
| `pnpm supabase:types`                   | Regenera `types/database.ts` desde el proyecto enlazado                                               |

Cierre de cada fase: `pnpm typecheck && pnpm lint && pnpm test`.

## Estructura

```
app/[locale]/(marketing)   landing, precios, cómo funciona, legal, verificar
app/[locale]/(auth)        login, registro, recuperar/restablecer contraseña
app/[locale]/app           área privada (sidebar)
app/[locale]/sign/[token]  vista pública del firmante (sin login)
app/api/*                  webhooks de Stripe, crons, verificación
app/auth/*                 callbacks de Supabase Auth (sin locale)
components/{ui,brand,marketing,app,signing,pdf}
lib/{supabase,stripe,pdf,tsa,signing,email,credits,i18n}
emails/                    plantillas react-email
messages/{es,en}.json      textos (es.json es la fuente de verdad del tipado)
supabase/                  config.toml, migrations/, seed.sql
tests/{unit,e2e,fixtures}
```

## Convenciones

- Código, identificadores, tablas, commits y comentarios en **inglés**. Textos de UI y emails en `messages/*.json` (es + en, mismas claves; un test lo verifica).
- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), pequeños.
- Sin `any` salvo justificado con comentario. Validación con **zod** en cliente y servidor (esquemas compartidos en `lib/**/schemas.ts`).
- Lógica sensible (créditos, PDF, sellado, Stripe, vista del firmante) **solo en servidor** con el cliente admin (`lib/supabase/admin.ts`, `server-only`). El navegador usa la anon key bajo RLS.
- Archivos siempre en buckets privados; descargas vía URLs firmadas de corta duración tras comprobar permisos.
- Nunca secretos en el código ni en este archivo: todo por variables de entorno (`.env.example`). `lib/env.ts` valida con zod de forma perezosa.
- Páginas bajo `[locale]`: llama a `resolveLocale(params)` (`lib/i18n/server.ts`) al principio para validar el locale y habilitar render estático.
- Enlaces internos con `Link`/`redirect` de `lib/i18n/navigation.ts` y rutas declaradas en `routing.pathnames`.
- Botones `rounded-full`; inputs `rounded-xl`; cards `rounded-lg` + `shadow-card`. Iconos `lucide-react` con `strokeWidth={1.75}`.

## Decisiones de arquitectura clave

Ver `docs/DECISIONS.md` para el detalle. Resumen:

- Next 16 (`proxy.ts`), Tailwind v4 CSS-first, shadcn escrito a mano, Inter local.
- Rutas con carpetas en inglés y pathnames traducidos por next-intl.
