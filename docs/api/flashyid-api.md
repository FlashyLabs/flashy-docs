# FlashyID API — `@flashyid/sdk`

The public surface of the Flashy ID SDK, the relying-party and issuer library
for Flashy ID assertions and the delegated authority they carry, as
`packages/sdk/src/index.ts` exports it. The export list is pinned by
`packages/sdk/src/public-api.test.ts`, which fails on any export added or
removed; this page follows that list. Where a guide in this repository
disagrees with this page, this page was measured and the guide was not.

Measured against flashyid at `536b5c6` (branch `claude/dreamy-bell-2e5nq3`;
`packages/sdk/package.json` declares `@flashyid/sdk` `0.1.1`). Repository:
<https://github.com/FlashyLabs/flashyid>.

## Where it comes from

- `packages/sdk/` inside the flashyid repository. The repository root
  `package.json` also carries the name `@flashyid/sdk` (version `1.0.0`) but
  is the OIDC **provider** — an `oidc-provider` Express service — not the
  library. The SDK is the `packages/sdk` manifest.
- Node `>=18`, ESM with a CommonJS build. One runtime dependency: `jose`.
- `publishConfig.access` is `public` and a tag-triggered publish workflow
  exists (`docs/publishing-flashyid-sdk.md`); whether a given version is on
  the public registry is not something this checkout can confirm. See
  [Local setup](../guides/setup-local.md).
- The SDK does not implement an OAuth client. There is no `FlashyIDClient`,
  no `FlashyID` class, no `authorizeUrl`, no `exchangeCode`, no `mintGrant`.
  Login flows are the provider's (`/authorize`, `/token`, `/jwks` from
  `oidc-provider`); the SDK **verifies** what the provider signs.

```js
import { authorize } from '@flashyid/sdk'

const out = await authorize(jws, { scope: 'payment.execute', amount: 1240 }, {
  issuer: 'https://id.flashyid.com',
  audience: yourClientId,
  nowSec: Math.floor(Date.now() / 1000),
  trustedRoots, // optional: the accountableTo of every charter you federate with
})

if (out === null) {
  // not genuinely from Flashy ID -> 401
} else if (out.result.ok) {
  // authorised: out.result.scp, .res, .lim, .exp, .holder, .root
} else {
  // genuine but refused -> 403; out.result.code says why
}
```

## The relying-party surface — `src/sdk/verify.ts`

```ts
interface VerifyOptions { issuer: string; audience: string; getKey?: JWTVerifyGetKey | KeyLike | Uint8Array }
interface FlashyIdAssertion { sub: string; del?: GrantChain; claims: Record<string, unknown> }
```

