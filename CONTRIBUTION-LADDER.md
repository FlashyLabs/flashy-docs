# Contribution Ladder

A progression path for contributors: from reporting bugs to building features.

---

## Rung 1: Report a Bug 🐛

**Entry point for all contributors.**

### What You Do

Find something that doesn't work. Report it with clear reproduction steps.

### Process

1. Check existing issues (it might already be reported)
2. Reproduce the bug locally
3. File an issue with:
   - Title: Clear description of what's broken
   - Environment: Node version, OS, your code
   - Steps to reproduce: Exact steps to trigger the bug
   - Expected: What should happen
   - Actual: What actually happens
   - Example code: Minimal reproduction

### Example

```
Title: Ledger rejects valid Minor type amount

Environment:
- Node 18.2.0, macOS 13
- @flashylabs/ledger 1.0.5

Steps:
1. Create ledger
2. Register USD asset
3. Issue toMinor('100.00') to a holder

Expected: Balance is 10000

Actual: Throws "Invalid amount type"

Code:
const amount = toMinor('100.00');
await ledger.issue('user:alice', 'USD', amount);  // throws
```

### Skills Gained

- How to write good bug reports
- Understanding the system
- How to isolate problems

### Time Commitment

15 minutes

---

## Rung 2: Verify/Triage Bugs 🔍

**Confirm existing bugs and add context.**

### What You Do

Reproduce reported bugs. Confirm they're real. Add extra details.

### Process

1. Find an open bug with no confirmation
2. Follow the reproduction steps
3. Reproduce (or not) on your machine
4. Comment with:
   - Can you reproduce? (yes/no)
   - What version/environment?
   - Any additional details?

### Example

```
Title: Confirmed on Node 18 + 20

I can reproduce this on:
- Node 18.2.0, Ubuntu 22.04
- Node 20.1.0, macOS 13

It happens with @flashylabs/ledger 1.0.5 but NOT with 1.0.4.

The issue appears when the amount string contains exactly 2 decimals.
Amount '100.00' fails, but '100' and '100.000' work.
```

### Skills Gained

- How to isolate variables
- Effective communication
- Understanding edge cases

### Time Commitment

20 minutes per bug

---

## Rung 3: Fix a Simple Bug 🔧

**Your first code change. Small, contained, well-tested.**

### What You Do

Find a bug with a clear fix. Write code. Submit a PR.

### Process

1. Find a bug labeled **"good first issue"** or **"help wanted"**
2. Comment: "I'd like to work on this"
3. Fork the repo, create a branch
4. Make the fix (< 20 lines ideally)
5. Write a test for it
6. Open a PR with:
   - Title: Fixes #123 (the issue number)
   - Description: What was broken, how you fixed it
   - Test: "Added test case covering scenario"

### Example

```
Title: Fix: Reject amounts with too many decimals

Fixes #456

What was broken:
Ledger accepted toMinor('100.999999'), which is invalid.

How I fixed it:
Added validation in toMinor() to reject > 2 decimals.

Tests:
- toMinor('100.00') → 10000 ✓
- toMinor('100.999') → throws ✓
- toMinor('100') → 10000 ✓
```

### Skills Gained

- How to fork and branch
- How to write tests
- How to write a good PR
- Working with maintainers

### Time Commitment

1-2 hours

---

## Rung 4: Improve Documentation 📖

**Make existing docs clearer, more complete, fix examples.**

### What You Do

Find gaps in docs. Clarify confusing sections. Fix broken examples.

### Process

1. Find a doc that needs work
   - Unclear explanations
   - Missing examples
   - Broken links
   - Outdated info

2. Create a branch

3. Make improvements:
   - Clarify language
   - Add examples
   - Fix links
   - Update version numbers

4. Run `npm run lint:markdown`

5. Open a PR:
   - Title: "Docs: Clarify [topic]" or "Docs: Add [example]"
   - Description: What was confusing, what you added
   - Testing: "Verified links, ran code samples"

### Example

```
Title: Docs: Clarify consent token lifecycle

This PR clarifies:
- How consent tokens expire (5 minutes by default)
- What happens if token expires before execution
- How to request a new token
- Added example showing timeout handling

Updated:
- docs/guides/rails-consent.md
- examples/08-error-recovery/ (retry logic)
```

### Skills Gained

- Documentation best practices
- Technical writing
- Communication

### Time Commitment

30 minutes - 1 hour

---

## Rung 5: Add an Example 📝

**Create a working example teaching a new pattern.**

