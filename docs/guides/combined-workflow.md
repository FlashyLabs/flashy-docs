# Combined Workflow: Alice Pays Dave Through Trust Chain

A complete end-to-end example using all four systems together. Alice sends $50 to Dave through a trust chain (Alice → Bob → Carol → Dave).

## The Scenario

**Actors:**
- Alice: Has $100 USD, wants to pay Dave
- Bob: Trusts Alice and Carol
- Carol: Trusts Bob and Dave
- Dave: Wants to receive payment from Alice

**Goal:** Alice sends $50 USD to Dave via trust chain Bob → Carol, with explicit consent at every step and cryptographic proof of agreement.

## Architecture

```
Ledger (Settlement)
  └─ Rails (Consent Gate)
      └─ Magician (Trust Routing)
          └─ FlashyID (Authentication)
```

Data flows upward: FlashyID authenticates Alice, Magician finds the trust path, Rails collects consents, Ledger settles the transfer.

## Step-by-Step

### 1. Setup

```typescript
import {
  TrustGraph, Edge,
  Rails, toMinor, toGold,
  FlashyID
} from '@flashylabs';

// Initialize all systems
const graph = new TrustGraph();
const rails = new Rails();
const flashyid = new FlashyID();

// Issue money
await rails.issue('user:alice', 'USD', toMinor('100.00'));
await rails.issue('user:dave', 'USD', toMinor('10.00'));
```

### 2. Build Trust Graph

```typescript
// Alice trusts Bob
graph.addEdge(new Edge({
  from: 'user:alice',
  to: 'user:bob',
  tier: 'direct'
}));

// Bob trusts Carol
graph.addEdge(new Edge({
  from: 'user:bob',
  to: 'user:carol',
  tier: 'direct'
}));

// Carol trusts Dave
graph.addEdge(new Edge({
  from: 'user:carol',
  to: 'user:dave',
  tier: 'direct'
}));

// Graph now: Alice → Bob → Carol → Dave
```

### 3. Find Route

```typescript
const intro = graph.route({
  requester: 'user:alice',
  target: 'user:dave',
  reason: 'settlement'
});

console.log(intro.route);
// ['user:alice', 'user:bob', 'user:carol', 'user:dave']
```

### 4. Authenticate Alice

```typescript
const alice = await flashyid.authenticate('alice');
// alice.token === verified credential
// alice.sub === 'user:alice'
```

### 5. Collect Consents

```typescript
// Bob consents to introduce Alice to Carol
const bobConsent = graph.collectConsent({
  hop: 'user:bob',
  previous: 'user:alice',
  next: 'user:carol'
});

// Carol consents to introduce Bob to Dave
const carolConsent = graph.collectConsent({
  hop: 'user:carol',
  previous: 'user:bob',
  next: 'user:dave'
});
```

### 6. Seal Introduction

```typescript
const sealed = graph.sealIntroduction({
  requester: 'user:alice',
  target: 'user:dave',
  route: intro.route,
  consents: [bobConsent, carolConsent],
  sealed_at: Date.now()
});

console.log(sealed.digest);
// "sha256:abc123def456..." (portable proof)
```

### 7. Draft Transfer

```typescript
const draft = rails.draftTransfer({
  from: 'user:alice',
  to: 'user:dave',
  asset: 'USD',
  amount: toMinor('50.00')
});

console.log(draft.id);
// "draft:xyz789" (not settled yet)
```

### 8. Get Approval

```typescript
// Alice approves the draft
const approval = await Rails.createConsentToken(draft);

console.log(approval);
// "token:consent..." (time-limited, bound to draft and holder)
```

### 9. Execute Settlement

```typescript
const settlement = await rails.execute(draft, approval);

console.log(settlement);
// {
//   id: 'settlement:abc123',
//   from: 'user:alice',
//   to: 'user:dave',
//   amount: 5000,
//   asset: 'USD',
//   status: 'settled'
// }
```

### 10. Verify Balances

```typescript
const alice_balance = await rails.getBalance('user:alice', 'USD');
const dave_balance = await rails.getBalance('user:dave', 'USD');

console.log(toGold(alice_balance)); // '50.00' (was $100, spent $50)
console.log(toGold(dave_balance));  // '60.00' (was $10, received $50)
```

