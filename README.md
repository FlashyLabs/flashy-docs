⚡ **FLASHY DOCUMENTATION** — The Complete Reference for a Consent-Gated Economy

> Everything you need to understand, build, and deploy the Flashy ecosystem. From core concepts to production patterns.

Comprehensive guides and references for Ledger, Rails, Magician, and FlashyID. Learn how the four systems integrate to build decentralized finance, consent-gated transfers, trust routing, and OAuth identity.

## 🚀 Quick Start (30 minutes)

**New to Flashy?** Read in this order:

1. ⚡ [System Architecture](docs/architecture/overview.md) (10 min) — How all four systems fit together
2. 📊 [Ledger Basics](docs/guides/ledger-101.md) (5 min) — Append-only settlement
3. ✅ [Rails Consent](docs/guides/rails-consent.md) (5 min) — The approval gate
4. 🧭 [Magician Trust](docs/guides/magician-routing.md) (5 min) — Trust graphs and routing
5. 🔐 [FlashyID OAuth](docs/guides/flashyid-oauth.md) (5 min) — Identity and delegation

**Then run the [working examples](https://github.com/flashylabs/flashy-examples):**
```bash
npm install && npm run examples:ledger
npm run examples:rails
npm run examples:magician
npm run examples:flashyid
npm run examples:combined
```

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

## 🏗️ The Four Systems at a Glance

| System | What It Does | Invariant |
|--------|-------------|-----------|
| **📊 Ledger** | Multi-asset settlement engine (append-only, immutable) | Balance never goes negative |
| **✅ Rails** | Consent-gated transfers with attenuation | Value never moves without approval |
| **🧭 Magician** | Trust routing and sealed introductions | Declined intro is opaque to requester |
| **🔐 FlashyID** | OAuth 2.1 with delegated authority | Grants narrow only, never widen |

All four systems work together — FlashyID authenticates, Magician routes through trust, Rails gates the transfer, Ledger records it immutably.

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
