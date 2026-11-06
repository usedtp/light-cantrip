/* Pure helpers. No Foundry globals, so they can be unit tested in Node. */

/** d8 result to compass direction. Screen y grows downward, so North is -y. */
export const DIRECTIONS = {
  1: { key: "N", dx: 0, dy: -1 },
  2: { key: "NE", dx: 1, dy: -1 },
  3: { key: "E", dx: 1, dy: 0 },
  4: { key: "SE", dx: 1, dy: 1 },
  5: { key: "S", dx: 0, dy: 1 },
  6: { key: "SW", dx: -1, dy: 1 },
  7: { key: "W", dx: -1, dy: 0 },
  8: { key: "NW", dx: -1, dy: -1 }
};

/**
 * Where a missed lit projectile lands.
 * @param {{x:number,y:number}} center  Target token center in pixels.
 * @param {number} d8       Direction roll, 1-8.
 * @param {number} squares  Distance roll in grid squares (1d4).
 * @param {number} gridSize Pixels per square.
 * @param {{x:number,y:number,width:number,height:number}} [rect] Scene area to keep the point inside.
 */
export function landingPoint(center, d8, squares, gridSize, rect) {
  const dir = DIRECTIONS[d8];
  if (!dir) throw new Error(`bad direction roll ${d8}`);
  let x = center.x + dir.dx * squares * gridSize;
  let y = center.y + dir.dy * squares * gridSize;
  if (rect) {
    const half = gridSize / 2;
    x = Math.min(Math.max(x, rect.x + half), rect.x + rect.width - half);
    y = Math.min(Math.max(y, rect.y + half), rect.y + rect.height - half);
  }
  return { x: Math.round(x), y: Math.round(y), dir: dir.key };
}

/** Comma list of container name words that count as open (light shows), e.g. "Quiver, Bandolier". */
export function parseKeywords(text) {
  return String(text ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

export function isOpenContainerName(name, keywords) {
  const n = String(name ?? "").toLowerCase();
  return keywords.some(k => n.includes(k));
}

/**
 * Is the light blocked by the containers the item sits in?
 * @param {string|null} containerId  Item's system.container.
 * @param {(id:string)=>({name:string, container:string|null}|null)} lookup  Container by id on the same actor.
 * @param {string[]} keywords  Open-container words.
 */
export function blockedByContainer(containerId, lookup, keywords) {
  const seen = new Set();
  let id = containerId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const c = lookup(id);
    if (!c) return false;
    if (!isOpenContainerName(c.name, keywords)) return true;
    id = c.container;
  }
  return false;
}

/** Is this item the Light cantrip? */
export function isLightSpell(item) {
  if (!item || item.type !== "spell") return false;
  const id = item.system?.identifier;
  if (id) return id === "light";
  return String(item.name ?? "").trim().toLowerCase() === "light";
}

/** Item types that are physical objects someone can carry. */
export const PHYSICAL_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);

/** Ammunition or a weapon that can be thrown: the light leaves with it. */
export function isProjectile(item) {
  if (!item) return false;
  if (item.type === "consumable" && item.system?.type?.value === "ammo") return true;
  if (item.type === "weapon" && item.system?.properties?.has?.("thr")) return true;
  return false;
}

/** Name of the split-off lit item. */
export const litName = name => `${name} (Lit)`;

/** Hit or miss from a dnd5e attack roll and the target AC. Null when it can't be decided. */
export function attackHits({ total, isCritical, isFumble, ac }) {
  if (isCritical) return true;
  if (isFumble) return false;
  if (typeof ac !== "number" || typeof total !== "number") return null;
  return total >= ac;
}

/** Token center in pixels from token document data (width/height in grid squares). */
export function tokenCenter(doc, gridSize) {
  return { x: doc.x + ((doc.width ?? 1) * gridSize) / 2, y: doc.y + ((doc.height ?? 1) * gridSize) / 2 };
}

/**
 * Reach between two tokens in grid distance units, 2024 square-grid counting (every square, diagonal or not,
 * is one grid distance). Adjacent or overlapping tokens are 1 square apart.
 */
export function reachDistance(a, b, gridSize, gridDistance) {
  const box = d => ({ x0: d.x, y0: d.y, x1: d.x + (d.width ?? 1) * gridSize, y1: d.y + (d.height ?? 1) * gridSize });
  const A = box(a);
  const B = box(b);
  const gapX = Math.max(0, A.x0 - B.x1, B.x0 - A.x1);
  const gapY = Math.max(0, A.y0 - B.y1, B.y0 - A.y1);
  const squares = Math.round(Math.max(gapX, gapY) / gridSize) + 1;
  return squares * gridDistance;
}
