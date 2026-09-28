# Rails Consent: The Draft → Execute Gate

Learn `@flashylabs/rails`, the consent layer over the Ledger. Value leaves a
holder in exactly one place, `execute`, and only with a consent bound to the
exact draft being executed. Every name below is an export of `src/index.mjs`;
the signatures are the [Rails API](../api/rails-api.md) page's.

Measured against flashy-rails at `d4c012a` (branch `claude/dreamy-bell-2e5nq3`;
the one source change since the `e5a90a9` the API page measured is a JSDoc
fix in `src/gold.mjs` — `toMinor` is typed as the ledger's `Minor` number, as
this guide says — plus the vendored ledger moving to `1.0.0`).

## What Problem Does It Solve?

The Ledger settles entries; it does not decide *who may move whose value*.
Rails adds the product rules:

- **Consent gate:** a holder's Gold moves out only with their explicit consent
- **Draft → execute:** drafting is pure and writes nothing; executing is the one write
- **Grants:** delegated authority — "this spender may move up to 50 FG of my Gold, for purchases"
- **Attenuation:** a child grant can never hold authority its parent lacks
- **Revocation:** a revoked grant refuses before anything is written

Rails speaks **Flashy Gold** (`FG`, two decimals). There is no `USD` here:
the rail materializes the ledger's `FLASHY_GOLD` for a tenant and every
command is about that asset.

## The Shape of the API

There is no `Rails` class and no `Rails.createConsentToken`. The service is
`RailsService`, built over any ledger `LedgerStore`. Amounts at its edge are
**person-facing decimals** (`50`, `10.5`); it converts to minor units with
`toMinor` and nothing else does.

```javascript
import { RailsService, approve } from '@flashylabs/rails'
import { InMemoryLedgerStore } from '@flashylabs/ledger'

const rails = new RailsService({ store: new InMemoryLedgerStore() })
const alice = 'h_2c91'   // opaque ids, as the ledger requires
const dave = 'h_7e40'

// Receiving is not consented to; issuance is rule-bound (a source is required)
await rails.earn({
  identityId: alice, amount: 100,
  source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91',
})

await rails.balance(alice)   // { minor: 10000, gold: 100, symbol: 'FG' }
```

## Key Concepts

### Draft

A drafted movement: what *would* happen, computed without writing. Drafts are
pure, frozen values. An agent may hold one; nothing moves until `execute`.

```javascript
const draft = rails.draftTransfer({
  fromId: alice, toId: dave, amount: 50,
  source: { type: 'payment', id: 'p_1' }, idempotencyKey: 'payment:p_1',
})
// draft.id === 'transfer:payment:p_1'   draft.action === 'transfer'
// draft.identityId === 'h_2c91'         draft.amountMinor === 5000
// Alice's balance is unchanged: nothing was written
```

`draftRedeem({ identityId, amount, source, idempotencyKey })` is the other
draft: Gold leaving the holder to a redemption. Its id is `redeem:<key>`.
Drafts carry no expiry of their own; the idempotency key is what makes
executing one twice settle once.

### Consent

A consent authorises exactly **one** draft, for **one** holder, for **one**
action. `consentTo` builds it; `approve(draft, holderId, approvedAt)` is the
convenience that reads the draft's id and action.

```javascript
import { consentTo } from '@flashylabs/rails'

const consent = approve(draft, alice, new Date())
// === consentTo({ draftId: 'transfer:payment:p_1', holderId: 'h_2c91', action: 'transfer', approvedAt })
```

In-process the consent is a frozen value object and carries no expiry. In
production the consent is a token **signed by flashyID** —
`mintConsentToken` in `@flashyid/sdk`, `typ: 'consent'`, default expiry 120
seconds — and the rail's `FlashyIdVerifier` maps its claims onto this same
shape. The structural binding checked here holds whoever signed it. See
[FlashyID: Assertions and Delegated Authority](flashyid-oauth.md), *Rail tokens*.

