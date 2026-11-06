# Light Cantrip

Foundry VTT v14 (build 370) and dnd5e 6.0.6. Runs the 2024 PHB Light cantrip.

Requires **usedtp Logger** (installed automatically as a dependency).

## Install
Manifest URL: `https://github.com/usedtp/light-cantrip/releases/latest/download/module.json`

## Use
- **Cast Light from the spell sheet.** The picker opens: choose the object and a color.
- **Or use the "Light Cantrip" macro** (created in the Macro Directory; drag it to the hotbar).
  - No active Light: casts it.
  - Active Light: Collect, Cover/Uncover, Dismiss, Cast again.
- **Chat card buttons:** Cover/Uncover and Dismiss. Only the caster, the object's owner and the GM see them.
- A GM must be logged in. The GM's browser makes the item and light changes.

## Rules (2024 PHB p.379)
- One Large or smaller object that isn't worn or carried by someone else. Bright 20 ft, dim 20 ft more.
- Covering it blocks the light. Casting again ends the old Light. The caster can dismiss it at any time (PHB ch.7, Duration).
- The 1 hour duration is not timed: dismiss it when the hour is up.

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
- **Ends in daylight** (default on, threshold 0.25). The Light ends when its scene's darkness is below the threshold.

## Logs and reports
- Errors, warnings and actions go to `Data/usedtp-logs/light-cantrip/` through usedtp Logger.
- **Report a problem:** Settings > usedtp Logger > Error / Unclear, or the macro `game.modules.get("light-cantrip").api.report()`.

## API
`game.modules.get("light-cantrip").api`: `menu(actor)`, `cast(actor)`, `pick(actor)`, `records()`, `cover(key)`, `dismiss(key)`, `collect(key)`, `end(key)` (GM), `report(category)`.
