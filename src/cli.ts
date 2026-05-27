#!/usr/bin/env node
import { Command } from "commander";
import { run } from "./run.js";
import { FoundError, wrapUnknown } from "./errors.js";

interface CliOptions {
  json: boolean;
  all: boolean;
  debug: boolean;
}

async function main(argv: string[]): Promise<number> {
  const program = new Command();
  program
    .name("found")
    .description("A plain-language map for vibe-coded apps. Tells you what you have, in English.")
    .argument("[path]", "Path to the project folder", ".")
    .option("--json", "Output found-map.json to stdout instead of human text", false)
    .option("--all", "Show every item without listing caps", false)
    .option("--debug", "Show underlying stack traces beneath friendly errors", false);

  program.parse(argv, { from: "user" });
  const opts = program.opts<CliOptions>();
  const targetPath = (program.args[0] as string | undefined) ?? ".";

  try {
    const { humanText, json } = await run({
      rootDir: targetPath,
      showAll: opts.all,
      terminalWidth: process.stdout.columns ?? 80,
    });

    if (opts.json) {
      process.stdout.write(json + "\n");
    } else {
      process.stdout.write(humanText + "\n");
    }
    return 0;
  } catch (err) {
    const founderr = wrapUnknown(err);
    process.stderr.write(renderError(founderr, opts.debug) + "\n");
    return founderr.exitCode === 0 ? 1 : founderr.exitCode;
  }
}

function renderError(err: FoundError, debug: boolean): string {
  let out = `\n${err.friendlyMessage}\n${err.suggestedAction}\n`;
  if (debug) {
    out += `\n--- debug ---\n`;
    out += `${err.name}: ${err.message}\n`;
    if (err.stack) out += `${err.stack}\n`;
    if ("underlying" in err && err.underlying instanceof Error) {
      out += `\nUnderlying: ${err.underlying.message}\n${err.underlying.stack ?? ""}\n`;
    }
  }
  return out;
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("cli.ts") ||
  process.argv[1]?.endsWith("cli.js");

if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

export { main };
