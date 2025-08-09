// src/UINode.tsx
import {
  Application,
  Assets,
  Container,
  Graphics,
  NineSliceSprite,
  Text,
  Texture,
  Sprite,
} from "pixi.js";
import "pixi.js/sprite-nine-slice";
import { makeThemedNode } from "./node_drawer";
import { NodeStatus, statusToTheme } from "./nodeTypes";

/* ───────────────────────── Types & constants ───────────────────────── */

type Objective = { id: string; text: string; done: boolean };

const NODE_STORE_PREFIX = "tol.node.v1.";
const NODE_LIST_KEY = "tol_nodes_v1"; // from main.tsx store

// Frame & icons
const PANEL_FRAME_URL = "/assets/ui/quest_frame.png";
const LEVEL_ICON_BASE = "/assets/ui/level_"; // + 1..5 + "_icon.png"

// Source PNG is 1024×1024; these are PRESERVED edge thicknesses (not coordinates).
const SLICE_LEFT = 72;
const SLICE_TOP = 118;
const SLICE_RIGHT = 77;   // 1024 - 947
const SLICE_BOTTOM = 126; // 1024 - 898

// Smaller, “cut middle more” layout
const MIN_WIDTH = 220;
const MAX_WIDTH = 320;
const MIN_HEIGHT = 120;

// Safe insets so content never touches ornaments
const SAFE_LEFT   = SLICE_LEFT + 12;
const SAFE_RIGHT  = SLICE_RIGHT + 12;
const SAFE_TOP    = SLICE_TOP + 14;
const SAFE_BOTTOM = SLICE_BOTTOM + 40; // leaves room for the OK button

const LINE_STYLE = {
  fill: 0xf1f1f1,
  fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif",
  fontSize: 13,
  wordWrap: true,
  wordWrapWidth: 260,
  lineHeight: 18,
  align: "center" as const, // center each wrapped paragraph
};

const LINE_STYLE_DONE = {
  ...LINE_STYLE,
  fill: 0x7cff7c,
  dropShadow: true,
  dropShadowColor: 0x000000,
  dropShadowDistance: 1,
  dropShadowAlpha: 0.6,
  dropShadowBlur: 0,
};

/* ───────────────────── helpers ───────────────────── */

function defaultNodeId(x: number, y: number) {
  return `N_${Math.round(x)}_${Math.round(y)}`;
}

let _frameTex: Texture | null = null;
async function getFrameTexture(): Promise<Texture> {
  if (_frameTex) return _frameTex;
  _frameTex = await Assets.load(PANEL_FRAME_URL);
  return _frameTex!;
}

// cache for level icons
let _levelIconTex: Texture[] | null = null;
async function getLevelIconTextures(): Promise<Texture[]> {
  if (_levelIconTex) return _levelIconTex;
  const paths = [1, 2, 3, 4, 5].map(i => `${LEVEL_ICON_BASE}${i}_icon.png`);
  const tex = await Promise.all(paths.map(p => Assets.load(p)));
  _levelIconTex = tex;
  return _levelIconTex!;
}

// small OK button
function makeOkButtonTexture(app: Application): Texture {
  const g = new Graphics();
  const w = 62, h = 22;
  g.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(0, 0, w, h).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
  return app.renderer.generateTexture(g, { scaleMode: "linear" });
}

// difficulty buckets (you asked for: 1–6, 7–14, 15–21, 21–28, 28–33).
// To avoid overlap we place 28 in the top tier:
// 1–6, 7–14, 15–21, 22–27, 28–33.
function difficultyToLevel(d: number): number {
  const v = Math.max(0, Math.min(33, Math.round(d)));
  if (v <= 6) return 1;
  if (v <= 14) return 2;
  if (v <= 21) return 3;
  if (v <= 27) return 4;
  return 5; // 28–33
}

// color helpers (same gradient as before, looks good on your palette)
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpColor(c1: number, c2: number, t: number) {
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return (r << 16) | (g << 8) | b;
}
function difficultyColor(d: number): number {
  const stops = [
    { x: 0,  c: 0xEDEDED },
    { x: 8,  c: 0x52F7B4 },
    { x: 17, c: 0xFFC766 },
    { x: 25, c: 0xFF6F6F },
    { x: 33, c: 0xB892FF },
  ];
  const x = Math.max(0, Math.min(33, d));
  let i = 0;
  while (i < stops.length - 1 && x > stops[i + 1].x) i++;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  const span = Math.max(1, b.x - a.x);
  const t = Math.max(0, Math.min(1, (x - a.x) / span));
  return lerpColor(a.c, b.c, t);
}

