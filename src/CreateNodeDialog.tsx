// src/CreateNodeDialog.ts
import {
  Application,
  Assets,
  Container,
  Graphics,
  NineSliceSprite,
  Text,
  Texture,
} from "pixi.js";
import "pixi.js/sprite-nine-slice";

const PANEL_FRAME_URL = "/assets/ui/quest_frame.png";

// preserved edge thicknesses (not coords)
const SLICE_LEFT = 72;
const SLICE_TOP = 118;
const SLICE_RIGHT = 77;
const SLICE_BOTTOM = 126;

/** Tighter safe insets (smaller panel). */
const EXTRA_PAD = 36;
const CONTENT_INSET_LEFT   = SLICE_LEFT  + EXTRA_PAD;  // 108
const CONTENT_INSET_TOP    = SLICE_TOP   + EXTRA_PAD;  // 154 (no title, moved up)
const CONTENT_INSET_RIGHT  = SLICE_RIGHT + EXTRA_PAD;  // 113
const BUTTON_RESERVE       = 54;                       // bottom band for buttons
const CONTENT_INSET_BOTTOM = SLICE_BOTTOM + BUTTON_RESERVE; // 180

/** Smaller default size. */
const FRAME_MIN_WIDTH  = 480;
const FRAME_MIN_HEIGHT = 420;

let _frameTex: Texture | null = null;
async function getFrameTexture(): Promise<Texture> {
  if (_frameTex) return _frameTex;
  _frameTex = await Assets.load(PANEL_FRAME_URL);
  _frameTex.source.scaleMode = "linear";
  _frameTex.source.autoGenerateMipmaps = false;
  return _frameTex!;
}

function makeBtnTexture(app: Application, w = 100, h = 28): Texture {
  const g = new Graphics();
  g.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(0, 0, w, h).stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
  return app.renderer.generateTexture(g, { scaleMode: "linear" });
}

export type NewNodeMeta = { title: string; objectives: string[]; difficulty: number };

type OpenOpts = {
  app: Application;
  uiLayer: Container;
  attachNear: { x: number; y: number }; // stage coords (use toGlobal before calling)
};

