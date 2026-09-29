# On the FlashyOS mesh

Flashy Docs is a library on the FlashyOS mesh — an installable package with a hand-enumerated API and a release ledger.

Its AAO charter is [`flashyos.roles.json`](flashyos.roles.json) — the single source the mesh
handshake and the directory fragment derive from, so two hand-written files can
never disagree. It declares **five roles**, and five roles are five agents:

| Role | Family | Human approval at/above | What it is accountable for |
|---|---|---|---|
| `maintainer` | engineering | HIGH | Owns the library’s correctness and its public API. |
| `review` | governance | HIGH | Reviews a change before it lands, because a signature change breaks every consumer that embeds this package. |
| `release` | operations | MEDIUM | Versions and publishes to the registry, proving the package importable both ways before it ships and recording the release in the ledger. |
| `conformance` | engineering | LOW | Runs the tests, the typecheck and the lint, and holds coverage to the threshold CI fails on. |
| `adoption` | growth | LOW | Helps a consumer integrate and records real usage, so a claim of adoption is a number somebody measured rather than assumed. |

The charter validates against the estate's dependency-free AAO checker:

```bash
node vendor-aao-check.mjs validate flashyos.roles.json   # 0 issues
```

**Becoming a live organisation.** The charter is what a live org is provisioned
from. From a machine that holds `DATABASE_URL`:

```bash
npx tsx packages/api/scripts/provision-org-from-charter.ts \
  --charter flashyos.roles.json --tier FREE
```

The FREE tier allows five agents, which is exactly this charter's five roles.
Provisioning is a database write a person runs; committing the charter is the
half a repository can hold. The authoritative conformance check runs against the
live domain after deploy: `npx @flashyos/conformance <domain> --level 2`.

`directory.fragment.json` is this org's `directory/1` node: the org, one agent
per role, and the accountable person.
