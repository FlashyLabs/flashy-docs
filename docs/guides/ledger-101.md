# Ledger 101: Append-Only Settlement

Learn `@flashylabs/ledger`, Flashy's append-only, multi-asset settlement
engine. Every sample on this page names an export the package actually has;
the names and signatures are the [Ledger API](../api/ledger-api.md) page's,
read from `src/index.ts`.

Measured against flashy-ledger at `7b254be` (branch `claude/dreamy-bell-2e5nq3`;
`src/` is byte-identical to the `eac50d8` the API page measured — the one
commit between them changes publishing, schemas and repository docs).

## What Problem Does It Solve?

You need a record of value where:

- A balance **never goes negative** unless a flow explicitly allows debt
- Every entry is **immutable** — the store has no update and no delete
- A retried write is **idempotent** — the same key settles once, never twice
- Several **assets** live side by side and never mix
- Identity is **opaque** — no email, phone or wallet address ever enters the chain

The Ledger is that record.

## The Shape of the API

There is no `Ledger` class, no `registerAsset`, no `issue`, no `getBalance`.
The package is a pure decision function, `post`, that turns *current state +
a command* into the entry that should exist (or throws), and a storage port,
`LedgerStore`, that appends what `post` returns. You read state from the
store, call `post`, and append.

```javascript
import { InMemoryLedgerStore, post, fromDecimal, FLASHY_GOLD, materialize } from '@flashylabs/ledger'

const store = new InMemoryLedgerStore()
const gold = materialize(FLASHY_GOLD, { id: 'flashy-gold', tenantId: 'flashy' })

// An opaque, tenant-scoped surrogate. Never an email, a phone number or a wallet.
const alice = 'h_2c91'
const ref = { tenantId: 'flashy', identityId: alice, assetId: gold.id }

const state = await store.readState(ref)          // { balance: 0, headHash: null }
const entry = post(state, {
  tenantId: 'flashy',
  identityId: alice,
  asset: gold,
  amount: fromDecimal(100, gold.decimals),        // 10000 minor units = 100.00 FG
  kind: 'EARN',
  source: { type: 'quest', id: 'q_1' },
  idempotencyKey: 'quest:q_1:h_2c91',
  occurredAt: new Date(),
})
const { deduplicated } = await store.append(entry) // false the first time
```

`post` reads no database, writes nothing and calls no clock — `occurredAt` is
always an argument. That purity is why the same rules run unchanged against
`InMemoryLedgerStore` (the reference and conformance target) and
`MongoLedgerStore`.

## Key Concepts

### Identity

Entries key on an opaque, tenant-scoped `identityId`. The rule is enforced
inside `post()`, not written down and hoped for: `assertOpaqueIdentity` throws
`NaturalKeyError` (code `NATURAL_KEY_IDENTITY`) when the id looks like an
email, an E.164 phone number, an EVM address or a TON address. UUIDs,
ObjectIds, bare integers and base58 tokens pass — the guard is deliberately
narrow so nobody switches it off.

```javascript
import { surrogateIdentity, looksLikeNaturalKey } from '@flashylabs/ledger'

looksLikeNaturalKey('alice@example.com')   // 'an email address'
looksLikeNaturalKey('h_2c91')              // null

// Derive a stable, per-tenant surrogate from whatever you hold. The salt is a
// secret: at least 16 characters, from Secret Manager, never in a file.
const identityId = surrogateIdentity('customer-7f3a', process.env.TENANT_SALT)
```

The Ledger never learns who a holder is. That is the calling system's job,
and a link recorded inside an immutable entry could never be revoked.

### Asset

An `Asset` is a definition materialized for a tenant. The package ships
definitions — `FLASHY_GOLD` (symbol `FG`, **2 decimals**, `REWARD_CURRENCY`),
`FLASHY_WORK_UNIT`, and the commodities `WHEAT`, `WOOD`, `STONE`, `IRON` —
and `defineAsset` validates a new one at module load (lower-case kebab slug,
2–8 upper-case symbol, `decimals` in `0..8`, one of four classes).

```javascript
import { defineAsset, materialize, FLASHY_GOLD, WHEAT } from '@flashylabs/ledger'

const PARTNER_POINTS = defineAsset({
  slug: 'partner-points',
  symbol: 'PP',
  name: 'Partner Points',
  decimals: 0,
  class: 'PARTNER_CREDIT',        // REWARD_CURRENCY | COMMODITY_UNIT | PARTNER_CREDIT | SKILL_XP
  description: 'Credit a partner property issues and redeems.',
})

// Entries are keyed on the id you supply here; materialize throws on an empty one.
const gold = materialize(FLASHY_GOLD, { id: 'flashy-gold', tenantId: 'flashy' })
const wheat = materialize(WHEAT, { id: 'wheat', tenantId: 'flashy' })
const points = materialize(PARTNER_POINTS, { id: 'partner-points', tenantId: 'partner-1' })
```

