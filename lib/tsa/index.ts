import "server-only";
import { createHash } from "node:crypto";
import { mensatekConfigFromEnv, providerFromEndpoint, requestTimestamp } from "./mensatek";
import {
  buildTimestampRequest,
  type ParsedTimestampResponse,
  verifyTimestampResponse,
} from "./rfc3161";
import { createTestTimestampResponse, testTsaCertificatesPem } from "./test-tsa";

export type TsaProvider = "MENSATEK" | "FNMT" | "TEST";

export type TimestampResult = {
  provider: TsaProvider;
  hash: Buffer;
  tsq: Buffer;
  tsr: Buffer;
  parsed: ParsedTimestampResponse;
};

export class TimestampError extends Error {
  constructor(
    message: string,
    readonly provider: TsaProvider | null,
  ) {
    super(message);
    this.name = "TimestampError";
  }
}

/** Which TSA to use: TSA_PROVIDER=test forces the local test TSA (dev / e2e only). */
export function configuredProvider(): TsaProvider | null {
  if (process.env.TSA_PROVIDER === "test") return "TEST";
  const cfg = mensatekConfigFromEnv();
  return cfg ? providerFromEndpoint(cfg.endpoint) : null;
}

function trustedRoots(provider: TsaProvider): string[] {
  if (provider === "TEST") return [testTsaCertificatesPem().ca];
  // Optional: PEM bundle of the Mensatek / FNMT chain to enforce chain validation.
  const pem = process.env.TSA_TRUSTED_CERTS_PEM;
  return pem
    ? pem.split(/(?=-----BEGIN CERTIFICATE-----)/).filter((c) => c.includes("BEGIN CERTIFICATE"))
    : [];
}

/** Requests an RFC 3161 timestamp over SHA-256(bytes) and verifies the response. */
export async function timestampBytes(bytes: Uint8Array): Promise<TimestampResult> {
  const provider = configuredProvider();
  if (!provider)
    throw new TimestampError("No TSA configured (MENSATEK_TSA_USER / MENSATEK_TSA_PASSWORD)", null);
  const hash = createHash("sha256").update(bytes).digest();
  const { der: tsq } = buildTimestampRequest(hash, "sha256");

  let tsr: Buffer;
  try {
    tsr =
      provider === "TEST"
        ? await createTestTimestampResponse(tsq)
        : await requestTimestamp(tsq, mensatekConfigFromEnv()!);
  } catch (error) {
    throw new TimestampError(`TSA request failed: ${(error as Error).message}`, provider);
  }

  const verification = await verifyTimestampResponse(tsr, tsq, hash, {
    trustedCertsPem: trustedRoots(provider),
  });
  if (!verification.valid || !verification.parsed) {
    throw new TimestampError(`Invalid TSA response: ${verification.errors.join("; ")}`, provider);
  }
  return { provider, hash, tsq, tsr, parsed: verification.parsed };
}
