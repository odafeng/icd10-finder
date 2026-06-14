# 1. ICD-10-CM data source: bundle CMS code list offline

## Status

Accepted

## Context

The extension maps highlighted text to ICD-10-CM codes. It is used by a clinician
on a web-based EMR, so the highlighted text may be patient-adjacent. Two ways to
get the codes:

- Call an online API per lookup (e.g. NLM Clinical Table Search Service). Always
  current, zero bundle weight, but every query leaves the machine — a privacy
  concern around patient data — and it fails offline.
- Bundle the full code list inside the extension and search locally.

The NLM autocomplete API also caps pagination (HTTP 400 beyond offset ~7000), so
it cannot be used to bulk-download the whole table anyway. CMS publishes the
authoritative full list (FY2026, 74,719 codes) as a single ~2 MB zip containing
`icd10cm_codes_2026.txt`.

## Decision

Bundle the data. `scripts/fetch-icd10.mjs` downloads the CMS zip, parses the flat
`<code> <description>` file, reinserts the decimal point (`C187` → `C18.7`), and
writes `data/icd10cm.json` (74,719 records). The result is committed and shipped
inside the extension.

Online access is retained only as an **opt-in enhancement** (see the toggle in
the options page and `src/background/nlm.ts`), defaulting to off and requesting
the host permission only when enabled.

## Consequences

- **+** Lookups are fully offline by default; nothing leaves the machine.
- **+** Works in any environment, no network dependency, no rate limits.
- **+** One pinned dataset → reproducible, testable results.
- **−** Data is frozen at FY2026; refreshing means re-running the fetch script and
  re-releasing. Annual ICD updates are a manual step.
- **−** Adds ~7.5 MB (JSON) to the repo and extension.
- **−** Lay-term synonyms are not in the official text; bridging them is handled
  by the semantic layer (see ADR 0002), not the data.
