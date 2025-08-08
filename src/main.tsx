import {
  Application,
  Assets,
  Container,
  Sprite,
} from "pixi.js";
import { initDevtools } from "@pixi/devtools";
import { UINode } from "./UINode";
import { NodeStatus } from "./nodeTypes";
import { linkCurvy } from "./linkCurvy";
import {
  makeThemedNode,            // still used inside UINode
  brightAqua,
  deepTeal,
  burntOrange,
} from "./node_drawer";

/* ───────────────────────── CONSTANTS ───────────────────────── */
const DESIGN_W = 5_000;   // width  of the source tree image
const DESIGN_H = 7_000;   // height of the source tree image

/* ───────────────────────── MAIN ───────────────────────── */
(async () => {
  /* 1 ▸ BASIC APP SET-UP */
  const app = new Application();
  initDevtools({ app });
  await app.init({
    width:  window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.body.appendChild(app.canvas);

  /* 2 ▸ STAGE LAYERS */
  const treeContainer  = new Container();  // holds background + everything
  const linesContainer = new Container();  // water ropes
  const nodesContainer = new Container();  // node visuals

  treeContainer.addChild(linesContainer);
  treeContainer.addChild(nodesContainer);
  app.stage.addChild(treeContainer);

  /* 3 ▸ BACKGROUND IMAGE */
  const bgTexture  = await Assets.load("public/tree_of_virtual_life_medium.png");
  const treeSprite = new Sprite(bgTexture);
  treeContainer.addChildAt(treeSprite, 0); // keep it at the very back

  /* 4 ▸ BUILD 10 DEMO NODES */
  const SAMPLE_COORDS = [
    { x:  800, y: 1000 },
    { x: 1300, y: 1300 },
    { x: 1800, y: 1600 },
    { x: 2300, y: 1900 },
    { x: 2800, y: 2200 },
    { x: 3300, y: 2500 },
    { x: 3800, y: 2800 },
    { x: 2000, y: 3500 },
    { x: 2600, y: 4200 },
    { x: 3200, y: 4900 },
  ];

  // Status demo: first = learned, second = available, rest locked
  const uiNodes: UINode[] = SAMPLE_COORDS.map(({ x, y }, idx) => {
    const status =
      idx === 0 ? NodeStatus.Learned :
      idx === 1 ? NodeStatus.Available :
                   NodeStatus.Locked;

    const n = new UINode(x, y, status);
    
    // Defensive check to prevent crashes
    if (!n.container || typeof n.container.updateLocalTransform !== "function") {
      console.error("Invalid container object:", n.container, "from UINode:", n);
      throw new Error("UINode.container is not a valid DisplayObject");
    }
    
    nodesContainer.addChild(n.container);   // render
    return n;
  });

  /* 5 ▸ CONNECT THEM SEQUENTIALLY WITH “WATER” ROPES */
  linkCurvy(uiNodes, linesContainer, 0.3);

  /* 6 ▸ RESPONSIVE FIT */
  function resize() {
    const scale = Math.min(
      window.innerWidth  / DESIGN_W,
      window.innerHeight / DESIGN_H
    );
    treeContainer.scale.set(scale);
    treeContainer.position.set(
      (window.innerWidth  - DESIGN_W * scale) / 2,
      (window.innerHeight - DESIGN_H * scale) / 2
    );
    app.renderer.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", resize);
  resize(); // initial
})();
