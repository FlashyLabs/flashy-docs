# System Architecture Overview

The Flashy ecosystem is four packages that compose into consent-gated
settlement, trust-routed introductions and delegated identity. This page
explains how they fit together; every claim about a package is what its
source does, not what a diagram would like it to do.

Measured against flashy-ledger `7b254be`, flashy-rails `d4c012a`, magician
`78166e4` and flashyid `a2706c0` (all on branch `claude/dreamy-bell-2e5nq3`).
The per-package detail is on the [API pages](../api/ledger-api.md), each of
which names the commit it read; the package source those pages describe is
unchanged at these commits apart from a JSDoc fix in rails' `gold.mjs`.

## The Four Systems

```
┌─────────────────────────────────────────────────────────────┐
│                      Flashy Ecosystem                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Ledger    │  │    Rails     │  │   Magician      │   │
│  ├─────────────┤  ├──────────────┤  ├─────────────────┤   │
│  │ post/append │  │ draft→execute│  │ trust/1 edges   │   │
│  │ Multi-asset │  │ Grants       │  │ Router + veil   │   │
│  │ Hash chain  │  │ Attenuation  │  │ introduction/1  │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│                          ▲                                  │
│                          │ signed consent / grant tokens    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   FlashyID (OIDC provider + @flashyid/sdk)           │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ EdDSA assertions, delegation chains that only narrow │  │
│  │ verify · authorize · enforcement gate · rail tokens  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Who depends on whom.** Rails imports the Ledger. Nothing else imports
anything else: Magician has zero runtime dependencies, the SDK depends only
on `jose`, and the Ledger's domain imports no driver. FlashyID reaches the
rail as **signed tokens** the rail verifies, not as a package the rail calls.
Everything past that is composition in the caller's code — see the
[Combined Workflow](../guides/combined-workflow.md).

## System Responsibilities

### Ledger (`@flashylabs/ledger`)

**Core responsibility:** append-only settlement with the money invariants.

- A pure decision function, `post(state, command)`, and a storage port,
  `LedgerStore`, with `append`, `readState`, `readEntries` and
  `findByIdempotencyKey` — no update, no delete. There is no `Ledger` class.
- Assets are definitions (`FLASHY_GOLD`, the commodities, or your own via
  `defineAsset`) materialized per tenant; there is no registration call.
- Identities are opaque and tenant-scoped; `post` refuses an email, phone,
  EVM or TON address before anything is hashed.
- Every entry hashes onto the identity's previous entry; `verifyChain`
  detects any edit or removal.
- `INSUFFICIENT_BALANCE` unless a flow sets `allowNegative`; a replayed
  `idempotencyKey` returns the original with `deduplicated: true`.

**Example:** Alice holds 100.00 FG. Rails asks the Ledger to post a 50.00 FG
`TRANSFER_OUT` from Alice and a `TRANSFER_IN` to Dave in one atomic
`appendAll`. The Ledger refuses if Alice holds 40.00. Replayed with the same
key, it returns the original entries and writes nothing.

### Rails (`@flashylabs/rails`)

**Core responsibility:** consent-gated movement of Flashy Gold, and
constrained delegation.

- `RailsService` over any `LedgerStore`; decimals at the edge (`amount: 50`),
  minor units inside, via `toMinor` / `toGold`.
- `earn` credits without consent — receiving is not consented to, but a
  `source` is required so no Gold is minted without a reason on the record.
- `draftRedeem` / `draftTransfer` are pure; `execute(draft, consent)` is the
  one place value leaves a holder, and the consent must name that exact draft,
  holder and action.
- `issueGrant` → `attenuate` (refuses `GRANT_WIDENED`) → `spendUnderGrant`,
  which runs `assertSpendable` before any write; `revoke` returns a revoked
  copy.

**Example:** Alice drafts "50.00 FG to Dave". Nothing is written. She
approves *that* draft — `approve(draft, holderId, approvedAt)` in-process, a
flashyID-signed consent token in production. Rails executes it against the
Ledger. Rails never issues the consent; it checks one.

### Magician (`@magician-network/core`)

**Core responsibility:** trust routing and sealed introduction outcomes.

- `parseGraph` reads one owner's `magician-graph/1` document of trust/1 edges
  and refuses anything malformed, including any spelling of expiry.
- `findPaths(graph, intent)` routes from the owner, at most three hops; the
  veil hides nodes past the consent frontier.
- Every request opens `proposed`; `consentHop` accepts only the owner of the
  edge being crossed; `markIntroduced` requires every hop; a decline renders
  `unavailable`, indistinguishable from a path that never existed.
- `sealOutcome` produces an introduction/1 record whose `digest` is sha256
  over canonical JSON, implemented without `node:` so it verifies in a
  browser; `appendOutcome` refuses replays.

**Example:** Alice's intent wants `cap/gold-custody`. The router finds
Alice → Bob → Carol → Dave. Alice consents to crossing her edge, Bob his,
Carol hers. The outcome is sealed; anyone holding the record runs
`verifyIntroduction` on it.

### FlashyID (provider + `@flashyid/sdk`)

**Core responsibility:** authenticated assertions and delegated authority
that only narrows.

- The **provider** (`oidc-provider` on Express, issuer `id.flashyid.com`) is
  where a person signs in; it publishes OIDC discovery and a JWKS.
- The **SDK** is not an OAuth client. `verifyAssertion` and `authorize` check
  what the provider signs; `issueRoot` / `attenuate` / `verifyChain` /
  `permits` are the grant kernel; `evaluateGrant` maps a decision to
  `ALLOW | ESCALATE | DENY`.
- `mintIssuerToken`, `mintConsentToken`, `mintGrantToken` and
  `railGrantFromChain` mint the three token shapes the rail verifies.
- Revocation is a `revokedJtis` set the relying party supplies at check time.

**Example:** Alice issues a root grant to herself with `spend_max: 10000` and
attenuates it to her agent at `5000`. The agent presents an assertion
carrying the chain; the rail's relying-party check verifies it, and
`railGrantFromChain` folds the chain onto a rail grant with `holderId = root`,
`spenderId = leaf`, `capMinor = 5000`.

## Data Flow: A Complete Settlement

Alice pays Dave 50.00 FG through Bob and Carol.

```
1. Route (Magician)
   Alice's graph + intent → findPaths → Alice → Bob → Carol → Dave
   Alice sees hop 1 (Bob) and domain hints for the rest: the veil

