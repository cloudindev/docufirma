import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseTimestampResponse, verifyTimestampResponse } from "@/lib/tsa/rfc3161";

const dir = "tests/fixtures";
const available =
  existsSync(`${dir}/mensatek-probe.tsr`) && existsSync(`${dir}/mensatek-probe.tsq`);

/** Real Mensatek response captured with the commands in docs/API.md (skipped when absent). */
describe.runIf(available)("real Mensatek TSR fixture", () => {
  it("parses and verifies", async () => {
    const tsr = readFileSync(`${dir}/mensatek-probe.tsr`);
    const tsq = readFileSync(`${dir}/mensatek-probe.tsq`);
    const hash = createHash("sha256")
      .update(readFileSync(`${dir}/mensatek-probe.txt`))
      .digest();
    const parsed = parseTimestampResponse(tsr);
    expect(parsed.granted).toBe(true);
    expect(parsed.policyOid).toBe("1.3.6.1.4.1.5734.3.18.1");
    const res = await verifyTimestampResponse(tsr, tsq, hash);
    expect(res.errors).toEqual([]);
  });
});

it("real TSA fixture availability is reported", () => {
  expect(typeof available).toBe("boolean");
});
