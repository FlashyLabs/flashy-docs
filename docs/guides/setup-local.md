# Local Setup: Building From the Sibling Checkouts

How to get the four packages onto a machine so the examples and your own code
can import them. The honest premise first: **none of the four is something
this repository can confirm on the public npm registry**, so the working path
is to check the repositories out side by side and install from disk.

Measured against the checkouts named below on 2026-09-28: flashy-ledger
`7b254be`, flashy-rails `d4c012a`, magician `78166e4`, flashyid `a2706c0`,
flashy-examples `41619ce` (each on branch `claude/dreamy-bell-2e5nq3`).

## What each manifest actually says about publishing

| Package | Checkout | What the manifest declares |
|---|---|---|
| `@flashylabs/ledger` | `flashy-ledger` | `publishConfig.registry` is `https://registry.npmjs.org/`, access `public`, and a tag-triggered publish workflow exists (at `eac50d8` it was GitHub Packages, `restricted`). Whether any version has been published is not visible from a checkout. |
| `@flashylabs/rails` | `flashy-rails` | Depends on the ledger as `file:vendor/ledger` (a vendored `1.0.0` build since `d4c012a`; `0.8.0` before). No `publishConfig`. |
| `@magician-network/core` | `magician/packages/core` | A workspace package, version `0.1.0`, no `publishConfig`. |
| `@flashyid/sdk` | `flashyid/packages/sdk` | `publishConfig.access: public` and a tag-triggered publish workflow exist. Whether any version has been published is not visible from a checkout. |

`flashy-examples/package.json` declares `@flashylabs/ledger` and
`@flashylabs/rails` at `^1.0.0`, `@magician-network/core` at `^0.1.0` and
`@flashyid/sdk` at `^0.1.1` — the versions the sibling manifests declare. Its
README's install section points at sibling checkouts (`npm install
file:../flashy-ledger …`), which is the path below.

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
- At `41619ce`, examples `01`–`04` import only names the packages export
  (`post`, `RailsService`, `parseGraph`, `authorize`, …). Example
  `05-combined-workflow` still imports names the packages do **not** export —
  compare its `import` lines against the [API reference](../api/ledger-api.md)
  pages, which list the exports that exist. Installing the packages does not
  make that example run; it is the examples repository's work to bring into
  line. The [Combined Workflow](combined-workflow.md) guide here is written
  against the real exports and is the sample to start from meanwhile.

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
