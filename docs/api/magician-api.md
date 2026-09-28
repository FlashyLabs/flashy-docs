# Magician API — `@magician-network/core`

The public surface of the Magician trust engine, as `packages/core/src/index.ts`
exports it: trust/1 edges, the router with the veil, the consent machine,
introduction/1 sealed outcomes, and contextual authority. Every name below is
an export of that file; every refusal is read from the parser that enforces
it. Where a guide in this repository disagrees with this page, this page was
measured and the guide was not.

Measured against magician at `f5c4fda` (branch `claude/dreamy-bell-2e5nq3`;
`packages/core/package.json` declares `@magician-network/core` `0.1.0`).
Repository: <https://github.com/FlashyLabs/magician>.

## Where it comes from

- A workspace package inside the `magician` monorepo, built with
  `npm run build` at the root (`packages/core/dist/`). It has no
  `publishConfig`; nothing in the checkout says it is on a registry. See
  [Local setup](../guides/setup-local.md).
- **Zero runtime dependencies and no `node:` imports.** sha256 is implemented
  in the package (`src/seal.ts`) and pinned against `node:crypto` by test, so
  a record seals identically in Node, CI and a browser.
- Everything is a pure function over plain objects. There is no `TrustGraph`
  class, no `Edge` class, no `MagicianError` and no `sha256` export.

```js
import { parseGraph, parseIntent, findPaths, openRequest, consentHop, markIntroduced, sealOutcome, verifyIntroduction } from '@magician-network/core'

const graph = parseGraph(graphJsonText)      // format 'magician-graph/1'; refuses, never guesses
const intent = parseIntent({
  id: 'india-robotics-jv', text: 'Find a robotics JV partner in Bangalore',
  wants: ['cap/robotics'], opened: '2026-09-01',
})
const [best] = findPaths(graph, intent)       // ranked; at most 3 hops
let request = openRequest('req-1', intent.id, best, new Date())
for (const hop of best.hops) request = consentHop(request, hop.consentOf)
request = markIntroduced(request)
const record = sealOutcome(request, intent, { kind: 'meeting', note: 'Met in Bangalore, 2026-09-14.' })
verifyIntroduction(record)                    // true
```

## Identifiers — `src/ids.ts`

`ID_KINDS = ['person', 'org', 'circle', 'cap']`. `parseId(raw)` → `{ kind,
slug, id }`; throws on a bare name (no `/`), an unknown kind, or a slug that is
not `^[a-z0-9][a-z0-9.-]*$`. `isKind(raw, kind)` never throws. A capability is
a `cap/` tag, never a node.

## Registers — `src/registers.ts`

Every number Magician shows carries how it knows.
`REGISTERS = ['measured', 'asserted', 'estimated', 'unrated']`;
`RATED_REGISTERS` is the first three. `weakest(...registers)` returns the
weakest (measured < asserted < estimated < unrated). A `Strength` is
`{ value: number | null, register }`, and `value === null` exactly when the
register is `unrated` on an edge. `isRegister`, `isRatedRegister`, `isUnrated`,
`strengthLabel`, `trustLabel` are helpers over those.

## trust/1 — `src/edge.ts`

```ts
interface TrustEdge {
  format: 'trust/1'; from: string; to: string
  tier: 'private' | 'circle' | 'public'          // absent means private
  domains: { domain: string; authority: 'exceptional' | 'strong' | 'emerging'; register: RatedRegister }[]
  strength: Strength
  provenance: { kind: 'transaction' | 'introduction' | 'invested' | 'worked-with' | 'hearsay'; at: string; note?: string }[]
  asserted: string; renewed: string              // ISO dates; renewed defaults to asserted
}
```

`parseTrustEdge(raw)` **refuses**:

- any of `expires`, `expiry`, `expiresAt`, `ttl` — decay is derived from
  `renewed`, never accepted as input;
- an unknown field unless it is `x-` prefixed;
- `format !== 'trust/1'`; `from === to`; a tier outside `TIERS`;
- a domain claim without a domain, with a numeric authority, or without a
  rated register;
- a strength value outside `[0, 1]`, an unlabeled number, or an `unrated`
  strength that carries a value;
- an empty `provenance` on any edge that is rated **or** shared — only a
  private, unrated edge may omit it.

An edge whose provenance is hearsay alone is capped at `estimated` whatever it
typed. Constants: `FRESH_WITHIN_DAYS = 180`, `STALE_AFTER_DAYS = 365`.
`freshness(edge, now)` → `'fresh' | 'aging' | 'stale'`. `effectiveStrength(edge,
now)`: stale contributes at `estimated`, aging at no better than `asserted`, an
unrated edge stays unrated.

## The graph — `src/graph.ts`

`parseGraph(rawText)` parses `{ format: 'magician-graph/1', owner, people,
edges }` from JSON text. It refuses text containing a credential shape
(GitHub tokens, `-----BEGIN … PRIVATE KEY-----`, AWS `AKIA…`, Slack `xox…`),
a non-`person/` owner, duplicate people, a capability that is not `cap/`, a
circle that is not `circle/`, an identity claim without issuer and register,
and any edge endpoint not in `people`. `upsertEdge(graph, incoming, now)` is a
union: it renews the clock and merges provenance, and an **unrated** incoming
edge never overwrites an existing rating, domains or tier. `personById(graph,
id)`.

