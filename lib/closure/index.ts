import "server-only";

/**
 * Envelope closure (signed PDFs, evidence certificate, RFC 3161 timestamps).
 * Implemented in lib/closure/close-envelope.ts (Phase 6); re-exported here so callers
 * (signer actions, cron) depend on a stable entry point.
 */
export { closeEnvelope, processCloseJobs } from "./close-envelope";
