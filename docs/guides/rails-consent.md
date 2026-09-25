# Rails Consent: Approval-Gated Transfers

Learn Rails, the consent layer on top of Ledger. Every transfer requires explicit approval.

## What Problem Does It Solve?

Ledger settles transactions, but it doesn't enforce who can move whose money. Rails adds:
- **Consent gate:** Value moves only with holder's explicit approval
- **Draft → Approve → Execute:** Separate creation, approval, and settlement steps
- **Grants:** Delegated authority ("Bob can spend up to $50 of my money")
- **Attenuation:** Delegation can only narrow authority, never widen it
- **Revocation:** Granted authority can be revoked immediately

## Key Concepts

### Draft
A proposed transfer, not yet settled. Drafts are pure functions—no ledger update.

```typescript
const draft = rails.draftTransfer({
  from: "user:alice",
  to: "user:dave",
  asset: "USD",
  amount: toMinor("50.00")
});
// draft.id === "draft:uuid-1234"
// Alice's balance unchanged (still $100)
```

Drafts can be examined, rejected, or approved. They're temporal—expire after a time window.

### Consent Token
Proof that a holder approved a specific draft.

```typescript
const approval = await Rails.createConsentToken(draft);
// approval === "token:abc123..."
// This token proves: "I, the holder of draft.from, approve draft.id"
```

Tokens are:
- **Specific:** Bound to one draft ID and one holder
- **Temporal:** Expire after a short window (default 5 minutes)
- **Non-transferable:** Can't be delegated

### Execution
Settling an approved draft on the Ledger.

```typescript
const settlement = await rails.execute(draft, approval);
// Ledger now shows:
// Alice: $50 (was $100)
// Dave: $50 (was $0)
```

Without a valid consent token, execution fails.

### Grant
Delegated authority to spend on another's behalf.

```typescript
const grant = rails.attenuate(parentGrant, {
  capAmount: toMinor("50.00"),    // Can spend at most $50
  purpose: "purchases",           // Only for this purpose
  expiry: Date.now() + 86400000   // Expires in 24 hours
});
// grant.id === "grant:uuid-5678"
// Bob can now execute transfers up to $50
```

Grants constrain:
- **Spending cap:** How much can be transferred
- **Purpose:** What the grant is for (informational)
- **Expiry:** When the grant expires (immutable)

### Attenuation
The cornerstone of delegation: grants can only narrow authority.

```typescript
// Alice's root grant: spend $1000
const root = rails.mintRootGrant("user:alice", toMinor("1000.00"));

// Alice grants Bob $100 (narrower than $1000)
const grant1 = rails.attenuate(root, { capAmount: toMinor("100.00") });
// grant1.cap === 10000

// Alice tries to give Bob $2000 (wider than $1000)
try {
  const grant2 = rails.attenuate(root, { capAmount: toMinor("2000.00") });
} catch (e) {
  // Error: ATTENUATION_VIOLATES_PARENT
}

// Bob tries to widen his own grant
try {
  const grant3 = rails.attenuate(grant1, { capAmount: toMinor("200.00") });
} catch (e) {
  // Error: ATTENUATION_VIOLATES_PARENT
}
```

## The Draft → Approve → Execute Flow

```
1. Draft (no settlement)
   Alice calls: rails.draftTransfer(...)
   Returns: draft { id, from, to, asset, amount }
   Ledger: Unchanged

2. Approve (Alice consents)
   Alice calls: Rails.createConsentToken(draft)
   Returns: token (time-limited proof)
   Ledger: Unchanged

3. Execute (settle on Ledger)
   Alice calls: rails.execute(draft, token)
   Calls: ledger.transfer(...)
   Returns: settlement { id, from, to, asset, amount, status: "settled" }
   Ledger: Alice -$50, Dave +$50
```

## Example: Simple Consent

```typescript
import { Rails, toMinor } from '@flashylabs/rails';

const rails = new Rails();

// Issue money
await rails.issue('user:alice', 'USD', toMinor('100.00'));

// Alice drafts transfer to Dave
const draft = rails.draftTransfer({
  from: 'user:alice',
  to: 'user:dave',
  asset: 'USD',
  amount: toMinor('50.00')
});

// Alice approves
const approval = await Rails.createConsentToken(draft);

// Execute settlement
const settlement = await rails.execute(draft, approval);
console.log(settlement.status); // 'settled'

// Verify balances
const alice = await rails.getBalance('user:alice', 'USD');
const dave = await rails.getBalance('user:dave', 'USD');
console.log(toGold(alice)); // '50.00'
console.log(toGold(dave));  // '50.00'
```

