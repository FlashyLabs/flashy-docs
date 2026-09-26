# Contributing to flashy-docs

flashy-docs is the documentation hub for the Flashy ecosystem. This repository
holds *explanations*; working code lives in
[flashy-examples](https://github.com/flashylabs/flashy-examples). Link
generously between them.

## Before you open a PR

- [ ] Every `.mjs` code sample runs without error; every `.ts` snippet passes `tsc --noEmit`.
- [ ] Internal links are valid — no `[text](#missing-section)`, no links to a branch (link the default branch or a commit).
- [ ] Every number is measured or cited, never assumed.
- [ ] No TODOs, FIXMEs, or placeholders.
- [ ] `npm run lint` passes.

## Commands

```bash
npm run lint          # house-rule + link lint
npm test              # runs the doc checks
```

## Voice

- **Clear over clever**, **specific over general**, **code over words**, **active over passive**.
- The first sentence of a page (and of each section) is its point — never "This document outlines…".
- A guide links to its architecture counterpart, its API reference, related guides, and its working example.

## House rules (estate-wide)

- **`main` is not necessarily the default branch.** Check with
  `git symbolic-ref --short refs/remotes/origin/HEAD`, and say which branch you measured.
- **A generated file is regenerated, never hand-edited** (`shiplog.fragment.json`,
  `backlog.fragment.json`, built outputs).
- **The licence is declared once**, in `tools/estate-licences.mjs` in flashyos —
  this repository is Apache-2.0, holder Flashy Labs. Do not re-decide it here.
- **No secret in a file, a repo, or an artifact.** Secret Manager only.
- **Report what happened, including when it is worse than expected.**

See [CLAUDE.md](CLAUDE.md) for the full repository guide and
[the OSS Excellence Standard](docs/guides/oss-excellence-standard.md) for the bar
every estate repo is measured against.
