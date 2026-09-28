# Local Setup: Building From the Sibling Checkouts

How to get the four packages onto a machine so the examples and your own code
can import them. The honest premise first: **none of the four is something
this repository can confirm on the public npm registry**, so the working path
is to check the repositories out side by side and install from disk.

Measured against the checkouts named below on 2026-09-28: flashy-ledger
`eac50d8`, flashy-rails `e5a90a9`, magician `f5c4fda`, flashyid `536b5c6`,
flashy-examples `4a2ef00` (each on branch `claude/dreamy-bell-2e5nq3`).

## What each manifest actually says about publishing

| Package | Checkout | What the manifest declares |
|---|---|---|
| `@flashylabs/ledger` | `flashy-ledger` | `publishConfig.registry` is GitHub Packages, access `restricted`. Not the public registry. |
| `@flashylabs/rails` | `flashy-rails` | Depends on the ledger as `file:vendor/ledger` (a vendored `0.8.0` build). No `publishConfig`. |
| `@magician-network/core` | `magician/packages/core` | A workspace package, version `0.1.0`, no `publishConfig`. |
| `@flashyid/sdk` | `flashyid/packages/sdk` | `publishConfig.access: public` and a tag-triggered publish workflow exist. Whether any version has been published is not visible from a checkout. |

`flashy-examples/package.json` declares all four at `^1.0.0`. Its README's
install section points at sibling checkouts (`npm install file:../flashy-ledger
…`), which is the path below.

## Prerequisites

- **Node 22.** `flashy-ledger` and `flashy-rails` declare `engines.node >=22`;
  `@flashyid/sdk` declares `>=18`; this repository's own tools need 22.
- **Corepack enabled** if you will regenerate `flashy-ledger`'s lockfile: its
  `packageManager` pins npm `10.9.8`, and the pin is only enforced through
  Corepack (`corepack enable`).
- git.

## 1. Clone side by side

```bash
mkdir flashy && cd flashy
git clone https://github.com/FlashyLabs/flashy-ledger
git clone https://github.com/FlashyLabs/flashy-rails
git clone https://github.com/FlashyLabs/magician
git clone https://github.com/FlashyLabs/flashyid
git clone https://github.com/FlashyLabs/flashy-examples
git clone https://github.com/flashylabs/flashy-docs
```

Before reading anything as "what ships", ask each checkout which branch is its
default — `main` is not necessarily it:

```bash
git -C flashy-ledger symbolic-ref --short refs/remotes/origin/HEAD
```

## 2. Build each package

```bash
# Ledger: TypeScript -> dist/ (ESM) and dist-cjs/
cd flashy-ledger && npm ci && npm run build && npm test && cd ..

# Rails: plain ESM, nothing to compile; npm install pulls the vendored ledger
cd flashy-rails && npm install && npm test && cd ..

# Magician: a workspace; the root build orders core, cli, then the site
cd magician && npm install && npm run build && cd ..

# FlashyID SDK: its own manifest under packages/sdk
cd flashyid/packages/sdk && npm install && npm run build && cd ../../..
```

Each `npm test` above is the repository's own suite; a red one is a fact about
that checkout, not about your setup.

## 3. Point the examples at the builds

```bash
cd flashy-examples
npm install \
  file:../flashy-ledger \
  file:../flashy-rails \
  file:../magician/packages/core \
  file:../flashyid/packages/sdk
```

`file:` installs link the built packages by path, so a rebuild in a sibling is
picked up without reinstalling. Rails resolves its own ledger from
`vendor/ledger`, not from the sibling — two copies of the ledger will be in
play, which is how the rails repository itself runs.

## 4. What runs, and what does not, at these commits

- Examples `11-intentmesh`, `12-rites`, `13-aao-validation` and
  `14-mesh-consumer` are marked `standalone: true` in
  `examples/manifest.json` and run with no package installed at all:
  `npm run test:standalone`.
- Examples `01`–`05` import names the packages at the measured commits do
  **not** export — `registerAsset` and `recordTransaction` on the ledger
  store, a `Rails` class with `Rails.createConsentToken`, `TrustGraph` /
  `Edge` / `sha256` from Magician, `FlashyIDClient` / `mintGrant` from the
  SDK. Installing the packages does not make those examples run. The
  [API reference](../api/ledger-api.md) pages describe the exports that exist;
  the examples are a separate repository's work to bring into line.

## 5. Check this repository

```bash
cd flashy-docs
npm test          # relative links resolve; JavaScript samples parse
npm run status    # regenerates docs/STATUS.md from the sibling manifests
```

`npm test` needs no install: both checkers import only `node:` builtins.

## Related

- [Ledger API](../api/ledger-api.md) · [Rails API](../api/rails-api.md) ·
  [Magician API](../api/magician-api.md) · [FlashyID API](../api/flashyid-api.md)
- [Status](../STATUS.md) — what the sibling checkouts declared when it was last generated
