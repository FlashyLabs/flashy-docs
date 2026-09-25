# Magician Routing: Trust-Based Introductions

Learn Magician, the trust routing and introduction sealing system. Build graphs of trust edges, route introductions through them, and seal outcomes cryptographically.

## What Problem Does It Solve?

You need to prove that:
- A chain of trust exists between two parties
- Every intermediate party consented to the introduction
- The introduction outcome is tamper-proof and portable

Magician solves this with:
- **Trust graphs:** Edges represent "I trust you" relationships
- **Routing:** Find paths through the graph (Alice → Bob → Carol → Dave)
- **Consent collection:** Every hop must explicitly approve
- **Sealing:** Cryptographic hash proves the introduction was genuinely consented to
- **Portability:** Seals verify identically on any platform (sha256, standard format)

## Key Concepts

### Edge
A directed trust relationship: "Alice trusts Bob."

```typescript
graph.addEdge(new Edge({
  from: 'user:alice',
  to: 'user:bob',
  tier: 'direct'  // or 'indirect', 'hearsay', 'estimated'
}));

// Alice → Bob exists
// But Bob → Alice does not (graph is directed)
```

Tiers represent confidence:
- `direct`: Direct relationship verified
- `indirect`: Through one intermediate
- `hearsay`: Unverified report
- `estimated`: Stale (>365 days unrenewed)

### Graph
A collection of edges forming a trust network.

```typescript
const graph = new TrustGraph();
graph.addEdge(new Edge({ from: 'alice', to: 'bob', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'bob', to: 'carol', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'carol', to: 'dave', tier: 'direct' }));

// Graph: Alice → Bob → Carol → Dave
```

### Route
A path through the graph from requester to target.

```typescript
const intro = graph.route({
  requester: 'user:alice',
  target: 'user:dave',
  reason: 'settlement'
});

// intro.route === ['user:alice', 'user:bob', 'user:carol', 'user:dave']
// intro.hops === 3
```

### Hop
An intermediate party in the route. Every hop must consent.

```typescript
// Route: Alice → Bob → Carol → Dave
// Hops (intermediates): [Bob, Carol]
// Alice (requester) and Dave (target) are not hops

// Consents required:
// 1. Bob: "I approve routing Alice to Carol"
// 2. Carol: "I approve routing Bob to Dave"
```

### Sealed Outcome
A cryptographic hash proving the introduction was consented to.

```typescript
const outcome = magician.sealIntroduction({
  requester: 'user:alice',
  target: 'user:dave',
  route: ['alice', 'bob', 'carol', 'dave'],
  consents: [bobConsent, carolConsent],
  sealed_at: Date.now()
});

// outcome.digest === "sha256:abc123..." (portable, tamper-proof)
```

## Basic Operations

### Build a Trust Graph

```typescript
import { TrustGraph, Edge } from '@magician-network/core';

const graph = new TrustGraph();

// Add edges (directed)
graph.addEdge(new Edge({ from: 'alice', to: 'bob', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'bob', to: 'carol', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'carol', to: 'dave', tier: 'direct' }));
```

### Route an Introduction

```typescript
const intro = graph.route({
  requester: 'user:alice',
  target: 'user:dave',
  reason: 'settlement'
});

if (!intro.route || intro.route.length === 0) {
  console.error("No trust path exists");
} else {
  console.log(`Route found: ${intro.route.join(' → ')}`);
  // "Route found: alice → bob → carol → dave"
}
```

### Collect Consents

```typescript
// Bob consents to route Alice to Carol
const bobConsent = magician.collectConsent({
  hop: 'user:bob',
  previous: 'user:alice',
  next: 'user:carol'
});

// Carol consents to route Bob to Dave
const carolConsent = magician.collectConsent({
  hop: 'user:carol',
  previous: 'user:bob',
  next: 'user:dave'
});
```

### Seal the Outcome

```typescript
const sealed = magician.sealIntroduction({
  requester: 'user:alice',
  target: 'user:dave',
  route: ['alice', 'bob', 'carol', 'dave'],
  consents: [bobConsent, carolConsent],
  sealed_at: Date.now()
});

console.log(sealed.digest);
// "sha256:abc123def456..."
```