### Execute

The one place value leaves a holder.

```javascript
const [debit, credit] = await rails.execute(draft, consent)   // a transfer posts two entries atomically
// debit.entry.kind === 'TRANSFER_OUT'   credit.entry.kind === 'TRANSFER_IN'
await rails.balance(alice)   // { minor: 5000, gold: 50, symbol: 'FG' }
await rails.balance(dave)    // { minor: 5000, gold: 50, symbol: 'FG' }
```

Without a consent `execute` throws `CONSENT_REQUIRED`; with a consent for a
different draft, holder or action it throws `CONSENT_MISMATCH`. Both refuse
before any read of the store. A redeem returns one `AppendResult`; a transfer
returns two and needs a `TransactionalLedgerStore` (`STORE_NOT_TRANSACTIONAL`
otherwise). The consent's `approvedAt` is written into the entry's metadata.

### Grant

Delegated, capped, scoped, revocable authority: a holder lets a spender move
up to `capMinor` of one asset, for one purpose. Caps are in **minor units**,
so convert with `toMinor`.

```javascript
import { issueGrant, toMinor, FLASHY_GOLD_ID } from '@flashylabs/rails'

const bobGrant = issueGrant({
  grantId: 'g_bob', holderId: alice, spenderId: 'h_bob',
  assetId: FLASHY_GOLD_ID, capMinor: toMinor(50), purpose: 'purchases',
  expiresAt: new Date('2026-12-31T00:00:00Z'),      // optional; null means no expiry
})
// bobGrant.remainingMinor === 5000, bobGrant.revoked === false, bobGrant.parentGrantId === null
```

A zero or negative cap throws `GRANT_WIDENED` at issue time.

### Attenuation

The cornerstone: a child grant may only narrow. `attenuate(parent, narrow)`
inherits `holderId` and `assetId` and throws `GRANT_WIDENED` on a cap above
the parent's *remaining* amount, a different purpose (exact match — purpose is
not a lattice), or an expiry later than the parent's.

```javascript
import { attenuate, RailsError } from '@flashylabs/rails'

const carolGrant = attenuate(bobGrant, { grantId: 'g_carol', spenderId: 'h_carol', capMinor: toMinor(20) })
// carolGrant.capMinor === 2000, carolGrant.parentGrantId === 'g_bob', same holder, same asset, same purpose

try {
  attenuate(carolGrant, { grantId: 'g_dave', spenderId: 'h_dave', capMinor: toMinor(200) })
} catch (e) {
  e instanceof RailsError && e.code === 'GRANT_WIDENED'   // true: 20000 exceeds the parent's remaining 2000
}

try {
  attenuate(carolGrant, { grantId: 'g_dave', spenderId: 'h_dave', purpose: 'anything' })
} catch (e) {
  e.code   // 'GRANT_WIDENED' — a different purpose is a decision the parent did not encode
}
```

### Spending Under a Grant

`spendUnderGrant` is the delegated path. `assertSpendable` runs **before any
write** and throws `GRANT_REVOKED`, then `GRANT_EXPIRED`, then
`GRANT_EXCEEDED`. The spend lands as one `SPEND` on the holder's Gold with
`grantId` and `spenderId` in metadata, and the call returns a *new* grant with
the amount deducted — grants are immutable values, like entries.

```javascript
const { result, grant: carolAfter } = await rails.spendUnderGrant({
  grant: carolGrant, amount: 15,
  source: { type: 'purchase', id: 'o_1' }, idempotencyKey: 'purchase:o_1',
})
// result.entry.amount === -1500 on Alice's account; carolAfter.remainingMinor === 500

// A replay with the same key settles nothing and draws the grant down nothing
const replay = await rails.spendUnderGrant({
  grant: carolAfter, amount: 15,
  source: { type: 'purchase', id: 'o_1' }, idempotencyKey: 'purchase:o_1',
})
// replay.result.deduplicated === true; replay.grant === carolAfter
```

