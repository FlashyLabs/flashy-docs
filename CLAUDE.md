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
│   │   ├── flashyid-oauth.md   # FlashyID authentication
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
# Verify links (coming soon)
npm run check:links

# Verify code samples
npm run check:samples

# Full check
npm test
```

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

```typescript
// docs/guides/ledger-101.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { Ledger, toMinor, toGold } from '@flashylabs/ledger';

test('Ledger 101: basic transfer', async (t) => {
  const ledger = new Ledger();
  
  await ledger.registerAsset({ symbol: 'USD', decimals: 2 });
  await ledger.issue('user:alice', 'USD', toMinor('100.00'));
  
  const balance = await ledger.getBalance('user:alice', 'USD');
  assert.equal(balance, 10000);
  assert.equal(toGold(balance), '100.00');
});
```

Run tests as part of CI:
```bash
npm test
```

## Next Steps for This Repository

- [ ] Write API references for each subsystem (ledger-api.md, rails-api.md, etc.)
- [ ] Write troubleshooting guides (faq.md, debugging.md, errors.md)
- [ ] Write deployment runbook (runbook.md, security.md, monitoring.md)
- [ ] Add local setup guide (setup-local.md)
- [ ] Create link validator (check:links)
- [ ] Create code sample validator (check:samples)
- [ ] Wire into CI (npm test on every push)

## License

Apache-2.0. Holder: Flashy Labs.
