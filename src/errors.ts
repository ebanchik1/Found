export abstract class FoundError extends Error {
  abstract readonly exitCode: number;
  abstract readonly friendlyMessage: string;
  abstract readonly suggestedAction: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotAJsProject extends FoundError {
  readonly exitCode = 2;
  readonly friendlyMessage =
    "Found doesn't recognize this folder as a JavaScript or TypeScript project.";
  readonly suggestedAction =
    "Check that you're pointing at the project root (the folder with `package.json`).";

  constructor(path: string) {
    super(`Not a JS/TS project: ${path}`);
  }
}

export class MonorepoDetected extends FoundError {
  readonly exitCode = 3;
  readonly friendlyMessage =
    "Found doesn't support monorepos yet.";
  readonly suggestedAction =
    "Point me at a single package (the folder with one `package.json`) and I'll try again.";

  constructor(public readonly packageJsonPaths: string[]) {
    super(`Monorepo detected: ${packageJsonPaths.length} package.json files`);
  }
}

export class DependencyCruiserFailed extends FoundError {
  readonly exitCode = 0;
  readonly friendlyMessage =
    "Found had trouble reading this project's files. Some labels may be less certain.";
  readonly suggestedAction =
    "Try running with `--debug` to see what happened.";

  constructor(public readonly underlying: unknown) {
    super(
      `dependency-cruiser failed: ${
        underlying instanceof Error ? underlying.message : String(underlying)
      }`,
    );
  }
}

export class CatastrophicParseFailure extends FoundError {
  readonly exitCode = 4;
  readonly friendlyMessage =
    "Found couldn't parse any of your source files. Both the main parser and the fallback failed.";
  readonly suggestedAction =
    "This is a bug — please report it at github.com/[user]/found/issues with the output of `--debug`.";

  constructor(public readonly underlying: unknown) {
    super(
      `Catastrophic parse failure: ${
        underlying instanceof Error ? underlying.message : String(underlying)
      }`,
    );
  }
}

export class UnknownError extends FoundError {
  readonly exitCode = 1;
  readonly friendlyMessage =
    "Something went wrong inside Found.";
  readonly suggestedAction =
    "This is a bug — please report it at github.com/[user]/found/issues with the output of `--debug`.";

  constructor(public readonly underlying: unknown) {
    super(
      `Unknown error: ${
        underlying instanceof Error ? underlying.message : String(underlying)
      }`,
    );
  }
}

export function wrapUnknown(err: unknown): FoundError {
  if (err instanceof FoundError) return err;
  return new UnknownError(err);
}
