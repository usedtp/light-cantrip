import { MODULE_ID } from "./settings.mjs";
import { log } from "./log.mjs";

/*
 * Players cannot edit other players' actors or create scene lights, so every change runs in the active GM's
 * browser. A request from a player goes by socket; the GM runs it and sends back the result.
 */

export const CHANNEL = `module.${MODULE_ID}`;
const TIMEOUT_MS = 15000;
const handlers = {};
const waiting = new Map();

export const isActiveGM = () => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id;

export function registerHandler(action, fn) {
  handlers[action] = fn;
}

async function run(action, payload, user) {
  const fn = handlers[action];
  if (!fn) throw new Error(`unknown action ${action}`);
  return fn(payload, user);
}

/** Run an action in the active GM's browser. Resolves with the handler's result; rejects with its error. */
export async function request(action, payload) {
  if (isActiveGM()) return run(action, payload, game.user);
  if (!game.users?.activeGM) {
    ui.notifications.warn(game.i18n.localize("LIGHTCANTRIP.noGM"));
    log().warn(`no GM online for ${action}`, payload);
    return null;
  }
  const id = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      log().warn(`GM did not answer ${action}`, payload);
      ui.notifications.warn(game.i18n.localize("LIGHTCANTRIP.gmTimeout"));
      resolve(null);
    }, TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    game.socket.emit(CHANNEL, { type: "request", id, action, payload, userId: game.user.id });
  });
}

/** Show a notice in one user's browser. */
export function notifyUser(userId, level, text) {
  if (userId === game.user.id) return ui.notifications[level]?.(text);
  game.socket.emit(CHANNEL, { type: "notify", to: userId, level, text });
}

export function registerSocket() {
  game.socket.on(CHANNEL, async data => {
    if (data?.type === "request") {
      if (!isActiveGM()) return;
      const user = game.users.get(data.userId);
      let reply;
      try {
        const result = await run(data.action, data.payload, user);
        reply = { type: "result", id: data.id, to: data.userId, ok: true, result: result ?? null };
      } catch (err) {
        log().error(`${data.action} failed for ${user?.name}`, err, data.payload);
        reply = { type: "result", id: data.id, to: data.userId, ok: false, error: String(err?.message ?? err) };
      }
      game.socket.emit(CHANNEL, reply);
    } else if (data?.type === "result") {
      if (data.to !== game.user.id) return;
      const w = waiting.get(data.id);
      if (!w) return;
      clearTimeout(w.timer);
      waiting.delete(data.id);
      if (data.ok) w.resolve(data.result);
      else {
        ui.notifications.error(data.error);
        w.resolve(null);
      }
    } else if (data?.type === "notify") {
      if (data.to === game.user.id) ui.notifications[data.level]?.(data.text);
    }
  });
}