| Export | Behaviour |
|---|---|
| `verifyAssertion(token, opts)` → `Promise<FlashyIdAssertion \| null>` | Verifies signature, `iss`, `aud`, `exp` with `jose`'s `jwtVerify`. The key set defaults to `${issuer}/.well-known/jwks.json`, fetched and cached per issuer. **Never throws**: a missing, malformed, expired, wrong-issuer, wrong-audience or badly-signed token is `null`. A `del` claim that is not a well-formed `GrantChain` is dropped (`del: undefined`) but stays visible in `claims`. |
| `authorize(token, demand, opts & { nowSec, revokedJtis?, trustedRoots? })` → `Promise<{ assertion, result: GrantResult } \| null>` | `null` when the assertion does not verify. Otherwise refuses `empty_chain` (no `del`), `broken_chain` (a malformed `del`, or a chain whose leaf holder is not the assertion's `sub`), whatever `verifyChain` refuses, `untrusted_root` when `trustedRoots` is set and the root is not in it (checked **before** the mandate, so an untrusted root is never masked as a missing scope), and then whatever `permits` refuses. On success `result` is the `EffectiveGrant`. |

## The issuer surface — `src/sdk/sign.ts`

`signAssertion({ privateKey, issuer, audience, subject, delegation?,
expiresInSec = 3600, jti?, kid?, extraClaims?, iatSec? })` → compact JWS with
`alg: 'EdDSA'`, `iss`, `aud`, `sub`, `iat`, `exp`, optional `jti`, and `del`
when a delegation is given. Anything it signs, `verifyAssertion` accepts given
the matching public key; the round trip is the SDK's own test.

## The grant kernel — `src/grants/`

Pure functions over a delegation **chain**. Time is an argument, never read
from a clock.

```ts
interface GrantLink { iss: string; sub: string; scp: string[]; res: string[]; lim: Limit; iat: number; exp: number; jti: string }
type GrantChain = GrantLink[]                                   // root-first; chain[0].iss is the accountable human
interface Limit { approval_at_or_above?: Impact; spend_max?: number }
const IMPACT_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
interface EffectiveGrant { ok: true; root; holder; scp; res; lim; exp; chain: string[] }
interface Refusal { ok: false; code: RefusalCode; at?: number; detail?: string }
interface Demand { scope: string; resource?: string; amount?: number; impact?: Impact }
```

| Export | Behaviour |
|---|---|
| `issueRoot({ rootHuman, holder, scp, res, lim?, iat, exp, jti })` | A one-link chain issued by the accountable human. |
| `attenuate(chain, { holder, scp?, res?, lim?, iat, exp, jti })` → `GrantChain \| Refusal` | Appends a link whose `iss` is the parent's `sub`. Refuses `chain_widened` when `scp` or `res` is not a subset of the parent's, or `lim` is looser (a raised approval bar, a dropped bar the parent had, a higher or dropped `spend_max`). Expiry is the one field **capped** rather than refused: `min(exp, parent.exp)`. |
| `verifyChain(chain, nowSec, revokedJtis = new Set())` → `GrantResult` | `empty_chain`; `revoked` (any link, ancestor-first); `expired` when `link.exp <= nowSec`; `broken_chain` when `link.iss !== parent.sub`; `chain_widened` at any hop, independent of how the chain was built. Effective limit is the tightest across the chain, effective expiry the minimum. |
| `permits(effective, demand)` → `true \| Refusal` | `out_of_mandate` for a scope not granted, a resource not granted, or `amount > lim.spend_max`; `approval_required` when `demand.impact` is at or above `lim.approval_at_or_above`. `true` means *proceed without a co-signature*. |
| `rootsWithin(effective, trustedRoots)` → `true \| Refusal` | `untrusted_root` unless `effective.root` is in the set. An empty set refuses every chain. |
| `impactRank(i)`, `IMPACT_ORDER` | The severity ladder the approval bar is measured on. |

### Refusal codes

| Code | Meaning |
|---|---|
| `chain_widened` | a link grants more scope, resource, or a looser limit than its parent |
| `broken_chain` | a link's issuer is not the holder above it; the leaf holder is not the assertion's subject; or `del` is malformed |
| `expired` | a link is past its expiry at `nowSec` |
| `revoked` | a link, or one above it, is in `revokedJtis` |
| `out_of_mandate` | scope, resource or spend exceeds the chain's effective grant |
| `approval_required` | in mandate but at or above the human-approval bar |
| `scope_unmapped` | a charter capability maps to no registered scope |
| `untrusted_root` | sound, but rooted at a principal this party did not agree to accept |
| `empty_chain` | no links |

### The charter is the grant — `src/grants/fromCharter.ts`, `src/init/charterGrants.ts`

`grantFromCharterRole({ accountableTo, role: { name, capabilities,
humanApprovalAtOrAbove?, worksIn? }, holder, iat, exp, jti, scopeRegistry? })`
→ `GrantChain | Refusal`: `capabilities → scp`, `worksIn → res`,
`humanApprovalAtOrAbove → lim.approval_at_or_above`, `accountableTo → root`.
With a `scopeRegistry`, an unmapped capability refuses `scope_unmapped` rather
than passing through. `grantsFromCharter(charter, opts)`,
`summarizeGrants(result, nowSec)` and `trustedRootsFromCharters(charters)` (the
set of every charter's `accountableTo`) sit over it; the `flashyid init`
command (`bin: flashyid`) reads `./flashyos.roles.json` through them.

## The enforcement gate — `src/enforce/gate.ts`

| Export | Behaviour |
|---|---|
| `evaluateGrant(chain, demand, { nowSec, revokedJtis? })` → `{ action: 'ALLOW' \| 'ESCALATE' \| 'DENY', reason?, code?, escalateAtOrAbove? }` | Pure. `verifyChain` then `permits`. Exactly one refusal, `approval_required`, becomes `ESCALATE` (with the bar); every other refusal is `DENY` with its code. |
| `grantAdapter()` | An `EnforcementAdapter` backed by `evaluateGrant`. |
| `recordOnly` | The default adapter: always `ALLOW`. |
| `enforce(decision, adapter, { timeoutMs = 5000, onUnavailable? })` | Runs the adapter under `withTimeout`; on a throw or timeout falls back to `ALLOW` (recorded only) and calls `onUnavailable(error)`. |
| `withTimeout(promise, ms)` | Rejects after `ms`. |

Full contract: `packages/sdk/docs/enforcement-gate.md` in flashyid.

## Agent subjects — `src/grants/subject.ts`

A machine authenticates as `agent:<org>/<name>`, both halves bare lowercase
slugs (`AGENT_SUBJECT`). `agentSubject(org, name)` throws on a malformed half;
`parseAgentSubject(s)` → `{ org, name } | null`; `isAgentSubject(s)`;
`fromDirectoryId('agent/<org>-<name>', orgSlug)` and `toDirectoryId(subject)`
bridge to the estate directory's `agent/` records and return `null` rather than
guess.

## Rail tokens — `src/rail/tokens.ts`

The three tokens Flashy Rails verifies ([Rails API](rails-api.md)), minted
with `signAssertion` under a `RailSigner { privateKey, issuer, audience, kid?,
iatSec? }`:

| Export | Claims | Default `exp` |
|---|---|---|
| `mintIssuerToken(signer, { subject, scope?, expiresInSec?, jti? })` | `scope: ['rewards:issue']` by default | 300 s |
| `mintConsentToken(signer, { draftId, holderId, action, approvedAt?, expiresInSec?, jti? })` | `typ: 'consent'`, `draftId`, `holderId`, `action`, `approvedAt` (ISO); `sub = holderId` | 120 s |
| `mintGrantToken(signer, { grantId, holderId, spenderId, assetId, capMinor, remainingMinor?, purpose, expiresAt?, revoked?, parentGrantId?, expiresInSec? })` | `typ: 'grant'` and the rail's flat grant fields; `jti = grantId` | 300 s |
| `railGrantFromChain(signer, chain, { grantId, assetId, purpose, nowSec?, requireScope?, expiresInSec? })` | Folds a chain with `verifyChain` and mints a grant token with **`holderId = root`, `spenderId = leaf holder`, `capMinor = lim.spend_max`, `expiresAt = effective exp`**. Throws on an unsound chain, a missing required scope, or a chain with no `spend_max` — an uncapped grant never becomes an uncapped rail draw. | 300 s |

## Related

- [FlashyID OAuth](../guides/flashyid-oauth.md) — the concept walk-through
- [Rails API](rails-api.md) — what the rail does with a verified token
- [Magician API](magician-api.md) — `flashyIdProvider`, the identity seam
- flashyid `docs/rail-issuance.md`, `docs/rail-consent.md`, `docs/rail-grant.md`
