# Life OS — application folder

This folder is the TypeScript dashboard and local API. The knowledge, the operating manual, and the skills live in `vault/`, a separate private Git repository created from `vault-template/` on first start.

**For anything about the user (their life, business, work, school, health, priorities, plans): read `vault/AGENTS.md` first and follow its routes.** That manual is the source of truth for retrieval, capture, constraints, and how to talk to them. `AGENTS.md` and `CLAUDE.md` here and in the vault are kept identical per runtime.

## Working in this folder

- Primary interface is the CLI (Claude Code or Codex) opened here or in `vault/`. The dashboard (`npm start`, http://127.0.0.1:4317) is a viewer, history browser, and connector UI; do not add features to it without being asked.
- Skills are canonical in `vault/.claude/skills/`. `npm run skills` mirrors them to `vault/.agents/skills/`, `.claude/skills/`, and `.agents/skills/`. Never edit a mirror. `vault-template/` only seeds new vaults; edit the live vault, not the template.
- `npm run index` regenerates `vault/INDEX.md` after direct record edits (it also writes the Attention section: dates in the next 30 days and stale unconfirmed records). `npm run find -- <terms>` searches records in one pass. `npm run brief -- <area page>` prints every live record behind an area page. `npm run index` also regenerates the record lists inside `vault/wiki/areas/*.md` from their `records:` selectors, and flags records past `review_by`. `npm run audit` saves a deterministic coverage record; the `audit` skill is the evidence-based four-Cs audit.
- `npm test`, `npm run lint`, `npm run build` before committing application changes. Tests use temporary vaults.
- Secrets and machine state live in `.local/` (ignored). Never print, commit, or copy connection secrets into the vault.
- Follow the vault sync rule in `vault/AGENTS.md` (commit, pull, and push vault changes). In Claude Code, `vault/.claude/hooks/vault-sync.mjs` does this automatically via `.claude/settings.json`; Codex has no hooks, so do it by hand. For this application repo, ask before committing or pushing. Never force-push either repository.
- Code style: match the existing files; run `npm run format` on what you touched.
