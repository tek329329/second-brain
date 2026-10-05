---
type: conventions
updated: 2026-10-05
---

# Wiki conventions

How this wiki works. Read this before writing to `wiki/`. Method adapted from Andrej Karpathy's LLM wiki pattern; the layer split and the ingest, query, and lint workflows follow it. Folder names and frontmatter are adapted to this vault.

## Three layers, and who owns each

| Layer | Path | Who writes | Rule |
|---|---|---|---|
| Raw | `raw/` | Nobody. Byte copies of original documents. | **Never edit, reformat, or delete a file in `raw/`.** If a document is superseded, keep it and say so in its source page. New versions arrive as new files. |
| Records | `records/` | The user, and the assistant on their instruction | Confirmed facts and imports with JSON frontmatter and provenance. The assistant updates a record when a newer source proves it wrong, preserving the original claim and citing the correction. |
| Wiki | `wiki/` | The assistant owns every write here | Synthesis only. Every claim cites a record or a raw source. Nothing is asserted here that is not traceable downward. |

The wiki never becomes the source of truth. It is the map. When a wiki page and a record disagree, the record wins on facts and the wiki gets fixed.

## Layout

```
wiki/
├── index.md          catalog of every page, by category, one line each
├── log.md            append-only record of ingests, queries, and lint passes (current month)
├── log-archive/      finished months of log.md, one file per month
├── overview.md       the top-level synthesis: who the user is, what is live, what matters now
├── conventions.md    this file
├── areas/            life-area entry points, e.g. business, school, health
├── sources/          one page per raw document or imported cluster
├── entities/         things with an identity: products, stores, tools, people, accounts
├── concepts/         reusable methods, playbooks, rules that outlive any one project
└── analyses/         comparisons, risk reads, and open decisions that span sources
```

`areas/` is a deviation from the source pattern. A life OS is organised by life area before it is organised by document corpus, so the area pages are the normal entry points and everything else supports them.

## Page format

Every wiki page opens with YAML frontmatter:

```yaml
---
type: area | source | entity | concept | analysis | index | log | overview | conventions
updated: YYYY-MM-DD
sources: [acme-store, raw/some-file.md]   # record ids and raw paths this page is built from
status: current | needs-review | superseded
---
```

Records use JSON frontmatter because `npm run index` parses them. Wiki pages use YAML because nothing parses them but a reader. Do not mix the two, and do not put a wiki page in `records/`.

Then a one-line statement of what the page is for, then the body. Keep pages short enough to read whole.

## Area pages

Each `areas/` page has a `records:` line in its frontmatter (comma-separated IDs; a trailing `*` matches a prefix, e.g. `acme-*`). `npm run index` rewrites the block between `<!-- generated:records -->` and `<!-- /generated:records -->` with the live matching records, and lists archived or superseded ones on a single line. Never edit inside the block. The hand-written part interprets: status, blockers, open questions. It does not restate numbers that live in a record (prices, costs, doses, budgets, IDs); it links to the record that owns them. That way a changed value cannot leave a stale copy on a wiki page.

## Linking

- To a record: its id inside double square brackets, matching the vault convention.
- To another wiki page: a relative Markdown link. From a page in `areas/`, an entity page is `../entities/acme-product.md`; from `index.md` at the wiki root it is `entities/acme-product.md`.
- To a raw document: `raw/<filename>`, and name the section if the file is long.

Cross-reference in both directions. A new entity page is not finished until the pages that mention that entity link to it.

## Labelling claims

Every claim carries its standing, in the vault's three categories: **confirmed** (the user said it or a system read proves it), **unconfirmed** (imported, plausible, unverified), **inference** (the assistant's read). Date anything that changes. Where two sources conflict, quote both and say which is newer; never silently pick one.

## The three workflows

Run by the `wiki` skill. Not scheduled unless the user asks.

**Ingest.** A new document or a batch of new facts arrives. Read it, discuss the takeaways with the user, write or update a page in `sources/`, revise every affected entity, concept, area, and analysis page, add the cross-references, update `index.md`, and append to `log.md`. Expect to touch ten to fifteen pages for a substantial source. If the source contradicts a record, fix the record too.

**Query.** A question arrives. Navigate from `index.md` to the pages that matter, read those, answer with citations. If the answer required real synthesis worth keeping, file it back as a new page in `analyses/` so it is not re-derived next time.

**Lint.** A health check over the whole wiki. Look for contradictions between pages (quote both sentences exactly), claims made stale by a newer source, orphan pages nothing links to, missing cross-references, concepts mentioned repeatedly that have no page, and gaps where the wiki keeps saying "unknown" about something worth asking. Report findings; fix only what is unambiguous, and raise the rest.

## What does not belong here

Credentials of any kind, including private feed URLs. Raw dumps of email or chat pasted in place of a summary. Pages created to make the structure look fuller. Anything asserted without a source.
