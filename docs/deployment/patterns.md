# Production Deployment Patterns

This guide covers common deployment patterns for Flashy services. These are reference patterns, not actual infrastructure setups—adapt them to your environment and risk profile.

## ⚠️ Before You Deploy

Every Flashy deployment must enforce:
1. **No secrets in code** — Use Secret Manager or environment variables
2. **Immutable audit trail** — Log every operation, never change history
3. **Immediate revocation** — Revoked grants refuse all ops instantly
4. **Explicit consent** — No auto-approval paths exist
5. **Sealed outcomes** — Use sha256 for all proofs (portable, not framework-specific)

## Pattern 1: Ledger-Only Deployment

**Use case:** Private ledger for internal settlement (no public routing).

```
Client App
    ↓
Ledger API
    ├── In-Memory Store (for development)
    ├── MongoDB (for staging/production)
    └── Postgres (for high-scale deployments)
```

**Key decisions:**
- **Store choice:** In-memory for testing, MongoDB for multi-tenant, Postgres for financial settlement
- **Replay semantics:** Store every operation; refuse replayed digests
- **Balance queries:** Always read from the store, never cache balances

**Minimal checklist:**
```javascript
// ✅ Deployment-ready Ledger
const ledger = new Ledger({
  store: mongoDbStore,        // durable, multi-tenant safe
  hashAlgorithm: 'sha256',    // portable
  disallowReplay: true,       // refuse replayed operations
  auditLog: {
    destination: 'cloudLogging',
    level: 'all'              // log every operation
  }
});
```

**Testing before deploy:**
```bash
# 1. Verify store durability (stop/restart, check recovery)
npm test tests/store-durability.test.mjs

# 2. Verify audit logging
npm test tests/audit-trail.test.mjs

# 3. Load test (1000 concurrent ops)
npm test tests/load-test.test.mjs
```

---

## Pattern 2: Rails + Ledger Deployment

**Use case:** Consent-gated transfers (requires both systems).

```
Client App
    ↓
Rails API (consent gate)
    ↓
Ledger API (settlement)
    ├── Store
    └── Audit Log
```

**Key decisions:**
- **Consent tokens:** Time-bound, single-use, cryptographically signed
- **Enforcement boundary:** Rails checks consent BEFORE calling Ledger
- **Error recovery:** If consensus succeeds but Ledger fails, record the failure and alert

**Minimal checklist:**
```javascript
// ✅ Deployment-ready Rails + Ledger
const rails = new Rails({
  ledger: ledgerInstance,
  consentTokenExpiry: 300,          // 5 minutes
  consentTokenAlgorithm: 'sha256',  // portable
  enforceConsent: true,             // no bypass paths
  auditLog: mongoDbAuditLog
});

// ✅ Every transfer requires consent
const draft = rails.draftTransfer({ ... });
const consentToken = await getApprovalFromHolder(draft);
const result = rails.execute(draft, consentToken);  // token validated here
```

**Testing before deploy:**
```bash
# 1. Verify consent enforcement
npm test tests/consent-required.test.mjs

# 2. Verify attenuation (grants narrow only)
npm test tests/attenuation-rules.test.mjs

# 3. Verify revocation is immediate
npm test tests/revocation-immediate.test.mjs
```

---

## Pattern 3: Magician Routing Deployment

**Use case:** Trust-routed introductions (requires graph storage).

```
Client App
    ↓
Magician Router
    ├── Graph Store (who trusts whom)
    ├── Consensus Collector (gather approvals from each hop)
    └── Sealing Engine (sha256)
```

**Key decisions:**
- **Graph storage:** MongoDB for multi-user graphs (with RLS/per-user isolation)
- **Consent collection:** Request consent from EVERY hop, not just entry/exit
- **Sealing:** Always use portable sha256; never framework-specific hashing