/* ───────────────────── Panel (NineSlice) ───────────────────── */

class NodePanel extends Container {
  private app: Application;
  private frame: NineSliceSprite;
  private list: Container;
  private okPatch: NineSliceSprite;
  private okText: Text;
  private maskG: Graphics;

  private objectives: Objective[];
  private onToggle: (id: string) => void;
  private onClose: () => void;

  constructor(args: {
    app: Application;
    frameTexture: Texture;
    objectives: Objective[];
    onToggle: (id: string) => void;
    onClose: () => void;
    targetWidth?: number;
  }) {
    super();
    this.app = args.app;
    this.objectives = args.objectives;
    this.onToggle = args.onToggle;
    this.onClose = args.onClose;

    this.sortableChildren = true;
    (this as any).eventMode = "static"; // eat clicks behind panel

    // Frame (small; middle is “cut”, corners preserved)
    this.frame = new NineSliceSprite({
      texture: args.frameTexture,
      leftWidth: SLICE_LEFT,
      topHeight: SLICE_TOP,
      rightWidth: SLICE_RIGHT,
      bottomHeight: SLICE_BOTTOM,
      width: Math.max(MIN_WIDTH, Math.min(args.targetWidth ?? 240, MAX_WIDTH)),
      height: MIN_HEIGHT,
    });
    this.addChild(this.frame);

    // Objectives container
    this.list = new Container();
    this.addChild(this.list);

    // OK button (smaller)
    const okTex = makeOkButtonTexture(this.app);
    this.okPatch = new NineSliceSprite({
      texture: okTex,
      leftWidth: 6, topHeight: 6, rightWidth: 6, bottomHeight: 6,
      width: 62, height: 22,
    });
    (this.okPatch as any).eventMode = "static";
    (this.okPatch as any).cursor = "pointer";
    (this.okPatch as any).on?.("pointertap", () => this.onClose());
    this.addChild(this.okPatch);

    this.okText = new Text({
      text: "OK",
      style: {
        fill: 0xffffff,
        fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "600",
      },
    });
    this.addChild(this.okText);

    // Mask for wipe
    this.maskG = new Graphics();
    this.addChild(this.maskG);
    this.mask = this.maskG;

    this.relayout();
  }

  /** Lay everything out; objectives centered in the safe area. */
  relayout() {
    this.list.removeChildren();

    const safeW = Math.max(MIN_WIDTH, Math.min(this.frame.width, MAX_WIDTH)) - (SAFE_LEFT + SAFE_RIGHT);
    const safeH = Math.max(MIN_HEIGHT, this.frame.height) - (SAFE_TOP + SAFE_BOTTOM);

    // First measure rows to compute total height
    const rows: Text[] = [];
    let total = 0;
    for (const obj of this.objectives) {
      const t = new Text({
        text: obj.text,
        style: { ...(obj.done ? LINE_STYLE_DONE : LINE_STYLE), wordWrapWidth: safeW, align: "center" },
      });
      rows.push(t);
      total += t.height + 4;
    }
    if (rows.length) total -= 4; // no gap after last

    // Start y so that the whole block is centered within safe content area
    let y = SAFE_TOP + Math.max(0, Math.round((safeH - total) / 2));

    // Place rows centered horizontally
    for (const t of rows) {
      const x = SAFE_LEFT + Math.round((safeW - t.width) / 2);
      t.position.set(x, y);
      (t as any).eventMode = "static";
      (t as any).cursor = "pointer";
      const id = this.objectives[rows.indexOf(t)].id;
      (t as any).on?.("pointertap", () => this.onToggle(id));
      this.list.addChild(t);
      y += t.height + 4;
    }

    // Compute desired panel size (keep it tight)
    const okH = this.okPatch.height;
    const desiredW = Math.max(MIN_WIDTH, Math.min(safeW + SAFE_LEFT + SAFE_RIGHT, MAX_WIDTH));
    const desiredH = Math.max(MIN_HEIGHT, SAFE_TOP + Math.max(total, 40) + SAFE_BOTTOM);

    this.frame.width = desiredW;
    this.frame.height = desiredH;

    // OK bottom-center inside the safe box
    this.okPatch.position.set(
      Math.round((this.frame.width - this.okPatch.width) / 2),
      Math.round(this.frame.height - SAFE_BOTTOM - this.okPatch.height),
    );
    this.okText.position.set(
      Math.round(this.okPatch.x + (this.okPatch.width - this.okText.width) / 2),
      Math.round(this.okPatch.y + (this.okPatch.height - this.okText.height) / 2 + 0.5),
    );

    // Reset mask rectangle (0 height at bottom)
    this.maskG.clear().rect(0, this.frame.height, this.frame.width, 0).fill(0xffffff);
  }

