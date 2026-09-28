# Ledger API — `@flashylabs/ledger`

The public surface of the append-only, multi-asset settlement engine, as the
package's `src/index.ts` exports it. Every name below is an export of that
file; every signature and refusal is read from the source, not from a guide.
Where a guide in this repository disagrees with this page, this page was
measured and the guide was not.

Measured against flashy-ledger at `eac50d8` (branch `claude/dreamy-bell-2e5nq3`;
`package.json` declares `@flashylabs/ledger` `1.0.0`; the top `CHANGELOG.md`
entry is `0.8.0`). Repository: <https://github.com/FlashyLabs/flashy-ledger>.

## Where it comes from

- Node `>=22`, ESM (`dist/index.js`) with a CommonJS build (`dist-cjs/`).
- `publishConfig.registry` is GitHub Packages (`npm.pkg.github.com`, access
  `restricted`), so `npm install @flashylabs/ledger` from the public registry
  is not something this checkout can promise. See
  [Local setup](../guides/setup-local.md) for the sibling-checkout install.
- The domain (`src/domain/`) imports no database driver. `mongodb` is an
  optional peer dependency (`^6.21.0 || ^7.0.0`) needed only by
  `MongoLedgerStore`.
- The domain calls no clock and no random source; `occurredAt` is always an
  argument.

## The shape of the API

There is no `Ledger` class. The package is a pure decision function, `post`,
that turns *state + command* into an entry, and a storage port, `LedgerStore`,
that persists entries. A caller reads state from the store, calls `post`, and
appends what it returns.

```js
import { InMemoryLedgerStore, post, fromDecimal, FLASHY_GOLD, materialize } from '@flashylabs/ledger'

const gold = materialize(FLASHY_GOLD, { id: 'flashy-gold', tenantId: 'flashy' })
const store = new InMemoryLedgerStore()

const ref = { tenantId: 'flashy', identityId: 'identity_1', assetId: gold.id }
const state = await store.readState(ref)
const entry = post(state, {
  tenantId: 'flashy',
  identityId: 'identity_1',
  asset: gold,
  amount: fromDecimal(25, gold.decimals), // 2500 minor units
  kind: 'EARN',
  source: { type: 'quest', id: 'q_9' },
  idempotencyKey: 'quest:q_9:identity_1',
  occurredAt: new Date(),
})
const { deduplicated } = await store.append(entry)
```

## Money — `src/domain/money.ts`

| Export | Signature | Behaviour |
|---|---|---|
| `Minor` | `number & { __brand: 'Minor' }` | A whole number of an asset's smallest unit. A raw `number` does not type-check as one. |
| `minor(value)` | `(number) => Minor` | Throws `PrecisionError` unless `value` is a safe integer. |
| `ZERO` | `Minor` | `minor(0)`. |
| `fromDecimal(value, decimals)` | `(number, number) => Minor` | Scales and **refuses** over-precision (`PrecisionError`) rather than rounding: `fromDecimal(0.5, 0)` throws. |
| `toDecimal(value, decimals)` | `(Minor, number) => number` | Presentation only. |
| `add(a, b)` | `(Minor, Minor) => Minor` | Throws `PrecisionError` past `Number.MAX_SAFE_INTEGER`. |
| `negate(a)` | `(Minor) => Minor` | |
| `isNegative(a)`, `isZero(a)` | `(Minor) => boolean` | |
| `PrecisionError` | `class extends Error` | `name === 'PrecisionError'`. |

There is no `toMinor` / `toGold` in this package. Those are Flashy Rails
helpers ([Rails API](rails-api.md)) built on `fromDecimal` / `toDecimal` with
Flashy Gold's two decimals.

## Assets — `src/domain/asset.ts`, `src/domain/registry.ts`

