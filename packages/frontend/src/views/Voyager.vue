<script setup lang="ts">
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, onMounted, ref, nextTick } from "vue";
import * as d3 from "d3";

import { useSDK } from "../plugins/sdk";

const sdk = useSDK();

const props = defineProps<{
  navigateTo?: (page: "Dashboard" | "Explorer" | "Voyager" | "Attacks" | "History") => void;
}>();

const sessions = ref<any[]>([]);
const selectedSessionId = ref<string | null>(null);
const voyagerContainer = ref<HTMLDivElement>();

// Highlighting state for parent chain visualization
const highlightedNodeId = ref<number | null>(null);

const selectedSession = computed(() => 
  sessions.value.find(s => s.id === selectedSessionId.value)
);

const introspectionSessions = computed(() =>
  sessions.value.filter(s => s.supportsIntrospection)
);

// Sidebar navigation
const searchTerm = ref('');
const currentSchema = ref<any>(null);
const isNavExpanded = ref(true);

// Collapse/expand state for navigation sections
const expandedSections = ref<Record<string, boolean>>({
  Query: true,
  Mutation: true,
  Subscription: true
});

const filteredItems = computed(() => {
  if (!currentSchema.value) return [];
  
  const items: any[] = [];
  
  // Add root operations
  if (currentSchema.value.queries) {
    items.push({
      name: 'Query',
      type: 'root',
      children: currentSchema.value.queries.map((q: any) => ({
        name: q.name,
        type: 'query',
        parent: 'Query'
      }))
    });
  }
  
  if (currentSchema.value.mutations) {
    items.push({
      name: 'Mutation', 
      type: 'root',
      children: currentSchema.value.mutations.map((m: any) => ({
        name: m.name,
        type: 'mutation',
        parent: 'Mutation'
      }))
    });
  }
  
  if (currentSchema.value.subscriptions) {
    items.push({
      name: 'Subscription',
      type: 'root', 
      children: currentSchema.value.subscriptions.map((s: any) => ({
        name: s.name,
        type: 'subscription',
        parent: 'Subscription'
      }))
    });
  }
  
  // Add types
  if (currentSchema.value.types) {
    currentSchema.value.types.forEach((type: any) => {
      items.push({
        name: type.name,
        type: 'type',
        children: (type.fields || []).map((f: any) => ({
          name: f.name,
          fullSignature: formatFieldSignature(f), // Full signature for display
          fieldData: f, // Keep full field data
          type: 'field',
          parent: type.name
        }))
      });
    });
  }
  
  // Add enums
  if (currentSchema.value.enums) {
    currentSchema.value.enums.forEach((enumType: any) => {
      items.push({
        name: enumType.name,
        type: 'enum',
        children: (enumType.values || []).map((v: any) => ({
          name: v.name,
          fullSignature: v.name, // Enum values don't have complex signatures
          fieldData: v, // Keep full field data
          type: 'enumValue',
          parent: enumType.name
        }))
      });
    });
  }
  
  // Filter by search term
  if (!searchTerm.value.trim()) return items;
  
  const search = searchTerm.value.toLowerCase();
  return items.filter(item => 
    item.name.toLowerCase().includes(search) ||
    item.children?.some((child: any) => child.name.toLowerCase().includes(search))
  );
});

