// src/CreateNodeDialog.ts
import {
  Application, Assets, Container, Graphics, NineSlicePlane, Text, Texture,
} from "pixi.js";

/** PNG & slices must match the UINode panel */
const PANEL_FRAME_URL = "/assets/ui/quest_frame.png";
// PNG is 1024x1024. Preserved border thicknesses:
const SLICE_LEFT = 72;
const SLICE_TOP = 118;
const SLICE_RIGHT = 77;   // 1024 - 947
const SLICE_BOTTOM = 126; // 1024 - 898

const PAD_LEFT = 28, PAD_RIGHT = 28, PAD_TOP = 22, PAD_BOTTOM = 22;
const MIN_WIDTH = 420, MAX_WIDTH = 720, MIN_HEIGHT = 300;

let _frameTex: Texture | null = null;
async function getFrameTexture(): Promise<Texture> {
  if (_frameTex) return _frameTex;
  _frameTex = await Assets.load(PANEL_FRAME_URL);
  return _frameTex!;
}

function makeBtnTexture(app: Application, w = 90, h = 28): Texture {
  const g = new Graphics();
  g.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(0, 0, w, h).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
  return app.renderer.generateTexture(g);
}

export type NewNodeMeta = { title: string; objectives: string[]; difficulty: number };

type OpenOpts = {
  app: Application;
  uiLayer: Container;
  attachNear: { x: number; y: number }; // stage/screen coords (use toGlobal() before calling)
};

