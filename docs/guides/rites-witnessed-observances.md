# Rites: Witnessed Observances and Sealed Standing

Learn Rites, the `ritual/1` format for recording and verifying witnessed observances that affect standing and reputation without revealing personal data.

## What Problem Does It Solve?

You need to:
- Track standing/reputation transparently
- Prove that an observation happened and was witnessed
- Keep the observance immutable forever (content-addressed)
- Never expose the subject's identity in the public record
- Allow different networks to weight the same events differently

Rites solves this with:
- **Ritual records** — what happened (kind, subject, object, value, outcome)
- **Sealing** — a witness cryptographically affirms the observation
- **Non-identifying projection** — public log shows only digest + kind + timestamp
- **Content-addressed proof** — sha256 digest proves the ritual's content forever
- **Portable verification** — verify anywhere; no secrets required; browser-compatible

## Key Concepts

### Ritual (Observance Record)

A structured record of something witnessed. A ritual captures:
- What kind of thing happened (completion, achievement, contribution, etc.)
- Who/what it happened to (subject)
- What/where it happened (object)
- Who witnessed it (witness)
- What was claimed as the value (claimedValue)
- What was the claimed outcome (claimedOutcome)

```javascript
{
  id: "ritual/academy/completion-2026-09-25-a7f2b1c3",
  kind: "completion",        // completion | achievement | contribution | etc.
  subject: "person/alice",    // who the ritual is about
  object: "course/101",       // what/where it happened
  witness: "org/flashy-academy",  // who observed it
  when: "2026-09-25T18:00:00Z",   // when it happened
  claimedValue: "100-gold",   // what value was earned
  claimedOutcome: "completed" // what state was achieved
}
```

### Sealed Ritual

A ritual that a witness has cryptographically affirmed. Sealing creates:
- A **canonical JSON** form (sorted keys, deterministic)
- A **content-addressed digest** (sha256 of canonical form)
- A **signature** (HMAC proving the witness affirmed it)
- A **sealing timestamp** (when the witness affirmed)

```javascript
{
  ritual: { /* the ritual object above */ },
  canonical: "{\"kind\":\"completion\",...}",  // sorted keys, no whitespace
  digest: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",  // sha256(canonical)
  signature: "x1y2z3...",     // HMAC signature
  at: "2026-09-25T18:05:00Z",  // when sealed
  by: "person/verifier-alice"  // who sealed it
}
```

### Non-Identifying Projection

What the public sees. A projection reveals:
- **ref**: An opaque reference (digest prefix, no relationship to ritual id)
- **kind**: The type of observance (completion, achievement, etc.)
- **sealedAt**: When the witness affirmed it

It reveals **nothing about**:
- The subject (person/alice is hidden)
- The object (course/101 is hidden)
- The claimed value (100-gold is hidden)
- The witness identity (org/flashy-academy is hidden)

```javascript
{
  ref: "vrf/a1b2c3d4e5f6",  // 12-char digest prefix, no meaning
  kind: "completion",        // only the type
  sealedAt: "2026-09-25T18:05:00Z"  // only the time
}
```

**Why?** A small-space identifier (person/alice, email, timestamp + org) can be brute-forced. An opaque handle (`vrf/a1b2c3d4e5f6`) with no relationship to any user value cannot be attacked. Different networks read the same digest and independently decide its weight.

### Two Key Invariants

**1. Rituals are immutable once sealed.**

The digest is computed from canonical JSON. If a single byte changes, the digest changes. A sealed ritual that produces a different digest has been tampered with.

```javascript
// Sealed ritual with digest "a1b2c3d4e5f6..."

// Try to tamper: change claimed value
const tampered = { ...sealed.ritual, claimedValue: "1000-gold" };

// Recompute digest
const newDigest = sha256(canonical(tampered));

// Mismatch! Verification fails
verify(tampered) // false
```

**2. The public sees only content-free projections.**

The notary log (public record) holds only `{ref, kind, sealedAt}`. It never holds:
- The sealed ritual (that would leak identifying data)
- The digest pre-image (the canonical JSON)
- Anything that can link back to a person

This is why the `ref` is derived from the digest of the projection itself, never from the ritual id or subject.