There is no registration call. `SKILL_XP` assets are not transferable by
class; `postTransfer` refuses them.

### Minor

Every amount is a `Minor`: a whole number of the asset's smallest unit,
branded so a raw `number` does not type-check as one. For Flashy Gold (2
decimals): 50.00 FG is `5000`, 0.01 FG is `1`.

```javascript
import { fromDecimal, toDecimal, minor, add, negate, PrecisionError } from '@flashylabs/ledger'

const fifty = fromDecimal(50, 2)      // 5000
toDecimal(5000, 2)                    // 50 — a number, for display only

// fromDecimal refuses over-precision rather than rounding
try { fromDecimal(0.5, 0) } catch (e) { e instanceof PrecisionError } // true

// Arithmetic goes through the money module, never raw operators
const total = add(fifty, minor(25))   // 5025
const debit = negate(fifty)           // -5000
```

`toMinor` / `toGold` are **not** in this package. They are Flashy Rails
helpers over `fromDecimal` / `toDecimal` with Gold's two decimals — see
[Rails Consent](rails-consent.md).

### Entry

What `post` returns and the store keeps. Every entry carries:

- `tenantId`, `identityId`, `assetId`
- `amount` (signed: positive credits, negative debits), `balanceBefore`, `balanceAfter`
- `kind`: `EARN | SPEND | TRANSFER_IN | TRANSFER_OUT | ADJUSTMENT | REVERSAL | EXPIRY | MIGRATION | DECAY`
- `source`: `{ type, id?, description? }` — what produced the movement
- `idempotencyKey`, `occurredAt`
- `previousHash` and `hash` — sha256 over a fixed field order, chained onto the identity's previous entry

The store assigns `id`. `metadata` is carried but not hashed.

## Basic Operations

Every sample below continues from the `store`, `gold`, `alice` and `ref`
declared in *The Shape of the API*.

### Credit a Holder

Only a flow the calling system trusts should post an `EARN`; the ledger
itself checks the command, not the caller.

```javascript
const state = await store.readState(ref)
await store.append(post(state, {
  tenantId: 'flashy', identityId: alice, asset: gold,
  amount: fromDecimal(100, gold.decimals),
  kind: 'EARN', source: { type: 'quest', id: 'q_1' },
  idempotencyKey: 'quest:q_1:h_2c91', occurredAt: new Date(),
}))

const { balance } = await store.readState(ref)   // 10000
```

### Transfer Between Holders

A transfer is two entries — the sender's `TRANSFER_OUT` and the recipient's
`TRANSFER_IN` — appended together so the books can never hold one half.

```javascript
import { postTransfer } from '@flashylabs/ledger'

const dave = 'h_7e40'
const [fromState, toState] = await Promise.all([
  store.readState({ tenantId: 'flashy', identityId: alice, assetId: gold.id }),
  store.readState({ tenantId: 'flashy', identityId: dave, assetId: gold.id }),
])

const [debit, credit] = postTransfer(
  { state: fromState, identityId: alice },
  { state: toState, identityId: dave },
  {
    tenantId: 'flashy', asset: gold,
    amount: fromDecimal(50, gold.decimals),           // positive; direction is which party is which
    source: { type: 'payment', id: 'p_1' },
    idempotencyKey: 'payment:p_1',                    // becomes payment:p_1:out and payment:p_1:in
    occurredAt: new Date(),
  },
)

await store.appendAll([debit, credit])               // all or nothing; needs a TransactionalLedgerStore
// Alice: 5000 minor (50.00 FG)   Dave: 5000 minor (50.00 FG)
```

### Read a Balance

```javascript
const { balance, headHash } = await store.readState(ref)
// balance is a Minor (number); headHash is the hash of the latest entry, or null
```

### Read History and Verify the Chain

```javascript
import { verifyChain, balanceOf } from '@flashylabs/ledger'

const entries = await store.readEntries({ tenantId: 'flashy', identityId: alice, assetId: gold.id }) // oldest first
const { valid, problems } = verifyChain(entries)   // every hash intact, every link and running balance consistent
balanceOf(entries)                                  // the fold a stored balance is a cache of
```

## Invariants (What Must Always Be True)

### 1. No Negative Balances

`post` throws `LedgerError` with code `INSUFFICIENT_BALANCE` when
`state.balance + amount < 0`, unless the command sets `allowNegative: true`.

