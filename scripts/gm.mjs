import { MODULE_ID, FLAG, cfg } from "./settings.mjs";
import { log } from "./diag.mjs";
import { isActiveGM, registerHandler, notifyUser } from "./net.mjs";
import {
  PHYSICAL_TYPES, litName, parseKeywords, blockedByContainer, tokenCenter, reachDistance
} from "./geometry.mjs";
import { postCastCard, postEndNote, postCollectCard } from "./cards.mjs";

/*
 * Everything here runs in the active GM's browser only.
 *
 * A record is one active Light spell, keyed by the caster's actor UUID (casting again ends the old one):
 *   { key, casterUuid, casterName, ownerUuid, ownerName, itemId, split, sourceId, originalName, snapshot,
 *     color, covered, state: "carried"|"attached"|"ground", sceneId, tokenId, x, y, elevation, combatId,
 *     startedAt, handoff }
 * Records live in the hidden world setting "records" so every browser can read them.
 * Scene lights made by this module carry flags["light-cantrip"].key = record key.
 */

const OPT = { lightCantrip: true };
let chain = Promise.resolve();

/** Run GM work one job at a time so records are never written over each other. */
export function serial(label, fn) {
  const job = chain.then(() => fn()).catch(err => { log().error(`${label} failed`, err); throw err; });
  chain = job.catch(() => null);
  return job;
}

export const getRecords = () => foundry.utils.deepClone(cfg.records ?? {});
const saveRecords = records => game.settings.set(MODULE_ID, "records", records);

const actorFrom = uuid => { try { return fromUuidSync(uuid); } catch (err) { return null; } };

function canControl(user, ...actors) {
  if (!user) return false;
  if (user.isGM) return true;
  return actors.some(a => a?.testUserPermission?.(user, "OWNER"));
}

function ownerUserIds(...actors) {
  const ids = new Set(game.users.filter(u => u.isGM).map(u => u.id));
  for (const a of actors) for (const u of game.users) if (!u.isGM && a?.testUserPermission?.(u, "OWNER")) ids.add(u.id);
  return [...ids];
}

/** Tokens on a scene that stand for an actor (linked or unlinked). */
function tokensOf(scene, actorUuid) {
  return scene.tokens.filter(t => t.actor?.uuid === actorUuid);
}

function firstTokenAnywhere(actorUuid) {
  for (const scene of [game.scenes.viewed, game.scenes.active, ...game.scenes].filter(Boolean)) {
    const t = tokensOf(scene, actorUuid)[0];
    if (t) return t;
  }
  return null;
}

/* ---------------- Cast ---------------- */

