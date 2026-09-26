# Rites: Witnessed Observances (`ritual/1`)

Learn Rites, the `ritual/1` format — the estate's "present tense." It records the
recurring, witnessed, consequence-bearing act: a practice happening now, on a
rhythm a stranger can check.

> **Canon first.** The authoritative source is
> [`Rites-Network/SPEC.md`](https://github.com/FlashyLabs/Rites-Network/blob/main/SPEC.md).
> Where this guide and the spec disagree, the spec wins.

## Three Tenses

The estate keeps three tenses, shaped differently on purpose:

| Tense | Format | What it holds |
|-------|--------|---------------|
| **Future** | `backlog/1` | What is intended (decays unless restated) |
| **Present** | `ritual/1` | What is practised now (a rhythm that holds) |
| **Past** | `shipped/1` | What was done (sealed, never decays) |

An intention decays unless somebody restates it. A fact about the past is sealed
and never decays. Neither fits a *practice*: a practice is a rhythm, and its
evidence is that the rhythm holds. `ritual/1` gives that practice a first-class
record.

## What Problem Does It Solve?

A repository whose emitters refresh its fragments every day is *practising*
something — but the estate could only see that practice by its side effects.
`ritual/1` makes the practice legible:
- **Liturgies** declare a recurring rite on a shared cadence
- **Observances** record each performance, with evidence a stranger can open
- A **state ladder** (`performed → witnessed → consecrated`) is climbed by
  transition, never by assertion
- The log is **append-only** — a correction is a new observance, never an edit

## The Four Refusals That Outrank Everything

**1. Agents observe; humans consecrate.** A `performer` is an `agent/` id acting
`for` an `org/` or `person/` who answers. A `consecration.by` is a `person/` id
and nothing else. There is no code path by which an agent approves an observance
into consequence.

**2. Standing comes from what others assert, never from unilateral activity.**
Standing accrues from *consecrated observances witnessed by others* — never from
a subject's own activity. (This is inherited Magician doctrine.)

**3. Reward is a different format.** Accrual against consecrated observances
belongs in `reward/1`, where the caps live. Keeping the two apart means the
coupling must be *written* by somebody rather than merely permitted:

> An observance that could carry its own reward is a slot machine with
> liturgical vocabulary.

A `ritual/1` observance therefore carries **no amount, no gold, no value** — only
what happened, its evidence, and who witnessed it.

**4. The log is append-only.** A correction is a new observance whose
`supersedes` names the old one and whose state is `void`. Nothing is edited;
nothing is deleted. A `void` that names nothing is a deletion with better
manners, and the validator says so.

## The Shape

A fragment is one subject's calendar: the liturgies it publishes and the
observances performed against them.

```json
{
  "contract": "ritual/1",
  "subject": "org/ritualos",
  "generated": "2026-09-01T06:00:00Z",
  "liturgies": [
    {
      "id": "daily-office",
      "title": "The Daily Office",
      "cadence": "daily",
      "rite": ["refresh the fragment", "seal the log", "dispatch to the merge"],
      "published_by": "person/michael",
      "since": "2026-09-01T00:00:00Z"
    }
  ],
  "observances": [
    {
      "id": "obs-2026-09-01-flashyos",
      "liturgy": "daily-office",
      "performer": "agent/flashyos-ci",
      "for": "org/flashyos",
      "at": "2026-09-01T04:23:00Z",
      "recorded": "2026-09-01T04:23:07Z",
      "evidence": "https://github.com/FlashyLabs/flashyos/actions/runs/17284",
      "state": "witnessed",
      "witness": {
        "by": "org/gda-capital",
        "basis": "https://gda.group/.well-known/flashyos-directory.json",
        "at": "2026-09-01T05:00:00Z"
      }
    }
  ]
}
```

### A Liturgy

| Field | Rule |
|-------|------|
| `id` | Unique within the fragment |
| `title` | Required — a name a person recognises |
| `cadence` | One of `daily`, `weekly`, `monthly`, `seasonal`, `once`. A closed list, so a new rhythm is a decision |
| `rite` | A non-empty list of steps. A liturgy with no rite is a name with no practice |
| `published_by` | A `person/` id. Publishing a liturgy asks agents to act, and a person answers for the asking |
| `since` | ISO timestamp |

### An Observance

| Field | Rule |
|-------|------|
| `id` | Unique within the fragment — append-only; a correction is a new observance |
| `liturgy` | Must name a liturgy in this fragment. An observance of nothing is activity, not practice |
| `performer` | An `agent/` id. A person's own act is work, recorded in `shipped/1`; `ritual/1` records what agents observe |
| `for` | An `org/` or `person/` id — the principal who answers |
| `at` / `recorded` | ISO timestamps; `recorded` may not precede `at` |
| `evidence` | An `https://` URL a stranger can open. Without one the observance is a claim, and this format does not carry claims |
| `state` | `performed` → `witnessed` → `consecrated`, or `void`. No state is skippable upward; a `performed` observance carrying a witness or consecration block is refused |
| `witness` | Required from `witnessed` up: `{ by, basis, at }`. `by` is an `org/` or `person/` that is **neither the performer nor its principal**; `basis` is the witness's **own** `https://` URL |
| `consecration` | Required at `consecrated`: `{ by, at }`. `by` is a `person/` id |
| `supersedes` | Required when `void`; must name another observance in this log |

## The State Ladder

```
performed  →  witnessed  →  consecrated
                                 ↓
                              (or) void
```

Each transition adds a block and cannot be skipped:

- **performed**: The performer (an agent) did the rite. Evidence URL required.
- **witnessed**: A third party — not the performer, not its principal — attests
  it, from their *own* URL. This is what makes witness independent.
- **consecrated**: A human (`person/`) confers consequence. Only now does the
  observance count toward standing.
- **void**: A correction. `supersedes` names the observance it replaces.

A `performed` observance that arrives carrying a witness block is **refused** —
the ladder is climbed by transition, never by assertion. You cannot declare
yourself witnessed; someone else must witness you.

## Why Independent Witness Matters

The witness `by` must be **neither the performer nor its principal**, and
`basis` must be the witness's **own** URL:

```json
"witness": {
  "by": "org/gda-capital",                                   // not org/flashyos
  "basis": "https://gda.group/.well-known/flashyos-directory.json",  // gda's URL
  "at": "2026-09-01T05:00:00Z"
}
```

If the witness could cite the performer's URL, the performer would be witnessing
itself with an extra step. Requiring the witness's own URL means the attestation
is anchored to a party that answers separately.

## Metrics, the Anti-Metric, and the Projection

Standing must be legible without being gameable. Two functions carry that, and
[Example 12 in flashy-examples](https://github.com/flashylabs/flashy-examples/tree/main/examples/12-rites)
implements both.

**Metrics ship the witnessed share with the raw count.** `metrics()` returns
`witnessed` and `consecrated` *beside* `performed`, so a renderer cannot show the
flattering number alone. Raw observance volume is the anti-metric — the number a
faucet inflates:

```javascript
metrics(fragment);
// { performed: 30, witnessed: 28, consecrated: 26 }
```

**The projection keeps the evidence and carries a note.** `project()` returns the
fragment whole — evidence URLs intact — plus a note a renderer may not drop,
stating how many observances carry consequence. A summary that stripped the
evidence URLs and kept the flattering digits would be the anti-metric rule run
backwards:

```javascript
project(fragment).note;
// "26 of 30 observances carry consequence (consecrated); 28 witnessed."
```

A practising subject serves its fragment — whole and verbatim — at
`/.well-known/ritual.json` (exported as `WELL_KNOWN`). `node vendor-ritual.mjs
check <https://domain>` fetches and validates the served copy the way a stranger
would.

> **Sealing is a version 2 candidate, not part of `ritual/1` today.** The spec
> (§7) is explicit: no sealing, no checkpoint leaves, no cross-fragment witness
> federation yet. When sealing lands, an observance becomes a `checkpoint/1`
> leaf and it will *reuse* the shared canonicalisation in `@flashyos/verify`
> rather than restating it — sealing rules are shared, never re-implemented per
> format.

## Real-World Example: A Daily Practice

RitualOS publishes a liturgy — a daily rite its CI performs — and each day's run
is an observance climbing the ladder:

**Day 1, the CI runs (performed):**
```json
{
  "id": "obs-2026-09-01-ritualos",
  "liturgy": "daily-office",
  "performer": "agent/ritualos-ci",
  "for": "org/ritualos",
  "at": "2026-09-01T04:00:00Z",
  "recorded": "2026-09-01T04:00:05Z",
  "evidence": "https://github.com/FlashyLabs/ritualos/actions/runs/9001",
  "state": "performed"
}
```

**A third party attests it (witnessed):** GDA Capital, from its own directory
URL, confirms the run happened. The observance transitions to `witnessed`.

**A human confers consequence (consecrated):** `person/michael` consecrates it.
Only now does the practice count toward RitualOS's standing — and any *reward*
is computed separately in `reward/1`, never here.

Over a month, thirty consecrated observances against `daily-office` are visible,
verifiable proof that the practice held — and a gap in the calendar is equally
visible.

## Integration with the Flashy Estate

`ritual/1` is one of four interoperating standards:

| Standard | Format | Solves |
|----------|--------|--------|
| **Trust Routing** | `trust/1` | Consent paths through graphs (Magician) |
| **Federated Roadmaps** | `intent/1` | Roadmap visibility without logins (IntentMesh) |
| **Witnessed Observances** | `ritual/1` | Legible, witnessed practice (Rites) |
| **Governance** | `aao/0.1` | Machine-readable authority + conformance |

They compose:
- **AAO** declares who may publish a liturgy and who may consecrate
- **Rites** records the practice; **Magician** doctrine (standing from others'
  assertions) governs how consecrated observances count
- **`reward/1`** — separate by design — is where accrual and caps live
- **IntentMesh** holds the future tense; `ritual/1` the present; `shipped/1` the past

## Resources

- **Spec:** [`Rites-Network/SPEC.md`](https://github.com/FlashyLabs/Rites-Network/blob/main/SPEC.md)
- **Working example:** [Example 12: ritual/1](https://github.com/flashylabs/flashy-examples/tree/main/examples/12-rites)
- **The three tenses:** `docs/tenses.md` in the estate
- **Sibling formats:** `backlog/1` (future), `shipped/1` (past)

## Next Steps

1. **Declare a liturgy**: name a recurring rite, its cadence, and its steps; a person publishes it
2. **Record observances**: an agent performs; the evidence is an https URL a stranger can open
3. **Climb the ladder by transition**: get witnessed by an independent party, then consecrated by a human
4. **Keep reward out**: any accrual lives in `reward/1`, never in the observance
5. **Correct by superseding**: never edit; append a `void` observance naming the old one

`ritual/1` turns a practice from something visible only by side effects into a
witnessed, verifiable record a stranger can check.