## Basic Operations

### Create a Ritual

```javascript
import { createRitual } from '@rites/core';

const ritual = createRitual({
  kind: 'completion',
  subject: 'person/alice',
  object: 'course/flashy-academy/101',
  witness: 'org/flashy-academy',
  claimedValue: '100-gold',
  claimedOutcome: 'completed'
});

console.log(ritual.id);      // ritual/academy/completion-2026-09-25-a7f2b1c3
console.log(ritual.kind);    // completion
console.log(ritual.subject); // person/alice
```

### Seal a Ritual

```javascript
import { seal } from '@rites/core';

const sealed = seal(ritual, {
  by: 'person/verifier-alice',  // Only people seal, never agents
  key: 'verifier-secret-key'
});

console.log(sealed.digest);     // a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
console.log(sealed.signature);  // x1y2z3...
console.log(sealed.at);         // 2026-09-25T18:05:00Z
```

### Verify a Seal

```javascript
import { verify } from '@rites/core';

const isValid = verify(sealed);

if (isValid) {
  console.log('Ritual is genuine and unmodified');
} else {
  console.log('Ritual has been tampered with');
}
```

Verification is **deterministic and portable**:
- Same ritual + key = same result every time
- Works in Node.js and browser (sha256 is portable)
- No secrets required to verify (signature is included)
- Can be verified offline

### Create a Non-Identifying Projection

```javascript
import { nonIdentifyingProjection } from '@rites/core';

const projection = nonIdentifyingProjection(sealed);

console.log(projection.ref);      // vrf/a1b2c3d4e5f6
console.log(projection.kind);     // completion
console.log(projection.sealedAt); // 2026-09-25T18:05:00Z

// Observer's perspective: They know *a* completion happened,
// but not to whom, where, or for what value.
```

### Create Multiple Rituals and Seal

```javascript
const rituals = [
  {
    kind: 'completion',
    subject: 'person/alice',
    object: 'course/101',
    witness: 'org/academy',
    claimedValue: '100-gold',
    claimedOutcome: 'completed'
  },
  {
    kind: 'achievement',
    subject: 'person/alice',
    object: 'hackathon/2026-09',
    witness: 'org/academy',
    claimedValue: '500-gold',
    claimedOutcome: '1st-place'
  },
  {
    kind: 'contribution',
    subject: 'person/bob',
    object: 'repo/magician',
    witness: 'org/magician',
    claimedValue: '250-gold',
    claimedOutcome: 'merged-pr'
  }
];

const sealed_rituals = rituals
  .map(r => createRitual(r))
  .map(r => seal(r, { by: 'person/verifier', key: 'secret-key' }));

console.log(`Sealed ${sealed_rituals.length} rituals`);
```

## Verification in Practice

### Verify All Seals

```javascript
const verifications = sealed_rituals.map((s, i) => ({
  ritual: i,
  valid: verify(s, { key: s.signature })
}));

verifications.forEach(v => {
  console.log(`Ritual ${v.ritual}: ${v.valid ? '✓ valid' : '✗ invalid'}`);
});
```

### Detect Tampering

```javascript
// Original ritual was sealed with value "100-gold"
const original = sealed_rituals[0];

// Someone tries to change it to "1000-gold"
const tampered = {
  ...original,
  ritual: { ...original.ritual, claimedValue: '1000-gold' }
};

// Verification fails because the digest no longer matches
const isValid = verify(tampered, { key: original.signature });
console.log(isValid); // false
```

The tampering is **provably detected** because:
1. The canonical form changed (different claimedValue)
2. The digest is computed from canonical form
3. The new digest doesn't match the sealed digest
4. Verification returns false

## Standing Systems

Different networks weight the same sealed event differently:

**Network A** (strict): Only accepts completions sealed by `org/flashy-academy`
```javascript
const projections = sealed_rituals
  .filter(s => s.by === 'person/verifier-alice')  // Only this verifier
  .filter(s => s.ritual.witness === 'org/flashy-academy')
  .map(s => nonIdentifyingProjection(s));
```

