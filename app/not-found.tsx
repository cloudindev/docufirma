import Link from "next/link";
import "./globals.css";

/** Fallback for URLs outside any locale (the proxy normally redirects them first). */
export default function GlobalNotFound() {
  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100dvh",
          margin: 0,
          color: "#0B1B3F",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#1F4FE0", fontWeight: 600 }}>404</p>
          <h1>Página no encontrada · Page not found</h1>
          <Link href="/" style={{ color: "#1F4FE0" }}>
            DocuFirma
          </Link>
        </div>
      </body>
    </html>
  );
}
