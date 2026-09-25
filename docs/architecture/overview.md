# System Architecture Overview

The Flashy ecosystem is built from four integrated systems that work together to enable decentralized finance, consent-gated transfers, trust-based routing, and delegated identity. This document explains how they fit together.

## The Four Systems

```
┌─────────────────────────────────────────────────────────────┐
│                      Flashy Ecosystem                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Ledger    │  │    Rails     │  │   Magician      │   │
│  ├─────────────┤  ├──────────────┤  ├─────────────────┤   │
│  │ Settlement  │  │ Consent Gate │  │ Trust Routing   │   │
│  │ Multi-asset │  │ Attenuation  │  │ Graph Sealing   │   │
│  │ Idempotent  │  │ Revocation   │  │ Introductions   │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│         ▲                  ▲                  ▲             │
│         │                  │                  │             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         FlashyID (OAuth 2.1, Delegation)            │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Authentication, Authorization, Credential Issuance   │  │
│  │ Attenuation-only Delegation, Grant Verification      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## System Responsibilities

### Ledger (@flashylabs/ledger)
**Core responsibility:** Append-only settlement with money invariants.

- Registers assets (e.g., USD, Flashy Gold)
- Issues units to holders (opaque, unforgeable identities)
- Records transfers between holders with immutable history
- Enforces invariant: balance never goes negative
- Guarantees idempotent replay (same transaction ID → same result, no double-spend)

**Example:** Alice holds 100 USD. Rails asks Ledger to record a 50 USD debit to Alice (via transfer). Ledger refuses if Alice only holds 40 USD. If the same transfer is replayed, Ledger returns the original settlement unchanged.

### Rails (@flashylabs/rails)
**Core responsibility:** Consent-gated value transfer with constrained delegation.

- Enforces consent gate: value moves only with holder's explicit approval
- Implements draft → approve → execute pattern (Rails drafts, user approves, Rails executes)
- Supports grants: "Alice delegates spending authority to Bob, up to $50, for purchases only"
- Enforces attenuation: grants can only narrow (Bob's grant can't let Carol spend more than Bob can)
- Tracks revocation: revoked grants refuse immediately

**Example:** Alice drafts a transfer to Dave: "Send $50 of my USD to Dave." Rails creates a draft (no ledger update yet). Alice approves with a consent token. Rails executes the approved draft, asking Ledger to settle it. If Alice's grant to Bob is revoked, Bob cannot execute any pending transfers.

### Magician (@magician-network/core)
**Core responsibility:** Trust-based routing and sealed introduction outcomes.

- Builds directed graphs of trust edges (Alice→Bob, Bob→Carol, Carol→Dave)
- Routes introduction requests through trust paths (who trusts whom enough to introduce?)
- Collects explicit consent from every hop (each intermediate party must approve the introduction)
- Seals outcomes: hashes the introduction cryptographically (sha256, portable across platforms)
- Verifies seals: proves an introduction was genuinely consented to

**Example:** Alice wants to be introduced to Dave through Bob and Carol. Magician finds the path Alice→Bob→Carol→Dave. Alice consents to routing through Bob; Bob consents to routing through Carol; Carol consents to routing to Dave. Magician seals the outcome (hash proof). Dave can verify the seal independently.

### FlashyID (@flashyid/sdk)
**Core responsibility:** OAuth 2.1, delegated authority, and credential verification.

- Issues OAuth credentials (Bearer tokens) after authentication
- Mints delegation grants (e.g., "Alice grants Bob authority to issue transfers on her behalf")
- Enforces attenuation: delegation can only narrow authority (Bob's grant ⊂ Alice's authority)
- Verifies credential chains: proves who authorized what, in what order
- Revokes credentials: immediate effect, no replays honored

**Example:** Alice authenticates to FlashyID. Bob requests a delegation grant from Alice for "issue transfers up to $50 per day." FlashyID issues a grant token. Bob uses the grant to call Rails, which verifies the grant. Rails enforces Bob's constraint (Bob can only execute transfers up to the grant's limit).

## Data Flow: A Complete Settlement

Here's how all four systems work together when Alice sends $50 to Dave via Bob and Carol (assuming they already have trust edges):

```
1. Authentication (FlashyID)
   Alice → FlashyID: "Verify my identity"
   FlashyID → Alice: OAuth token
   