const focusOnNode = (nodeData: any) => {
  if (!voyagerContainer.value) return;
  
  const svg = d3.select(voyagerContainer.value).select('svg');
  const g = svg.select('g');
  
  // Calculate zoom and translation to center the node
  const containerRect = voyagerContainer.value.getBoundingClientRect();
  if (!containerRect) return;
  
  const scale = 1.2;
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;
  const nodeX = nodeData.x + nodeData.width / 2;
  const nodeY = nodeData.y + nodeData.height / 2;
  
  const translateX = centerX - nodeX * scale;
  const translateY = centerY - nodeY * scale;
  
  // Smooth transition to focus on node
  svg.transition()
    .duration(750)
    .call(
      d3.zoom<SVGSVGElement, unknown>().transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  
  // Visual highlight
  g.selectAll('.node')
    .filter((d: any) => d.id === nodeData.id)
    .select('rect')
    .transition()
    .duration(300)
    .attr('stroke-width', 4)
    .attr('stroke', 'hsl(var(--c-primary-400))')
    .transition()
    .delay(1000)
    .duration(300)
    .attr('stroke-width', 2)
    .attr('stroke', (d: any) => d.color);
    
  sdk.window.showToast(`Focused on ${nodeData.name}`, { variant: "success" });
};

const toggleSection = (sectionName: string) => {
  expandedSections.value[sectionName] = !expandedSections.value[sectionName];
};

const shouldShowChildren = (item: any): boolean => {
  // For root sections (Query, Mutation, Subscription), check expanded state
  if (item.type === 'root' && ['Query', 'Mutation', 'Subscription'].includes(item.name)) {
    return expandedSections.value[item.name] === true;
  }
  
  // For types and enums, always show children (they're not collapsible)
  return true;
};

// Find parent chain for highlighting (Query -> EventType -> EventConnection)
const findParentChain = (nodeId: number, nodes: any[], links: any[]): number[] => {
  const chain = [nodeId];
  
  // Find all links that point TO this node
  const incomingLinks = links.filter(link => link.target.id === nodeId);
  
  for (const link of incomingLinks) {
    // Recursively find parents of the source node
    const parentChain = findParentChain(link.source.id, nodes, links);
    chain.push(...parentChain);
  }
  
  return [...new Set(chain)]; // Remove duplicates
};

// Toggle highlighting for a node and its parent chain
const toggleNodeHighlight = (nodeData: any) => {
  if (!selectedSession.value?.schema) return;
  
  const { nodes, links } = parseSchemaToD3(selectedSession.value.schema);
  
  if (highlightedNodeId.value === nodeData.id) {
    // Clear highlighting if clicking the same node
    highlightedNodeId.value = null;
    updateNodeStyles(nodes, []);
  } else {
    // Highlight this node and its parent chain
    highlightedNodeId.value = nodeData.id;
    const parentChain = findParentChain(nodeData.id, nodes, links);
    updateNodeStyles(nodes, parentChain);
  }
};

// Update node styles based on highlighting
const updateNodeStyles = (nodes: any[], highlightedIds: number[]) => {
  if (!voyagerContainer.value) return;
  
  const svg = d3.select(voyagerContainer.value).select('svg');
  
  svg.selectAll('.node').each(function(d: any) {
    const nodeGroup = d3.select(this);
    const isHighlighted = highlightedIds.includes(d.id);
    
    // Update node opacity and styling
    nodeGroup
      .style('opacity', highlightedIds.length === 0 ? 1 : (isHighlighted ? 1 : 0.3))
      .select('rect')
      .attr('stroke-width', isHighlighted ? 3 : 2);
  });
  
  // Update link styles - keep highlighted connections clear
  svg.selectAll('.link').each(function(d: any) {
    const link = d3.select(this);
    const isLinkHighlighted = highlightedIds.includes(d.source.id) && highlightedIds.includes(d.target.id);
    link.style('opacity', highlightedIds.length === 0 ? 0.9 : (isLinkHighlighted ? 0.9 : 0.2));
  });
};

const onNavItemClick = (item: any) => {
  // If it's a root section (Query, Mutation, Subscription), toggle collapse
  if (item.type === 'root' && ['Query', 'Mutation', 'Subscription'].includes(item.name)) {
    toggleSection(item.name);
    return;
  }
  
  // For type and enum sections, focus on the graph node
  if (!selectedSession.value?.schema) return;
  
  const { nodes } = parseSchemaToD3(selectedSession.value.schema);
  const targetNode = nodes.find(n => n.name === item.name || n.name === item.parent);
  
  if (targetNode) {
    focusOnNode(targetNode);
  }
};

const loadSessions = async () => {
  try {
    const stored = sdk.storage.get() as { explorerSessions?: any[], selectedExplorerSessionId?: string } | null;
    
    if (stored?.explorerSessions && Array.isArray(stored.explorerSessions)) {
      sessions.value = stored.explorerSessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt)
      }));
      
      // Check for auto-select from Explorer navigation
      const autoSelectSessionId = localStorage.getItem('voyager-auto-select-session');
      if (autoSelectSessionId) {
        const sessionToSelect = sessions.value.find(s => s.id === autoSelectSessionId);
        if (sessionToSelect) {
          await selectSession(autoSelectSessionId);
        }
        // Clear the flag after use
        localStorage.removeItem('voyager-auto-select-session');
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
  
  // Show notification instead of loading placeholder
  sdk.window.showToast("Loading the graph for you...", { variant: "info" });
  
  // Store current schema for navigation
  const session = sessions.value.find(s => s.id === sessionId);
  if (session?.schema) {
    currentSchema.value = session.schema;
  }
  
  // Clear any previous highlighting
  highlightedNodeId.value = null;
  
  await nextTick();
  await loadVoyagerVisualization();
};

