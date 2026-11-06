import assert from "node:assert/strict";

// Mock just enough Foundry for diag.mjs.
const calls = [];
const fake = {
  debug: (m, d) => calls.push(["debug", m, d]),
  info: (m, d) => calls.push(["info", m, d]),
  warn: (m, d) => calls.push(["warn", m, d]),
  error: (m, e, d) => calls.push(["error", m, e, d]),
  unclear: (k, m, d) => calls.push(["unclear", m, d]),
  report: (c, o) => { calls.push(["report", c, o]); return Promise.resolve("logged"); },
  async guard(label, fn) { try { return await fn(); } catch (err) { this.error(`${label} failed`, err); return undefined; } },
  openReport: (c, ctx) => calls.push(["openReport", c, ctx])
};
let registered = null;
globalThis.game = { modules: { get: id => (id === "usedtp-logger" ? { api: { register: (mid, opts) => { registered = [mid, opts]; return fake; } } } : null) } };
globalThis.ui = { notifications: { warn() {}, error() {} } };

const { log, recentTrace } = await import("../scripts/diag.mjs");

log().info("ready");
assert.deepEqual(registered, ["light-cantrip", { title: "Light Cantrip" }], "registers with usedtp Logger");

const err = new Error("boom");
log().error("cast failed", err, { item: "Bolts" });
assert.deepEqual(calls.at(-1), ["error", "cast failed", err, { item: "Bolts" }], "errors reach the logger");

const out = await log().guard("fire", async () => { throw new Error("bad"); });
assert.equal(out, undefined, "guard returns undefined on throw");
assert.equal(calls.at(-1)[0], "error", "guard failure reaches the logger");

const trace = recentTrace();
assert.equal(trace[0].msg, "ready");
assert.ok(trace.some(e => e.level === "error" && e.msg === "fire failed"), "guard failure is in the trace");
console.log("diag: 6 checks passed");
