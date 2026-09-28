# Rails API — `@flashylabs/rails`

The public surface of Flashy Rails, the settlement and authorisation layer
over `@flashylabs/ledger`, as `src/index.mjs` exports it. Every name below is
an export of that file; behaviour and error codes are read from `src/rails.mjs`,
`src/consent.mjs`, `src/errors.mjs` and `src/gold.mjs`. Where a guide in this
repository disagrees with this page, this page was measured and the guide was
not.

Measured against flashy-rails at `e5a90a9` (branch `claude/dreamy-bell-2e5nq3`;
`package.json` declares `@flashylabs/rails` `1.0.0`). Repository:
<https://github.com/FlashyLabs/flashy-rails>.

## Where it comes from

- Node `>=22`, ESM. The implementation is JSDoc-annotated `.mjs`; a
  hand-written `types/index.d.ts` is the TypeScript surface.
- Its one dependency is `@flashylabs/ledger`, resolved as `file:vendor/ledger`
  — a vendored build whose manifest reads `0.8.0`. `mongodb` is optional.
- The package name is `@flashylabs/rails`. The repository's own `README.md`
  and `docs/api.md` still write `import … from 'flashy-rails'`; the manifest
  is the name a resolver sees.
- Amounts a caller passes are **person-facing decimals** (`25`, `10.5`);
  everything the ledger stores is minor units. `toMinor` / `toGold` are the
  only conversion, and they live here, not in the ledger.

```js
import { RailsService, approve, issueGrant } from '@flashylabs/rails'
import { InMemoryLedgerStore } from '@flashylabs/ledger'

const rails = new RailsService({ store: new InMemoryLedgerStore() })

await rails.earn({
  identityId: 'hunter_7f3a', amount: 25,
  source: { type: 'quest', id: 'q_9' },
  idempotencyKey: 'quest:q_9:hunter_7f3a',
})

const draft = rails.draftRedeem({
  identityId: 'hunter_7f3a', amount: 10,
  source: { type: 'redemption', id: 'r_1' }, idempotencyKey: 'r_1',
})
await rails.execute(draft, approve(draft, 'hunter_7f3a', new Date()))

const balance = await rails.balance('hunter_7f3a') // { minor: 1500, gold: 15, symbol: 'FG' }
```

## Flashy Gold — `src/gold.mjs`

| Export | Value / behaviour |
|---|---|
| `FLASHY_TENANT` | `'flashy'` |
| `FLASHY_GOLD_ID` | `'flashy-gold'` — the asset id entries are keyed on |
| `GOLD_DECIMALS` | `FLASHY_GOLD.decimals` from the ledger registry, i.e. `2` |
| `GOLD_SYMBOL` | `FLASHY_GOLD.symbol`, i.e. `'FG'` |
| `flashyGold(tenantId = FLASHY_TENANT, id = FLASHY_GOLD_ID)` | `materialize(FLASHY_GOLD, { id, tenantId })` |
| `toMinor(decimal)` | `fromDecimal(decimal, 2)`: `toMinor(25) === 2500`, `toMinor(0.01) === 1`; over-precision throws the ledger's `PrecisionError` |
| `toGold(minor)` | `toDecimal(minor, 2)` — presentation only |

