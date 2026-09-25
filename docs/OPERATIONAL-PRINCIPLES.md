# Operational Principles

These are the foundational beliefs that guide all Flashy development and operations. They are philosophy, not policy—they explain *why* we do things, not *how* to do them.

## 1. 🔒 Consent is the Foundation

**Principle:** Value and authority never move without explicit approval from the holder.

**Why it matters:**
- Auto-approval paths are invisible risks (the system moves your money without asking)
- Explicit consent is auditable (you approved THIS transfer at THIS time)
- Users control their own risk (they decide what requires approval)

**How it appears:**
- Rails requires a consent token for every transfer (no exceptions)
- Magician collects consent from every hop (no shortcuts)
- FlashyID issues grants with explicit approval chain (no implicit delegation)

**Never compromise on:** Any auto-approval path is a bug.

---

## 2. 📊 Settlement is Immutable

**Principle:** Once a transaction is recorded, it can never be changed, deleted, or reversed.

**Why it matters:**
- Audit trails prove what happened (immutable = provable)
- Reversals are new transactions (not edits of old ones)
- Time travel is impossible (no going back, only forward)

**How it appears:**
- Ledger is append-only (new writes, never edits)
- Every operation has a digest (sha256, portable)
- Replayed digests are refused (no duplicates)

**Never compromise on:** Any system that edits or deletes history is not Flashy.

---

## 3. 🔐 Authority is Attenuated, Not Inherited

**Principle:** Delegation can only narrow authority, never widen it. A child grant carries less power than its parent.

**Why it matters:**
- Hierarchy is clear (you hold power, I hold a limited slice)
- Revocation is simple (revoke the parent, all children become powerless)
- Escalation is impossible (no way to exceed original grant)

**How it appears:**
- FlashyID grants narrow by design (cap can only decrease)
- Rails respects grant bounds (refuses over-cap transfers)
- Magician respects edge constraints (cannot route through unauthorized hops)

**Never compromise on:** Any widening of authority is a breach.

---

## 4. 🧭 Trust is Explicit

**Principle:** Relationships are declared and verified, never assumed. "Alice trusts Bob" is only true if Alice has explicitly said so.

**Why it matters:**
- No implicit trust (trust must be intentional)
- Graph is provable (here are all the edges Alice declared)
- Opacity is preserved (declined introductions leak no information)

**How it appears:**
- Magician requires edges to be registered (no automatic trust)
- Routing checks edge existence (refuses paths through unknown hops)
- Decline is opaque (requester learns nothing from a "no")

**Never compromise on:** Any implicit relationship is a privacy breach.

---

## 5. 🔍 Identity is Opaque

**Principle:** Systems know holders by unforgeable identifiers, not human names. No hardcoded "Alice" in code.

**Why it matters:**
- Holders are cryptographic identities (public keys, not emails)
- Names are application data (stored separately, never in the core)
- Privacy is structural (system cannot leak what it never saw)

**How it appears:**
- Ledger addresses holders by ID, not name (user:abc123, not "alice@example.com")
- Rails grants are bound to opaque identities (unforgeable keys)
- FlashyID issues credentials to cryptographic identities

**Never compromise on:** Any hardcoded name in the core is a leak.

---

## 6. 🚫 Unverified Claims Are Forbidden

**Principle:** Every number, metric, and claim in user-facing systems must be measured or derived from measurements. Assumptions are not acceptable.

**Why it matters:**
- Marketing claims are testable (if you say 1M users, prove it)
- Metrics are honest (no inflated audience counts)
- Users can trust numbers (backed by real data)

**How it appears:**
- Docs never include a hardcoded figure ("1M+ users") unless it's measured
- Examples show real behavior (100% test coverage)
- Status pages report real metrics (not aspirational goals)

**Never compromise on:** Any unverified claim in user-facing systems is dishonest.

---

## 7. 💡 Clarity Over Cleverness

**Principle:** Code teaches patterns. Readable code is more valuable than clever code.

**Why it matters:**
- Developers learn from examples (clear code teaches better than clever code)
- Bugs are easier to find (simple code is easier to reason about)
- Maintenance is cheaper (future developers understand faster)

**How it appears:**
- Examples are ~100 lines, not 1000 (focused, readable)
- Comments explain "why", not "what" (good names handle "what")
- Algorithms are standard, not optimized for cleverness (readable > performance)

**Never compromise on:** Example code that prioritizes performance over clarity.

---

## 8. 🔑 Secrets Are Never in Code

**Principle:** Credentials, keys, and sensitive configuration live only in Secret Manager or secure environment variables. They are never committed to git.

