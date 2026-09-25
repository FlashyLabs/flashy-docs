# IntentMesh: Federated Organization Roadmaps

Learn IntentMesh, the `intent/1` format for publishing and merging organization roadmaps without requiring a central login or registry.

## What Problem Does It Solve?

You need to:
- Publish what your organization plans to build next
- Discover what other organizations are building
- Understand overlapping work without meetings
- Keep roadmaps current (stale intentions decay automatically)

IntentMesh solves this with:
- **One file per org** — published at `https://yourcompany.com/.well-known/intent.json`
- **Merge-safe** — readers combine roadmaps from multiple sources
- **Decay by design** — intentions expire unless restated
- **Human-gated publishing** — agents can draft, only humans can promote to public
- **No registry** — two organizations reading each other's files is the network

## Key Concepts

### Intent Item

A single planned initiative or task.

```javascript
{
  id: "intent/acme/settlement-rails",
  kind: "initiative",  // initiative | task | research
  title: "Settlement rails for cross-border payouts",
  status: "open",      // open | blocked | paused | shipped
  wants: ["payments", "compliance"],  // capabilities this enables
  visibility: "public",  // public | partner | private
  expires: "2026-12-24T23:59:59Z"    // computed from kind
}
```

**Important:** Expiry is **computed from kind**, never accepted as input:
- **initiative**: expires in 90 days
- **task**: expires in 30 days
- **research**: expires in 60 days

This prevents stale intentions from lingering forever. An intention that nobody restates stops being evidence.

### Fragment

One organization's complete intent declaration.

```javascript
{
  "intent": "1",
  "source": "repo/acme",
  "org": "org/acme",
  "generated": "2026-09-25T18:00:00Z",
  "items": [
    { /* intent item 1 */ },
    { /* intent item 2 */ }
  ]
}
```

### Two Key Invariants

**1. Visibility is enforced structurally (no parameter).**

```javascript
// Agent-safe: no way to override to public
const draft = file({
  id: 'intent/acme/something',
  kind: 'initiative',
  title: '...',
  status: 'open',
  wants: ['x']
  // Note: no 'visibility' parameter exists
});

console.log(draft.visibility);  // 'private' — always
```

**2. Promotion requires human signature (person/, never agent/).**

```javascript
// Only people can publish
const published = promote(draft, {
  by: 'person/alice',  // Must start with 'person/'
  to: 'public'
});

// This throws: agents cannot publish
promote(draft, { by: 'agent/bot', to: 'public' });  // ❌ Error
```

## Basic Operations

### Create an Intent

```javascript
import { file } from 'intentmesh';

const item = file({
  id: 'intent/acme/settlement-rails',
  kind: 'initiative',
  title: 'Settlement rails for cross-border payouts',
  status: 'open',
  wants: ['payments', 'compliance']
});

console.log(item.visibility);  // 'private'
console.log(item.expires);     // ~90 days from now
```

### Promote to Public

```javascript
import { promote } from 'intentmesh';

const published = promote(item, {
  by: 'person/alice',
  to: 'public'
});

console.log(published.visibility);  // 'public'
console.log(published.promotedBy);  // 'person/alice'
```

### Create a Fragment

```javascript
const fragment = {
  intent: '1',
  source: 'repo/acme',
  org: 'org/acme',
  generated: new Date().toISOString(),
  items: [
    promote(item1, { by: 'person/alice', to: 'public' }),
    promote(item2, { by: 'person/bob', to: 'public' }),
    item3  // Keep private
  ]
};
```

### Merge Multiple Fragments

```javascript
import { merge } from 'intentmesh';

const { intents, problems } = merge([
  acmeFragment,
  bigcorpFragment,
  partnerFragment
]);

if (problems.length > 0) {
  console.log('Merge issues:');
  problems.forEach(p => console.log(`  - ${p}`));
}

console.log(`Total intents: ${intents.length}`);
```

### Filter by Visibility

```javascript
import { view } from 'intentmesh';

const publicIntents = view(intents, 'public');
const privateIntents = view(intents, 'private');
const all = view(intents, 'all');
```

### Query by Capabilities