2. Trust Routing (Magician)
   Alice + Token → Magician: "Route introduction to Dave"
   Magician → Alice: "Path exists: Alice → Bob → Carol → Dave"
   
3. Consent Collection (Magician)
   Magician → Bob: "Alice requests intro to Dave. Approve?"
   Bob → Magician: "Yes, sealed consent"
   Magician → Carol: "Bob approved intro. Carol approves?"
   Carol → Magician: "Yes, sealed consent"
   
4. Settlement Draft (Rails)
   Alice + Token → Rails: "Draft transfer: Alice → Dave, $50 USD"
   Rails → Alice: Draft ID #123 (Ledger not updated yet)
   
5. Approval (Alice)
   Alice → Rails: "Approve draft #123 with my token"
   Rails → Alice: Consent token (proof of approval)
   
6. Settlement Execute (Rails → Ledger)
   Alice + Consent → Rails: "Execute draft #123"
   Rails → Ledger: "Transfer $50 USD from Alice to Dave"
   Ledger → Rails: "Settlement recorded, ID #456, Alice now has $50, Dave now has $100"
   
7. Audit Trail
   Magician records: Sealed introduction (hash proof)
   Rails records: Consent-gated transfer ($50 Alice → Dave)
   Ledger records: Immutable transaction (append-only log)
```

## Invariants (What Must Always Be True)

1. **Ledger Invariant:** No holder's balance goes negative. Every transaction is immutable and idempotent.
2. **Rails Invariant:** Value never leaves a holder without their explicit consent token. Grants can only narrow, never widen.
3. **Magician Invariant:** An introduction is opaque to the requester if declined. A sealed outcome's hash is tamper-proof.
4. **FlashyID Invariant:** Delegation is attenuation. A delegated authority can never exceed the delegator's authority.

## Identity Model

**Holders are opaque identities.** No names, no emails, no identifying information.

- Ledger calls them "holders" (account identifiers)
- Rails calls them "account owners" 
- Magician calls them "parties" in trust edges
- FlashyID calls them "subjects" in credentials

A holder's real-world identity is known only to the service that manages them—the service never publishes it, and Flashy systems never need it.

## Consent Model

**Every value movement requires explicit, specific consent.**

- Rails: "Alice consents to this exact draft (ID #123)"
- Magician: "Bob consents to route Alice's introduction through Carol"
- FlashyID: "Alice consents to delegate $50-per-day authority to Bob"

Consent is never blanket ("trust Bob forever") and never inferred ("Alice didn't decline, so yes"). Revocation is immediate.

## Amount Semantics

**All amounts are `Minor`: a branded integer type (not a float).**

- Ledger: All amounts are Minor (whole units of the asset's smallest denomination)
- Rails: All amounts are Minor
- Magician: Not money-aware (trust graph only)
- FlashyID: Not money-aware (credentials only)

To convert: `toMinor("50.00")` = 5000 (50 dollars in cents-equivalent). `toGold(5000)` = "50.00". Never mix Minor with JavaScript arithmetic; use Ledger's `add()` and `negate()`.

## Error Model

Each system has its own error types:

- **Ledger:** `LedgerError` (insufficient balance, identity mismatch, duplicate replay)
- **Rails:** `RailsError` (invalid draft, missing consent, revoked grant)
- **Magician:** `MagicianError` (no path found, consent refused, seal verification failed)
- **FlashyID:** `CredentialError` (invalid grant, expired credential, attenuation violated)

A calling system catches errors from subsystems and may translate them to its own error type. Errors propagate upward with original codes intact for auditing.

## Time Model

- **Ledger:** Every transaction has an immutable timestamp (at settlement time)
- **Rails:** Drafts are timebound; approval tokens expire after a short window (default 5 minutes)
- **Magician:** Trust edges can be stale (>365 days unrenewed); stale edges contribute at reduced tier
- **FlashyID:** Credentials have expiry; revocation takes effect immediately

## Next Steps

- [Ledger Design](ledger-design.md) — Dig into append-only settlement
- [Rails Consent](rails-consent.md) — Understand the approval gate in detail
- [Magician Routing](magician-routing.md) — Learn trust graphs and sealing
- [FlashyID Identity](flashyid-identity.md) — Explore OAuth 2.1 and delegation
- [Integration Patterns](integration-patterns.md) — See how systems integrate in practice
