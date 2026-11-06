import assert from "node:assert/strict";
import {
  DIRECTIONS, landingPoint, parseKeywords, isOpenContainerName, blockedByContainer,
  isLightSpell, isProjectile, litName, attackHits, tokenCenter, reachDistance
} from "../scripts/geometry.mjs";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("d8 covers 8 compass points", () => {
  assert.deepEqual(Object.values(DIRECTIONS).map(d => d.key), ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
});
t("miss lands d4 squares away", () => {
  assert.deepEqual(landingPoint({ x: 500, y: 500 }, 1, 2, 100), { x: 500, y: 300, dir: "N" });
  assert.deepEqual(landingPoint({ x: 500, y: 500 }, 4, 3, 100), { x: 800, y: 800, dir: "SE" });
  assert.deepEqual(landingPoint({ x: 500, y: 500 }, 7, 1, 100), { x: 400, y: 500, dir: "W" });
});
t("landing stays inside the scene", () => {
  const p = landingPoint({ x: 150, y: 150 }, 8, 4, 100, { x: 100, y: 100, width: 1000, height: 1000 });
  assert.deepEqual(p, { x: 150, y: 150, dir: "NW" });
});
t("bad d8 throws", () => assert.throws(() => landingPoint({ x: 0, y: 0 }, 9, 1, 100)));
t("open containers", () => {
  const k = parseKeywords("Quiver, bandolier");
  assert.equal(isOpenContainerName("Leather Quiver", k), true);
  assert.equal(isOpenContainerName("Backpack", k), false);
});
t("container chain blocks light", () => {
  const k = parseKeywords("Quiver");
  const items = { q: { name: "Quiver", container: null }, b: { name: "Backpack", container: null }, q2: { name: "Quiver", container: "b" } };
  const look = id => items[id] ?? null;
  assert.equal(blockedByContainer(null, look, k), false);
  assert.equal(blockedByContainer("q", look, k), false);
  assert.equal(blockedByContainer("b", look, k), true);
  assert.equal(blockedByContainer("q2", look, k), true, "quiver inside a backpack is covered");
});
t("light spell detection", () => {
  assert.equal(isLightSpell({ type: "spell", system: { identifier: "light" } }), true);
  assert.equal(isLightSpell({ type: "spell", system: { identifier: "lightning-bolt" }, name: "Light" }), false);
  assert.equal(isLightSpell({ type: "spell", system: {}, name: " Light " }), true);
  assert.equal(isLightSpell({ type: "weapon", name: "Light" }), false);
});
t("projectiles", () => {
  assert.equal(isProjectile({ type: "consumable", system: { type: { value: "ammo" } } }), true);
  assert.equal(isProjectile({ type: "weapon", system: { properties: new Set(["thr"]) } }), true);
  assert.equal(isProjectile({ type: "weapon", system: { properties: new Set(["fin"]) } }), false);
  assert.equal(litName("Arrow"), "Arrow (Lit)");
});
t("hit or miss", () => {
  assert.equal(attackHits({ total: 5, isCritical: true, ac: 20 }), true);
  assert.equal(attackHits({ total: 30, isFumble: true, ac: 10 }), false);
  assert.equal(attackHits({ total: 15, ac: 15 }), true);
  assert.equal(attackHits({ total: 14, ac: 15 }), false);
  assert.equal(attackHits({ total: 14, ac: null }), null);
});
t("token geometry", () => {
  assert.deepEqual(tokenCenter({ x: 100, y: 200, width: 1, height: 1 }, 100), { x: 150, y: 250 });
  const a = { x: 0, y: 0, width: 1, height: 1 };
  assert.equal(reachDistance(a, { x: 100, y: 0, width: 1, height: 1 }, 100, 5), 5, "adjacent");
  assert.equal(reachDistance(a, { x: 100, y: 100, width: 1, height: 1 }, 100, 5), 5, "diagonal");
  assert.equal(reachDistance(a, { x: 200, y: 0, width: 1, height: 1 }, 100, 5), 10, "one square gap");
  assert.equal(reachDistance(a, { x: 100, y: 0, width: 2, height: 2 }, 100, 5), 5, "large adjacent");
});
console.log(`light-cantrip: ${n} tests passed`);
