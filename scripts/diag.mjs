import { MODULE_ID } from "./settings.mjs";

/*
 * Diagnostics go through the shared usedtp Logger module. If it is missing, entries go to the console only,
 * so the module still runs.
 *
 * Every entry is also kept in a short in-memory trace (last 60, including debug). Error/Unclear reports carry
 * that trace, so a report shows what the module did just before the problem.
 */
const TRACE_MAX = 60;
const ring = [];

function remember(level, msg, data) {
  ring.push({ t: new Date().toISOString(), level, msg, data: safe(data) });
  if (ring.length > TRACE_MAX) ring.shift();
}

function safe(data) {
  if (data === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(data, (k, v) => (v instanceof Error ? { message: v.message, stack: v.stack } : v))); } catch (err) { return String(data); }
}

const fallback = {
  debug: (m, d) => console.debug(`${MODULE_ID} | ${m}`, d ?? ""),
  info: (m, d) => console.log(`${MODULE_ID} | ${m}`, d ?? ""),
  warn: (m, d) => console.warn(`${MODULE_ID} | ${m}`, d ?? ""),
  error: (m, e, d) => console.error(`${MODULE_ID} | ${m}`, e, d ?? ""),
  unclear: (k, m, d) => console.warn(`${MODULE_ID} | unclear: ${m}`, d ?? ""),
  report: () => { ui.notifications?.warn("Install usedtp Logger to send reports."); return Promise.resolve("queued"); },
  async guard(label, fn) {
    try { return await fn(); } catch (err) { console.error(`${MODULE_ID} | ${label} failed`, err); return undefined; }
  },
  openReport: () => ui.notifications?.warn("Install usedtp Logger to send reports.")
};

let logger = null;
let wrapped = null;

function base() {
  if (logger) return logger;
  const api = game.modules?.get("usedtp-logger")?.api ?? globalThis.UsedtpLogger;
  if (api?.register) logger = api.register(MODULE_ID, { title: "Light Cantrip" });
  return logger ?? fallback;
}

/** The module's logger. Call it at use time: log().warn(...). */
export function log() {
  const l = base();
  if (wrapped?.target === l) return wrapped.proxy;
  const proxy = {
    debug: (m, d) => { remember("debug", m, d); return l.debug(m, d); },
    info: (m, d) => { remember("info", m, d); return l.info(m, d); },
    warn: (m, d) => { remember("warn", m, d); return l.warn(m, d); },
    error: (m, e, d) => { remember("error", m, { error: e, ...(d ?? {}) }); return l.error(m, e, d); },
    unclear: (k, m, d) => { remember("unclear", m, d); return l.unclear(k, m, d); },
    report: (c, o) => l.report(c, o),
    guard: (label, fn, d) => l.guard(label, async () => {
      try { return await fn(); } catch (err) { remember("error", `${label} failed`, { error: err, ...(d ?? {}) }); throw err; }
    }, d),
    openReport: (c, ctx) => l.openReport(c, ctx)
  };
  wrapped = { target: l, proxy };
  return proxy;
}

/** Recent entries from this browser, oldest first. */
export const recentTrace = () => ring.slice();
