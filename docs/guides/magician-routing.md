# Magician Routing: Consent-Gated Introductions

Learn `@magician-network/core`, the trust routing and introduction sealing
engine. Parse a graph of trust/1 edges, route an intent through it, collect
every hop's consent, and seal the outcome as an introduction/1 record any
platform can verify. Every name below is an export of
`packages/core/src/index.ts`; the signatures are the
[Magician API](../api/magician-api.md) page's.

Measured against magician at `78166e4` (branch `claude/dreamy-bell-2e5nq3`;
`packages/core/src` is byte-identical to the `f5c4fda` the API page measured —
the one commit between them adds published schemas and a verifier script).

## What Problem Does It Solve?

You need to show that:

- A chain of trust exists between you and someone you do not know
- Every person whose relationship the introduction crosses said yes
- The outcome is tamper-evident and verifies identically anywhere

Magician does this with:

- **trust/1 edges:** directed, decaying, register-labelled relationships
- **The router:** paths from the graph's owner, at most three hops, with the veil on
- **The consent machine:** every request lands `proposed`; only an edge's owner consents to crossing it
- **introduction/1:** a sealed outcome, sha256 over canonical JSON, no `node:` imports
- **Opaque decline:** a declined path is indistinguishable from one that never existed

## The Shape of the API

There is no `TrustGraph` class, no `Edge` class and no `sha256` export.
Everything is a pure function over plain objects, and the parsers **refuse,
never guess**: an unknown field, an unlabeled number, any spelling of expiry,
an intent with no wants — parse failure with the fix in the message.

A graph belongs to one owner (a `person/` id) and routing starts from them.
Ids are `kind/slug`: `person/`, `org/`, `circle/`, `cap/`. A capability is a
`cap/` tag on a person, never a node.

```javascript
import { parseGraph, parseIntent, findPaths } from '@magician-network/core'

// A trust/1 edge. Rated or shared edges must name at least one event they
// stand on; `renewed` is the decay clock. There is no `expires` field — a
// document carrying one fails the parse.
const edge = (from, to, value) => ({
  format: 'trust/1',
  from, to,
  tier: 'private',                                   // absent means private, never public
  domains: [],
  strength: { value, register: 'asserted' },         // measured | asserted | estimated, or unrated
  provenance: [{ kind: 'worked-with', at: '2026-03-01' }],
  asserted: '2026-03-01',
  renewed: '2026-09-01',
})

// Every persona here is fictional and says so — a demo graph mistakable for a
// real one is a fabricated claim about real people's relationships.
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
  wants: ['cap/gold-custody'],                       // required and non-empty: no wants, no routing
  opened: '2026-09-01',
})

const paths = findPaths(graph, intent)
// paths[0].hops.map((h) => h.node)  → ['person/bob', 'person/carol', 'person/dave']
// paths[0].trust                    → { value: 0.7, register: 'asserted' }  (the weakest hop, in the weakest register)
// paths[0].introductions            → 3
```

`parseGraph` takes JSON **text**, not an object, and refuses text containing
a credential shape — a relationship store must never double as a secret
store.

## Key Concepts

### Edge (trust/1)

A directed claim: Alice → Bob exists; Bob → Alice does not unless Bob asserts
it. An edge carries a `tier` (`private | circle | public`), domain claims with
their authority and register, a `strength` with its register, the provenance
events it stands on, and two dates: `asserted` and `renewed`.

Registers say how a figure is known — `measured`, `asserted`, `estimated` —
or `unrated`, which carries no number at all. An edge whose provenance is
hearsay alone is capped at `estimated` whatever it typed.

```javascript
import { parseTrustEdge, freshness, effectiveStrength } from '@magician-network/core'

const stale = parseTrustEdge({
  format: 'trust/1', from: 'person/alice', to: 'person/bob',
  domains: [], strength: { value: 0.9, register: 'measured' },
  provenance: [{ kind: 'transaction', at: '2025-05-01' }],
  asserted: '2025-05-01', renewed: '2025-05-01',
})

const now = new Date('2026-09-28T00:00:00Z')
freshness(stale, now)          // 'stale' — more than 365 days unrenewed
effectiveStrength(stale, now)  // { value: 0.9, register: 'estimated' } — it still routes, at no better than estimated

try {
  parseTrustEdge({ ...stale, expires: '2027-01-01' })
} catch (e) {
  e.message   // "trust/1: 'expires' is refused: decay is derived from 'renewed', never accepted as input. …"
}
```