## Complete Code Example

```typescript
async function main() {
  console.log('=== Alice Pays Dave Through Trust Chain ===\n');

  // Setup
  const graph = new TrustGraph();
  const rails = new Rails();

  // Balances before
  await rails.issue('user:alice', 'USD', toMinor('100.00'));
  await rails.issue('user:dave', 'USD', toMinor('10.00'));

  // Build trust graph: Alice → Bob → Carol → Dave
  graph.addEdge(new Edge({ from: 'alice', to: 'bob', tier: 'direct' }));
  graph.addEdge(new Edge({ from: 'bob', to: 'carol', tier: 'direct' }));
  graph.addEdge(new Edge({ from: 'carol', to: 'dave', tier: 'direct' }));

  // Route introduction
  const intro = graph.route({
    requester: 'user:alice',
    target: 'user:dave',
    reason: 'settlement'
  });

  if (!intro.route) {
    throw new Error('No trust path found');
  }

  console.log(`Route: ${intro.route.join(' → ')}\n`);

  // Collect consents
  const bobConsent = graph.collectConsent({
    hop: 'bob',
    previous: 'alice',
    next: 'carol'
  });

  const carolConsent = graph.collectConsent({
    hop: 'carol',
    previous: 'bob',
    next: 'dave'
  });

  // Seal
  const sealed = graph.sealIntroduction({
    requester: 'alice',
    target: 'dave',
    route: intro.route,
    consents: [bobConsent, carolConsent],
    sealed_at: Date.now()
  });

  console.log(`Sealed: ${sealed.digest}\n`);

  // Draft transfer
  const draft = rails.draftTransfer({
    from: 'user:alice',
    to: 'user:dave',
    asset: 'USD',
    amount: toMinor('50.00')
  });

  // Approve
  const approval = await Rails.createConsentToken(draft);

  // Execute
  const settlement = await rails.execute(draft, approval);

  console.log(`Settlement: ${settlement.id}`);
  console.log(`Status: ${settlement.status}\n`);

  // Verify
  const alice = await rails.getBalance('user:alice', 'USD');
  const dave = await rails.getBalance('user:dave', 'USD');

  console.log(`Alice balance: ${toGold(alice)}`);
  console.log(`Dave balance: ${toGold(dave)}`);
  console.log('\n=== Complete ===\n');
}

main().catch(console.error);
```

## Key Invariants Verified

1. **Trust path exists:** Bob and Carol are connected
2. **Consents collected:** Every hop approved the introduction
3. **Seal is portable:** Same hash on any platform
4. **Transfer requires approval:** Draft can't execute without token
5. **Balances correct:** Alice -$50, Dave +$50
6. **Ledger immutable:** Transaction in append-only log

## Production Patterns

### Error Recovery

```typescript
try {
  const settlement = await rails.execute(draft, approval);
} catch (e) {
  if (e.code === 'INSUFFICIENT_BALANCE') {
    console.error("Alice has insufficient funds");
    // Retry after balance check
  } else if (e.code === 'GRANT_REVOKED') {
    console.error("Approval was revoked");
    // Request new approval
  }
}
```

### Rate Limiting

Track execution rates per holder to prevent abuse.

```typescript
const lastExecution = cache.get(`execution:${draft.from}`);
if (Date.now() - lastExecution < 1000) {
  throw new Error("Rate limited: 1 execution per second");
}
```

### Audit Logging

```typescript
log.info({
  event: 'settlement_executed',
  from: settlement.from,
  to: settlement.to,
  amount: toGold(settlement.amount),
  asset: settlement.asset,
  sealed: sealed.digest,
  timestamp: Date.now()
});
```

## Testing

Tests verify:
- ✅ Happy path (all consents, settlement succeeds)
- ✅ No trust path (route fails)
- ✅ Insufficient balance (execution fails)
- ✅ Missing approval (execution fails)
- ✅ Audit trail complete

## Next Steps

- Run the [Combined Example](../../examples/05-combined-workflow)
- Learn [Production Patterns](../deployment/production-patterns.md)
- Read [Troubleshooting](../troubleshooting/faq.md) for common issues
