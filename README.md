# Found — a plain-language map for vibe-coded apps

> You built an app with AI. It works. But you open the folder a week later and have no idea what any of it is, what's safe to touch, or what happens if you break something. **Found reads your project and tells you what you have, in plain English.**

Open-source, MIT, contributions welcome. Focused tool, not a platform. See [Scope](#scope) before filing a feature request.

---

## Install / run

No install required:

```bash
npx @ebanchik/found .
```

Or install globally:

```bash
npm install -g @ebanchik/found
found .
```

## What it does

Point it at a project folder. It prints a map like:

```
Your app is 4 screens and 2 helpers. That's all of it.

SCREENS PEOPLE SEE
  The home screen        A screen at /. Probably where people land when they open the app.
                         app/page.tsx
  The login screen       A screen at /login. Probably where people sign in.
                         app/login/page.tsx
  ...

BEHIND THE SCENES (you've never had to open these)
  A shared helper — `db`     Used by 3 other files. I can't tell exactly what it does without a closer look.
                             src/lib/db.ts
```

That's the whole product.

## Flags

| Flag | What it does |
|---|---|
| `--json` | Output `found-map.json` to stdout instead of human text |
| `--all` | Show every item without the 20-per-section listing cap |
| `--debug` | Show underlying stack traces beneath friendly errors |

## Scope

**In scope:**
- JavaScript / TypeScript projects (React, Next.js, Vite). This is what AI tools mostly generate.
- Single apps. One `package.json`, one project.
- Read-only. Found never modifies your code.

**Out of scope (for now):**
- Other languages (Python, Go, etc.)
- Monorepos / multi-package workspaces
- Anything that writes to or runs your code

## Honest hedging

A confident wrong label is worse than no label. Found maps each finding's confidence to one of three treatments:

| Confidence | Treatment | Example |
|---|---|---|
| High (≥ 0.8) | State plainly | "The sign-in screen — where people log in." |
| Medium (0.5–0.8) | Hedge visibly | "A screen at /login. **Probably** where people sign in." |
| Low (< 0.5) | Don't guess | "A file called `helpers.js` — I can't tell what this does without a closer look." |

For someone who's lost, an honest hedge beats a confident wrong answer every time.

## Privacy

- No telemetry. No analytics. No phone-home.
- v0.1 is fully local — your code never leaves your machine.
- v0.2a will add optional LLM-enriched labels via a single batched call. Even then, the LLM sees the **parsed structure** (paths, exports, import edges) — never your raw source. API key is opt-in via env var. No key, no LLM call.

## Schema reference

Found writes `found-map.json` (with `--json`) following this shape:

```json
{
  "version": "0.1",
  "generatedAt": "2026-05-27T15:00:00Z",
  "summary": {
    "screens": 4,
    "endpoints": 0,
    "components": 0,
    "helpers": 2,
    "configFiles": 6,
    "tests": 0,
    "unknown": 0
  },
  "nodes": [
    {
      "path": "src/screens/Login.jsx",
      "kind": "screen",
      "name": "The sign-in screen",
      "does": "A screen at /login. Probably where people sign in.",
      "confidence": 0.85,
      "confidenceSource": "convention+graph",
      "userFacing": true
    }
  ],
  "edges": [
    { "from": "src/screens/Login.jsx", "to": "src/lib/email.js" }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | `"0.1"` | Schema version. Bumped on breaking changes. |
| `generatedAt` | ISO 8601 string | When the map was produced. |
| `summary` | object | Counts by kind. |
| `nodes[].kind` | enum | `screen` / `endpoint` / `component` / `helper` / `config` / `test` / `entrypoint` / `unknown` |
| `nodes[].confidence` | number 0–1 | Drives hedging in the human renderer. |
| `nodes[].confidenceSource` | enum | `convention` / `convention+graph` / `graph` / `model` (v0.2a). Lets you audit where a label came from. |
| `nodes[].userFacing` | boolean | Whether the user sees it directly. |
| `edges[]` | array | Dependency graph. `from` imports `to`. |

The schema is additive between minor versions. v0.2a will add LLM-enriched `does` and model-emitted `confidence` without breaking v0.1 consumers.

## Roadmap

- **v0.1** — Static map. Deterministic only. This is what's here.
- **v0.2a** — Add LLM-enriched labels via a single batched cheap-model call. `confidenceSource: "model"`.
- **v0.2b** — `--change "..."` for blast-radius queries: "I want to change the login flow → touch these files, avoid these, likely symptom if it breaks."
- **Beyond** — watch mode, "what just happened" diff narration, explain-on-demand. Not promised, listed for orientation.

## Contributing

The high-value places to help:
- **More accurate conventions** (the label table in `src/classify.ts`) for framework variants the scanner misses.
- **Synthetic fixtures** that exercise specific real-world patterns — see `fixtures/` for the format.
- **New stacks** (Python, etc.) — but as additive scanners behind the same interface, keeping each one honest about what it can't read.

Keep PRs scoped. The fastest way to make this worse is to turn it into five tools.

## Development

```bash
npm install
npm test          # vitest unit tests (100+ tests)
npm run eval      # synthetic eval against fixtures/
npm run typecheck # tsc --noEmit
npm run dev .     # run found against the current directory
```

The eval harness scores Found's output against `fixtures/*/ground-truth.json`. Aim for ≥80% correct-or-hedged-correct before shipping.

## License

MIT. See [LICENSE](./LICENSE).