  public setObjectives(objs: Objective[]) {
    this.objectives = objs;
    this.relayout();
  }

  /** bottom→top wipe; clean mask at the end */
  public async playOpenAnim(): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 200;
      const H = this.frame.height;
      this.alpha = 0.92;
      this.scale.set(0.985);

      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        const shown = H * e;
        this.maskG.clear().rect(0, H - shown, this.frame.width, shown).fill(0xffffff);
        this.alpha = 0.92 + 0.08 * e;
        const s = 0.985 + 0.015 * e; this.scale.set(s);

        if (k < 1) requestAnimationFrame(tick);
        else {
          this.mask = null;
          this.removeChild(this.maskG);
          this.maskG.destroy();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

/* ───────────────────────── Drag key handling ───────────────────────── */

let DRAG_KEY_DOWN = false;
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "e") DRAG_KEY_DOWN = true;
});
window.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "e") DRAG_KEY_DOWN = false;
});

/* ───────────────────────── UINode ───────────────────────── */

export class UINode {
  readonly id: string;
  x: number;
  y: number;

  status: NodeStatus;
  readonly container: Container;
  neighbours: UINode[] = [];

  private _visual: Container;
  private objectives: Objective[] = [];
  private title = "";
  private difficulty = 0;

  // external refs
  private app?: Application;
  private tree?: Container;
  private uiLayer?: Container;

  private panel?: NodePanel;

  // connector (no pulse; grows once)
  private connector?: Graphics;

  // hover tooltip
  private tooltip?: Container;

  // drag state
  private dragging = false;
  private dragOffset = { dx: 0, dy: 0 };

  constructor(x: number, y: number, status: NodeStatus, id?: string) {
    this.id = id ?? defaultNodeId(x, y);
    this.x = x;
    this.y = y;
    this.status = status;

    this.container = new Container();
    this._visual = makeThemedNode(x, y, 48, statusToTheme[this.status]);
    this.container.addChild(this._visual);

    this.loadState();

    (this.container as any).eventMode = "static";
    (this.container as any).cursor = "pointer";
    // open panel on tap/click when NOT dragging
    (this.container as any).on?.("pointertap", () => {
      if (!this.dragging) this.openPanel();
    });

    // pointer for drag
    (this.container as any).on?.("pointerdown", (ev: any) => this.onPointerDown(ev));
  }

  enableObjectivesUI(app: Application, treeContainer: Container, uiLayer: Container) {
    this.app = app;
    this.tree = treeContainer;
    this.uiLayer = uiLayer;

    // hover tooltip
    (this.container as any).on?.("pointerover", () => this.showTooltip());
    (this.container as any).on?.("pointerout", () => this.hideTooltip());
  }

  /* ───────── persistence ───────── */
  private key() { return `${NODE_STORE_PREFIX}${this.id}`; }

  private loadState() {
    try {
      const raw = localStorage.getItem(this.key());
      if (!raw) return;
      const data = JSON.parse(raw) as {
        status?: NodeStatus;
        objectives?: Objective[];
        title?: string;
        difficulty?: number;
      };
      if (data.status !== undefined) this.status = data.status;
      if (Array.isArray(data.objectives)) this.objectives = data.objectives;
      if (typeof data.title === "string") this.title = data.title;
      if (typeof data.difficulty === "number") this.difficulty = data.difficulty;
      this.refreshVisual();
    } catch {}
  }

