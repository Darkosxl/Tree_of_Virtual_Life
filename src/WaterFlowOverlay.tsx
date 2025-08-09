// WaterFlowOverlay.ts
import * as THREE from "three";
import type { Application, Container } from "pixi.js";

type Pt = { x: number; y: number };

type FlowOptions = {
  color?: number;           // body color (gold by default)
  edgeColor?: number;       // pale rim tint
  opacity?: number;         // overall alpha
  radiusPx?: number;        // line thickness
  bend?: number;            // curve bend (px downward)
  speed?: number;           // (kept for API) currents speed (unused in PoE mode)
  streakDensity?: number;   // (kept for API) currents density (unused)
  nodeRadiusPx?: number;    // visual node radius
  endUnderlapPx?: number;   // extend under node ring to avoid a seam
  taperPx?: number;         // fade near the ends
  glowScale?: number;       // soft halo scale
};

type Flow = {
  from: Pt; to: Pt;
  opts: Required<FlowOptions>;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uBase: { value: THREE.Color };
    uEdge: { value: THREE.Color };
    uOpacity: { value: number };
    uSpeed: { value: number };
    uStreakDensity: { value: number };
    uTaper: { value: number };
  };
};

export class WaterFlowOverlay {
  private mount: HTMLElement;
  private app: Application;
  private tree: Container;
  private dprCap: number;

  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  private flows: Flow[] = [];
  private last = performance.now();
  private raf: number | null = null;

  constructor(args: {
    mount: HTMLElement;
    pixiApp: Application;
    treeContainer: Container;
    designW: number; // kept for parity
    designH: number; // kept for parity
    dprCap?: number;
  }) {
    this.mount = args.mount;
    this.app = args.pixiApp;
    this.tree = args.treeContainer;
    this.dprCap = args.dprCap ?? 2;

    // Transparent overlay UNDER Pixi (Pixi canvas should be zIndex: "10")
    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "0", // << under Pixi
    } as CSSStyleDeclaration);
    this.mount.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    // sRGB output (fallback for older three versions)
    (this.renderer as any).outputColorSpace =
      (THREE as any).SRGBColorSpace ?? (THREE as any).sRGBEncoding;

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(
      0, window.innerWidth, 0, window.innerHeight, -100, 100
    );
    this.camera.top = 0;
    this.camera.bottom = window.innerHeight;
    this.camera.updateProjectionMatrix();

    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.start();
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer.dispose();
    this.canvas.remove();
  }

  link(x1: number, y1: number, x2: number, y2: number, o?: FlowOptions) {
    // PoE-ish defaults (thin gold, subtle halo, whisper pulse)
    const opts: Required<FlowOptions> = {
      color:         o?.color         ?? 0xFFD46A,  // warm gold
      edgeColor:     o?.edgeColor     ?? 0xFFF0BF,  // pale rim
      opacity:       o?.opacity       ?? 1.0,
      radiusPx:      o?.radiusPx      ?? 3.5,
      bend:          o?.bend          ?? 110,
      speed:         o?.speed         ?? 0.0,       // currents off (kept for API)
      streakDensity: o?.streakDensity ?? 0.0,       // currents off (kept for API)
      nodeRadiusPx:  o?.nodeRadiusPx  ?? 26,
      endUnderlapPx: o?.endUnderlapPx ?? 3,
      taperPx:       o?.taperPx       ?? 18,
      glowScale:     o?.glowScale     ?? 1.18,
    };

    const A = this.designToScreen(x1, y1);
    const Bfull = this.designToScreen(x2, y2);
    const B = this.shortenUnderNode(
      new THREE.Vector2(A.x, A.y),
      new THREE.Vector2(Bfull.x, Bfull.y),
      opts.nodeRadiusPx + opts.endUnderlapPx
    );

    // Curve geometry
    const ctrl = { x: (A.x + B.x) * 0.5, y: Math.max(A.y, B.y) + opts.bend };
    const pts: THREE.Vector3[] = [];
    const segs = 128;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * ctrl.x + t * t * B.x;
      const y = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * ctrl.y + t * t * B.y;
      pts.push(new THREE.Vector3(x, y, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, Math.max(64, segs * 2), opts.radiusPx, 20, false);

    // Shared uniforms (pulse only; no streaks)
    const uniforms = {
      uTime:          { value: 0 },
      uBase:          { value: new THREE.Color(opts.color) },
      uEdge:          { value: new THREE.Color(opts.edgeColor) },
      uOpacity:       { value: opts.opacity },
      uSpeed:         { value: opts.speed },
      uStreakDensity: { value: opts.streakDensity },
      uTaper:         { value: opts.taperPx },
    };

    // Core wire — opaque-ish look (Normal blending), tapered ends
    const coreMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CORE_VS,
      fragmentShader: CORE_FS_POE,
      transparent: true,
      blending: THREE.NormalBlending, // not additive
      depthWrite: false,
    });
    const core = new THREE.Mesh(tube, coreMat);
    core.frustumCulled = false;

    // Very subtle halo
    const glowGeom = tube.clone();
    (glowGeom as THREE.BufferGeometry).scale(opts.glowScale, opts.glowScale, opts.glowScale);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uOpacity: { value: Math.min(opts.opacity * 0.35, 0.35) } },
      vertexShader: CORE_VS,
      fragmentShader: GLOW_FS_POE,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.frustumCulled = false;

    this.scene.add(glow, core);
    this.flows.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, opts, core, glow, uniforms });
  }

  clear() {
    for (const f of this.flows) {
      this.scene.remove(f.core, f.glow);
      (f.core.material as any).dispose?.(); (f.core.geometry as any).dispose?.();
      (f.glow.material as any).dispose?.(); (f.glow.geometry as any).dispose?.();
    }
    this.flows = [];
  }

  // ---------------- internals ----------------
  private designToScreen(x: number, y: number) {
    const s = this.tree.scale.x; // uniform scale
    return { x: this.tree.position.x + x * s, y: this.tree.position.y + y * s };
  }

  private shortenUnderNode(a: THREE.Vector2, b: THREE.Vector2, r: number) {
    const dir = new THREE.Vector2().subVectors(b, a);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    return new THREE.Vector2().copy(b).addScaledVector(dir, -r);
  }

  private start() {
    const loop = () => {
      const now = performance.now();
      const dt = (now - this.last) / 1000;
      this.last = now;

      // whisper-of-life pulse (uTime drives breathing in shader)
      for (const f of this.flows) f.uniforms.uTime.value += dt;

      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private onResize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.right = w; this.camera.bottom = h; this.camera.updateProjectionMatrix();

    // rebuild geometries to respect new scaling/position
    const keep = [...this.flows];
    this.clear();
    for (const f of keep) this.link(f.from.x, f.from.y, f.to.x, f.to.y, f.opts);
  };
}

