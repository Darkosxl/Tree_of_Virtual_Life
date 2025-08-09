// src/UINode.tsx
import {
  Application, Assets, Container, Graphics, NineSlicePlane, Text, Texture,
} from "pixi.js";
import { makeThemedNode } from "./node_drawer";
import { NodeStatus, statusToTheme } from "./nodeTypes";

type Objective = { id: string; text: string; done: boolean };

const NODE_STORE_PREFIX = "tol.node.v1.";
const PANEL_FRAME_URL = "/assets/ui/quest_frame.png";

// PNG is 1024x1024. These are preserved border thicknesses (not coordinates).
const SLICE_LEFT = 72;
const SLICE_TOP = 118;
const SLICE_RIGHT = 77;   // 1024 - 947
const SLICE_BOTTOM = 126; // 1024 - 898

const PAD_LEFT = 28, PAD_RIGHT = 28, PAD_TOP = 22, PAD_BOTTOM = 22;
const MIN_WIDTH = 360, MAX_WIDTH = 720, MIN_HEIGHT = 200;

const LINE_STYLE = {
  fill: 0xf1f1f1,
  fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif",
  fontSize: 13.5,
  wordWrap: true,
  wordWrapWidth: 400,
  lineHeight: 20,
} as const;

const LINE_STYLE_DONE = {
  ...LINE_STYLE,
  fill: 0x7cff7c,
  dropShadow: true,
  dropShadowColor: 0x000000,
  dropShadowDistance: 1,
  dropShadowAlpha: 0.6,
  dropShadowBlur: 0,
} as const;

function defaultNodeId(x: number, y: number) {
  return `N_${Math.round(x)}_${Math.round(y)}`;
}

let _frameTex: Texture | null = null;
async function getFrameTexture(): Promise<Texture> {
  if (_frameTex) return _frameTex;
  _frameTex = await Assets.load(PANEL_FRAME_URL);
  return _frameTex!;
}

function makeOkButtonTexture(app: Application): Texture {
  const g = new Graphics();
  const w = 74, h = 24;
  g.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(0, 0, w, h).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
  return app.renderer.generateTexture(g);
}

/* ───────────────────── Panel ───────────────────── */
class NodePanel extends Container {
  private app: Application;
  private frame: NineSlicePlane;
  private list: Container;
  private okPatch: NineSlicePlane;
  private okText: Text;
  private closeBtn: Container;
  private maskG: Graphics;

  private objectives: Objective[];
  private onToggle: (id: string) => void;
  private onAdd: (text: string) => void;
  private onClose: () => void;

  constructor(args: {
    app: Application;
    frameTexture: Texture;
    titleText: string;           // ignored (we keep no title inside the panel)
    objectives: Objective[];
    onToggle: (id: string) => void;
    onAdd: (text: string) => void;
    onClose: () => void;
    targetWidth?: number;
  }) {
    super();
    this.app = args.app;
    this.objectives = args.objectives;
    this.onToggle = args.onToggle;
    this.onAdd = args.onAdd;
    this.onClose = args.onClose;

    this.sortableChildren = true;
    (this as any).eventMode = "static";

    this.frame = new NineSlicePlane(
      args.frameTexture, SLICE_LEFT, SLICE_TOP, SLICE_RIGHT, SLICE_BOTTOM
    );
    this.frame.width  = Math.max(MIN_WIDTH, Math.min(args.targetWidth ?? 440, MAX_WIDTH));
    this.frame.height = MIN_HEIGHT;
    this.addChild(this.frame);

    this.list = new Container();
    this.addChild(this.list);

    const okTex = makeOkButtonTexture(this.app);
    this.okPatch = new NineSlicePlane(okTex, 4, 4, 4, 4);
    (this.okPatch as any).eventMode = "static";
    (this.okPatch as any).cursor = "pointer";
    (this.okPatch as any).on?.("pointertap", () => this.onClose());
    this.addChild(this.okPatch);

    this.okText = new Text({
      text: "OK",
      style: { fill: 0xffffff, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif",
               fontSize: 12, fontWeight: "600" }
    });
    this.addChild(this.okText);

    // Close ✕
    this.closeBtn = new Container();
    const xg = new Graphics();
    xg.roundRect(0,0,18,18,3).fill({color:0xffffff, alpha:0.12}).stroke({color:0xffffff, width:1, alpha:0.35});
    xg.moveTo(5,5).lineTo(13,13).stroke({color:0xffffff, width:2, alpha:0.85});
    xg.moveTo(13,5).lineTo(5,13).stroke({color:0xffffff, width:2, alpha:0.85});
    this.closeBtn.addChild(xg);
    (this.closeBtn as any).eventMode = "static";
    (this.closeBtn as any).cursor = "pointer";
    (this.closeBtn as any).on?.("pointertap", () => this.onClose());
    this.addChild(this.closeBtn);

    // Mask for wipe
    this.maskG = new Graphics();
    this.addChild(this.maskG);
    this.mask = this.maskG;

    this.relayout();
  }

