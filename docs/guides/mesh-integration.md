# Consuming the Mesh: Reading the Four Standards

How a reader folds the estate's published fragments — `intent/1`, `ritual/1`,
and the `aao/0.1` handshake — into one view, and the reachability rules that keep
that view honest. This is the *consumer* half of the standards; the producer
half is each format's own guide.

Working example:
[Example 14: Mesh Reference Consumer](https://github.com/flashylabs/flashy-examples/tree/main/examples/14-mesh-consumer).

## The shape of a consumer

The network read is **injected**, not hard-wired. That single decision is what
makes a consumer testable:

```javascript
// pure fold, injected read — the estate pattern everywhere
const report = await consume(fetcher, urls);
```

In production `fetcher` is an https client with a timeout and a response-size
cap; in tests it is an in-memory map. The fold (`consume`) never changes, so
every path is covered without egress — the same discipline that keeps the
Attendant's `handleUpdate` pure and the reason a request to a non-Telegram host
never lands mid-batch.

## The four findings, never collapsed

A source read is exactly one of four states. Conflating any two is the estate's
most expensive recurring bug:

| State | Wire fact | What it means | The mistake if collapsed |
| --- | --- | --- | --- |
| `ok` | 200 + valid fragment | Read it | — |
| `absent` | 404 | Publisher exists, nothing published here | Looks like an outage |
| `unreachable` | threw / null / non-200 | A fact about *our* connectivity | Looks like "published nothing" |
| `invalid` | not https, not JSON, unknown contract, cross-host redirect | Served something, not a fragment | Looks like `ok` or `absent` |

## Null is never zero

If **every** source of a kind is unreachable, its summary is `null` — never a
zeroed object. A zero is a claim about the network (twenty-six organisations
published nothing); `null` is the truth about this process (we could not reach
them). This is the exact failure that once shipped a mesh feature dead in
production with nothing red: a wrong URL and a real outage both rendered as an
empty count, indistinguishable from "the network is empty."

```javascript
report.ritual;   // { performed, witnessed, consecrated }  OR  null
report.note;     // says "null, not zero — a fact about connectivity" when null
```

## The fetch rules

- **https only.** A non-https URL is `invalid`, never fetched.
- **One redirect, same registrable domain.** `acme.com → www.acme.com` is the
  same publisher; `acme.com → other.com` is `invalid` — following it would let
  any domain borrow another's record.
- **A timeout and a size cap** (production `fetcher`) — an unbounded read is a
  denial-of-service the consumer inflicts on itself.

## Per-format folds

| Format | Producer guide | Consumer fold | Invariant preserved |
| --- | --- | --- | --- |
| `intent/1` | [IntentMesh Roadmaps](intentmesh-roadmaps.md) | merge + dedup by id | Only the public projection is served; private is indistinguishable from absent |
| `ritual/1` | [Rites](rites-witnessed-observances.md) | sum metrics with the raw count | The anti-metric: witnessed/consecrated never shown without `performed` |
| `aao/0.1` | [AAO Governance](aao-governance-conformance.md) | validate the handshake against the charter | Capabilities are the union of roles' `x-capability`, never restated |

## Where the fragments live

Each producer serves its fragment, whole and verbatim, at a well-known path:

- `intent/1` → `/.well-known/intent.json` (the public projection)
- `ritual/1` → `/.well-known/ritual.json`
- `aao/0.1` handshake → `/.well-known/flashyos.json` (derived from the charter)

A consumer discovers these from the estate Directory (each property names its
own surfaces), never from a hard-coded list — a list of the shapes we happen to
have seen reports every shape we have not as missing.

## Canonical schemas

The authoritative schemas live in each standard's own repository
(`intentmesh/schema/`, `Rites-Network/schema/`, the `@flashyos/aao` package), not
here. This guide and Example 14 validate *structurally* against the contract
field and the documented shape; when you need byte-level conformance, run the
vendored checker the producer publishes (`vendor-ritual.mjs check <url>`, `npx
@flashyos/conformance <domain>`), which fetches the live surface the way a
stranger would.

## The estate standards

| Standard | Format | Solves |
| --- | --- | --- |
| Trust Routing | `trust/1` | Consent paths through graphs (Magician) |
| Federated Roadmaps | `intent/1` | Roadmap visibility without logins (IntentMesh) |
| Witnessed Practice | `ritual/1` | Legible, witnessed practice (Rites) |
| Governance | `aao/0.1` | Machine-readable authority + conformance |

Consumed together, the estate is self-checking: authority is queryable, practice
is witnessed, intentions are discoverable, introductions are consent-gated — and
a reader can tell an outage from an empty network every time.