### Verify a Seal

```typescript
const isValid = magician.verifySealing({
  digest: sealed.digest,
  route: sealed.route,
  consents: sealed.consents
});

console.log(isValid); // true
```

## Example: Complete Introduction

```typescript
import { TrustGraph, Edge } from '@magician-network/core';

// Build graph: Alice → Bob → Carol → Dave
const graph = new TrustGraph();
graph.addEdge(new Edge({ from: 'alice', to: 'bob', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'bob', to: 'carol', tier: 'direct' }));
graph.addEdge(new Edge({ from: 'carol', to: 'dave', tier: 'direct' }));

// Route
const intro = graph.route({
  requester: 'user:alice',
  target: 'user:dave',
  reason: 'settlement'
});

if (!intro.route) {
  console.error("No path");
} else {
  // Collect consents
  const bobConsent = magician.collectConsent({
    hop: 'bob',
    previous: 'alice',
    next: 'carol'
  });

  const carolConsent = magician.collectConsent({
    hop: 'carol',
    previous: 'bob',
    next: 'dave'
  });

  // Seal
  const sealed = magician.sealIntroduction({
    requester: 'alice',
    target: 'dave',
    route: intro.route,
    consents: [bobConsent, carolConsent],
    sealed_at: Date.now()
  });

  // Verify
  const valid = magician.verifySealing({
    digest: sealed.digest,
    route: sealed.route,
    consents: sealed.consents
  });

  console.log(`Introduction sealed and verified: ${valid}`);
}
```

## Declined Introductions

If an intermediate declines, the requester learns only: "No path" (not "declined").

```typescript
// Bob declines
const bob_declines = null;

// From Alice's perspective:
const intro = graph.route({
  requester: 'alice',
  target: 'dave'
});

console.log(intro.route);
// null or empty (Alice can't tell if path doesn't exist or was declined)
// Private is indistinguishable from missing
```

## Stale Edges

Edges older than 365 days contribute at reduced tier.

```typescript
const edge = new Edge({
  from: 'alice',
  to: 'bob',
  tier: 'direct',
  renewed: Date.now() - (400 * 24 * 60 * 60 * 1000) // 400 days ago
});

// Tier degrades: direct → indirect or indirect → estimated
graph.addEdge(edge);

const intro = graph.route({ requester: 'alice', target: 'bob' });
// Route may not exist or may be at reduced confidence
```

## Portability

Seals are portable (verify identically on any platform).

```typescript
// Node.js
const sealed1 = magician.sealIntroduction({...});

// Browser (different platform, same code)
const sealed2 = magician.sealIntroduction({...});

console.log(sealed1.digest === sealed2.digest); // true
```

Sealing uses canonical JSON and portable sha256 (no platform-specific crypto).

## Error Handling

```typescript
try {
  const intro = graph.route({
    requester: 'alice',
    target: 'dave'
  });
  
  if (!intro.route) {
    console.error("No trust path exists");
  }
} catch (e) {
  if (e.code === 'INVALID_GRAPH') {
    console.error("Graph is malformed");
  }
}
```

## House Rules

- **Declined is opaque.** Requester can't tell path doesn't exist from declined
- **Seals are portable.** Use canonical JSON; verify on any platform
- **No hardcoded identities.** Use unforgeable holder IDs
- **Every hop consents.** No partial approvals; introduction requires all hops

## Testing Invariants

Tests verify:
- ✅ Route exists through graph
- ✅ Route doesn't exist when no path
- ✅ Declined route is opaque to requester
- ✅ Seal is tamper-proof
- ✅ Seal is portable (same hash on any platform)
- ✅ Stale edges degrade tier

Run examples:
```bash
npm run examples:magician
npm test examples/03-magician-intro
```

## Next Steps

- Try the [Magician Example](../../examples/03-magician-intro) and run its tests
- Learn [FlashyID OAuth](flashyid-oauth.md) to add delegated authority
- Read [Magician Routing](../architecture/magician-routing.md) for internals
