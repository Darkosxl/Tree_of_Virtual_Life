import {
  Application,
  Graphics,
  Sprite,
  Assets,
  Text,
  Container,
} from "pixi.js";
import { initDevtools } from "@pixi/devtools";
// Design resolution - fixed authoring space
const DESIGN_W = 5000; // Match your tree image width
const DESIGN_H = 7000; // Match your tree image height

// Load Papa Parse from CDN
const script = document.createElement("script");
script.src =
  "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
document.head.appendChild(script);

script.onload = () => {
  initApp();
};

async function initApp() {
  // Function to load and parse CSV
  async function loadNodesFromCSV(csvPath) {
    return new Promise((resolve) => {
      Papa.parse(csvPath, {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function (results) {
          const nodeData = results.data.map((row) => {
            // Parse objectives from CSV format
            const objectives = [];
            if (row.objectives) {
              const objPairs = row.objectives.split(";");
              objPairs.forEach((pair) => {
                const [text, color] = pair.split(":");
                if (text && color) {
                  let colorHex = color;
                  if (color.startsWith("#")) {
                    colorHex = parseInt(color.replace("#", ""), 16);
                  } else if (color.startsWith("0x")) {
                    colorHex = parseInt(color, 16);
                  } else {
                    colorHex = parseInt(color, 16);
                  }
                  objectives.push({
                    text: text.trim(),
                    color: colorHex,
                  });
                }
              });
            }

            return {
              id: row.id,
              x: parseFloat(row.x),
              y: parseFloat(row.y),
              parent: row.parent || null,
              unlocked:
                row.unlocked === true ||
                row.unlocked === "true" ||
                row.unlocked === 1,
              objectives: objectives,
            };
          });
          resolve(nodeData);
        },
      });
    });
  }

  const app = new Application();

  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  app.canvas.style.position = "absolute";
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";

  // Main tree container - everything goes in here
  const treeContainer = new Container();
  app.stage.addChild(treeContainer);

  // Load the tree background
  const texture = await Assets.load("tree_of_virtual_life_medium.png");
  const treeSprite = new Sprite(texture);
  treeContainer.addChild(treeSprite);
  //const nodelayer = new RenderLayer();

  // Container for connection lines (behind nodes)
  const connectionsContainer = new Container();
  treeContainer.addChild(connectionsContainer);

  // Container for all skill nodes
  const nodesContainer = new Container();
  treeContainer.addChild(nodesContainer);

  // Container for popups (always on top)
  const popupsContainer = new Container();
  treeContainer.addChild(popupsContainer);

  // Load nodes from CSV
  const nodeData = await loadNodesFromCSV("tree_of_virtual_life_nodes.csv");

  // Store node references
  const nodes = {};
  const connections = {};
  const popups = {};

  // Create skill nodes
  nodeData.forEach((data) => {
    const nodeContainer = new Container();
    nodeContainer.x = data.x;
    nodeContainer.y = data.y;

    // Create node circle
    const node = new Graphics();
    const radius = 400;

    // Draw outer ring
    node.circle(0, 0, radius + 3);
    node.stroke({ width: 3, color: data.unlocked ? 0x00ff00 : 0x555555 });

    // Draw inner circle
    node.circle(0, 0, radius);
    node.fill({
      color: data.unlocked ? 0x1a4d2e : 0x2a2a2a,
      alpha: data.unlocked ? 0.9 : 0.6,
    });

    // Add glow effect for unlocked nodes
    if (data.unlocked) {
      const glow = new Graphics();
      glow.circle(0, 0, radius + 8);
      glow.stroke({ width: 2, color: 0x00ff00, alpha: 0.3 });
      nodeContainer.addChild(glow);
    }

    nodeContainer.addChild(node);
    //nodelayer.attach(node)
    // Make node interactive
    nodeContainer.eventMode = "static";
    nodeContainer.cursor = "pointer";
    nodeContainer.hitArea = {
      contains: (x, y) => {
        const dx = x;
        const dy = y;
        return dx * dx + dy * dy <= radius * radius;
      },
    };

    // Create popup for this node
    const popup = createPopup(data.objectives);
    popup.visible = false;
    popup.x = data.x;
    popup.y = data.y - 80;
    popupsContainer.addChild(popup);
    popups[data.id] = popup;

    // Node interaction events
    nodeContainer.on("pointerover", () => {
      if (data.unlocked || isNodeClickable(data.id)) {
        nodeContainer.scale.set(1.1);
        popup.visible = true;
      }
    });

    nodeContainer.on("pointerout", () => {
      nodeContainer.scale.set(1);
      popup.visible = false;
    });

    nodeContainer.on("pointerdown", (e) => {
      e.stopPropagation();
      if (!data.unlocked && isNodeClickable(data.id)) {
        unlockNode(data.id);
      }
    });

    // Store references
    nodes[data.id] = {
      container: nodeContainer,
      data: data,
      graphics: node,
    };

    nodesContainer.addChild(nodeContainer);
  });

  // Create connections between nodes
  function createConnection(fromId, toId) {
    const fromNode = nodes[fromId];
    const toNode = nodes[toId];

    if (!fromNode || !toNode) return;

    const connection = new Graphics();
    connection.alpha = 0;

    connectionsContainer.addChild(connection);

    connections[`${fromId}-${toId}`] = {
      graphics: connection,
      from: fromNode.data,
      to: toNode.data,
      progress: 0,
      active: false,
      particles: [],
    };
  }

  // Initialize connections based on parent relationships
  nodeData.forEach((data) => {
    if (data.parent) {
      createConnection(data.parent, data.id);
    }
  });

  // Check if a node can be clicked (parent is unlocked)
  function isNodeClickable(nodeId) {
    const node = nodeData.find((n) => n.id === nodeId);
    if (!node || !node.parent) return false;
    const parent = nodeData.find((n) => n.id === node.parent);
    return parent && parent.unlocked;
  }

  // Unlock a node and create flowing animation
  function unlockNode(nodeId) {
    const node = nodeData.find((n) => n.id === nodeId);
    if (!node) return;

    node.unlocked = true;
    const nodeObj = nodes[nodeId];

    // Update node appearance
    const graphics = nodeObj.graphics;
    graphics.clear();

    // Redraw with unlocked style
    graphics.circle(0, 0, 43);
    graphics.stroke({ width: 3, color: 0x00ff00 });
    graphics.circle(0, 0, 40);
    graphics.fill({ color: 0x1a4d2e, alpha: 0.9 });

    // Add glow
    const glow = new Graphics();
    glow.circle(0, 0, 48);
    glow.stroke({ width: 2, color: 0x00ff00, alpha: 0.3 });
    nodeObj.container.addChildAt(glow, 0);

    // Activate connection animation
    if (node.parent) {
      const connectionKey = `${node.parent}-${nodeId}`;
      const connection = connections[connectionKey];
      if (connection) {
        connection.active = true;
        connection.alpha = 1;
      }
    }

    // Update child nodes to be clickable
    nodeData.forEach((n) => {
      if (n.parent === nodeId) {
        const childNode = nodes[n.id];
        if (childNode && !n.unlocked) {
          const childGraphics = childNode.graphics;
          childGraphics.clear();
          childGraphics.circle(0, 0, 43);
          childGraphics.stroke({ width: 3, color: 0xaaaa00 });
          childGraphics.circle(0, 0, 40);
          childGraphics.fill({ color: 0x3a3a1a, alpha: 0.8 });
        }
      }
    });
  }

  // Create popup with objectives
  function createPopup(objectives) {
    const popup = new Container();

    if (!objectives || objectives.length === 0) {
      return popup;
    }

    const padding = 10;
    const lineHeight = 25;
    const width = 240;
    const height = padding * 2 + objectives.length * lineHeight;

    // Background
    const bg = new Graphics();
    bg.roundRect(-width / 2, -height / 2, width, height, 10);
    bg.fill({ color: 0x1a1a1a, alpha: 0.95 });
    bg.stroke({ width: 2, color: 0x00ff00, alpha: 0.5 });
    popup.addChild(bg);

    // Add objectives text
    objectives.forEach((obj, index) => {
      const text = new Text({
        text: obj.text,
        style: {
          fontFamily: "Arial",
          fontSize: 14,
          fill: obj.color,
          dropShadow: {
            color: 0x000000,
            blur: 2,
            distance: 1,
          },
        },
      });
      text.x = -width / 2 + padding;
      text.y = -height / 2 + padding + index * lineHeight;
      popup.addChild(text);
    });

    return popup;
  }

  // Animation loop for flowing lines
  app.ticker.add((ticker) => {
    Object.values(connections).forEach((conn) => {
      if (conn.active) {
        const g = conn.graphics;
        g.clear();

        // Draw base line
        g.moveTo(conn.from.x, conn.from.y);
        g.lineTo(conn.to.x, conn.to.y);
        g.stroke({ width: 3, color: 0x00ff00, alpha: 0.3 });

        // Animate flow effect
        conn.progress += ticker.deltaTime * 0.02;
        if (conn.progress > 1) conn.progress = 0;

        // Draw flowing particles
        const particleCount = 5;
        for (let i = 0; i < particleCount; i++) {
          const t = (conn.progress + i / particleCount) % 1;
          const x = conn.from.x + (conn.to.x - conn.from.x) * t;
          const y = conn.from.y + (conn.to.y - conn.from.y) * t;

          g.circle(x, y, 3);
          g.fill({ color: 0x00ffaa, alpha: 1 - t * 0.5 });
        }
      }
    });
  });

  // Resize handler to fit design resolution to viewport
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

  // Interactive panning and zooming
  let isDragging = false;
  let dragStartPoint = null;
  let dragStartPosition = null;
  let currentZoom = 1;

  treeContainer.eventMode = "static";
  treeContainer.cursor = "grab";

  treeContainer.on("pointerdown", (event) => {
    isDragging = true;
    treeContainer.cursor = "grabbing";
    dragStartPoint = { x: event.global.x, y: event.global.y };
    dragStartPosition = { x: treeContainer.x, y: treeContainer.y };
    app.stage.on("globalpointermove", onDragMove);
  });

  app.stage.on("pointerup", () => {
    if (isDragging) {
      isDragging = false;
      treeContainer.cursor = "grab";
      app.stage.off("globalpointermove", onDragMove);
    }
  });

  app.stage.on("pointerupoutside", () => {
    if (isDragging) {
      isDragging = false;
      treeContainer.cursor = "grab";
      app.stage.off("globalpointermove", onDragMove);
    }
  });

  function onDragMove(event) {
    if (isDragging) {
      const deltaX = event.global.x - dragStartPoint.x;
      const deltaY = event.global.y - dragStartPoint.y;
      treeContainer.x = dragStartPosition.x + deltaX;
      treeContainer.y = dragStartPosition.y + deltaY;
    }
  }

  // Mouse wheel zoom centered on mouse position
  app.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const scaleFactor = 1.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom =
      direction > 0 ? currentZoom * scaleFactor : currentZoom / scaleFactor;

    // Limit zoom levels
    if (newZoom < 0.1 || newZoom > 5) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Calculate world position under mouse before zoom
    const worldX = (mouseX - treeContainer.x) / treeContainer.scale.x;
    const worldY = (mouseY - treeContainer.y) / treeContainer.scale.y;

    // Apply new zoom
    currentZoom = newZoom;
    const baseScale = Math.min(
      window.innerWidth / DESIGN_W,
      window.innerHeight / DESIGN_H,
    );
    treeContainer.scale.set(baseScale * currentZoom);

    // Adjust position to keep the same world point under the mouse
    treeContainer.x = mouseX - worldX * treeContainer.scale.x;
    treeContainer.y = mouseY - worldY * treeContainer.scale.y;
  });

  initDevtools({ app });

  // Initial resize and setup resize listener
  window.addEventListener("resize", resize);
  resize();

  document.body.appendChild(app.canvas);
}
