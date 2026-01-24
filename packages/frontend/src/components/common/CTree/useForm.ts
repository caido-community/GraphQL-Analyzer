import { useVirtualizer } from "@tanstack/vue-virtual";
import { type ReadonlyRefOrGetter } from "@vueuse/core";
import { computed, type Ref, ref, toValue } from "vue";

import { type ResolvedItem, type ResolvedRow, type TreeItem } from "./types";
import { isAbsent, isPresent } from "./utils";

export const useForm = <T, U = string>(options: {
  items: ReadonlyRefOrGetter<TreeItem<T, U>[]>;
  itemHeight: ReadonlyRefOrGetter<number>;
  search: ReadonlyRefOrGetter<string>;
  expandedKeys: Ref<Set<U>>;
  selectionKeys: Ref<Set<U>>;
}) => {
  const { items, itemHeight, search, expandedKeys, selectionKeys } = options;

  const parentRef = ref<HTMLElement>();

  const filteredItems = computed((): TreeItem<T, U>[] => {
    const searchTerm = toValue(search).toLowerCase().trim();
    const allItems = toValue(items);
    if (searchTerm === "") {
      return allItems;
    }

    const matchingItemIds = new Set<U>();
    const itemsToInclude = new Set<U>();

    allItems.forEach((item) => {
      if (item.label.toLowerCase().includes(searchTerm)) {
        matchingItemIds.add(item.id);
        itemsToInclude.add(item.id);
      }
    });

    const addParentChain = (itemId: U) => {
      const item = allItems.find((i) => i.id === itemId);
      if (item && isPresent(item.parentId)) {
        itemsToInclude.add(item.parentId);
        addParentChain(item.parentId);
      }
    };

    matchingItemIds.forEach(addParentChain);

    return allItems.filter((item) => itemsToInclude.has(item.id));
  });

  const childrenByParentId = computed(() => {
    const map = new Map<U, TreeItem<T, U>[]>();
    filteredItems.value.forEach((item) => {
      if (isPresent(item.parentId)) {
        const children = map.get(item.parentId) || [];
        children.push(item);
        map.set(item.parentId, children);
      }
    });
    return map;
  });

  const hasChildren = (itemId: U): boolean => {
    return childrenByParentId.value.has(itemId);
  };

  const resolvedItems = computed((): ResolvedItem<T, U>[] => {
    const result: ResolvedItem<T, U>[] = [];

    const addItem = (item: TreeItem<T, U>, depth: number) => {
      result.push({
        ...item,
        depth,
        hasChildren: item.hasChildren,
      });

      if (item.hasChildren && expandedKeys.value.has(item.id)) {
        const children = childrenByParentId.value.get(item.id) || [];
        children.forEach((child) => addItem(child, depth + 1));
      }
    };

    const rootItems = filteredItems.value.filter((item) =>
      isAbsent(item.parentId),
    );
    rootItems.forEach((item) => addItem(item, 0));

    return result;
  });

  const rowVirtualizer = useVirtualizer({
    get count() {
      return resolvedItems.value.length;
    },
    getScrollElement: () => parentRef.value ?? null,
    estimateSize: () => toValue(itemHeight),
    overscan: 5,
  });

  const resolvedRows = computed((): ResolvedRow<T, U>[] => {
    const virtualItems = rowVirtualizer.value.getVirtualItems();
    return virtualItems
      .map((virtualItem) => {
        const resolvedItem = resolvedItems.value[virtualItem.index];
        if (!resolvedItem) return undefined;
        return {
          virtualItem,
          resolvedItem,
        };
      })
      .filter(isPresent);
  });

  const onToggleExpand = (itemId: U) => {
    const newExpandedKeys = new Set(expandedKeys.value);
    if (newExpandedKeys.has(itemId)) {
      newExpandedKeys.delete(itemId);
    } else {
      newExpandedKeys.add(itemId);
    }
    expandedKeys.value = newExpandedKeys;
  };

  const onToggleSelect = (itemId: U) => {
    selectionKeys.value.clear();
    selectionKeys.value.add(itemId);
  };

  const isExpanded = (itemId: U) => expandedKeys.value.has(itemId);
  const isSelected = (itemId: U) => selectionKeys.value.has(itemId);

  return {
    parentRef,
    rowVirtualizer,
    resolvedRows,
    resolvedItems,
    hasChildren,
    onToggleExpand,
    onToggleSelect,
    isExpanded,
    isSelected,
  };
};
