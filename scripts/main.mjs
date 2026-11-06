import { MODULE_ID, registerSettings, cfg } from "./settings.mjs";
import { log } from "./log.mjs";
import { registerSocket, request } from "./net.mjs";
import { registerGM } from "./gm.mjs";
import { registerCards } from "./cards.mjs";
import { registerAttack } from "./attack.mjs";
import { openPicker } from "./picker.mjs";
import { isLightSpell } from "./geometry.mjs";

const L = (key, data) => (data ? game.i18n.format(`LIGHTCANTRIP.menu.${key}`, data) : game.i18n.localize(`LIGHTCANTRIP.menu.${key}`));

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const record = key => (cfg.records ?? {})[key] ?? null;
const actorFrom = uuid => { try { return fromUuidSync(uuid); } catch (err) { return null; } };

function canControl(rec, action) {
  if (game.user.isGM) return true;
  const caster = actorFrom(rec.casterUuid);
  const owner = actorFrom(rec.ownerUuid);
  if (action === "dismiss") return !!caster?.isOwner;
  return !!(caster?.isOwner || owner?.isOwner);
}

function defaultActor() {
  return canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

/** The actor's Light spell, if it has one. */
function lightSpell(actor) {
  return actor?.items.find(i => isLightSpell(i)) ?? null;
}

/** Cast Light: uses the spell (so the chat card and any automation run), then the picker opens. */
async function cast(actor = defaultActor()) {
  if (!actor) return ui.notifications.warn(L("selectToken"));
  const spell = lightSpell(actor);
  if (spell) return spell.use();
  if (game.user.isGM) return openPicker(actor);
  return ui.notifications.warn(L("noSpell", { name: actor.name }));
}

/** One-button menu for the macro: cast, or manage the active Light. */
async function menu(actor = defaultActor()) {
  if (!actor) return ui.notifications.warn(L("selectToken"));
  const rec = record(actor.uuid);
  if (!rec) return cast(actor);
  const { DialogV2 } = foundry.applications.api;
  const where = rec.state === "carried" ? L("whereCarried", { owner: rec.ownerName }) : rec.state === "attached" ? L("whereAttached") : L("whereGround");
  const buttons = [
    { action: "cover", label: rec.covered ? L("uncover") : L("cover"), icon: "fa-solid fa-mitten" },
    { action: "dismiss", label: L("dismiss"), icon: "fa-solid fa-xmark" },
    { action: "recast", label: L("recast"), icon: "fa-solid fa-lightbulb" }
  ];
  if (rec.state !== "carried") buttons.unshift({ action: "collect", label: L("collect"), icon: "fa-solid fa-hand", default: true });
  const choice = await DialogV2.wait({
    window: { title: L("title", { name: actor.name }), icon: "fa-solid fa-lightbulb" },
    content: `<p>${esc(L("status", { item: rec.originalName, where }))}${rec.covered ? ` ${esc(L("isCovered"))}` : ""}</p>`,
    buttons,
    rejectClose: false
  });
  if (choice === "cover") return api.cover(rec.key);
  if (choice === "dismiss") return api.dismiss(rec.key);
  if (choice === "collect") return api.collect(rec.key);
  if (choice === "recast") return cast(actor);
  return null;
}

const api = {
  menu,
  cast,
  pick: actor => openPicker(actor ?? defaultActor()),
  record,
  records: () => foundry.utils.deepClone(cfg.records ?? {}),
  canControl,
  cover: key => request("cover", { key }),
  dismiss: key => request("dismiss", { key }),
  collect: key => request("collect", { key }),
  /** GM: end any Light. */
  end: key => request("end", { key }),
  report: (category = "error") => log().openReport(category)
};

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(MODULE_ID).api = api;
  registerGM();
  registerAttack();
  registerCards(api);
});

Hooks.once("ready", () => {
  registerSocket();
  log().info("ready", { gm: game.user.isGM });
});

// Casting the Light spell opens the picker in the caster's browser.
Hooks.on("dnd5e.postUseActivity", (activity) => {
  try {
    if (!isLightSpell(activity?.item)) return;
    const actor = activity.actor ?? activity.item.actor;
    openPicker(actor).catch(err => log().error("picker failed", err));
  } catch (err) {
    log().error("postUseActivity", err);
  }
});