// Format full field signature with arguments
const formatFieldSignature = (field: any): string => {
  let signature = field.name;
  
  // Add arguments if they exist
  if (field.args && field.args.length > 0) {
    const argsStr = field.args.map((arg: any) => `${arg.name}: ${arg.type}`).join(', ');
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

  // PERFECT box sizing - exact content fit, no overflow, consistent spacing
  const calculateBoxDimensions = (fields: any[], title: string): { width: number; height: number } => {
    const minWidth = 200;
    const titleWidth = title.length * 12 + 40;
    
    let maxFieldWidth = titleWidth;
    
    if (fields && fields.length > 0) {
      fields.forEach((field: any) => {
        const fieldText = field.name + (field.type ? `: ${field.type}` : '');
        const fieldWidth = fieldText.length * 8 + 40;
        maxFieldWidth = Math.max(maxFieldWidth, fieldWidth);
      });
    }
    
    // Exact height calculation: header (30px) + fields (18px each) + padding (20px)
    const exactHeight = 30 + (fields?.length || 0) * 18 + 20;
    
    return {
      width: Math.max(minWidth, Math.min(maxFieldWidth, 950)),
      height: Math.max(80, exactHeight) // Minimum 80px
    };
  };

  // Root nodes with PERFECT sizing and CONSISTENT spacing
  let rootY = 50;
  let queryNode = null;
  const rootSpacing = 80; // CONSISTENT spacing between root nodes
  
  if (schema.queries?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(schema.queries, 'Query');
    queryNode = {
      id,
      name: 'Query',
      type: 'root',
      color: 'hsl(var(--c-primary-600))',
      fields: schema.queries,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height
    };
    nodes.push(queryNode);
    nodeMap.set('Query', queryNode);
    rootY += dimensions.height + rootSpacing;
  }

  if (schema.mutations?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(schema.mutations, 'Mutation');
    const node = {
      id,
      name: 'Mutation',
      type: 'root',
      color: 'hsl(var(--c-danger-600))',
      fields: schema.mutations,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height
    };
    nodes.push(node);
    nodeMap.set('Mutation', node);
    rootY += dimensions.height + rootSpacing;
  }

  if (schema.subscriptions?.length > 0) {
    const id = nodeId++;
    const dimensions = calculateBoxDimensions(schema.subscriptions, 'Subscription');
    const node = {
      id,
      name: 'Subscription',
      type: 'root',
      color: 'hsl(var(--c-info-600))',
      fields: schema.subscriptions,
      x: 50,
      y: rootY,
      width: dimensions.width,
      height: dimensions.height
    };
    nodes.push(node);
    nodeMap.set('Subscription', node);
  }

  // Custom types in columns with PERFECT sizing and CONSISTENT spacing
  if (schema.types?.length > 0) {
    let currentX = queryNode ? queryNode.x + queryNode.width + 150 : 550;
    let currentY = 50;
    let maxWidthInColumn = 0;
    const columnSpacing = 150; // CONSISTENT column spacing
    const nodeSpacing = 40; // CONSISTENT node spacing
    const maxHeightPerColumn = 1400;
    
    schema.types.forEach((type: any, index: number) => {
      const id = nodeId++;
      const fieldsToShow = type.fields || [];
      const dimensions = calculateBoxDimensions(fieldsToShow, type.name);
      
      // Track max width in column
      maxWidthInColumn = Math.max(maxWidthInColumn, dimensions.width);
      
      // Move to next column if needed
      if (currentY + dimensions.height > maxHeightPerColumn && index > 0) {
        currentX += maxWidthInColumn + columnSpacing;
        currentY = 50;
        maxWidthInColumn = dimensions.width; // Reset for new column
      }
      
      const node = {
        id,
        name: type.name,
        type: 'object',
        color: 'hsl(var(--c-success-600))',
        fields: fieldsToShow,
        x: currentX,
        y: currentY,
        width: dimensions.width,
        height: dimensions.height
      };
      
      nodes.push(node);
      nodeMap.set(type.name, node);
      currentY += dimensions.height + nodeSpacing;
    });
  }

  // Enum types in final column with PERFECT sizing and CONSISTENT spacing
  if (schema.enums?.length > 0) {
    let enumX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x + n.width)) + 150 : 1200;
    let enumY = 50;
    const enumSpacing = 40; // CONSISTENT enum spacing
    
    schema.enums.forEach((enumType: any) => {
      const id = nodeId++;
      const enumValues = enumType.values || [];
      const dimensions = calculateBoxDimensions(enumValues, enumType.name);
      const node = {
        id,
        name: enumType.name,
        type: 'enum',
        color: 'hsl(var(--c-secondary-600))',
        fields: enumValues,
        x: enumX,
        y: enumY,
        width: dimensions.width,
        height: dimensions.height
      };
      
      nodes.push(node);
      nodeMap.set(enumType.name, node);
      enumY += dimensions.height + enumSpacing;
    });
  }

  // CREATE PROPER CONNECTIONS - Query/Mutation/Subscription to their return types
  ['Query', 'Mutation', 'Subscription'].forEach(rootType => {
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
            fromRoot: true
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
              fromRoot: false
            });
          }
        });
      }
    });
  }

  return { nodes, links };
};

