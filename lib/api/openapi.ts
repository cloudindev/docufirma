import { LIMITS } from "@/lib/config";
import { WEBHOOK_EVENTS } from "./webhooks-events";

/** OpenAPI 3.1 description of the public API, served at /api/v1/openapi.json. */
export function openApiSpec(serverUrl: string) {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const err = (description: string) => ({
    description,
    content: { "application/json": { schema: ref("Error") } },
  });
  const ok = (schema: object, description = "OK") => ({
    description,
    content: { "application/json": { schema } },
  });
  const idParam = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
  const common = {
    "401": err("Missing, invalid or revoked API key."),
    "403": err("No active Pro plan (`subscription_required`)."),
    "429": err("Rate limit exceeded (120 requests per minute per key)."),
  };
  const ts = { type: ["string", "null"], format: "date-time" };

  return {
    openapi: "3.1.0",
    info: {
      title: "DocuFirma API",
      version: "1.0.0",
      description:
        "Send documents for advanced electronic signature with a qualified timestamp. Available with the Pro plan.",
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, "")}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "df_live_…" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", examples: ["validation_error"] },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
        SignerInput: {
          type: "object",
          required: ["first_name", "last_name", "email"],
          additionalProperties: false,
          properties: {
            first_name: { type: "string", maxLength: 80 },
            last_name: { type: "string", maxLength: 120 },
            email: { type: "string", format: "email" },
            phone: { type: "string", description: "Mobile number; required with require_sms_otp." },
            require_sms_otp: { type: "boolean", default: false },
            delivery: { type: "string", enum: ["email", "in_person"], default: "email" },
          },
        },
        DocumentInput: {
          type: "object",
          required: ["name", "content_base64"],
          additionalProperties: false,
          properties: {
            name: { type: "string", examples: ["contract.pdf"] },
            content_base64: { type: "string", description: "PDF, PNG, JPEG or WebP, up to 3 MB." },
          },
        },
        EnvelopeSettings: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", maxLength: 200 },
            message: { type: "string", maxLength: 2000 },
            locale: { type: "string", enum: ["es", "en"] },
            sequential: { type: "boolean" },
            expiry_days: { type: "integer", minimum: 1, maximum: LIMITS.maxExpiryDays },
            reminder_days: { type: "integer", minimum: 0, maximum: 30 },
            signers: {
              type: "array",
              maxItems: LIMITS.maxSignersPerEnvelope,
              items: ref("SignerInput"),
            },
          },
        },
        EnvelopeCreate: {
          allOf: [
            ref("EnvelopeSettings"),
            {
              type: "object",
              required: ["title"],
              properties: {
                documents: {
                  type: "array",
                  maxItems: LIMITS.maxDocumentsPerEnvelope,
                  items: ref("DocumentInput"),
                },
                send: { type: "boolean", description: "Send right away (default false: draft)." },
              },
            },
          ],
        },
        Signer: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            object: { const: "signer" },
            first_name: { type: "string" },
            last_name: { type: "string" },
            email: { type: "string" },
            order: { type: "integer" },
            status: { type: "string", enum: ["pending", "sent", "viewed", "signed", "declined"] },
            delivery: { type: "string", enum: ["email", "in_person"] },
            phone: { type: ["string", "null"] },
            require_sms_otp: { type: "boolean" },
            sent_at: ts,
            viewed_at: ts,
            signed_at: ts,
            declined_at: ts,
            decline_reason: { type: ["string", "null"] },
          },
        },
        Document: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            object: { const: "document" },
            name: { type: "string" },
            order: { type: "integer" },
            page_count: { type: "integer" },
            size_bytes: { type: "integer" },
            sha256: { type: "string" },
          },
        },
        Envelope: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            object: { const: "envelope" },
            status: {
              type: "string",
              enum: ["draft", "sent", "viewed", "completed", "declined", "expired", "canceled"],
            },
            title: { type: "string" },
            message: { type: ["string", "null"] },
            locale: { type: "string" },
            sequential: { type: "boolean" },
            expiry_days: { type: "integer" },
            reminder_days: { type: "integer" },
            verification_code: { type: ["string", "null"], examples: ["DF-7K2M-9QXA"] },
            created_at: { type: "string", format: "date-time" },
            sent_at: ts,
            expires_at: ts,
            completed_at: ts,
            declined_at: ts,
            expired_at: ts,
            canceled_at: ts,
            signers: { type: "array", items: ref("Signer") },
            documents: { type: "array", items: ref("Document") },
          },
        },
        WebhookEvent: {
          type: "object",
          properties: {
            id: { type: "string", examples: ["evt_3f2c…"] },
            object: { const: "event" },
            type: { type: "string", enum: [...WEBHOOK_EVENTS, "ping"] },
            created_at: { type: "string", format: "date-time" },
            data: {
              type: "object",
              properties: { envelope: ref("Envelope"), signer_id: { type: "string" } },
            },
          },
        },
      },
    },
    paths: {
      "/account": {
        get: {
          summary: "Account, plan and balances",
          responses: { "200": ok({ type: "object" }), ...common },
        },
      },
      "/envelopes": {
        get: {
          summary: "List envelopes (newest first)",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            { name: "starting_after", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": ok({
              type: "object",
              properties: {
                object: { const: "list" },
                data: { type: "array", items: ref("Envelope") },
                has_more: { type: "boolean" },
              },
            }),
            ...common,
          },
        },
        post: {
          summary: "Create an envelope (draft, or sent with `send: true`)",
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("EnvelopeCreate") } },
          },
          responses: {
            "201": ok(ref("Envelope"), "Created"),
            "402": err("Not enough signatures or SMS."),
            "422": err("Validation or document error."),
            ...common,
          },
        },
      },
      "/envelopes/{id}": {
        parameters: [idParam],
        get: {
          summary: "Retrieve an envelope",
          responses: { "200": ok(ref("Envelope")), "404": err("Not found."), ...common },
        },
        patch: {
          summary: "Update a draft (`signers` replaces the list)",
          requestBody: { content: { "application/json": { schema: ref("EnvelopeSettings") } } },
          responses: {
            "200": ok(ref("Envelope")),
            "409": err("Not a draft."),
            "422": err("Invalid."),
            ...common,
          },
        },
        delete: {
          summary: "Delete a draft",
          responses: { "200": ok({ type: "object" }), "409": err("Not a draft."), ...common },
        },
      },
      "/envelopes/{id}/documents": {
        parameters: [idParam],
        post: {
          summary: "Add a document inline (base64, up to 3 MB)",
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("DocumentInput") } },
          },
          responses: {
            "201": ok(ref("Document"), "Created"),
            "413": err("Too large for inline upload."),
            "422": err("Invalid document."),
            ...common,
          },
        },
      },
      "/envelopes/{id}/uploads": {
        parameters: [idParam],
        post: {
          summary: "Get a signed URL to upload a large file (up to 25 MB) with PUT",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "size_bytes"],
                  properties: { name: { type: "string" }, size_bytes: { type: "integer" } },
                },
              },
            },
          },
          responses: { "201": ok({ type: "object" }, "Upload slot"), ...common },
        },
      },
      "/envelopes/{id}/uploads/{uploadId}/complete": {
        parameters: [
          idParam,
          {
            name: "uploadId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: {
          summary: "Validate the uploaded file and add it to the envelope",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "201": ok(ref("Document"), "Created"),
            "422": err("Invalid document."),
            ...common,
          },
        },
      },
      "/envelopes/{id}/send": {
        parameters: [idParam],
        post: {
          summary: "Send a draft",
          responses: {
            "200": ok(ref("Envelope")),
            "402": err("Not enough signatures or SMS."),
            "409": err("Already sent."),
            "422": err("Incomplete envelope."),
            ...common,
          },
        },
      },
      "/envelopes/{id}/cancel": {
        parameters: [idParam],
        post: {
          summary: "Cancel a sent envelope",
          responses: { "200": ok(ref("Envelope")), "409": err("Not cancelable."), ...common },
        },
      },
      "/envelopes/{id}/remind": {
        parameters: [idParam],
        post: {
          summary: "Remind pending signers",
          responses: { "200": ok({ type: "object" }), "409": err("Not active."), ...common },
        },
      },
      "/envelopes/{id}/files": {
        parameters: [idParam],
        get: {
          summary: "Download URLs (originals; signed PDFs, evidence and timestamps once completed)",
          responses: { "200": ok({ type: "object" }), ...common },
        },
      },
      "/envelopes/{id}/events": {
        parameters: [idParam],
        get: { summary: "Audit trail", responses: { "200": ok({ type: "object" }), ...common } },
      },
      "/envelopes/{id}/signers/{signerId}/signing-url": {
        parameters: [
          idParam,
          {
            name: "signerId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: {
          summary: "Signing link for an in-person signer",
          responses: {
            "201": ok({ type: "object" }),
            "409": err("Not their turn / not active."),
            ...common,
          },
        },
      },
    },
    webhooks: {
      envelopeEvent: {
        post: {
          summary: "Envelope events, signed with the DocuFirma-Signature header",
          requestBody: { content: { "application/json": { schema: ref("WebhookEvent") } } },
          responses: { "200": { description: "Return any 2xx to acknowledge." } },
        },
      },
    },
  };
}
