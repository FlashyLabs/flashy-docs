# Flashy Documentation Hub

Comprehensive guides and references for the Flashy ecosystem: Ledger, Rails, Magician, and FlashyID. Learn how the four systems integrate to build decentralized finance, consent-gated transfers, trust routing, and OAuth identity.

## Quick Start

**New to Flashy?** Start here:

1. [System Architecture](docs/architecture/overview.md) — understand how all four systems fit together
2. [Ledger Basics](docs/guides/ledger-101.md) — learn append-only settlement
3. [Rails Consent](docs/guides/rails-consent.md) — understand the approval gate
4. [Magician Trust](docs/guides/magician-routing.md) — discover trust graphs and routing
5. [FlashyID OAuth](docs/guides/flashyid-oauth.md) — learn OAuth 2.1 and delegation

## Documentation Structure

### Architecture ([docs/architecture/](docs/architecture/))
- **[overview.md](docs/architecture/overview.md)** — How all four systems work together; data flow diagrams
- **[ledger-design.md](docs/architecture/ledger-design.md)** — Append-only, multi-asset settlement engine
- **[rails-consent.md](docs/architecture/rails-consent.md)** — Consent gate and attenuation constraints
- **[magician-routing.md](docs/architecture/magician-routing.md)** — Trust graphs and introduction sealing
- **[flashyid-identity.md](docs/architecture/flashyid-identity.md)** — OAuth 2.1, delegation, and grant attenuation
- **[integration-patterns.md](docs/architecture/integration-patterns.md)** — How systems interact; session lifecycle

### Guides ([docs/guides/](docs/guides/))
- **[ledger-101.md](docs/guides/ledger-101.md)** — Asset registration, issuance, transfers, balance queries
- **[rails-consent.md](docs/guides/rails-consent.md)** — Draft, approve, execute; attenuation and revocation
- **[magician-routing.md](docs/guides/magician-routing.md)** — Building trust graphs, routing requests, sealing outcomes
- **[flashyid-oauth.md](docs/guides/flashyid-oauth.md)** — OAuth flow, token verification, delegation chains
- **[combined-workflow.md](docs/guides/combined-workflow.md)** — End-to-end example: Alice pays Dave through trust chain
- **[setup-local.md](docs/guides/setup-local.md)** — Local development environment setup

### API Reference ([docs/api/](docs/api/))
- **[ledger-api.md](docs/api/ledger-api.md)** — Ledger interface, methods, error codes
- **[rails-api.md](docs/api/rails-api.md)** — Rails interface, draft/execute flow, grant constraints
- **[magician-api.md](docs/api/magician-api.md)** — Router, graph construction, sealing
- **[flashyid-api.md](docs/api/flashyid-api.md)** — OAuth endpoints, token format, delegation

### Troubleshooting ([docs/troubleshooting/](docs/troubleshooting/))
- **[faq.md](docs/troubleshooting/faq.md)** — Common questions and answers
- **[debugging.md](docs/troubleshooting/debugging.md)** — Debugging techniques; logging strategies
- **[errors.md](docs/troubleshooting/errors.md)** — Error codes and how to resolve them
- **[performance.md](docs/troubleshooting/performance.md)** — Optimization tips; scaling considerations

### Deployment ([docs/deployment/](docs/deployment/))
- **[runbook.md](docs/deployment/runbook.md)** — Production deployment checklist
- **[security.md](docs/deployment/security.md)** — Security best practices; audit logging
- **[monitoring.md](docs/deployment/monitoring.md)** — Health checks; observability
- **[production-patterns.md](docs/deployment/production-patterns.md)** — Error recovery, rate limiting, audit trails

## Key Concepts

### Ledger
Append-only settlement engine. Every transaction is immutable, idempotent, and multi-asset. Holders are opaque identities; balances never go negative.

### Rails
Consent layer on Ledger. Value moves only with holder approval. Grants can be attenuated (scoped) but never widened. Revocation is immediate.

### Magician
Trust routing and introduction sealing. Builds graphs of edges between parties, routes introduction requests through them, and seals outcomes cryptographically (sha256).

### FlashyID
OAuth 2.1 and delegated authority. Issues verifiable credentials; delegation is attenuation (child can never hold authority parent lacks).

## Running the Examples

All concepts are taught through runnable examples in [flashy-examples](https://github.com/flashylabs/flashy-examples):

```bash
npm run examples:ledger           # Ledger basics
npm run examples:rails            # Rails consent
npm run examples:magician         # Magician routing
npm run examples:flashyid         # FlashyID OAuth
npm run examples:combined         # Combined workflow
npm test                          # All tests
```

## House Rules

**True in every Flashy repository:**

- Amounts are `Minor` (branded integer), never raw numbers. Convert with `toMinor()` / `toGold()`
- Consent is explicit; never auto-approve. Every Rails execution requires a consent token
- Grants narrow, never widen. Attenuation is the only allowed delegation operation
- Sealed means sealed. Outcomes use portable sha256; replayed digests are refused
- Identity is opaque. No hardcoded names; holders are unforgeable identifiers
- No unverified claims. Every number is measured, not assumed

## Repository Layout

```
.
├── README.md                 # You are here
├── CLAUDE.md                 # Repository rules
├── docs/
│   ├── architecture/         # System design
│   ├── guides/               # Tutorials and how-tos
│   ├── api/                  # API reference
│   ├── troubleshooting/      # FAQs and debugging
│   └── deployment/           # Production setup
└── examples/                 # Worked examples (linked to flashy-examples repo)
```

## Contributing

Documentation improvements welcome. Before opening a pull request:

- [ ] Examples run without errors
- [ ] Code samples type-check
- [ ] Lint passes: `npm run lint`
- [ ] Links are internal and valid
- [ ] No unverified audience claims or hardcoded figures

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

Apache-2.0. Holder: Flashy Labs.

---

**Quick Links:**
- [Ledger Repo](https://github.com/flashylabs/flashy-ledger)
- [Rails Repo](https://github.com/flashylabs/flashy-rails)
- [Magician Repo](https://github.com/flashylabs/magician)
- [FlashyID Repo](https://github.com/flashylabs/flashyid)
- [Examples Repo](https://github.com/flashylabs/flashy-examples)