## The Draft → Consent → Execute Flow

1. **Draft** — `rails.draftTransfer(...)` or `rails.draftRedeem(...)`. Pure. Ledger unchanged.
2. **Consent** — the holder approves *this* draft: `approve(draft, holderId, approvedAt)` in-process, or a flashyID-signed consent token in production. Ledger unchanged.
3. **Execute** — `rails.execute(draft, consent)`. The binding is checked, then the ledger's `post` / `postTransfer` writes the entries. Ledger: Alice −50.00 FG, Dave +50.00 FG.

There is no step where Rails issues the consent. Rails checks a consent; the
holder gives it. Agents suggest; humans consent.

## Example: Simple Consent

```javascript
import { RailsService, approve, toGold } from '@flashylabs/rails'
import { InMemoryLedgerStore } from '@flashylabs/ledger'

const rails = new RailsService({ store: new InMemoryLedgerStore() })

await rails.earn({ identityId: 'h_2c91', amount: 100, source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91' })

const draft = rails.draftTransfer({
  fromId: 'h_2c91', toId: 'h_7e40', amount: 50,
  source: { type: 'payment', id: 'p_1' }, idempotencyKey: 'payment:p_1',
})

const consent = approve(draft, 'h_2c91', new Date())
const results = await rails.execute(draft, consent)
console.log(results.map((r) => r.entry.kind))   // [ 'TRANSFER_OUT', 'TRANSFER_IN' ]

const alice = await rails.balance('h_2c91')
const dave = await rails.balance('h_7e40')
console.log(alice.gold, dave.gold)              // 50 50
console.log(toGold(alice.minor))                // 50 — a number; formatting to "50.00" is the UI's job
```

## Example: Delegated Spending

```javascript
import { RailsService, issueGrant, attenuate, toMinor, FLASHY_GOLD_ID } from '@flashylabs/rails'
import { InMemoryLedgerStore } from '@flashylabs/ledger'

const rails = new RailsService({ store: new InMemoryLedgerStore() })
await rails.earn({ identityId: 'h_2c91', amount: 100, source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91' })

// Alice grants Bob 50 FG of spending authority, for purchases
const bob = issueGrant({
  grantId: 'g_bob', holderId: 'h_2c91', spenderId: 'h_bob',
  assetId: FLASHY_GOLD_ID, capMinor: toMinor(50), purpose: 'purchases',
})

// Bob narrows it for Carol
const carol = attenuate(bob, { grantId: 'g_carol', spenderId: 'h_carol', capMinor: toMinor(30) })

// Carol's property spends 30 FG of Alice's Gold under her grant
const { grant: carolAfter } = await rails.spendUnderGrant({
  grant: carol, amount: 30,
  source: { type: 'purchase', id: 'o_1' }, idempotencyKey: 'purchase:o_1',
})

const alice = await rails.balance('h_2c91')
console.log(alice.gold)                    // 70
console.log(carolAfter.remainingMinor)    // 0 — the cap is spent
```

The grant **is** the consent on this path: capped, scoped, revocable and
checked before the write. It does not replace the draft → execute gate for
the holder's own movements; it is the front door a property uses to spend
under an allowance the holder issued.

## Example: Attenuation Chain

```javascript
import { issueGrant, attenuate, toMinor, FLASHY_GOLD_ID } from '@flashylabs/rails'

const root = issueGrant({
  grantId: 'g_root', holderId: 'h_2c91', spenderId: 'h_bob',
  assetId: FLASHY_GOLD_ID, capMinor: toMinor(100), purpose: 'purchases',
})
const carol = attenuate(root, { grantId: 'g_carol', spenderId: 'h_carol', capMinor: toMinor(50) })
const dave = attenuate(carol, { grantId: 'g_dave', spenderId: 'h_dave', capMinor: toMinor(10) })

console.log(root.capMinor, carol.capMinor, dave.capMinor)          // 10000 5000 1000
console.log(dave.parentGrantId, carol.parentGrantId, root.parentGrantId) // g_carol g_root null
```

