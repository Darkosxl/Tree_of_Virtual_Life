import { Container } from "pixi.js";
import { makeThemedNode } from "./node_drawer";
import { NodeStatus, statusToTheme } from "./nodeTypes";

export class UINode {
  readonly x: number;
  readonly y: number;
  status: NodeStatus;
  readonly container: Container;
  neighbours: UINode[] = [];

  constructor(x: number, y: number, status: NodeStatus) {
    this.x = x;
    this.y = y;
    this.status = status;

    // REAL Pixi display object:
    this.container = makeThemedNode(x, y, 48, statusToTheme[status]);
    
    // Defensive check in constructor
    if (!this.container || typeof this.container.updateLocalTransform !== "function") {
      console.error("makeThemedNode returned invalid object:", this.container, "for status:", status, "theme:", statusToTheme[status]);
      throw new Error("makeThemedNode did not return a valid DisplayObject");
    }
  }
}
