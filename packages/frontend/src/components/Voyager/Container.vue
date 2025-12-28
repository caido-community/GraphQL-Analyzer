<script setup lang="ts">
import * as d3 from "d3";
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

const props = defineProps<{
  navigateTo?: (
    page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History",
  ) => void;
}>();

const LAYOUT = {
  ROOT_SPACING: 80,
  COLUMN_SPACING: 150,
  NODE_SPACING: 40,
  ENUM_SPACING: 40,
  MAX_HEIGHT_PER_COLUMN: 1400,
  MIN_WIDTH: 200,
  MAX_WIDTH: 950,
  MIN_HEIGHT: 80,
  HEADER_HEIGHT: 30,
  FIELD_HEIGHT: 18,
  PADDING: 20,
};

const sessions = ref<any[]>([]);
const selectedSessionId = ref<string | null>(null);
const voyagerContainer = ref<HTMLDivElement>();
const minimapSvg = ref<SVGSVGElement>();

const highlightedNodeId = ref<number | null>(null);
const cachedD3Data = ref<{ nodes: any[]; links: any[] } | null>(null);
const searchDebounceTimer = ref<number | null>(null);
const currentZoom = ref<any>(null);
const currentTransform = ref<any>(d3.zoomIdentity);

const selectedSession = computed(() =>
  sessions.value.find((s: any) => s.id === selectedSessionId.value),
);

const introspectionSessions = computed(() =>
  sessions.value.filter((s: any) => s.supportsIntrospection),
);

const minimapViewBox = computed(() => {
  if (!cachedD3Data.value || cachedD3Data.value.nodes.length === 0) {
    return { x: 0, y: 0, width: 1000, height: 1000 };
  }

  const nodes = cachedD3Data.value.nodes;
  const minX = Math.min(...nodes.map((n: any) => n.x)) - 50;
  const maxX = Math.max(...nodes.map((n: any) => n.x + n.width)) + 50;
  const minY = Math.min(...nodes.map((n: any) => n.y)) - 50;
  const maxY = Math.max(...nodes.map((n: any) => n.y + n.height)) + 50;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
});

const searchTerm = ref("");
const debouncedSearchTerm = ref("");
const currentSchema = ref<any>(null);
const isNavExpanded = ref(true);

watch(searchTerm, (newValue: string) => {
  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
  }
  searchDebounceTimer.value = window.setTimeout(() => {
    debouncedSearchTerm.value = newValue;
  }, 300);
});

watch(debouncedSearchTerm, () => {
  if (selectedSession.value && cachedD3Data.value) {
    loadVoyagerVisualization();
  }
});

// Collapse/expand state for navigation sections
const expandedSections = ref<Record<string, boolean>>({
  Query: true,
  Mutation: true,
  Subscription: true,
});

const filteredItems = computed(() => {
  if (!currentSchema.value) return [];

  const items: any[] = [];

  // Add root operations
  if (currentSchema.value.queries) {
    items.push({
      name: "Query",
      type: "root",
      children: currentSchema.value.queries.map((q: any) => ({
        name: q.name,
        type: "query",
        parent: "Query",
      })),
    });
  }

  if (currentSchema.value.mutations) {
    items.push({
      name: "Mutation",
      type: "root",
      children: currentSchema.value.mutations.map((m: any) => ({
        name: m.name,
        type: "mutation",
        parent: "Mutation",
      })),
    });
  }

  if (currentSchema.value.subscriptions) {
    items.push({
      name: "Subscription",
      type: "root",
      children: currentSchema.value.subscriptions.map((s: any) => ({
        name: s.name,
        type: "subscription",
        parent: "Subscription",
      })),
    });
  }

  // Add types
  if (currentSchema.value.types) {
    currentSchema.value.types.forEach((type: any) => {
      items.push({
        name: type.name,
        type: "type",
        children: (type.fields || []).map((f: any) => ({
          name: f.name,
          fullSignature: formatFieldSignature(f), // Full signature for display
          fieldData: f, // Keep full field data
          type: "field",
          parent: type.name,
        })),
      });
    });
  }

  // Add enums
  if (currentSchema.value.enums) {
    currentSchema.value.enums.forEach((enumType: any) => {
      items.push({
        name: enumType.name,
        type: "enum",
        children: (enumType.values || []).map((v: any) => ({
          name: v.name,
          fullSignature: v.name, // Enum values don't have complex signatures
          fieldData: v, // Keep full field data
          type: "enumValue",
          parent: enumType.name,
        })),
      });
    });
  }

  if (!debouncedSearchTerm.value.trim()) return items;

  const search = debouncedSearchTerm.value.toLowerCase();
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(search) ||
      item.children?.some((child: any) =>
        child.name.toLowerCase().includes(search),
      ),
  );
});

