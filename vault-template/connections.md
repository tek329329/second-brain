# Connections

Registry of every system the second brain can reach. One row per domain. `audit` checks this file for coverage and freshness. Mechanisms: `mcp`, `app-connector` (the Life OS dashboard adapter, read-only, manual refresh), `script`, `export` (manual file drop), `browser`, `not connected`. Secrets never go in this file; they live in the application's ignored `.local/`.

| # | Domain | Tool | Mechanism | Runtime | Last successful read | Notes / how-to |
|---|---|---|---|---|---|---|
| 1 | Revenue, store, orders | none | `not connected` | — | never | |
| 2 | Calendar | none | `not connected` | — | never | Google Calendar and Microsoft 365 adapters exist in the dashboard; they need a scoped token. |
| 3 | Email | none | `not connected` | — | never | |
| 4 | Tasks | none | `not connected` | — | never | Tasks live in `deliverables/` plans until a tracker is chosen. |
| 5 | Finance | none | `not connected` | — | never | Manual `export` (CSV into a record) is the safe first step; no bank credentials ever. |
| 6 | Meetings, transcripts | none | `not connected` | — | never | Import transcripts as files through the dashboard or into `raw/`. |
| 7 | Knowledge, files | This vault | local files | both | — | |

When a new tool is wired: add or update its row, write `references/<tool>.md` with endpoints, auth flow (no values), and common queries, and note the date of the first successful read.
