import { cfg } from "./settings.mjs";
import { log } from "./log.mjs";
import { request } from "./net.mjs";
import { landingPoint, attackHits, tokenCenter } from "./geometry.mjs";

/*
 * Lit ammunition and thrown weapons. Runs in the attacker's browser.
 *  - dnd5e.preRollAttack: if the weapon uses ammunition and the attacker carries a lit piece that fits, it is
 *    loaded (preselected in the attack dialog). The player can still pick other ammunition there.
 *  - dnd5e.postRollAttack (after ammunition is used up): if the lit piece was fired or thrown, work out hit or
 *    miss and tell the GM where the light goes.
 */

const records = () => Object.values(cfg.records ?? {});

function carriedLit(actor) {
  if (!actor) return [];
  return records().filter(r => r.ownerUuid === actor.uuid && r.state === "carried");
}

function onPreRollAttack(config) {
  const activity = config?.subject;
  const weapon = activity?.item;
  const actor = activity?.actor ?? weapon?.actor;
  if (!weapon?.system?.properties?.has?.("amm")) return;
  const wanted = weapon.system.ammunition?.type;
  for (const rec of carriedLit(actor)) {
    const ammo = actor.items.get(rec.itemId);
    if (!ammo || ammo.system?.type?.value !== "ammo" || (ammo.system.quantity ?? 0) < 1) continue;
    if (wanted && ammo.system.type.subtype !== wanted) continue;
    config.ammunition = ammo.id;
    if (config.rolls?.[0]?.options) config.rolls[0].options.ammunition = ammo.id;
    log().debug("lit ammunition loaded", { weapon: weapon.name, ammo: ammo.name });
    return;
  }
}

function firedRecord(roll, activity) {
  const actor = activity?.actor ?? activity?.item?.actor;
  const lit = carriedLit(actor);
  if (!lit.length) return null;
  const ammoId = roll.options?.ammunition;
  if (ammoId) return lit.find(r => r.itemId === ammoId) ?? null;
  const mode = roll.options?.attackMode ?? "";
  if (mode.startsWith("thrown") && !activity.item.system?.properties?.has?.("ret")) {
    return lit.find(r => r.itemId === activity.item.id) ?? null;
  }
  return null;
}

async function onPostRollAttack(rolls, { subject } = {}) {
  const roll = rolls?.[0];
  if (!roll || !subject) return;
  const rec = firedRecord(roll, subject);
  if (!rec) return;
  const ammo = subject.actor?.items.get(rec.itemId);
  if (ammo?.system?.properties?.has?.("ret")) return; // returning ammunition comes back with its light

  const scene = canvas?.scene;
  if (!scene) return;
  const size = scene.grid.size;
  const targetToken = [...game.user.targets][0]?.document ?? null;
  const shooter = scene.tokens.find(t => t.actor?.uuid === subject.actor?.uuid);

  if (!targetToken) {
    const at = shooter ? tokenCenter(shooter, size) : null;
    if (!at) {
      log().unclear("no-target-no-token", "lit projectile fired with no target and no token on the scene", { item: rec.originalName });
      return;
    }
    ui.notifications.warn(game.i18n.localize("LIGHTCANTRIP.attack.noTarget"));
    log().unclear(`no-target-${rec.key}`, "lit projectile fired with no target; light dropped at the shooter", { item: rec.originalName });
    return request("fired", { key: rec.key, state: "ground", sceneId: scene.id, x: at.x, y: at.y, elevation: shooter.elevation ?? 0 });
  }

  const ac = roll.options?.target ?? targetToken.actor?.system?.attributes?.ac?.value;
  const hit = attackHits({ total: roll.total, isCritical: roll.isCritical, isFumble: roll.isFumble, ac });
  if (hit === null) log().unclear(`no-ac-${targetToken.id}`, "could not read target AC; treated as a miss", { target: targetToken.name });

  if (hit) {
    log().info("lit projectile hit", { item: rec.originalName, target: targetToken.name, total: roll.total, ac });
    return request("fired", { key: rec.key, state: "attached", sceneId: scene.id, tokenId: targetToken.id });
  }

  // Miss: d8 picks the direction, d4 the distance in squares from the target.
  const dirRoll = await new Roll("1d8").evaluate();
  const distRoll = await new Roll("1d4").evaluate();
  const center = tokenCenter(targetToken, size);
  const rect = scene.dimensions?.sceneRect;
  const land = landingPoint(center, dirRoll.total, distRoll.total, size, rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: subject.actor }),
    flavor: game.i18n.format("LIGHTCANTRIP.attack.missFlavor", { item: rec.originalName }),
    content: `<p>${game.i18n.format("LIGHTCANTRIP.attack.miss", {
      item: rec.originalName, squares: distRoll.total, feet: distRoll.total * scene.grid.distance,
      units: scene.grid.units ?? "ft", dir: land.dir, target: targetToken.name
    })}</p>`,
    rolls: [dirRoll, distRoll]
  });
  log().info("lit projectile missed", { item: rec.originalName, target: targetToken.name, d8: dirRoll.total, d4: distRoll.total });
  return request("fired", { key: rec.key, state: "ground", sceneId: scene.id, x: land.x, y: land.y, elevation: targetToken.elevation ?? 0 });
}

export function registerAttack() {
  Hooks.on("dnd5e.preRollAttack", config => {
    try { onPreRollAttack(config); } catch (err) { log().error("preRollAttack", err); }
  });
  Hooks.on("dnd5e.postRollAttack", (rolls, data) => {
    log().guard("lit projectile", () => onPostRollAttack(rolls, data));
  });
}