Amounts are integer **numbers** (the ledger's branded `Minor`). The JSDoc in
`src/consent.mjs` still types `capMinor` as `bigint`; the tests, the `.d.ts`
and the repository's CLAUDE.md say `number`, and a `bigint` literal throws the
moment it meets a ledger amount.

## `RailsService` — `src/rails.mjs`

`new RailsService({ store, tenantId = 'flashy', clock = () => new Date() })`.
`store` is any ledger `LedgerStore`; it throws without one. A transfer needs a
`TransactionalLedgerStore`.

| Method | Returns | Behaviour |
|---|---|---|
| `balance(identityId)` | `{ minor, gold, symbol: 'FG' }` | `readState` on the tenant's Flashy Gold. |
| `history(identityId)` | `readonly Entry[]` | Oldest first. |
| `reconcile(identityId)` | `{ ok, entries, balance, sealHead, problems }` | Reads history and stored balance and runs `reconcileEntries`. |
| `earn({ identityId, amount, source, idempotencyKey, occurredAt?, metadata? })` | `AppendResult` | Kind `EARN`. Refuses `INVALID_AMOUNT`, `MISSING_IDEMPOTENCY_KEY`, `MISSING_SOURCE` (a source with a `type` is required). No consent — receiving is not consented to. |
| `draftRedeem({ identityId, amount, source, idempotencyKey, metadata? })` | `Draft` | **Pure; writes nothing.** `{ id: 'redeem:<key>', action: 'redeem', identityId, amountMinor, source, idempotencyKey, metadata }`, frozen. |
| `draftTransfer({ fromId, toId, amount, source, idempotencyKey, metadata? })` | `Draft` | Pure. `{ id: 'transfer:<key>', action: 'transfer', identityId: fromId, toId, amountMinor, … }`, frozen. |
| `execute(draft, consent)` | `AppendResult` (redeem) or `AppendResult[]` (transfer) | **The one place value leaves a holder.** Throws `CONSENT_REQUIRED` with no consent, `CONSENT_MISMATCH` unless `consent.draftId === draft.id`, `consent.holderId === draft.identityId` and `consent.action === draft.action`. A redeem posts one `SPEND`; a transfer posts the ledger's `postTransfer` pair via `appendAll` and throws `STORE_NOT_TRANSACTIONAL` on a store without it. `consentedAt` is written into the entry's metadata. |
| `spendUnderGrant({ grant, amount, source, idempotencyKey, metadata? })` | `{ result, grant }` | `assertSpendable(grant, amountMinor, now)` runs **before any write**; then one `SPEND` on `grant.holderId` with `grantId` and `spenderId` in metadata. The returned grant is drawn down by `debitGrant` — unless `result.deduplicated`, in which case it is unchanged, so a replay never draws a grant twice. |
| `reverse({ entry, reason, occurredAt? })` | `AppendResult` | The ledger's `reverse`: a mirror `REVERSAL` entry. History is never rewritten. |

`approve(draft, holderId, approvedAt)` is a convenience that returns
`consentTo({ draftId: draft.id, holderId, action: draft.action, approvedAt })`.

## Consent and grants — `src/consent.mjs`

All pure, all frozen value objects. In production the token and the grant are
signed by flashyID ([FlashyID API](flashyid-api.md), *Rail tokens*); the
structural binding checked here holds whoever signed them.

```ts
interface Consent { draftId: string; holderId: string; action: string; approvedAt: Date }
interface Grant {
  grantId: string; holderId: string; spenderId: string; assetId: string
  capMinor: number; remainingMinor: number; purpose: string
  expiresAt: Date | null; revoked: boolean; parentGrantId: string | null
}
```

| Export | Behaviour |
|---|---|
| `consentTo({ draftId, holderId, action, approvedAt })` | A consent bound to exactly one draft. |
| `issueGrant({ grantId, holderId, spenderId, assetId, capMinor, purpose, expiresAt = null })` | `remainingMinor = capMinor`, `revoked: false`, `parentGrantId: null`. A zero or negative cap throws `GRANT_WIDENED`. |
| `attenuate(parent, { grantId, spenderId, capMinor?, purpose?, expiresAt? })` | The child inherits `holderId` and `assetId`. Throws `GRANT_REVOKED` on a revoked parent; `GRANT_WIDENED` when the cap is non-positive, exceeds `parent.remainingMinor`, the purpose differs from the parent's (purpose is exact-match, not a lattice), or the expiry is later than the parent's (or absent when the parent has one). `parentGrantId = parent.grantId`. |
| `revoke(grant)` | A new grant with `revoked: true`. |
| `assertSpendable(grant, amountMinor, now)` | Throws `GRANT_REVOKED`, then `GRANT_EXPIRED`, then `GRANT_EXCEEDED` when `amountMinor > remainingMinor`. |
| `debitGrant(grant, amountMinor)` | A new grant with `remainingMinor` reduced. Never mutates. |

## Errors — `src/errors.mjs`

`RailsError(code, httpStatus, message)` with `name === 'RailsError'`. Ledger
errors (`LedgerError`: insufficient balance, natural-key identity, …) pass
through **unwrapped** so a caller can tell which layer refused.

| Code | HTTP | Thrown by |
|---|---|---|
| `CONSENT_REQUIRED` | 403 | `execute` with no consent |
| `CONSENT_MISMATCH` | 403 | `execute` when draft id, holder or action differ |
| `GRANT_REVOKED` | 403 | `attenuate`, `assertSpendable` |
| `GRANT_EXPIRED` | 403 | `assertSpendable` |
| `GRANT_EXCEEDED` | 403 | `assertSpendable` |
| `GRANT_WIDENED` | 400 | `issueGrant`, `attenuate` |
| `NOT_TRANSFERABLE` | 400 | constructor exported; the transfer path surfaces the ledger's own `ASSET_NOT_TRANSFERABLE` |
| `INVALID_AMOUNT` | 400 | any command whose `amount` is not a positive finite number |
| `MISSING_SOURCE` | 400 | `earn`, both drafts, `spendUnderGrant` |
| `MISSING_IDEMPOTENCY_KEY` | 400 | any command without a key |
| `STORE_NOT_TRANSACTIONAL` | 500 | `execute` on a transfer with a non-transactional store |

## Reconciliation — `src/reconcile.mjs`

`reconcileEntries(entries, expectedBalance)` → `{ ok, entries, balance,
sealHead, problems }`: entry hashes, chain linkage and the running balance,
then the final balance against `expectedBalance`. `snapshotOf(entry)` → the
`{ id, asset, type, source, amountMinor, recordedAt }` row the ledger's Merkle
spec hashes. Both pure, both usable offline on a handed-over statement.

## Talking to a remote rail — `src/client.mjs`, `src/adapter.mjs`

`new RailsClient({ baseUrl?, fetch?, issuerToken? })` exposes one method per
HTTP route: `balance`, `history`, `reconcile`, `migrated`, `earn`,
`draftRedeem`, `redeem(draft, consent)`, `draftTransfer`, `transfer(draft,
consent)`, `spendUnderGrant`, `health`, `openapi`. Failures are
`RailsClientError(status, code, message)`. `routerTransport(handle)` builds a
`fetch` over the in-process router so the client is tested against the real
route table with no socket. `RewardsService({ rails, property })` is the
property-facing adapter (`balance`, `statement`, `reward`, `beginRedemption`,
`completeRedemption`, `spendPreauthorised`).

The HTTP contract itself: `ROUTE_TABLE` (method, path, summary, auth, writes)
and `apiDescriptor({ version?, servers? })`, rendered from it.

## Also exported

- **Coexistence and migration** (`src/coexist.mjs`): `combinedBalance`,
  `combinedHistory`, `migrateHolder`, `isMigrated`, `balanceFor`,
  `historyFor`, `cutOver`, `MIGRATION_KIND` (`'MIGRATION'`).
- **The explorer transparency log** (`src/explorer.mjs`, `src/explorer-log.mjs`,
  `src/explorer-store.mjs`): an RFC 6962 Merkle log over sealed entry hashes —
  `treeHead`, `inclusionProof`, `verifyInclusion`, `consistencyProof`,
  `verifyConsistency`, `explorerRow`, `leafHash`, `nodeHash`, `ExplorerLog`,
  `withExplorerTap`, `InMemoryExplorerStore`, `MongoExplorerStore`,
  `backfillExplorer`, `ledgerLeafSource`. Signatures are in `types/index.d.ts`;
  the design is `docs/explorer.md` in flashy-rails.

These are listed by name because they are exported; this page does not
describe behaviour it did not read.

## Related

- [Rails Consent](../guides/rails-consent.md) — the concept walk-through
- [Ledger API](ledger-api.md) — the invariants under every write here
- [FlashyID API](flashyid-api.md) — who signs the consent and grant tokens
- flashy-rails `docs/api.md`, `docs/consent-model.md`, `docs/integration.md`