## Intent — `src/intent.ts`

`parseIntent(raw)` → `{ id, text, wants, opened, status }`. Refuses a
non-slug id, text shorter than 10 characters, **an empty `wants`** (an intent
with no wants is invisible to routing), a want that is not `cap/`, a bad
`opened` date, a status outside `open | routed | done`.

## The router — `src/router.ts`

`MAX_HOPS = 3`. `findPaths(graph, intent, now)` walks the owner's edges in
both directions; a reversed hop's strength downgrades to `estimated`. Returns
`Path[]`: `{ target, hops: Hop[], trust, match, introductions }` where a hop
is `{ node, reversed, strength, consentOf }`. Path `trust` is the minimum over
rated hops in the weakest register seen, or `{ value: null, register:
'unrated' }` if any hop was unrated. `match` is the share of `wants` the
target answers for, register `asserted`. `findPathsTo(graph, targetIds, now)`
routes to specific people. `rankPaths(paths)` orders by match, then fewest
introductions, then trust (unrated last). `veilPath(graph, path, consented)`
renders for the requester: hop 1 is always visible; past the first unconsented
hop every node is replaced by a domain hint.

## The consent machine — `src/consent.ts`

Every request lands `proposed`; nothing constructs a consented hop directly.

| Export | Behaviour |
|---|---|
| `openRequest(id, intentId, path, now?)` | `{ id, intentId, nodes, hops: [{ owner: hop.consentOf, state: 'pending' }], openedAt? }`. |
| `requestState(r)` | `'unavailable'` if any hop declined, else `'introduced'`, `'ready'` (all consented), `'proposed'`. |
| `consentHop(r, by, now?)` / `declineHop(r, by, now?)` | Only the owner of a pending hop may answer; answering twice or answering someone else's hop throws. |
| `markIntroduced(r, now?)` | Throws unless every hop consented — there is no partial yes. |
| `toRequesterView(r)` | `{ id, state: 'in-progress' \| 'ready' \| 'introduced' \| 'unavailable' }`. A decline and a path that never existed are the same object; a test compares them for deep equality. |

## introduction/1 — `src/introduction.ts`, `src/seal.ts`

`OUTCOME_KINDS = ['meeting', 'deal', 'partnership', 'hire', 'financing', 'none']`
— `none` is a real outcome. `sealOutcome(request, intent, { kind, note }, now?)`
throws unless the request is `introduced`, the kind is known, and the note is
a non-empty sentence; returns an `IntroductionRecord` `{ format:
'introduction/1', intent, path, consents, outcome, sealedAt, digest }` where
`digest = digestOf(body)`. `verifyIntroduction(record)` recomputes it.
`appendOutcome(log, record)` refuses a record that does not verify and a digest
already in the log.

`canonical(value)` is sorted-key JSON with no whitespace; `undefined`, `NaN`
and functions are refusals, not coercions. `digestOf(value)` is the hex sha256
of `canonical(value)`. Digests carry no `sha256:` prefix.

## Standing, learning, explaining

- `standingOf(graph, outcomes, personId)` → `{ person, domains, routedOutcomes }`.
  Domains come only from edges pointing **at** the person; `routedOutcomes`
  counts sealed records whose path includes them and whose kind is not
  `none`. Nothing a person does alone moves either.
- `learnFromOutcome(graph, record)` → a new graph: each edge on the sealed
  path gains an `introduction` provenance event, a renewed clock, and — for a
  non-`none` outcome only — a `measured` register. The value never changes.
- `explainPath(graph, path, intent, now?)` → `string[]`, one deterministic,
  data-grounded line per hop.

## Signatures — `src/keys.ts`

WebCrypto ECDSA P-256 via `globalThis.crypto`. `generateKeypair()`,
`signSealed(doc, keypair, by)` (signs the document's `digest`), and
`verifySealed(doc)` → `'unsigned' | 'valid' | 'invalid'`. Signatures are
optional on every v1 format; a partial signature block is invalid, not
unsigned.

## Also exported, not described here

Read the named module before relying on it: the wire contract for the hosted
introduction API (`introductionApi.ts`: `parseOpenIntroduction`,
`parseHopAction`, `RequesterView`); the notary projection (`notary.ts`:
`introductionToLeaf`, `introductionLeaves`, `NOTARY_KIND`, `NOTARY_SOURCE` —
a leaf hashes the record's own `digest`, `kind` and `sealedAt`, never its
content); `federation.ts` (`buildBeacon`, `parseBeacon`, `probe`, `BANDS`);
`identity.ts` (`localIdentityProvider`, `flashyIdProvider`); `wants.ts`
(`suggestWants`, `vocabularyOf`); `mesh.ts`; `grants.ts`; `transport.ts`;
`baseline.ts`; `intelligence.ts`; `quickadd.ts`; `invite.ts`; `card.ts`;
`formats.ts`; `verify-format.ts`; and `demoGraph` / `DEMO_INTENT` from
`demo.ts`, whose every persona carries `demo: true`.

## Related

- [Magician Routing](../guides/magician-routing.md) — the concept walk-through
- [FlashyID API](flashyid-api.md) — the identity seam `identity.ts` binds to
- magician `docs/protocol/trust-1.md` and `docs/protocol/introduction-1.md`:
  the parser is the spec, and its test file is the conformance suite