**Why it matters:**
- Git history keeps secrets forever (deletion doesn't remove them)
- Rotation is painful (if a secret is committed, it's burned)
- Access control is clearer (Secret Manager has permission checks)

**How it appears:**
- No `.env` files committed (use .gitignore)
- No hardcoded tokens in code
- No database passwords in configuration
- All secrets fetched from Secret Manager at runtime

**Never compromise on:** Any secret in git is compromised permanently.

---

## 9. 📋 Audit Trail is Sacred

**Principle:** Every operation is logged. Logs are immutable, queryable, and preserved for the lifetime of the data.

**Why it matters:**
- Incidents are investigable (logs show what happened)
- Compliance is demonstrable (audit trail proves operations)
- Abuse is detectable (patterns in logs reveal problems)

**How it appears:**
- Ledger logs every debit/credit (immutable history)
- Rails logs every consent decision (approve/reject/revoke)
- Magician logs every routing decision (path taken, consents collected)
- FlashyID logs every authentication (who, when, how)

**Never compromise on:** An operation with no log entry.

---

## 10. ⚡ Revocation is Immediate

**Principle:** When access is revoked, it takes effect instantly. Not "within 5 minutes" or "on next refresh"—instantly.

**Why it matters:**
- Abuse stops immediately (no grace period for attackers)
- User control is real (revocation actually works)
- Compliance is strong (immediate action on violations)

**How it appears:**
- Rails honors revocation at enforcement boundary (every request checks)
- Magician refuses paths through revoked edges (immediate)
- FlashyID revokes grants instantly (check on every token use)

**Never compromise on:** A revocation that is delayed or eventually-consistent.

---

## Living These Principles

### For Developers
- **When coding:** Ask "does this violate any principle?" before opening a PR
- **When testing:** Write tests for principle violations (e.g., "test that auto-approve is refused")
- **When reviewing:** Call out any code that bends a principle

### For Operators
- **When deploying:** Verify each principle is enforced in production (no shortcuts)
- **When investigating:** Check if principles were honored (incident first question)
- **When on-call:** Escalate any principle violation immediately

### For Product
- **When designing:** Ensure the feature honors all ten principles
- **When communicating:** Never claim something that violates a principle
- **When launching:** Use the checklist below before going live

---

## Pre-Launch Checklist

Before any service or feature goes live, verify:

- [ ] Consent is enforced (no auto-paths, test covers it)
- [ ] Settlement is immutable (no edits, test covers it)
- [ ] Authority is attenuated (no widening, test covers it)
- [ ] Trust is explicit (no assumptions, test covers it)
- [ ] Identity is opaque (no hardcoded names)
- [ ] Claims are verified (no unverified numbers)
- [ ] Code is clear (someone unfamiliar could read it)
- [ ] Secrets are managed (no credentials in git)
- [ ] Audit trail is logged (every operation recorded)
- [ ] Revocation works (test revoke and verify immediate effect)

**All ten checks must pass. No exceptions.**

---

## In Conflict

What if two principles seem to conflict?

**Example:** Clarity (principle 7) vs. Performance (not a principle). Code that's clear but slow wins.

**Example:** Immutability (principle 2) vs. User Experience (not a principle). Immutable histories win even if they make corrections harder.

**Example:** Opacity (principle 5) vs. Transparency (not a principle). Opaque systems win; transparency comes through audit logs.

The ten principles are foundational. Other goals are secondary. Resolve conflicts by choosing the option that honors all ten.

---

## The Why

These principles exist because we've seen what breaks when they're violated:

- **Consent:** Systems that auto-approve create liability (users can sue)
- **Settlement:** Systems that let you edit history become auditing nightmares
- **Attenuation:** Systems that allow grant widening become privilege escalation vectors
- **Explicit trust:** Systems with implicit relationships become surveillance
- **Opacity:** Systems that expose identity become privacy violations
- **Verified claims:** Systems with unverified numbers lose user trust
- **Clarity:** Complex code creates bugs that take weeks to find
- **Secrets:** Credentials in git are exploited within hours of discovery
- **Audit trails:** Systems without logs cannot prove what happened
- **Immediate revocation:** Delayed revocation is a security hole

Each principle is backed by real incidents (ours or others'). Each one is non-negotiable.

---

## Next

- Read [The House Rules](../README.md#-the-house-rules-enforced) for how these principles are enforced
- See [Working Examples](https://github.com/flashylabs/flashy-examples) for code that embodies them
- File issues if you find a place where a principle is violated