/* ======================= SHADERS ======================= */

const CORE_VS = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// PoE-style beveled gold wire with subtle breathing pulse; tapered ends
const CORE_FS_POE = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uBase;        // gold base
  uniform vec3  uEdge;        // pale rim
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpeed;         // kept for API
  uniform float uStreakDensity; // kept for API
  uniform float uTaper;

  float taperMask(float y){
    // fade near both ends
    float a = smoothstep(0.0, 0.06, y);
    float b = smoothstep(1.0, 1.0 - 0.06, y);
    return a * b;
  }

  void main() {
    // 0 at rim, 1 at center
    float r = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float body  = smoothstep(0.0, 0.85, r);
    float ridge = smoothstep(0.55, 1.0, r);   // inner highlight
    float rim   = smoothstep(0.72, 0.98, r);  // outer bevel

    // darker core -> warm gold -> pale rim tint
    vec3 dark = mix(vec3(0.18,0.12,0.02), uBase * 0.75, body);
    vec3 col  = mix(dark, uBase, ridge);
    col += uEdge * 0.25 * rim;

    // whisper-of-life breathing (very subtle)
    float pulse = 0.04 * sin(uTime * 0.9);
    col *= (1.0 + pulse);

    float alpha = uOpacity * max(body, 0.10) * taperMask(vUv.y);
    gl_FragColor = vec4(col, alpha);
  }
`;

const GLOW_FS_POE = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uBase;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uStreakDensity;

  void main(){
    float r = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float halo = smoothstep(0.0, 0.50, r);
    // faint breathing so halo feels alive
    float breathe = 0.10 + 0.10 * sin(uTime * 0.6);
    vec3 col = uBase * (0.30 * halo + breathe * halo);
    gl_FragColor = vec4(col, uOpacity * halo);
  }
`;