export async function openCreateNodeDialog(opts: OpenOpts): Promise<NewNodeMeta | null> {
  const { app, uiLayer } = opts;
  const tex = await getFrameTexture();

  // PIXI panel
  const panel = new Container();
  panel.sortableChildren = true;
  (panel as any).eventMode = "static";
  panel.roundPixels = true;

  const frame = new NineSliceSprite({
    texture: tex,
    leftWidth: SLICE_LEFT,
    topHeight: SLICE_TOP,
    rightWidth: SLICE_RIGHT,
    bottomHeight: SLICE_BOTTOM,
    width: FRAME_MIN_WIDTH,
    height: FRAME_MIN_HEIGHT,
  });
  panel.addChild(frame);

  // Buttons (Cancel + Create), centered on the bottommost safe area
  const btnTex = makeBtnTexture(app);
  const createPatch = new NineSliceSprite({
    texture: btnTex, leftWidth: 4, topHeight: 4, rightWidth: 4, bottomHeight: 4, width: 100, height: 28,
  });
  const cancelPatch = new NineSliceSprite({
    texture: btnTex, leftWidth: 4, topHeight: 4, rightWidth: 4, bottomHeight: 4, width: 100, height: 28,
  });
  const createText = new Text({ text: "Create", style: { fill: 0xffffff, fontSize: 12, fontWeight: "600" } });
  const cancelText = new Text({ text: "Cancel", style: { fill: 0xffffff, fontSize: 12, fontWeight: "600" } });
  panel.addChild(createPatch, cancelPatch, createText, cancelText);

  const placeButtons = () => {
    const gap = 10;
    const total = createPatch.width + gap + cancelPatch.width;
    const y = Math.round(frame.height - SLICE_BOTTOM - createPatch.height - 12);
    const leftX = Math.round((frame.width - total) / 2);
    cancelPatch.position.set(leftX, y);
    createPatch.position.set(leftX + cancelPatch.width + gap, y);
    cancelText.position.set(
      Math.round(cancelPatch.x + (cancelPatch.width - cancelText.width) / 2),
      Math.round(y + (cancelPatch.height - cancelText.height) / 2 + 0.5)
    );
    createText.position.set(
      Math.round(createPatch.x + (createPatch.width - createText.width) / 2),
      Math.round(y + (createPatch.height - createText.height) / 2 + 0.5)
    );
  };

  // Position near node (clamped)
  const { width: W, height: H } = app.screen;
  const m = 8;
  let px = Math.max(m, Math.min(Math.round(opts.attachNear.x + 16), W - frame.width - m));
  let py = Math.max(m, Math.min(Math.round(opts.attachNear.y - 10), H - frame.height - m));
  panel.position.set(px, py);

  // Wipe-in
  const maskG = new Graphics();
  panel.addChild(maskG);
  panel.mask = maskG;
  const openStart = performance.now(), openDur = 220;
  panel.alpha = 0.92; panel.scale.set(0.985);
  const openTick = (t: number) => {
    const k = Math.min(1, (t - openStart) / openDur);
    const e = 1 - Math.pow(1 - k, 3);
    const shown = frame.height * e;
    maskG.clear().rect(0, frame.height - shown, frame.width, shown).fill(0xffffff);
    panel.alpha = 0.92 + 0.08 * e;
    const s = 0.985 + 0.015 * e; panel.scale.set(s);
    if (k < 1) requestAnimationFrame(openTick);
    else { panel.mask = null; panel.removeChild(maskG); maskG.destroy(); }
  };
  requestAnimationFrame(openTick);

  uiLayer.addChild(panel);
  panel.zIndex = 10000;

  /* ---------- HTML inputs overlay (inside safe box) ---------- */
  const FORM_CLASS = "tol-create-node-form";
  const styleTag = document.createElement("style");
  styleTag.textContent = `
.${FORM_CLASS} input, .${FORM_CLASS} textarea {
  font-family: Tahoma, Segoe UI, Noto Sans, system-ui, sans-serif;
  font-size: 14px; line-height: 20px;
}
.${FORM_CLASS} input::placeholder, .${FORM_CLASS} textarea::placeholder {
  color: rgba(255,255,255,0.78);
}
`;
  document.head.appendChild(styleTag);

  // Desired content heights (textarea thinner by ~20%)
  const H_TITLE = 38;
  const H_TEXTAREA = 120; // was 150
  const H_DIFF = 38;
  const GAP = 10;
  const CONTENT_DESIRED = H_TITLE + H_TEXTAREA + H_DIFF + GAP * 2;

  // Ensure frame tall enough for inputs + button band
  frame.height = Math.max(
    FRAME_MIN_HEIGHT,
    CONTENT_INSET_TOP + CONTENT_DESIRED + CONTENT_INSET_BOTTOM
  );
  placeButtons();

  const computeContentRect = () => {
    const rr = app.canvas.getBoundingClientRect();
    const left = rr.left + px + CONTENT_INSET_LEFT;
    const top  = rr.top  + py + CONTENT_INSET_TOP;
    const w    = frame.width  - (CONTENT_INSET_LEFT + CONTENT_INSET_RIGHT);
    const h    = frame.height - (CONTENT_INSET_TOP  + CONTENT_INSET_BOTTOM);
    return { left: Math.round(left), top: Math.round(top), w: Math.round(w), h: Math.round(h) };
  };

  const form = document.createElement("form");
  form.className = FORM_CLASS;
  Object.assign(form.style, {
    position: "absolute",
    zIndex: "20",
    pointerEvents: "auto",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    gap: `${GAP}px`,
  } as CSSStyleDeclaration);

  const styleField = (el: HTMLElement, multiline = false) =>
    Object.assign(el.style, {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px 12px",
      background: "rgba(0,0,0,0.35)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.25)",
      borderRadius: "6px",
      outline: "none",
      height: multiline ? "" : `${H_TITLE}px`,
      textShadow: "0 1px 0 rgba(0,0,0,0.85)",
    } as CSSStyleDeclaration);

  const inputTitle = document.createElement("input");
  inputTitle.type = "text";
  inputTitle.placeholder = "Title";
  styleField(inputTitle);

  const inputObj = document.createElement("textarea");
  inputObj.placeholder = "Objectives (one per line)";
  styleField(inputObj, true);
  inputObj.style.height = `${H_TEXTAREA}px`;
  inputObj.style.resize = "vertical";

  const inputDiff = document.createElement("input");
  inputDiff.type = "number";
  inputDiff.min = "0"; inputDiff.max = "33"; inputDiff.step = "1";
  inputDiff.placeholder = "Difficulty (0–33)";
  styleField(inputDiff);

  form.append(inputTitle, inputObj, inputDiff);
  document.body.appendChild(form);

  const placeForm = () => {
    const { left, top, w, h } = computeContentRect();
    form.style.left = `${left}px`;
    form.style.top  = `${top}px`;
    form.style.width  = `${w}px`;
    form.style.height = `${h}px`;
  };
  const onResize = () => placeForm();
  window.addEventListener("resize", onResize);
  document.addEventListener("scroll", onResize, true);
  placeForm();

  const cleanup = () => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("scroll", onResize, true);
    try { document.body.removeChild(form); } catch {}
    try { document.head.removeChild(styleTag); } catch {}
    uiLayer.removeChild(panel);
    panel.destroy({ children: true });
  };

  const result = await new Promise<NewNodeMeta | null>((resolve) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const title = (inputTitle.value || "").trim();
      if (!title) { inputTitle.focus(); inputTitle.select(); return; }
      const objectives = (inputObj.value || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const diff = Math.max(0, Math.min(33, Math.round(Number(inputDiff.value || "0"))));
      cleanup();
      resolve({ title, objectives, difficulty: diff });
    };

    const cancel = () => { cleanup(); resolve(null); };

    (createPatch as any).eventMode = "static"; (createPatch as any).cursor = "pointer";
    (cancelPatch as any).eventMode = "static"; (cancelPatch as any).cursor = "pointer";
    (createPatch as any).on?.("pointertap", () => form.requestSubmit());
    (cancelPatch as any).on?.("pointertap", cancel);
  });

  return result;
}
