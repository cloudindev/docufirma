# DocuFirma — Fundamentos legales y cumplimiento

> Documento técnico-legal para el equipo y para la revisión por un abogado. No es asesoramiento jurídico.
> Los textos públicos (aviso legal, privacidad, cookies, términos, política de firma) viven en `messages/*.json` → `legal.pages`
> y se muestran en `/[locale]/legal/[slug]` con un aviso de borrador hasta que se revisen.

## 1. Qué ofrece DocuFirma (y qué no)

- **Firma electrónica avanzada (FEA)** del art. 26 del Reglamento (UE) 910/2014 (eIDAS), de tipo **biométrico**.
- **Sello de tiempo cualificado** (arts. 41–42 eIDAS) emitido por un prestador cualificado (Mensatek, TSA propia o de la FNMT).
- **No** es firma electrónica cualificada (art. 3.12 y 25.2 eIDAS): no hay certificado cualificado del firmante ni dispositivo cualificado de creación.
  Nunca debe presentarse como "firma cualificada" en la UI, emails ni marketing.

## 2. Requisitos del art. 26 eIDAS y cómo se cumplen

| Requisito                                     | Implementación                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a) Vinculada al firmante de manera única      | Enlace personal con token de 256 bits enviado al email del firmante; solo se guarda `SHA-256(token)` (`signer_access_tokens`). Trazo biométrico propio.                                   |
| b) Permite la identificación del firmante     | Nombre, apellidos, email (canal de entrega), IP, geolocalización aproximada, agente de usuario, dispositivo, pantalla, zona horaria y datos biométricos del trazo (`signature_evidence`). |
| c) Creada con datos bajo su control exclusivo | El firmante dibuja la firma en su propio dispositivo tras revisar el documento (evento `scrolled_to_end`) y aceptar el consentimiento versionado.                                         |
| d) Detecta cualquier modificación posterior   | SHA-256 del original, del JSON biométrico y del PDF firmado; sello RFC 3161 sobre el PDF firmado y sobre el certificado de evidencias; verificación pública por código/hash.              |

Cadena de evidencias por sobre: `envelope_events` (append-only) con `opened`, `document_viewed`, `scrolled_to_end`, `consent_accepted`, `signed`, `tsa_granted`…

## 3. Sello de tiempo cualificado

- Protocolo: RFC 3161 (`TimeStampReq`/`TimeStampResp`), hash SHA-256, `certReq = true`, nonce aleatorio.
- Proveedor: Mensatek (`/tsaMENSATEK`, política OID `1.3.6.1.4.1.5734.3.18.1`) o FNMT vía Mensatek (`/tsaFNMT`).
- Presunción legal (art. 41.2 eIDAS): exactitud de fecha y hora e integridad de los datos sellados.
- Verificación independiente: `openssl ts -verify -in doc.tsr -data signed.pdf -CAfile mensatek-chain.pem` (ver `docs/API.md`).

## 4. Datos biométricos (RGPD)

- El trazo de firma con presión/tiempos puede ser **dato biométrico de categoría especial** (art. 9 RGPD) si permite identificar unívocamente.
  Base jurídica: **consentimiento explícito** (art. 9.2.a), recogido antes de firmar con texto versionado (`CONSENT_TEXT_VERSION`),
  hora, IP y agente de usuario (`signers.consent_*`, evento `consent_accepted`).
- Minimización: solo se captura el trazo en el canvas de firma; nada de cámara ni micrófono.
- Cifrado en reposo: **AES-256-GCM** con clave de `EVIDENCE_ENCRYPTION_KEY` (32 bytes, base64). Cada fichero guarda el `key_id`.
  **Rotación**: generar clave nueva → mover la actual a `EVIDENCE_ENCRYPTION_KEYS_OLD` (`keyId:base64`) → desplegar. Los ficheros antiguos se
  siguen descifrando con su `key_id`; opcionalmente re-cifrar con un script.
- Acceso: bucket privado `evidence`, solo service role; nunca se expone a navegadores.
- Retención por defecto **5 años** (`BIOMETRIC_RETENTION_YEARS`), justificada por el plazo general de prescripción de acciones personales
  (art. 1964 CC, 5 años). Un cron de retención purga biometría caducada (Fase 8).
- Rol: DocuFirma es **encargado del tratamiento** respecto de los datos de los firmantes (el remitente es responsable) y **responsable**
  respecto de los datos de sus clientes. Se necesita un **contrato de encargo** (art. 28 RGPD) dentro de los Términos.
- Evaluación de impacto (EIPD, art. 35): recomendable antes del lanzamiento por tratar datos biométricos a escala.

## 5. Eliminación de cuenta y derecho de supresión

Implementado en `delete_user_account` (ver `docs/DECISIONS.md` D-015):

- Se borran perfil, contactos, ledger, suscripción espejo, borradores y sobres **no completados** (y sus archivos).
- Los sobres **completados** se desvinculan y se conservan hasta el fin del plazo de retención para la defensa de reclamaciones
  (art. 17.3.e RGPD). Se anonimizan IP y agente de usuario de los eventos del remitente y se elimina su email de los sobres.
- Las **facturas** permanecen en Stripe (obligación fiscal, art. 30 Código de Comercio: 6 años).
- Se registra `sha256(email)` en `deleted_accounts` para conciliación contable.
- Supresión solicitada por un **firmante**: se tramita a través del remitente (responsable); si procede, se purga su biometría con un script de soporte.

## 6. Encargados del tratamiento

| Proveedor | Uso                 | Ubicación                              |
| --------- | ------------------- | -------------------------------------- |
| Supabase  | BBDD, Auth, Storage | UE (Frankfurt, `eu-central-1`)         |
| Vercel    | Hosting / funciones | UE (`fra1`)                            |
| Stripe    | Pagos y facturación | UE/EE. UU. (CCT + DPF)                 |
| Resend    | Email transaccional | UE/EE. UU. (CCT)                       |
| Mensatek  | Sello de tiempo     | España                                 |
| Sentry    | Errores             | UE (región EU) — sin datos biométricos |

## 7. Otros

- **Cookies**: solo técnicas (sesión, idioma, pago). Sin banner mientras no haya analítica.
- **LSSI-CE**: aviso legal con datos del titular (placeholders `[RAZÓN SOCIAL]`, `[NIF]`…).
- **Backups**: activar PITR en Supabase (plan Pro o superior). Los backups contienen biometría cifrada; la clave no está en la BD.
- **Registro de actividad**: `envelope_events` y `credit_ledger` son append-only a nivel de base de datos (triggers).

## 8. Pendiente para el abogado

- Completar los datos del titular y revisar todos los textos de `legal.pages`.
- Validar el texto de consentimiento del firmante (`signing.consent` en `messages/*.json`) y su versión.
- Revisar el plazo de retención (5 años) y la base jurídica del tratamiento de biometría.
- Redactar el contrato de encargo del tratamiento (art. 28 RGPD) como anexo de los Términos.
- Confirmar la política de firma frente a la Ley 6/2020 y la LEC (arts. 326 y 3.2 Ley 6/2020).
