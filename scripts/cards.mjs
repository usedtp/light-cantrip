import { MODULE_ID } from "./settings.mjs";
import { log } from "./log.mjs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const L = (key, data) => (data ? game.i18n.format(`LIGHTCANTRIP.card.${key}`, data) : game.i18n.localize(`LIGHTCANTRIP.card.${key}`));

function btn(action, key, label, icon) {
  return `<button type="button" data-lc-action="${action}" data-lc-key="${esc(key)}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
}

function swatch(color) {
  return `<span class="lc-swatch" style="background:${esc(color)}"></span>`;
}

async function create(content, whisper, flagKind, key) {
  return ChatMessage.create({
    content: `<div class="light-cantrip-card">${content}</div>`,
    speaker: { alias: game.i18n.localize("LIGHTCANTRIP.title") },
    whisper: whisper ?? [],
    flags: { [MODULE_ID]: { kind: flagKind, key } }
  });
}

/** Public card when Light is cast, with Cover and Dismiss buttons for the people who control it. */
export async function postCastCard(rec) {
  const handoff = rec.handoff ? `<p class="lc-note">${esc(L("handoff", { owner: rec.ownerName, caster: rec.casterName }))}</p>` : "";
  const content = `
    <h3>${swatch(rec.color)} ${esc(L("castTitle"))}</h3>
    <p>${esc(L("cast", { caster: rec.casterName, item: rec.originalName, owner: rec.ownerName }))}</p>
    ${handoff}
    <p class="lc-note">${esc(L("rule"))}</p>
    <div class="lc-buttons">${btn("cover", rec.key, L("coverToggle"), "fa-mitten")}${btn("dismiss", rec.key, L("dismiss"), "fa-xmark")}</div>`;
  return create(content, null, "cast", rec.key);
}

const REASONS = ["recast", "relit", "dismiss", "collected", "daylight", "changedHands", "itemGone", "gm"];

export async function postEndNote(rec, reason, userIds) {
  const why = REASONS.includes(reason) ? L(`reason.${reason}`) : reason;
  const content = `<p>${swatch(rec.color)} ${esc(L("ended", { caster: rec.casterName, item: rec.originalName, reason: why }))}</p>`;
  // Daylight, changed hands and dismissal are seen by everyone at the table; the rest only by those involved.
  const publicReasons = ["daylight", "changedHands", "dismiss"];
  return create(content, publicReasons.includes(reason) ? null : userIds, "end", rec.key);
}

export async function postCollectCard(rec, userIds) {
  const content = `
    <p>${swatch(rec.color)} ${esc(L("collectPrompt", { owner: rec.ownerName, item: rec.originalName }))}</p>
    <div class="lc-buttons">${btn("collect", rec.key, L("collect"), "fa-hand")}</div>`;
  return create(content, userIds, "collect", rec.key);
}

/** Button handling. Buttons show only for players who control the caster or the object's owner. */
export function registerCards(api) {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(MODULE_ID, "kind")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    for (const b of root.querySelectorAll("button[data-lc-action]")) {
      const rec = api.record(b.dataset.lcKey);
      if (!rec) { b.disabled = true; b.title = game.i18n.localize("LIGHTCANTRIP.card.over"); continue; }
      if (!api.canControl(rec, b.dataset.lcAction)) { b.style.display = "none"; continue; }
      if (b.dataset.lcAction === "collect" && rec.state === "carried") { b.disabled = true; continue; }
      b.addEventListener("click", ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = b.dataset.lcKey;
        const action = b.dataset.lcAction;
        log().guard(`card ${action}`, () => {
          if (action === "cover") return api.cover(key);
          if (action === "dismiss") return api.dismiss(key);
          if (action === "collect") return api.collect(key);
          return null;
        });
      });
    }
  });
}
