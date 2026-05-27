# Install and first use — Found

A step-by-step guide for new users.

## Prerequisites

You need Node.js 18 or newer. Check what you have:

```bash
node --version
```

If it says `v18.x.x` or higher, you're set. If it says lower or "command not found," install Node from https://nodejs.org (pick the "LTS" download).

---

## Quick path (zero install)

The easiest way. Two commands, ~15 seconds.

**Step 1 — open a terminal.** Terminal on Mac, iTerm, or any terminal app.

**Step 2 — go to the project you want to map.**

```bash
cd ~/path/to/your-app
```

The folder needs to have a `package.json` in it. That's the root of a JavaScript/TypeScript project.

**Step 3 — run Found.**

```bash
npx @ebanchik/found .
```

The `.` means "the current folder." First time takes 10–15 seconds (npx fetches the package). After that, it's cached locally and runs instantly.

That's it. You'll see something like this:

```
Your app is 4 screens and 2 helpers. That's all of it.

SCREENS PEOPLE SEE
  The home screen      A screen at /. Probably where people land when they open the app.
                       src/pages/Home.tsx
  The login screen     A screen at /login. Probably where people sign in.
                       src/pages/Login.tsx
  ...

BEHIND THE SCENES (you've never had to open these)
  A shared helper — `db`     Used by 3 other files. I can't tell exactly what it does without a closer look.
                             src/lib/db.ts
  ...

Plus 6 settings files (you've never had to open these).
```

---

## Install once, use anywhere

If you'll use Found on multiple projects, install it globally:

```bash
npm install -g @ebanchik/found
```

Then anywhere:

```bash
cd ~/any-project
found .
```

To update later:

```bash
npm update -g @ebanchik/found
```

---

## Reading the output

| Section | What's in it |
|---|---|
| **Opener line** | "Your app is N screens and M helpers." This is the whole product in one sentence — the boundary of what you have. |
| **SCREENS PEOPLE SEE** | Pages your users navigate to. Each shows its URL and the file behind it. |
| **API ENDPOINTS** | Back-end routes (if any). Shows up for Next.js, Vercel API routes, etc. |
| **REUSABLE PIECES** | UI components used inside screens. The "N screens or other pieces" tells you how shared each one is. |
| **BEHIND THE SCENES** | Helper files: data, utilities, state stores. You probably never open these directly. |
| **FILES I COULDN'T CONFIDENTLY EXPLAIN** | Found's honest "I'm not sure" bucket. When something doesn't match a clear convention, it goes here rather than getting a misleading label. |
| **Plus N settings files** | Config files (`package.json`, `tsconfig.json`, `*.config.*`, `.env`) collapsed into one count. |

The labels use a deliberate hedging style. When Found is confident, it states things plainly. When it isn't sure, it says "probably" or "I can't tell exactly without a closer look." A hedge is information — it tells you which labels to trust at a glance and which to verify yourself. **A confident wrong label is worse than no label.**

---

## Richer labels (optional)

By default Found ships with deterministic labels — accurate but flat ("A screen at /Input. Probably where people interact with input."). Setting an Anthropic API key turns those into real descriptions ("Where users enter the credit cards they have and how much they spend in each category.").

**Setup:**

1. Get an API key at https://console.anthropic.com/settings/keys
2. Export it in your shell:
   ```bash
   export FOUND_ANTHROPIC_KEY=sk-ant-...
   ```
3. Run Found as usual:
   ```bash
   npx @ebanchik/found .
   ```

**What gets sent to the model:** file paths, what each file exports (names only), import edges, route info, and the kind hint Found computed deterministically. **Your source code never leaves your machine.** Cost per run is fractions of a cent on a small (Haiku-class) model.

**Skip the LLM step anytime:**

```bash
found . --no-llm   # use deterministic labels even when a key is set
```

If the LLM call fails (network down, wrong key, malformed response), Found silently falls back to deterministic labels and prints a warning to stderr.

## Flags

```bash
found . --all      # Show every item, no listing cap (default cap is 20 per section)
found . --json     # Output found-map.json to stdout instead of human text
found . --debug    # Show stack traces beneath friendly errors (for bug reports)
found . --no-llm   # Skip the LLM enrichment, use deterministic labels only
```

---

## Common situations

**"Found doesn't recognize this folder as a JavaScript or TypeScript project."**
You're not in the project root. Move to the folder that contains `package.json`:

```bash
cd ../  # or wherever the package.json lives
found .
```

**"Found doesn't support monorepos yet."**
Your folder has more than one `package.json` (excluding test fixtures, node_modules, etc.). Point at a single package instead:

```bash
found ./packages/web   # or whichever one you want to map
```

**"Found didn't see any screens in this project."**
The project doesn't have a UI — it might be a library, a back-end service, or the routes aren't wired up yet. The other sections (helpers, endpoints) will still be populated, and the message will tell you why no screens showed up.

**Something is in the wrong section.**
This is the LLM-less version of Found. It maps files using filename + directory conventions plus the import graph. Real vibe-coded apps occasionally have unconventional structure that the rules miss. Look at the file yourself; if you think the classification is wrong, file an issue with the path and what you think it should be: https://github.com/ebanchik1/Found/issues

---

## What Found does and doesn't do

**Does:**

- Scans your project read-only (never modifies files)
- Tells you what's there in plain English
- Stays local by default — no network calls unless you opt into LLM-enriched labels via `FOUND_ANTHROPIC_KEY`
- When the LLM step is enabled: sends only parsed structure (paths, exports, import edges), never your source code

**Doesn't:**

- Touch your code
- Suggest changes
- Send your raw source anywhere (even with the LLM step enabled)
- Replace reading the actual source. It's a map, not an explanation.

---

## Next time you come back to your project

You don't need to memorize anything. Just run:

```bash
cd ~/path/to/your-app
npx @ebanchik/found .
```

It re-scans every time, so the map reflects whatever you have right now. If you've added new screens or helpers since the last run, they'll show up.

---

## What's next for Found itself

- **v0.2a** will add LLM-enriched labels, so "Probably where people interact with input" becomes "where people add their credit cards and tell us what they spend."
- **v0.2b** will add `--change "..."` queries so you can ask "if I want to change the sign-in flow, which files do I touch?"

Track progress at https://github.com/ebanchik1/Found.
