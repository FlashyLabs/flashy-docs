# FlashyID: Assertions and Delegated Authority

Learn `@flashyid/sdk`, the relying-party and issuer library for Flashy ID.
It answers two questions from one import — *is this assertion genuinely from
Flashy ID?* and *does the delegation it carries authorise this action?* — and
holds the grant kernel in which delegation is always attenuation. Every name
below is an export pinned by `packages/sdk/src/public-api.test.ts`; the
signatures are the [FlashyID API](../api/flashyid-api.md) page's.

Measured against flashyid at `a2706c0` (branch `claude/dreamy-bell-2e5nq3`;
`packages/sdk/src` is byte-identical to the `536b5c6` the API page measured —
the one commit between them renames the root package to the server and fixes
repository docs).

## First, What the SDK Is Not

**The SDK is not an OAuth client.** There is no `FlashyIDClient`, no
`FlashyID` class, no `authorizeUrl`, no `exchangeCode`, no `mintGrant`, no
`resolveChain`. Earlier versions of this guide described those; none exists.

Login lives in the **provider**: the flashyid repository's root is an
`oidc-provider` service on Express (`src/server.ts`), issuer
`https://id.flashyid.com`. It serves the standard OpenID Connect discovery
document at `/.well-known/openid-configuration`, which names its
authorization, token and JWKS endpoints; the interaction flow (`/interaction`)
is where a person signs in. A web app that wants "log in with Flashy ID"
uses any OIDC client against that discovery document. The SDK's job starts
after that: it **verifies** what the provider signs, and it evaluates the
delegation chain an assertion carries.

## What Problem Does It Solve?

- **Authenticity:** is this token really from Flashy ID, for me, and unexpired?
- **Authority:** does the delegation chain in it permit *this* scope, on *this* resource, for *this* amount?
- **Attenuation:** a chain only narrows — no link grants more than the one above it
- **Revocation:** a revoked link kills everything delegated from it
- **Portability:** the grant kernel is pure, so issuer, relying party and auditor reach the same decision

## Key Concepts

### Assertion

An OIDC-shaped EdDSA JWS: `iss`, `aud`, `sub`, `iat`, `exp`, optional `jti`,
and `del` — the delegation chain the subject acts under. `verifyAssertion`
checks signature, issuer, audience and expiry against the issuer's JWKS
(default `${issuer}/.well-known/jwks.json`, fetched and cached) and **never
throws**: a bad token is `null`, which a relying party turns into a 401.

```javascript
import { verifyAssertion } from '@flashyid/sdk'

const assertion = await verifyAssertion(bearerToken, {
  issuer: 'https://id.flashyid.com',
  audience: 'my-relying-party',        // must equal the token's aud
})

if (assertion === null) {
  // missing, malformed, expired, wrong issuer, wrong audience or bad signature → 401
} else {
  assertion.sub      // the acting principal
  assertion.del      // the GrantChain, root-first — or undefined if absent or malformed
  assertion.claims   // every verified claim, for anything the typed surface does not name
}
```

The verify path holds no secret. A relying party can check an assertion; it
can never mint one.

### Grant Chain