```javascript
import { LedgerError } from '@flashylabs/ledger'

try {
  post(await store.readState(ref), {
    tenantId: 'flashy', identityId: alice, asset: gold,
    amount: fromDecimal(-999, gold.decimals),
    kind: 'SPEND', source: { type: 'redemption', id: 'r_1' },
    idempotencyKey: 'redemption:r_1', occurredAt: new Date(),
  })
} catch (e) {
  if (e instanceof LedgerError && e.code === 'INSUFFICIENT_BALANCE') { /* refused before anything is written */ }
}
```

### 2. Immutability

The store port has `append`, `readState`, `readEntries` and
`findByIdempotencyKey`. There is no update and no delete. The only way to
undo an entry is to post its mirror image:

```javascript
import { reverse } from '@flashylabs/ledger'

const [original] = await store.readEntries({ tenantId: 'flashy', identityId: alice })
const mirror = reverse(await store.readState(ref), original, 'duplicate award', new Date())
await store.append(mirror)   // kind REVERSAL, amount negated, key reversal:<original key>
```

History now shows both the mistake and the correction.

### 3. Idempotent Replay

A replayed key is **not an error**. The store returns the original entry with
`deduplicated: true` and writes nothing.

```javascript
const command = {
  tenantId: 'flashy', identityId: alice, asset: gold,
  amount: fromDecimal(25, gold.decimals),
  kind: 'EARN', source: { type: 'quest', id: 'q_2' },
  idempotencyKey: 'quest:q_2:h_2c91', occurredAt: new Date(),
}

const first = await store.append(post(await store.readState(ref), command))
// first.deduplicated === false

// A retry after a timeout, same key:
const second = await store.append(post(await store.readState(ref), command))
// second.deduplicated === true; second.entry.id === first.entry.id; balance unchanged
```

Keys are unique per tenant. Choose them from the business event
(`quest:q_2:h_2c91`), never from a random value the retry cannot reproduce.

## Multi-Asset Example

Assets are isolated by `assetId`; a transfer of one never touches another.

```javascript
import { balancesByAsset } from '@flashylabs/ledger'

const wheatRef = { tenantId: 'flashy', identityId: alice, assetId: wheat.id }
await store.append(post(await store.readState(wheatRef), {
  tenantId: 'flashy', identityId: alice, asset: wheat,
  amount: fromDecimal(40, wheat.decimals),          // wheat has 0 decimals: 40 units
  kind: 'EARN', source: { type: 'harvest', id: 'f_3' },
  idempotencyKey: 'harvest:f_3:h_2c91', occurredAt: new Date(),
}))

const all = await store.readEntries({ tenantId: 'flashy', identityId: alice }) // every asset, oldest first
balancesByAsset(all)   // Map { 'flashy-gold' => 5000, 'wheat' => 40 }
```

A bill across several assets goes through `postConsume`, which posts one
`SPEND` per cost or none at all (`InsufficientForConsumptionError` lists
every shortfall).

## Error Handling

Every refusal is a `LedgerError` with a stable `code`:

| Code | Thrown by |
|---|---|
| `MISSING_IDEMPOTENCY_KEY` | `post` — checked first |
| `NATURAL_KEY_IDENTITY` | `post`, as `NaturalKeyError` (`kind`, `hint`) |
| `ZERO_AMOUNT` | `post` on zero; `postTransfer` on zero or negative |
| `INSUFFICIENT_BALANCE` | `post` without `allowNegative` |
| `ASSET_NOT_TRANSFERABLE` | `postTransfer` on a `SKILL_XP` asset |
| `INSUFFICIENT_FOR_CONSUMPTION`, `DUPLICATE_ASSET_IN_COMMAND` | `postConsume` |

There is no `UNKNOWN_HOLDER` (an unknown identity simply has balance `0`) and
no `DUPLICATE_IDEMPOTENCY_KEY` (a replay is an `AppendResult` with
`deduplicated: true`).

```javascript
try {
  await store.append(post(await store.readState(ref), command))
} catch (e) {
  if (e instanceof LedgerError) {
    switch (e.code) {
      case 'INSUFFICIENT_BALANCE': /* not enough funds */ break
      case 'NATURAL_KEY_IDENTITY': /* use surrogateIdentity */ break
      default: /* e.code is one of the seven above */
    }
  } else throw e
}
```

## House Rules

- **Minor only.** Convert at the edge with `fromDecimal` / `toDecimal`; add with `add`, never `+`
- **Opaque identity.** Surrogates, never natural keys — `post` refuses the obvious ones
- **Immutable audit trail.** Correct with `reverse`; never edit
- **Idempotency keys from the business event.** Handle `deduplicated: true` as success

## Next Steps

- Learn [Rails Consent](rails-consent.md) — the layer that calls `post` on your behalf and gates every debit on the holder's consent
- Read the [Ledger API](../api/ledger-api.md) for every export, measured against source
- [Local setup](setup-local.md) — installing the package from a sibling checkout; note its §4 on which examples in [flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/01-ledger-basics) run at these commits
