import type { BuiltOn, DescribedNode, FoundMap, GraphData, Summary } from "./types.js";

export interface RenderOptions {
  showAll: boolean;
  terminalWidth: number;
  parserUsed: GraphData["parserUsed"];
}

const DEFAULT_LISTING_CAP = 20;

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

export function renderOpener(summary: Summary): string {
  if (summary.screens === 0) {
    const helperPart =
      summary.helpers > 0 ? pluralize(summary.helpers, "helper", "helpers") : null;
    const endpointPart =
      summary.endpoints > 0
        ? pluralize(summary.endpoints, "endpoint", "endpoints")
        : null;
    const parts = [helperPart, endpointPart].filter((p): p is string => p !== null);
    if (parts.length === 0) {
      return "Found didn't see any screens, helpers, or endpoints in this project. It might be a library, a back-end-only service, or the routes aren't set up yet.";
    }
    return `Found didn't see any screens in this project. It might be a library, a back-end-only service, or the routes aren't set up yet. (It does have ${joinList(parts)}.)`;
  }

  const parts: string[] = [pluralize(summary.screens, "screen", "screens")];
  if (summary.endpoints > 0) parts.push(pluralize(summary.endpoints, "endpoint", "endpoints"));
  if (summary.components > 0) parts.push(pluralize(summary.components, "component", "components"));
  if (summary.helpers > 0) parts.push(pluralize(summary.helpers, "helper", "helpers"));

  return `Your app is ${joinList(parts)}. That's all of it.`;
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
}

export function truncatePath(filePath: string, maxWidth: number): string {
  if (filePath.length <= maxWidth) return filePath;
  if (maxWidth <= 3) return "...".slice(0, maxWidth);
  const keep = maxWidth - 3;
  return "..." + filePath.slice(filePath.length - keep);
}

function applyHedge(name: string, does: string, confidence: number): { name: string; does: string } {
  if (confidence >= 0.8) {
    return { name, does };
  }
  if (confidence >= 0.5) {
    return { name, does };
  }
  return { name, does };
}

function compareScreens(a: DescribedNode, b: DescribedNode): number {
  return a.path.localeCompare(b.path);
}

function compareHelpers(
  a: DescribedNode,
  b: DescribedNode,
  fanIn: Map<string, number>,
): number {
  const aFan = fanIn.get(a.path) ?? 0;
  const bFan = fanIn.get(b.path) ?? 0;
  if (aFan !== bFan) return bFan - aFan;
  return a.path.localeCompare(b.path);
}

function alphabetical(a: DescribedNode, b: DescribedNode): number {
  return a.path.localeCompare(b.path);
}

interface RenderedSection {
  header: string;
  rows: { name: string; does: string; pathDisplay: string }[];
  truncatedCount: number;
}

function buildSection(
  header: string,
  nodes: DescribedNode[],
  opts: RenderOptions,
  pathWidth: number,
): RenderedSection {
  const cap = opts.showAll ? Infinity : DEFAULT_LISTING_CAP;
  const visibleNodes = nodes.slice(0, cap);
  const truncatedCount = Math.max(0, nodes.length - visibleNodes.length);

  const rows = visibleNodes.map((n) => {
    const hedged = applyHedge(n.name, n.does, n.confidence);
    return {
      name: hedged.name,
      does: hedged.does,
      pathDisplay: truncatePath(n.path, pathWidth),
    };
  });

  return { header, rows, truncatedCount };
}

