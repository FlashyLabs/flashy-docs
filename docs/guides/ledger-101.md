# Ledger 101: Append-Only Settlement

Learn the Ledger, Flashy's append-only settlement engine. Everything is immutable, idempotent, and multi-asset.

## What Problem Does It Solve?

You need a system where:
- Money balances **never go negative** (invariant enforced)
- Every transaction is **immutable** (audit trail)
- Transactions are **idempotent** (replay-safe: same input = same result, no double-spend)
- Support **multiple assets** (USD, EUR, Flashy Gold, etc.)
- Identity is **opaque** (no exposed PII; accounts are unforgeable IDs)

The Ledger is that system.

## Key Concepts

### Holder
An unforgeable account identifier. Holders are opaque—no names, emails, or PII exposed in the Ledger itself.

```
holder = "user:alice"      # unforgeable ID
holder = "account:gold-123" # service assigns
holder = "dao:treasury"     # any scheme works
```

Ledger never knows who a holder really is. That's the calling system's responsibility.

### Asset
A registered token type. Each asset has:
- Name (e.g., "USD", "Flashy Gold")
- Decimals (e.g., 2 for USD, 8 for some crypto)

Assets must be registered before use. Once registered, they can be issued and transferred.

```typescript
await ledger.registerAsset({
  symbol: 'USD',
  decimals: 2,
  name: 'US Dollars'
});
```

### Minor
The smallest indivisible unit of an asset. **All amounts in the Ledger are `Minor` (branded integer), never floats.**

For USD with 2 decimals:
- $50.00 = 5000 Minor
- $0.01 = 1 Minor
- $100.25 = 10025 Minor

Convert with utilities:
```typescript
import { toMinor, toGold } from '@flashylabs/ledger';

const major = toMinor("50.00");  // 5000 (number)
const readable = toGold(5000);   // "50.00" (string)

// NEVER do this:
const balance = 5000;
const newBalance = balance + 1; // Don't add Minor to numbers!
```

### Transaction
An immutable record of value movement. Every transaction has:
- **ID**: Unique identifier (unforgeable)
- **Kind**: "issuance", "transfer", or custom
- **From**: Holder (for transfers) or null (for issuance)
- **To**: Holder (always required)
- **Amount**: Minor (always positive)
- **Timestamp**: When settled (immutable)
- **Idempotency Key**: Prevents replays (same key = same result)

## Basic Operations

### Register an Asset

```typescript
await ledger.registerAsset({
  symbol: 'USD',
  decimals: 2
});
```

### Issue Units (Create Money)

Only trusted issuers can issue. Issue creates money from nothing (the "credit" side of the ledger).

```typescript
// Give Alice $100 USD
await ledger.issue(
  holder: "user:alice",
  asset: "USD",
  amount: toMinor("100.00"),
  // Ledger generates idempotency key from holder/asset/amount
);

// Alice's balance is now $100
const balance = await ledger.getBalance("user:alice", "USD");
// balance === 10000 (Minor)
```

### Transfer Between Holders

```typescript
// Alice sends Dave $50 USD
const settlement = await ledger.transfer(
  from: "user:alice",
  to: "user:dave",
  asset: "USD",
  amount: toMinor("50.00")
);

// Alice now has $50, Dave now has $50
const alice = await ledger.getBalance("user:alice", "USD");
// alice === 5000 (Minor) — $50.00

const dave = await ledger.getBalance("user:dave", "USD");
// dave === 5000 (Minor) — $50.00
```

### Query Balance

```typescript
const balance = await ledger.getBalance("user:alice", "USD");
// balance === 5000 (Minor, not a string)
```

### View History

```typescript
const history = await ledger.getHistory("user:alice");
// [{id, asset, kind, from, to, amount, timestamp}, ...]
```

## Invariants (What Must Always Be True)

### 1. No Negative Balances

A holder cannot transfer out more than they hold.

```typescript
// Alice holds $50, tries to send $100
try {
  await ledger.transfer("user:alice", "user:bob", "USD", toMinor("100.00"));
} catch (e) {
  // Error: insufficient balance
}
```

### 2. Immutability

Transactions never change. The ledger is append-only.

```typescript
const history1 = await ledger.getHistory("user:alice");
// [{id: 1, kind: 'issuance', amount: 10000}, ...]

// Later:
const history2 = await ledger.getHistory("user:alice");
// Same as history1. Entry 1 is still immutable.
```

### 3. Idempotent Replay

Same input → same result, no double-spend.

```typescript
// First call
const result1 = await ledger.transfer(
  "user:alice",
  "user:bob",
  "USD",
  toMinor("50.00"),
  idempotencyKey: "tx:uuid-1234"
);
// result1.id === "settlement:5678"
// Alice: $50, Bob: $50

// Replay (network timeout, client retries)
const result2 = await ledger.transfer(
  "user:alice",
  "user:bob",
  "USD",
  toMinor("50.00"),
  idempotencyKey: "tx:uuid-1234"
);
// result2.id === "settlement:5678" (same!)
// Alice: $50, Bob: $50 (unchanged!)
// No double-spend.
```

## Multi-Asset Example

The Ledger handles multiple assets independently.

```typescript
// Register two assets
await ledger.registerAsset({ symbol: 'USD', decimals: 2 });
await ledger.registerAsset({ symbol: 'EUR', decimals: 2 });

// Issue both to Alice
await ledger.issue("user:alice", "USD", toMinor("100.00"));
await ledger.issue("user:alice", "EUR", toMinor("50.00"));

// Alice holds both
const usd = await ledger.getBalance("user:alice", "USD");
// usd === 10000 (Major: $100.00)

const eur = await ledger.getBalance("user:alice", "EUR");
// eur === 5000 (Major: €50.00)

// Transfer USD to Bob (EUR unchanged)
await ledger.transfer("user:alice", "user:bob", "USD", toMinor("30.00"));

// Alice: USD $70, EUR €50
// Bob: USD $30, EUR $0
```

## Error Handling

Ledger errors are keyed for programmatic handling:

```typescript
try {
  await ledger.transfer("user:alice", "user:bob", "USD", toMinor("999999.00"));
} catch (e) {
  if (e.code === 'INSUFFICIENT_BALANCE') {
    console.error("Not enough funds");
  } else if (e.code === 'UNKNOWN_HOLDER') {
    console.error("Holder not found");
  } else if (e.code === 'DUPLICATE_IDEMPOTENCY_KEY') {
    console.error("This transaction was already processed");
  }
}
```

## Testing Invariants

The test suite verifies:
- ✅ Balances never go negative
- ✅ Issuance creates money
- ✅ Transfers move money
- ✅ Idempotent replay
- ✅ Multi-asset isolation

Run examples:
```bash
npm run examples:ledger
npm test examples/01-ledger-basics
```

## House Rules

- **Minor only.** Never use raw numbers for amounts. Always convert with `toMinor()` / `toGold()`
- **Opaque identity.** Holders are IDs, not names
- **Immutable audit trail.** History never changes
- **Idempotency keys.** Always include them; handle replays gracefully

## Next Steps

- Try the [Ledger Example](../../examples/01-ledger-basics) and run its tests
- Learn [Rails Consent](rails-consent.md) to add an approval gate on top
- Read [Ledger Design](../architecture/ledger-design.md) for internals
