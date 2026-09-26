# The Estate OSS Excellence Standard

What a Fortune-10-quality open-source repository looks like in the Flashy estate,
and the scorecard every property is measured against. This is the definition of a
**pinnable** repo: one worth pinning to the org profile because a stranger who
lands on it understands what it is, trusts it, and can contribute in minutes.

> This is a *standard*, not a rewrite instruction. A generated file is
> regenerated, never hand-edited; the licence is declared once in flashyos
> (`tools/estate-licences.mjs`), never re-decided in a repo. Apply the standard
> within those estate rules.

## Why "pinnable" is the bar

A pinned repository is a public claim: *this is representative of how we build.*
Fortune-10-quality OSS is not about stars — it is about a stranger's first ninety
seconds. Can they tell what the project is, whether it is alive, whether it is
safe to depend on, and how to file a good issue? Every item below serves that
ninety seconds.

## The scorecard

A repo scores one point per row. **Pinnable = 18/20 or better**, with every
row in the "Trust" section mandatory.

### Identity (a stranger knows what this is in 15 seconds)

| # | Item | Test |
| --- | --- | --- |
| 1 | One-line GitHub **description** set | Not blank on the repo page |
| 2 | **Topics** set (3–8, from a controlled vocabulary) | Discoverable by topic |
| 3 | README **first sentence** states what it is and who it is for | No "This repository contains…" |
| 4 | README **quick start** runs in ≤ 3 commands | A newcomer gets output |
| 5 | Status/maturity is honest (LIVE / IN BUILD / IN DESIGN) | Matches what actually ships |

### Trust (mandatory — a stranger can depend on it)

| # | Item | Test |
| --- | --- | --- |
| 6 | `LICENSE` matches the flashyos registry (Apache-2.0, holder as registered) | Byte-consistent with the register |
| 7 | `SECURITY.md` with a real reporting channel | Names where to report, privately |
| 8 | `CODE_OF_CONDUCT.md` | Present, with a contact |
| 9 | CI runs on every push and is **green on the default branch** | The badge is green, and real |
| 10 | Secret scanning enabled (the shared `secret-scan-reusable.yml`) | Calls flashy-infra's reusable |
| 11 | Default branch is the one that deploys, and is enforced | `default-branch.mjs` agrees |

### Contribution (a stranger can help in minutes)

| # | Item | Test |
| --- | --- | --- |
| 12 | `CONTRIBUTING.md` with the exact test/lint commands | Copy-paste runs clean |
| 13 | `.github/ISSUE_TEMPLATE/` (bug + feature/request) + `config.yml` | Filing an issue is guided |
| 14 | `.github/pull_request_template.md` | PRs arrive structured |
| 15 | `CLAUDE.md` documents what makes this repo different | Present and specific, not the sync stub |

### Legibility (the estate's own machine surfaces)

| # | Item | Test |
| --- | --- | --- |
| 16 | Mesh handshake at `/.well-known/flashyos.json`, derived from the charter | Charter and handshake cannot diverge |
| 17 | `shiplog/1` and `backlog/1` fragments emitted, not hand-written | The emitter runs in CI |
| 18 | `delivery/1` for any page/article that must stay reachable | The workflow fetches the real URL |
| 19 | A **project board** (GitHub Project) reflecting the backlog | Open work is visible, not folklore |
| 20 | Pinned to the org profile if it is representative | On the profile's pinned six |

## The README anatomy

A Fortune-10 README, top to bottom:

1. **Name + one line** — what it is, who it is for. A badge row (license, CI,
   version) directly under the title; every badge must resolve.
2. **Quick start** — the ≤ 3 commands that produce visible output.
3. **What makes it different** — the one or two invariants this repo enforces.
4. **Layout** — a short table: path → what lives there.
5. **Links** — spec, guide, live surface; never a link to a branch (link the
   default branch or a commit).
6. **License line** — matching the registry.

## What only a human (or a panel) can do

Five scorecard items live in a settings panel, not a file, and are a person's
call:

- **Repo description and topics** (GitHub settings or API).
- **Pinned repositories** on the org profile (six slots — a curation decision).
- **Project boards** (GitHub Projects — created per repo or one estate board).
- **Default branch** setting and the Vercel Production Branch (two separate
  settings; changing one without the other deploys from a branch nobody commits
  to — a documented estate failure).
- **Branch protection** on the default branch.

`scripts/default-branch.mjs` in flashy-infra enforces the default branch
nightly; the rest are curation and are listed here so a rollout can check them
off deliberately rather than discover them missing.

## Rolling it out

One repo at a time, highest-traffic first. For each: run the scorecard, fix the
file-level rows in a PR, and hand the panel-level rows to whoever holds the
settings. A shared reusable workflow (flashy-infra's `secret-scan-reusable.yml`,
and `estate-ci-reusable.yml` as it rolls out) does in one change what "each repo
should add one" never did.

The estate already measures much of this: `estate-hygiene`, `estate-standards`,
`estate-findable`, and `estate-activation` in flashyos. This standard is the
human-readable companion to those surveys — the same bar, stated for a person.
