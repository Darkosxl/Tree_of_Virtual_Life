import { deepTeal, brightAqua, burntOrange } from "./node_drawer";
// ---------------------------------------------------------------------------
// Map your three palettes to a logical status enum
// ---------------------------------------------------------------------------
export enum NodeStatus {
  Locked = "locked",
  Available = "available",
  Learned = "learned",
}

export const statusToTheme = {
  [NodeStatus.Locked]: deepTeal, // from themedNodes.ts
  [NodeStatus.Available]: brightAqua,
  [NodeStatus.Learned]: burntOrange,
};