/** Opens a framed dialog and resolves with the entered data or null on cancel. */
export async function openCreateNodeDialog(opts: OpenOpts): Promise<NewNodeMeta | null> {
  const { app, uiLayer } = opts;
  const frameTexture = await getFrameTexture();

  // ---- PIXI container
  const panel = new Container();
  panel.sortableChildren = true;
  (panel as any).eventMode = "static";

  const frame = new NineSlicePlane(frameTexture, SLICE_LEFT, SLICE_TOP, SLICE_RIGHT, SLICE_BOTTOM);
  frame.width = Math.max(MIN_WIDTH, Math.min(520, MAX_WIDTH));
  frame.height = Math.max(MIN_HEIGHT, 360);
  panel.addChild(frame);

  // Title text (inside the frame top-left)
  const titleText = new Text({
    text: "Create Node",
    style: { fill: 0xf1f1f1, fontFamily: "Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif", fontSize: 14, fontWeight: "700" }
  });
  titleText.position.set(PAD_LEFT, PAD_TOP - 2);
  panel.addChild(titleText);

  // Buttons (Pixi), wired to form submit/cancel
  const okPatch = new NineSlicePlane(makeBtnTexture(app, 86, 26), 4, 4, 4, 4);
  const cancelPatch = new NineSlicePlane(makeBtnTexture(app, 86, 26), 4, 4, 4, 4);
  const okText = new Text({ text: "Create", style: { fill: 0xffffff, fontSize: 12, fontWeight: "600" }});
  const cancelText = new Text({ text: "Cancel", style: { fill: 0xffffff, fontSize: 12, fontWeight: "600" }});

  panel.addChild(okPatch, cancelPatch, okText, cancelText);

  // Close X
  const closeBtn = new Graphics()
    .roundRect(0, 0, 18, 18, 3).fill({color:0xffffff, alpha:0.12}).stroke({color:0xffffff, width:1, alpha:0.35});
  closeBtn.moveTo(5,5).lineTo(13,13).stroke({color:0xffffff, width:2, alpha:0.85});
  closeBtn.moveTo(13,5).lineTo(5,13).stroke({color:0xffffff, width:2, alpha:0.85});
  (closeBtn as any).eventMode = "static";
  (closeBtn as any).cursor = "pointer";
  panel.addChild(closeBtn);

  // Position near attach point (clamped)
  const { width: W, height: H } = app.screen;
  const m = 8;
  let px = Math.max(m, Math.min(Math.round(opts.attachNear.x + 16), W - frame.width - m));
  let py = Math.max(m, Math.min(Math.round(opts.attachNear.y - 10), H - frame.height - m));
  panel.position.set(px, py);

  // Buttons layout at bottom-inside
  const gap = 10;
  const yBtn = Math.round(frame.height - PAD_BOTTOM - 26);
  cancelPatch.position.set(Math.round(px + (frame.width - (86*2 + gap))/2 - px), yBtn);
  okPatch.position.set(cancelPatch.x + 86 + gap, yBtn);
  cancelText.position.set(
    cancelPatch.x + (86 - cancelText.width)/2,
    yBtn + (26 - cancelText.height)/2 + 0.5
  );
  okText.position.set(
    okPatch.x + (86 - okText.width)/2,
    yBtn + (26 - okText.height)/2 + 0.5
  );

  // Close button in top-right
  closeBtn.position.set(Math.round(frame.width - PAD_RIGHT - 18), Math.round(PAD_TOP - 4));

  // Masked open animation (wipe bottom→top) with cleanup
  const maskG = new Graphics();
  panel.addChild(maskG);
  panel.mask = maskG;
  const openStart = performance.now();
  const openDur = 220;
  panel.alpha = 0.92; panel.scale.set(0.985);
  const openTick = (t: number) => {
    const k = Math.min(1, (t - openStart)/openDur);
    const e = 1 - Math.pow(1 - k, 3);
    const shown = frame.height * e;
    maskG.clear().rect(0, frame.height - shown, frame.width, shown).fill(0xffffff);
    panel.alpha = 0.92 + 0.08*e;
    const s = 0.985 + 0.015*e; panel.scale.set(s);
    if (k < 1) requestAnimationFrame(openTick); else { panel.mask = null; panel.removeChild(maskG); maskG.destroy(); }
  };
  requestAnimationFrame(openTick);

  uiLayer.addChild(panel);
  panel.zIndex = 10000;

  // ---- HTML form overlay (so we get real inputs & placeholders)
  const form = document.createElement("form");
  const css = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => Object.assign(el.style, styles);
  css(form, {
    position: "absolute",
    zIndex: "20",
    pointerEvents: "auto",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: "10px",
    width: `${frame.width - (PAD_LEFT + PAD_RIGHT)}px`,
  });

  // Title input
  const inputTitle = document.createElement("input");
  inputTitle.type = "text";
  inputTitle.placeholder = "Title";
  // Objectives textarea
  const inputObj = document.createElement("textarea");
  inputObj.placeholder = "Objectives (one per line)";
  inputObj.rows = 6;
  // Difficulty number
  const inputDiff = document.createElement("input");
  inputDiff.type = "number";
  inputDiff.min = "0"; inputDiff.max = "33"; inputDiff.step = "1";
  inputDiff.placeholder = "Difficulty (0–33)";

  const inputs: HTMLInputElement[] = [inputTitle, inputDiff];
  const styleField = (el: HTMLElement) => css(el, {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    background: "rgba(0,0,0,0.35)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    outline: "none",
  });
  styleField(inputTitle);
  styleField(inputObj);
  styleField(inputDiff);

  form.append(inputTitle, inputObj, inputDiff);
  document.body.appendChild(form);

  const placeForm = () => {
    const r = app.canvas.getBoundingClientRect();
    const left = r.left + px + PAD_LEFT;
    const top = r.top + py + PAD_TOP + 18; // below "Create Node" label
    css(form, { left: `${left}px`, top: `${top}px` });
  };
  placeForm();

  // Reposition on resize/scroll
  const onResize = () => placeForm();
  window.addEventListener("resize", onResize);
  document.addEventListener("scroll", onResize, true);

  // Helpers
  const kill = (res: NewNodeMeta | null) => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("scroll", onResize, true);
    try { document.body.removeChild(form); } catch {}
    uiLayer.removeChild(panel); panel.destroy({ children: true });
    resolve(res);
  };

  // Wire Pixi buttons
  const submitFromPixi = () => form.requestSubmit();
  (okPatch as any).eventMode = "static"; (okPatch as any).cursor = "pointer";
  (cancelPatch as any).eventMode = "static"; (cancelPatch as any).cursor = "pointer";
  (okPatch as any).on?.("pointertap", submitFromPixi);
  (cancelPatch as any).on?.("pointertap", () => kill(null));
  (closeBtn  as any).on?.("pointertap", () => kill(null));

  // Focus the title
  inputTitle.focus();

  // Wait for submit/cancel
  const res = await new Promise<NewNodeMeta | null>((resolve) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const title = (inputTitle.value || "").trim();
      if (!title) { inputTitle.focus(); inputTitle.select(); return; }
      const objectives = (inputObj.value || "")
        .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const diff = Math.max(0, Math.min(33, Math.round(Number(inputDiff.value || "0"))));
      kill({ title, objectives, difficulty: diff });
    };
    (cancelPatch as any).on?.("pointertap", () => kill(null));
    (closeBtn  as any).on?.("pointertap", () => kill(null));
  });

  return res;
}
