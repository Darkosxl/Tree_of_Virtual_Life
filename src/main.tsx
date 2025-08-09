// src/main.tsx
import { Application, Assets, Container, Sprite } from "pixi.js";
import { initDevtools } from "@pixi/devtools";
import { UINode } from "./UINode";
import { NodeStatus } from "./nodeTypes";
import { WaterFlowOverlay } from "./WaterFlowOverlay";
import { openCreateNodeDialog } from "./CreateNodeDialog";

/* ───────────────────────── CONSTANTS ───────────────────────── */
const DESIGN_W = 5000;
const DESIGN_H = 7000;
const STORAGE_KEY = "tol_nodes_v1";
const NODE_STATE_PREFIX = "tol.node.v1.";

/* ───────────────────────── Types & Store ───────────────────────── */
type StoredNode = { id: string; x: number; y: number; status: NodeStatus };

function createNodeStore() {
  let nodes: StoredNode[] = [];

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      nodes = raw ? (JSON.parse(raw) as StoredNode[]) : [];
    } catch {
      nodes = [];
    }
  };
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
  const nextId = () =>
    `N${(
      nodes.reduce(
        (m, n) => Math.max(m, parseInt(n.id.replace(/\D+/g, "") || "0", 10)),
        0,
      ) + 1
    )
      .toString()
      .padStart(3, "0")}`;

  const add = (
    x: number,
    y: number,
    status: NodeStatus = NodeStatus.Available,
  ) => {
    const n: StoredNode = { id: nextId(), x, y, status };
    nodes.push(n);
    save();
    return n;
  };

  const removeNearest = (x: number, y: number, maxDist = 40): string | null => {
    if (!nodes.length) return null;
    let k = -1,
      best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].y - y);
      if (d < best) {
        best = d;
        k = i;
      }
    }
    if (k !== -1 && best <= maxDist) {
      const [removed] = nodes.splice(k, 1);
      save();
      return removed.id;
    }
    return null;
  };

  const clear = () => {
    nodes = [];
    save();
  };
  const list = () => nodes.slice();

  load();
  return { load, save, add, list, clear, removeNearest };
}

/* ───────────────────────── Helpers ───────────────────────── */
function screenToDesign(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  treeContainer: Container,
) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const s = treeContainer.scale.x;
  return {
    x: (sx - treeContainer.position.x) / s,
    y: (sy - treeContainer.position.y) / s,
  };
}
function clampToDesign(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(DESIGN_W, x)),
    y: Math.max(0, Math.min(DESIGN_H, y)),
  };
}

