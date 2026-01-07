import * as d3 from "d3";
import type { GraphQLField, GraphQLSchema, GraphQLType } from "shared";
import type { Ref } from "vue";

import { useSDK } from "@/plugins/sdk";

import type { D3Link, D3Node } from "./types";
import { LAYOUT, extractTypeName } from "./types";

export function useVoyagerVisualization(
  voyagerContainer: Ref<HTMLDivElement | undefined>,
  currentZoom: Ref<d3.ZoomBehavior<SVGSVGElement, unknown> | undefined>,
  currentTransform: Ref<d3.ZoomTransform>,
  highlightedNodeId: Ref<number | undefined>,
  cachedD3Data: Ref<{ nodes: D3Node[]; links: D3Link[] } | undefined>,
  debouncedSearchTerm: Ref<string>,
  updateNodeStyles: (nodes: D3Node[], highlightedIds: number[]) => void,
  toggleNodeHighlight: (nodeData: D3Node) => void,
) {
  const sdk = useSDK();

  const parseSchemaToD3 = (schema: GraphQLSchema) => {
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];
    const nodeMap = new Map();
    let nodeId = 0;

    const calculateBoxDimensions = (
      fields: GraphQLField[],
      title: string,
    ): { width: number; height: number } => {
      const titleWidth = title.length * 12 + 40;
      let maxFieldWidth = titleWidth;

      if (fields.length > 0) {
        fields.forEach((field: GraphQLField) => {
          const fieldText =
            field.name + (field.type !== undefined ? `: ${field.type}` : "");
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
    let queryNode: D3Node | undefined = undefined;

    if (schema.queries.length > 0) {
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

    if (schema.mutations.length > 0) {
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

    if (schema.subscriptions.length > 0) {
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

    if (schema.types.length > 0) {
      let currentX =
        queryNode !== undefined
          ? queryNode.x + queryNode.width + LAYOUT.COLUMN_SPACING
          : 550;
      let currentY = 50;
      let maxWidthInColumn = 0;

      schema.types.forEach((type: GraphQLType, index: number) => {
        const id = nodeId++;
        const fieldsToShow = type.fields ?? [];
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

    if (schema.enums.length > 0) {
      let enumX =
        nodes.length > 0
          ? Math.max(...nodes.map((n) => n.x + n.width)) + LAYOUT.COLUMN_SPACING
          : 1200;
      let enumY = 50;

      schema.enums.forEach(
        (enumType: { name: string; values: Array<{ name: string }> }) => {
          const id = nodeId++;
          const enumValues = enumType.values ?? [];

          const enumFields: GraphQLField[] = enumValues.map(
            (v: { name: string }) => ({
              name: v.name,
              args: [],
              type: enumType.name,
            }),
          );
          const dimensions = calculateBoxDimensions(enumFields, enumType.name);
          const node = {
            id,
            name: enumType.name,
            type: "enum",
            color: "hsl(var(--c-secondary-600))",
            fields: enumFields,
            x: enumX,
            y: enumY,
            width: dimensions.width,
            height: dimensions.height,
          };

          nodes.push(node);
          nodeMap.set(enumType.name, node);
          enumY += dimensions.height + LAYOUT.ENUM_SPACING;
        },
      );
    }
    ["Query", "Mutation", "Subscription"].forEach((rootType) => {
      const rootNode = nodeMap.get(rootType);
      if (rootNode !== undefined && rootNode.fields !== undefined) {
        rootNode.fields.forEach((field: GraphQLField) => {
          const returnType = extractTypeName(field.type);
          const targetNode = nodeMap.get(returnType);
          if (targetNode !== undefined && rootNode !== targetNode) {
            links.push({
              source: rootNode,
              target: targetNode,
              type: "field",
              fieldName: field.name,
            });
          }
        });
      }
    });

    if (schema.types.length > 0) {
      schema.types.forEach((type: GraphQLType) => {
        const sourceNode = nodeMap.get(type.name);
        if (type.fields !== undefined && sourceNode !== undefined) {
          type.fields.forEach((field: GraphQLField) => {
            const fieldType = extractTypeName(field.type);
            const targetNode = nodeMap.get(fieldType);
            if (targetNode !== undefined && sourceNode !== targetNode) {
              links.push({
                source: sourceNode,
                target: targetNode,
                type: "field",
                fieldName: field.name,
              });
            }
          });
        }
      });
    }

    return { nodes, links };
  };

  const loadVoyagerVisualization = () => {
    if (cachedD3Data.value === undefined) return;

    try {
      if (voyagerContainer.value === undefined) {
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

      svg.call(zoom);
      currentZoom.value = zoom;

      svg.on("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement | undefined;
        if (
          target === undefined ||
          target === event.currentTarget ||
          (target !== null && target.tagName === "svg")
        ) {
          highlightedNodeId.value = undefined;
          if (cachedD3Data.value !== undefined) {
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

      links.forEach((link: D3Link) => {
        const sourceNode =
          typeof link.source === "object"
            ? link.source
            : nodes.find((n) => n.id === link.source);
        const targetNode =
          typeof link.target === "object"
            ? link.target
            : nodes.find((n) => n.id === link.target);

        if (sourceNode === undefined || targetNode === undefined) return;

        const fieldIndex =
          sourceNode.fields?.findIndex(
            (f: { name: string; type: string }) => f.name === link.fieldName,
          ) ?? -1;
        const fieldIndexToUse = fieldIndex >= 0 ? fieldIndex : 0;
        const fieldY =
          sourceNode.y +
          LAYOUT.HEADER_HEIGHT +
          10 +
          fieldIndexToUse * LAYOUT.FIELD_HEIGHT;

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
            link.fromRoot === true
              ? "hsl(var(--c-primary-400))"
              : "hsl(var(--c-surface-400))",
          )
          .attr(
            "stroke-width",
            link.fromRoot === true ? 2.5 : 1.5,
          )
          .attr("fill", "none")
          .attr("opacity", 0.7)
          .attr("marker-end", "url(#arrowhead)")
          .style("transition", "all 0.2s ease");

        const linkFieldName = link.fieldName;
        if (linkFieldName !== undefined) {
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
            .text(linkFieldName);
        }

        const linkFromRoot = link.fromRoot === true;
        linkPath
          .on("mouseenter", function () {
            d3.select(this)
              .attr("stroke-width", linkFromRoot ? 3.5 : 2.5)
              .attr("opacity", 1);

            if (linkFieldName !== undefined) {
              linkGroup
                .selectAll(".link-label")
                .filter(function () {
                  const label = d3.select(this as SVGElement);
                  return label.text() === linkFieldName;
                })
                .attr("opacity", 1);
            }
          })
          .on("mouseleave", function () {
            d3.select(this as SVGElement)
              .attr("stroke-width", linkFromRoot ? 2.5 : 1.5)
              .attr("opacity", 0.7);

            linkGroup.selectAll(".link-label").attr("opacity", 0);
          });
      });

      const nodeGroups = g
        .selectAll<SVGGElement, D3Node>(".node")
        .data(nodes)
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d: D3Node) => `translate(${d.x}, ${d.y})`)
        .style("cursor", "pointer");

      nodeGroups
        .append("rect")
        .attr("width", (d: D3Node) => d.width)
        .attr("height", (d: D3Node) => d.height)
        .attr("rx", 8)
        .attr("ry", 8)
        .attr("fill", "hsl(var(--c-surface-700))")
        .attr("stroke", (d: D3Node) => d.color)
        .attr("stroke-width", 2)
        .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");

      nodeGroups
        .append("rect")
        .attr("width", (d: D3Node) => d.width)
        .attr("height", 25)
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("fill", (d: D3Node) => d.color);

      nodeGroups
        .append("text")
        .attr("x", (d: D3Node) => d.width / 2)
        .attr("y", 17)
        .attr("text-anchor", "middle")
        .attr("fill", "#ffffff")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text((d: D3Node) => d.name);

      nodeGroups.each(function (d: D3Node) {
        const node = d3.select(this as SVGElement);

        if (d.fields !== undefined && d.fields.length > 0) {
          d.fields.forEach(
            (field: { name: string; type: string }, index: number) => {
              const y = 35 + index * 18;

              node
                .append("text")
                .attr("x", 8)
                .attr("y", y)
                .attr("font-size", "11px")
                .attr("fill", "hsl(var(--c-surface-0))")
                .attr("font-family", "monospace")
                .attr("font-weight", "500")
                .text(field.name);

              if (field.type !== undefined) {
                node
                  .append("text")
                  .attr("x", d.width - 12)
                  .attr("y", y)
                  .attr("text-anchor", "end")
                  .attr("font-size", "10px")
                  .attr("fill", "hsl(var(--c-surface-300))")
                  .attr("font-style", "italic")
                  .text(field.type);
              }
            },
          );
        }
      });

      nodeGroups.on("click", (event: MouseEvent, d: D3Node) => {
        event.stopPropagation();
        toggleNodeHighlight(d);
      });

      nodeGroups
        .on(
          "mouseenter",
          function (this: SVGElement, event: MouseEvent, d: D3Node) {
            d3.select(this)
              .select("rect")
              .attr("stroke-width", 3)
              .attr("filter", "drop-shadow(0 4px 12px rgba(0,0,0,0.4))");

            const tooltipHtml = `
        <div style="background: hsl(var(--c-surface-900)); border: 1px solid hsl(var(--c-surface-600)); padding: 8px; border-radius: 6px; max-width: 300px;">
          <div style="font-weight: bold; color: ${d.color}; margin-bottom: 4px;">${d.name}</div>
          <div style="font-size: 11px; color: hsl(var(--c-surface-300));">
            Type: ${d.type}<br/>
            Fields: ${d.fields?.length ?? 0}
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

            d3.select(this).on("mousemove", (e: MouseEvent) => {
              tooltip
                .style("left", e.pageX + 10 + "px")
                .style("top", e.pageY - 28 + "px");
            });
          },
        )
        .on("mouseleave", function () {
          d3.select(this)
            .select("rect")
            .attr("stroke-width", 2)
            .attr("filter", "drop-shadow(0 2px 8px rgba(0,0,0,0.3))");

          d3.selectAll(".voyager-tooltip").remove();
        });

      if (debouncedSearchTerm.value !== "") {
        const search = debouncedSearchTerm.value.toLowerCase();
        nodeGroups.each(function (d: D3Node) {
          const node = d3.select(this);
          const matches =
            d.name.toLowerCase().includes(search) ||
            (d.fields?.some((f: { name: string; type: string }) =>
              f.name.toLowerCase().includes(search),
            ) ??
              false);

          if (matches) {
            node
              .select("rect")
              .attr("stroke", "hsl(var(--c-warning-400))")
              .attr("stroke-width", 3);
          }
        });
      }

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

  return {
    parseSchemaToD3,
    loadVoyagerVisualization,
  };
}