A grant is not a single token; it is a **chain** of links, root-first.
`chain[0].iss` is the accountable human (a charter's `accountableTo`); every
link below is an attenuation handed from one holder to the next.

```javascript
import { issueRoot, attenuate, agentSubject } from '@flashyid/sdk'

const nowSec = Math.floor(Date.now() / 1000)
const day = 86_400

// Alice, the accountable human, issues the root to herself: spend up to 100.00 FG (10000 minor)
const root = issueRoot({
  rootHuman: 'person/alice', holder: 'person/alice',
  scp: ['payment.execute'], res: ['rail:flashy-gold'],
  lim: { spend_max: 10000, approval_at_or_above: 'HIGH' },
  iat: nowSec, exp: nowSec + 7 * day, jti: 'g_root',
})

// She delegates to her agent — a machine subject, agent:<org>/<name> — narrowing the cap
const chain = attenuate(root, {
  holder: agentSubject('alice-office', 'settler'),   // 'agent:alice-office/settler'
  lim: { spend_max: 5000, approval_at_or_above: 'HIGH' },
  iat: nowSec, exp: nowSec + 30 * day,               // capped to the parent's: min(exp, parent.exp)
  jti: 'g_agent',
})
```

Each link carries `scp` (scopes), `res` (resource patterns), `lim`
(`spend_max` in minor units, `approval_at_or_above` on the impact ladder
`LOW < MEDIUM < HIGH < CRITICAL`), `iat`, `exp`, `jti`.

### Attenuation

`attenuate` **returns** a chain or a `Refusal` — it does not throw. Scope or
resource outside the parent's, or a looser limit (a raised approval bar, a
dropped bar the parent had, a higher or dropped `spend_max`), refuses
`chain_widened`. Expiry is the one field capped rather than refused.

```javascript
const widened = attenuate(chain, {
  holder: 'agent:alice-office/other',
  lim: { spend_max: 20000, approval_at_or_above: 'HIGH' },   // more than the parent's 5000
  iat: nowSec, exp: nowSec + day, jti: 'g_wide',
})

Array.isArray(widened)   // false — it is a Refusal
widened.code             // 'chain_widened'
widened.at               // 2: the index the offending link would have had
widened.detail           // 'limit loosened'
```

`verifyChain` enforces the same rule at every hop independently of how the
chain was built, so a chain widened by any other route is caught on
verification.

### Verification and Revocation

`verifyChain(chain, nowSec, revokedJtis)` checks revocation (ancestor-first),
expiry, continuity (`link.iss === parent.sub`) and narrowing, and folds the
chain to an `EffectiveGrant`: the tightest limit, the earliest expiry, the
leaf holder, the accountable root.

```javascript
import { verifyChain } from '@flashyid/sdk'

const effective = verifyChain(chain, nowSec)
// { ok: true, root: 'person/alice', holder: 'agent:alice-office/settler',
//   scp: ['payment.execute'], res: ['rail:flashy-gold'],
//   lim: { spend_max: 5000, approval_at_or_above: 'HIGH' }, exp: …, chain: ['g_root', 'g_agent'] }

// Revocation walks down: revoking the root kills the agent's link too
verifyChain(chain, nowSec, new Set(['g_root']))   // { ok: false, code: 'revoked', at: 0 }
verifyChain(chain, nowSec + 8 * day)              // { ok: false, code: 'expired', at: 0 }
```

Time is an argument, never a clock, so an auditor re-checking a historical
decision evaluates it at the time it was made. The SDK carries no revocation
list of its own: the relying party supplies the `jti`s it has learned are
revoked, and where that set lives is its decision.

### Mandate

`permits(effective, demand)` asks whether a sound chain authorises *this*
action: `out_of_mandate` for a scope, resource or amount not granted;
`approval_required` when the demand's `impact` is at or above the effective
approval bar. `true` means *proceed without a co-signature*.

```javascript
import { permits } from '@flashyid/sdk'

permits(effective, { scope: 'payment.execute', resource: 'rail:flashy-gold', amount: 2500 })   // true
permits(effective, { scope: 'payment.execute', amount: 9000 })                                 // { ok: false, code: 'out_of_mandate', detail: 'amount exceeds spend_max' }
permits(effective, { scope: 'payment.execute', amount: 100, impact: 'HIGH' })                  // { ok: false, code: 'approval_required', … }
permits(effective, { scope: 'admin.write' })                                                  // { ok: false, code: 'out_of_mandate', … }
```

## Basic Operations

### Authorise a Request

`authorize` is the whole relying-party check in one call: verify the
assertion, require a `del`, verify the chain, require its leaf holder to be
the assertion's `sub`, pin the root, then check the mandate.

