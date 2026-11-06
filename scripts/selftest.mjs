import { MODULE_ID, cfg } from "./settings.mjs";
import { tokenCenter } from "./geometry.mjs";

/*
 * Live self-test, run by usedtp Logger in the GM's browser once per module version.
 * A test archer lights one crossbow bolt, fires it at a test goblin (hit, then miss), and the light must follow.
 */

const records = () => cfg.records ?? {};
const lightsFor = (scene, key) => scene.lights.filter(l => l.getFlag(MODULE_ID, "key") === key);
const near = (a, b, tol = 2) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

export async function suite(t) {
  if (!game.packs.get("dnd5e.equipment24")) return t.skip("dnd5e.equipment24 compendium not found");
  const api = game.modules.get(MODULE_ID).api;
  const scene = await t.scene({ environment: { darknessLevel: 1 } });
  const size = scene.grid.size;

  const archer = await t.actor({ name: "Test Archer", type: "character", prototypeToken: { actorLink: true, disposition: 1 } });
  const goblin = await t.actor({
    name: "Test Goblin", type: "npc",
    prototypeToken: { actorLink: true, disposition: -1 },
    system: { attributes: { ac: { calc: "flat", flat: 12 }, hp: { value: 20, max: 20 } } }
  });
  const [crossbow, bolts, backpack, quiver] = await t.items(archer, "dnd5e.equipment24", ["Light Crossbow", "Bolts", "Backpack", "Quiver"]);
  const archerTok = await t.token(archer, { x: 100, y: 100 });
  const goblinTok = await t.token(goblin, { x: 600, y: 100 });
  const key = archer.uuid;
  const activity = crossbow.system.activities.find(a => a.type === "attack");
  const startQty = bolts.system.quantity;

  const fire = async u => {
    t.fixDice(u);
    t.target(goblinTok);
    await activity.rollAttack({}, { configure: false }, {});
  };

  await t.step("cast splits one bolt off and lights it on the archer", async () => {
    await api.castOn({ caster: archer, itemId: bolts.id, color: "#ffcc66" });
    const rec = await t.waitFor(() => records()[key], { message: "Light record" });
    t.equal(rec.state, "carried", "state");
    t.ok(rec.split, "a stack should split");
    t.equal(archer.items.get(bolts.id).system.quantity, startQty - 1, "stack after split");
    t.equal(archer.items.get(rec.itemId)?.system.quantity, 1, "lit piece quantity");
    const light = await t.waitFor(() => lightsFor(scene, key)[0], { message: "light on scene" });
    t.ok(near(light, tokenCenter(archerTok, size)), "light at the archer");
  });

  await t.step("a closed backpack covers the light, a quiver does not", async () => {
    const lit = archer.items.get(records()[key].itemId);
    await lit.update({ "system.container": backpack.id });
    await t.waitFor(() => !lightsFor(scene, key).length, { message: "light gone in backpack" });
    await lit.update({ "system.container": quiver.id });
    await t.waitFor(() => lightsFor(scene, key).length === 1, { message: "light back in quiver" });
    await lit.update({ "system.container": null });
  });

  await t.step("light follows the archer", async () => {
    await archerTok.update({ x: 200 });
    await t.waitFor(() => { const l = lightsFor(scene, key)[0]; return l && near(l, tokenCenter(archerTok, size)); }, { message: "light moved with archer" });
  });

  await t.step("a hit with the lit bolt moves the light to the target", async () => {
    await fire(0.999); // natural 20
    const rec = await t.waitFor(() => records()[key]?.state === "attached" && records()[key], { timeout: 10000, message: "record attached" });
    t.equal(rec.tokenId, goblinTok.id, "attached to the goblin");
    await t.waitFor(() => { const l = lightsFor(scene, key)[0]; return l && near(l, tokenCenter(goblinTok, size)); }, { message: "light at the goblin" });
  });

  await t.step("the light moves with the target", async () => {
    await goblinTok.update({ y: 300 });
    await t.waitFor(() => { const l = lightsFor(scene, key)[0]; return l && near(l, tokenCenter(goblinTok, size)); }, { message: "light followed goblin" });
  });

  await t.step("collect ends the Light and returns the bolt", async () => {
    await api.collect(key);
    await t.waitFor(() => !records()[key], { message: "record removed" });
    await t.waitFor(() => !lightsFor(scene, key).length, { message: "light removed" });
    t.equal(archer.items.get(bolts.id).system.quantity, startQty - 1 + 1, "stack after collect (one bolt fired, one collected)");
    t.ok(!archer.items.find(i => i.name.endsWith("(Lit)")), "no lit piece left");
  });

  await t.step("a miss lands 1d4 squares away in the 1d8 direction", async () => {
    await api.castOn({ caster: archer, itemId: bolts.id });
    await t.waitFor(() => records()[key]?.state === "carried", { message: "second Light" });
    await fire(0.001); // natural 1; the d8 and d4 also roll 1: North, 1 square
    const rec = await t.waitFor(() => records()[key]?.state === "ground" && records()[key], { timeout: 10000, message: "record on ground" });
    const c = tokenCenter(goblinTok, size);
    t.ok(near(rec, { x: c.x, y: c.y - size }), `landed 1 square north of the goblin (got ${rec.x},${rec.y})`);
    await t.waitFor(() => lightsFor(scene, key).length === 1, { message: "light on the ground" });
  });

  await t.step("dismiss ends the Light and leaves no light behind", async () => {
    await api.dismiss(key);
    await t.waitFor(() => !records()[key] && !lightsFor(scene, key).length, { message: "Light ended" });
  });
}
