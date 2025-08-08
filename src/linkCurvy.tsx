// src/linkCurvy.ts  〈— exact file path

import { Container, Texture, Point, Ticker, Mesh, MeshGeometry, Shader } from "pixi.js";

/* 1 ▸  repeat-wrapped cyan streak texture  */
const FLOW_TEX = (() => {
  const W = 64, H = 4, c = document.createElement("canvas");
  Object.assign(c, { width: W, height: H });
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.0, "rgba(0,255,255,0)");
  g.addColorStop(0.48,"rgba(0,255,255,0.9)");
  g.addColorStop(0.52,"rgba(0,255,255,0.9)");
  g.addColorStop(1.0, "rgba(0,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const tex = Texture.from(c);
  tex.source.wrapMode = "repeat";            // v8 alias for baseTexture
  return tex;
})();

/* 2 ▸  quadratic-bezier sampling helper */
function bezier(
  a: Point, b: Point, sag = 0.25, steps = 24,
): Point[] {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const nx =  b.y - a.y,      ny = -(b.x - a.x);
  const d  = Math.hypot(nx, ny) || 1;
  const cx = mx + (nx / d) * sag * Math.hypot(b.x - a.x, b.y - a.y);
  const cy = my + (ny / d) * sag * Math.hypot(b.x - a.x, b.y - a.y);

  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push(new Point(
      u*u*a.x + 2*u*t*cx + t*t*b.x,
      u*u*a.y + 2*u*t*cy + t*t*b.y,
    ));
  }
  return out;
}

/* 3 ▸  create rope mesh geometry from points */
function createRopeGeometry(points: Point[], thickness = 2): MeshGeometry {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  
  const totalLength = points.reduce((sum, point, i) => {
    if (i === 0) return 0;
    return sum + Math.hypot(point.x - points[i-1].x, point.y - points[i-1].y);
  }, 0);
  
  let currentLength = 0;
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Calculate normal vector (perpendicular to the rope direction)
    let normalX = 0, normalY = 0;
    if (i === 0 && points.length > 1) {
      // First point: use direction to next point
      const next = points[1];
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      normalX = -dy;
      normalY = dx;
    } else if (i === points.length - 1) {
      // Last point: use direction from previous point
      const prev = points[i - 1];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      normalX = -dy;
      normalY = dx;
    } else {
      // Middle points: average of adjacent segments
      const prev = points[i - 1];
      const next = points[i + 1];
      const dx1 = point.x - prev.x;
      const dy1 = point.y - prev.y;
      const dx2 = next.x - point.x;
      const dy2 = next.y - point.y;
      normalX = -(dy1 + dy2) / 2;
      normalY = (dx1 + dx2) / 2;
    }
    
    // Normalize the normal vector
    const normalLength = Math.hypot(normalX, normalY) || 1;
    normalX = (normalX / normalLength) * thickness;
    normalY = (normalY / normalLength) * thickness;
    
    // Create two vertices (top and bottom of the rope)
    const vertexIndex = i * 2;
    
    // Top vertex
    vertices.push(point.x + normalX, point.y + normalY);
    // Bottom vertex  
    vertices.push(point.x - normalX, point.y - normalY);
    
    // Calculate UV coordinates
    if (i > 0) {
      const prev = points[i - 1];
      currentLength += Math.hypot(point.x - prev.x, point.y - prev.y);
    }
    const u = totalLength > 0 ? currentLength / totalLength : 0;
    
    // UV coordinates (u along the rope, v across the rope)
    uvs.push(u, 0); // top vertex
    uvs.push(u, 1); // bottom vertex
    
    // Create triangles (except for the last point)
    if (i < points.length - 1) {
      const currentTop = vertexIndex;
      const currentBottom = vertexIndex + 1;
      const nextTop = vertexIndex + 2;
      const nextBottom = vertexIndex + 3;
      
      // First triangle
      indices.push(currentTop, currentBottom, nextTop);
      // Second triangle  
      indices.push(currentBottom, nextBottom, nextTop);
    }
  }
  
  const geometry = new MeshGeometry({
    positions: vertices,
    uvs: uvs,
    indices: indices,
  });
  
  return geometry;
}

/* 4 ▸  main export */
export function linkCurvy(
  nodes: { x: number; y: number }[],
  into:  Container,
  sag = 0.25,
): void {
  if (nodes.length < 2) return;

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const points = bezier(new Point(a.x, a.y), new Point(b.x, b.y), sag);
    
    // Create rope geometry and shader
    const geometry = createRopeGeometry(points, 1); // 1px thickness, will be scaled
    const shader = Shader.from(
      // Vertex shader
      `
      attribute vec2 aPosition;
      attribute vec2 aUV;
      
      uniform mat3 projectionMatrix;
      uniform mat3 translationMatrix;
      
      varying vec2 vUV;
      
      void main() {
        vUV = aUV;
        vec3 position = projectionMatrix * translationMatrix * vec3(aPosition, 1.0);
        gl_Position = vec4(position, 1.0);
      }
      `,
      // Fragment shader  
      `
      precision mediump float;
      
      varying vec2 vUV;
      uniform sampler2D uTexture;
      uniform float uAlpha;
      
      void main() {
        gl_FragColor = texture2D(uTexture, vUV) * uAlpha;
      }
      `,
      // Uniforms
      {
        uTexture: FLOW_TEX,
        uAlpha: 1.0,
      }
    );
    
    // Create the mesh rope
    const rope = new Mesh(geometry, shader);
    rope.scale.y = 0.5;                // ≈2 px thick
    
    // Defensive check to prevent crashes
    if (!rope || typeof rope.updateLocalTransform !== "function") {
      console.error("Invalid rope object:", rope);
      throw new Error("Mesh rope is not a valid DisplayObject");
    }
    
    into.addChild(rope);

    /* water-flow scroll */
    let scrollOffset = 0;
    Ticker.shared.add(() => {
      scrollOffset += 0.002;
      // Update shader uniforms for animation
      shader.uniforms.uAlpha = 0.8 + 0.2 * Math.sin(scrollOffset * 10);
    });
  }
}