### Graph

`{ format: 'magician-graph/1', owner, people, edges }`. Every edge endpoint
must be in `people`; duplicates are refused. `upsertEdge(graph, incoming,
now)` is a union that renews the clock and merges provenance — an unrated
incoming edge never overwrites a rating the existing edge earned.

### Intent

One sentence of what you need plus the `cap/` tags that make it routable.
`parseIntent` refuses text under 10 characters, an empty `wants`, and a want
that is not a `cap/` id.

### Path and Hop

`findPaths(graph, intent, now)` walks the owner's edges in both directions
(a reversed hop downgrades to `estimated`), at most `MAX_HOPS = 3`. A `Hop`
is `{ node, reversed, strength, consentOf }` — `consentOf` is the person
whose edge the hop crosses, which is the person who must say yes. Paths come
back ranked: match first, then fewest introductions, then trust.

### The Veil

Rendered for the requester, a path shows its first hop (your own edge) and
conceals every node past the consent frontier behind a domain hint.

```javascript
import { veilPath } from '@magician-network/core'

const [path] = findPaths(graph, intent)

veilPath(graph, path, new Set())
// hops[0] → { veiled: false, node: 'person/bob', name: 'Bob (demo)' }
// hops[1] → { veiled: true, hint: 'logistics' }
// hops[2] → { veiled: true, hint: 'gold-custody' }      targetVeiled: true

veilPath(graph, path, new Set(['person/alice', 'person/bob']))
// every hop visible: Alice's and Bob's consents open the frontier past Carol
```

### Sealed Outcome (introduction/1)

`{ format: 'introduction/1', intent, path, consents, outcome, sealedAt,
digest }`, where `digest` is the hex sha256 of the canonical JSON of
everything else. No `sha256:` prefix. `none` is a real outcome kind.

## Basic Operations

### Open a Request and Collect Consents

Every request lands `proposed`. There is no argument, flag or caller that
produces a consented hop directly.

```javascript
import { openRequest, requestState, consentHop, markIntroduced } from '@magician-network/core'

const [path] = findPaths(graph, intent)
let request = openRequest('req-1', intent.id, path, new Date())
// request.hops → [{ owner: 'person/alice', state: 'pending' },
//                 { owner: 'person/bob',   state: 'pending' },
//                 { owner: 'person/carol', state: 'pending' }]
requestState(request)   // 'proposed'

// Only the owner of an edge consents to crossing it — Alice for her own edge to Bob,
// Bob for his edge to Carol, Carol for hers to Dave.
request = consentHop(request, 'person/alice')
request = consentHop(request, 'person/bob')
request = consentHop(request, 'person/carol')
requestState(request)   // 'ready'

try {
  consentHop(request, 'person/dave')
} catch (e) {
  e.message   // 'consent: person/dave owns no pending hop on this request — only the owner of an edge consents to crossing it'
}

request = markIntroduced(request)   // throws unless every hop consented — there is no partial yes
requestState(request)               // 'introduced'
```

### Seal the Outcome

```javascript
import { sealOutcome, verifyIntroduction, appendOutcome } from '@magician-network/core'

const record = sealOutcome(request, intent, {
  kind: 'deal',                                          // meeting | deal | partnership | hire | financing | none
  note: 'Dave agreed to custody the settlement gold; terms signed 2026-09-20.',
})
// record.path    → ['person/bob', 'person/carol', 'person/dave']
// record.consents → [{ by: 'person/alice', at: '…' }, { by: 'person/bob', at: '…' }, { by: 'person/carol', at: '…' }]
// record.digest  → 64 hex characters

verifyIntroduction(record)   // true — recomputes the digest over the body

let log = []
log = appendOutcome(log, record)
try {
  appendOutcome(log, record)
} catch (e) {
  e.message   // 'introduction/1: digest … is already in the log — an emit is a union, never a replay'
}
```