async function cast({ casterUuid, ownerUuid, itemId, color }, user) {
  const caster = actorFrom(casterUuid);
  const owner = actorFrom(ownerUuid ?? casterUuid);
  if (!caster || !owner) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.noActor"));
  if (!canControl(user, caster)) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
  const item = owner.items.get(itemId);
  if (!item || !PHYSICAL_TYPES.has(item.type)) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notObject"));
  if ((item.system.quantity ?? 1) < 1) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.noQuantity"));

  const handoff = owner.uuid !== caster.uuid;
  if (handoff) {
    if (!cfg.allowHandoff) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.handoffOff"));
    const ct = firstTokenAnywhere(caster.uuid);
    const ot = ct ? tokensOf(ct.parent, owner.uuid)[0] : null;
    if (!ct || !ot) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.handoffTokens"));
    const scene = ct.parent;
    const reach = reachDistance(ct, ot, scene.grid.size, scene.grid.distance);
    if (reach > cfg.handoffRange) {
      throw new Error(game.i18n.format("LIGHTCANTRIP.err.handoffRange", { range: cfg.handoffRange, units: scene.grid.units ?? "ft" }));
    }
  }

  const key = caster.uuid;
  let records = getRecords();
  if (records[key]) {
    await endRecord(key, "recast");
    records = getRecords();
  }
  // One object holds one Light. If someone else's Light is on this item, it ends.
  const flagged = item.getFlag(MODULE_ID, FLAG);
  if (flagged && records[flagged]) {
    await endRecord(flagged, "relit");
    records = getRecords();
  }

  const fresh = owner.items.get(itemId);
  if (!fresh) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notObject"));
  const qty = fresh.system.quantity ?? 1;
  const snapshot = fresh.toObject();
  delete snapshot._id;
  if (snapshot.flags?.[MODULE_ID]) delete snapshot.flags[MODULE_ID];
  const record = {
    key,
    casterUuid: caster.uuid,
    casterName: caster.name,
    ownerUuid: owner.uuid,
    ownerName: owner.name,
    split: qty > 1,
    sourceId: fresh.id,
    originalName: fresh.name,
    snapshot,
    color: color || cfg.defaultColor || "#ffe7b3",
    covered: false,
    state: "carried",
    startedAt: Date.now(),
    handoff
  };

  if (record.split) {
    const data = fresh.toObject();
    delete data._id;
    data.name = litName(fresh.name);
    foundry.utils.setProperty(data, "system.quantity", 1);
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAG}`, key);
    await owner.updateEmbeddedDocuments("Item", [{ _id: fresh.id, "system.quantity": qty - 1 }], OPT);
    const [lit] = await owner.createEmbeddedDocuments("Item", [data], OPT);
    record.itemId = lit.id;
  } else {
    await owner.updateEmbeddedDocuments("Item", [{ _id: fresh.id, name: litName(fresh.name), [`flags.${MODULE_ID}.${FLAG}`]: key }], OPT);
    record.itemId = fresh.id;
  }

  records[key] = record;
  await saveRecords(records);
  log().info("cast", { by: user?.name, caster: caster.name, owner: owner.name, item: fresh.name, split: record.split, handoff });
  await postCastCard(record, ownerUserIds(caster, owner));
  scheduleReconcileAll();
  return { key };
}

/* ---------------- End ---------------- */

/**
 * Ends a Light. Puts the object back: a split-off piece merges into its stack, a whole item gets its name back.
 * Fired ammunition comes back to the stack (collected).
 * @param {string} reason  recast | relit | dismiss | collected | changedHands | itemGone | gm
 * @param {{restore?: boolean}} [opts]  restore false: the object is gone or moved, leave inventories alone.
 */
export async function endRecord(key, reason, { restore = true } = {}) {
  const records = getRecords();
  const rec = records[key];
  if (!rec) return false;
  delete records[key];
  await saveRecords(records);

  const owner = actorFrom(rec.ownerUuid);
  const caster = actorFrom(rec.casterUuid);
  try {
    if (owner) await restoreItem(owner, rec, restore);
  } catch (err) {
    log().error("restore item failed", err, { rec: { ...rec, snapshot: undefined } });
  }
  log().info("end", { reason, caster: rec.casterName, item: rec.originalName, state: rec.state });
  await postEndNote(rec, reason, ownerUserIds(caster, owner));
  scheduleReconcileAll();
  return true;
}

/**
 * @param {boolean} collect  Fired ammunition comes back (+1). False when the object left this inventory.
 */
async function restoreItem(owner, rec, collect) {
  const lit = owner.items.get(rec.itemId);
  const back = rec.state !== "carried" && collect ? 1 : 0;
  if (rec.split) {
    // Merge whatever is left of the lit piece (1 if still carried, 0 after firing) plus any collected one.
    const add = (lit ? (lit.system.quantity ?? 0) : 0) + back;
    if (lit) await owner.deleteEmbeddedDocuments("Item", [lit.id], OPT);
    if (!add) return;
    const source = owner.items.get(rec.sourceId);
    if (source) {
      await owner.updateEmbeddedDocuments("Item", [{ _id: source.id, "system.quantity": (source.system.quantity ?? 0) + add }], OPT);
    } else {
      const data = foundry.utils.deepClone(rec.snapshot);
      foundry.utils.setProperty(data, "system.quantity", add);
      await owner.createEmbeddedDocuments("Item", [data], OPT);
    }
    return;
  }
  if (lit) {
    const update = { _id: lit.id, name: rec.originalName, [`flags.${MODULE_ID}.${FLAG}`]: null };
    if (back) update["system.quantity"] = (lit.system.quantity ?? 0) + 1;
    await owner.updateEmbeddedDocuments("Item", [update], OPT);
  } else if (back) {
    const data = foundry.utils.deepClone(rec.snapshot);
    foundry.utils.setProperty(data, "system.quantity", 1);
    await owner.createEmbeddedDocuments("Item", [data], OPT);
  }
}

/* ---------------- Player actions ---------------- */

function requireRecord(key) {
  const rec = getRecords()[key];
  if (!rec) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.noSpell"));
  return rec;
}

async function setCover({ key, covered }, user) {
  const rec = requireRecord(key);
  if (!canControl(user, actorFrom(rec.casterUuid), actorFrom(rec.ownerUuid))) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
  const records = getRecords();
  records[key].covered = covered ?? !rec.covered;
  await saveRecords(records);
  log().info(records[key].covered ? "covered" : "uncovered", { by: user?.name, item: rec.originalName });
  scheduleReconcileAll();
  return { covered: records[key].covered };
}

async function dismiss({ key }, user) {
  const rec = requireRecord(key);
  if (!canControl(user, actorFrom(rec.casterUuid))) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
  return endRecord(key, user?.isGM && !actorFrom(rec.casterUuid)?.testUserPermission(user, "OWNER") ? "gm" : "dismiss");
}

async function collect({ key }, user) {
  const rec = requireRecord(key);
  if (!canControl(user, actorFrom(rec.ownerUuid), actorFrom(rec.casterUuid))) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
  if (rec.state === "carried") return false;
  return endRecord(key, "collected");
}

/** A lit projectile was fired or thrown. payload: { key, state: "attached"|"ground", sceneId, tokenId?, x?, y?, elevation? } */
async function fired(payload, user) {
  const rec = requireRecord(payload.key);
  if (!canControl(user, actorFrom(rec.ownerUuid))) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
  if (rec.state !== "carried") {
    log().unclear(`fired-twice-${payload.key}`, "fired a light that is already in flight", { rec: rec.originalName });
    return false;
  }
  const scene = game.scenes.get(payload.sceneId);
  if (!scene) throw new Error("scene not found");
  const records = getRecords();
  const r = records[payload.key];
  r.state = payload.state === "attached" ? "attached" : "ground";
  r.sceneId = scene.id;
  r.tokenId = payload.tokenId ?? null;
  r.x = payload.x ?? null;
  r.y = payload.y ?? null;
  r.elevation = payload.elevation ?? 0;
  const combat = game.combats.find(c => c.started && (c.scene?.id ?? scene.id) === scene.id);
  r.combatId = combat?.id ?? null;
  r.covered = false;
  await saveRecords(records);
  log().info("fired", { by: user?.name, item: rec.originalName, state: r.state, inCombat: !!combat });
  scheduleReconcile(scene.id);
  if (!combat) await postCollectCard(r, ownerUserIds(actorFrom(r.ownerUuid), actorFrom(r.casterUuid)));
  return true;
}

/* ---------------- Scene lights ---------------- */

const reconcileTimers = new Map();

export function scheduleReconcile(sceneId) {
  if (!isActiveGM() || !sceneId) return;
  clearTimeout(reconcileTimers.get(sceneId));
  reconcileTimers.set(sceneId, setTimeout(() => {
    reconcileTimers.delete(sceneId);
    const scene = game.scenes.get(sceneId);
    if (scene) serial("reconcile", () => reconcile(scene)).catch(() => null);
  }, 150));
}

export function scheduleReconcileAll() {
  if (!isActiveGM()) return;
  for (const s of game.scenes) {
    const hasOurs = s.lights.some(l => l.getFlag(MODULE_ID, "key"));
    if (hasOurs || s.tokens.size) scheduleReconcile(s.id);
  }
}

function blocked(owner, item, rec) {
  if (rec.covered) return true;
  const keywords = parseKeywords(cfg.openContainers);
  const lookup = id => {
    const c = owner.items.get(id);
    return c ? { name: c.name, container: c.system?.container ?? null } : null;
  };
  return blockedByContainer(item.system?.container ?? null, lookup, keywords);
}

/** Where a record's light should be on this scene, or null. */
function placement(scene, rec) {
  const size = scene.grid.size;
  if (rec.state === "carried") {
    const owner = actorFrom(rec.ownerUuid);
    const item = owner?.items.get(rec.itemId);
    if (!item || (item.system.quantity ?? 1) < 1 || blocked(owner, item, rec)) return null;
    const t = tokensOf(scene, rec.ownerUuid)[0];
    if (!t) return null;
    return { ...tokenCenter(t, size), elevation: t.elevation ?? 0 };
  }
  if (rec.sceneId !== scene.id || rec.covered) return null;
  if (rec.state === "attached") {
    const t = scene.tokens.get(rec.tokenId);
    if (!t) return null;
    return { ...tokenCenter(t, size), elevation: t.elevation ?? 0 };
  }
  if (rec.state === "ground" && rec.x !== null) return { x: rec.x, y: rec.y, elevation: rec.elevation ?? 0 };
  return null;
}

function lightData(rec, at) {
  return {
    x: Math.round(at.x),
    y: Math.round(at.y),
    elevation: at.elevation ?? 0,
    walls: true,
    vision: false,
    hidden: false,
    config: {
      bright: cfg.brightRadius ?? 20,
      dim: cfg.dimRadius ?? 40,
      color: rec.color,
      alpha: 0.4,
      angle: 360,
      animation: { type: null }
    },
    flags: { [MODULE_ID]: { key: rec.key } }
  };
}

async function reconcile(scene) {
  const records = getRecords();
  const want = new Map();
  for (const rec of Object.values(records)) {
    const at = placement(scene, rec);
    if (!at) continue;
    want.set(rec.key, at);
  }

  const existing = scene.lights.filter(l => l.getFlag(MODULE_ID, "key"));
  const seen = new Set();
  const updates = [];
  const deletes = [];
  for (const light of existing) {
    const key = light.getFlag(MODULE_ID, "key");
    const at = want.get(key);
    if (!at || seen.has(key)) { deletes.push(light.id); continue; }
    seen.add(key);
    const rec = records[key];
    const d = lightData(rec, at);
    if (light.x !== d.x || light.y !== d.y || light.elevation !== d.elevation || light.config.color?.css !== rec.color
      || light.config.bright !== d.config.bright || light.config.dim !== d.config.dim) {
      updates.push({ _id: light.id, x: d.x, y: d.y, elevation: d.elevation, "config.color": rec.color, "config.bright": d.config.bright, "config.dim": d.config.dim });
    }
  }
  const creates = [...want].filter(([key]) => !seen.has(key)).map(([key, at]) => lightData(records[key], at));

  if (deletes.length) await scene.deleteEmbeddedDocuments("AmbientLight", deletes, OPT);
  if (updates.length) await scene.updateEmbeddedDocuments("AmbientLight", updates, OPT);
  if (creates.length) await scene.createEmbeddedDocuments("AmbientLight", creates, OPT);
  if (creates.length || deletes.length) log().debug("lights", { scene: scene.name, created: creates.length, updated: updates.length, deleted: deletes.length });
}

/* ---------------- Watching the world ---------------- */

const POSITION_KEYS = ["x", "y", "elevation", "width", "height"];

function onUpdateToken(token, change) {
  if (!POSITION_KEYS.some(k => k in change) && !("actorId" in change) && !("actorLink" in change)) return;
  scheduleReconcile(token.parent?.id);
}

async function onDeleteToken(token) {
  const records = getRecords();
  let changed = false;
  const size = token.parent?.grid?.size ?? 100;
  for (const rec of Object.values(records)) {
    if (rec.state === "attached" && rec.tokenId === token.id && rec.sceneId === token.parent?.id) {
      const c = tokenCenter(token, size);
      Object.assign(rec, { state: "ground", tokenId: null, x: Math.round(c.x), y: Math.round(c.y), elevation: token.elevation ?? 0 });
      changed = true;
    }
  }
  if (changed) await saveRecords(records);
  scheduleReconcile(token.parent?.id);
}

function actorScenes(actor) {
  if (!actor) return [];
  return game.scenes.filter(s => s.tokens.some(t => t.actor?.uuid === actor.uuid)).map(s => s.id);
}

async function onCreateItem(item, options) {
  if (options?.lightCantrip) return;
  const key = item.getFlag(MODULE_ID, FLAG);
  if (!key || !item.actor) return;
  const records = getRecords();
  const rec = records[key];
  const strip = () => item.update({ name: rec?.originalName ?? item.name.replace(/ \(Lit\)$/, ""), [`flags.${MODULE_ID}.${FLAG}`]: null }, OPT);
  if (!rec || rec.state !== "carried") return strip();
  if (item.actor.uuid === rec.ownerUuid) {
    if (item.id !== rec.itemId) return strip(); // a copy on the same actor
    return;
  }
  // The lit object went to another actor.
  if (cfg.darkOnHandChange) {
    // The moved piece becomes a plain object. The rest of a split stack stays with the old owner.
    await strip();
    await endRecord(key, "changedHands", { restore: false });
    return;
  }
  rec.ownerUuid = item.actor.uuid;
  rec.ownerName = item.actor.name;
  rec.itemId = item.id;
  await saveRecords(records);
  log().info("light moved with object", { to: item.actor.name, item: rec.originalName });
  scheduleReconcileAll();
}

function onDeleteItem(item, options) {
  if (options?.lightCantrip) return;
  const key = item.getFlag(MODULE_ID, FLAG);
  if (!key) return;
  const ownerUuid = item.actor?.uuid;
  // Firing the last piece also deletes the item; the attack report arrives within moments.
  setTimeout(() => serial("item gone check", async () => {
    const rec = getRecords()[key];
    if (!rec || rec.state !== "carried" || rec.itemId !== item.id || rec.ownerUuid !== ownerUuid) return;
    if (actorFrom(ownerUuid)?.items.get(item.id)) return;
    await endRecord(key, "itemGone", { restore: false });
  }).catch(() => null), 3000);
}

function onUpdateItem(item, change) {
  if (!item.actor) return;
  const flat = foundry.utils.flattenObject(change);
  const relevant = Object.keys(flat).some(k => k.startsWith("system.container") || k.startsWith("system.quantity") || k.startsWith("name"));
  if (!relevant) return;
  const records = getRecords();
  const touches = Object.values(records).some(r => r.ownerUuid === item.actor.uuid);
  if (!touches) return;
  for (const id of actorScenes(item.actor)) scheduleReconcile(id);
}

function onUpdateScene(scene, change) {
  if ("grid" in change || "tokens" in change) scheduleReconcile(scene.id);
}

async function onDeleteCombat(combat) {
  const sceneId = combat.scene?.id ?? null;
  for (const rec of Object.values(getRecords())) {
    if (rec.state === "carried") continue;
    if (rec.combatId !== combat.id && !(sceneId && rec.sceneId === sceneId && rec.combatId)) continue;
    await postCollectCard(rec, ownerUserIds(actorFrom(rec.ownerUuid), actorFrom(rec.casterUuid)));
  }
}

async function ensureMacro() {
  if (!cfg.createMacro) return;
  if (game.macros.find(m => m.getFlag(MODULE_ID, "macro"))) return;
  await Macro.create({
    name: "Light Cantrip",
    type: "script",
    img: "icons/svg/light.svg",
    command: "game.modules.get(\"light-cantrip\")?.api?.menu();",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: { [MODULE_ID]: { macro: true } }
  });
  log().info("created Light Cantrip macro");
}

export function registerGM() {
  registerHandler("cast", (p, u) => serial("cast", () => cast(p, u)));
  registerHandler("cover", (p, u) => serial("cover", () => setCover(p, u)));
  registerHandler("dismiss", (p, u) => serial("dismiss", () => dismiss(p, u)));
  registerHandler("collect", (p, u) => serial("collect", () => collect(p, u)));
  registerHandler("fired", (p, u) => serial("fired", () => fired(p, u)));
  registerHandler("end", (p, u) => serial("end", () => {
    if (!u?.isGM) throw new Error(game.i18n.localize("LIGHTCANTRIP.err.notYours"));
    return endRecord(p.key, "gm");
  }));

  const gm = fn => (...args) => { if (isActiveGM()) fn(...args); };
  Hooks.on("updateToken", gm(onUpdateToken));
  Hooks.on("createToken", gm(t => scheduleReconcile(t.parent?.id)));
  Hooks.on("deleteToken", gm(t => serial("token deleted", () => onDeleteToken(t)).catch(() => null)));
  Hooks.on("createItem", gm((i, o) => serial("item created", () => onCreateItem(i, o)).catch(() => null)));
  Hooks.on("deleteItem", gm(onDeleteItem));
  Hooks.on("updateItem", gm(onUpdateItem));
  Hooks.on("updateScene", gm(onUpdateScene));
  Hooks.on("deleteCombat", gm(c => serial("combat ended", () => onDeleteCombat(c)).catch(() => null)));

  Hooks.once("ready", () => {
    if (!isActiveGM()) return;
    scheduleReconcileAll();
    ensureMacro().catch(err => log().error("macro create failed", err));
  });
}

export { notifyUser };
