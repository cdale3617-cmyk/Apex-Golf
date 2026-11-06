// Turns a satellite photo of a hole into an illustrated 3D-style picture, all inside the app.
// It reads the photo's colour AND texture to tell fairway, rough, trees, sand and water apart,
// cleans the result, then repaints it as a drawn fairway with stripes, shaded trees and depth.

export type Style = "Illustrated 3D" | "Tilted 3D" | "Night";
export type Options = { style: Style; density: number; tilt: number; brightness: number; treeBias: number };
export type Report = { fairway: number; rough: number; trees: number; sand: number; water: number };

const OTHER = 0;
const FAIRWAY = 1;
const ROUGH = 2;
const TREE = 3;
const SAND = 4;
const WATER = 5;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
}

/** Majority filter: removes speckle so each area becomes one clean shape. */
function smooth(kind: Uint8Array, W: number, H: number) {
  const next = new Uint8Array(kind.length);
  const counts = new Uint8Array(6);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      counts.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          counts[kind[yy * W + xx]]++;
        }
      }
      const here = kind[y * W + x];
      let best = here;
      for (let k = 0; k < 6; k++) if (counts[k] > counts[best]) best = k;
      next[y * W + x] = best;
    }
  }
  return next;
}

export function convertImage(src: HTMLImageElement, out: HTMLCanvasElement, opts: Options): Report {
  const W = 960;
  const H = Math.max(200, Math.round((src.height / src.width) * W));
  out.width = W;
  out.height = H;
  const N = W * H;

  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  const tc = tmp.getContext("2d", { willReadFrequently: true })!;
  tc.drawImage(src, 0, 0, W, H);
  const d = tc.getImageData(0, 0, W, H).data;

  // Colour and brightness for every pixel.
  const hue = new Float32Array(N);
  const sat = new Float32Array(N);
  const val = new Float32Array(N);
  const lum = new Float32Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min;
    let h = 0;
    if (c) {
      if (max === r) h = ((g - b) / c) % 6;
      else if (max === g) h = (b - r) / c + 2;
      else h = (r - g) / c + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    hue[p] = h;
    sat[p] = max ? c / max : 0;
    val[p] = max / 255;
    lum[p] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // Texture: how bumpy the picture is around each pixel. Trees are bumpy, mown grass is smooth.
  const stride = W + 1;
  const ii = new Float64Array(stride * (H + 1));
  const ii2 = new Float64Array(stride * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0, row2 = 0;
    for (let x = 0; x < W; x++) {
      const l = lum[y * W + x];
      row += l;
      row2 += l * l;
      ii[(y + 1) * stride + x + 1] = ii[y * stride + x + 1] + row;
      ii2[(y + 1) * stride + x + 1] = ii2[y * stride + x + 1] + row2;
    }
  }
  const tex = new Float32Array(N);
  const R = 3;
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1);
      const area = (x1 - x0) * (y1 - y0);
      const s = ii[y1 * stride + x1] - ii[y0 * stride + x1] - ii[y1 * stride + x0] + ii[y0 * stride + x0];
      const s2 = ii2[y1 * stride + x1] - ii2[y0 * stride + x1] - ii2[y1 * stride + x0] + ii2[y0 * stride + x0];
      const mean = s / area;
      tex[y * W + x] = Math.sqrt(Math.max(0, s2 / area - mean * mean));
    }
  }

  // Thresholds come from THIS photo, so dull or bright images both work.
  const isGreen = (p: number) => hue[p] >= 55 && hue[p] <= 175 && sat[p] >= 0.12 && val[p] > 0.08;
  const gv: number[] = [];
  const gt: number[] = [];
  for (let p = 0; p < N; p += 5) {
    if (isGreen(p)) {
      gv.push(val[p]);
      gt.push(tex[p]);
    }
  }
  gv.sort((a, b) => a - b);
  gt.sort((a, b) => a - b);
  const bias = opts.treeBias / 100; // 0 = fewer trees, 1 = more trees
  const darkCut = percentile(gv, 0.2 + bias * 0.3);
  const brightCut = percentile(gv, 0.5);
  const bumpyCut = percentile(gt, 0.8 - bias * 0.3);
  const smoothCut = percentile(gt, 0.5);

  let kind = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const h = hue[p], s = sat[p], v = val[p];
    const i = p * 4;
    if (h >= 175 && h <= 260 && s >= 0.2 && v > 0.12) kind[p] = WATER;
    else if (isGreen(p)) {
      if (v < darkCut || tex[p] > bumpyCut) kind[p] = TREE;
      else if (v >= brightCut && tex[p] <= smoothCut) kind[p] = FAIRWAY;
      else kind[p] = ROUGH;
    } else if (v > 0.55 && s < 0.5 && d[i] > d[i + 2] + 8 && h >= 15 && h < 70) kind[p] = SAND;
    else if (v < 0.3) kind[p] = TREE;
    else kind[p] = OTHER;
  }
  kind = smooth(smooth(smooth(kind, W, H), W, H), W, H);

  // Which way the fairway runs, so the mowing stripes cross it properly.
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (kind[y * W + x] !== FAIRWAY) continue;
      n++;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
  }
  let angle = Math.PI / 2;
  if (n > 50) {
    const cxx = sxx / n - (sx / n) ** 2, cyy = syy / n - (sy / n) ** 2, cxy = sxy / n - (sx / n) * (sy / n);
    angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  }
  const ax = Math.cos(angle), ay = Math.sin(angle);

  // Paint the ground.
  const night = opts.style === "Night";
  const base: Record<number, [number, number, number]> = {
    [FAIRWAY]: [128, 216, 72],
    [ROUGH]: [62, 144, 54],
    [TREE]: [40, 108, 50],
    [SAND]: [240, 220, 164],
    [WATER]: [48, 162, 232],
    [OTHER]: [196, 186, 160],
  };
  const tint = night ? [0.34, 0.46, 0.78] : [1, 1, 1];
  const bright = opts.brightness / 100;
  const ctx = out.getContext("2d")!;
  const image = ctx.createImageData(W, H);
  const o = image.data;
  const rand = mulberry(90210);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4;
      const k = kind[p];
      const c = base[k];
      const shade = 0.88 + 0.24 * Math.min(1, Math.max(0, (lum[p] - 0.12) / 0.6));
      let m = shade;
      if (k === FAIRWAY) m *= Math.floor((x * ax + y * ay) / 15) % 2 ? 1.07 : 0.93;
      else if (k === ROUGH) m *= 0.96 + rand() * 0.08;
      else if (k === WATER) m *= 0.92 + 0.16 * (y / H);
      o[i] = Math.min(255, c[0] * m * tint[0] * bright);
      o[i + 1] = Math.min(255, c[1] * m * tint[1] * bright);
      o[i + 2] = Math.min(255, c[2] * m * tint[2] * bright);
      o[i + 3] = 255;
    }
  }
  // Soft dark edges where one kind of ground meets another, like a drawing.
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const p = y * W + x;
      const k = kind[p];
      const edge = k !== kind[p + 1] || k !== kind[p + W];
      if (!edge || k === TREE || k === OTHER) continue;
      for (const q of [p, p + 1, p + W]) {
        o[q * 4] *= 0.8;
        o[q * 4 + 1] *= 0.8;
        o[q * 4 + 2] *= 0.8;
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  // Trees: placed on the detected tree areas with varied size, round or pointed.
  const step = Math.round(30 - ((opts.density - 10) / 90) * 22);
  const trees: { x: number; y: number; r: number; pointed: boolean; tone: number }[] = [];
  const half = Math.max(3, Math.round(step / 2));
  for (let gy = half; gy < H - half; gy += step) {
    for (let gx = half; gx < W - half; gx += step) {
      const x = Math.round(gx + (rand() - 0.5) * step * 0.8);
      const y = Math.round(gy + (rand() - 0.5) * step * 0.8);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || kind[y * W + x] !== TREE) continue;
      let around = 0;
      for (const [dx, dy] of [[half, 0], [-half, 0], [0, half], [0, -half]]) {
        const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy));
        if (kind[yy * W + xx] === TREE) around++;
      }
      if (around < 3) continue;
      trees.push({ x, y, r: step * (0.62 + rand() * 0.5), pointed: rand() < 0.3, tone: rand() });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(t.x + t.r * 0.4, t.y + t.r * 0.55, t.r * 0.95, t.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (t.pointed) {
      ctx.fillStyle = night ? "#123c28" : "#1f6a35";
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - t.r * 1.6);
      ctx.lineTo(t.x - t.r * 0.85, t.y + t.r * 0.5);
      ctx.lineTo(t.x + t.r * 0.85, t.y + t.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = night ? "#1d5a3a" : "#34994f";
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - t.r * 1.6);
      ctx.lineTo(t.x - t.r * 0.85, t.y + t.r * 0.5);
      ctx.lineTo(t.x, t.y + t.r * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(t.x - t.r * 0.35, t.y - t.r * 0.4, t.r * 0.1, t.x, t.y, t.r * 1.05);
      if (night) {
        g.addColorStop(0, "#4a9a68");
        g.addColorStop(0.5, "#236042");
        g.addColorStop(1, "#103a26");
      } else {
        g.addColorStop(0, t.tone > 0.5 ? "#8fe070" : "#7fd66a");
        g.addColorStop(0.5, "#2f9a4a");
        g.addColorStop(1, "#1c6a34");
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3D depth: foreshorten and narrow the far end, then add haze and a soft vignette.
  const tilt = opts.tilt / 100;
  if (tilt > 0) {
    const snap = document.createElement("canvas");
    snap.width = W;
    snap.height = H;
    snap.getContext("2d")!.drawImage(out, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = night ? "#0b1530" : "#a9d6f0";
    ctx.fillRect(0, 0, W, H);
    const squash = 1 + 0.6 * tilt;
    const narrow = 0.2 * tilt;
    const g = (v: number) => v ** squash;
    for (let y = 0; y < H; y++) {
      const y0 = H * g(y / H);
      const y1 = H * g((y + 1) / H);
      const f = 1 - narrow * (1 - y / H);
      const w = W * f;
      ctx.drawImage(snap, 0, y, W, 1, (W - w) / 2, y0, w, Math.max(1, y1 - y0 + 0.6));
    }
    const haze = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    haze.addColorStop(0, night ? "rgba(40,60,120,0.35)" : "rgba(255,255,255,0.28)");
    haze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H * 0.45);
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  const share = (k: number) => {
    let c = 0;
    for (let p = 0; p < N; p += 7) if (kind[p] === k) c++;
    return Math.round((c / Math.ceil(N / 7)) * 100);
  };
  return { fairway: share(FAIRWAY), rough: share(ROUGH), trees: share(TREE), sand: share(SAND), water: share(WATER) };
}