const zoomIn = () => {
  if (!voyagerContainer.value || !currentZoom.value) return;
  const svg = d3.select(voyagerContainer.value).select("svg");
  svg.transition().duration(300).call(currentZoom.value.scaleBy, 1.3);
};

const zoomOut = () => {
  if (!voyagerContainer.value || !currentZoom.value) return;
  const svg = d3.select(voyagerContainer.value).select("svg");
  svg.transition().duration(300).call(currentZoom.value.scaleBy, 0.7);
};

const resetZoom = () => {
  if (!voyagerContainer.value || !currentZoom.value) return;
  const svg = d3.select(voyagerContainer.value).select("svg");
  svg
    .transition()
    .duration(500)
    .call(currentZoom.value.transform, d3.zoomIdentity);
};

const fitToView = () => {
  if (!voyagerContainer.value || !cachedD3Data.value || !currentZoom.value)
    return;

  const { nodes } = cachedD3Data.value;
  if (nodes.length === 0) return;

  const minX = Math.min(...nodes.map((n: any) => n.x));
  const maxX = Math.max(...nodes.map((n: any) => n.x + n.width));
  const minY = Math.min(...nodes.map((n: any) => n.y));
  const maxY = Math.max(...nodes.map((n: any) => n.y + n.height));

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  const containerRect = voyagerContainer.value.getBoundingClientRect();
  const padding = 50;

  const scaleX = (containerRect.width - padding * 2) / contentWidth;
  const scaleY = (containerRect.height - padding * 2) / contentHeight;
  const scale = Math.min(scaleX, scaleY, 1);

  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;
  const contentCenterX = (minX + maxX) / 2;
  const contentCenterY = (minY + maxY) / 2;

  const translateX = centerX - contentCenterX * scale;
  const translateY = centerY - contentCenterY * scale;

  const svg = d3.select(voyagerContainer.value).select("svg");
  svg
    .transition()
    .duration(750)
    .call(
      currentZoom.value.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale),
    );
};

const focusOnNode = (nodeData: any) => {
  if (!voyagerContainer.value || !currentZoom.value) return;

  const svg = d3.select(voyagerContainer.value).select("svg");
  const g = svg.select("g");

  const containerRect = voyagerContainer.value.getBoundingClientRect();
  if (!containerRect) return;

  const scale = 1.2;
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;
  const nodeX = nodeData.x + nodeData.width / 2;
  const nodeY = nodeData.y + nodeData.height / 2;

  const translateX = centerX - nodeX * scale;
  const translateY = centerY - nodeY * scale;

  svg
    .transition()
    .duration(750)
    .call(
      currentZoom.value.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale),
    );

  g.selectAll(".node")
    .filter((d: any) => d.id === nodeData.id)
    .select("rect")
    .transition()
    .duration(300)
    .attr("stroke-width", 4)
    .attr("stroke", "hsl(var(--c-primary-400))")
    .transition()
    .delay(1000)
    .duration(300)
    .attr("stroke-width", 2)
    .attr("stroke", (d: any) => d.color);
};

const toggleSection = (sectionName: string) => {
  expandedSections.value[sectionName] = !expandedSections.value[sectionName];
};

const shouldShowChildren = (item: any): boolean => {
  // For root sections (Query, Mutation, Subscription), check expanded state
  if (
    item.type === "root" &&
    ["Query", "Mutation", "Subscription"].includes(item.name)
  ) {
    return expandedSections.value[item.name] === true;
  }

  // For types and enums, always show children (they're not collapsible)
  return true;
};

const findParentChain = (
  nodeId: number,
  nodes: any[],
  links: any[],
): number[] => {
  const chain = [nodeId];
  const incomingLinks = links.filter((link: any) => link.target.id === nodeId);

  for (const link of incomingLinks) {
    const parentChain = findParentChain(link.source.id, nodes, links);
    chain.push(...parentChain);
  }

  return [...new Set(chain)];
};

const toggleNodeHighlight = (nodeData: any) => {
  if (!cachedD3Data.value) return;

  const { nodes, links } = cachedD3Data.value;

  if (highlightedNodeId.value === nodeData.id) {
    highlightedNodeId.value = null;
    updateNodeStyles(nodes, []);
  } else {
    highlightedNodeId.value = nodeData.id;
    const parentChain = findParentChain(nodeData.id, nodes, links);
    updateNodeStyles(nodes, parentChain);
  }
};