**Minimal checklist:**
```javascript
// ✅ Deployment-ready Magician
const router = new MagicianRouter({
  graphStore: mongoDbGraphStore,
  consentRequired: 'every_hop',        // collect from every hop
  sealingAlgorithm: 'sha256',          // portable
  declineOpacity: true,                // declined is opaque to requester
  auditLog: mongoDbAuditLog
});

// ✅ Route through trust graph
const route = router.findRoute(from, to, { maxHops: 5 });
const consent = await collectConsents(route);  // from every hop
const sealed = router.seal(route, consent);
```

**Testing before deploy:**
```bash
# 1. Verify decline opacity
npm test tests/decline-opaque.test.mjs

# 2. Verify consent on every hop
npm test tests/consent-every-hop.test.mjs

# 3. Verify sealing is portable
npm test tests/sealing-portable.test.mjs
```

---

## Pattern 4: FlashyID Deployment

**Use case:** OAuth 2.1 provider with delegated authority.

```
Client App
    ↓
FlashyID (OIDC Provider)
    ├── User Store (Telegram IDs, emails)
    ├── Grant Store (issued credentials)
    └── Revocation List (revoked grants)
```

**Key decisions:**
- **OAuth flow:** PKCE (Proof Key for Code Exchange), no implicit grant
- **Grant attenuation:** Child grants carry LESS authority than parent, never more
- **Revocation:** Revoked grants refuse all operations instantly (check at enforcement boundary)

**Minimal checklist:**
```javascript
// ✅ Deployment-ready FlashyID
const oidcProvider = new FlashyIDProvider({
  userStore: mongoDbUserStore,
  grantStore: mongoDbGrantStore,
  revocationList: redisRevocationList,    // fast revocation checks
  oauthFlow: 'PKCE',                      // PKCE only
  enforceAttenuation: true,               // grants narrow only
  auditLog: mongoDbAuditLog
});

// ✅ Child grant must narrow parent
const parentGrant = { cap: 1000, expiry: futureDate };
const childGrant = oidcProvider.attenuate(parentGrant, {
  cap: 500,    // narrower
  expiry: earlierDate  // earlier
});
// Refused: cap > 500 or expiry > earlierDate
```

**Testing before deploy:**
```bash
# 1. Verify PKCE enforced
npm test tests/pkce-required.test.mjs

# 2. Verify attenuation rules
npm test tests/grant-attenuation.test.mjs

# 3. Verify revocation is immediate
npm test tests/revocation-fast.test.mjs
```

---

## Pattern 5: Full Stack (Alice Pays Dave)

**Use case:** Complete integration of all four systems.

```
Alice                Bob                Carol              Dave
  |                   |                  |                |
  +---[FlashyID]------+------[Magician]--+---[Rails]------+
                            (routing)      (consent)
                            [Ledger] (settlement)
```

**The flow:**
1. **FlashyID:** Alice authenticates, gets grant with cap=50 USD
2. **Magician:** Router finds path Alice→Bob→Carol→Dave, collects consents
3. **Rails:** Each hop creates draft transfer, collects consent tokens
4. **Ledger:** Settlement recorded immutably, audit trail preserved

**Minimal checklist:**
```javascript
// ✅ Full stack deployment
const fullStack = {
  // 1. FlashyID authenticates
  flashyId: new FlashyIDProvider({ ... }),
  
  // 2. Magician routes through trust
  magician: new MagicianRouter({ ... }),
  
  // 3. Rails gates with consent
  rails: new Rails({ ... }),
  
  // 4. Ledger settles immutably
  ledger: new Ledger({ ... })
};

// Execution order matters
const session = await fullStack.flashyId.authenticate(aliceCredential);
const route = fullStack.magician.findRoute(alice, dave);
const consents = await collectConsents(route);
const draft = fullStack.rails.draftTransfer({ amount: 50, from: alice, to: dave });
const token = await getApproval(draft);
const result = fullStack.rails.execute(draft, token);
const settlement = await fullStack.ledger.record(result);
```

