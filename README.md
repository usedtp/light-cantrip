# Light Cantrip

Foundry VTT v14 (build 370) and dnd5e 6.0.6. Runs the 2024 PHB Light cantrip.

Requires **usedtp Logger** 1.1.2 or newer (installed automatically as a dependency).

## Install
Manifest URL: `https://github.com/usedtp/light-cantrip/releases/latest/download/module.json`

## Use
- **Cast Light from the spell sheet.** The picker opens: choose the object and a color.
- **Or use the "Light Cantrip" macro** (created in the Macro Directory; drag it to the hotbar).
  - No active Light: casts it.
  - Active Light: Collect, Cover/Uncover, Dismiss, Cast again.
- **Cast card** (whispered to the caster's player and the GM): Cover/Uncover, Dismiss, Error, Unexpected. Dismiss shows for the caster's player and the GM only.
- A GM must be logged in. The GM's browser makes the item and light changes.

## Rules (2024 PHB p.379)
- One Large or smaller object that isn't worn or carried by someone else. Bright 20 ft, dim 20 ft more.
- Covering it blocks the light. Casting again ends the old Light. The caster can dismiss it at any time (PHB ch.7, Duration).
- The Light stays on until the caster clicks **Dismiss**, casts Light again, or the object is collected. Scene lighting never ends it.

## How it behaves
- **Hand-off:** pick an ally's item when they are within reach (5 ft). They hand it over, it is lit, it goes back. GM setting.
- **Stacks:** lighting one arrow splits off "Arrow (Lit)" (qty 1). When the Light ends it merges back into the stack.
- **Firing:** the lit arrow is preselected in the attack dialog. Thrown weapons work the same way.
  - **Hit:** the light sticks to the target and moves with it.
  - **Miss:** the player's browser rolls 1d8 for direction (1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW) and 1d4 for squares from the target. The light lands there.
  - **No target:** the light drops at the shooter's feet.
  - **Returning weapons:** keep their light.
- **Collect:** when combat ends (or right away outside combat), a Collect button appears. Collecting ends the Light and returns the arrow to the stack.
- **Containers:** inside an open container (name contains a word from the "Open containers" setting, default Quiver) it still shines. Inside any other container it is covered.

## House rules (GM settings)
- **Goes dark when it changes hands** (default on). Dragging or trading the lit object to another character ends the Light. Firing and hand-off don't count.

## Reporting a problem
- **Error / Unexpected buttons** at the bottom of every Light Cantrip chat card: cast, hit, miss, no target, ended, collect. Every card is whispered to the GM and the players who own the caster or the object.
- **Macro menu:** "Report a problem" while a Light is active.
- **Anywhere:** Game Settings > Configure Settings > usedtp Logger > Error / Unclear.
- A report carries the Light's state, your targets and selected tokens, and this browser's last 60 Light Cantrip steps, so it shows what happened just before the problem.
- GM: read reports in Game Settings > Configure Settings > usedtp Logger > Open logs. Export JSON to send them on.

## Logs and self-test
- Errors, warnings and actions go to `Data/usedtp-logs/light-cantrip/` through usedtp Logger.
- On the first load of each new version, usedtp Logger runs a self-test in a hidden scene: a test archer lights a bolt, it is covered in a backpack and shown in a quiver, follows the archer, is fired for a hit (light follows the target), collected, fired for a miss (lands 1 square north on fixed dice), and dismissed. The GM gets a whispered result.

## API
`game.modules.get("light-cantrip").api`: `menu(actor)`, `cast(actor)`, `pick(actor)`, `records()`, `cover(key)`, `dismiss(key)`, `collect(key)`, `end(key)` (GM), `report(category)`.
