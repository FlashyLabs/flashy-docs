# Production Deployment Patterns

Reference shapes for deploying the Flashy packages, not a description of any
running infrastructure — adapt them to your environment and risk profile.
Every code sample names exports the packages actually have (see the
[API pages](../api/ledger-api.md)); nothing here is a configuration flag the
packages do not read.

Measured against flashy-ledger `7b254be`, flashy-rails `d4c012a`, magician
`78166e4` and flashyid `a2706c0` (all on branch `claude/dreamy-bell-2e5nq3`).

## Before You Deploy

Every Flashy deployment must hold:

1. **No secrets in code** — Secret Manager; a committed credential is burned the moment it lands
2. **Immutable audit trail** — the ledger store has no update and no delete; correct with `reverse`
3. **Consent before writes** — `execute` and `spendUnderGrant` refuse before touching the store; do not add a path around them
4. **Attenuation only** — `attenuate` refuses a wider child in both Rails and the SDK
5. **Sealed outcomes** — Magician's digest is portable sha256 over canonical JSON; verify with the package, never re-implement

## Pattern 1: Ledger Only

**Use case:** a private, append-only record of value for internal settlement.

```
Your service
    ↓ post() → store.append()
LedgerStore
    ├── InMemoryLedgerStore   (tests, and the conformance target every adapter is checked against)
    └── MongoLedgerStore      (durable; tenant-scoped indexes)
```

**Key decisions:**

- **Store:** `MongoLedgerStore` is the shipped durable adapter. Call
  `ensureIndexes()` once per deployment before the first write; pass a
  `client` if you need multi-entry `appendAll` (a transaction).
- **Idempotency keys** from the business event, never a timestamp — the
  unique index on `(tenantId, idempotencyKey)` is what makes a retry safe.
- **Balances:** `readState` is the cache of `balanceOf(entries)`; reconcile
  the two on a schedule with `verifyChain`.

```javascript
import { MongoClient } from 'mongodb'
import { MongoLedgerStore, post, fromDecimal, FLASHY_GOLD, materialize, verifyChain } from '@flashylabs/ledger'

const client = new MongoClient(process.env.MONGO_URL)      // from Secret Manager, never a file
await client.connect()
const store = new MongoLedgerStore(client.db('ledger'), { collection: 'ledger_entries', client })
await store.ensureIndexes()                                 // once per deployment, before writing

const gold = materialize(FLASHY_GOLD, { id: 'flashy-gold', tenantId: 'flashy' })
const ref = { tenantId: 'flashy', identityId: 'h_2c91', assetId: gold.id }

const entry = post(await store.readState(ref), {
  tenantId: 'flashy', identityId: 'h_2c91', asset: gold,
  amount: fromDecimal(25, gold.decimals), kind: 'EARN',
  source: { type: 'quest', id: 'q_9' }, idempotencyKey: 'quest:q_9:h_2c91', occurredAt: new Date(),
})
await store.append(entry)

// A scheduled reconciliation: the chain and the running balance, from the store's own entries
const { valid, problems } = verifyChain(await store.readEntries(ref))
```

**Before deploy:** flashy-ledger's own `npm test`, and its conformance suite
against a Mongo replica set (`tests/conformance.test.ts` there), prove the
adapter behaves identically to the in-memory reference.

## Pattern 2: Rails + Ledger

**Use case:** consent-gated movement of Flashy Gold.

```
Property / wallet
    ↓ draft → holder consents → execute
RailsService  (checks the consent binding, then post/postTransfer)
    ↓
LedgerStore   (TransactionalLedgerStore for transfers)
```

**Key decisions:**

- **Consent tokens** are signed by flashyID in production (`mintConsentToken`,
  120 s default expiry) and verified by the rail's `FlashyIdVerifier`. The
  structural binding — draft id, holder, action — is checked by `execute`
  whoever signed the token.
- **Enforcement boundary:** `execute` throws `CONSENT_REQUIRED` /
  `CONSENT_MISMATCH` before any read of the store.
- **Transfers need a transactional store**, or `execute` throws
  `STORE_NOT_TRANSACTIONAL`.

