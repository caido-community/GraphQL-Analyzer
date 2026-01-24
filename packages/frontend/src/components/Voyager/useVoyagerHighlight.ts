import * as d3 from "d3";
import { ref, type Ref } from "vue";

import type { D3Link, D3Node } from "./types";

export function useVoyagerHighlight(
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: D3Link[] } | undefined>,
) {
  const highlightedNodeId = ref<number | undefined>(undefined);

  const findParentChain = (
    nodeId: number,
    nodes: D3Node[],
    links: D3Link[],
  ): number[] => {
    const chain = [nodeId];
    const incomingLinks = links.filter((link: D3Link) => {
      const target =
        typeof link.target === "object" ? link.target.id : link.target;
      return target === nodeId;
    });

    for (const link of incomingLinks) {
      const source =
        typeof link.source === "object" ? link.source.id : link.source;
      const parentChain = findParentChain(source, nodes, links);
      chain.push(...parentChain);
    }

    return [...new Set(chain)];
  };

  const updateNodeStyles = (nodes: D3Node[], highlightedIds: number[]) => {
    if (voyagerContainer.value === undefined) return;

    const svg = d3.select(voyagerContainer.value).select("svg");

    svg.selectAll<SVGGElement, D3Node>(".node").each(function (d: D3Node) {
      const nodeGroup = d3.select(this as SVGElement);
      const isHighlighted = highlightedIds.includes(d.id);

      nodeGroup
        .style(
          "opacity",
          highlightedIds.length === 0 ? 1 : isHighlighted ? 1 : 0.3,
        )
        .select("rect")
        .attr("stroke-width", isHighlighted ? 3 : 2);
    });

    svg.selectAll<SVGLineElement, D3Link>(".link").each(function (d: D3Link) {
      const link = d3.select(this as SVGElement);
      const sourceId = typeof d.source === "object" ? d.source.id : d.source;
      const targetId =
        typeof d.target === "object" && d.target !== undefined
          ? d.target.id
          : typeof d.target === "number"
            ? d.target
            : undefined;
      const isLinkHighlighted =
        targetId !== undefined &&
        highlightedIds.includes(sourceId) &&
        highlightedIds.includes(targetId);
      link.style(
        "opacity",
        highlightedIds.length === 0 ? 0.9 : isLinkHighlighted ? 0.9 : 0.2,
      );
    });
  };

  const toggleNodeHighlight = (nodeData: D3Node) => {
    if (cachedD3Data.value === undefined) return;

    const { nodes, links } = cachedD3Data.value;

    if (highlightedNodeId.value === nodeData.id) {
      highlightedNodeId.value = undefined;
      updateNodeStyles(nodes, []);
    } else {
      highlightedNodeId.value = nodeData.id;
      const parentChain = findParentChain(nodeData.id, nodes, links);
      updateNodeStyles(nodes, parentChain);
    }
  };

  return {
    highlightedNodeId,
    updateNodeStyles,
    toggleNodeHighlight,
  };
}
