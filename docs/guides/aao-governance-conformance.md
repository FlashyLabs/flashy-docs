# AAO: Machine-Readable Governance and Conformance

Learn AAO (Agentic Autonomous Organization), the `@flashyos/aao` manifest format and conformance suite that decides whether an organization of AI agents deserves the name — rather than being a product with agents bolted on.

> **Canon first.** This guide is a developer walkthrough. The authoritative
> sources are the AAO spec at [flashyos.com/aao](https://flashyos.com/aao), the
> naming standard at [flashyos.com/standard](https://flashyos.com/standard), and
> the `@flashyos/aao` package (developed in `FlashyLabs/flashyos` →
> `packages/aao`). Where this guide and the canon disagree, the canon wins.

## What Problem Does It Solve?

Several teams build organizations on FlashyOS independently — StartupOS,
PersonalOS, FinancialOS, and more. Each could reimplement identity, permissions,
approvals, and audit, and each would do it slightly differently. Nothing would
compose, and every one would need rewriting to combine.

AAO solves this with:
- **One manifest format** — every org declares roles, capabilities, and an accountable human the same way
- **Seven conformance checks** — a short, hard-to-grow contract that runs in each builder's CI
- **Capabilities that name actions** — `deploy`, `review`, never `engineering`
- **Approval thresholds where mistakes hurt** — money-touching roles gate; read-only roles don't
- **A reachable human at the top** — `accountableTo` is a real person, not a role

## The Seven Questions

AAO asks seven questions any organization must answer about an agent holding
credentials. Four are **static** (run from the manifest alone, no network) and
three are **live** (cannot be declared, only demonstrated):

| # | Question | Kind |
|---|----------|------|
| 1 | Are roles standing responsibilities, not codenames? | static |
| 2 | Do capabilities name actions, not departments? | static |
| 3 | Are approval thresholds placed where a mistake would hurt? | static |
| 4 | Is there a named, reachable human the org is accountable to? | static |
| 5 | Was each agent's authorizing human actually recorded? | live |
| 6 | Does revoking an agent actually stop it? | live |
| 7 | Does the org produce a real audit trail? | live |

The live three are **reported as deferred, never quietly dropped**. An org that
merely *claims* its agents are revocable has said nothing — the check runs
against the running system or it does not count.

## The Manifest

```jsonc
{
  "aao": "0.1",
  "name": "StartupOS",
  "slug": "startup-os",
  "description": "A five-agent company, governed from the first command.",
  "accountableTo": "you@example.com",   // question 4: a real, reachable human
  "roles": [
    {
      "name": "operations",             // a standing responsibility, never a person
      "purpose": "Runs the books, the calendar and the vendors.",
      "capabilities": ["schedule", "bookkeeping", "procure"],
      "humanApprovalAtOrAbove": "LOW"   // this role can spend money
    }
  ],
  "network": { "offers": ["research"], "wants": ["legal-review"] }
}
```

### Two Conventions Carry Most of the Value

**1. Capabilities name actions, not departments.**

```jsonc
// ✅ Enforceable — an endpoint can check "can this agent deploy?"
"capabilities": ["deploy", "review", "merge"]

// ❌ Unenforceable — "engineering" is not an action anything can gate
"capabilities": ["engineering", "operations"]
```

A capability that names an org unit can never be enforced. `deploy` maps to a
permission check; `engineering` maps to nothing.

**2. Approval thresholds go where a mistake would actually hurt.**

```jsonc
{
  "name": "research",
  "capabilities": ["read", "summarize"]
  // No humanApprovalAtOrAbove — read-only, nothing to gate
},
{
  "name": "treasury",
  "capabilities": ["transfer", "redeem"],
  "humanApprovalAtOrAbove": "LOW"  // anything touching money gates at every level
}
```

Uniform gates are how governance becomes theatre people route around. A
read-only role needs none; anything touching money needs one at every level.

## Naming: Roles, Not Codenames

One test governs every name on the network:

> **A person who has never met your organization opens the public directory,
> reads the role list, and knows what each one does — before clicking anything,
> and without a glossary.**

```
nova · hermes · aura · sage · atlas             five names, five questions
activation · retention · conversion · inbound   four names, no questions
```

Codenames force a glossary. Role names *are* the glossary. A charter with
`nova` and `hermes` fails; one with `activation` and `retention` passes.

### Empty Families Are a Feature

FlashyOS's own charter declares ten roles and leaves two role families
deliberately empty:

> Inventing a role to fill a family is the roster inflation this standard exists
> to stop.

An empty family says "we do not do this yet" honestly. A fabricated role to
fill it is the metric gamed rather than met.

## Conformance in CI

```bash
npx @flashyos/agent conform     # exits 1 on failure — run it in CI
```

Run it on every push. The static four run offline from the manifest; the live
three report deferred unless run against the running org.

The suite is **deliberately short and deliberately hard to grow**. It runs in
independent builders' CI, and every check added is a constraint on people who
don't work for you:

> A suite held together by a short contract survives; one held together by a
> long contract gets forked.

## Validation Concepts (Example 13)

[Example 13 in flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/13-aao-validation)
is a **simplified teaching model** — it validates a stripped-down charter shape
to demonstrate the validation *concepts* (explicit authority, closed member
lists, no dangling references, duplicate detection). It is **not** the canonical
`@flashyos/aao` manifest above; production conformance uses `npx @flashyos/agent
conform`.

The concepts it teaches transfer directly:

### Explicit Authority (No Implicit Permissions)

Every permission a role holds is listed. Nothing is inferred.

```javascript
const role = {
  id: 'role/admin',
  authority: ['can:write'],   // Explicitly named
  members: ['person/alice']   // Explicitly listed
};

// No implicit permissions — alice can write, nothing else
hasCap(charter, 'person/alice', 'can:write');   // true
hasCap(charter, 'person/alice', 'can:delete');  // false
```

### Closed Member Lists (Exhaustive)

"Not listed" means "does not have it." There is no wildcard, no inheritance.

```javascript
// Bob is not in the members list
hasCap(charter, 'person/bob', 'can:write');  // false
```

### No Dangling References

A capability that points at a role that does not exist is a validation error.

```javascript
const charter = {
  roles: [{ id: 'role/admin', /* ... */ }],
  capabilities: [
    { id: 'cap/x', role: 'role/nonexistent', action: 'can:write' }  // ❌
  ]
};

validateCharter(charter).valid;  // false — references non-existent role
```

### Duplicate Detection

Role IDs and capability IDs must be unique within a charter.

```javascript
const charter = {
  roles: [
    { id: 'role/admin', /* ... */ },
    { id: 'role/admin', /* ... */ }  // ❌ Duplicate
  ]
};

validateCharter(charter).valid;  // false — Duplicate role ID
```

## The Attenuation Connection

AAO governance composes with flashyID's delegation rule: **a grant may only ever
carry a subset of the granter's scopes.** A role cannot delegate authority it
does not hold, and a delegated grant cannot widen its parent.

```javascript
// A role with ['can:read', 'can:write'] can delegate:
//   ['can:read']            ✅ subset
//   ['can:write']           ✅ subset
//   ['can:read','can:write'] ✅ equal
//   ['can:delete']          ❌ not held — refused
```

This is why explicit authority matters: attenuation can only be checked against
an authority list that is complete and closed.

## Integration with the Flashy Estate

AAO is one of four interoperating standards:

| Standard | Format | Solves |
|----------|--------|--------|
| **Trust Routing** | `trust/1` | Consent paths through graphs (Magician) |
| **Federated Roadmaps** | `intent/1` | Roadmap visibility without logins (IntentMesh) |
| **Witnessed Observances** | `ritual/1` | Verifiable reputation/standing (Rites) |
| **Governance** | `aao/0.1` | Machine-readable authority + conformance |

They compose:
- **AAO** declares who may decide what (the authority source of truth)
- **Magician** routes introductions, honoring AAO consent boundaries
- **Rites** seals outcomes; AAO can require sealed events for a role
- **IntentMesh** publishes what the org intends; AAO says who may promote it

The org's mesh identity (`flashyos.roles.json`, the AAO charter) is the root:
the handshake at `public/.well-known/flashyos.json` is tested against it so the
two manifests cannot diverge.

## Real-World Example: A Five-Agent Company

StartupOS declares its charter, and a partner reads it before working together:

```jsonc
{
  "aao": "0.1",
  "name": "StartupOS",
  "slug": "startup-os",
  "accountableTo": "founder@startup.example",
  "roles": [
    { "name": "operations", "purpose": "Books, calendar, vendors.",
      "capabilities": ["schedule", "bookkeeping", "procure"],
      "humanApprovalAtOrAbove": "LOW" },
    { "name": "research", "purpose": "Market and technical reading.",
      "capabilities": ["read", "summarize"] },
    { "name": "release", "purpose": "Ships the product.",
      "capabilities": ["deploy", "rollback"],
      "humanApprovalAtOrAbove": "MEDIUM" }
  ],
  "network": { "offers": ["research"], "wants": ["legal-review"] }
}
```

A partner reads this and knows, without a meeting:
- Who to reach (`founder@startup.example`)
- What StartupOS can do (schedule, deploy, research…)
- Where money and shipping gate on a human
- What it offers the network (research) and wants (legal-review)

The partner's own charter offers `legal-review`. The match is discoverable from
two files — no onboarding call.

## Resources

- **AAO Spec:** [flashyos.com/aao](https://flashyos.com/aao)
- **Naming Standard:** [flashyos.com/standard](https://flashyos.com/standard)
- **What an AAO Is:** [gda.group answer](https://gda.group/answers/what-is-an-ai-autonomous-organization/)
- **Package:** `@flashyos/aao` (canonical source in `FlashyLabs/flashyos` → `packages/aao`)
- **A charter in production:** [flashyos.roles.json](https://github.com/FlashyLabs/flashyos/blob/main/flashyos.roles.json)
- **Teaching model:** [Example 13: AAO Validation](https://github.com/flashylabs/flashy-examples/tree/main/examples/13-aao-validation)

## Next Steps

1. **Write your manifest**: Start from the StartupOS shape; name roles as responsibilities
2. **Name capabilities as actions**: `deploy`, not `engineering`
3. **Gate where it hurts**: Approval thresholds on money and shipping, nowhere else
4. **Run conformance in CI**: `npx @flashyos/agent conform` on every push
5. **Publish your handshake**: `public/.well-known/flashyos.json`, tested against the charter

AAO turns governance from a document nobody reads into a manifest every partner,
agent, and CI run can check.