```javascript
import { RailsService, RailsClient, ROUTE_TABLE } from '@flashylabs/rails'

// In-process: the service over a durable store (Pattern 1's `store`)
const rails = new RailsService({ store, tenantId: 'flashy' })

const draft = rails.draftTransfer({
  fromId: 'h_2c91', toId: 'h_7e40', amount: 50,
  source: { type: 'payment', id: 'p_1' }, idempotencyKey: 'payment:p_1',
})
// The holder's consent arrives from the token layer; execute validates the binding, then writes
const results = await rails.execute(draft, consentFromHolder)

// Over HTTP: a property talks to a hosted rail through the client, one method per route in ROUTE_TABLE
const remote = new RailsClient({ baseUrl: 'https://rails.example', issuerToken: process.env.RAIL_ISSUER_TOKEN })
await remote.balance('h_2c91')
```

**Before deploy:** flashy-rails' `npm test` runs against the real ledger, no
mocks — the consent gate, attenuation and revocation each have a test there.

## Pattern 3: Magician Routing

**Use case:** trust-routed, consent-gated introductions.

```
Member's client (local-first: the graph is relationship data and stays with its owner)
    ↓ parseGraph → findPaths → openRequest
Consent machine  (consentHop by the edge's owner only; a decline renders `unavailable`)
    ↓ markIntroduced → sealOutcome
Outcome log      (appendOutcome refuses a replayed digest)
```

**Key decisions:**

- **Graph storage:** a `magician-graph/1` JSON document per owner. `parseGraph`
  refuses text that contains a credential shape, so the store cannot double as
  a secret store.
- **Consent from every hop** — the machine enforces it; `markIntroduced`
  throws on a partial yes. There is no `maxHops` option: `MAX_HOPS` is 3.
- **Sealing:** the package's sha256, no `node:` imports; a browser verifies
  the same bytes.

```javascript
import { parseGraph, parseIntent, findPaths, openRequest, consentHop, markIntroduced, sealOutcome, appendOutcome } from '@magician-network/core'

const graph = parseGraph(graphJsonText)          // refuses; never guesses
const intent = parseIntent(intentDocument)       // an intent with no wants is refused
const [best] = findPaths(graph, intent)

let request = openRequest(requestId, intent.id, best, new Date())
// … each hop owner answers from their own client; only the owner of a hop may:
request = consentHop(request, hopOwnerId)
// … when every hop has consented:
request = markIntroduced(request)
const record = sealOutcome(request, intent, { kind: 'meeting', note: 'Met on 2026-09-14; follow-up agreed.' })
outcomeLog = appendOutcome(outcomeLog, record)   // refuses a record that does not verify, or a digest already present
```

**Before deploy:** magician's `npm test` — the parser's test file is the
conformance suite for trust/1 and introduction/1, and a test compares a
declined request's view with a nonexistent path's for deep equality.

## Pattern 4: FlashyID

**Use case:** authenticated assertions with delegated authority that only
narrows.

```
Person
    ↓ signs in (the provider: oidc-provider on Express, issuer id.flashyid.com)
Provider  ── publishes /.well-known/openid-configuration and a JWKS
    ↓ EdDSA assertion carrying `del`, the delegation chain
Relying party  ── @flashyid/sdk: verifyAssertion → authorize → evaluateGrant
```

**Key decisions:**

- **The SDK is not an OAuth client.** Login is the provider's; the SDK
  verifies and evaluates. Use any OIDC client against the discovery document.
- **Pin your roots:** `trustedRoots` — the `accountableTo` of every charter
  you federate with. An empty set refuses every chain.
- **Revocation** is a `revokedJtis` set you supply at check time; the SDK
  holds no list. Keep it where every relying party can read it quickly.

```javascript
import { authorize, evaluateGrant } from '@flashyid/sdk'

const out = await authorize(bearerToken, { scope: 'payment.execute', amount: 5000 }, {
  issuer: 'https://id.flashyid.com',
  audience: process.env.FLASHYID_CLIENT_ID,
  nowSec: Math.floor(Date.now() / 1000),
  revokedJtis: await revocationList.read(),          // your store; the SDK carries none
  trustedRoots: trustedRootsFromYourCharters,
})
if (out === null) { /* 401 */ }
else if (!out.result.ok) { /* 403, out.result.code */ }

// Where a human can co-sign, route through the gate instead: approval_required becomes ESCALATE
const decision = evaluateGrant(out.assertion.del, { scope: 'payment.execute', amount: 5000, impact: 'HIGH' }, {
  nowSec: Math.floor(Date.now() / 1000),
})
```

**Before deploy:** the SDK's `npm test` under `packages/sdk` — the export list
is pinned by `public-api.test.ts`, and the grant kernel's refusals each have a
test.

## Pattern 5: Full Stack (Alice Pays Dave)