2. Consent (Magician)
   Alice consents to her edge; Bob to his; Carol to hers   (consentHop, owner only)
   Any decline → requester reads `unavailable`, nothing more
   All three → markIntroduced

3. Seal (Magician)
   sealOutcome(request, intent, { kind: 'deal', note }) → introduction/1 record with digest

4. Draft (Rails)
   rails.draftTransfer({ fromId, toId, amount: 50, source, idempotencyKey })
   Pure — the Ledger is unchanged

5. Consent (holder, signed by FlashyID in production)
   approve(draft, holderId, approvedAt)  |  mintConsentToken(signer, { draftId, holderId, action })
   Rails does not issue this; the holder gives it

6. Execute (Rails → Ledger)
   rails.execute(draft, consent) → postTransfer → appendAll([debit, credit])
   Alice 50.00 FG, Dave 60.00 FG; consentedAt in each entry's metadata

7. Records
   Magician: the sealed record, appended to an outcome log
   Ledger:   two chained entries, verifyChain valid, replay dedups
```

## Invariants (What Must Always Be True)

1. **Ledger:** no balance below zero without `allowNegative`; entries are never updated or deleted; a replayed key settles once.
2. **Rails:** value leaves a holder only through `execute` with a consent bound to that draft, or `spendUnderGrant` within a grant checked before the write; grants attenuate, never widen.
3. **Magician:** every request lands proposed; only an edge's owner consents; a decline is opaque to the requester; a sealed digest verifies or the record is refused.
4. **FlashyID:** a chain only narrows, checked both when built and when verified; the leaf holder must be the assertion's subject; an untrusted root refuses before the mandate is read.

## Identity Model

Identity is opaque everywhere, and each system names it in its own terms:

- **Ledger:** `identityId` — an opaque surrogate; `surrogateIdentity(value, salt)` derives one. Natural keys are refused.
- **Rails:** `identityId` on commands, `holderId` / `spenderId` on consents and grants — the same ledger surrogate.
- **Magician:** `person/<slug>` ids in one owner's graph; relationship data never leaves without a consent event.
- **FlashyID:** `sub` on an assertion — a human, an org id, or an `agent:<org>/<name>` surrogate; `del[0].iss` is the accountable human.

Which ledger surrogate belongs to which `person/` slug is known only to the
system that maps them, and the mapping never enters a record.

## Consent Model

**Every value movement, and every crossing of a relationship, requires
explicit, specific consent.**

- Rails: a `Consent` names one `draftId`, one `holderId`, one `action`.
- Magician: a `HopConsent` is given by the owner of the edge being crossed, for one request.
- FlashyID: a chain link is one holder handing a narrowed authority to one other holder, with `spend_max` and an approval bar.

Consent is never blanket and never inferred. A grant is the one standing
authorisation, and it is capped, scoped, expiring and revocable.

## Amount Semantics

- **Ledger:** every amount is a `Minor` — a whole number of the asset's smallest unit. `fromDecimal(50, 2)` is `5000`; `toDecimal(5000, 2)` is `50`, a number for display. Arithmetic goes through `add` / `negate`.
- **Rails:** commands take decimals (`amount: 50`); `toMinor(50)` is `5000` and `toGold(5000)` is `50` — presentation only, never fed back in. Grant caps are minor units.
- **FlashyID:** `lim.spend_max` and `demand.amount` are minor units; the SDK moves no money.
- **Magician:** not money-aware. Its numbers are trust strengths in `[0, 1]`, each carrying a register.

There is no `toMinor("50.00")` string form anywhere; every conversion takes
and returns numbers.

## Error Model

- **Ledger:** `LedgerError` with codes `INSUFFICIENT_BALANCE`, `ZERO_AMOUNT`, `MISSING_IDEMPOTENCY_KEY`, `NATURAL_KEY_IDENTITY`, `ASSET_NOT_TRANSFERABLE`, `INSUFFICIENT_FOR_CONSUMPTION`, `DUPLICATE_ASSET_IN_COMMAND`. A replay is not an error.
- **Rails:** `RailsError(code, httpStatus, message)` — `CONSENT_REQUIRED`, `CONSENT_MISMATCH`, `GRANT_*`, `INVALID_AMOUNT`, `MISSING_SOURCE`, `MISSING_IDEMPOTENCY_KEY`, `STORE_NOT_TRANSACTIONAL`. Ledger errors pass through unwrapped.
- **Magician:** no error class. Parsers and the consent machine throw a plain `Error` whose message starts with the refusing format (`trust/1:`, `graph:`, `intent:`, `consent:`, `introduction/1:`); `findPaths` returns `[]` rather than throwing.
- **FlashyID:** refusals are **values** — `null` from `verifyAssertion` / `authorize` for an inauthentic token, and `Refusal { ok: false, code }` from the kernel (`chain_widened`, `broken_chain`, `expired`, `revoked`, `out_of_mandate`, `approval_required`, `untrusted_root`, `empty_chain`, `scope_unmapped`).

## Time Model

- **Ledger:** `occurredAt` is always an argument; the domain reads no clock.
- **Rails:** `RailsService` takes an injectable `clock`; an in-process consent has no expiry; a grant expires at its `expiresAt`; a flashyID-minted consent token expires in 120 s by default, issuer and grant tokens in 300 s.
- **Magician:** `renewed` is the decay clock; fresh ≤ 180 days, stale > 365, and a stale edge contributes at no better than `estimated`. Sealed records never decay.
- **FlashyID:** `nowSec` is an argument to every check; a chain's effective expiry is the minimum across its links; a child's expiry is capped at its parent's.

## Next Steps

- [Ledger API](../api/ledger-api.md) · [Rails API](../api/rails-api.md) · [Magician API](../api/magician-api.md) · [FlashyID API](../api/flashyid-api.md) — every export, measured against source
- [Combined Workflow](../guides/combined-workflow.md) — the flow above as running code
- [Deployment Patterns](../deployment/patterns.md) — how the systems are deployed together

The per-system architecture pages (`ledger-design.md`, `rails-consent.md`,
`magician-routing.md`, `flashyid-identity.md`, `integration-patterns.md`) are
planned and not yet written; the README lists them under *Planned pages*.
