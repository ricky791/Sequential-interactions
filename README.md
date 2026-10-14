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

The site lives in [`docs/`](docs/) as plain HTML, CSS and JavaScript, with no dependencies or build step,
so the files there are both the editable source and what GitHub Pages serves.
To publish it, set **Settings → Pages → Build and deployment** to *Deploy from a branch*, branch `main`, folder `/docs`.
