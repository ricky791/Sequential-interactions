# Sequential-interactions

Live site: https://ricky791.github.io/Sequential-interactions/

## Seed to Flower prototype

One continuous interaction built from the three studies in this repository
(`planting-a-seed.zip`, `grow-a-flower.zip`, `pick-a-flower.zip`):

1. **Drag** the hanging seed over the hole (the rim glows when it is lined up).
2. **Release** it: it drops in, bounces and settles. A miss springs back to try again.
3. **Stretch** upward from the planted seed to grow the stem, leaves, bud and bloom.
4. **Pick** the flower: pull until the stem snaps, then drag the freed head around.

Each step unlocks only after the previous one succeeds. Reset (bottom right) returns to the hanging seed.
Keyboard: Enter drops the seed, the Up arrow grows the flower, holding Space pulls it.

The site is a single self-contained file, [`docs/index.html`](docs/index.html) (HTML, CSS and JavaScript inline, no dependencies or build step),
so it is both the editable source and what GitHub Pages serves, and it also works when opened on its own.
To publish it, set **Settings → Pages → Build and deployment** to *Deploy from a branch*, branch `main`, folder `/docs`.

## GROW game with the Seed to Flower interactions

[`docs/grow/index.html`](docs/grow/index.html), live at https://ricky791.github.io/Sequential-interactions/grow/

The GROW game (soil, water, light, companion and climate choices, rhythm, archive, tutorial) with its
sowing, growing and picking gestures replaced by the Seed to Flower interactions:

- **Sow:** drag the seed right over the hole and let go; it drops in, bounces and settles. A miss springs back.
- **Grow:** grab the stem tip and stretch it upward, one stage between each choice. Growth only moves forward,
  pulling past the tip stretches it like a rubber band and pulling sideways leans it. A slow pull is patient;
  a yank rushes it and twists the stem (this feeds the rhythm, as fast clicks used to).
- **Pick:** pull the flower against rising resistance until the stem snaps; it then floats to the centre as before.
- Synthesized sound for each of these. Keyboard: Space drops the seed, Up arrow grows a step, hold Space to pick.

Outside claude.ai the archive is saved in this browser only.
