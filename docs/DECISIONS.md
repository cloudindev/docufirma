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
