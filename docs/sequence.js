/*
 * Seed to Flower: one continuous sequence built from three interaction studies.
 *
 *   1. drag     } Planting a Seed: drag the seed over the hole (rim glows when aligned)
 *   2. release  }   and let go; it falls in, bounces and settles. A miss springs back.
 *   3. stretch    Grow a Flower: drag upward from the seed to grow stem, leaves, bud, bloom.
 *   4. pick       Pick a Flower: pull the head until the stem snaps; the head comes free.
 *
 * Each step unlocks only after the previous one succeeds. Every element lives in one
 * SVG scene (the Grow a Flower coordinate system) and persists through the whole sequence.
 */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const svg = $('scene');
  const hintEl = $('hint');
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMQ.matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = t => t * t * (3 - 2 * t);
  const backOut = t => { const c = 1.6; t = clamp(t); return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const rubber = (d, k) => k * (1 - Math.exp(-Math.max(0, d) / k));
  const f2 = n => n.toFixed(2);

  function spring(x, k, c) { return { x, v: 0, t: x, k, c }; }
  function stepSpring(s, dt) { const a = s.k * (s.t - s.x) - s.c * s.v; s.v += a * dt; s.x += s.v * dt; }
  function tune(s, k, c) { s.k = k; s.c = reduced() ? Math.max(c, 2 * Math.sqrt(k)) : c; }

  function toSvg(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ------------------------------------------------------------------ */
  /* Shared geometry (scene units)                                       */
  /* ------------------------------------------------------------------ */
  const HX = 160, HCY = 445, HRX = 30;      // hole opening (both studies use a 30-unit hole)
  const S = 1.3;                            // plant.svg scale
  const BX = 160, BY = 447;                 // stem root, inside the hole
  const LFULL = 188 * S;                    // full stem height
  const STEM_END = 0.74;                    // progress at which the stem is full length
  const D_GROW = LFULL / STEM_END;          // upward drag distance for full growth
  const LEAF_L_AT = 90 / 188, LEAF_R_AT = 130 / 188;
  const THRESH = 112 * S;                   // pull distance to snap: about one flower-head diameter
  const N = 33;                             // stem samples (as in Pick a Flower)

  /* ------------------------------------------------------------------ */
  /* Sequence state, prompts                                             */
  /* ------------------------------------------------------------------ */
  let stage = 'plant';                      // plant | grow | bloom | pick | end
  let gen = 0;                              // bumps on reset so pending handoffs are dropped
  const later = (ms, fn) => { const g = gen; setTimeout(() => { if (g === gen) fn(); }, ms); };

  const HINT = {
    drag: 'Drag the seed over the hole',
    release: 'Let go to plant it',
    grow: 'Stretch it upward to make it grow',
    pick: 'Pull the flower to pick it',
    end: 'You picked a flower.'
  };
  const LABEL = {
    plant: 'A seed hanging above a patch of soil. Drag it over the hole and let go, or press Enter to drop it.',
    grow: 'The seed is planted. Drag upward from it to grow a flower, or press the Up arrow.',
    bloom: 'The flower is blooming.',
    pick: 'The flower is in bloom. Pull it until the stem snaps, or hold Space.',
    end: 'You picked the flower. You can drag it around.'
  };
  let hintText = hintEl.textContent, hintTimer = 0;
  function setHint(text) {
    if (text === hintText) return;
    hintText = text;
    clearTimeout(hintTimer);
    hintEl.classList.add('out');
    hintTimer = setTimeout(() => { hintEl.textContent = text; hintEl.classList.remove('out'); }, reduced() ? 0 : 160);
  }
  function setStage(s) {
    stage = s;
    svg.dataset.stage = s;
    svg.setAttribute('aria-label', LABEL[s]);
  }

  /* ------------------------------------------------------------------ */
  /* Sound (Web Audio, starts on the first gesture)                      */
  /* Grow a Flower's noise textures + Pick a Flower's pop + soil thuds   */
  /* ------------------------------------------------------------------ */
  const Sound = (() => {
    let ctx = null, master = null, white = null, brown = null, bed = null;
    let grainAcc = 0, lastT = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);

    function makeNoise(sec, kind) {
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else d[i] = w;
      }
      return b;
    }
    function out(pan) {
      if (ctx.createStereoPanner && pan) {
        const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(master); return p;
      }
      return master;
    }
    // One short filtered noise burst: the building block of every texture
    function burst({ when = 0, dur = 0.02, freq = 2000, q = 1, peak = 0.1, attack = 0.002, pan = 0, type = 'bandpass', buf = white, sweepTo = 0 }) {
      const t = ctx.currentTime + when;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
      fl.frequency.setValueAtTime(freq, t);
      if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
      s.connect(fl); fl.connect(g); g.connect(out(pan));
      s.start(t, rnd(0, buf.duration - attack - dur - 0.1), attack + dur + 0.05);
    }

    function init() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        ctx = new AC();
        master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp); comp.connect(ctx.destination);
        white = makeNoise(3, 'white');
        brown = makeNoise(4, 'brown');

        // Continuous bed while growing: a soft fibrous swish
        const s = ctx.createBufferSource(); s.buffer = white; s.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
        s.start();
        bed = { bp, g };
        lastT = ctx.currentTime;
      } catch (_) { ctx = null; }
    }

    // Seed landing in soil: a dull thud plus a little grit, scaled by impact speed (new for this sequence)
    function thud(strength) {
      if (!ctx) return;
      const s = clamp(strength);
      burst({ dur: 0.06 + 0.05 * s, freq: 170 + 110 * s, type: 'lowpass', q: 0.7, peak: 0.04 + 0.3 * s, attack: 0.003, buf: brown });
      const n = 2 + Math.round(4 * s);
      for (let i = 0; i < n; i++) {
        burst({ when: rnd(0, 0.05), dur: rnd(0.004, 0.012), freq: rnd(2200, 5000), q: rnd(1.5, 3),
                peak: 0.01 + rnd(0.015, 0.05) * s, pan: rnd(-0.25, 0.25) });
      }
    }
    // Stem stretching: soft swish plus tiny fiber creaks whose density follows drag speed and tension
    function stretch(q, tension, speed) {
      if (!bed) return;
      const now = ctx.currentTime;
      const dt = Math.min(0.1, now - lastT); lastT = now;
      bed.bp.frequency.setTargetAtTime(500 + 700 * q + tension * 12, now, 0.08);
      bed.g.gain.setTargetAtTime(0.045 * speed, now, speed > 0.02 ? 0.05 : 0.15);
      grainAcc += speed * (22 + tension * 3) * dt;
      while (grainAcc >= 1) {
        grainAcc -= 1;
        burst({
          when: rnd(0, 0.03), dur: rnd(0.004, 0.014),
          freq: rnd(1100, 2600) + tension * 40, q: rnd(1.5, 4),
          peak: rnd(0.03, 0.11) * (0.5 + 0.5 * speed), pan: rnd(-0.2, 0.2)
        });
      }
    }
    // Leaf unfolding: a cluster of dry leaf rustles
    function rustle(pan = 0, when = 0, scale = 1) {
      if (!ctx) return;
      const n = 7 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        burst({
          when: when + rnd(0, 0.32), dur: rnd(0.025, 0.08), freq: rnd(2500, 6000),
          q: rnd(0.7, 1.6), peak: rnd(0.04, 0.1) * scale, attack: 0.004, pan: pan + rnd(-0.15, 0.15)
        });
      }
      burst({ when, dur: 0.28, freq: 3200, q: 0.5, peak: 0.035 * scale, attack: 0.06, pan });
    }
    // Bud appearing: a soft muffled split, like a pod giving way
    function pop() {
      if (!ctx) return;
      burst({ dur: 0.09, freq: 320, type: 'lowpass', q: 0.8, peak: 0.4, attack: 0.003, buf: brown });
      burst({ when: 0.004, dur: 0.007, freq: 3200, type: 'highpass', q: 0.7, peak: 0.1 });
      burst({ when: 0.02, dur: 0.012, freq: 1800, q: 2, peak: 0.05 });
    }
    // Each petal unfurling: a silky, rising brush
    function petal(i) {
      if (!ctx) return;
      const pan = (i - 2.5) * 0.12;
      burst({ dur: 0.32, freq: 1800, sweepTo: 4800, q: 0.9, peak: 0.03, attack: 0.09, pan });
      burst({ when: rnd(0.04, 0.15), dur: 0.01, freq: rnd(3000, 5000), q: 2, peak: 0.03, pan });
    }
    // Full bloom: a gentle breeze swells through and the leaves stir
    function bloom() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = brown; s.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.linearRampToValueAtTime(900, t + 1.1);
      lp.frequency.linearRampToValueAtTime(320, t + 3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 1.0);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      s.connect(lp); lp.connect(g); g.connect(master);
      s.start(t); s.stop(t + 3.3);
      rustle(-0.35, 0.5, 0.8);
      rustle(0.35, 0.95, 0.7);
      rustle(0, 1.5, 0.45);
    }
    // Stem snapping: one hollow pop, like a cork pulled out (Pick a Flower)
    function snap() {
      if (!ctx) return;
      try {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(680, t + 0.03);
        o.frequency.exponentialRampToValueAtTime(520, t + 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.13);
      } catch (_) {}
    }
    return { init, thud, stretch, rustle, pop, petal, bloom, snap };
  })();

  /* ------------------------------------------------------------------ */
  /* Steps 1–2: drag + release (Planting a Seed)                         */
  /* ------------------------------------------------------------------ */
  const seedClip = $('seedClip'), seedShade = $('seedShade'), seedEl = $('seed'), seedArt = $('seedArt');
  const seedShoot = $('seedShoot'), rimGlow = $('rimGlow');

  // Seed position = bottom-center of the seed. Art is 92 x 136, drawn at Grow a Flower's scale.
  const SEED_S = 0.32;
  const SEED_H = 136 * SEED_S, SEED_HALF_W = 46 * SEED_S;
  const FLOOR = 453.5;                        // rests where Grow a Flower's seed sits, tip above the lip
  const START = { x: HX, y: 350 };            // hanging, clear gap above the opening
  const ALIGN_X = HRX - SEED_HALF_W - 2;
  const G = 1800;                             // gravity, units/s^2
  const BOUNCES = [10, 4, 1.5];               // rebound heights, each smaller than the last

  const sd = {
    state: 'idle',                            // idle | dragging | planting | settled | failing | returning
    x: START.x, y: START.y, vx: 0, vy: 0,
    grabDX: 0, grabDY: 0, id: null,
    hovering: false, hoverScale: 1,
    squash: 0, squashV: 0,
    bounceIdx: 0, failT: 0, opacity: 1
  };
  let shootIn = 0;                            // seed shoot appears once the seed is planted

  function seedHit(pt) {
    const hs = sd.hoverScale;
    const cx = sd.x, cy = sd.y - (164 - 98) * SEED_S * hs;
    const rx = 70 * SEED_S * hs, ry = 86 * SEED_S * hs;
    return ((pt.x - cx) / rx) ** 2 + ((pt.y - cy) / ry) ** 2 <= 1;
  }
  function visibleBounds() {
    const r = svg.getBoundingClientRect(), m = svg.getScreenCTM().inverse();
    const a = svg.createSVGPoint(); a.x = r.left; a.y = r.top;
    const b = svg.createSVGPoint(); b.x = r.right; b.y = r.bottom;
    const p = a.matrixTransform(m), q = b.matrixTransform(m);
    return { x0: p.x + SEED_HALF_W + 2, x1: q.x - SEED_HALF_W - 2, y0: p.y + SEED_H + 2, y1: q.y - 2 };
  }
  const isAligned = () => Math.abs(sd.x - HX) <= ALIGN_X && sd.y <= HCY + 2;
  function setGlow(on) { rimGlow.setAttribute('opacity', on ? '0.28' : '0'); }
  function setClip(on) { on ? seedClip.setAttribute('clip-path', 'url(#aboveGround)') : seedClip.removeAttribute('clip-path'); }

  function seedDown(e, pt) {
    if (sd.state !== 'idle' || !seedHit(pt)) return false;
    sd.grabDX = sd.x - pt.x; sd.grabDY = sd.y - pt.y;
    sd.id = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    sd.state = 'dragging';
    return true;
  }
  function seedMove(e, pt) {
    if (sd.state !== 'dragging' || e.pointerId !== sd.id) return;
    const b = visibleBounds();
    sd.x = Math.min(b.x1, Math.max(b.x0, pt.x + sd.grabDX));
    sd.y = Math.min(b.y1, Math.max(b.y0, pt.y + sd.grabDY));
    const aligned = isAligned();
    setGlow(aligned);
    setHint(aligned ? HINT.release : HINT.drag);
  }
  function seedRelease(e) {
    if (sd.state !== 'dragging' || e.pointerId !== sd.id) return;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    sd.id = null;
    setGlow(false);
    seedDrop();
  }
  function seedDrop() {
    sd.vx = 0; sd.vy = 0;
    if (isAligned()) { sd.state = 'planting'; sd.bounceIdx = 0; setClip(true); setHint(''); }
    else { sd.state = 'failing'; sd.failT = 0; setHint(HINT.drag); }
  }

  function seedFrame(dt) {
    const soft = !reduced();
    if (sd.state === 'planting') {
      sd.vy += G * dt;
      sd.y += sd.vy * dt;
      sd.x += (HX - sd.x) * Math.min(1, dt * 12);
      if (sd.y >= FLOOR) {
        sd.y = FLOOR;
        const impact = sd.vy;
        Sound.thud(impact / 650);
        if (soft) { sd.squash = Math.min(0.3, impact / 2000); sd.squashV = 0; }
        if (soft && sd.bounceIdx < BOUNCES.length) {
          sd.vy = -Math.sqrt(2 * G * BOUNCES[sd.bounceIdx]);
          sd.bounceIdx++;
        } else {
          sd.vy = 0; sd.x = HX;
          sd.state = 'settled';
          sd.hovering = false;
          later(350, enterGrow);
        }
      }
    } else if (sd.state === 'failing') {
      sd.vy += G * dt;
      sd.y += sd.vy * dt;
      sd.failT += dt;
      if (sd.failT > 0.22) { sd.state = 'returning'; sd.vx = 0; sd.vy *= 0.35; }
    } else if (sd.state === 'returning') {
      // damped spring home: smooth, with a soft overshoot
      const k = 160, c = 20;
      sd.vx += (k * (START.x - sd.x) - c * sd.vx) * dt;
      sd.vy += (k * (START.y - sd.y) - c * sd.vy) * dt;
      sd.x += sd.vx * dt; sd.y += sd.vy * dt;
      if (Math.hypot(START.x - sd.x, START.y - sd.y) < 0.15 && Math.hypot(sd.vx, sd.vy) < 4) {
        sd.x = START.x; sd.y = START.y; sd.vx = sd.vy = 0; sd.state = 'idle';
      }
    }

    // squash spring (rubbery jiggle back to round)
    sd.squashV += (-900 * sd.squash - 26 * sd.squashV) * dt;
    sd.squash += sd.squashV * dt;
    if (Math.abs(sd.squash) < 0.001 && Math.abs(sd.squashV) < 0.01) { sd.squash = 0; sd.squashV = 0; }

    // stretch along motion while airborne
    let stretch = 0;
    if (soft && (sd.state === 'planting' || sd.state === 'failing')) stretch = Math.min(0.14, Math.abs(sd.vy) / 4200);
    const sy = (1 + stretch) * (1 - sd.squash);
    const sx = 1 / Math.sqrt(Math.max(0.5, sy));

    // hover / hold enlargement
    const target = sd.state === 'dragging' ? 1.14 : (sd.hovering && sd.state === 'idle' ? 1.08 : 1);
    sd.hoverScale += (target - sd.hoverScale) * Math.min(1, dt * 16);

    sd.opacity += (1 - sd.opacity) * Math.min(1, dt * 8);

    const hc = SEED_H / 2;
    seedEl.setAttribute('transform',
      `translate(${f2(sd.x)} ${f2(sd.y - hc)}) scale(${sd.hoverScale.toFixed(4)}) translate(0 ${f2(hc)})`);
    seedArt.setAttribute('transform',
      `scale(${(SEED_S * sx).toFixed(4)} ${(SEED_S * sy).toFixed(4)}) translate(-100 -164)`);
    seedShade.style.opacity = sd.opacity.toFixed(3);
    seedShade.style.filter = seedDepthFilter();
  }
  // deeper in the hole reads darker
  function seedDepthFilter() {
    const depth = clamp((sd.y - HCY) / (FLOOR - HCY));
    return depth > 0 ? `brightness(${(1 - 0.3 * depth).toFixed(3)})` : '';
  }

  /* ------------------------------------------------------------------ */
  /* Step 3: stretch (Grow a Flower)                                     */
  /* ------------------------------------------------------------------ */
  const stemA = $('stemA'), stemB = $('stemB'), stemC = $('stemC');
  const leafL = $('leafL'), leafR = $('leafR');
  const head = $('head'), bud = $('bud'), center = $('flowerCenter'), tipShoot = $('tipShoot');
  const petalsG = $('petals');

  // The six petal groups from plant.svg (outer + inner layer each)
  const OUTER = '<path d="M100 100 C88 92 80 72 84 56 C86 46 93 40 97 44 L100 48 L103 44 C107 40 114 46 116 56 C120 72 112 92 100 100 Z" fill="url(#petalGrad)" stroke="#4a4a4a" stroke-width="1.4" stroke-linejoin="round"/><path d="M100 98 C99 82 99 66 100 50" fill="none" stroke="#8c8c8c" stroke-width="0.9" stroke-linecap="round"/><path d="M100 92 C94 82 91 70 92 60 M100 92 C106 82 109 70 108 60" fill="none" stroke="#a6a6a6" stroke-width="0.7" stroke-linecap="round"/><path d="M91 62 C90 56 93 50 96 48" fill="none" stroke="#fafafa" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>';
  const INNER = '<path d="M100 100 C91 92 87 78 91 66 C94 59 100 57 100 57 C100 57 106 59 109 66 C113 78 109 92 100 100 Z" fill="url(#innerGrad)" stroke="#555" stroke-width="1.1" stroke-linejoin="round"/><path d="M100 96 C100 84 100 72 100 60" fill="none" stroke="#9a9a9a" stroke-width="0.7" stroke-linecap="round"/>';
  const petals = [];
  for (let i = 0; i < 6; i++) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('opacity', '0');
    g.innerHTML = `<g transform="rotate(${i * 60} 100 100)">${OUTER}</g><g transform="rotate(${i * 60 + 30} 100 100)">${INNER}</g>`;
    petalsG.appendChild(g);
    petals.push(g);
  }

  let p = 0;                                  // committed growth progress 0..1
  let done = false;
  let drag = null;                            // { id, startY, pStart, offX, offY }
  let hover = false;
  const prog = spring(0, 150, 19);            // displayed progress (elastic lag)
  const bend = spring(0, 200, 19);            // sideways lean of the tip
  const pull = spring(0, 200, 19);            // extra rubber-band stretch above committed length
  const grab = spring(1, 260, 18);            // target enlargement
  const sway = spring(0, 60, 5);              // bloom settle
  let tip = { x: BX, y: BY };

  const stemLen = q => LFULL * ease(clamp(q / STEM_END)) * 0.97 + LFULL * 0.03 * clamp(q / 0.04);
  function targetPoint() { return p <= 0 && prog.x < 0.01 ? { x: 160, y: 418 } : tip; }
  function onTarget(pt) {
    if (stage !== 'grow' || done) return false;
    const t = targetPoint();
    return Math.hypot(pt.x - t.x, pt.y - t.y) < 30;
  }

  function bez(P, t) {
    const u = 1 - t;
    return {
      x: u*u*u*P[0].x + 3*u*u*t*P[1].x + 3*u*t*t*P[2].x + t*t*t*P[3].x,
      y: u*u*u*P[0].y + 3*u*u*t*P[1].y + 3*u*t*t*P[2].y + t*t*t*P[3].y
    };
  }
  function bezAngle(P, t) {
    const u = 1 - t;
    const dx = 3*u*u*(P[1].x-P[0].x) + 6*u*t*(P[2].x-P[1].x) + 3*t*t*(P[3].x-P[2].x);
    const dy = 3*u*u*(P[1].y-P[0].y) + 6*u*t*(P[2].y-P[1].y) + 3*t*t*(P[3].y-P[2].y);
    return Math.atan2(dx, -dy) * 180 / Math.PI;
  }

  function enterGrow() {
    setStage('grow');
    setHint(HINT.grow);
  }

  function setGrabTarget() {
    grab.t = drag ? 1.12 : (hover && !done ? 1.07 : 1);
  }

  function growDown(e, pt) {
    if (!onTarget(pt)) return false;
    svg.setPointerCapture(e.pointerId);
    const t = targetPoint();
    drag = { id: e.pointerId, startY: pt.y, pStart: p, offX: pt.x - t.x, offY: pt.y - t.y };
    tune(prog, 150, 19); tune(bend, 200, 19); tune(pull, 200, 19);
    setGrabTarget();
    return true;
  }
  function growMove(e, pt) {
    if (!drag) { hover = onTarget(pt); setGrabTarget(); return; }
    if (e.pointerId !== drag.id) return;
    const up = drag.startY - pt.y;
    const cand = clamp(drag.pStart + Math.max(0, up) / D_GROW);
    if (cand > p) p = cand;                     // only upward travel adds growth
    prog.t = p;
    const cx = pt.x - drag.offX, cy = pt.y - drag.offY;
    const committedTipY = BY - stemLen(p);
    pull.t = p > 0 ? rubber(committedTipY - cy, 24) : 0;
    bend.t = p > 0 ? 34 * Math.tanh((cx - BX) / 110) : 0;
    if (p >= 1) complete();
  }
  function growRelease() {
    if (!drag) return;
    try { svg.releasePointerCapture(drag.id); } catch (_) {}
    drag = null;
    pull.t = 0; bend.t = 0;
    tune(prog, 120, 15); tune(bend, 110, 7); tune(pull, 130, 8);   // gentle elastic settle
    setGrabTarget();
  }
  function complete() {
    done = true;
    p = 1; prog.t = 1;
    growRelease();
    hover = false;
    sway.v = reduced() ? 0 : 34;              // one soft nod, then rest
    tune(prog, 70, 7);
    setGrabTarget();
    setStage('bloom');
    setHint('');
    later(1400, enterPick);                   // after the nod and the swell of the bloom sound
  }
  function growKey() {
    if (done) return;
    p = clamp(p + 0.05); prog.t = p;
    tune(prog, 120, 15);
    if (p >= 1) complete();
  }

  // One-shot sound cues when growth crosses each stage (re-arm after reset)
  const fired = {};
  function cue(key, q, th, fn) {
    if (q >= th && !fired[key]) { fired[key] = true; fn(); }
    else if (q < th - 0.05) fired[key] = false;
  }
  function audioFrame() {
    const q = prog.x;
    const growing = stage === 'grow' || stage === 'bloom';
    const speed = clamp(Math.sqrt(Math.abs(prog.v) * 3 + Math.abs(pull.v) / 70 + Math.abs(bend.v) / 160) * 0.8);
    Sound.stretch(clamp(q), Math.max(0, pull.x), growing && q > 0.003 ? speed : 0);
    cue('leafL', q, 0.38, () => Sound.rustle(-0.35));
    cue('leafR', q, 0.54, () => Sound.rustle(0.35));
    cue('bud', q, 0.61, Sound.pop);
    for (let i = 0; i < 6; i++) cue('petal' + i, q, 0.83 + i * 0.022, () => Sound.petal(i));
    cue('bloom', done ? q : 0, 0.97, Sound.bloom);
  }

  /* ------------------------------------------------------------------ */
  /* Step 4: pick (Pick a Flower)                                        */
  /* ------------------------------------------------------------------ */
  const below = $('below'), above = $('above'), socket = $('socket'), stemOver = $('stemOver');
  const stud = $('stud'), studShift = $('studShift');
  const ring = $('ring'), ticks = $('ticks'), fx = $('fx');

  const TICK_ANG = [0, 60, 120, 180, 240, 300].map(a => (a + 30) * Math.PI / 180);
  ticks.innerHTML = TICK_ANG.map(() => '<line x1="0" y1="0" x2="0" y2="0"/>').join('');
  const tickEls = [...ticks.children];

  const pk = {
    phase: 'rest',                            // rest | pull | return | free | freeDrag
    D: [0, 0], Dv: [0, 0], Dprev: [0, 0],     // stem displacement at the tip
    sK: 280, sC: 15,                          // stem spring
    H: [0, 0], Hv: [0, 0], Ht: [0, 0],        // free head joint position
    A: 0, Av: 0,                              // free head angle
    grabStart: [0, 0], Gbase: [0, 0], grabOff: [0, 0], lastP: [0, 0],
    id: null, kb: false,
    burstT: 0, burstP: [0, 0],
    leafWob: 0, lastAttachedAngle: 0, lastTip: [BX, BY],
    t: 0, jx: 0, jy: 0
  };
  let joint = 0;                              // stem-over-joint overlay, socket and stud fade in for picking
  let headC = { x: BX, y: BY };               // flower center on screen, for hit tests
  let headR = 60 * S;
  const KB_RATE = THRESH / 1.5;               // holding Space pulls the head this many units per second

  const restart = (el, cls) => { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); };
  ['headPop', 'studPop'].forEach(id => $(id).addEventListener('animationend', e => e.currentTarget.classList.remove('pop')));

  const attached = () => pk.phase === 'rest' || pk.phase === 'pull' || pk.phase === 'return';
  function headHit(pt) {
    if (stage !== 'pick' && stage !== 'end') return false;
    if (stage === 'pick' && !attached()) return false;
    return Math.hypot(pt.x - headC.x, pt.y - headC.y) < headR;
  }

  function enterPick() {
    setStage('pick');
    setHint(HINT.pick);
  }

  function pickBegin(id, pos) {
    pk.id = id;
    pk.lastP = pos;
    svg.classList.add('held');
    head.setAttribute('filter', 'url(#lift)');
    if (pk.phase === 'free') {
      pk.phase = 'freeDrag';
      pk.grabOff = [pos[0] - pk.H[0], pos[1] - pk.H[1]];
      pk.Ht = [pk.H[0], pk.H[1]];
    } else {
      pk.phase = 'pull';
      pk.grabStart = pos;
      pk.Gbase = [pk.D[0] / 0.74, pk.D[1] / 0.74];
      pk.grabOff = [pos[0] - pk.lastTip[0], pos[1] - pk.lastTip[1]];
    }
  }
  function pickDown(e, pt) {
    if (pk.id !== null || !headHit(pt)) return false;
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    pickBegin(e.pointerId, [pt.x, pt.y]);
    return true;
  }
  function pickMove(e, pt) {
    if (pk.id === null) {
      const hov = e.pointerType === 'mouse' && headHit(pt);
      svg.classList.toggle('hov', hov);
      return;
    }
    if (e.pointerId !== pk.id) return;
    pk.lastP = [pt.x, pt.y];
    if (pk.phase === 'freeDrag') pk.Ht = [pt.x - pk.grabOff[0], pt.y - pk.grabOff[1]];
  }
  function pickRelease(id) {
    if (pk.id === null || id !== pk.id) return;
    if (id !== 'kb') { try { svg.releasePointerCapture(id); } catch (_) {} }
    pk.id = null; pk.kb = false;
    svg.classList.remove('held');
    head.removeAttribute('filter');
    if (pk.phase === 'pull') { pk.phase = 'return'; pk.sK = 280; pk.sC = 15; pk.Dv = [0, 0]; }
    else if (pk.phase === 'freeDrag') pk.phase = 'free';
  }

  function snap() {
    Sound.snap();
    pk.phase = 'freeDrag';
    pk.H = [pk.lastTip[0], pk.lastTip[1]];
    pk.Hv = [0, 0];
    // a keyboard pull has no pointer to follow, so the head stays where it broke off
    pk.Ht = pk.kb ? [pk.H[0], pk.H[1]] : [pk.lastP[0] - pk.grabOff[0], pk.lastP[1] - pk.grabOff[1]];
    pk.A = pk.lastAttachedAngle; pk.Av = 0;
    pk.sK = 720; pk.sC = 15; pk.Dv = [0, 0];  // underdamped: short recoil, quick settle
    above.appendChild(head);
    pk.burstT = performance.now(); pk.burstP = [pk.lastTip[0], pk.lastTip[1]];
    restart($('headPop'), 'pop'); restart($('studPop'), 'pop');
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
    setStage('end');
    setHint('');
    later(700, () => setHint(HINT.end));
  }

  function pickFrame(dt) {
    const reduce = reduced();
    pk.t = 0; pk.jx = 0; pk.jy = 0;

    if (pk.phase === 'pull') {
      if (pk.kb) pk.lastP = [pk.lastP[0], pk.lastP[1] - KB_RATE * dt];
      const Gx = pk.lastP[0] - pk.grabStart[0] + pk.Gbase[0];
      const Gy = pk.lastP[1] - pk.grabStart[1] + pk.Gbase[1];
      pk.t = Math.min(Math.hypot(Gx, Gy) / THRESH, 1);
      const k = 0.74 - 0.2 * pk.t;            // resistance grows with distance
      const a = 1 - Math.exp(-dt * 26);
      pk.D[0] += (Gx * k - pk.D[0]) * a;
      pk.D[1] += (Gy * k - pk.D[1]) * a;
      if (!reduce && pk.t > 0.7) {            // strain tremor near the break point
        const amp = (pk.t - 0.7) / 0.3 * 1.2 * S;
        pk.jx = (Math.random() - 0.5) * 2 * amp;
        pk.jy = (Math.random() - 0.5) * 2 * amp;
      }
    } else if (pk.phase !== 'rest') {
      for (let i = 0; i < 2; i++) {
        const acc = -pk.sK * pk.D[i] - pk.sC * pk.Dv[i];
        pk.Dv[i] += acc * dt;
        pk.D[i] += pk.Dv[i] * dt;
      }
      if (pk.phase === 'return' && Math.hypot(pk.D[0], pk.D[1]) < 0.05 && Math.hypot(pk.Dv[0], pk.Dv[1]) < 0.5) {
        pk.phase = 'rest'; pk.D = [0, 0]; pk.Dv = [0, 0];
      }
    }

    if (pk.phase === 'free' || pk.phase === 'freeDrag') {
      for (let i = 0; i < 2; i++) {
        const acc = 1100 * (pk.Ht[i] - pk.H[i]) - 52 * pk.Hv[i];
        pk.Hv[i] += acc * dt;
        pk.H[i] += pk.Hv[i] * dt;
      }
      const aT = Math.max(-24, Math.min(24, pk.Hv[0] / S * 0.03));
      pk.Av += (180 * (aT - pk.A) - 13 * pk.Av) * dt;
      pk.A += pk.Av * dt;
    }

    // Leaves trail a little behind the stem's sideways motion
    const vx = (pk.D[0] - pk.Dprev[0]) / dt / S;
    pk.Dprev = [pk.D[0], pk.D[1]];
    pk.leafWob += (Math.max(-14, Math.min(14, -vx * 0.02)) - pk.leafWob) * Math.min(1, dt * 10);
  }

  /* ------------------------------------------------------------------ */
  /* Render: one plant, shaped by growth (Grow) and pull (Pick)          */
  /* ------------------------------------------------------------------ */
  function pathD(pts) {
    let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
    }
    return d;
  }

  function render(now) {
    const q = clamp(prog.x, 0, 1.08);
    const len = Math.max(0, stemLen(Math.min(q, 1)) + pull.x);
    const lean = bend.x * clamp(len / 70) + sway.x;
    const g = grab.x;

    // Grown shape: rooted cubic with the asset's gentle S-curve, leaning toward the pull
    const fr = len / LFULL;
    const P = [
      { x: BX, y: BY },
      { x: BX - 7 * S * fr + lean * 0.05, y: BY - len * 0.36 },
      { x: BX + 4 * S * fr + lean * 0.55, y: BY - len * 0.72 },
      { x: BX + lean, y: BY - len }
    ];
    // Pulled shape: cantilever bend sideways, even stretch lengthwise
    const dx = pk.D[0] + pk.jx, dy = pk.D[1] + pk.jy;
    const defPt = t => { const b = bez(P, t); const wx = (3 * t * t - t * t * t) / 2; return [b.x + dx * wx, b.y + dy * t]; };
    const defAng = t => {
      const a = defPt(Math.max(0, t - 0.01)), b = defPt(Math.min(1, t + 0.01));
      return Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI;
    };

    const pts = [];
    for (let i = 0; i < N; i++) pts.push(defPt(i / (N - 1)));
    const T = pts[N - 1];
    tip = { x: T[0], y: T[1] };
    pk.lastTip = [T[0], T[1]];

    const visible = len > 0.5;
    const hl = pts.map(([x, y], i) => [x - 1.6, i === N - 1 ? y + 2 : y]);
    const tv = Math.min(1, Math.hypot(pk.D[0], pk.D[1]) / (THRESH * 0.56));
    const thin = (1 - 0.22 * clamp(pull.x / 26)) * (1 - 0.28 * tv);   // gummy thinning under tension
    const young = clamp(len / 40, 0.55, 1);                            // young shoot is thinner
    if (visible) {
      const d = pathD(pts);
      stemA.setAttribute('d', d); stemB.setAttribute('d', d); stemC.setAttribute('d', pathD(hl));
    }
    stemA.setAttribute('stroke-width', f2(8.4 * thin * young));
    stemB.setAttribute('stroke-width', f2(4.5 * thin * young));
    stemC.setAttribute('stroke-width', f2(1.4 * thin * young));
    stemA.style.visibility = stemB.style.visibility = stemC.style.visibility = visible ? 'visible' : 'hidden';

    // Leaves unfold from folded-up to open, then ride the pulled stem
    placeLeaf(leafL, defPt, defAng, len, LEAF_L_AT, clamp((q - 0.36) / 0.2), 98, 210, 72, 0.7);
    placeLeaf(leafR, defPt, defAng, len, LEAF_R_AT, clamp((q - 0.52) / 0.18), 99, 170, -72, 1);

    // Joint
    const baseAng = bezAngle(P, 1), tipAng = defAng(1);
    socket.setAttribute('transform', `translate(${f2(T[0])} ${f2(T[1])}) rotate(${f2(tipAng)}) scale(${S})`);
    const j = joint.toFixed(3);
    socket.setAttribute('opacity', j); stud.setAttribute('opacity', j); stemOver.setAttribute('opacity', j);

    // Head rides on the tip, following the stem's tangent; once picked it flies free
    let hx, hy, ha, sc;
    if (attached()) {
      hx = T[0]; hy = T[1];
      ha = baseAng + 0.9 * (tipAng - baseAng);
      sc = S * (q > 0 ? g : 1);
      pk.lastAttachedAngle = ha;
      studShift.setAttribute('transform', `translate(0 ${f2(-1.8 * tv)})`);   // the seam starts to open
    } else {
      hx = pk.H[0]; hy = pk.H[1]; ha = pk.A; sc = S;
      studShift.removeAttribute('transform');
    }
    const ht = `translate(${f2(hx)} ${f2(hy)}) rotate(${f2(ha)}) scale(${sc.toFixed(3)}) translate(-100 -112)`;
    head.setAttribute('transform', ht);
    stud.setAttribute('transform', ht);
    const ar = ha * Math.PI / 180;
    headC = { x: hx + 12 * sc * Math.sin(ar), y: hy - 12 * sc * Math.cos(ar) };
    headR = 60 * sc;

    const budIn = backOut(clamp((q - 0.6) / 0.14));
    const budLoosen = clamp((q - 0.74) / 0.08);
    const budOut = clamp((q - 0.82) / 0.1);
    const bs = budIn * (1 - 0.35 * budOut);
    bud.setAttribute('transform', `translate(100 112) scale(${(bs * (1 + 0.12 * budLoosen)).toFixed(3)} ${bs.toFixed(3)}) translate(-100 -112)`);
    bud.setAttribute('opacity', (clamp(budIn * 3) * (1 - budOut)).toFixed(3));

    const shoot = q > 0.002 ? 1 - clamp((q - 0.58) / 0.08) : 0;
    tipShoot.setAttribute('opacity', shoot.toFixed(3));
    tipShoot.setAttribute('transform', `translate(100 112) scale(${(0.6 + 0.6 * clamp(q / 0.1)) * Math.max(shoot, 0.01)}) translate(-100 -112)`);

    petals.forEach((el, i) => {
      const o = clamp((q - 0.8 - i * 0.022) / 0.15, 0, 1.08);
      el.setAttribute('opacity', clamp(o * 3).toFixed(3));
      el.setAttribute('transform', `translate(100 100) rotate(${(-34 * (1 - Math.min(o, 1))).toFixed(2)}) scale(${(0.15 + 0.85 * o).toFixed(3)}) translate(-100 -100)`);
    });
    const c = backOut(clamp((q - 0.86) / 0.12));
    center.setAttribute('opacity', clamp(c * 2).toFixed(3));
    center.setAttribute('transform', `translate(100 100) scale(${c.toFixed(3)}) translate(-100 -100)`);

    // Planted seed: enlarges on hover/grab before sprouting, then sinks into the hole
    if (stage !== 'plant') {
      const sink = ease(clamp(q / 0.14));
      const seedScale = q <= 0.002 ? g : 1;
      seedEl.setAttribute('transform', `translate(160 ${f2(428 + 26 * sink)}) scale(${seedScale.toFixed(3)}) translate(0 25.5)`);
      seedArt.setAttribute('transform', `scale(${SEED_S}) translate(-100 -164)`);
      seedShade.style.opacity = (1 - 0.85 * sink).toFixed(3);
    }
    seedShoot.setAttribute('opacity', (shootIn * (1 - clamp(q / 0.02))).toFixed(3));

    // Snap burst
    if (pk.burstT) {
      const e = (now - pk.burstT) / 380;
      if (e < 1) {
        const k = 1 - Math.pow(1 - e, 3);
        fx.setAttribute('transform', `translate(${f2(pk.burstP[0])} ${f2(pk.burstP[1])}) scale(${S})`);
        ring.setAttribute('r', f2(4 + 20 * k));
        ring.setAttribute('stroke-width', f2(1.8 * (1 - e) + 0.3));
        ring.setAttribute('opacity', f2(0.6 * (1 - e)));
        tickEls.forEach((ln, i) => {
          const a = TICK_ANG[i], r1 = 8 + 13 * k, r2 = r1 + 6 * (1 - e);
          ln.setAttribute('x1', f2(Math.cos(a) * r1)); ln.setAttribute('y1', f2(Math.sin(a) * r1));
          ln.setAttribute('x2', f2(Math.cos(a) * r2)); ln.setAttribute('y2', f2(Math.sin(a) * r2));
          ln.setAttribute('stroke-width', '1.4');
          ln.setAttribute('opacity', reduced() ? '0' : f2(1 - e));
        });
      } else {
        pk.burstT = 0;
        ring.setAttribute('opacity', '0');
        tickEls.forEach(ln => ln.setAttribute('opacity', '0'));
      }
    }
  }

  function placeLeaf(el, defPt, defAng, len, at, u, jx, jy, fold, lag) {
    const need = LFULL * at;
    if (u <= 0 || len < need * 0.9) { el.setAttribute('opacity', '0'); return; }
    const t = clamp(need / len, 0, 1);
    const pt = defPt(t);
    const ang = defAng(t);
    const e = backOut(u);
    const sx = S * (0.12 + 0.88 * e), sy = S * (0.35 + 0.65 * e);
    el.setAttribute('opacity', clamp(u * 4).toFixed(3));
    el.setAttribute('transform', `translate(${f2(pt[0])} ${f2(pt[1])}) rotate(${f2(ang + fold * (1 - e) + pk.leafWob * lag)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-jx} ${-jy})`);
  }

  /* ------------------------------------------------------------------ */
  /* Input routing: only the current step's gesture is live              */
  /* ------------------------------------------------------------------ */
  function updateCursor() {
    let can = false;
    if (stage === 'plant') can = sd.state === 'idle' && sd.hovering;
    else if (stage === 'grow') can = hover && !drag;
    else if (stage === 'pick' || stage === 'end') can = svg.classList.contains('hov') && pk.id === null;
    svg.classList.toggle('can-grab', can);
    document.body.classList.toggle('grabbing', sd.state === 'dragging' || !!drag || (pk.id !== null && pk.id !== 'kb'));
  }

  svg.addEventListener('pointerdown', e => {
    const pt = toSvg(e);
    let took = false;
    if (stage === 'plant') took = seedDown(e, pt);
    else if (stage === 'grow') took = growDown(e, pt);
    else if (stage === 'pick' || stage === 'end') took = pickDown(e, pt);
    if (took) { e.preventDefault(); Sound.init(); }
    updateCursor();
  });
  svg.addEventListener('pointermove', e => {
    const pt = toSvg(e);
    if (stage === 'plant') {
      if (sd.state === 'dragging') seedMove(e, pt);
      else sd.hovering = sd.state === 'idle' && seedHit(pt);
    } else if (stage === 'grow') growMove(e, pt);
    else if (stage === 'pick' || stage === 'end') pickMove(e, pt);
    updateCursor();
  });
  function onUp(e) {
    seedRelease(e);
    if (drag && e.pointerId === drag.id) growRelease();
    pickRelease(e.pointerId);
    updateCursor();
  }
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', () => {
    sd.hovering = false;
    if (!drag) { hover = false; setGrabTarget(); }
    if (pk.id === null) svg.classList.remove('hov');
    updateCursor();
  });

  // Keyboard: Enter/Space drops the seed, ArrowUp grows, holding Space/Enter pulls the flower
  const isPickKey = k => k === ' ' || k === 'Enter';
  svg.addEventListener('keydown', e => {
    if (stage === 'plant' && isPickKey(e.key)) {
      e.preventDefault();
      if (sd.state === 'idle' && !e.repeat) { Sound.init(); seedDrop(); }
    } else if (stage === 'grow' && e.key === 'ArrowUp') {
      e.preventDefault();
      Sound.init();
      growKey();
    } else if (stage === 'pick' && isPickKey(e.key)) {
      e.preventDefault();
      if (e.repeat || pk.id !== null || !attached()) return;
      Sound.init();
      pk.kb = true;
      pickBegin('kb', [pk.lastTip[0], pk.lastTip[1]]);
    } else if (isPickKey(e.key) || e.key === 'ArrowUp') {
      e.preventDefault();
    }
  });
  svg.addEventListener('keyup', e => { if (isPickKey(e.key)) pickRelease('kb'); });
  svg.addEventListener('blur', () => pickRelease('kb'));

  /* ------------------------------------------------------------------ */
  /* Reset: back to the hanging seed                                     */
  /* ------------------------------------------------------------------ */
  $('reset').addEventListener('click', () => {
    gen++;
    // release whatever is held
    if (sd.id !== null) { try { svg.releasePointerCapture(sd.id); } catch (_) {} sd.id = null; }
    if (drag) { try { svg.releasePointerCapture(drag.id); } catch (_) {} drag = null; }
    if (pk.id !== null && pk.id !== 'kb') { try { svg.releasePointerCapture(pk.id); } catch (_) {} }

    // steps 1–2 (Planting a Seed's reset: the seed fades back in at its starting spot)
    Object.assign(sd, { state: 'idle', x: START.x, y: START.y, vx: 0, vy: 0, squash: 0, squashV: 0,
                        hovering: false, hoverScale: 1, opacity: 0, id: null });
    setClip(false); setGlow(false);
    shootIn = 0;

    // step 3
    p = 0; done = false; hover = false;
    [prog, bend, pull, sway].forEach(s => { s.x = 0; s.v = 0; s.t = 0; });
    grab.x = 1; grab.v = 0; grab.t = 1;
    tune(prog, 150, 19); tune(bend, 200, 19); tune(pull, 200, 19);

    // step 4
    Object.assign(pk, { phase: 'rest', D: [0, 0], Dv: [0, 0], Dprev: [0, 0], A: 0, Av: 0, H: [0, 0], Hv: [0, 0],
                        id: null, kb: false, burstT: 0, leafWob: 0, t: 0, jx: 0, jy: 0 });
    below.appendChild(head);
    head.removeAttribute('filter');
    svg.classList.remove('hov', 'held');
    ring.setAttribute('opacity', '0');
    tickEls.forEach(ln => ln.setAttribute('opacity', '0'));
    joint = 0;

    setStage('plant');
    setHint(HINT.drag);
    updateCursor();
  });

  /* ------------------------------------------------------------------ */
  /* Frame loop                                                          */
  /* ------------------------------------------------------------------ */
  let last = performance.now();
  function frame(now) {
    const raw = Math.max(0.001, (now - last) / 1000);
    last = now;

    if (stage === 'plant') seedFrame(Math.min(1 / 30, raw));
    else {
      shootIn += (1 - shootIn) * Math.min(1, raw * 6);
      seedShade.style.filter = seedDepthFilter();
    }

    let dt = Math.min(0.05, raw);
    while (dt > 0) {
      const h = Math.min(dt, 1 / 120);
      [prog, bend, pull, grab, sway].forEach(s => stepSpring(s, h));
      dt -= h;
    }
    if (prog.x < 0 && prog.t === 0) { prog.x = 0; prog.v = 0; }

    pickFrame(Math.min(0.032, raw));
    const jt = stage === 'pick' || stage === 'end' ? 1 : 0;
    joint += (jt - joint) * Math.min(1, raw * 6);

    render(now);
    audioFrame();

    if (pk.phase === 'pull' && pk.t >= 1) snap();
    requestAnimationFrame(frame);
  }
  render(performance.now());
  requestAnimationFrame(frame);
})();
