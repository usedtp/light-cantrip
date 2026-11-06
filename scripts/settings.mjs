export const MODULE_ID = "light-cantrip";
export const FLAG = "lit";

const S = key => `LIGHTCANTRIP.settings.${key}`;

export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `${S(key)}.name`, hint: `${S(key)}.hint`, config: true, ...data
  });

  reg("allowHandoff", { scope: "world", type: Boolean, default: true });
  reg("handoffRange", { scope: "world", type: Number, default: 5 });
  reg("darkOnHandChange", { scope: "world", type: Boolean, default: true });
  reg("openContainers", { scope: "world", type: String, default: "Quiver" });
  reg("brightRadius", { scope: "world", type: Number, default: 20 });
  reg("dimRadius", { scope: "world", type: Number, default: 40 });
  reg("createMacro", { scope: "world", type: Boolean, default: true });
  reg("defaultColor", { scope: "client", type: String, default: "#ffe7b3" });

  // Active spells, keyed by caster actor UUID. Written only by the active GM.
  game.settings.register(MODULE_ID, "records", { scope: "world", config: false, type: Object, default: {} });
}

export const cfg = new Proxy({}, {
  get(target, key) {
    try { return game.settings.get(MODULE_ID, key); } catch (err) { return undefined; }
  }
});
