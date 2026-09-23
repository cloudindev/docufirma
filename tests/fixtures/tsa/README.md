# Test TSA (RFC 3161) — NOT FOR PRODUCTION

Throwaway CA + TSA certificate used by unit tests and by the local "TEST" timestamp provider
(`TSA_PROVIDER=test`) when the real Mensatek TSA is not reachable (e.g. sandboxed development).
Tokens signed with this key have **no legal value**. Regenerate with the commands in `docs/API.md`.