```javascript
// Find all intents that require "payments"
const paymentIntents = intents.filter(i => i.wants.includes('payments'));

// Group by status
const byStatus = intents.reduce((acc, i) => {
  acc[i.status] = (acc[i.status] || []).concat(i);
  return acc;
}, {});

console.log(`${byStatus.open.length} open initiatives`);
```

## Handling Expiry

Expiry is **computed automatically**. You never input it:

```javascript
const task = file({
  kind: 'task',        // Expires in 30 days
  title: '...',
  status: 'open',
  wants: ['x']
});

const initiative = file({
  kind: 'initiative',  // Expires in 90 days
  title: '...',
  status: 'open',
  wants: ['x']
});

const research = file({
  kind: 'research',    // Expires in 60 days
  title: '...',
  status: 'open',
  wants: ['x']
});
```

**Why computed expiry?** If callers could set their own expiry, they'd keep stale intentions alive forever. A decay rule nobody controls is what stops a backlog nobody believes from deceiving you.

## Publishing Your Own Fragment

### 1. Adopt IntentMesh

```bash
npx intentmesh adopt
```

This creates `.intent/config.json` and a GitHub Actions workflow.

### 2. Create Your Intents

```bash
npx intentmesh file --id settlement-rails --kind initiative \
  --title "Settlement rails for payouts" \
  --wants payments compliance
```

### 3. Promote to Public

```bash
npx intentmesh promote intent/you/settlement-rails --by person/your-id --to public
```

### 4. Emit Your Fragment

```bash
npx intentmesh emit
```

This generates `intent.fragment.json` (private working file) and the public projection.

### 5. Publish to Your Domain

The fragment is served at `https://yourcompany.com/.well-known/intent.json` automatically (via your CI workflow).

### 6. Verify It's Reachable

```bash
npx intentmesh verify yourcompany.com
```

This is the reference consumer: it fetches your intent from the live domain the way a stranger would.

## Real-World Example

### Scenario: Two Organizations Discover Overlapping Work

**ACME Corp's roadmap:**
- Settlement rails (initiative, open)
- Audit log (task, open)
- Consensus research (research, open)

**BigCorp's roadmap:**
- DeFi integration (initiative, open)
- OIDC provider (task, blocked)

**Without IntentMesh:** Partnership conversation starts from zero. "What are you building?" "What are you building?" "Let's sync in a week."

**With IntentMesh:**
```javascript
import { merge, view } from 'intentmesh';

// Fetch both roadmaps
const acmeResponse = await fetch('https://acme.com/.well-known/intent.json');
const bigcorpResponse = await fetch('https://bigcorp.com/.well-known/intent.json');

const acmeFragment = await acmeResponse.json();
const bigcorpFragment = await bigcorpResponse.json();

// Merge them
const { intents } = merge([acmeFragment, bigcorpFragment]);

// Query
const publicIntents = view(intents, 'public');
const paymentFocused = publicIntents.filter(i => i.wants.includes('payments'));

// Result: ACME's settlement rails appear
// "Oh, you're building that too? Let's talk."
```

**Partnership conversation starts from a shared understanding.**

## Integration with Flashy Estate

IntentMesh is one of four standards:

| Standard | Format | Solves |
|----------|--------|--------|
| **Trust Routing** | `trust/1` | Consent paths through graphs (Magician) |
| **Federated Roadmaps** | `intent/1` | Roadmap visibility without logins (IntentMesh) |
| **Witnessed Observances** | `ritual/1` | Verifiable reputation/standing (Rites) |
| **Governance** | `aao/1` | Machine-readable authority (GDA-OS) |

See [Example 11: IntentMesh Roadmaps](https://github.com/flashylabs/flashy-examples/tree/main/examples/11-intentmesh) for working code.

## Resources

- **Full Spec:** [IntentMesh SPEC.md](https://github.com/FlashyLabs/intentmesh/blob/main/SPEC.md)
- **Adoption Guide:** `npx intentmesh --help`
- **Reference Implementation:** [intentmesh CLI](https://github.com/FlashyLabs/intentmesh)
- **Live Example:** `https://flashygroup.com/.well-known/intent.json`