`sealOutcome` throws unless the request is `introduced`: the seal follows the
event, never precedes it. `appendOutcome` refuses a record that does not
verify and a digest already in the log.

### Verify a Seal

`verifyIntroduction(record)` is the whole check. Anyone holding the record
can run it — the browser demo seals and verifies with the same code.

## Declined Introductions

A decline is silent. It kills the path, and the requester's view says
`unavailable` — never who declined, never that anyone did.

```javascript
import { declineHop, toRequesterView } from '@magician-network/core'

let declined = openRequest('req-2', intent.id, path, new Date())
declined = consentHop(declined, 'person/alice')
declined = declineHop(declined, 'person/bob')

requestState(declined)     // 'unavailable'
toRequesterView(declined)  // { id: 'req-2', state: 'unavailable' }
```

`toRequesterView` collapses decline and nonexistence into the same object,
and the package's test compares the two for deep equality. Private is
indistinguishable from missing; do not add a code path that lets a requester
tell them apart.

## Stale Edges

Trust is perishable. `FRESH_WITHIN_DAYS = 180`, `STALE_AFTER_DAYS = 365`;
both are constants, not configuration. A stale edge still routes — a
year-old relationship is a lead, not a lie — but contributes at no better
than `estimated`, and a path built on one says so in its own register. See
*Edge (trust/1)* above for `freshness` and `effectiveStrength`.

## Portability

Sealing is sorted-key JSON with no whitespace, hashed with a sha256
implemented in the package and pinned against `node:crypto` by test. The
package imports nothing from `node:`, so a record seals identically in Node,
CI and a browser.

```javascript
import { canonical, digestOf } from '@magician-network/core'

canonical({ b: 1, a: [2, 3] })   // '{"a":[2,3],"b":1}'
digestOf({ b: 1, a: [2, 3] })    // the same 64-hex digest on every platform
// undefined, NaN and functions are refusals, not coercions
```

## Learning and Standing

- `learnFromOutcome(graph, record)` returns a new graph: each edge on the
  sealed path gains an `introduction` provenance event and a renewed clock,
  and — for a non-`none` outcome only — a `measured` register. Values never
  change.
- `standingOf(graph, outcomes, personId)` counts domains from edges pointing
  **at** the person and sealed non-`none` outcomes routed through them.
  Nothing a person does alone moves either; a test proves it.

## Error Handling

There is no `MagicianError`. Parsers and the consent machine throw a plain
`Error` whose message starts with the format that refused — `trust/1:`,
`graph:`, `intent:`, `consent:`, `introduction/1:` — and says what to fix.
`findPaths` never throws for a missing route; it returns `[]`.

```javascript
const routes = findPaths(graph, parseIntent({
  id: 'biotech', text: 'Find a biotech co-founder for a diagnostics venture.',
  wants: ['cap/biotech'], opened: '2026-09-01',
}))
if (routes.length === 0) {
  // nobody in this graph answers for cap/biotech — the same answer a declined path gives
}
```

## House Rules

- **Declined is opaque.** `unavailable` is the only word the requester reads
- **Only the owner consents.** `consentOf` names them; nobody else's yes counts
- **The parser refuses; it does not guess.** Unknown fields, unlabeled numbers and any expiry field fail
- **Sealed means sealed.** Canonical JSON, portable sha256, append-only log, replays refused
- **Demo data is fictional and says so.** `demo: true` on every persona

## Next Steps

- Learn [FlashyID: Assertions and Delegated Authority](flashyid-oauth.md) — the identity seam `flashyIdProvider` binds to
- Read the [Combined Workflow](combined-workflow.md) to see a sealed introduction lead into a consented Rails transfer
- Read the [Magician API](../api/magician-api.md) for every export, measured against source
- [Local setup](setup-local.md) §4 says which [flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/03-magician-intro) run at these commits
