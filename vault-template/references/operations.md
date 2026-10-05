# Operations: runtimes, sync, and skills

The manual keeps the binding rules; this page has the detail.

## Runtimes

This vault works from Claude Code and Codex.

- `AGENTS.md` (Codex) and `CLAUDE.md` (Claude Code) are identical. Edit both together.
- Skills are authored in `.claude/skills/` and mirrored to `.agents/skills/` (and the application's `.claude/skills/` and `.agents/skills/`) by `npm run skills` from the application folder. Never edit a mirror.
- `.local/` in the application folder (connection settings) does not sync between machines. Re-enter connection settings on each machine.
- The application dashboard is a viewer and history browser. The primary interface is the CLI opened in this folder or the application folder.

## Sync

- At session start, if the vault has uncommitted changes, commit them, then `git pull` (when a remote is configured).
- After any vault change, run `npm run index` from the application folder if records changed, commit, and push without asking.
- After a merge, regenerate `INDEX.md` and skill mirrors (`npm run index`, `npm run skills`) instead of hand-merging them.
- If a push is rejected or a merge conflicts on real content, stop and ask. Never force-push, reset, or discard changes. Application code changes need the user's OK before committing.

**In Claude Code this is automated** by `.claude/hooks/vault-sync.mjs` (wired in `.claude/settings.json` here and in the application folder): `SessionStart` commits and pulls, `PostToolUse` re-indexes after a record edit, and `Stop` indexes, commits, and pushes. If a hook reports a rejected push or a conflict, stop and ask. **Codex has no hooks**, so do these steps by hand there.

To sync between machines, add a private remote to the vault (`git -C vault remote add origin <private repo URL>` then `git -C vault push -u origin main`). Never make the vault repository public.

## Skills

`onboard`, `capture`, `grill-me`, `wiki`, `plan`, `audit`, `cleanup`, `link`, `prompt`. Each `SKILL.md` explains when to use it.

- `onboard`: first-run interview that builds the profile records.
- `capture`: every write into the vault. Sorts lasting facts (state records), decisions, session history (`log`) and work products (`deliverables/`); applies the per-kind body templates and `review_by`; links, applies the wiki-page rule, indexes, and syncs. `cleanup/check.mjs` reports records that break the format.
- `grill-me`: fill missing context, one topic per session, from `brainstorms/QUEUE.md`.
- `wiki`: ingest a document, answer a cross-source question, or lint the synthesis layer.
- `plan`: plan across commitments using vault context.
- `audit`: score the four Cs (context, connections, capabilities, cadence) with evidence.
- `cleanup`: periodic record-and-route hygiene (archive stale items, fix links and routes, refresh hand-written pages, roll old `wiki/log.md` entries into `wiki/log-archive/`).
- `link`: add a route to the manual.
- `prompt`: interrogate a rough build or change request into a brief, build it, then check-fix-recheck against the done-when list.