  relayout() {
    this.list.removeChildren();

    const innerW = Math.max(MIN_WIDTH, Math.min(this.frame.width, MAX_WIDTH)) - (PAD_LEFT + PAD_RIGHT);
    let y = PAD_TOP, maxLineW = 0;

    for (const obj of this.objectives) {
      const t = new Text({
        text: obj.text,
        style: { ...(obj.done ? LINE_STYLE_DONE : LINE_STYLE), wordWrapWidth: innerW },
      });
      t.position.set(PAD_LEFT, y);
      (t as any).eventMode = "static";
      (t as any).cursor = "pointer";
      (t as any).on?.("pointertap", () => this.onToggle(obj.id));
      this.list.addChild(t);
      y += t.height + 4;
      maxLineW = Math.max(maxLineW, t.width);
    }

    const okH = 24;
    const desiredW = Math.max(MIN_WIDTH, Math.min(Math.max(maxLineW, 180) + PAD_LEFT + PAD_RIGHT, MAX_WIDTH));
    const desiredH = Math.max(MIN_HEIGHT, y + 10 + okH + PAD_BOTTOM);

    this.frame.width = desiredW;
    this.frame.height = desiredH;

    // OK bottom-center inside
    this.okPatch.width = 74;
    this.okPatch.height = okH;
    this.okPatch.position.set(
      Math.round((this.frame.width - this.okPatch.width) / 2),
      Math.round(this.frame.height - PAD_BOTTOM - this.okPatch.height)
    );
    this.okText.position.set(
      Math.round(this.okPatch.x + (this.okPatch.width - this.okText.width) / 2),
      Math.round(this.okPatch.y + (this.okPatch.height - this.okText.height) / 2 + 0.5)
    );

    // Close button
    this.closeBtn.position.set(
      Math.round(this.frame.width - PAD_RIGHT - 18),
      Math.round(PAD_TOP - 4)
    );

    // Reset mask rectangle (0 height at bottom)
    this.maskG.clear().rect(0, this.frame.height, this.frame.width, 0).fill(0xffffff);
  }

  public setObjectives(objs: Objective[]) {
    this.objectives = objs;
    this.relayout();
  }

  /** bottom→top wipe; IMPORTANT: remove the mask graphics at the end */
  public async playOpenAnim(): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 220;
      const H = this.frame.height;
      this.alpha = 0.92;
      this.scale.set(0.985);

      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        const shown = H * e;
        this.maskG.clear().rect(0, H - shown, this.frame.width, shown).fill(0xffffff);
        this.alpha = 0.92 + 0.08 * e;
        const s = 0.985 + 0.015 * e;
        this.scale.set(s);

        if (k < 1) requestAnimationFrame(tick);
        else {
          this.mask = null;                  // stop masking
          this.removeChild(this.maskG);      // <-- FIX white rectangles
          this.maskG.destroy();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }
}

/* ───────────────────────── UINode ───────────────────────── */
export class UINode {
  readonly id: string;
  readonly x: number;
  readonly y: number;

  status: NodeStatus;
  readonly container: Container;
  neighbours: UINode[] = [];

  private _visual: Container;
  private objectives: Objective[] = [];
  private title: string = "";           // meta
  private difficulty: number = 0;       // 0..33

  // external refs
  private app?: Application;
  private tree?: Container;
  private uiLayer?: Container;