const extractTypeName = (typeString: string): string => {
  if (!typeString) return '';
  return typeString.replace(/[\[\]!]/g, '');
};

const loadVoyagerVisualization = async () => {
  if (!selectedSession.value?.schema) return;

  try {
    if (!voyagerContainer.value) {
      throw new Error("Container ref is not available");
    }

    // Clear previous visualization
    d3.select(voyagerContainer.value).selectAll("*").remove();

    const schema = selectedSession.value.schema;
    const { nodes, links } = parseSchemaToD3(schema);

    // Create SVG with proper dimensions - CAIDO THEME
    const svg = d3.select(voyagerContainer.value)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .style("background", "hsl(var(--c-surface-800))")
      .style("border", "1px solid hsl(var(--c-surface-600))");

    // Create zoom and pan behavior
    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      }) as any);

    // Add background click to clear highlighting
    svg.on("click", (event: any) => {
      // Only clear if clicking on SVG background (not on nodes)
      if (event.target === event.currentTarget || event.target.tagName === 'svg') {
        highlightedNodeId.value = null;
        if (selectedSession.value?.schema) {
          const { nodes } = parseSchemaToD3(selectedSession.value.schema);
          updateNodeStyles(nodes, []);
        }
      }
    });

    // Create arrow marker for connections
    svg.append("defs").append("marker")
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

    // Draw connection lines with better styling for Query connections
    const linkLines = g.selectAll(".link")
      .data(links)
      .enter().append("line")
      .attr("class", "link")
      .attr("x1", (d: any) => d.source.x + d.source.width)
      .attr("y1", (d: any) => d.source.y + d.source.height / 2)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y + d.target.height / 2)
      .attr("stroke", (d: any) => d.fromRoot ? "hsl(var(--c-primary-400))" : "hsl(var(--c-surface-400))")
      .attr("stroke-width", (d: any) => d.fromRoot ? 3 : 2)
      .attr("opacity", 0.9)
      .attr("marker-end", "url(#arrowhead)");

    // Create node groups
    const nodeGroups = g.selectAll(".node")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .attr("transform", (d: any) => `translate(${d.x}, ${d.y})`)
      .style("cursor", "pointer");

    // Draw node containers (boxes) - CAIDO THEME
    nodeGroups.append("rect")
      .attr("width", (d: any) => d.width)
      .attr("height", (d: any) => d.height)
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("fill", "hsl(var(--c-surface-700))")
      .attr("stroke", (d: any) => d.color)
      .attr("stroke-width", 2)
      .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");

    // Add node headers (type names)
    nodeGroups.append("rect")
      .attr("width", (d: any) => d.width)
      .attr("height", 25)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", (d: any) => d.color);

    nodeGroups.append("text")
      .attr("x", (d: any) => d.width / 2)
      .attr("y", 17)
      .attr("text-anchor", "middle")
      .attr("fill", "#ffffff")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text((d: any) => d.name);

    // Add field lists
    nodeGroups.each(function(d: any) {
      const node = d3.select(this);
      
      if (d.fields && d.fields.length > 0) {
        d.fields.forEach((field: any, index: number) => {
          const y = 35 + (index * 18); // Back to original spacing
          
          // Simple field name display in graph
          node.append("text")
            .attr("x", 8)
            .attr("y", y)
            .attr("font-size", "11px") 
            .attr("fill", "hsl(var(--c-surface-0))")
            .attr("font-family", "monospace")
            .attr("font-weight", "500")
            .text(field.name);
          
          // Field type on the right
          if (field.type) {
            node.append("text")
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

    // Add click handlers for highlighting and focus functionality
    nodeGroups.on("click", (event: any, d: any) => {
      event.stopPropagation(); // Prevent background click
      toggleNodeHighlight(d);
    });

    // Add hover effects - DARK THEME
    nodeGroups.on("mouseenter", function() {
      d3.select(this).select("rect")
        .attr("stroke-width", 3)
        .attr("filter", "drop-shadow(0 4px 12px rgba(0,0,0,0.4))");
    })
    .on("mouseleave", function() {
      d3.select(this).select("rect")
        .attr("stroke-width", 2)
        .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");
    });

    // Show success notification when graph is ready
    sdk.window.showToast("Graph loaded successfully! Click nodes to highlight parent chains.", { variant: "success" });

  } catch (error) {
    sdk.window.showToast(`Failed to load visualization: ${error}`, { variant: "error" });
  }
};

onMounted(() => {
  loadSessions();
});
</script>

<template>
  <div class="flex flex-col h-full gap-1 overflow-hidden">
    <!-- Header -->
    <Card class="h-fit" :pt="{ body: { class: 'h-fit p-0' }, content: { class: 'h-fit flex flex-col' } }">
      <template #content>
        <div class="flex justify-between items-center p-4">
          <div>
            <h3 class="text-lg font-semibold">GraphQL Voyager</h3>
            <p class="text-sm text-surface-300">
              Interactive exploration of GraphQL schema relationships and structure.
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
      :pt="{ body: { class: 'h-fit p-0' }, content: { class: 'h-fit flex flex-col' } }"
    >
      <template #content>
        <div class="p-3">
          <div class="flex gap-2 flex-wrap">
            <Button
              v-for="session in introspectionSessions"
              :key="session.id"
              :class="[
                selectedSessionId === session.id ? '!border-secondary-400' : '!border-surface-700',
                '!bg-surface-900 border-[1px] rounded-md !ring-0'
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
                    session.status === 'success' ? 'bg-success-500' : 
                    session.status === 'error' ? 'bg-red-500' :
                    session.status === 'warning' ? 'bg-yellow-500' : 'bg-surface-400'
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
        :pt="{ body: { class: 'h-full p-0' }, content: { class: 'h-full flex flex-col' } }"
      >
        <template #content>
          <div v-if="introspectionSessions.length === 0" class="h-full flex items-center justify-center">
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">No Sessions Available</div>
              <div class="text-sm">
                <span v-if="sessions.length === 0">No sessions found. Go to Dashboard to scan a GraphQL endpoint.</span>
                <span v-else>No sessions with introspection support available for viewing.</span>
              </div>
            </div>
          </div>
          <div v-else-if="!selectedSession" class="h-full flex items-center justify-center">
            <div class="text-center text-surface-500">
              <i class="fas fa-project-diagram text-4xl mb-4"></i>
              <div class="text-lg mb-2">Select a Session</div>
              <div class="text-sm">Choose a session above to view its interactive GraphQL schema graph.</div>
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
                   <h4 class="font-semibold text-surface-100">Schema Navigation</h4>
                   <Button 
                     icon="fas fa-times" 
                     text 
                     size="small" 
                     @click="isNavExpanded = false"
                     class="text-surface-400 hover:text-surface-200"
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
                 <div v-for="item in filteredItems" :key="item.name" class="mb-1">
                   <!-- Root Item (Query, Mutation, Subscription, Types, Enums) -->
                   <div 
                     class="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-surface-700 transition-colors min-w-0"
                     :class="{
                       'bg-primary-600': item.type === 'root' && item.name === 'Query',
                       'bg-danger-600': item.type === 'root' && item.name === 'Mutation', 
                       'bg-info-600': item.type === 'root' && item.name === 'Subscription',
                       'bg-success-600': item.type === 'type',
                       'bg-secondary-600': item.type === 'enum'
                     }"
                     @click="onNavItemClick(item)"
                   >
                     <div class="flex items-center min-w-0 flex-1">
                       <!-- Chevron for collapsible root sections -->
                       <i 
                         v-if="item.type === 'root' && ['Query', 'Mutation', 'Subscription'].includes(item.name)"
                         :class="expandedSections[item.name] ? 'fas fa-chevron-down' : 'fas fa-chevron-right'"
                         class="text-xs w-3 mr-2 flex-shrink-0 text-surface-300"
                       ></i>
                       
                       <!-- Main icon -->
                       <i 
                         :class="{
                           'fas fa-play': item.name === 'Query',
                           'fas fa-edit': item.name === 'Mutation',
                           'fas fa-bell': item.name === 'Subscription', 
                           'fas fa-cube': item.type === 'type',
                           'fas fa-list': item.type === 'enum'
                         }"
                         class="text-sm w-4 mr-2 flex-shrink-0"
                       ></i>
                       <span class="font-medium text-surface-100 truncate">{{ item.name }}</span>
                     </div>
                     <span class="text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded flex-shrink-0 ml-2">
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
                       <i class="fas fa-arrow-right text-xs w-3 mr-2 text-surface-500 flex-shrink-0"></i>
                       <span class="text-surface-200 truncate">{{ child.name }}</span>
                     </div>
                   </div>
                </div>
              </div>
            </div>
            
            <!-- Expand Sidebar Button -->
            <div v-if="!isNavExpanded" class="w-12 bg-surface-900 border-r border-surface-600 flex items-center justify-center">
              <Button 
                icon="fas fa-bars" 
                text 
                size="small" 
                @click="isNavExpanded = true"
                class="text-surface-400 hover:text-surface-200"
              />
            </div>
            
            <!-- Graph Container -->
            <div class="flex-1 relative">
              <div 
                ref="voyagerContainer"
                class="h-full w-full"
                style="background: hsl(var(--c-surface-800));"
              />
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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