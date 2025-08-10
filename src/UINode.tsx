// src/UINode.tsx
import {
  Application,
  Assets,
  Container,
  Graphics,
  Text,
  Texture,
  Sprite,
} from "pixi.js";
import { makeThemedNode } from "./node_drawer";
import { NodeStatus, statusToTheme } from "./nodeTypes";

/* ───────────────────────── Types & constants ───────────────────────── */
type Objective = { id: string; text: string; done: boolean };


const NODE_STORE_PREFIX = "tol.node.v1.";
const NODE_LIST_KEY = "tol_nodes_v1";

const LEVEL_ICON_BASE = "/assets/ui/level_"; // + 1..5 + "_icon.png"

const PAD = 8;
const RADIUS = 6;
const LIST_WIDTH = 280;

const LINE_STYLE = {
  fill: 0xf1f1f1,
  fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif",
  fontSize: 13,
  wordWrap: true,
  breakWords: true,
  wordWrapWidth: LIST_WIDTH,
  lineHeight: 18,
  align: "left" as const,
};

const log = (...a: any[]) =>
  console.log(`[UINode ${new Date().toLocaleTimeString()}]`, ...a);

/* ───────────────────── helpers ───────────────────── */
function defaultNodeId(x: number, y: number) {
  return `N_${Math.round(x)}_${Math.round(y)}`;
}

let _levelIconTex: Texture[] | null = null;
async function getLevelIconTextures(): Promise<Texture[]> {
  if (_levelIconTex) return _levelIconTex;
  const paths = [1, 2, 3, 4, 5].map((i) => `${LEVEL_ICON_BASE}${i}_icon.png`);
  const tex = await Promise.all(paths.map((p) => Assets.load(p)));
  _levelIconTex = tex;
  return _levelIconTex!;
}

function difficultyToLevel(d: number): number {
  const v = Math.max(0, Math.min(33, Math.round(d)));
  if (v <= 6) return 1;
  if (v <= 14) return 2;
  if (v <= 21) return 3;
  if (v <= 27) return 4;
  return 5;
}
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

/* ───────────────────── header builder ───────────────────── */
async function buildHeaderRow(
  title: string,
  difficulty: number,
  opts?: { align?: "left" | "center"; iconPx?: number },
): Promise<Container> {
  const level = difficultyToLevel(difficulty);
  const color = difficultyColor(difficulty);
  const icons = await getLevelIconTextures();

  const titleText = new Text({
    text: `${title || "Untitled"}  •  `,
    style: { fill: 0xffffff, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12 },
  });
  const diffNumber = new Text({
    text: `${difficulty}`,
    style: { fill: color, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12, fontWeight: "700" },
  });
  const of33 = new Text({
    text: "/33  ",
    style: { fill: color, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12, fontWeight: "700" },
  });

  const icon = new Sprite(icons[Math.max(0, Math.min(4, level - 1))]);
  const iconH = Math.max(12, opts?.iconPx ?? 14);
  const s = iconH / icon.height;
  icon.scale.set(s);
  icon.position.set(0, -1);

  const row = new Container();
  row.addChild(titleText);
  diffNumber.position.set(titleText.width, 0); row.addChild(diffNumber);
  of33.position.set(titleText.width + diffNumber.width, 0); row.addChild(of33);
  icon.position.set(titleText.width + diffNumber.width + of33.width + 4, -1); row.addChild(icon);

  (row as any)._align = opts?.align ?? "left";
  return row;
}

class BubblePanel extends Container {
  private bg = new Graphics();
  private header = new Container();
  private list = new Container();
  private okPatch = new Graphics();
  private okText = new Text({
    text: "OK",
    style: { fill: 0xffffff, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12, fontWeight: "600" },
  });

  private title: string;
  private objectives: Objective[];
  private onToggle: (id: string) => void;
  private onClose: () => void;
  private difficulty: number;
  private fixedInnerW?: number;

  constructor(args: {
    title: string;
    difficulty: number;
    objectives: Objective[];
    onToggle: (id: string) => void;
    onClose: () => void;
  }) {
    super();
    this.title = args.title;
    this.objectives = args.objectives;
    this.onToggle = args.onToggle;
    this.onClose = args.onClose;
    this.difficulty = args.difficulty;

    this.sortableChildren = true;
    (this as any).eventMode = "static";

    this.addChild(this.bg, this.header, this.list, this.okPatch, this.okText);
    (this.okPatch as any).eventMode = "static";
    (this.okPatch as any).cursor = "pointer";
    (this.okPatch as any).on?.("pointertap", () => this.onClose());
    (this.okText as any).eventMode = "static";
    (this.okText as any).cursor = "pointer";
    (this.okText as any).on?.("pointertap", () => this.onClose());

    void this.build();
  }
  