**Network B** (open): Accepts completions from any witness
```javascript
const projections = sealed_rituals
  .filter(s => s.ritual.kind === 'completion')
  .map(s => nonIdentifyingProjection(s));
```

**Network C** (weighted): Applies decay based on seal age
```javascript
const now = Date.now();
const projections = sealed_rituals
  .filter(s => {
    const age = now - new Date(s.at).getTime();
    return age < 365 * 24 * 60 * 60 * 1000;  // Less than a year old
  })
  .map(s => nonIdentifyingProjection(s));
```

All three networks read the same sealed rituals but apply different policies. The seal proves the ritual's content is genuine; the policy decides its weight.

## Real-World Example: Course Completion

### Scenario: ACME Academy Issues and Seals

Alice completes a course. ACME Academy creates and seals a ritual:

```javascript
const completion = createRitual({
  kind: 'completion',
  subject: 'person/alice',
  object: 'course/acme-academy/blockchain-101',
  witness: 'org/acme-academy',
  claimedValue: '50-gold',
  claimedOutcome: 'passed'
});

const sealed = seal(completion, {
  by: 'person/instructor-bob',
  key: 'acme-private-key'
});

// Publish to notary log
const projection = nonIdentifyingProjection(sealed);
// { ref: "vrf/a7f2b1c3d5e6", kind: "completion", sealedAt: "2026-09-25T18:00:00Z" }
```

### Network A: Flashy Academy (Trusts ACME Academy)

Flashy Academy fetches the sealed ritual and verifies it:

```javascript
const isValid = verify(sealed);

if (isValid && sealed.ritual.witness === 'org/acme-academy') {
  // Credit Alice with 50 gold
  await rails.issueReward('person/alice', '50-gold', {
    reason: 'Course completion (verified)',
    sealedAt: sealed.at
  });
}
```

### Network B: Some Other Network (Weights Differently)

Another network reads the same seal but applies its own policy:

```javascript
// Example: requires witness in our pre-approved list
if (isValid && approvedWitnesses.includes(sealed.ritual.witness)) {
  // Different amount, different decay rule
  const weight = computeWeight(sealed.at);  // Decays over time
  const credit = BigInt(sealed.ritual.claimedValue.split('-')[0]) * weight / 100n;
  
  await their_ledger.recordStanding('person/alice', credit);
}
```

**Key insight:** The seal proves the ritual is real. Each network decides:
- Which witnesses to trust
- How much weight to give
- How quickly to decay
- Whether to require re-sealing

One ritual, multiple trusts. No central authority needed.

## Handling Seal Expiry

Sealed rituals never expire on their own. But networks may discount old seals:

```javascript
const SEAL_FRESHNESS_THRESHOLD = 365 * 24 * 60 * 60 * 1000;  // 1 year

function isFresh(sealed) {
  const age = Date.now() - new Date(sealed.at).getTime();
  return age < SEAL_FRESHNESS_THRESHOLD;
}

// Network policy: only accept seals less than a year old
const fresh_projections = sealed_rituals
  .filter(s => isFresh(s))
  .map(s => nonIdentifyingProjection(s));
```

This is a **network choice**, not a format constraint. The seal is permanent; the weight decays.

## Integration with Flashy Estate

### In the Transparency Log (flashy-network)

The Rites notary log is one source of sealed events:

```
/.well-known/notary.fragment.json
[
  { ref: "vrf/a1b2c3d4e5f6", kind: "completion", sealedAt: "2026-09-25T18:00:00Z" },
  { ref: "vrf/x9y8z7w6v5u4", kind: "achievement", sealedAt: "2026-09-25T19:00:00Z" },
  ...
]
```

### With Magician Routing (trust/1)

A Magician router can use Rites events to weight trust edges:

```javascript
// Alice has participated in 3 sealed completions from trusted witnesses
const sealed_events = notaryLog.filter(e => e.kind === 'completion');
const weight = sealed_events.length * 10;  // Base weight on standing

// Adjust trust graph edge
graph.updateEdge('person/alice', 'person/bob', {
  trust: weight,
  decayRate: 'annual'
});
```

### With AAO Governance (aao/1)

A charter can require sealed events for promotion:

