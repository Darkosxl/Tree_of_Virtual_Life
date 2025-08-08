/*  themedNodes.ts – v8-native, supports solid OR dashed ring
    --------------------------------------------------------- */
import { Container, Graphics, Texture, Sprite } from "pixi.js";
import { GlowFilter } from "@pixi/filter-glow";

/* ---------- 1. Theme type ---------- */
export interface NodeTheme {
  rim: number;
  ring: number;
  glow: number;
  stops: Array<[number, string]>;
  ringStyle?: "solid" | "dash";
  dashCount?: number; // only for dashed style
  ringWidth?: number; // custom ring width
}

/* ---------- 2. Palettes ---------- */
export const burntOrange: NodeTheme = {
  rim: 0x2b1c05,
  ring: 0xd37b1f, // solid burnt-orange stroke
  glow: 0xffa64d,
  ringStyle: "solid",
  stops: [
    [0.0, "rgba(255,255,255,1.00)"], // pinpoint highlight
    [0.22, "rgba(255,235,155,0.97)"], // pale amber
    [0.45, "rgba(255,171, 60,0.94)"], // bright orange
    [0.7, "rgba(234,138, 42,0.91)"], // mid orange
    [0.88, "rgba(185, 95, 24,0.88)"], // **dark basin**
    [1.0, "rgba(147, 66, 15,0.85)"], // edge under ring
  ],
};

export const brightAqua: NodeTheme = {
  rim: 0x00252e,
  ring: 0xd4b44c, // warm gold dash ring
  glow: 0x00e4ff,
  ringStyle: "dash",
  dashCount: 28,
  /* new multi-stop gradient: white → light-cyan → mid-aqua → DARK-teal */
  stops: [
    [0.0, "rgba(255,255,255,1.00)"], // tiny hotspot
    [0.1, "rgba(180,255,255,0.95)"], // pale halo
    [0.25, "rgba(  0,225,255,0.94)"], // bright aqua
    [0.55, "rgba(  0,165,205,0.90)"], // mid aqua
    [0.78, "rgba(  0,100,140,0.88)"], // **darker basin**
    [1.0, "rgba(  0, 70, 95,0.82)"], // edge (matches fake)
  ],
};

export const deepTeal: NodeTheme = {
  /* very dark rim so the ring pops */
  rim: 0x0e1116,

  /* NEW ring: solid steel-grey, much thicker */
  ring: 0x4b5664, // hex: #4b5664
  ringStyle: "solid",
  ringWidth: 10, // ← you’ll add this param in step 2

  /* desaturated petrol glow */
  glow: 0x063b52,

  /* pronounced dark gradient */
  stops: [
    [0.0, "rgba(240,245,250,0.95)"], // faint hotspot
    [0.15, "rgba( 40,150,180,0.92)"], // teal
    [0.35, "rgba( 22,105,135,0.90)"], // mid-teal
    [0.6, "rgba( 11, 66, 90,0.88)"], // dark teal basin
    [0.85, "rgba(  6, 38, 52,0.86)"], // deep navy
    [1.0, "rgba(  4, 26, 36,0.83)"], // edge under ring
  ],
};

/* ---------- 3. Gradient-texture cache ---------- */
const gradCache = new Map<string, Texture>();
function gradTex(r: number, th: NodeTheme): Texture {
  const key = `${r}-${th.ring.toString(16)}`;
  if (gradCache.has(key)) return gradCache.get(key)!;

  const d = r * 2;
  const cv = Object.assign(document.createElement("canvas"), {
    width: d,
    height: d,
  });
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  th.stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();

  const tex = Texture.from(cv);
  tex.baseTexture.scaleMode = "linear";
  gradCache.set(key, tex);
  return tex;
}

/* ---------- 4. Helper: draw ring (solid or dashed) ---------- */
function addRing(container: Container, radius: number, th: NodeTheme): void {
  const g = new Graphics();
  const ringWidth = th.ringWidth ?? (th.ringStyle === "dash" ? 4 : 8);

  if (th.ringStyle === "dash") {
    const dashes = th.dashCount ?? 24;
    const dashAngle = (2 * Math.PI) / dashes;
    const arcLen = dashAngle * 0.55; // 55 % filled, 45 % gap
    for (let i = 0; i < dashes; i++) {
      const start = i * dashAngle;
      g.arc(0, 0, radius, start, start + arcLen);
    }
    g.stroke({ width: ringWidth, color: th.ring });
  } else {
    g.circle(0, 0, radius).stroke({ width: ringWidth, color: th.ring });
  }
  container.addChild(g);
}

/* ---------- 5. Node factory ---------- */
export function makeThemedNode(
  x: number,
  y: number,
  radius: number,
  theme: NodeTheme,
): Container {
  const c = new Container();
  c.position.set(x, y);

  /* dark rim */
  c.addChild(
    new Graphics()
      .circle(0, 0, radius + 4)
      .stroke({ width: 3, color: theme.rim }),
  );

  /* ring (solid or dashed) */
  addRing(c, radius, theme);

  /* gradient core + glow */
  const core = new Sprite(gradTex(radius * 0.8, theme));
  core.anchor.set(0.5);
  core.filters = [
    new GlowFilter({ distance: 12, outerStrength: 2.4, color: theme.glow }),
  ];
  c.addChild(core);

  /* highlight speck */
  c.addChild(
    new Graphics()
      .circle(-radius * 0.2, -radius * 0.2, radius * 0.18)
      .fill({ color: 0xffffff, alpha: 0.35 }),
  );

  return c;
}
