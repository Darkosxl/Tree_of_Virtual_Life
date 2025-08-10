import { Container, Graphics } from "pixi.js";
import { UINode } from "./UINode";

export type EdgeKind = "linear" | "curvy";

export type EdgeStyle = {
  coreColor: number;
  coreWidth: number;
  shadowColor: number;
  shadowWidth: number;
  alpha: number;
  nodeRadiusPx: number;
  bend: number; // curvature strength (px) for curvy
};

const DEFAULT_STYLE: EdgeStyle = {
  coreColor: 0xC6A24A,   // same dim gold as node rim
  coreWidth: 3.6,        // thicker
  shadowColor: 0x121007, // soft dark outline
  shadowWidth: 7,
  alpha: 0.95,
  nodeRadiusPx: 26,
  bend: 110,
};

export class UIEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;

  private from: UINode;
  private to: UINode;
  readonly container: Container;
  private g: Graphics;
  private style: EdgeStyle;
  private kind: EdgeKind;

  constructor(
    from: UINode,
    to: UINode,
    kind: EdgeKind = "curvy",
    id?: string,
    style?: Partial<EdgeStyle>,
  ) {
    this.from = from;
    this.to = to;
    this.fromId = from.id;
    this.toId = to.id;
    this.id = id ?? `E_${from.id}_${to.id}`;
    this.kind = kind;
    this.style = { ...DEFAULT_STYLE, ...(style || {}) };

    this.container = new Container();
    this.g = new Graphics();
    this.container.addChild(this.g);

    this.update();
  }

  update() {
    const s = this.style;

    const sx = this.from.x;
    const sy = this.from.y;
    const ex = this.to.x;
    const ey = this.to.y;

    const dx = ex - sx;
    const dy = ey - sy;
    const d = Math.hypot(dx, dy) || 1;

    // trim to node edges
    const nx = dx / d;
    const ny = dy / d;
    const startX = sx + nx * s.nodeRadiusPx;
    const startY = sy + ny * s.nodeRadiusPx;
    const endX = ex - nx * s.nodeRadiusPx;
    const endY = ey - ny * s.nodeRadiusPx;

    this.g.clear();

    if (this.kind === "linear") {
      // shadow
      this.g.moveTo(startX, startY).lineTo(endX, endY).stroke({
        color: s.shadowColor,
        width: s.shadowWidth,
        alpha: 0.22,
        cap: "round",
        join: "round",
      });
      // core
      this.g.moveTo(startX, startY).lineTo(endX, endY).stroke({
        color: s.coreColor,
        width: s.coreWidth,
        alpha: s.alpha,
        cap: "round",
        join: "round",
      });
    } else {
      // control point: midpoint + perpendicular offset
      const mx = (startX + endX) * 0.5;
      const my = (startY + endY) * 0.5;
      const px = -ny; // perp
      const py = nx;
      const bend = Math.min(s.bend, d * 0.5);
      const cx = mx + px * bend;
      const cy = my + py * bend;

      // shadow
      this.g.moveTo(startX, startY).quadraticCurveTo(cx, cy, endX, endY).stroke({
        color: s.shadowColor,
        width: s.shadowWidth,
        alpha: 0.22,
        cap: "round",
        join: "round",
      });

      // core
      this.g.moveTo(startX, startY).quadraticCurveTo(cx, cy, endX, endY).stroke({
        color: s.coreColor,
        width: s.coreWidth,
        alpha: s.alpha,
        cap: "round",
        join: "round",
      });
    }
  }

  destroy() {
    this.container.removeChild(this.g);
    // @ts-ignore
    this.g.destroy?.();
    // @ts-ignore
    this.container.destroy?.({ children: true });
  }
}
