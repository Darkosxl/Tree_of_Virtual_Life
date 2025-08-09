import * as THREE from "three";
import * as PIXI from "pixi.js";

class PixiWaterFlowRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private pixiApp: PIXI.Application;

  constructor(pixiApp: PIXI.Application) {
    this.pixiApp = pixiApp;
    this.initThreeJS();
  }

  private initThreeJS() {
    // Scene setup
    this.scene = new THREE.Scene();

    // Orthographic camera for 2.5D effect
    const aspect = this.pixiApp.screen.width / this.pixiApp.screen.height;
    this.camera = new THREE.OrthographicCamera(
      -5 * aspect,
      5 * aspect,
      5,
      -5,
      0.1,
      100,
    );
    this.camera.position.z = 1;

    // Use PixiJS WebGL context - Updated for PixiJS v8
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.pixiApp.canvas,
      context: this.pixiApp.renderer.gl,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    this.renderer.autoClear = false;
    this.renderer.setSize(
      this.pixiApp.screen.width,
      this.pixiApp.screen.height,
    );

    // Handle resize
    this.pixiApp.renderer.on("resize", (width: number, height: number) => {
      const aspect = width / height;
      this.camera.left = -5 * aspect;
      this.camera.right = 5 * aspect;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  public renderWaterFlows() {
    // Reset Three.js state
    this.renderer.resetState();

    // Render Three.js scene on top of PixiJS
    this.renderer.render(this.scene, this.camera);

    // Reset PixiJS state - Updated for PixiJS v8 API
    this.pixiApp.renderer.resetState();
  }

  public linkWaterFlow(
    x_initial: number,
    y_initial: number,
    x_final: number,
    y_final: number,
  ) {
    // Convert normalized coordinates (-1 to 1) to world coordinates
    const aspect = this.pixiApp.screen.width / this.pixiApp.screen.height;
    const startPoint = new THREE.Vector2(x_initial * 5 * aspect, y_initial * 5);
    const endPoint = new THREE.Vector2(x_final * 5 * aspect, y_final * 5);

    // Create curved path with gravity effect
    const curve = new THREE.QuadraticBezierCurve(
      startPoint,
      new THREE.Vector2(
        (startPoint.x + endPoint.x) / 2,
        Math.min(startPoint.y, endPoint.y) - 1, // Gravity effect
      ),
      endPoint,
    );

    // Get points along the curve
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    );

    // Simple line material with blue color
    const material = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    // Animate the line drawing
    this.animateLineDrawing(line, points.length);
  }

  private animateLineDrawing(line: THREE.Line, totalPoints: number) {
    let currentPoints = 0;
    const geometry = line.geometry as THREE.BufferGeometry;

    const animate = () => {
      currentPoints += 2;
      if (currentPoints >= totalPoints) return;

      // Update geometry to show progressive drawing
      geometry.setDrawRange(0, currentPoints);
      requestAnimationFrame(animate);
    };

    animate();
  }
}

// Global instance
let waterFlowInstance: PixiWaterFlowRenderer | null = null;

// Initialize with PixiJS app
export function initWaterFlowWithPixi(pixiApp: PIXI.Application) {
  waterFlowInstance = new PixiWaterFlowRenderer(pixiApp);

  // Hook into PixiJS render loop
  pixiApp.ticker.add(() => {
    if (waterFlowInstance) {
      waterFlowInstance.renderWaterFlows();
    }
  });
}

// Export function to create water flow
export function linkWaterFlow(
  x_initial: number,
  y_initial: number,
  x_final: number,
  y_final: number,
) {
  if (!waterFlowInstance) {
    console.error(
      "Water flow not initialized. Call initWaterFlowWithPixi(pixiApp) first.",
    );
    return;
  }

  waterFlowInstance.linkWaterFlow(x_initial, y_initial, x_final, y_final);
}

// Alternative: Pure PixiJS implementation (no Three.js)
export function linkWaterFlowPixiOnly(
  pixiApp: PIXI.Application,
  x_initial: number,
  y_initial: number,
  x_final: number,
  y_final: number,
) {
  const graphics = new PIXI.Graphics();

  // Convert normalized coords to screen coords
  const startX = (x_initial + 1) * pixiApp.screen.width * 0.5;
  const startY = (-y_initial + 1) * pixiApp.screen.height * 0.5;
  const endX = (x_final + 1) * pixiApp.screen.width * 0.5;
  const endY = (-y_final + 1) * pixiApp.screen.height * 0.5;

  // Create curved path with gravity
  const midX = (startX + endX) * 0.5;
  const midY = Math.max(startY, endY) + 100; // Gravity effect

  // Draw water line
  graphics.lineStyle(4, 0x00aaff, 0.8);
  graphics.moveTo(startX, startY);
  graphics.quadraticCurveTo(midX, midY, endX, endY);

  pixiApp.stage.addChild(graphics);

  // Simple animation
  let progress = 0;
  const animate = () => {
    progress += 0.02;
    if (progress >= 1) return;

    graphics.clear();
    graphics.lineStyle(4, 0x00aaff, 0.8);
    graphics.moveTo(startX, startY);

    // Animate curve drawing
    const currentMidX = startX + (midX - startX) * progress;
    const currentMidY = startY + (midY - startY) * progress;
    const currentEndX = startX + (endX - startX) * progress;
    const currentEndY = startY + (endY - startY) * progress;

    graphics.quadraticCurveTo(
      currentMidX,
      currentMidY,
      currentEndX,
      currentEndY,
    );

    requestAnimationFrame(animate);
  };

  animate();
}
