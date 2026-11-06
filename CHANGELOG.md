# Changelog

## 1.2.1
- Self-test fix only. The test's "hit" shot rolled a natural 1 and its "miss" shot a natural 20, because Foundry v14 maps fixed dice the other way round. The test now checks the mapping first. The module itself was working.

## 1.2.0
- Removed the daylight rule: it ended Light at once in scenes with low darkness, such as lit caves. The Light now stays on until the caster dismisses it, casts again, or the object is collected.
- Every Light Cantrip card is whispered to the GM and the players who own the caster or the object, with Error and Unexpected buttons. The cast card has Dismiss for the caster.
- Hit, miss and no-target results each get a card with report buttons.
- Self-test runs on a fully lit scene and checks the cast card.

## 1.1.0
- Error and Unclear buttons on every chat card, and "Report a problem" in the macro menu. Reports carry the Light's state, targets and the last 60 steps from this browser.
- Every step of a lit shot is logged: lit ammunition loaded or why not, fired or not, target, hit or miss.
- Firing with no target posts a chat card saying the light dropped at the shooter's feet.
- Live self-test run by usedtp Logger on each new version: cast, containers, follow, hit, follow target, collect, miss, dismiss.
- Requires usedtp Logger 1.1.2.

## 1.0.0
- First release: picker on cast, hand-off, ammo split and merge, lit projectiles (hit follows target, miss rolls 1d8 direction and 1d4 squares), collect after combat, cover and open containers, daylight rule, macro, usedtp Logger reporting.