```javascript
{
  kind: 'flashyos/1',
  name: 'Academy',
  roles: [
    {
      id: 'role/instructor',
      authority: ['can:issue'],
      requiresSealed: {
        kind: 'achievement',
        minimumCount: 5
      }
    }
  ]
}
```

## Privacy by Design

### What the Public Sees

The notary log (public):
```json
[
  { "ref": "vrf/a1b2c3d4e5f6", "kind": "completion", "sealedAt": "..." }
]
```

A curious observer learns:
- *A* completion happened
- When it was sealed

They learn **nothing about**:
- Who the subject is
- What they completed
- Who witnessed it
- What value it carried

### Why Digest Prefixes Instead of Random IDs?

If we used random IDs (`vrf/random-uuid`), we'd break content-addressability. If we used ritual IDs (`ritual/alice/completion-...`), we'd leak the subject.

Digest prefixes (`vrf/` + 12-char hex) give us:
- **Determinism**: Same ritual always produces same ref
- **Opacity**: The ref has no relationship to personal data
- **Uniqueness**: Different rituals produce different refs
- **Portability**: Any verifier can recompute the ref

## Publishing and Verification

### Witness Publishes Sealed Ritual

A witness (ACME Academy) seals and publishes:

```javascript
// 1. Create ritual
const ritual = createRitual({ /* ... */ });

// 2. Seal it
const sealed = seal(ritual, { by: 'person/instructor', key: 'secret' });

// 3. Publish sealed ritual somewhere safe
await storage.save(sealed);

// 4. Add projection to notary log
const projection = nonIdentifyingProjection(sealed);
await notaryLog.append(projection);
```

### Observer Verifies

An observer fetches the sealed ritual and verifies it:

```javascript
// 1. Fetch sealed ritual
const sealed = await storage.fetch('ritual-id');

// 2. Verify seal (portable, no secrets needed)
const isValid = verify(sealed);

if (isValid) {
  // 3. Read projection and weight it
  const projection = nonIdentifyingProjection(sealed);
  const weight = computeWeight(projection.sealedAt);
  
  // 4. Apply to local standing system
  await standing.record(weight, projection.kind);
}
```

### Verification Works Offline

Because sha256 is portable and the signature is included:

```javascript
// Browser verification (no API call needed)
import { verify } from '@rites/verify';

const isValid = verify(sealedRitual);
console.log(isValid ? 'Genuine ✓' : 'Tampered ✗');
```

## Real-World Challenges and Solutions

### Challenge: Seal Authority Rotation

A witness rotates their signing key. Old seals were signed with the old key.

**Solution**: Include key fingerprint in seal metadata. Observers maintain a timeline:
```javascript
const verification = {
  ritual: sealed.ritual,
  keyId: '2026-01-to-2026-09',
  valid: verify(sealed, { keyId })
};
```

### Challenge: Network Divergence

Network A trusts witness X; Network B does not.

**Solution**: This is intentional. The seal proves the ritual; each network decides the trust. No forced consensus.

### Challenge: Revoking a Ritual

Alice completes a course, then later it's discovered she cheated. Can we revoke the seal?

**Solution**: No. Seals are immutable. The solution is for the network to mark seals as revoked:
```javascript
await revocationLog.mark(sealed.digest, 'cheated');
```

Observers read both the seal and the revocation log and decide what to do.

## Resources

- **Full Spec:** [ritual/1 SPEC.md](https://github.com/FlashyLabs/intentmesh/blob/main/SPEC.md)
- **Adoption Guide:** See Example 12 in flashy-examples
- **Reference Implementation:** [Rites Core](https://github.com/FlashyLabs/rites)
- **Live Examples:** flashy-network's notary log at `/.well-known/notary.fragment.json`

## Next Steps

1. **Understand the invariants**: Immutability (digest-based), opacity (no identifying data in public log)
2. **Read Example 12**: Working code showing ritual creation, sealing, verification, projections
3. **Try verification**: Download a sealed ritual; verify it matches its digest
4. **Integrate with your standing system**: Weight sealed events, apply decay, decide trust

Rites transforms reputation from a private score into a transparent, auditable, verifiable record backed by sealed proof.