```ts
interface Asset { id: string; slug: string; symbol: string; decimals: number; class: AssetClass; tenantId: string }
type AssetClass = 'REWARD_CURRENCY' | 'COMMODITY_UNIT' | 'PARTNER_CREDIT' | 'SKILL_XP'
interface AssetDefinition { slug: string; symbol: string; name: string; decimals: number; class: AssetClass; description: string }
```

| Export | What it does |
|---|---|
| `isTransferable(asset)` | `true` for `REWARD_CURRENCY`, `COMMODITY_UNIT`, `PARTNER_CREDIT`; `false` for `SKILL_XP`. `postTransfer` refuses a non-transferable asset. |
| `assetRegistry(assets)` | `ReadonlyMap<id, Asset>`. |
| `defineAsset(definition)` | Validates at module load: slug lower-case kebab, symbol 2–8 upper-case alphanumerics, `decimals` an integer in `0..8`, non-empty name and description. Returns a frozen copy. |
| `FLASHY_GOLD` | slug `flashy-gold`, symbol `FG`, **`decimals: 2`**, `REWARD_CURRENCY`. |
| `FLASHY_WORK_UNIT` | slug `flashy-work-unit`, symbol `FWU`, `decimals: 0`, `COMMODITY_UNIT`. |
| `WHEAT`, `WOOD`, `STONE`, `IRON` | The four civilization commodities, all `decimals: 0`, `COMMODITY_UNIT`. |
| `CIVILIZATION_COMMODITIES` | `[WHEAT, WOOD, STONE, IRON]`. |
| `FLASHY_ASSET_DEFINITIONS` | `[FLASHY_GOLD, FLASHY_WORK_UNIT, ...CIVILIZATION_COMMODITIES]`. Skill XP is deliberately not in this list. |
| `assetDefinition(slug)` | The definition or `null`. |
| `materialize(definition, { id, tenantId })` | Definition → store-ready `Asset`. **Throws on an empty `id`**; there is no default. |
| `flashyAssets(tenantId, ids)` | Every definition that has an id in `ids`, materialized, plus the five skill assets. A slug with no id is omitted, not guessed. |

## Identity — `src/domain/identity.ts`

Entries key on an opaque, tenant-scoped identity and never a natural key. The
rule is enforced inside `post()`, so nothing can write an entry that skips it.

| Export | Behaviour |
|---|---|
| `assertOpaqueIdentity(identityId)` | Throws `LedgerError('NATURAL_KEY_IDENTITY')` on an empty id, and `NaturalKeyError` when the id looks like an email, an E.164 phone number, an EVM address (`0x` + 40 hex), a 64-hex `0x` digest, or a TON address. UUIDs, ObjectIds, bare integers and base58 are deliberately **not** rejected. |
| `looksLikeNaturalKey(identityId)` | The matched kind (e.g. `'an email address'`) or `null`. |
| `surrogateIdentity(value, tenantSalt)` | `sha256(`${tenantSalt} ${value}`)` as hex. Refuses a salt shorter than 16 characters. |
| `NaturalKeyError` | `extends LedgerError`, with `kind` and `hint`. |

## Posting — `src/domain/post.ts`

```ts
interface LedgerState { balance: Minor; headHash: string | null }
interface PostCommand {
  tenantId: string; identityId: string; asset: Asset
  amount: Minor              // signed: positive credits, negative debits
  kind: EntryKind; source: EntrySource
  idempotencyKey: string; occurredAt: Date
  metadata?: Record<string, unknown>
  allowNegative?: boolean    // permit a negative balance; off by default
}
type ProposedEntry = Omit<Entry, 'id'>
```