```javascript
import { authorize } from '@flashyid/sdk'

const out = await authorize(bearerToken, { scope: 'payment.execute', resource: 'rail:flashy-gold', amount: 2500 }, {
  issuer: 'https://id.flashyid.com',
  audience: 'my-relying-party',
  nowSec: Math.floor(Date.now() / 1000),
  revokedJtis: new Set(),                 // what this party has learned is revoked
  trustedRoots: ['person/alice'],         // the accountableTo of every charter you federate with
})

if (out === null) {
  // not genuinely from Flashy ID → 401
} else if (out.result.ok) {
  // authorised: out.result is the EffectiveGrant; out.assertion.sub is who acted
} else {
  // genuine but refused → 403; out.result.code says why:
  // empty_chain | broken_chain | expired | revoked | chain_widened | untrusted_root | out_of_mandate | approval_required
}
```

`trustedRoots` is checked **before** the mandate, so an untrusted root is
never masked as a missing scope. An empty set trusts nobody and refuses every
chain — the safe direction for a party that forgot to configure its roots.

### Enforce Before Minting

Identity that nothing checks is theatre. The enforcement gate maps
`verifyChain` + `permits` onto the three answers a caller can act on, and
exactly one refusal — `approval_required` — becomes `ESCALATE`.

```javascript
import { evaluateGrant, enforce, grantAdapter } from '@flashyid/sdk'

evaluateGrant(chain, { scope: 'payment.execute', amount: 2500 }, { nowSec })
// { action: 'ALLOW' }
evaluateGrant(chain, { scope: 'payment.execute', amount: 2500, impact: 'CRITICAL' }, { nowSec })
// { action: 'ESCALATE', escalateAtOrAbove: 'HIGH', reason: '…' } — in mandate, but a named human must co-sign
evaluateGrant(chain, { scope: 'payment.execute', amount: 9000 }, { nowSec })
// { action: 'DENY', code: 'out_of_mandate', reason: 'amount exceeds spend_max' }

// The async wrapper runs an adapter under a timeout; unreachable → ALLOW recorded only, and onUnavailable fires
const decision = await enforce(
  { chain, demand: { scope: 'payment.execute', amount: 2500 }, nowSec },
  grantAdapter(),
  { timeoutMs: 5000, onUnavailable: (err) => console.error('enforcement adapter unavailable', err) },
)
```

Run the gate before the thing it protects. Never ship a way to mint authority
ahead of the check that enforces it.

### Issue an Assertion (Issuer Side)

`signAssertion` is the complement of `verifyAssertion`: anything it signs,
the verifier accepts given the matching public key. The round trip below is
the SDK's own test, with a throwaway key from `jose` (the SDK's one
dependency).

```javascript
import { generateKeyPair } from 'jose'
import { signAssertion, verifyAssertion } from '@flashyid/sdk'

const { privateKey, publicKey } = await generateKeyPair('EdDSA')   // in production the key never leaves flashyID

const jws = await signAssertion({
  privateKey,
  issuer: 'https://id.flashyid.com',
  audience: 'my-relying-party',
  subject: 'agent:alice-office/settler',
  delegation: chain,                       // lands in `del`
  expiresInSec: 3600,
  jti: 'a_1',
})

const back = await verifyAssertion(jws, {
  issuer: 'https://id.flashyid.com',
  audience: 'my-relying-party',
  getKey: publicKey,                       // injectable for tests; defaults to the issuer's JWKS
})
back.sub                                   // 'agent:alice-office/settler'
back.del.length                            // 2
```

### The Charter Is the Grant

An AAO charter's roles map straight onto chains: `capabilities → scp`,
`worksIn → res`, `humanApprovalAtOrAbove → lim.approval_at_or_above`,
`accountableTo → root`. `grantFromCharterRole`, `grantsFromCharter` and
`trustedRootsFromCharters` do the mapping, and the `flashyid init` command
(`bin: flashyid`) reads `./flashyos.roles.json` through them. A capability
that maps to no registered scope refuses `scope_unmapped` rather than
passing through.