// Update node styles based on highlighting
const updateNodeStyles = (nodes: any[], highlightedIds: number[]) => {
  if (!voyagerContainer.value) return;

  const svg = d3.select(voyagerContainer.value).select("svg");

  svg.selectAll(".node").each(function (d: any) {
    const nodeGroup = d3.select(this as SVGElement);
    const isHighlighted = highlightedIds.includes(d.id);

    // Update node opacity and styling
    nodeGroup
      .style(
        "opacity",
        highlightedIds.length === 0 ? 1 : isHighlighted ? 1 : 0.3,
      )
      .select("rect")
      .attr("stroke-width", isHighlighted ? 3 : 2);
  });

  // Update link styles - keep highlighted connections clear
  svg.selectAll(".link").each(function (d: any) {
    const link = d3.select(this as SVGElement);
    const isLinkHighlighted =
      highlightedIds.includes(d.source.id) &&
      highlightedIds.includes(d.target.id);
    link.style(
      "opacity",
      highlightedIds.length === 0 ? 0.9 : isLinkHighlighted ? 0.9 : 0.2,
    );
  });
};

const onNavItemClick = (item: any) => {
  if (
    item.type === "root" &&
    ["Query", "Mutation", "Subscription"].includes(item.name)
  ) {
    toggleSection(item.name);
    return;
  }

  if (!cachedD3Data.value) return;

  const { nodes } = cachedD3Data.value;
  const targetNode = nodes.find(
    (n) => n.name === item.name || n.name === item.parent,
  );

  if (targetNode) {
    focusOnNode(targetNode);
  }
};

const loadSessions = async () => {
  try {
    const stored = sdk.storage.get() as {
      explorerSessions?: any[];
      selectedExplorerSessionId?: string;
    } | null;

    if (stored?.explorerSessions && Array.isArray(stored.explorerSessions)) {
      sessions.value = stored.explorerSessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
      }));

      // Check for auto-select from Explorer navigation
      const autoSelectSessionId = localStorage.getItem(
        "voyager-auto-select-session",
      );
      if (autoSelectSessionId) {
        const sessionToSelect = sessions.value.find(
          (s: any) => s.id === autoSelectSessionId,
        );
        if (sessionToSelect) {
          await selectSession(autoSelectSessionId);
        }
        // Clear the flag after use
        localStorage.removeItem("voyager-auto-select-session");
        return; // Skip setting to null
      }
    } else {
      sessions.value = [];
    }

    selectedSessionId.value = null;
  } catch (error) {
    sessions.value = [];
    selectedSessionId.value = null;
  }
};

const selectSession = async (sessionId: string) => {
  selectedSessionId.value = sessionId;

  sdk.window.showToast("Loading the graph for you...", { variant: "info" });

  const session = sessions.value.find((s: any) => s.id === sessionId);
  if (session?.schema) {
    currentSchema.value = session.schema;
    cachedD3Data.value = parseSchemaToD3(session.schema);
  }

  highlightedNodeId.value = null;

  await nextTick();
  await loadVoyagerVisualization();
};

// Format full field signature with arguments
const formatFieldSignature = (field: any): string => {
  let signature = field.name;

  // Add arguments if they exist
  if (field.args && field.args.length > 0) {
    const argsStr = field.args
      .map((arg: any) => `${arg.name}: ${arg.type}`)
      .join(", ");
    signature += `(${argsStr})`;
  }

  // Add return type
  if (field.type) {
    signature += `: ${field.type}`;
  }

  return signature;
};

