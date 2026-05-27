#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../run.js";

interface GroundTruthLabel {
  path: string;
  expectedKind: string;
  namePattern: string;
  acceptableHedge?: string[];
}

interface GroundTruth {
  description: string;
  expectedSummary?: Record<string, number>;
  expectedOpenerSubstrings?: string[];
  labels: GroundTruthLabel[];
}

interface LabelResult {
  path: string;
  status: "correct" | "hedged-correct" | "wrong" | "missing";
  detail: string;
}

interface FixtureResult {
  fixture: string;
  description: string;
  total: number;
  correct: number;
  hedged: number;
  wrong: number;
  missing: number;
  summaryMatched: boolean | null;
  openerMatched: boolean | null;
  labelResults: LabelResult[];
}

async function evalFixture(fixtureDir: string): Promise<FixtureResult | null> {
  const gtPath = path.join(fixtureDir, "ground-truth.json");
  if (!fs.existsSync(gtPath)) return null;
  const gt: GroundTruth = JSON.parse(fs.readFileSync(gtPath, "utf8"));

  const { humanText, json } = await run({
    rootDir: fixtureDir,
    showAll: true,
    terminalWidth: 120,
  });
  const map = JSON.parse(json);

  const fixtureName = path.basename(fixtureDir);
  const result: FixtureResult = {
    fixture: fixtureName,
    description: gt.description,
    total: gt.labels.length,
    correct: 0,
    hedged: 0,
    wrong: 0,
    missing: 0,
    summaryMatched: null,
    openerMatched: null,
    labelResults: [],
  };

  if (gt.expectedSummary) {
    result.summaryMatched = true;
    for (const [k, v] of Object.entries(gt.expectedSummary)) {
      if (map.summary[k] !== v) {
        result.summaryMatched = false;
        break;
      }
    }
  }

  if (gt.expectedOpenerSubstrings) {
    result.openerMatched = gt.expectedOpenerSubstrings.every((s) =>
      humanText.includes(s),
    );
  }

  const nodesByPath = new Map<string, any>(map.nodes.map((n: any) => [n.path, n]));

  for (const label of gt.labels) {
    const node = nodesByPath.get(label.path);
    if (!node) {
      result.missing++;
      result.labelResults.push({
        path: label.path,
        status: "missing",
        detail: "node not in output",
      });
      continue;
    }

    const kindOk = node.kind === label.expectedKind;
    const nameOk = node.name.toLowerCase().includes(label.namePattern.toLowerCase());
    const hedgeOk = (label.acceptableHedge ?? []).some((h) =>
      node.does.toLowerCase().includes(h.toLowerCase()),
    );

    if (kindOk && nameOk) {
      result.correct++;
      result.labelResults.push({
        path: label.path,
        status: "correct",
        detail: `${node.kind} "${node.name}"`,
      });
    } else if (kindOk && (hedgeOk || !label.acceptableHedge)) {
      result.hedged++;
      result.labelResults.push({
        path: label.path,
        status: "hedged-correct",
        detail: `kind ok, name="${node.name}" (expected pattern "${label.namePattern}")`,
      });
    } else {
      result.wrong++;
      result.labelResults.push({
        path: label.path,
        status: "wrong",
        detail: `expected ${label.expectedKind}/${label.namePattern}, got ${node.kind}/${node.name}`,
      });
    }
  }

  return result;
}

function formatResult(r: FixtureResult): string {
  const lines: string[] = [];
  lines.push(`\n${r.fixture}`);
  lines.push("  " + r.description);
  lines.push(`  Labels: ${r.correct} correct / ${r.hedged} hedged / ${r.wrong} wrong / ${r.missing} missing  (of ${r.total})`);
  if (r.summaryMatched !== null) {
    lines.push(`  Summary match: ${r.summaryMatched ? "✓" : "✗"}`);
  }
  if (r.openerMatched !== null) {
    lines.push(`  Opener match: ${r.openerMatched ? "✓" : "✗"}`);
  }
  for (const lr of r.labelResults) {
    if (lr.status === "wrong" || lr.status === "missing") {
      lines.push(`    ✗ ${lr.path}: ${lr.detail}`);
    }
  }
  return lines.join("\n");
}

export async function evalAll(fixturesDir: string): Promise<FixtureResult[]> {
  const fixtures = fs
    .readdirSync(fixturesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(fixturesDir, d.name));

  const results: FixtureResult[] = [];
  for (const fixDir of fixtures) {
    const r = await evalFixture(fixDir);
    if (r) results.push(r);
  }
  return results;
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("runner.ts") ||
  process.argv[1]?.endsWith("runner.js");

if (invokedDirectly) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturesDir = path.resolve(here, "..", "..", "fixtures");
  if (!fs.existsSync(fixturesDir)) {
    console.error(`Eval: fixtures dir not found at ${fixturesDir}`);
    process.exit(1);
  }
  evalAll(fixturesDir).then((results) => {
    let totalCorrect = 0;
    let totalHedged = 0;
    let totalWrong = 0;
    let totalMissing = 0;
    let totalLabels = 0;

    for (const r of results) {
      process.stdout.write(formatResult(r) + "\n");
      totalCorrect += r.correct;
      totalHedged += r.hedged;
      totalWrong += r.wrong;
      totalMissing += r.missing;
      totalLabels += r.total;
    }

    const passed = totalCorrect + totalHedged;
    const passRate = totalLabels === 0 ? 0 : (passed / totalLabels) * 100;
    process.stdout.write("\n");
    process.stdout.write("=".repeat(60) + "\n");
    process.stdout.write(
      `AGGREGATE: ${passed}/${totalLabels} passed (${passRate.toFixed(1)}%) ` +
        `[${totalCorrect} correct, ${totalHedged} hedged, ${totalWrong} wrong, ${totalMissing} missing]\n`,
    );
    process.stdout.write("=".repeat(60) + "\n");

    const failed = totalWrong + totalMissing;
    process.exit(failed > 0 ? 1 : 0);
  });
}