| Export | Behaviour |
|---|---|
| `post(state, command)` | Pure. In order: throws `MISSING_IDEMPOTENCY_KEY`, then `assertOpaqueIdentity`, then `ZERO_AMOUNT`, then `INSUFFICIENT_BALANCE` when `state.balance + amount < 0` and `allowNegative !== true`. Returns a `ProposedEntry` whose `hash` chains onto `state.headHash`. |
| `postTransfer(from, to, command)` | `from`/`to` are `{ state, identityId }`; `command` is a `PostCommand` without `identityId`/`kind`, with a **positive** `amount`. Throws `ZERO_AMOUNT` on zero or negative, `ASSET_NOT_TRANSFERABLE` on `SKILL_XP`. Returns `[debit, credit]`: kinds `TRANSFER_OUT` / `TRANSFER_IN`, idempotency keys `${key}:out` / `${key}:in`. Append both with `appendAll`, never one at a time. |
| `reverse(state, original, reason, occurredAt)` | The mirror entry: kind `REVERSAL`, amount negated, source `{ type: 'reversal', id: original.id, description: reason }`, key `reversal:${original.idempotencyKey}`, `allowNegative: true`. History is never edited. |

### Multi-asset consumption — `src/domain/consume.ts`

| Export | Behaviour |
|---|---|
| `shortfalls(costs)` | Every `{ assetId, available, required, short }` a bill cannot cover; `[]` if affordable. |
| `canConsume(costs)` | `shortfalls(costs).length === 0`. |
| `postConsume(command)` | One `SPEND` entry per cost, keys `${key}:consume:${assetId}`, or **no entries at all**: throws `InsufficientForConsumptionError` listing every shortfall, `DUPLICATE_ASSET_IN_COMMAND` if an asset appears twice, `ZERO_AMOUNT` on an empty or non-positive line. Does not accept `allowNegative`. |

## Entries and the hash chain — `src/domain/entry.ts`

```ts
interface Entry {
  id: string; tenantId: string; identityId: string; assetId: string
  amount: Minor; balanceBefore: Minor; balanceAfter: Minor
  kind: EntryKind; source: EntrySource
  idempotencyKey: string; occurredAt: Date
  previousHash: string | null; hash: string
  metadata?: Record<string, unknown>
}
type EntryKind = 'EARN' | 'SPEND' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT' | 'REVERSAL' | 'EXPIRY' | 'MIGRATION' | 'DECAY'
interface EntrySource { type: string; id?: string; description?: string }
```

| Export | Behaviour |
|---|---|
| `hashEntry(hashable)` | sha256 (hex) over a **fixed field order** joined by single spaces: `previousHash ?? ''`, `tenantId`, `identityId`, `assetId`, `amount`, `balanceBefore`, `balanceAfter`, `kind`, `source.type`, `source.id ?? ''`, `idempotencyKey`, `occurredAt.toISOString()`. `metadata` is not hashed. |
| `verifyEntry(entry)` | Recomputes and compares. |
| `verifyChain(entries)` | `{ valid, problems }`: every hash intact, every `previousHash` equal to the prior `hash`, every `balanceBefore` equal to the prior `balanceAfter`, and `balanceBefore + amount === balanceAfter`. |

## Folds — `src/domain/fold.ts`

| Export | Behaviour |
|---|---|
| `balanceOf(entries)` | Σ `amount`. A stored balance is a cache of this. |
| `balancesByAsset(entries)` | `ReadonlyMap<assetId, Minor>`. |
| `stateFrom(entries)` | `{ balance: last.balanceAfter ?? ZERO, headHash: last.hash ?? null }`. |

## The store port — `src/ports/store.ts`

```ts
interface AccountRef { tenantId: string; identityId: string; assetId: string }
interface HistoryRef { tenantId: string; identityId: string; assetId?: string }
interface AppendResult { entry: Entry; deduplicated: boolean }

interface LedgerStore {
  append(entry: ProposedEntry): Promise<AppendResult>
  readState(ref: AccountRef): Promise<LedgerState>
  readEntries(ref: HistoryRef): Promise<readonly Entry[]>          // oldest first
  findByIdempotencyKey(tenantId: string, key: string): Promise<Entry | null>
}
interface TransactionalLedgerStore extends LedgerStore {
  appendAll(entries: readonly ProposedEntry[]): Promise<readonly AppendResult[]>  // all or nothing
}
```

