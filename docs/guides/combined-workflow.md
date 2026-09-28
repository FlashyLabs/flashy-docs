# Combined Workflow: Alice Pays Dave Through a Trust Chain

One end-to-end walk through all four systems. Alice wants to settle 50.00
Flashy Gold with Dave, whom she does not know. Magician routes an
introduction through Bob and Carol and seals the outcome; Alice then drafts
a Rails transfer to Dave, consents to it, and the Ledger records both
entries. FlashyID is where the consent and any delegated authority are
signed in production.

Every sample names exports the packages actually have. Measured against
flashy-ledger `7b254be`, flashy-rails `d4c012a`, magician `78166e4` and
flashyid `a2706c0` (all on branch `claude/dreamy-bell-2e5nq3`; the ledger's,
magician's and the SDK's source is unchanged since the commits the API pages
measured, and rails' only source change is a JSDoc fix in `gold.mjs`).

## The Scenario

**Actors** (fictional; every Magician persona carries `demo: true`):

- Alice — holds 100.00 FG; wants to pay Dave; owns the Magician graph
- Bob — Alice's edge; knows Carol
- Carol — Bob's edge; knows Dave
- Dave — answers for `cap/gold-custody`; holds 10.00 FG

**Two kinds of identity.** Magician ids are `person/` slugs and stay in the
graph. Ledger identities must be opaque surrogates — `h_2c91`, `h_7e40` —
because an id that names a person cannot be taken back out of an immutable
chain. Mapping one onto the other is the caller's job and never enters a
record.

## How the Four Fit

The packages do not import each other, with one exception: Rails is built on
the Ledger. Everything else is composition in your code.

- **Ledger** — `post` / `postTransfer` decide; a `LedgerStore` appends. Balance never negative; replay dedups.
- **Rails** — `draftTransfer` is pure; `execute(draft, consent)` is the one write. Grants attenuate only.
- **Magician** — `findPaths` from the owner; every hop's owner consents; `sealOutcome` records the introduction.
- **FlashyID** — signs the assertion, the consent token and the grant token the rail verifies; the grant kernel guarantees a chain only narrows.

## Step by Step

### 1. Set Up the Rail and Fund the Holders

```javascript
import { RailsService } from '@flashylabs/rails'
import { InMemoryLedgerStore } from '@flashylabs/ledger'

const store = new InMemoryLedgerStore()
const rails = new RailsService({ store })

const ALICE = 'h_2c91'
const DAVE = 'h_7e40'

await rails.earn({ identityId: ALICE, amount: 100, source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91' })
await rails.earn({ identityId: DAVE, amount: 10, source: { type: 'quest', id: 'q_2' }, idempotencyKey: 'quest:q_2:h_7e40' })
```

### 2. Route the Introduction

```javascript
import { parseGraph, parseIntent, findPaths } from '@magician-network/core'

const edge = (from, to, value) => ({
  format: 'trust/1', from, to, tier: 'private', domains: [],
  strength: { value, register: 'asserted' },
  provenance: [{ kind: 'worked-with', at: '2026-03-01' }],
  asserted: '2026-03-01', renewed: '2026-09-01',
})

const graph = parseGraph(JSON.stringify({
  format: 'magician-graph/1',
  owner: 'person/alice',
  people: [
    { id: 'person/alice', name: 'Alice (demo)', capabilities: [], demo: true },
    { id: 'person/bob', name: 'Bob (demo)', capabilities: [], demo: true },
    { id: 'person/carol', name: 'Carol (demo)', capabilities: ['cap/logistics'], demo: true },
    { id: 'person/dave', name: 'Dave (demo)', capabilities: ['cap/gold-custody'], demo: true },
  ],
  edges: [
    edge('person/alice', 'person/bob', 0.8),
    edge('person/bob', 'person/carol', 0.7),
    edge('person/carol', 'person/dave', 0.9),
  ],
}))

const intent = parseIntent({
  id: 'settlement-custody',
  text: 'Find a custodian who can hold settlement gold for a cross-border payment.',
  wants: ['cap/gold-custody'],
  opened: '2026-09-01',
})

const [path] = findPaths(graph, intent)
// path.hops.map((h) => h.node) → ['person/bob', 'person/carol', 'person/dave']
```

### 3. Collect Every Consent

Only the owner of an edge consents to crossing it. Alice's own edge to Bob
is a hop too.

```javascript
import { openRequest, consentHop, markIntroduced, requestState } from '@magician-network/core'

let request = openRequest('req-1', intent.id, path, new Date())
request = consentHop(request, 'person/alice')
request = consentHop(request, 'person/bob')
request = consentHop(request, 'person/carol')
request = markIntroduced(request)      // throws unless every hop consented
requestState(request)                  // 'introduced'
```

Had Bob declined, `toRequesterView(request)` would read `{ id: 'req-1',
state: 'unavailable' }` and the story would end there — Alice would not
learn that Bob, or anyone, declined.

### 4. Seal the Introduction

```javascript
import { sealOutcome, verifyIntroduction } from '@magician-network/core'

const record = sealOutcome(request, intent, {
  kind: 'deal',
  note: 'Dave agreed to custody the settlement gold; terms signed 2026-09-20.',
})
verifyIntroduction(record)   // true
// record.digest is the hex sha256 of the canonical body — portable, prefix-free
```

### 5. Draft the Transfer

```javascript
const draft = rails.draftTransfer({
  fromId: ALICE, toId: DAVE, amount: 50,
  source: { type: 'payment', id: 'p_1', description: `introduction ${record.digest.slice(0, 12)}` },
  idempotencyKey: 'payment:p_1',
})
// draft.id === 'transfer:payment:p_1'; nothing written
```

The introduction digest rides in the entry's `source.description`, so the
settlement points at the sealed record that preceded it without the record
carrying any ledger data.

### 6. Alice Consents

In-process, `approve` builds the consent bound to this draft. In production
the same four fields arrive as a token flashyID signed — `mintConsentToken`
— and the rail's `FlashyIdVerifier` maps its claims onto the same shape.

```javascript
import { approve } from '@flashylabs/rails'

const consent = approve(draft, ALICE, new Date())
// { draftId: 'transfer:payment:p_1', holderId: 'h_2c91', action: 'transfer', approvedAt }
```

```javascript
import { generateKeyPair } from 'jose'
import { mintConsentToken } from '@flashyid/sdk'

// The production shape. flashyID holds the private key; the rail holds the public JWKS.
const { privateKey } = await generateKeyPair('EdDSA')
const consentJws = await mintConsentToken(
  { privateKey, issuer: 'https://id.flashyid.com', audience: 'https://rails.example' },
  { draftId: draft.id, holderId: ALICE, action: draft.action, approvedAt: new Date() },
)
// claims: typ 'consent', draftId, holderId, action, approvedAt; sub = holderId; exp in 120 s
```

### 7. Execute

```javascript
const [debit, credit] = await rails.execute(draft, consent)
// debit.entry.kind === 'TRANSFER_OUT' on h_2c91; credit.entry.kind === 'TRANSFER_IN' on h_7e40
// both appended atomically; consentedAt is in each entry's metadata
```

### 8. Read Back and Verify

```javascript
import { verifyChain as verifyLedgerChain } from '@flashylabs/ledger'

await rails.balance(ALICE)   // { minor: 5000, gold: 50, symbol: 'FG' }
await rails.balance(DAVE)    // { minor: 6000, gold: 60, symbol: 'FG' }

const history = await rails.history(ALICE)              // [EARN, TRANSFER_OUT], oldest first
verifyLedgerChain(history)                              // { valid: true, problems: [] }
await rails.reconcile(ALICE)                            // { ok: true, balance, sealHead, … }
```

## Variant: Alice's Agent Pays Under a Delegated Grant

If Alice delegates the payment to an agent, FlashyID's chain is the source of
truth for the delegation and the rail draws down a flat, capped grant derived
from it. `railGrantFromChain` in the SDK mints that grant as a token with a
fixed mapping — `holderId = root`, `spenderId = leaf holder`, `capMinor =
effective spend_max`, `expiresAt = effective exp` — and the same mapping,
applied in-process, is a Rails `issueGrant`:

```javascript
import { issueRoot, attenuate, verifyChain as verifyGrantChain, agentSubject } from '@flashyid/sdk'
import { issueGrant, FLASHY_GOLD_ID } from '@flashylabs/rails'

const nowSec = Math.floor(Date.now() / 1000)
const root = issueRoot({
  rootHuman: ALICE, holder: ALICE,
  scp: ['payment.execute'], res: ['rail:flashy-gold'],
  lim: { spend_max: 10000 }, iat: nowSec, exp: nowSec + 7 * 86_400, jti: 'g_root',
})
const chain = attenuate(root, {
  holder: agentSubject('alice-office', 'settler'),
  lim: { spend_max: 5000 }, iat: nowSec, exp: nowSec + 86_400, jti: 'g_agent',
})

const effective = verifyGrantChain(chain, nowSec)
if (!effective.ok) throw new Error(effective.code)       // expired | revoked | chain_widened | broken_chain

const grant = issueGrant({
  grantId: 'g_agent', holderId: effective.root, spenderId: effective.holder,
  assetId: FLASHY_GOLD_ID, capMinor: effective.lim.spend_max, purpose: 'settlement',
  expiresAt: new Date(effective.exp * 1000),
})

// assertSpendable runs before any write: GRANT_REVOKED, GRANT_EXPIRED, GRANT_EXCEEDED
const { result, grant: after } = await rails.spendUnderGrant({
  grant, amount: 50,
  source: { type: 'payment', id: 'p_2' }, idempotencyKey: 'payment:p_2',
})
// result.entry.amount === -5000 on Alice's account, metadata { grantId: 'g_agent', spenderId: 'agent:alice-office/settler' }
// after.remainingMinor === 0
```

The agent never held Alice's consent to a draft; it held an allowance she
issued, narrowed by the chain, checked before the write. The two paths do not
mix: a draft is executed by its holder's consent, a grant is drawn by its
spender within its cap.

## Complete Code Example

```javascript
import { InMemoryLedgerStore, verifyChain as verifyLedgerChain } from '@flashylabs/ledger'
import { RailsService, approve } from '@flashylabs/rails'
import {
  parseGraph, parseIntent, findPaths,
  openRequest, consentHop, markIntroduced, toRequesterView,
  sealOutcome, verifyIntroduction, appendOutcome,
} from '@magician-network/core'

async function main() {
  console.log('=== Alice pays Dave through a trust chain ===')

  const rails = new RailsService({ store: new InMemoryLedgerStore() })
  const ALICE = 'h_2c91'
  const DAVE = 'h_7e40'

  await rails.earn({ identityId: ALICE, amount: 100, source: { type: 'quest', id: 'q_1' }, idempotencyKey: 'quest:q_1:h_2c91' })
  await rails.earn({ identityId: DAVE, amount: 10, source: { type: 'quest', id: 'q_2' }, idempotencyKey: 'quest:q_2:h_7e40' })

  const edge = (from, to, value) => ({
    format: 'trust/1', from, to, tier: 'private', domains: [],
    strength: { value, register: 'asserted' },
    provenance: [{ kind: 'worked-with', at: '2026-03-01' }],
    asserted: '2026-03-01', renewed: '2026-09-01',
  })
  const graph = parseGraph(JSON.stringify({
    format: 'magician-graph/1',
    owner: 'person/alice',
    people: [
      { id: 'person/alice', name: 'Alice (demo)', capabilities: [], demo: true },
      { id: 'person/bob', name: 'Bob (demo)', capabilities: [], demo: true },
      { id: 'person/carol', name: 'Carol (demo)', capabilities: ['cap/logistics'], demo: true },
      { id: 'person/dave', name: 'Dave (demo)', capabilities: ['cap/gold-custody'], demo: true },
    ],
    edges: [
      edge('person/alice', 'person/bob', 0.8),
      edge('person/bob', 'person/carol', 0.7),
      edge('person/carol', 'person/dave', 0.9),
    ],
  }))
  const intent = parseIntent({
    id: 'settlement-custody',
    text: 'Find a custodian who can hold settlement gold for a cross-border payment.',
    wants: ['cap/gold-custody'],
    opened: '2026-09-01',
  })

  const [path] = findPaths(graph, intent)
  if (!path) throw new Error('no trust path answers for cap/gold-custody')
  console.log(`Route: ${['person/alice', ...path.hops.map((h) => h.node)].join(' → ')}`)

  let request = openRequest('req-1', intent.id, path, new Date())
  for (const hop of path.hops) request = consentHop(request, hop.consentOf)
  request = markIntroduced(request)
  console.log(`Requester sees: ${toRequesterView(request).state}`)

  const record = sealOutcome(request, intent, {
    kind: 'deal',
    note: 'Dave agreed to custody the settlement gold; terms signed 2026-09-20.',
  })
  const log = appendOutcome([], record)
  console.log(`Sealed: ${record.digest} (verifies: ${verifyIntroduction(record)}, log size ${log.length})`)

  const draft = rails.draftTransfer({
    fromId: ALICE, toId: DAVE, amount: 50,
    source: { type: 'payment', id: 'p_1', description: `introduction ${record.digest.slice(0, 12)}` },
    idempotencyKey: 'payment:p_1',
  })
  const consent = approve(draft, ALICE, new Date())
  const [debit, credit] = await rails.execute(draft, consent)
  console.log(`Settled: ${debit.entry.kind} ${debit.entry.amount} / ${credit.entry.kind} ${credit.entry.amount}`)

  const alice = await rails.balance(ALICE)
  const dave = await rails.balance(DAVE)
  console.log(`Alice: ${alice.gold} ${alice.symbol}   Dave: ${dave.gold} ${dave.symbol}`)

  const { valid } = verifyLedgerChain(await rails.history(ALICE))
  console.log(`Alice's chain verifies: ${valid}`)
  console.log('=== Complete ===')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
```

Expected: `Alice: 50 FG   Dave: 60 FG`, both chains valid, and a 64-hex
digest that verifies anywhere the record is carried.

## Key Invariants Verified

1. **Trust path exists and is bounded:** three hops, found from the owner, ranked by match then hops then trust
2. **Every hop consented:** `markIntroduced` throws on a partial yes; a decline reads `unavailable`
3. **Seal is portable:** canonical JSON, sha256 with no `node:` imports, replay refused by `appendOutcome`
4. **Transfer requires consent:** `execute` throws `CONSENT_REQUIRED` / `CONSENT_MISMATCH` before any read
5. **Balances correct and non-negative:** the ledger's `post` refuses `INSUFFICIENT_BALANCE`
6. **Ledger immutable and idempotent:** two chained entries, `verifyChain` valid, a replayed key dedups

## Production Patterns

### Error Recovery

Ledger errors pass through Rails **unwrapped**, so the code tells you which
layer refused.

```javascript
import { RailsError } from '@flashylabs/rails'
import { LedgerError } from '@flashylabs/ledger'

try {
  await rails.execute(draft, consent)
} catch (e) {
  if (e instanceof LedgerError && e.code === 'INSUFFICIENT_BALANCE') {
    // Alice does not hold enough: nothing was written; re-draft for less or wait for an earn
  } else if (e instanceof RailsError && e.code === 'CONSENT_MISMATCH') {
    // the consent names another draft, holder or action: ask the holder for a consent to THIS draft
  } else if (e instanceof RailsError && e.code === 'GRANT_REVOKED') {
    // the grant path only: the holder took the authority back; do not retry
  } else throw e
}
```

### Idempotent Retries

Derive `idempotencyKey` from the business event and retry freely: a replay of
`execute` or `spendUnderGrant` returns `deduplicated: true` and moves nothing,
and a replayed spend never draws a grant down twice.

### Audit Logging

Log what the systems already sealed, never a re-derivation of it.

```javascript
console.log(JSON.stringify({
  event: 'settlement_executed',
  entryHash: debit.entry.hash,          // the ledger's own chain hash
  idempotencyKey: debit.entry.idempotencyKey,
  amountMinor: debit.entry.amount,
  introduction: record.digest,          // the sealed introduction it followed
  consentedAt: debit.entry.metadata.consentedAt,
}))
```

Nothing in that line names a person: ledger ids are surrogates and the
introduction record carries `person/` slugs, not the ledger ids.

## Next Steps

- [Deployment Patterns](../deployment/patterns.md) — how the four are deployed together
- The API pages, each measured against source: [Ledger](../api/ledger-api.md), [Rails](../api/rails-api.md), [Magician](../api/magician-api.md), [FlashyID](../api/flashyid-api.md)
- [Local setup](setup-local.md) §4 says which [flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/05-combined-workflow) run at these commits