**Testing before deploy:**
```bash
# 1. End-to-end integration
npm test tests/e2e-alice-pays-dave.test.mjs

# 2. Audit trail is complete
npm test tests/full-audit-trail.test.mjs

# 3. All invariants hold
npm test tests/all-invariants.test.mjs
```

---

## Deployment Checklist

Before deploying any Flashy service:

### Security
- [ ] No secrets in code (all env vars or Secret Manager)
- [ ] Audit logging enabled and tested
- [ ] Rate limiting configured
- [ ] CORS properly scoped (no `*`)
- [ ] HTTPS enforced (production only)

### Reliability
- [ ] Store durability tested (stop/restart recovery)
- [ ] Replay refusal working (refuse duplicate operations)
- [ ] Audit trail persisted and queryable
- [ ] Monitoring/alerting wired (anomaly detection)
- [ ] Graceful shutdown (finish in-flight ops, then close)

### Correctness
- [ ] All invariants verified by test suite
- [ ] House rules enforced by linter
- [ ] No TODOs, FIXMEs in code
- [ ] Consent tokens validated on every request
- [ ] Revocation checked immediately

### Operations
- [ ] Run book documented (start, stop, recover)
- [ ] Alerts configured (error rate, latency, audit gaps)
- [ ] Backup/restore tested
- [ ] Rollback plan documented
- [ ] Incident response team briefed

---

## Common Pitfalls

### ❌ Pitfall 1: Caching Balances

**Wrong:**
```javascript
// ❌ Balance is stale after 1 second
const balance = await ledger.getBalance(user, asset);
cache.set(user + asset, balance, 60000);  // 1 minute cache
```

**Right:**
```javascript
// ✅ Always read from store
const balance = await ledger.getBalance(user, asset);  // fresh read
```

**Why:** Multi-user systems see rapid changes. A stale balance can authorize an overdraft.

### ❌ Pitfall 2: Auto-Approval Paths

**Wrong:**
```javascript
// ❌ No consent required
if (amount < 10) {
  rails.execute(draft);  // no token!
}
```

**Right:**
```javascript
// ✅ Consent always required
const token = await getApprovalFromHolder(draft);
rails.execute(draft, token);  // token validated
```

**Why:** The consent layer exists to prevent exactly this. No exception paths.

### ❌ Pitfall 3: Widening Grants

**Wrong:**
```javascript
// ❌ Grant widened
const parent = { cap: 100, expiry: futureDate };
const child = flashyId.attenuate(parent, {
  cap: 200,  // WIDENED!
  expiry: futureDate
});
```

**Right:**
```javascript
// ✅ Grant narrowed only
const child = flashyId.attenuate(parent, {
  cap: 50,       // narrower
  expiry: earlierDate  // earlier
});
```

**Why:** Delegation is attenuation. A child can never exceed the parent.

### ❌ Pitfall 4: Storing Secrets in Git

**Wrong:**
```bash
# ❌ Credential committed
echo "TELEGRAM_BOT_TOKEN=123456" > .env.production
git add .env.production
```

**Right:**
```bash
# ✅ Secret Manager only
# Do not commit .env files
echo ".env*" >> .gitignore
# Fetch from Secret Manager at runtime
const token = await secretManager.get('TELEGRAM_BOT_TOKEN');
```

**Why:** Credentials in git are burned forever (history keeps them).

---

## Resources

- [Ledger Design](../architecture/ledger-design.md)
- [Rails Consent](../architecture/rails-consent.md)
- [Magician Routing](../architecture/magician-routing.md)
- [FlashyID Identity](../architecture/flashyid-identity.md)
- [Working Examples](https://github.com/flashylabs/flashy-examples)

---

**Questions?** File an issue in [flashy-docs](https://github.com/flashylabs/flashy-docs/issues) or [flashy-examples](https://github.com/flashylabs/flashy-examples/issues).
