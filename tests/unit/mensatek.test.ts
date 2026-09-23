import { createHash } from "node:crypto";
import { requestTimestamp, TsaHttpError } from "@/lib/tsa/mensatek";
import { buildTimestampRequest } from "@/lib/tsa/rfc3161";
import { createTestTimestampResponse } from "@/lib/tsa/test-tsa";

const config = {
  endpoint: "https://api.mensatek.com/tsaMENSATEK",
  user: "u",
  password: "p",
  retries: 2,
};
const tsq = buildTimestampRequest(createHash("sha256").update("x").digest()).der;

describe("Mensatek client", () => {
  it("sends a Basic-auth timestamp-query and returns the DER reply", async () => {
    const reply = await createTestTimestampResponse(tsq);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
      expect(headers.get("content-type")).toBe("application/timestamp-query");
      expect(Buffer.from(init?.body as Uint8Array)).toEqual(tsq);
      return new Response(new Uint8Array(reply), {
        status: 200,
        headers: { "content-type": "application/timestamp-reply" },
      });
    });
    const out = await requestTimestamp(tsq, config, fetchMock as unknown as typeof fetch);
    expect(out).toEqual(reply);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and succeeds", async () => {
    const reply = await createTestTimestampResponse(tsq);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(reply), { status: 200 }));
    await expect(
      requestTimestamp(tsq, config, fetchMock as unknown as typeof fetch),
    ).resolves.toEqual(reply);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(
      requestTimestamp(tsq, config, fetchMock as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(TsaHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-DER bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>error</html>", { status: 200 }));
    await expect(
      requestTimestamp(tsq, { ...config, retries: 0 }, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/non-DER/);
  });
});
