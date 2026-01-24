import type { VirtualItem } from "@tanstack/vue-virtual";

export type TreeItem<T = unknown, U = string> = {
  id: U;
  data: T;
  label: string;
  hasChildren: boolean;
  parentId: U | undefined;
  icon?: string;
};

export type ResolvedItem<T, U = string> = TreeItem<T, U> & {
  depth: number;
  hasChildren: boolean;
};

export type ResolvedRow<T, U = string> = {
  virtualItem: VirtualItem;
  resolvedItem: ResolvedItem<T, U>;
};