### What You Do

Build an example showing how to use Flashy for a new use case.

### Process

1. Identify a pattern that's not yet covered
2. Create `examples/NN-your-pattern/` with:
   - `index.mjs` — Working code (~100 lines)
   - `index.test.mjs` — Full test suite
   - `README.md` — Explanation of the pattern

3. Ensure:
   - Tests pass: `npm test`
   - Lint passes: `npm run lint`
   - Code is clear and well-commented
   - README explains the invariants

4. Open a PR:
   - Title: "Example: [Pattern Name]"
   - Description: What does this teach? Why is it valuable?
   - Metrics: "95 lines of code, 120 lines of tests"

### Example

```
Title: Example: Batch Transfers

This adds a new example showing how to:
- Draft multiple transfers
- Collect a single approval from the sender
- Execute all atomically
- Handle failures and retries

Use case: Payroll, bulk refunds, fan-out transfers

Testing:
- npm test examples/06-batch-transfers/
  ✓ All 4 scenarios pass
  ✓ 120 test cases cover edge cases
```

### Skills Gained

- Teaching others
- Building complete features
- Testing discipline
- Communication

### Time Commitment

3-4 hours

---

## Rung 6: Implement a Feature 🚀

**A new feature for one of the systems.**

### What You Do

Build something new that users have requested. Fully tested, fully documented.

### Process

1. Find a feature labeled **"help wanted"** or propose your own
2. Discuss the design (open an issue first)
3. Get buy-in from maintainers
4. Implement:
   - Code in `src/`
   - Tests in `tests/`
   - Docs in `docs/`
   - Example in `examples/` (if applicable)

5. Ensure:
   - All tests pass
   - 90%+ coverage
   - No TODOs
   - Documentation complete

6. Open a PR:
   - Title: "Feature: [Feature Name]"
   - Description: Problem it solves, design approach, testing
   - Checklist: All items complete

### Example

```
Title: Feature: Batch consent validation

Solves #789: Can't efficiently validate multiple consent tokens

Design:
- New method: rails.validateConsents(drafts, tokens)
- Returns: { valid: [...], invalid: [...] }
- Tests: 15 new test cases

Docs:
- Added docs/guides/batch-operations.md
- Updated examples/06-batch-transfers/ to use new API

Tests:
- npm test → all 200+ tests pass
- Coverage: 94%
- No TODOs or FIXMEs
```

### Skills Gained

- Full feature development
- Design thinking
- Maintenance and long-term thinking
- Leadership

### Time Commitment

10-20 hours

---

## The Progression

```
Start → Bug Report (15 min)
        ↓
        Verify/Triage (20 min per bug)
        ↓
        Fix Simple Bug (1-2 hrs)
        ↓
        Improve Docs (30 min - 1 hr)
        ↓
        Add Example (3-4 hrs)
        ↓
        Implement Feature (10-20 hrs)
        ↓
        → Maintainer role
```

---

## Recognition

### In This Repository

- Your name appears in commit history (forever)
- PRs mention you: "Thanks @yourname!"
- Contributors guide lists you

### In the Community

- Flashy newsletter features top contributors
- Monthly "Contributor Spotlight" post
- Speaking opportunities (talks, webinars)
- Potential job/contract opportunities

### Long-term

- Core maintainer role
- Governance decisions
- Strategic input on roadmap

---

## Getting Started

### Find Work to Do

1. **Bugs:** Look for issues labeled `bug` or `help wanted`
2. **Docs:** Search for `TODO` or broken links
3. **Examples:** Check the [ROADMAP.md](ROADMAP.md) for planned examples
4. **Features:** Ask in [GitHub Discussions](https://github.com/flashylabs/flashy-examples/discussions)

### Before You Start

- Read [CONTRIBUTING.md](CONTRIBUTING.md)
- Check [CLAUDE.md](CLAUDE.md) for house rules
- Look at an existing PR to understand our style

### Open Questions?

- Comment on the issue you want to work on
- Ask in [GitHub Discussions](https://github.com/flashylabs/flashy-examples/discussions)
- Join our [Slack community](https://flashygroup.slack.com) (ask for link)

---

## Code of Conduct

We follow the [Contributor Covenant](CODE_OF_CONDUCT.md). All contributors are expected to:

- Be respectful and inclusive
- Assume good intent
- Provide constructive feedback
- Help others learn

---

**You don't need permission to start. Find an issue, claim it, and begin. We're here to help.**

Welcome to Flashy! 💛