  private saveState() {
    localStorage.setItem(this.key(), JSON.stringify({
      status: this.status,
      objectives: this.objectives,
      title: this.title,
      difficulty: this.difficulty,
    }));
  }

  // also persist x/y into tol_nodes_v1 (so reload keeps the new position)
  private persistXY() {
    try {
      const raw = localStorage.getItem(NODE_LIST_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as Array<{ id: string; x: number; y: number; status: number }>;
      const row = list.find(r => r.id === this.id);
      if (row) {
        row.x = this.x;
        row.y = this.y;
        localStorage.setItem(NODE_LIST_KEY, JSON.stringify(list));
      }
    } catch {}
  }

  public applyMeta(meta: { title?: string; difficulty?: number; objectives?: string[] }) {
    if (meta.title) this.title = meta.title;
    if (typeof meta.difficulty === "number")
      this.difficulty = Math.max(0, Math.min(33, Math.round(meta.difficulty)));
    if (meta.objectives) {
      this.objectives = meta.objectives
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => ({ id: Math.random().toString(36).slice(2), text: t, done: false }));
    }
    this.saveState();
  }

  private refreshVisual() {
    try {
      this.container.removeChild(this._visual);
      (this._visual as any).destroy?.({ children: true });
    } catch {}
    this._visual = makeThemedNode(this.x, this.y, 48, statusToTheme[this.status]);
    this.container.addChild(this._visual);
  }

  private recomputeStatusFromObjectives() {
    if (this.objectives.length > 0 && this.objectives.every((o) => o.done)) {
      if (this.status !== NodeStatus.Learned) {
        this.status = NodeStatus.Learned;
        this.refreshVisual();
      }
    } else if (this.status === NodeStatus.Locked) {
      this.status = NodeStatus.Available;
      this.refreshVisual();
    }
    this.saveState();
  }