  private panel?: NodePanel;
  private connector?: Graphics;
  private tooltip?: Container;

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
    (this.container as any).on?.("pointertap", () => this.openPanel());
  }

  enableObjectivesUI(app: Application, treeContainer: Container, uiLayer: Container) {
    this.app = app;
    this.tree = treeContainer;
    this.uiLayer = uiLayer;

    // hover tooltip
    (this.container as any).on?.("pointerover", () => this.showTooltip());
    (this.container as any).on?.("pointerout",  () => this.hideTooltip());
    (this.container as any).on?.("pointermove", (e: any) => this.moveTooltip(e));
  }

  /* ───────── persistence ───────── */
  private key() { return `${NODE_STORE_PREFIX}${this.id}`; }

  private loadState() {
    try {
      const raw = localStorage.getItem(this.key());
      if (!raw) return;
      const data = JSON.parse(raw) as {
        status?: NodeStatus; objectives?: Objective[];
        title?: string; difficulty?: number;
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
      status: this.status, objectives: this.objectives,
      title: this.title, difficulty: this.difficulty
    }));
  }

  public applyMeta(meta: { title?: string; difficulty?: number; objectives?: string[] }) {
    if (meta.title) this.title = meta.title;
    if (typeof meta.difficulty === "number") this.difficulty = Math.max(0, Math.min(33, Math.round(meta.difficulty)));
    if (meta.objectives) {
      this.objectives = meta.objectives
        .map((t) => t.trim()).filter(Boolean)
        .map((t) => ({ id: Math.random().toString(36).slice(2), text: t, done: false }));
    }
    this.saveState();
  }

  private refreshVisual() {
    try { this.container.removeChild(this._visual); (this._visual as any).destroy?.({ children: true }); } catch {}
    this._visual = makeThemedNode(this.x, this.y, 48, statusToTheme[this.status]);
    this.container.addChild(this._visual);
  }

  private recomputeStatusFromObjectives() {
    if (this.objectives.length > 0 && this.objectives.every(o => o.done)) {
      if (this.status !== NodeStatus.Learned) {
        this.status = NodeStatus.Learned; this.refreshVisual();
      }
    } else if (this.status === NodeStatus.Locked) {
      this.status = NodeStatus.Available; this.refreshVisual();
    }
    this.saveState();
  }

  /* ───────── Tooltip (title + difficulty) ───────── */
  private showTooltip() {
    if (!this.app || !this.uiLayer || !this.tree) return;
    if (this.tooltip) return;

    const bg = new Graphics();
    const txt = new Text({
      text: `${this.title || "Untitled"}  •  ${this.difficulty}/33`,
      style: { fill: 0xffffff, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 12 }
    });
    const pad = 8;
    bg.roundRect(0, 0, txt.width + pad * 2, txt.height + pad * 2, 6)
      .fill({ color: 0x000000, alpha: 0.7 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });

    const c = new Container();
    c.addChild(bg, txt);
    txt.position.set(pad, pad);

    this.tooltip = c;
    this.tooltip.zIndex = 10_001;
    this.uiLayer.addChild(this.tooltip);

    // place near node
    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });
    c.position.set(gx + 14, gy - c.height - 10);
  }
  private moveTooltip(e: any) {
    if (!this.tooltip || !this.uiLayer) return;
    // optional: follow mouse a bit
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
      titleText: "",
      objectives: this.objectives.slice(),
      onToggle: (objId) => {
        const o = this.objectives.find((x) => x.id === objId);
        if (!o) return;
        o.done = !o.done;
        this.saveState();
        this.recomputeStatusFromObjectives();
        this.panel?.setObjectives(this.objectives.slice());
      },
      onAdd: (_text) => {},
      onClose: () => this.closePanel(),
    });

    const { x: gx, y: gy } = this.tree.toGlobal({ x: this.x, y: this.y });

    let px = Math.round(gx + 16);
    let py = Math.round(gy - 10);
    const { width: W, height: H } = this.app.screen;
    const panelW = this.panel.width, panelH = this.panel.height, m = 8;
    px = Math.max(m, Math.min(px, W - panelW - m));
    py = Math.max(m, Math.min(py, H - panelH - m));
    this.panel.position.set(px, py);

    this.panel.zIndex = 10_000;
    this.uiLayer.addChild(this.panel);

    await this.panel.playOpenAnim();

    // connector animation (node → panel top-center)
    if (this.connector) { this.uiLayer.removeChild(this.connector); this.connector.destroy(); }
    this.connector = new Graphics();
    this.uiLayer.addChild(this.connector);

    const start = { x: gx, y: gy - 6 };
    const end   = { x: px + panelW / 2, y: py };
    const t0 = performance.now(), dur = 200;

    const drawAt = (prog: number) => {
      const x = start.x + (end.x - start.x) * prog;
      const y = start.y + (end.y - start.y) * prog;
      this.connector!.clear();
      this.connector!
        .moveTo(start.x, start.y)
        .lineTo(x, y)
        .stroke({ color: 0xFFD46A, width: 2.5, alpha: 1.0 });
    };

    const anim = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      drawAt(e);
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  public closePanel() {
    if (this.panel && this.uiLayer) {
      this.uiLayer.removeChild(this.panel);
      (this.panel as any).destroy?.({ children: true });
      this.panel = undefined;
    }
    if (this.connector && this.uiLayer) {
      this.uiLayer.removeChild(this.connector);
      this.connector.destroy();
      this.connector = undefined;
    }
  }
}