```
Alice                Bob                Carol              Dave
  |                   |                  |                |
  +----[Magician: findPaths → consentHop ×3 → sealOutcome]-+
  |
  +----[Rails: draftTransfer → consent (FlashyID-signed) → execute]----→ Dave
                     [Ledger: TRANSFER_OUT + TRANSFER_IN, appendAll]
```

**The flow:**

1. **Magician:** Alice's graph routes to Dave through Bob and Carol; each edge's owner consents; the outcome is sealed.
2. **FlashyID:** Alice's consent to the rail draft is minted as a token (`mintConsentToken`); a delegated variant folds a chain onto a rail grant (`railGrantFromChain`).
3. **Rails:** `draftTransfer` is pure; `execute` checks the consent binding and writes.
4. **Ledger:** two chained entries, atomically; `verifyChain` valid; a replay dedups.

The running code is the [Combined Workflow](../guides/combined-workflow.md);
the packages compose in your process, not through a `fullStack` object.

## Deployment Checklist

### Security
- [ ] No secrets in code — `MONGO_URL`, signing keys and issuer tokens from Secret Manager
- [ ] The flashyID private key never leaves the provider; relying parties hold the JWKS only
- [ ] `trustedRoots` configured on every mesh relying party
- [ ] HTTPS enforced; the provider's `proxy` flag set behind a TLS terminator (its `server.ts` explains why)

### Reliability
- [ ] `MongoLedgerStore.ensureIndexes()` run before the first write
- [ ] Transfers only on a `TransactionalLedgerStore`
- [ ] Idempotency keys derived from business events, so retries are safe
- [ ] A scheduled `verifyChain` / `reconcile` over every holder's history

### Correctness
- [ ] Each package's own suite green at the commit you deploy
- [ ] No code path calls `execute` without a consent, or `spendUnderGrant` without `assertSpendable` (the service does this; do not wrap around it)
- [ ] A revocation list every relying party reads before `authorize`

### Operations
- [ ] Runbook: start, stop, recover, rotate a signing key (JWKS `kid`)
- [ ] Alerts on `onUnavailable` from the enforcement gate — a fallback to record-only is a CRITICAL event
- [ ] Backup and restore tested for the ledger collection

## Common Pitfalls

### Caching a balance

**Wrong:** read `readState` once and serve it for a minute. A stale balance
authorises an overdraft that `post` would have refused.

**Right:** `post` reads state at the moment of the write and refuses
`INSUFFICIENT_BALANCE` itself; serve `rails.balance()` fresh.

### An auto-approval path

**Wrong:**

```javascript
if (draft.amountMinor < 1000) {
  await rails.execute(draft)        // throws CONSENT_REQUIRED — and if it did not, this would be the bug
}
```

**Right:** every `execute` carries the holder's consent to *that* draft. There
is no threshold below which the gate opens; the consent layer exists to
prevent exactly this.

### Widening a grant

**Wrong:**

```javascript
import { attenuate, toMinor } from '@flashylabs/rails'

const child = attenuate(parent, { grantId: 'g_child', spenderId: 'h_x', capMinor: toMinor(200) })   // throws GRANT_WIDENED when 20000 > parent.remainingMinor
```

**Right:** a child cap at or below the parent's remaining amount, the same
purpose, an expiry no later than the parent's. In the SDK the same rule
returns `{ ok: false, code: 'chain_widened' }` rather than throwing.

### A natural key as an identity

**Wrong:** `identityId: 'alice@example.com'` — `post` throws
`NATURAL_KEY_IDENTITY`, and if it did not, the address would be hashed into a
chain forever.

**Right:** `surrogateIdentity(value, tenantSalt)` with a salt from Secret
Manager.

### Storing secrets in git

```bash
# Wrong: a credential committed is burned, and history keeps it
echo "MONGO_URL=mongodb://user:pass@host" > .env.production && git add .env.production

# Right: never commit .env files; read from Secret Manager at runtime
echo ".env*" >> .gitignore
```

## Resources

- [Ledger API](../api/ledger-api.md) · [Rails API](../api/rails-api.md) · [Magician API](../api/magician-api.md) · [FlashyID API](../api/flashyid-api.md)
- [Local setup](../guides/setup-local.md)
- [Working examples](https://github.com/flashylabs/flashy-examples)

**Questions?** File an issue in [flashy-docs](https://github.com/flashylabs/flashy-docs/issues) or [flashy-examples](https://github.com/flashylabs/flashy-examples/issues).