There is no unlimited root: `issueGrant` requires a positive cap. Every chain
starts from a number the holder chose.

## Revocation

`revoke(grant)` returns a new grant with `revoked: true`. Any spend presented
with it throws `GRANT_REVOKED` before a write, and `attenuate` refuses to
build a child from it.

```javascript
import { revoke } from '@flashylabs/rails'

const revoked = revoke(bob)
try {
  await rails.spendUnderGrant({
    grant: revoked, amount: 5,
    source: { type: 'purchase', id: 'o_9' }, idempotencyKey: 'purchase:o_9',
  })
} catch (e) {
  e.code   // 'GRANT_REVOKED' — nothing was written
}
```

Because a grant is a value, the rail checks the grant it is **handed**.
Keeping an old, unrevoked copy from being presented is the token layer's job:
in production the grant is a flashyID-signed token carrying `revoked`, and
the SDK's chain verifier takes a `revokedJtis` set. Revocation is immediate
at the point of check; the caller decides where the revocation list lives.

## Idempotency

Rails inherits the ledger's rule: a replayed `idempotencyKey` settles once.
Executing the same draft twice returns the original entries with
`deduplicated: true` and moves nothing.

```javascript
const again = await rails.execute(draft, consent)
// again[0].deduplicated === true; balances unchanged
```

## Error Handling

`RailsError(code, httpStatus, message)`; ledger errors (`INSUFFICIENT_BALANCE`,
`NATURAL_KEY_IDENTITY`, …) pass through **unwrapped** so a caller can tell
which layer refused.

| Code | HTTP | When |
|---|---|---|
| `CONSENT_REQUIRED` | 403 | `execute` with no consent |
| `CONSENT_MISMATCH` | 403 | consent names another draft, holder or action |
| `GRANT_REVOKED` | 403 | `attenuate` or a spend on a revoked grant |
| `GRANT_EXPIRED` | 403 | a spend after `expiresAt` |
| `GRANT_EXCEEDED` | 403 | a spend above `remainingMinor` |
| `GRANT_WIDENED` | 400 | `issueGrant` / `attenuate` asked for more than the parent has |
| `INVALID_AMOUNT` | 400 | an amount that is not a positive finite number |
| `MISSING_SOURCE` | 400 | a command without `source.type` |
| `MISSING_IDEMPOTENCY_KEY` | 400 | a command without a key |
| `STORE_NOT_TRANSACTIONAL` | 500 | a transfer on a store without `appendAll` |

```javascript
import { RailsError } from '@flashylabs/rails'
import { LedgerError } from '@flashylabs/ledger'

try {
  await rails.execute(draft, consent)
} catch (e) {
  if (e instanceof RailsError) {
    // e.code is one of the table above; e.httpStatus maps straight to a response
  } else if (e instanceof LedgerError && e.code === 'INSUFFICIENT_BALANCE') {
    // the ledger refused: the holder does not hold enough
  } else throw e
}
```

## House Rules

- **Explicit consent only.** No auto-approval, no inferred consent, no tier that skips the gate
- **Grants narrow, never widen.** `attenuate` is the only way to derive one, and it refuses
- **Checks before writes.** `execute` and `spendUnderGrant` refuse before touching the store
- **Decimals at the edge, minor units inside.** `toMinor` / `toGold` live here, and `toGold` is presentation only

## Next Steps

- Learn [Magician Routing](magician-routing.md) — consent-gated introductions, the other place "agents suggest; humans consent" is enforced in code
- Read [FlashyID: Assertions and Delegated Authority](flashyid-oauth.md) for who signs the consent and grant tokens
- Read the [Rails API](../api/rails-api.md) for every export, measured against source
- [Local setup](setup-local.md) §4 says which [flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/02-rails-consent) run at these commits
