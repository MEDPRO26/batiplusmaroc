# Deal domain (V1 Step 8.1)

A Deal is Batiplus's authoritative commercial record after a client accepts the
current revision of a company's Final Quote and that company is selected on the
project. Clients and companies cannot create Deals directly; creation is an
internal Convex operation for trusted business logic.

## Creation and uniqueness

- The Final Quote must be `accepted`, and its accepted revision must still be
  its current revision.
- The project must be `company_selected` and its client, selected company, and
  selected Final Quote must match the accepted quote.
- The initial quote and conversation relationships are verified and snapshotted
  because they are useful for operational traceability and activity history.
- One project has at most one authoritative Deal. The project and accepted
  Final Quote indexes make retries idempotent inside Convex's serializable
  transaction: the same request returns the existing Deal without duplicating
  history or activity.

## Commercial snapshots

The accepted revision's MAD price is normalized to centimes and stored as
`agreedAmountMad`. An authorized admin configures one ordered global schedule
of flat commission brackets. Tier boundaries are whole MAD integers and rates
are integer basis points. There is no implicit default: Deal creation fails
safely until a valid, gap-free schedule with an open-ended final tier exists.

Exactly one tier is matched from the Deal's whole-MAD bracket value. For an
accepted amount containing centimes, tier lookup uses its floored whole-MAD
value so the integer boundaries remain gap-free; the commission still uses the
exact normalized centime amount. The matched tier's one rate applies to the
entire accepted Deal amount; this is not a progressive or tax-bracket
calculation. The result is rounded half-up to the nearest centime and stored as
`commissionAmountMad`.
For example, the approved V1 schedule resolves 450,000 MAD to 5% on the full
450,000 MAD, producing a 22,500 MAD commission.

These commercial fields and all relationship fields are immutable. New Deals
also snapshot the matched tier's lower/upper bounds and configuration version
for financial traceability. The rate, matched tier, and commission are never
accepted from client or company input. Later schedule changes apply only to
future Deals. Step 8.2 will consume the schedule through the trusted
`resolveCommissionForDealAmount` server helper.

## Development migration note

Before replacing the single-rate schema, the configured development deployment
was inspected: `marketplaceSettings`, `marketplaceSettingsHistory`, and `deals`
contained no documents. The obsolete `commissionRateBps` setting and its
single-rate history shape were therefore removed cleanly with no data rewrite
or invented conversion. Production was not inspected or changed. If another
environment contains legacy single-rate data, it must be migrated explicitly
before this schema is promoted there; a single rate is not silently converted
into a tier schedule.

## Status and authorization

A Deal starts `active` because Final Quote acceptance already begins the
commercial relationship. `completed` and `cancelled` are reserved for explicit
future transitions; Step 8.1 does not expose those transitions.

The project-owning client, active members of the selected company, and admins
may read the Deal. Other clients, other companies, SEO-team users, and anonymous
callers are rejected by Convex authorization.

Creation appends exactly one initial `dealStatusHistory` row and one private
`deal_created` marketplace activity row in the same transaction as the Deal.
No separate commissions table exists yet; Step 8.5 owns commission lifecycle
tracking, while the immutable snapshots remain on the Deal.