## Rail Tokens

Flashy Rails verifies three token shapes, and flashyID mints them with
`signAssertion` under a `RailSigner { privateKey, issuer, audience, kid? }`:

```javascript
import { mintIssuerToken, mintConsentToken, mintGrantToken, railGrantFromChain } from '@flashyid/sdk'

const signer = { privateKey, issuer: 'https://id.flashyid.com', audience: 'https://rails.example' }

// earn(): a privileged service credential, scope rewards:issue, 300 s by default
const issuerJws = await mintIssuerToken(signer, { subject: 'org/flashy-settlement' })

// execute(): a holder's consent to ONE rail draft — typ 'consent', 120 s by default
const consentJws = await mintConsentToken(signer, {
  draftId: 'transfer:payment:p_1', holderId: 'h_2c91', action: 'transfer', approvedAt: new Date(),
})

// spendUnderGrant(): the rail's flat, capped grant — typ 'grant', jti = grantId
const grantJws = await mintGrantToken(signer, {
  grantId: 'g_bob', holderId: 'h_2c91', spenderId: 'h_bob',
  assetId: 'flashy-gold', capMinor: 5000, purpose: 'purchases',
})

// Or fold a delegation chain onto the rail's grant: holderId = root, spenderId = leaf holder,
// capMinor = effective spend_max, expiresAt = effective exp. Throws on an unsound chain or one with no spend ceiling.
const fromChain = await railGrantFromChain(signer, chain, { grantId: 'g_agent', assetId: 'flashy-gold', purpose: 'purchases' })
```

The rail's `FlashyIdVerifier` checks each against flashyID's JWKS and maps
the claims onto the `Consent` / `Grant` shapes described in
[Rails Consent](rails-consent.md). The consent mint is deliberately **not** a
callable endpoint on the provider: a consent a caller can request is the
auto-approval the consent layer exists to refuse.

## Error Handling

The SDK refuses with **values**, not exceptions: `verifyAssertion` and
`authorize` return `null` for an inauthentic token; `attenuate`,
`verifyChain`, `permits` and `rootsWithin` return a `Refusal` `{ ok: false,
code, at?, detail? }`. The only throws are `agentSubject` on a malformed slug
and `railGrantFromChain` on an unsound or uncapped chain.

| Code | Meaning |
|---|---|
| `empty_chain` | no links |
| `broken_chain` | an issuer is not the holder above it; the leaf is not the assertion's `sub`; or `del` is malformed |
| `chain_widened` | a link grants more scope, resource or a looser limit than its parent |
| `expired` | a link is past its expiry at `nowSec` |
| `revoked` | a link, or one above it, is in `revokedJtis` |
| `untrusted_root` | sound, but rooted at a principal this party did not agree to accept |
| `out_of_mandate` | scope, resource or spend exceeds the effective grant |
| `approval_required` | in mandate, but at or above the human-approval bar |
| `scope_unmapped` | a charter capability maps to no registered scope |

## House Rules

- **Attenuation only.** A chain only narrows; `attenuate` refuses and `verifyChain` re-checks
- **Enforcement before minting.** `evaluateGrant` / `authorize` run before the action they protect
- **Assertions bind subject to holder.** The chain's leaf must be the assertion's `sub`; verify the chain, not just the signature
- **Pin your roots.** A sound chain can root anywhere; `trustedRoots` says whose authority you accept
- **Time is an argument.** `nowSec` in, never a clock read

## Next Steps

- Read the [Combined Workflow](combined-workflow.md) to see a chain become a rail grant beside a sealed introduction
- Read the [FlashyID API](../api/flashyid-api.md) for every export, measured against source; the provider's own `docs/rail-issuance.md`, `docs/rail-consent.md` and `docs/rail-grant.md` cover the token contracts
- [Local setup](setup-local.md) §4 says which [flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/04-flashyid-oauth) run at these commits
