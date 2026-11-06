import { MODULE_ID } from "./settings.mjs";
import { log } from "./diag.mjs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const L = (key, data) => (data ? game.i18n.format(`LIGHTCANTRIP.card.${key}`, data) : game.i18n.localize(`LIGHTCANTRIP.card.${key}`));

function btn(action, key, label, icon) {
  return `<button type="button" data-lc-action="${action}" data-lc-key="${esc(key)}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
}

/** Error and Unexpected buttons on every card. Anyone who sees the card can report. */
function reportButtons(key) {
  return `<div class="lc-report"><span>${esc(L("reportPrompt"))}</span>`
    + `<button type="button" data-lc-action="report-error" data-lc-key="${esc(key)}">${esc(L("reportError"))}</button>`
    + `<button type="button" data-lc-action="report-unclear" data-lc-key="${esc(key)}">${esc(L("reportUnclear"))}</button></div>`;
}

function swatch(color) {
  return `<span class="lc-swatch" style="background:${esc(color)}"></span>`;
}

/** The GMs plus the players who own the caster or the object. Every card is whispered to them only. */
export function involvedUsers(rec) {
  const actorFrom = uuid => { try { return fromUuidSync(uuid); } catch (err) { return null; } };
  const actors = [actorFrom(rec.casterUuid), actorFrom(rec.ownerUuid)].filter(Boolean);
  return game.users.filter(u => u.isGM || actors.some(a => a.testUserPermission(u, "OWNER"))).map(u => u.id);
}

async function create(content, rec, flagKind, extra = {}) {
  return ChatMessage.create({
    content: `<div class="light-cantrip-card">${content}${reportButtons(rec.key)}</div>`,
    speaker: { alias: game.i18n.localize("LIGHTCANTRIP.title") },
    whisper: involvedUsers(rec),
    flags: { [MODULE_ID]: { kind: flagKind, key: rec.key } },
    ...extra
  });
}

/** Card when Light is cast: Cover and Dismiss for the caster, Error and Unexpected for everyone who sees it. */
export async function postCastCard(rec) {
  const handoff = rec.handoff ? `<p class="lc-note">${esc(L("handoff", { owner: rec.ownerName, caster: rec.casterName }))}</p>` : "";
  const content = `
    <h3>${swatch(rec.color)} ${esc(L("castTitle"))}</h3>
    <p>${esc(L("cast", { caster: rec.casterName, item: rec.originalName, owner: rec.ownerName }))}</p>
    ${handoff}
    <p class="lc-note">${esc(L("rule"))}</p>
    <div class="lc-buttons">${btn("cover", rec.key, L("coverToggle"), "fa-mitten")}${btn("dismiss", rec.key, L("dismiss"), "fa-xmark")}</div>`;
  return create(content, rec, "cast");
}

const REASONS = ["recast", "relit", "dismiss", "collected", "changedHands", "itemGone", "gm"];

export async function postEndNote(rec, reason) {
  const why = REASONS.includes(reason) ? L(`reason.${reason}`) : reason;
  const content = `<p>${swatch(rec.color)} ${esc(L("ended", { caster: rec.casterName, item: rec.originalName, reason: why }))}</p>`;
  return create(content, rec, "end");
}

export async function postCollectCard(rec) {
  const content = `
    <p>${swatch(rec.color)} ${esc(L("collectPrompt", { owner: rec.ownerName, item: rec.originalName }))}</p>
    <div class="lc-buttons">${btn("collect", rec.key, L("collect"), "fa-hand")}</div>`;
  return create(content, rec, "collect");
}

/** A lit shot's result (hit, miss with its d8 and d4, or no target), from the shooter's browser. */
export async function postShotCard(rec, text, { rolls, speaker } = {}) {
  const content = `<p>${swatch(rec.color)} ${esc(text)}</p>`;
  const extra = {};
  if (rolls?.length) extra.rolls = rolls;
  if (speaker) extra.speaker = speaker;
  return create(content, rec, "shot", extra);
}

/** Button handling. Buttons show only for players who control the caster or the object's owner. */
export function registerCards(api) {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(MODULE_ID, "kind")) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    for (const b of root.querySelectorAll("button[data-lc-action]")) {
      if (b.dataset.lcAction.startsWith("report-")) {
        const category = b.dataset.lcAction.slice(7);
        b.addEventListener("click", ev => {
          ev.preventDefault();
          ev.stopPropagation();
          api.report(category, { key: b.dataset.lcKey, messageId: message.id });
        });
        continue;
      }
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