Every read takes a tenant; there is no overload without one. The contract an
implementation must meet: atomic `append`; unique `idempotencyKey` per tenant
(a replay returns the original with `deduplicated: true` and writes nothing);
no update and no delete; `readState` reflects every prior append.
`isTransactional(store)` narrows to `TransactionalLedgerStore`.

| Adapter | Notes |
|---|---|
| `InMemoryLedgerStore` | Transactional. The reference implementation and the conformance target for every other adapter. Keys are scoped by tenant *and* idempotency key. |
| `MongoLedgerStore` | `new MongoLedgerStore(db, { collection?, client? })`; collection defaults to `ledger_entries`. Call `ensureIndexes()` once per deployment before writing — it drops the pre-0.2 global indexes and creates tenant-scoped ones. A multi-entry `appendAll` needs `client` for a transaction and refuses without it. |
| `GoldLedgerReader` | Read-only reader over ClaimYour.Gold's existing `gold_ledger`; **not** a `LedgerStore`. `DEFAULT_FIELDS`, `GOLD_LEDGER_FIELDS`, `resolveFields` map a foreign collection's field names. |

## Errors — `src/domain/errors.ts`

```ts
class LedgerError extends Error { readonly code: LedgerErrorCode }
type LedgerErrorCode =
  | 'INSUFFICIENT_BALANCE' | 'ZERO_AMOUNT' | 'MISSING_IDEMPOTENCY_KEY'
  | 'INSUFFICIENT_FOR_CONSUMPTION' | 'DUPLICATE_ASSET_IN_COMMAND'
  | 'NATURAL_KEY_IDENTITY' | 'ASSET_NOT_TRANSFERABLE'
class InsufficientForConsumptionError extends LedgerError { readonly shortfalls: readonly Shortfall[] }
```

There is no `UNKNOWN_HOLDER` and no `DUPLICATE_IDEMPOTENCY_KEY`: a replayed
key is not an error, it is an `AppendResult` with `deduplicated: true`.

## Skill experience — `src/domain/experience.ts`

`SKILL_KEYS` (`INTELLIGENCE`, `STRATEGY`, `INSTINCT`, `INFLUENCE`, `COMMERCE`),
`skillAsset(skill, tenantId)` (ids `xp-int`, `xp-str`, `xp-ins`, `xp-inf`,
`xp-com`; `decimals: 0`; class `SKILL_XP`), `skillAssets`, `skillAssetRegistry`,
`skillForAssetId`, and `xpIdempotencyKey(product, activity, entityId, identityId)`
→ `product:activity:entityId:identityId`. XP is non-transferable by class.

## Merkle anchoring — `src/domain/merkle.ts`

The daily-anchor tree over `SnapshotEntry` rows (`id | asset | type | source |
amountMinor | recordedAt`): `canonical`, `leafHash` (prefix `0x00`), `nodeHash`
(prefix `0x01`), `sortEntries` (by id, byte-wise), `merkleRoot` (`null` for an
empty set; odd nodes promoted, never duplicated), `inclusionProof`,
`verifyInclusion`, `toJsonl`, `sha256Hex`, `commit` (root + `entryCount` +
`datasetSha256` + `outstandingMinor`), `toHex`, `fromHex`. Types:
`Hex`, `SnapshotEntry`, `ProofStep`, `InclusionProof`, `Commitment`.

## The invariants, as the package states them

`docs/INVARIANTS.md` in flashy-ledger numbers the guarantees and maps each to
the test that proves it, and `tests/invariants.test.ts` there fails the build
if the table and the suite disagree. This page repeats none of those numbers.

## Related

- [Ledger 101](../guides/ledger-101.md) — the concept walk-through
- [Rails API](rails-api.md) — the consent layer that calls `post` on your behalf
- [Local setup](../guides/setup-local.md) — installing from the sibling checkout
