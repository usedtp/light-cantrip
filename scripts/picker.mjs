import { cfg } from "./settings.mjs";
import { log } from "./diag.mjs";
import { request } from "./net.mjs";
import { PHYSICAL_TYPES, isProjectile, reachDistance } from "./geometry.mjs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const L = (key, data) => (data ? game.i18n.format(`LIGHTCANTRIP.picker.${key}`, data) : game.i18n.localize(`LIGHTCANTRIP.picker.${key}`));

/** Physical items of an actor, projectiles first, then by name. Lit items are skipped. */
function candidates(actor) {
  return actor.items
    .filter(i => PHYSICAL_TYPES.has(i.type) && (i.system.quantity ?? 1) > 0 && !/ \(Lit\)$/.test(i.name))
    .sort((a, b) => (isProjectile(b) - isProjectile(a)) || a.name.localeCompare(b.name));
}

function casterToken(actor) {
  const scene = canvas?.scene;
  if (!scene) return null;
  return scene.tokens.find(t => t.actor?.uuid === actor.uuid) ?? null;
}

/** Allies whose items can be handed over: friendly tokens within reach on the same scene. */
function allies(caster) {
  if (!cfg.allowHandoff) return [];
  const ct = casterToken(caster);
  if (!ct) return [];
  const scene = ct.parent;
  const out = [];
  for (const t of scene.tokens) {
    if (!t.actor || t.id === ct.id || t.actor.uuid === caster.uuid) continue;
    if (t.disposition !== ct.disposition) continue;
    if (reachDistance(ct, t, scene.grid.size, scene.grid.distance) > cfg.handoffRange) continue;
    if (out.some(o => o.actor.uuid === t.actor.uuid)) continue;
    out.push({ actor: t.actor, token: t });
  }
  return out;
}

function optionLabel(item) {
  const q = item.system.quantity ?? 1;
  const tag = isProjectile(item) ? ` [${L("projectile")}]` : "";
  return `${item.name}${q > 1 ? ` (${q})` : ""}${tag}`;
}

/**
 * Pick the object to light. Opens after the Light spell is cast, or from the macro.
 * @param {Actor} caster
 */
export async function openPicker(caster) {
  if (!caster) return ui.notifications.warn(L("noCaster"));
  const own = candidates(caster);
  const friends = allies(caster).map(a => ({ ...a, items: candidates(a.actor) })).filter(a => a.items.length);
  if (!own.length && !friends.length) return ui.notifications.warn(L("nothing"));

  const group = (label, actor, items) => `<optgroup label="${esc(label)}">${items.map(i =>
    `<option value="${esc(actor.uuid)}|${esc(i.id)}">${esc(optionLabel(i))}</option>`).join("")}</optgroup>`;
  const groups = [];
  if (own.length) groups.push(group(L("yours", { name: caster.name }), caster, own));
  for (const f of friends) groups.push(group(L("handoffFrom", { name: f.actor.name }), f.actor, f.items));

  const content = `
    <div class="light-cantrip-picker">
      <label>${esc(L("object"))}<select name="target">${groups.join("")}</select></label>
      <label>${esc(L("color"))}<input type="color" name="color" value="${esc(cfg.defaultColor || "#ffe7b3")}"></label>
      <p class="hint">${esc(L("rule"))}</p>
      ${friends.length ? `<p class="hint">${esc(L("handoffHint"))}</p>` : ""}
    </div>`;

  const { DialogV2 } = foundry.applications.api;
  const choice = await DialogV2.prompt({
    window: { title: L("title", { name: caster.name }), icon: "fa-solid fa-lightbulb" },
    content,
    ok: {
      label: L("ok"),
      callback: (event, button) => {
        const f = button.form.elements;
        return { target: f.target.value, color: f.color.value };
      }
    },
    rejectClose: false
  });
  if (!choice?.target) return null;
  const [ownerUuid, itemId] = choice.target.split("|");
  try { await game.settings.set("light-cantrip", "defaultColor", choice.color); } catch (err) { /* client setting */ }
  log().debug("picker choice", { caster: caster.name, ownerUuid, itemId });
  return request("cast", { casterUuid: caster.uuid, ownerUuid, itemId, color: choice.color });
}