  private makeCheckbox(done: boolean) {
    const g = new Graphics();
    g.roundRect(0, 0, 14, 14, 3)
      .fill({ color: done ? 0x2ad06f : 0x000000, alpha: done ? 0.9 : 0.4 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
    if (done) {
      g.moveTo(3, 7).lineTo(6, 10).lineTo(11, 4).stroke({ color: 0x0a0, width: 2, alpha: 0.9 });
      g.moveTo(3, 7).lineTo(6, 10).lineTo(11, 4).stroke({ color: 0xffffff, width: 1, alpha: 0.9 });
    }
    (g as any).eventMode = "static";
    (g as any).cursor = "pointer";
    return g;
  }

  private async build() {
    this.header.removeChildren();
    const headerRow = await buildHeaderRow(this.title, this.difficulty, { align: "center", iconPx: 20 });
    this.header.addChild(headerRow);

    this.list.removeChildren();
    let y = headerRow.height + 10;
    let maxRow = LIST_WIDTH;

    for (const obj of this.objectives) {
      const row = new Container();
      const box = this.makeCheckbox(obj.done);
      row.addChild(box);
      const t = new Text({ text: obj.text, style: LINE_STYLE });
      t.position.set(18, -2);
      row.addChild(t);
      (box as any).on?.("pointertap", () => this.onToggle(obj.id));
      row.position.set(PAD, PAD + y);
      this.list.addChild(row);
      y += Math.max(16, t.height) + 6;
      maxRow = Math.max(maxRow, 18 + t.width);
    }

    const measuredInnerW = Math.max(headerRow.width, Math.max(LIST_WIDTH, maxRow));
    if (this.fixedInnerW == null) this.fixedInnerW = measuredInnerW;

    const contentW = this.fixedInnerW;
    const contentH = Math.max(headerRow.height, 14) + 10 + y;
    const totalW = contentW + PAD * 2;
    const totalH = contentH + PAD * 2 + 30;

    this.header.position.set(PAD + Math.round((contentW - headerRow.width) / 2), PAD);
    this.bg
      .clear()
      .roundRect(0, 0, totalW, totalH, RADIUS)
      .fill({ color: 0x000000, alpha: 0.72 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });

    const bw = 62, bh = 22;
    const bx = Math.round((totalW - bw) / 2);
    const by = Math.round(totalH - PAD - bh);
    this.okPatch
      .clear()
      .roundRect(bx, by, bw, bh, 6)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
    this.okText.position.set(
      Math.round(bx + (bw - this.okText.width) / 2),
      Math.round(by + (bh - this.okText.height) / 2 + 0.5),
    );
  }
  public dispose() {
    // remove tooltip & panel if they exist
    this.closePanel();
    if (this.tooltip && this.uiLayer) {
      this.uiLayer.removeChild(this.tooltip);
      this.tooltip.destroy();
      this.tooltip = undefined;
    }
  }
  public setObjectives(objs: Objective[]) {
    this.objectives = objs;
    void this.build();
  }
}

/* ───────── Keys for drag (E) only ───────── */
let DRAG_KEY_DOWN = false;
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "e") { DRAG_KEY_DOWN = true; log("keydown E (drag)"); }
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "e") { DRAG_KEY_DOWN = false; log("keyup E"); }
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

  private app?: Application;
  private tree?: Container;
  private uiLayer?: Container;

  private panel?: BubblePanel;
  private tooltip?: Container;

  private dragging = false;
  private dragOffset = { dx: 0, dy: 0 };
  private dragStart = { x: 0, y: 0 };
  private didDrag = false;
  private suppressTapUntil = 0;

  private onMoveCb?: (id: string, x: number, y: number) => void;
  private onDropCb?: (id: string, x: number, y: number) => void;
  private onClickCb?: (id: string) => boolean | void; // NEW: allow main to consume taps

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

    (this.container as any).on?.("pointertap", () => {
      if (this.dragging) return;
      if (performance.now() < this.suppressTapUntil) return;

      // If main consumes the click (edge mode), don't open the panel.
      const consumed = this.onClickCb?.(this.id);
      if (consumed) return;

      this.openPanel();
    });

    (this.container as any).on?.("pointerdown", (ev: any) =>
      this.onPointerDown(ev),
    );
  }

  enableObjectivesUI(
    app: Application,
    treeContainer: Container,
    uiLayer: Container,
    opts?: {
      onMove?: (id: string, x: number, y: number) => void;
      onDrop?: (id: string, x: number, y: number) => void;
      onClick?: (id: string) => boolean | void; // NEW
    },
  ) {
    this.app = app;
    this.tree = treeContainer;
    this.uiLayer = uiLayer;
    this.onMoveCb = opts?.onMove;
    this.onDropCb = opts?.onDrop;
    this.onClickCb = opts?.onClick;

    (this.container as any).on?.("pointerover", () => this.showTooltip());
    (this.container as any).on?.("pointerout", () => this.hideTooltip());
  }

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

  private persistXY() {
    try {
      const raw = localStorage.getItem(NODE_LIST_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as Array<{ id: string; x: number; y: number; status: number }>;
      const row = list.find(r => r.id === this.id);
      if (row) {
        row.x = this.x; row.y = this.y;
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
      // @ts-ignore
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

  private async showTooltip() {
    if (!this.app || !this.uiLayer || !this.tree) return;
    if (this.tooltip) return;

    const headerRow = await buildHeaderRow(this.title, this.difficulty, { align: "left", iconPx: 14 });

    const w = headerRow.width + PAD * 2;
    const h = Math.max(headerRow.height, 14) + PAD * 2;

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, RADIUS)
      .fill({ color: 0x000000, alpha: 0.72 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });

    const c = new Container();
    c.addChild(bg, headerRow);
    headerRow.position.set(PAD, PAD);

    this.tooltip = c;
    this.tooltip.zIndex = 10_001;
    this.uiLayer.addChild(this.tooltip);

    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });
    c.position.set(Math.round(gx - w / 2), Math.round(gy - h - 14));
  }

  private hideTooltip() {
    if (!this.tooltip || !this.uiLayer) return;
    this.uiLayer.removeChild(this.tooltip);
    this.tooltip.destroy();
    this.tooltip = undefined;
  }

  public async openPanel() {
    if (!this.app || !this.tree || !this.uiLayer) return;
    this.closePanel();

    const panel = new BubblePanel({
      title: this.title,
      difficulty: this.difficulty,
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
    });

    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });
    const px = Math.round(gx - panel.width / 2);
    const py = Math.round(gy + 20);

    this.panel = panel;
    this.panel.zIndex = 10_000;
    this.uiLayer.addChild(this.panel);
    this.panel.position.set(px, py);
  }

  public closePanel() {
    if (this.panel && this.uiLayer) {
      this.uiLayer.removeChild(this.panel);
      // @ts-ignore
      this.panel.destroy?.({ children: true });
      this.panel = undefined;
    }
  }

  private onPointerDown(ev: any) {
    if (!this.app || !this.tree) return;

    // ── Drag (E) ──────────────────────────────────────────────
    if (!DRAG_KEY_DOWN) return;
    log("pointerdown on node WITH E (drag start)", this.id);

    this.closePanel();
    this.hideTooltip();

    this.dragging = true;
    this.didDrag = false;
    (this.container as any).cursor = "grabbing";
    ev.stopPropagation?.();

    const gp = ev.global as { x: number; y: number };
    const s = this.tree.scale.x;
    const designX = (gp.x - this.tree.position.x) / s;
    const designY = (gp.y - this.tree.position.y) / s;
    this.dragOffset.dx = designX - this.x;
    this.dragOffset.dy = designY - this.y;
    this.dragStart.x = this.x;
    this.dragStart.y = this.y;

    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const rect = this.app!.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const nx = (sx - this.tree!.position.x) / s - this.dragOffset.dx;
      const ny = (sy - this.tree!.position.y) / s - this.dragOffset.dy;

      if (Math.hypot(nx - this.dragStart.x, ny - this.dragStart.y) > 1.5) {
        this.didDrag = true;
      }

      this.x = nx;
      this.y = ny;
      this.refreshVisual();
      this.onMoveCb?.(this.id, this.x, this.y);
    };

    const finishDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      (this.container as any).cursor = "pointer";
      this.persistXY();
      this.onDropCb?.(this.id, this.x, this.y);

      this.suppressTapUntil = performance.now() + 150;
      this.didDrag = false;

      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keyup", keyUp);
      log("drag finished", this.id, { x: this.x, y: this.y });
    };

    const up = () => finishDrag();
    const keyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e") finishDrag();
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("keyup", keyUp, { passive: true });
  }
}