const parseSchemaToD3 = (schema: any) => {
  const nodes: any[] = [];
  const links: any[] = [];
  const nodeMap = new Map();
  let nodeId = 0;

  const calculateBoxDimensions = (
    fields: any[],
    title: string,
  ): { width: number; height: number } => {
    const titleWidth = title.length * 12 + 40;
    let maxFieldWidth = titleWidth;

    if (fields && fields.length > 0) {
      fields.forEach((field: any) => {
        const fieldText = field.name + (field.type ? `: ${field.type}` : "");
        const fieldWidth = fieldText.length * 8 + 40;
        maxFieldWidth = Math.max(maxFieldWidth, fieldWidth);
      });
    }

    const exactHeight =
      LAYOUT.HEADER_HEIGHT +
      (fields?.length || 0) * LAYOUT.FIELD_HEIGHT +
      LAYOUT.PADDING;

    return {
      width: Math.max(
        LAYOUT.MIN_WIDTH,
        Math.min(maxFieldWidth, LAYOUT.MAX_WIDTH),
      ),
      height: Math.max(LAYOUT.MIN_HEIGHT, exactHeight),
    };
  };

  let rootY = 50;
  let queryNode = null;

  if (schema.queries?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(schema.queries, "Query");
    queryNode = {
      id,
      name: "Query",
      type: "root",
      color: "hsl(var(--c-primary-600))",
      fields: schema.queries,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height,
    };
    nodes.push(queryNode);
    nodeMap.set("Query", queryNode);
    rootY += dimensions.height + LAYOUT.ROOT_SPACING;
  }

  if (schema.mutations?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(schema.mutations, "Mutation");
    const node = {
      id,
      name: "Mutation",
      type: "root",
      color: "hsl(var(--c-danger-600))",
      fields: schema.mutations,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height,
    };
    nodes.push(node);
    nodeMap.set("Mutation", node);
    rootY += dimensions.height + LAYOUT.ROOT_SPACING;
  }

  if (schema.subscriptions?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(
      schema.subscriptions,
      "Subscription",
    );
    const node = {
      id,
      name: "Subscription",
      type: "root",
      color: "hsl(var(--c-info-600))",
      fields: schema.subscriptions,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height,
    };
    nodes.push(node);
    nodeMap.set("Subscription", node);
  }

  if (schema.types?.length > 0) {
    let currentX = queryNode
      ? queryNode.x + queryNode.width + LAYOUT.COLUMN_SPACING
      : 550;
    let currentY = 50;
    let maxWidthInColumn = 0;

    schema.types.forEach((type: any, index: number) => {
      const id = nodeId++;
      const fieldsToShow = type.fields || [];
      const dimensions = calculateBoxDimensions(fieldsToShow, type.name);

      maxWidthInColumn = Math.max(maxWidthInColumn, dimensions.width);

      if (
        currentY + dimensions.height > LAYOUT.MAX_HEIGHT_PER_COLUMN &&
        index > 0
      ) {
        currentX += maxWidthInColumn + LAYOUT.COLUMN_SPACING;
        currentY = 50;
        maxWidthInColumn = dimensions.width;
      }

      const node = {
        id,
        name: type.name,
        type: "object",
        color: "hsl(var(--c-success-600))",
        fields: fieldsToShow,
        x: currentX,
        y: currentY,
        width: dimensions.width,
        height: dimensions.height,
      };

      nodes.push(node);
      nodeMap.set(type.name, node);
      currentY += dimensions.height + LAYOUT.NODE_SPACING;
    });
  }

  if (schema.enums?.length > 0) {
    let enumX =
      nodes.length > 0
        ? Math.max(...nodes.map((n) => n.x + n.width)) + LAYOUT.COLUMN_SPACING
        : 1200;
    let enumY = 50;

    schema.enums.forEach((enumType: any) => {
      const id = nodeId++;
      const enumValues = enumType.values || [];
      const dimensions = calculateBoxDimensions(enumValues, enumType.name);
      const node = {
        id,
        name: enumType.name,
        type: "enum",
        color: "hsl(var(--c-secondary-600))",
        fields: enumValues,
        x: enumX,
        y: enumY,
        width: dimensions.width,
        height: dimensions.height,
      };

      nodes.push(node);
      nodeMap.set(enumType.name, node);
      enumY += dimensions.height + LAYOUT.ENUM_SPACING;
    });
  }
  ["Query", "Mutation", "Subscription"].forEach((rootType) => {
    const rootNode = nodeMap.get(rootType);
    if (rootNode && rootNode.fields) {
      rootNode.fields.forEach((field: any) => {
        const returnType = extractTypeName(field.type);
        const targetNode = nodeMap.get(returnType);
        if (targetNode && rootNode !== targetNode) {
          links.push({
            source: rootNode,
            target: targetNode,
            fieldName: field.name,
            fromRoot: true,
          });
        }
      });
    }
  });

  // Links between custom types
  if (schema.types?.length > 0) {
    schema.types.forEach((type: any) => {
      const sourceNode = nodeMap.get(type.name);
      if (type.fields && sourceNode) {
        type.fields.forEach((field: any) => {
          const fieldType = extractTypeName(field.type);
          const targetNode = nodeMap.get(fieldType);
          if (targetNode && sourceNode !== targetNode) {
            links.push({
              source: sourceNode,
              target: targetNode,
              fieldName: field.name,
              fromRoot: false,
            });
          }
        });
      }
    });
  }

  return { nodes, links };
};

const extractTypeName = (typeString: string): string => {
  if (!typeString) return "";
  return typeString.replace(/[\[\]!]/g, "");
};

