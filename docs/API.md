# DocuFirma — API, crons y sellado de tiempo

## Endpoints HTTP

| Método y ruta                              | Auth                                 | Descripción                                                                                                        |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/verify/{code\|sha256}`           | pública, 20 req/min/IP               | Verificación pública por código `DF-XXXX-XXXX` o por SHA-256 del PDF firmado. Nunca expone el documento ni emails. |
| `GET /api/verify/{code}/tsr?artifact={id}` | pública, 30 req/min/IP               | Descarga el `.tsr` (RFC 3161) de un artefacto sellado.                                                             |
| `GET /api/branding/{userId}`               | pública                              | Logo del remitente (PNG normalizado).                                                                              |
| `POST /api/stripe/webhook`                 | firma Stripe                         | Webhook de Stripe (Fase 7).                                                                                        |
| `GET /api/cron/reminders`                  | `Authorization: Bearer $CRON_SECRET` | Recordatorios automáticos (cada hora).                                                                             |
| `GET /api/cron/expire`                     | ídem                                 | Caduca sobres vencidos, libera firmas, avisa al remitente.                                                         |
| `GET /api/cron/retry-tsa`                  | ídem                                 | Reintenta cierres pendientes y sellos de tiempo fallidos (cada 5 min).                                             |
| `GET /auth/callback`, `GET /auth/confirm`  | —                                    | Callbacks de Supabase Auth.                                                                                        |

Las acciones de la app y de la vista del firmante son **Server Actions** (no API pública).
`vercel.json` programa los crons (los intervalos de minutos requieren plan Pro de Vercel; en Hobby usa un cron externo o intervalos diarios).

## Flujo de cierre de un sobre

1. El último firmante firma → `complete_signature` marca `all_signed_at` y encola el job `close_envelope`.
2. Tras responder al firmante (`after()`), `closeEnvelope` reclama el job (`claim_job_by_key`, sin carreras):
   PDF firmado por documento → `evidence.pdf` → `mark_envelope_completed` → sellos RFC 3161 → emails de cierre.
3. Si el sellado falla, el artefacto queda `tsa_status = failed` y se encola `retry_tsa` con backoff 1 min, 5 min, 30 min, 2 h y 24 h.
   Al 3.er fallo se registra un error (Sentry). El PDF firmado ya está disponible; la UI muestra "sello pendiente".
4. Si el proceso se interrumpe, el cron `retry-tsa` recoge el job `close_envelope` pendiente (idempotente).

## Sello de tiempo (Mensatek, RFC 3161)

- `POST https://api.mensatek.com/tsaMENSATEK` (1 crédito) o `…/tsaFNMT` (2 créditos). HTTP Basic con `MENSATEK_TSA_USER` / `MENSATEK_TSA_PASSWORD`.
- Petición: `Content-Type: application/timestamp-query`, cuerpo DER `TimeStampReq` (SHA-256, `certReq = true`, nonce de 64 bits).
- Respuesta: `application/timestamp-reply`, DER `TimeStampResp`.
- Verificación automática (`lib/tsa/rfc3161.ts`): estado _granted_, nonce, `messageImprint` = SHA-256 del PDF, firma CMS con el certificado
  incluido, EKU `timeStamping` y, si se configura `TSA_TRUSTED_CERTS_PEM`, la cadena a una raíz de confianza en la fecha del sello.
- Política Mensatek: `1.3.6.1.4.1.5734.3.18.1`.

### Verificación manual con OpenSSL

```bash
# 1. Descarga el PDF firmado y su .tsr (app o página /verificar).
# 2. Obtén la cadena de la TSA (Mensatek / FNMT) en PEM: mensatek-chain.pem
openssl ts -reply -in doc.tsr -text          # inspecciona fecha, serie, política y hash
openssl ts -verify -in doc.tsr -data signed.pdf -CAfile mensatek-chain.pem
# → "Verification: OK"
```

Si el `.tsr` no incluye toda la cadena, añade el certificado intermedio con `-untrusted intermedio.pem`.

### TSA de pruebas (solo desarrollo)

`TSA_PROVIDER=test` usa una TSA local (`lib/tsa/test-tsa.ts`) firmada con la clave desechable de `tests/fixtures/tsa`.
Genera tokens RFC 3161 válidos estructuralmente (OpenSSL los verifica con `-CAfile tests/fixtures/tsa/test-ca.pem`) pero **sin valor legal**.
Nunca actives `TSA_PROVIDER=test` en producción.

Regenerar los certificados de prueba:

```bash
cd tests/fixtures/tsa
openssl req -x509 -newkey rsa:2048 -nodes -keyout test-ca.key.pem -out test-ca.pem -days 7300 \
  -subj "/C=ES/O=DocuFirma TEST/CN=DocuFirma Test Root CA" -extensions ca_ext -config <(cat /usr/lib/ssl/openssl.cnf ext.cnf)
openssl req -newkey rsa:2048 -nodes -keyout k.pem -out tsa.csr -subj "/C=ES/O=DocuFirma TEST/CN=DocuFirma Test TSA"
openssl x509 -req -in tsa.csr -CA test-ca.pem -CAkey test-ca.key.pem -CAcreateserial -out test-tsa.pem -days 7300 -extfile ext.cnf -extensions tsa_ext
openssl pkcs8 -topk8 -nocrypt -in k.pem -out test-tsa.pkcs8.pem && rm k.pem tsa.csr test-ca.srl
```

### Obtener un TSR real de Mensatek para los tests

Con red hacia `api.mensatek.com` y credenciales en `.env.local`:

```bash
echo "docufirma" > /tmp/probe.txt
openssl ts -query -data /tmp/probe.txt -sha256 -cert -out /tmp/probe.tsq
curl -u "$MENSATEK_TSA_USER:$MENSATEK_TSA_PASSWORD" -H 'Content-Type: application/timestamp-query' \
  --data-binary @/tmp/probe.tsq -o tests/fixtures/mensatek-probe.tsr "$MENSATEK_TSA_ENDPOINT"
cp /tmp/probe.txt tests/fixtures/mensatek-probe.txt; cp /tmp/probe.tsq tests/fixtures/mensatek-probe.tsq
```

`tests/unit/tsa-real.test.ts` valida ese fixture automáticamente cuando existe.

## Evidencias biométricas

- JSON canónico (`canonicalJson`) de `{ version, canvas, strokes[{ pointerType, points[{ x, y, t, p, tx, ty }] }] }`.
- `biometric_sha256` = SHA-256 del JSON en claro (verificable tras descifrar).
- Guardado cifrado con AES-256-GCM: `DFE1 | len(keyId) | keyId | iv(12) | tag(16) | ciphertext` (`lib/signing/evidence-crypto.ts`).