function renderSection(section: RenderedSection): string {
  if (section.rows.length === 0) return "";
  const lines = [section.header, ""];
  const maxNameLen = Math.max(...section.rows.map((r) => r.name.length));
  for (const row of section.rows) {
    const namePad = row.name.padEnd(Math.min(maxNameLen, 32));
    lines.push(`  ${namePad}  ${row.does}`);
    lines.push(`  ${" ".repeat(Math.min(maxNameLen, 32))}  ${row.pathDisplay}`);
    lines.push("");
  }
  if (section.truncatedCount > 0) {
    lines.push(
      `  ...and ${section.truncatedCount} more. Run with --all to see everything.`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

const CATEGORY_LABELS: Record<string, string> = {
  language: "Language",
  frontend: "Frontend",
  styling: "Styling",
  ai: "AI",
  state: "State management",
  data: "Data fetching",
  backend: "Backend",
  database: "Database",
  auth: "Auth",
  testing: "Testing",
  deployment: "Deployment",
  tooling: "Tooling",
  other: "Other",
};

const CATEGORY_ORDER = [
  "language",
  "frontend",
  "styling",
  "ai",
  "state",
  "data",
  "backend",
  "database",
  "auth",
  "deployment",
  "testing",
  "tooling",
  "other",
];

export function renderBuiltOn(builtOn: BuiltOn | undefined): string {
  if (!builtOn || builtOn.tags.length === 0) return "";
  const lines: string[] = ["WHAT THIS APP IS BUILT ON"];
  if (builtOn.summary) {
    lines.push("");
    lines.push("  " + wrapLines(builtOn.summary, 90, "  ").trimStart());
  }

  const grouped = new Map<string, string[]>();
  for (const tag of builtOn.tags) {
    if (!grouped.has(tag.category)) grouped.set(tag.category, []);
    grouped.get(tag.category)!.push(tag.label);
  }

  const orderedCategories = CATEGORY_ORDER.filter((c) => grouped.has(c));
  if (orderedCategories.length > 0) {
    lines.push("");
    const maxLabelLen = Math.max(
      ...orderedCategories.map((c) => (CATEGORY_LABELS[c] ?? c).length),
    );
    for (const category of orderedCategories) {
      const label = CATEGORY_LABELS[category] ?? category;
      const padded = (label + ":").padEnd(maxLabelLen + 2);
      const items = grouped.get(category)!.join(", ");
      lines.push(`  ${padded}  ${items}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function wrapLines(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = indent;
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.trim().length > 0) {
      lines.push(current.trimEnd());
      current = indent + word;
    } else if (current === indent) {
      current = indent + word;
    } else {
      current += " " + word;
    }
  }
  if (current.trim().length > 0) lines.push(current.trimEnd());
  return lines.join("\n");
}

export function renderText(map: FoundMap, opts: RenderOptions, graph: GraphData): string {
  const pathWidth = Math.max(20, Math.floor(opts.terminalWidth * 0.6));
  const screens = map.nodes.filter((n) => n.kind === "screen").sort(compareScreens);
  const endpoints = map.nodes.filter((n) => n.kind === "endpoint").sort(alphabetical);
  const components = map.nodes.filter((n) => n.kind === "component").sort(alphabetical);
  const helpers = map.nodes
    .filter((n) => n.kind === "helper")
    .sort((a, b) => compareHelpers(a, b, graph.fanIn));
  const unknown = map.nodes.filter((n) => n.kind === "unknown").sort(alphabetical);

  const sections: string[] = [];
  const builtOnText = renderBuiltOn(map.builtOn);
  if (builtOnText) {
    sections.push(builtOnText);
  }
  sections.push(renderOpener(map.summary));
  sections.push("");

  if (opts.parserUsed === "babel-fallback") {
    sections.push(
      "(Found had to use a simpler parser for this project. Some labels may be less certain.)",
    );
    sections.push("");
  }

  if (screens.length > 0) {
    sections.push(
      renderSection(buildSection("SCREENS PEOPLE SEE", screens, opts, pathWidth)),
    );
  }
  if (endpoints.length > 0) {
    sections.push(
      renderSection(buildSection("API ENDPOINTS", endpoints, opts, pathWidth)),
    );
  }
  if (components.length > 0) {
    sections.push(
      renderSection(
        buildSection(
          "REUSABLE PIECES (you've never had to open these)",
          components,
          opts,
          pathWidth,
        ),
      ),
    );
  }
  if (helpers.length > 0) {
    sections.push(
      renderSection(
        buildSection(
          "BEHIND THE SCENES (you've never had to open these)",
          helpers,
          opts,
          pathWidth,
        ),
      ),
    );
  }
  if (unknown.length > 0) {
    sections.push(
      renderSection(
        buildSection(
          "FILES I COULDN'T CONFIDENTLY EXPLAIN",
          unknown,
          opts,
          pathWidth,
        ),
      ),
    );
  }

  return sections.filter((s) => s !== "").join("\n");
}

export function renderConfigSummary(configCount: number): string {
  if (configCount === 0) return "";
  if (configCount === 1) return "Plus 1 settings file (you've never had to open it).";
  return `Plus ${configCount} settings files (you've never had to open these).`;
}