  /* ───────── Tooltip (title + difficulty) ───────── */
  private async showTooltip() {
    if (!this.app || !this.uiLayer || !this.tree) return;
    if (this.tooltip) return;

    const level = difficultyToLevel(this.difficulty);
    const color = difficultyColor(this.difficulty);
    const icons = await getLevelIconTextures();

    const titleText = new Text({
      text: `${this.title || "Untitled"}  •  `,
      style: { fill: 0xffffff, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12 },
    });
    const diffNumber = new Text({
      text: `${this.difficulty}`,
      style: { fill: color, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12, fontWeight: "700" },
    });
    const of33 = new Text({
      text: "/33  ",
      style: { fill: color, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12, fontWeight: "700" },
    });

    // Single level icon, ~20% bigger
    const icon = new Sprite(icons[Math.max(0, Math.min(4, level - 1))]);
    const iconH = 12 * 1.2;
    const s = iconH / icon.height;
    icon.scale.set(s);
    icon.position.set(0, -1);

    // Compose row
    const pad = 8;
    const row = new Container();
    row.addChild(titleText);
    diffNumber.position.set(titleText.width, 0); row.addChild(diffNumber);
    of33.position.set(titleText.width + diffNumber.width, 0); row.addChild(of33);
    icon.position.set(titleText.width + diffNumber.width + of33.width + 4, -1);
    row.addChild(icon);

    const bg = new Graphics();
    bg.roundRect(0, 0, row.width + pad * 2, Math.max(row.height, iconH) + pad * 2, 6)
      .fill({ color: 0x000000, alpha: 0.72 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });

    const c = new Container();
    c.addChild(bg, row);
    row.position.set(pad, pad);

    this.tooltip = c;
    this.tooltip.zIndex = 10_001;
    this.uiLayer.addChild(this.tooltip);

    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });
    // centered above node
    c.position.set(Math.round(gx - (c.width / 2)), Math.round(gy - c.height - 14));
  }

  private hideTooltip() {
    if (!this.tooltip || !this.uiLayer) return;
    this.uiLayer.removeChild(this.tooltip);
    this.tooltip.destroy();
    this.tooltip = undefined;
  }

  /* ───────── open/close panel ───────── */
  public async openPanel() {
    if (!this.app || !this.tree || !this.uiLayer) return;
    this.closePanel();

    const frameTexture = await getFrameTexture();

    this.panel = new NodePanel({
      app: this.app,
      frameTexture,
      objectives: this.objectives.slice(),
      onToggle: (objId) => {
        const o = this.objectives.find((x) => x.id === objId);
        if (!o) return;
        o.done = !o.done;
        this.saveState();
        this.recomputeStatusFromObjectives();
        this.panel?.setObjectives(this.objectives.slice());
      },
      onClose: () => this.closePanel(),
      targetWidth: 240, // small frame
    });

    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });

    // Place panel 20px BELOW the node, horizontally centered
    const panelW = this.panel.width, panelH = this.panel.height, m = 8;
    let px = Math.round(gx - panelW / 2);
    let py = Math.round(gy + 20);
    const { width: W, height: H } = this.app.screen;
    px = Math.max(m, Math.min(px, W - panelW - m));
    py = Math.max(m, Math.min(py, H - panelH - m));
    this.panel.position.set(px, py);

    this.panel.zIndex = 10_000;
    this.uiLayer.addChild(this.panel);
    await this.panel.playOpenAnim();

    // connector (node → panel top-center), no pulse
    if (this.connector) { this.uiLayer.removeChild(this.connector); this.connector.destroy(); }
    this.connector = new Graphics();
    this.uiLayer.addChild(this.connector);

    const start = { x: gx, y: gy + 6 };
    const end = { x: px + panelW / 2, y: py };
    const dx = end.x - start.x, dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    const nx = dx / dist, ny = dy / dist;

    const t0 = performance.now(), growDur = 200;

    const drawBaseTo = (len: number) => {
      const x2 = start.x + nx * len;
      const y2 = start.y + ny * len;
      this.connector!.clear();
      // soft shadow + darker blonde core
      this.connector!
        .moveTo(start.x, start.y).lineTo(x2, y2)
        .stroke({ color: 0x121007, width: 6, alpha: 0.18 });
      this.connector!
        .moveTo(start.x, start.y).lineTo(x2, y2)
        .stroke({ color: 0xC6A24A, width: 2.6, alpha: 1.0 });
    };

    const growTick = (t: number) => {
      const k = Math.min(1, (t - t0) / growDur);
      const e = 1 - Math.pow(1 - k, 3);
      drawBaseTo(dist * e);
      if (k < 1) requestAnimationFrame(growTick);
    };
    requestAnimationFrame(growTick);
  }

  public closePanel() {
    if (this.connector && this.uiLayer) {
      this.uiLayer.removeChild(this.connector);
      this.connector.destroy();
      this.connector = undefined;
    }
    if (this.panel && this.uiLayer) {
      this.uiLayer.removeChild(this.panel);
      (this.panel as any).destroy?.({ children: true });
      this.panel = undefined;
    }
  }

  /* ───────── Drag (hold 'e' to drag & drop) ───────── */
  private onPointerDown(ev: any) {
    if (!this.app || !this.tree) return;
    if (!DRAG_KEY_DOWN) return; // only when holding 'e'
    this.dragging = true;
    (this.container as any).cursor = "grabbing";
    ev.stopPropagation?.();

    const gp = ev.global as { x: number; y: number };
    const s = this.tree.scale.x;
    const designX = (gp.x - this.tree.position.x) / s;
    const designY = (gp.y - this.tree.position.y) / s;

    this.dragOffset.dx = designX - this.x;
    this.dragOffset.dy = designY - this.y;

    const onMove = (e: any) => {
      if (!this.dragging) return;
      const g = e.global as { x: number; y: number };
      const nx = (g.x - this.tree!.position.x) / s - this.dragOffset.dx;
      const ny = (g.y - this.tree!.position.y) / s - this.dragOffset.dy;
      this.x = nx;
      this.y = ny;
      this.refreshVisual();
    };

    const onUp = () => {
      this.dragging = false;
      (this.container as any).cursor = "pointer";
      this.persistXY();
      this.app!.stage.off("pointermove", onMove);
      this.app!.stage.off("pointerup", onUp);
      this.app!.stage.off("pointerupoutside", onUp);
    };

    this.app.stage.on("pointermove", onMove);
    this.app.stage.on("pointerup", onUp);
    this.app.stage.on("pointerupoutside", onUp);
  }
}
