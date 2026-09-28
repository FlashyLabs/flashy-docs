# flashy-docs — Documentation Hub

Comprehensive guides, architecture explanations, API references, troubleshooting, and deployment runbooks for the Flashy ecosystem (Ledger, Rails, Magician, FlashyID).

## Rules

**Documentation is the source of truth.** Every page serves developers who are building with Flashy. Make it clear, complete, and accurate.

**Examples are linked, not embedded.** This repository contains *explanations*. Working code lives in [flashy-examples](https://github.com/flashylabs/flashy-examples). Link generously; readers move between them.

**Code samples must type-check.** If a `.ts` snippet appears, it must pass `tsc --noEmit` in an appropriate environment. If a `.mjs` snippet appears, it must run without error.

**All numbers are measured, not assumed.** If documentation claims a figure ("costs X tokens", "processes Y events"), it must come from a test or observation, not estimation.

**Links stay valid.** A broken internal link is a doc bug. Before closing a PR: verify every link in changed files.

## Layout

```
.
├── README.md                   # Entry point; quick start
├── CLAUDE.md                   # You are here
├── docs/
│   ├── architecture/           # System design
│   │   ├── overview.md         # How all four systems fit together
│   │   ├── ledger-design.md    # Ledger internals
│   │   ├── rails-consent.md    # Rails approval gate
│   │   ├── magician-routing.md # Magician routing and sealing
│   │   ├── flashyid-identity.md # FlashyID OAuth and delegation
│   │   └── integration-patterns.md # How systems interact
│   ├── guides/                 # Tutorials and how-tos
│   │   ├── ledger-101.md       # Ledger basics
│   │   ├── rails-consent.md    # Rails consent pattern
│   │   ├── magician-routing.md # Magician trust graphs
│   │   ├── flashyid-oauth.md   # FlashyID assertions and delegation (the SDK is not an OAuth client)
│   │   ├── combined-workflow.md # End-to-end example
│   │   └── setup-local.md      # Local development setup
│   ├── api/                    # API reference
│   │   ├── ledger-api.md       # Ledger interface and methods
│   │   ├── rails-api.md        # Rails interface and methods
│   │   ├── magician-api.md     # Magician interface and methods
│   │   └── flashyid-api.md     # FlashyID interface and methods
│   ├── troubleshooting/        # FAQs and debugging
│   │   ├── faq.md              # Common questions
│   │   ├── debugging.md        # Debugging techniques
│   │   ├── errors.md           # Error codes and resolution
│   │   └── performance.md      # Optimization tips
│   └── deployment/             # Production setup
│       ├── runbook.md          # Deployment checklist
│       ├── security.md         # Security best practices
│       ├── monitoring.md       # Health checks and observability
│       └── production-patterns.md # Error recovery, rate limiting, audit
```

## Contributing

Before opening a PR:

- [ ] All code samples type-check or run without error
- [ ] Internal links are valid (no `[text](#missing-section)`)
- [ ] Every claim is either obvious or references a test/observation
- [ ] Lint passes: `npm run lint`
- [ ] No TODOs, FIXMEs, or placeholders

## Checking Your Work

```bash
# Every relative link in every .md resolves to a file in this tree.
# External links are skipped, not fetched. Fenced and inline code is ignored.
npm run check:links

# Every ```js / ```mjs / ```javascript fence parses under `node --check`.
# TypeScript fences are counted and skipped: nothing dependency-free checks them.
npm run check:samples

# Both, in that order. This is what .github/workflows/doc-checks.yml runs.
npm test

# Regenerate docs/STATUS.md from the sibling checkouts' manifests.
npm run status
```

All three are `tools/*.mjs`, import only `node:` builtins, and need no
install. `doc-checks.yml` runs the first two on every push and pull request
with no `|| true`; `secret-scan.yml` calls flashy-infra's shared reusable.

`docs/STATUS.md` is generated. It reports each sibling checkout's declared
package name, version, commit and branch, or "sibling checkout absent" — and
carries no uptime, availability or latency figure, because nothing here
measures one.

## House Rules — True in Every Flashy Repository

**`main` is not necessarily the default branch.** Ask, every time:
```bash
git symbolic-ref --short refs/remotes/origin/HEAD
```

**Say which branch you measured.** Reading the working tree tells you about your checkout, not the repository. If a claim is about what ships, read the ref.

**Re-vendor before you trust a vendored change.** Files named `vendor-*.mjs` are byte-identical copies. A stale copy disagrees silently.

**No secret in a file, a repo, or an artifact.** Secret Manager only. A committed credential is burned the moment it lands and stays burned after deletion.

**The licence is declared once**, in `tools/estate-licences.mjs` in flashyos. This repository is registered as Apache-2.0, holder Flashy Labs.

**A generated file is regenerated, never hand-edited.** `shiplog.fragment.json`, `backlog.fragment.json`, and built outputs are regenerated on every push. Editing one is a change the next run discards.

**Report what happened, including when it is worse than expected.** A number somebody assumed is worth less than a number somebody measured, and a measurement nobody checked is an opinion with a progress bar.

## Linking to Other Repositories

**Never link to a branch.** Always link to the default branch or a specific commit hash.

```markdown
✅ [See the example](https://github.com/flashylabs/flashy-examples/blob/main/examples/01-ledger-basics/index.mjs)
❌ [See the example](https://github.com/flashylabs/flashy-examples/blob/claude/feature-branch/examples/01-ledger-basics/index.mjs)
```

**Link to README.md for quick start.** Link to specific files for deep dives.

```markdown
✅ [Quick start](https://github.com/flashylabs/flashy-examples)
✅ [Complete API](https://github.com/flashylabs/flashy-ledger/blob/main/packages/ledger/src/types.ts)
❌ [How to use](https://github.com/flashylabs/flashy-examples/tree/main)
```

## Voice and Tone

- **Clear over clever.** A reader who understands the concept matters more than elegant prose.
- **Specific over general.** "Alice holds 100 USD" beats "a holder holds some money."
- **Code over words.** When you can show the pattern with code, do it.
- **Active over passive.** "Rails requires consent" beats "consent is required by Rails."

## Cross-Linking

Every guide should link to:
- Its architecture counterpart (overview → ledger-design, etc.)
- Its API reference (if one exists)
- Related guides (e.g., ledger-101 → rails-consent)
- Its working example (all guides → flashy-examples)

## Testing Code Samples

Create a `.test.mjs` file in the repository for every major code sample.

```javascript
// docs/guides/ledger-101.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { InMemoryLedgerStore, post, fromDecimal, toDecimal, FLASHY_GOLD, materialize } from '@flashylabs/ledger';

test('Ledger 101: an EARN lands and reads back', async () => {
  const store = new InMemoryLedgerStore();
  const gold = materialize(FLASHY_GOLD, { id: 'flashy-gold', tenantId: 'flashy' });
  const ref = { tenantId: 'flashy', identityId: 'h_2c91', assetId: gold.id };

  await store.append(post(await store.readState(ref), {
    tenantId: 'flashy', identityId: 'h_2c91', asset: gold,
    amount: fromDecimal(100, gold.decimals), kind: 'EARN',
    source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91', occurredAt: new Date(),
  }));

  const { balance } = await store.readState(ref);
  assert.equal(balance, 10000);
  assert.equal(toDecimal(balance, gold.decimals), 100);
});
```

Use the names the API pages measured — there is no `Ledger` class and no
asset registration call — and mark the fence `javascript` so
`check:samples` parses it.

Run tests as part of CI:
```bash
npm test
```

## Next Steps for This Repository

Done, and enforced by `npm test`:

- [x] API references for each subsystem (`docs/api/*.md`), each measured
      against a named commit of its source
- [x] Local setup guide (`docs/guides/setup-local.md`) — the sibling-checkout
      install path, since the packages are not on the public registry
- [x] Link validator (`check:links`) and code sample validator (`check:samples`)
- [x] Wired into CI (`doc-checks.yml`; `npm test` on every push and PR)
- [x] `docs/STATUS.md` generated from the sibling manifests, no invented figures
- [x] The five concept guides (`ledger-101`, `rails-consent`,
      `magician-routing`, `flashyid-oauth`, `combined-workflow`), the
      architecture overview and the deployment patterns rewritten against the
      measured API pages — every sample names an export the package has, every
      JavaScript fence parses under `check:samples`, and each page carries a
      "Measured against" line

Still to write — listed under **Planned pages** in `README.md` and linked from
nowhere until each exists (the Layout above is the promised structure):

- [ ] Architecture pages: `ledger-design.md`, `rails-consent.md`,
      `magician-routing.md`, `flashyid-identity.md`, `integration-patterns.md`
- [ ] Troubleshooting: `faq.md`, `debugging.md`, `errors.md`, `performance.md`
- [ ] Deployment: `runbook.md`, `security.md`, `monitoring.md`, `production-patterns.md`
- [ ] A TypeScript sample checker, once a dependency-free way exists

## License

Apache-2.0. Holder: Flashy Labs.