const loadVoyagerVisualization = async () => {
  if (!cachedD3Data.value) return;

  try {
    if (!voyagerContainer.value) {
      throw new Error("Container ref is not available");
    }

    d3.select(voyagerContainer.value).selectAll("*").remove();

    const { nodes, links } = cachedD3Data.value;

    const svg = d3
      .select(voyagerContainer.value)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "hsl(var(--c-surface-800))")
      .style("border", "1px solid hsl(var(--c-surface-600))");

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        currentTransform.value = event.transform;
      });

    svg.call(zoom as any);
    currentZoom.value = zoom;

    svg.on("click", (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target === event.currentTarget ||
        (target && target.tagName === "svg")
      ) {
        highlightedNodeId.value = null;
        if (cachedD3Data.value) {
          updateNodeStyles(cachedD3Data.value.nodes, []);
        }
      }
    });

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    const linkGroup = g.append("g").attr("class", "links");

    links.forEach((link: any) => {
      const sourceNode = link.source;
      const targetNode = link.target;

      const fieldIndex =
        sourceNode.fields?.findIndex((f: any) => f.name === link.fieldName) ||
        0;
      const fieldY =
        sourceNode.y +
        LAYOUT.HEADER_HEIGHT +
        10 +
        fieldIndex * LAYOUT.FIELD_HEIGHT;

      const x1 = sourceNode.x + sourceNode.width;
      const y1 = fieldY;
      const x2 = targetNode.x;
      const y2 = targetNode.y + targetNode.height / 2;

      const midX = (x1 + x2) / 2;

      const path = `M ${x1},${y1} C ${midX},${y1} ${midX},${y2} ${x2},${y2}`;

      const linkPath = linkGroup
        .append("path")
        .attr("class", "link")
        .attr("d", path)
        .attr(
          "stroke",
          link.fromRoot
            ? "hsl(var(--c-primary-400))"
            : "hsl(var(--c-surface-400))",
        )
        .attr("stroke-width", link.fromRoot ? 2.5 : 1.5)
        .attr("fill", "none")
        .attr("opacity", 0.7)
        .attr("marker-end", "url(#arrowhead)")
        .style("transition", "all 0.2s ease");

      if (link.fieldName) {
        const labelX = midX;
        const labelY = (y1 + y2) / 2;

        linkGroup
          .append("text")
          .attr("class", "link-label")
          .attr("x", labelX)
          .attr("y", labelY - 5)
          .attr("text-anchor", "middle")
          .attr("font-size", "10px")
          .attr("fill", "hsl(var(--c-surface-200))")
          .attr("opacity", 0)
          .style("pointer-events", "none")
          .style("user-select", "none")
          .text(link.fieldName);
      }

      linkPath
        .on("mouseenter", function () {
          d3.select(this)
            .attr("stroke-width", link.fromRoot ? 3.5 : 2.5)
            .attr("opacity", 1);

          linkGroup
            .selectAll(".link-label")
            .filter(function () {
              const label = d3.select(this as SVGElement);
              return label.text() === link.fieldName;
            })
            .attr("opacity", 1);
        })
        .on("mouseleave", function () {
          d3.select(this as SVGElement)
            .attr("stroke-width", link.fromRoot ? 2.5 : 1.5)
            .attr("opacity", 0.7);

          linkGroup.selectAll(".link-label").attr("opacity", 0);
        });
    });

    // Create node groups
    const nodeGroups = g
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
      .style("cursor", "pointer");

    // Draw node containers (boxes) - CAIDO THEME
    nodeGroups
      .append("rect")
      .attr("width", (d: any) => d.width)
      .attr("height", (d: any) => d.height)
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("fill", "hsl(var(--c-surface-700))")
      .attr("stroke", (d: any) => d.color)
      .attr("stroke-width", 2)
      .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");

    // Add node headers (type names)
    nodeGroups
      .append("rect")
      .attr("width", (d: any) => d.width)
      .attr("height", 25)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", (d: any) => d.color);

    nodeGroups
      .append("text")
      .attr("x", (d: any) => d.width / 2)
      .attr("y", 17)
      .attr("text-anchor", "middle")
      .attr("fill", "#ffffff")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text((d: any) => d.name);

    // Add field lists
    nodeGroups.each(function (d: any) {
      const node = d3.select(this as SVGElement);

      if (d.fields && d.fields.length > 0) {
        d.fields.forEach((field: any, index: number) => {
          const y = 35 + index * 18; // Back to original spacing

          // Simple field name display in graph
          node
            .append("text")
            .attr("x", 8)
            .attr("y", y)
            .attr("font-size", "11px")
            .attr("fill", "hsl(var(--c-surface-0))")
            .attr("font-family", "monospace")
            .attr("font-weight", "500")
            .text(field.name);

          // Field type on the right
          if (field.type) {
            node
              .append("text")
              .attr("x", (d: any) => d.width - 12)
              .attr("y", y)
              .attr("text-anchor", "end")
              .attr("font-size", "10px")
              .attr("fill", "hsl(var(--c-surface-300))")
              .attr("font-style", "italic")
              .text(field.type);
          }
        });
      }
    });

    nodeGroups.on("click", (event: MouseEvent, d: any) => {
      event.stopPropagation();
      toggleNodeHighlight(d);
    });

    nodeGroups
      .on("mouseenter", function (this: SVGElement, event: MouseEvent, d: any) {
        d3.select(this)
          .select("rect")
          .attr("stroke-width", 3)
          .attr("filter", "drop-shadow(0 4px 12px rgba(0,0,0,0.4))");

        const tooltipHtml = `
        <div style="background: hsl(var(--c-surface-900)); border: 1px solid hsl(var(--c-surface-600)); padding: 8px; border-radius: 6px; max-width: 300px;">
          <div style="font-weight: bold; color: ${d.color}; margin-bottom: 4px;">${d.name}</div>
          <div style="font-size: 11px; color: hsl(var(--c-surface-300));">
            Type: ${d.type}<br/>
            Fields: ${d.fields?.length || 0}
          </div>
        </div>
      `;

        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "voyager-tooltip")
          .style("position", "absolute")
          .style("pointer-events", "none")
          .style("opacity", 0)
          .html(tooltipHtml);

        tooltip.transition().duration(200).style("opacity", 1);

        d3.select(this).on("mousemove", (e: any) => {
          tooltip
            .style("left", e.pageX + 10 + "px")
            .style("top", e.pageY - 28 + "px");
        });
      })
      .on("mouseleave", function () {
        d3.select(this)
          .select("rect")
          .attr("stroke-width", 2)
          .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");

        d3.selectAll(".voyager-tooltip").remove();
      });

    if (debouncedSearchTerm.value) {
      const search = debouncedSearchTerm.value.toLowerCase();
      nodeGroups.each(function (d: any) {
        const node = d3.select(this);
        const matches =
          d.name.toLowerCase().includes(search) ||
          d.fields?.some((f: any) => f.name.toLowerCase().includes(search));

        if (matches) {
          node
            .select("rect")
            .attr("stroke", "hsl(var(--c-warning-400))")
            .attr("stroke-width", 3);
        }
      });
    }

    // Show success notification when graph is ready
    sdk.window.showToast(
      "Graph loaded successfully! Click nodes to highlight parent chains.",
      { variant: "success" },
    );
  } catch (error) {
    sdk.window.showToast(`Failed to load visualization: ${error}`, {
      variant: "error",
    });
  }
};

