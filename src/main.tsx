import { Application, Assets, Container, Sprite } from "pixi.js";
import { initDevtools } from "@pixi/devtools";
import { UINode } from "./UINode";
import { NodeStatus } from "./nodeTypes";
import { openCreateNodeDialog } from "./CreateNodeDialog";
import { UIEdge, EdgeKind } from "./UIEdge";

/* ───────────────────────── CONSTANTS ───────────────────────── */
const DESIGN_W = 5000;
const DESIGN_H = 7000;
const STORAGE_KEY = "tol_nodes_v1";
const NODE_STATE_PREFIX = "tol.node.v1.";
const EDGES_KEY = "tol_edges_v1";

/* ───────────────────────── Types & Store ───────────────────────── */
type StoredNode = { id: string; x: number; y: number; status: NodeStatus };
type StoredEdge = { from: string; to: string; kind?: EdgeKind };

/* handy log */
const log = (...args: any[]) =>
  console.log(`[main ${new Date().toLocaleTimeString()}]`, ...args);

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

  const update = (id: string, x: number, y: number) => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i !== -1) {
      nodes[i] = { ...nodes[i], x, y };
      save();
    }
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
  return { load, save, add, update, list, clear, removeNearest };
}

function createEdgeStore() {
  let edges: StoredEdge[] = [];

  const load = () => {
    try {
      const raw = localStorage.getItem(EDGES_KEY);
      edges = raw ? (JSON.parse(raw) as StoredEdge[]) : [];
    } catch {
      edges = [];
    }
  };
  const save = () => localStorage.setItem(EDGES_KEY, JSON.stringify(edges));

  const add = (from: string, to: string, kind: EdgeKind) => {
    if (from === to) return;
    if (edges.some((e) => e.from === from && e.to === to && (e.kind ?? "curvy") === kind)) return;
    edges.push({ from, to, kind });
    save();
    log("edge added", { from, to, kind });
  };

  const removeWithNode = (id: string) => {
    const before = edges.length;
    edges = edges.filter((e) => e.from !== id && e.to !== id);
    if (edges.length !== before) save();
  };

  const clear = () => {
    edges = [];
    save();
  };

  const list = () => edges.slice();

  load();
  return { load, save, add, removeWithNode, list, clear };
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
  const edgesContainer = new Container(); // edges under nodes
  const nodesContainer = new Container();
  const uiLayer = new Container();
  uiLayer.sortableChildren = true;

  treeContainer.addChild(edgesContainer);
  treeContainer.addChild(nodesContainer);
  app.stage.addChild(treeContainer);
  app.stage.addChild(uiLayer);

  // Background
  const bgTexture = await Assets.load("/tree_of_virtual_life_medium.png");
  const treeSprite = new Sprite(bgTexture);
  treeSprite.width = DESIGN_W;
  treeSprite.height = DESIGN_H;
  treeContainer.addChildAt(treeSprite, 0);

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

  // Stores
  const nodeStore = createNodeStore();
  const edgeStore = createEdgeStore();

  // Render state
  let uiNodes: UINode[] = [];
  let nodeMap: Map<string, UINode> = new Map();
  let uiEdges: UIEdge[] = [];

  // Edge-mode toggle: W=linear, Q=curvy
  let edgeMode: EdgeKind | null = null;
  let lastClickedId: string | null = null;

  const setEdgeMode = (mode: EdgeKind | null) => {
    edgeMode = mode;
    lastClickedId = null;
    app.canvas.style.cursor = edgeMode ? "alias" : "crosshair";
    log(`edgeMode ${edgeMode ? edgeMode.toUpperCase() : "OFF"}`);
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "w") setEdgeMode(edgeMode === "linear" ? null : "linear");
    if (k === "q") setEdgeMode(edgeMode === "curvy" ? null : "curvy");
  });

  function rebuildEdges() {
    edgesContainer.removeChildren();
    uiEdges.forEach((e) => e.destroy());
    uiEdges = [];

    const list = edgeStore.list();
    for (const e of list) {
      const from = nodeMap.get(e.from);
      const to = nodeMap.get(e.to);
      if (!from || !to) continue;
      const kind: EdgeKind = e.kind ?? "curvy";
      const edge = new UIEdge(from, to, kind);
      edgesContainer.addChild(edge.container);
      uiEdges.push(edge);
    }
  }

  function rebuildNodes() {
    // Clean overlays from existing instances before nuking
    for (const n of uiNodes) n.dispose?.();

    nodesContainer.removeChildren();
    uiNodes = [];
    nodeMap.clear();

    nodeStore.list().forEach((row) => {
      const n = new UINode(
        row.x,
        row.y,
        row.status ?? NodeStatus.Locked,
        row.id,
      );

      n.enableObjectivesUI(app, treeContainer, uiLayer, {
        onMove: () => rebuildEdges(),
        onDrop: (id, x, y) => {
          nodeStore.update(id, x, y);
          rebuildEdges();
        },
        onClick: (id) => {
          if (!edgeMode) return false;
          log("edgeMode click", { id, lastClickedId, edgeMode });
          if (lastClickedId && lastClickedId !== id) {
            edgeStore.add(lastClickedId, id, edgeMode);
            rebuildEdges();
          }
          lastClickedId = id;
          return true;
        },
      });

      nodesContainer.addChild(n.container);
      uiNodes.push(n);
      nodeMap.set(n.id, n);
    });

    rebuildEdges();
  }

  rebuildNodes();

  /* ───────────── Keyboard-driven placement (k/l) ───────────── */
  let cursorDesign = { x: DESIGN_W / 2, y: DESIGN_H / 2 };
  window.addEventListener("pointermove", (e: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const s = treeContainer.scale.x;
    cursorDesign = {
      x: (sx - treeContainer.position.x) / s,
      y: (sy - treeContainer.position.y) / s,
    };
  });

  window.addEventListener("keydown", async (ev) => {
    const el = document.activeElement as HTMLElement | null;
    if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    if (ev.repeat) return;

    const key = ev.key.toLowerCase();

    if (key === "k") {
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

      const created = nodeStore.add(
        cursorDesign.x,
        cursorDesign.y,
        NodeStatus.Available,
      );

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
      const node = uiNodes.find((n) => n.id === created.id);
      node?.openPanel();
    } else if (key === "l") {
      const removedId = nodeStore.removeNearest(cursorDesign.x, cursorDesign.y, 40);
      if (removedId) {
        // clean overlays for the specific node before we drop data
        const inst = uiNodes.find((n) => n.id === removedId);
        inst?.dispose?.();

        localStorage.removeItem(`${NODE_STATE_PREFIX}${removedId}`);
        // also remove edges touching this node
        const raw = localStorage.getItem(EDGES_KEY);
        const edges = raw ? (JSON.parse(raw) as StoredEdge[]) : [];
        const filtered = edges.filter((e) => e.from !== removedId && e.to !== removedId);
        localStorage.setItem(EDGES_KEY, JSON.stringify(filtered));
        rebuildNodes();
      }
    }

    // Utilities
    if ((ev.ctrlKey || ev.metaKey) && key === "c") {
      if (confirm("Clear ALL saved nodes & edges?")) {
        const toWipe = nodeStore.list().map((n) => `${NODE_STATE_PREFIX}${n.id}`);
        nodeStore.clear();
        localStorage.setItem(EDGES_KEY, JSON.stringify([]));
        toWipe.forEach((k) => localStorage.removeItem(k));
        rebuildNodes();
      }
    } else if ((ev.ctrlKey || ev.metaKey) && key === "e") {
      const rows = nodeStore.list();
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