/* ───────────────────────── MAIN ───────────────────────── */
(async () => {
  // Root
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    overflow: "hidden",
    background: "#0a0a0a",
  } as CSSStyleDeclaration);
  document.body.style.margin = "0";
  document.body.appendChild(root);

  // PIXI
  const app = new Application();
  initDevtools({ app });
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
  });
  Object.assign(app.canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "10",
    cursor: "crosshair",
  } as CSSStyleDeclaration);
  root.appendChild(app.canvas);

  // LAYERS
  const treeContainer = new Container();
  const nodesContainer = new Container();
  const uiLayer = new Container();
  uiLayer.sortableChildren = true;
  treeContainer.addChild(nodesContainer);
  app.stage.addChild(treeContainer);
  app.stage.addChild(uiLayer);

  // Background
  const bgTexture = await Assets.load("/tree_of_virtual_life_medium.png");
  const treeSprite = new Sprite(bgTexture);
  treeSprite.width = DESIGN_W;
  treeSprite.height = DESIGN_H;
  treeContainer.addChildAt(treeSprite, 0);

  // Water overlay (under Pixi canvas)
  const overlay = new WaterFlowOverlay({
    mount: root,
    pixiApp: app,
    treeContainer,
    designW: DESIGN_W,
    designH: DESIGN_H,
    dprCap: 2,
  });

  // Resize
  function resize() {
    const scale = Math.min(
      window.innerWidth / DESIGN_W,
      window.innerHeight / DESIGN_H,
    );
    treeContainer.scale.set(scale);
    treeContainer.position.set(
      (window.innerWidth - DESIGN_W * scale) / 2,
      (window.innerHeight - DESIGN_H * scale) / 2,
    );
    app.renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);
  resize();

  // Store + render
  const store = createNodeStore();
  let uiNodes: UINode[] = [];

  function rebuildNodes() {
    nodesContainer.removeChildren();
    uiNodes = [];
    store.list().forEach((row) => {
      const n = new UINode(
        row.x,
        row.y,
        row.status ?? NodeStatus.Locked,
        row.id,
      );
      n.enableObjectivesUI(app, treeContainer, uiLayer);
      nodesContainer.addChild(n.container);
      uiNodes.push(n);
    });
    rebuildWires();
  }

  function rebuildWires() {
    overlay.clear();
    for (let i = 1; i < uiNodes.length; i++) {
      const from = uiNodes[i - 1];
      const to = uiNodes[i];
      overlay.link(from.x, from.y, to.x, to.y, {
        color: 0xffd46a,
        edgeColor: 0xfff0bf,
        opacity: 1.0,
        radiusPx: 3.5,
        bend: 110,
        nodeRadiusPx: 26,
        endUnderlapPx: 3,
        taperPx: 18,
        glowScale: 1.18,
        speed: 0.0,
        streakDensity: 0.0,
      });
    }
  }

  rebuildNodes();

  /* ───────────── Keyboard-driven placement (k/l) ───────────── */
  let cursorDesign = { x: DESIGN_W / 2, y: DESIGN_H / 2 };
  window.addEventListener("pointermove", (e: PointerEvent) => {
    const p = screenToDesign(e.clientX, e.clientY, app.canvas, treeContainer);
    cursorDesign = clampToDesign(p.x, p.y);
  });

  window.addEventListener("keydown", async (ev) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    if (ev.repeat) return;

    const key = ev.key.toLowerCase();

    if (key === "k") {
      // Convert design coords (cursor) → screen coords to place the dialog
      const { x: gx, y: gy } = treeContainer.toGlobal({
        x: cursorDesign.x,
        y: cursorDesign.y,
      });
      const meta = await openCreateNodeDialog({
        app,
        uiLayer,
        attachNear: { x: gx, y: gy },
      });
      if (!meta) return;

      const created = store.add(
        cursorDesign.x,
        cursorDesign.y,
        NodeStatus.Available,
      );

      // Save meta into per-node storage so UINode picks it up
      localStorage.setItem(
        `${NODE_STATE_PREFIX}${created.id}`,
        JSON.stringify({
          status: NodeStatus.Available,
          objectives: meta.objectives.map((t) => ({
            id: Math.random().toString(36).slice(2),
            text: t,
            done: false,
          })),
          title: meta.title,
          difficulty: meta.difficulty,
        }),
      );

      rebuildNodes();
      uiNodes.find((n) => n.id === created.id)?.openPanel();
    } else if (key === "l") {
      const removedId = store.removeNearest(cursorDesign.x, cursorDesign.y, 40);
      if (removedId) {
        localStorage.removeItem(`${NODE_STATE_PREFIX}${removedId}`);
        rebuildNodes();
      }
    }

    // Utilities
    if ((ev.ctrlKey || ev.metaKey) && key === "c") {
      if (confirm("Clear ALL saved nodes?")) {
        const toWipe = store.list().map((n) => `${NODE_STATE_PREFIX}${n.id}`);
        store.clear();
        toWipe.forEach((k) => localStorage.removeItem(k));
        rebuildNodes();
      }
    } else if ((ev.ctrlKey || ev.metaKey) && key === "e") {
      const rows = store.list();
      const csv =
        "node_id,x,y\n" +
        rows
          .map((r) => `${r.id},${Math.round(r.x)},${Math.round(r.y)}`)
          .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "virtual_life_nodes-export.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
})();