// Setup minimap drag interaction
const setupMinimapDrag = () => {
  if (
    !minimapSvg.value ||
    !voyagerContainer.value ||
    !currentZoom.value ||
    !cachedD3Data.value
  )
    return;

  const minimapRect = d3.select(minimapSvg.value).select(".minimap-viewport");
  if (minimapRect.empty()) return;

  let dragStartX = 0;
  let dragStartY = 0;
  let initialViewportX = 0;
  let initialViewportY = 0;

  const drag = d3
    .drag()
    .on("start", (event) => {
      if (!currentTransform.value) return;

      // Store the initial click position
      dragStartX = event.x;
      dragStartY = event.y;

      // Store the initial viewport position
      initialViewportX = -currentTransform.value.x / currentTransform.value.k;
      initialViewportY = -currentTransform.value.y / currentTransform.value.k;
    })
    .on("drag", (event) => {
      if (!currentTransform.value || !voyagerContainer.value) return;

      const svg = d3.select(voyagerContainer.value).select("svg");

      // Calculate the offset from the start position
      const deltaX = event.x - dragStartX;
      const deltaY = event.y - dragStartY;

      // Calculate new viewport position accounting for the offset
      const newViewportX = initialViewportX + deltaX;
      const newViewportY = initialViewportY + deltaY;

      // Convert back to transform coordinates
      const newX = -newViewportX * currentTransform.value.k;
      const newY = -newViewportY * currentTransform.value.k;

      // Apply the new transform
      svg
        .transition()
        .duration(0)
        .call(
          currentZoom.value.transform,
          d3.zoomIdentity.translate(newX, newY).scale(currentTransform.value.k),
        );
    });

  minimapRect.call(drag as any);
  minimapRect.style("cursor", "move");
};

// Watch for changes that require minimap drag setup
watch(
  [selectedSession, cachedD3Data, currentTransform],
  () => {
    nextTick(() => {
      setupMinimapDrag();
    });
  },
  { deep: true },
);

