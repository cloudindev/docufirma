/**
 * Mensatek RFC 3161 Time Stamping Authority client.
 *   POST https://api.mensatek.com/tsaMENSATEK   (1 credit, Mensatek qualified TSA)
 *   POST https://api.mensatek.com/tsaFNMT       (2 credits, FNMT TSA)
 * HTTP Basic auth with the panel user/password. Body: DER TimeStampReq
 * (application/timestamp-query). Response: DER TimeStampResp (application/timestamp-reply).
 */
export class TsaHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TsaHttpError";
  }
}

export type MensatekConfig = {
  endpoint: string;
  user: string;
  password: string;
  timeoutMs?: number;
  retries?: number;
};

export function mensatekConfigFromEnv(): MensatekConfig | null {
  const user = process.env.MENSATEK_TSA_USER;
  const password = process.env.MENSATEK_TSA_PASSWORD;
  if (!user || !password) return null;
  return {
    endpoint: process.env.MENSATEK_TSA_ENDPOINT || "https://api.mensatek.com/tsaMENSATEK",
    user,
    password,
  };
}

export function providerFromEndpoint(endpoint: string): "MENSATEK" | "FNMT" {
  return /tsaFNMT/i.test(endpoint) ? "FNMT" : "MENSATEK";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function requestTimestamp(
  tsq: Uint8Array,
  config: MensatekConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const retries = config.retries ?? 2;
  const auth = Buffer.from(`${config.user}:${config.password}`, "utf8").toString("base64");
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 3 ** (attempt - 1)); // 0.5 s, 1.5 s
    try {
      const res = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/timestamp-query",
          Accept: "application/timestamp-reply",
        },
        body: new Uint8Array(tsq),
        signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
      });
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        const text = (await res.text().catch(() => "")).slice(0, 200);
        throw new TsaHttpError(
          `TSA responded ${res.status}${text ? `: ${text}` : ""}`,
          res.status,
          retryable,
        );
      }
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < 16 || body[0] !== 0x30)
        throw new TsaHttpError("TSA returned a non-DER body", res.status, true);
      return body;
    } catch (error) {
      lastError = error;
      if (error instanceof TsaHttpError && !error.retryable) throw error; // 401/403/400: don't hammer
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new TsaHttpError("TSA request failed", null, true);
}