## Example: Delegated Spending

```typescript
const rails = new Rails();

// Alice holds $100
await rails.issue('user:alice', 'USD', toMinor('100.00'));

// Alice grants Bob $50 spending authority
const bobGrant = rails.attenuate(
  rails.createRootGrant('user:alice'),
  { capAmount: toMinor('50.00') }
);

// Bob drafts transfer to Carol (spending his grant)
const draft = rails.draftTransfer({
  from: 'user:alice',    // but Bob's grant authorizes it
  to: 'user:carol',
  asset: 'USD',
  amount: toMinor('30.00'),
  underGrant: bobGrant    // Bob's grant
});

// Bob approves (his own approval)
const approval = await Rails.createConsentToken(draft, bobGrant);

// Execute
const settlement = await rails.execute(draft, approval);

// Verify
const alice = await rails.getBalance('user:alice', 'USD');
console.log(toGold(alice)); // '70.00' (spent $30)

// Bob's grant spent down
const remaining = bobGrant.remaining();
console.log(toGold(remaining)); // '20.00' (can still spend $20)
```

## Example: Attenuation Constraints

```typescript
const root = rails.createRootGrant('user:alice');

// Alice allows Bob to spend $100
const bob = rails.attenuate(root, {
  capAmount: toMinor('100.00')
});

// Bob allows Carol to spend from his grant
// Carol can spend at most $50 (narrower than Bob's $100)
const carol = rails.attenuate(bob, {
  capAmount: toMinor('50.00')
});

// Carol allows Dave to spend from hers
// Dave can spend at most $10 (narrower than Carol's $50)
const dave = rails.attenuate(carol, {
  capAmount: toMinor('10.00')
});

// Verify the chain
console.log(root.cap);   // 1000000 (unlimited)
console.log(bob.cap);    // 10000 ($100)
console.log(carol.cap);  // 5000 ($50)
console.log(dave.cap);   // 1000 ($10)
```

## Revocation

Revoking a grant stops all transfers under it immediately.

```typescript
const bob = rails.attenuate(root, {
  capAmount: toMinor('100.00')
});

// Bob drafts a $50 transfer
const draft = rails.draftTransfer({...});
const approval = await Rails.createConsentToken(draft, bob);

// Alice revokes Bob's grant (before execution)
rails.revoke(bob);

// Now execution fails
try {
  await rails.execute(draft, approval);
} catch (e) {
  // Error: GRANT_REVOKED
}
```

## Idempotency

Like Ledger, Rails settlements are idempotent.

```typescript
const settlement1 = await rails.execute(draft, approval);
// settlement1.id === "settlement:5678"

const settlement2 = await rails.execute(draft, approval);
// settlement2.id === "settlement:5678" (same!)
```

## Error Handling

```typescript
try {
  await rails.execute(draft, approval);
} catch (e) {
  if (e.code === 'MISSING_CONSENT_TOKEN') {
    console.error("Cannot execute without approval");
  } else if (e.code === 'GRANT_REVOKED') {
    console.error("Spending authority was revoked");
  } else if (e.code === 'GRANT_EXPIRED') {
    console.error("Grant expired");
  } else if (e.code === 'INSUFFICIENT_GRANT_BALANCE') {
    console.error("Grant doesn't cover this amount");
  }
}
```

## House Rules

- **Explicit consent only.** No auto-approval, no inferred consent
- **Grants narrow, never widen.** Attenuation is the only allowed operation
- **Revocation is immediate.** Revoked grants refuse all pending transfers
- **No hardcoded amounts.** Use `Minor` type; convert with `toMinor()` / `toGold()`

## Testing Invariants

Tests verify:
- ✅ Execution requires consent token
- ✅ Token is specific to draft and holder
- ✅ Token expires after time window
- ✅ Grants narrow but never widen
- ✅ Revoked grants refuse transfers
- ✅ Attenuation constraints enforced

Run examples:
```bash
npm run examples:rails
npm test examples/02-rails-consent
```

## Next Steps

- Try the [Rails Example](../../examples/02-rails-consent) and run its tests
- Learn [Magician Routing](magician-routing.md) to add trust-based introductions
- Read [Rails Design](../architecture/rails-consent.md) for internals