onMounted(() => {
  loadSessions();
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <!-- Header -->
    <Card
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="flex justify-between items-center p-4">
          <div>
            <h3 class="text-lg font-semibold">GraphQL Voyager</h3>
            <p class="text-sm text-surface-300">
              Interactive exploration of GraphQL schema relationships and
              structure.
            </p>
          </div>
          <Button
            label="Back to Explorer"
            icon="fas fa-arrow-left"
            severity="secondary"
            @click="props.navigateTo?.('Explorer')"
          />
        </div>
      </template>
    </Card>

    <!-- Session Selection -->
    <Card
      v-if="introspectionSessions.length > 0"
      class="h-fit"
      :pt="{
        body: { class: 'h-fit p-0' },
        content: { class: 'h-fit flex flex-col' },
      }"
    >
      <template #content>
        <div class="p-3">
          <div class="flex gap-2 flex-wrap">
            <Button
              v-for="session in introspectionSessions"
              :key="session.id"
              :class="[
                selectedSessionId === session.id
                  ? '!border-secondary-400'
                  : '!border-surface-700',
                '!bg-surface-900 border-[1px] rounded-md !ring-0',
              ]"
              severity="contrast"
              size="small"
              outlined
              @click="selectSession(session.id)"
            >
              <div class="flex items-center gap-2">
                <div
                  :class="[
                    'w-1.5 h-1.5 rounded-full',
                    session.status === 'success'
                      ? 'bg-success-500'
                      : session.status === 'error'
                        ? 'bg-red-500'
                        : session.status === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-surface-400',
                  ]"
                ></div>
                <span class="px-1 whitespace-nowrap">{{ session.title }}</span>
              </div>
            </Button>
          </div>
        </div>
      </template>
    </Card>

    <!-- Voyager Visualization with Sidebar -->
    <div class="flex-1 min-h-0">
      <Card
        class="h-full"
        :pt="{
          body: { class: 'h-full p-0' },
          content: { class: 'h-full flex flex-col' },
        }"
      >
        <template #content>
          <div
            v-if="introspectionSessions.length === 0"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">No Sessions Available</div>
              <div class="text-sm">
                <span v-if="sessions.length === 0"
                  >No sessions found. Go to Dashboard to scan a GraphQL
                  endpoint.</span
                >
                <span v-else
                  >No sessions with introspection support available for
                  viewing.</span
                >
              </div>
            </div>
          </div>
          <div
            v-else-if="!selectedSession"
            class="h-full flex items-center justify-center"
          >
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">Select a Session</div>
              <div class="text-sm">
                Choose a session above to view its interactive GraphQL schema
                graph.
              </div>
            </div>
          </div>

          <div v-else class="h-full flex">
            <!-- Sidebar Navigation - NO HORIZONTAL SCROLL -->
            <div
              v-if="isNavExpanded"
              class="w-80 bg-surface-900 border-r border-surface-600 flex flex-col overflow-hidden"
            >
              <!-- Search Header -->
              <div class="p-4 border-b border-surface-600">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="font-semibold text-surface-100">
                    Schema Navigation
                  </h4>
                  <Button
                    icon="fas fa-times"
                    text
                    size="small"
                    class="text-surface-400 hover:text-surface-200"
                    @click="isNavExpanded = false"
                  />
                </div>
                <InputText
                  v-model="searchTerm"
                  placeholder="Search schema..."
                  class="w-full"
                  size="small"
                />
              </div>

              <!-- Navigation Items - SINGLE SCROLL, NO HORIZONTAL OVERFLOW -->
              <div class="flex-1 overflow-y-auto overflow-x-hidden p-2">
                <div
                  v-for="item in filteredItems"
                  :key="item.name"
                  class="mb-1"
                >
                  <!-- Root Item (Query, Mutation, Subscription, Types, Enums) -->
                  <div
                    class="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-surface-700 transition-colors min-w-0"
                    :class="{
                      'bg-primary-600':
                        item.type === 'root' && item.name === 'Query',
                      'bg-danger-600':
                        item.type === 'root' && item.name === 'Mutation',
                      'bg-info-600':
                        item.type === 'root' && item.name === 'Subscription',
                      'bg-success-600': item.type === 'type',
                      'bg-secondary-600': item.type === 'enum',
                    }"
                    @click="onNavItemClick(item)"
                  >
                    <div class="flex items-center min-w-0 flex-1">
                      <!-- Chevron for collapsible root sections -->
                      <i
                        v-if="
                          item.type === 'root' &&
                          ['Query', 'Mutation', 'Subscription'].includes(
                            item.name,
                          )
                        "
                        :class="
                          expandedSections[item.name]
                            ? 'fas fa-chevron-down'
                            : 'fas fa-chevron-right'
                        "
                        class="text-xs w-3 mr-2 flex-shrink-0 text-surface-300"
                      ></i>

                      <!-- Main icon -->
                      <i
                        :class="{
                          'fas fa-play': item.name === 'Query',
                          'fas fa-edit': item.name === 'Mutation',
                          'fas fa-bell': item.name === 'Subscription',
                          'fas fa-cube': item.type === 'type',
                          'fas fa-list': item.type === 'enum',
                        }"
                        class="text-sm w-4 mr-2 flex-shrink-0"
                      ></i>
                      <span class="font-medium text-surface-100 truncate">{{
                        item.name
                      }}</span>
                    </div>
                    <span
                      class="text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded flex-shrink-0 ml-2"
                    >
                      {{ item.children?.length || 0 }}
                    </span>
                  </div>

                  <!-- Child Items - COLLAPSIBLE, SHOW ALL WHEN EXPANDED -->
                  <div
                    v-if="item.children?.length && shouldShowChildren(item)"
                    class="ml-6 mt-1"
                  >
                    <div
                      v-for="child in item.children"
                      :key="child.name"
                      class="flex items-center p-1.5 rounded cursor-pointer hover:bg-surface-700 transition-colors text-sm min-w-0"
                      @click="onNavItemClick(child)"
                    >
                      <i
                        class="fas fa-arrow-right text-xs w-3 mr-2 text-surface-500 flex-shrink-0"
                      ></i>
                      <span class="text-surface-200 truncate">{{
                        child.name
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Expand Sidebar Button -->
            <div
              v-if="!isNavExpanded"
              class="w-12 bg-surface-900 border-r border-surface-600 flex items-center justify-center"
            >
              <Button
                icon="fas fa-bars"
                text
                size="small"
                class="text-surface-400 hover:text-surface-200"
                @click="isNavExpanded = true"
              />
            </div>

            <!-- Graph Container -->
            <div class="flex-1 relative">
              <div
                ref="voyagerContainer"
                class="h-full w-full"
                style="background: hsl(var(--c-surface-800))"
              />

              <!-- Zoom Controls -->
              <div
                v-if="selectedSession"
                class="absolute top-4 right-4 flex flex-col gap-2 bg-surface-900 border border-surface-600 rounded-lg p-2 shadow-lg"
              >
                <Button
                  v-tooltip="'Zoom In'"
                  icon="fas fa-search-plus"
                  size="small"
                  text
                  class="w-10 h-10"
                  @click="zoomIn"
                />
                <Button
                  v-tooltip="'Zoom Out'"
                  icon="fas fa-search-minus"
                  size="small"
                  text
                  class="w-10 h-10"
                  @click="zoomOut"
                />
                <div class="border-t border-surface-600 my-1"></div>
                <Button
                  v-tooltip="'Fit to View'"
                  icon="fas fa-compress-arrows-alt"
                  size="small"
                  text
                  class="w-10 h-10"
                  @click="fitToView"
                />
                <Button
                  v-tooltip="'Reset Zoom'"
                  icon="fas fa-undo"
                  size="small"
                  text
                  class="w-10 h-10"
                  @click="resetZoom"
                />
              </div>

              <!-- Minimap -->
              <div
                v-if="selectedSession && cachedD3Data"
                class="absolute bottom-4 right-4 w-48 h-32 border border-surface-500 rounded-lg shadow-lg overflow-hidden"
                style="background: hsl(var(--c-surface-900))"
              >
                <svg
                  ref="minimapSvg"
                  class="w-full h-full"
                  :viewBox="`${minimapViewBox.x} ${minimapViewBox.y} ${minimapViewBox.width} ${minimapViewBox.height}`"
                  style="background: hsl(var(--c-surface-800))"
                >
                  <defs>
                    <mask id="minimap-mask">
                      <rect
                        :x="minimapViewBox.x"
                        :y="minimapViewBox.y"
                        :width="minimapViewBox.width"
                        :height="minimapViewBox.height"
                        fill="white"
                      />
                      <rect
                        v-if="currentTransform"
                        :x="-currentTransform.x / currentTransform.k"
                        :y="-currentTransform.y / currentTransform.k"
                        :width="minimapViewBox.width / currentTransform.k"
                        :height="minimapViewBox.height / currentTransform.k"
                        fill="black"
                      />
                    </mask>
                  </defs>

                  <g>
                    <!-- Schema nodes -->
                    <rect
                      v-for="node in cachedD3Data.nodes"
                      :key="node.id"
                      :x="node.x"
                      :y="node.y"
                      :width="node.width"
                      :height="node.height"
                      :fill="node.color"
                      opacity="0.6"
                      stroke="none"
                    />

                    <!-- Semi-transparent black overlay (25% opacity) - MASKED to exclude viewport box -->
                    <rect
                      :x="minimapViewBox.x"
                      :y="minimapViewBox.y"
                      :width="minimapViewBox.width"
                      :height="minimapViewBox.height"
                      fill="black"
                      opacity="0.25"
                      mask="url(#minimap-mask)"
                      pointer-events="none"
                    />

                    <!-- Viewport box - fully draggable with transparent fill, brighter -->
                    <rect
                      v-if="currentTransform"
                      class="minimap-viewport"
                      :x="-currentTransform.x / currentTransform.k"
                      :y="-currentTransform.y / currentTransform.k"
                      :width="minimapViewBox.width / currentTransform.k"
                      :height="minimapViewBox.height / currentTransform.k"
                      fill="rgba(255, 255, 255, 0.05)"
                      stroke="hsl(var(--c-primary-300))"
                      stroke-width="35"
                      opacity="0.95"
                      style="cursor: move"
                    />
                  </g>
                </svg>
                <div
                  class="absolute top-1 left-1 text-xs text-surface-400 px-2 py-1 rounded"
                  style="background: rgba(0, 0, 0, 0.6)"
                >
                  Minimap
                </div>
              </div>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
/* Voyager visualization styling */
:deep(svg) {
  cursor: grab;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

:deep(svg:active) {
  cursor: grabbing;
}

:deep(.node) {
  transition: all 0.2s ease;
}

:deep(.link) {
  transition: opacity 0.2s ease;
}
</style>
