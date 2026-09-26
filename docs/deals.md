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
`agreedAmountMad`. An authorized admin configures the one global marketplace
rate in integer basis points. There is no implicit default: Deal creation fails
safely until the rate is configured. Commission is calculated with integer
centime arithmetic and rounded half-up to the nearest centime, then stored as
`commissionAmountMad`.

These commercial fields and all relationship fields are immutable. Step 8.1
exposes no mutation that can rewrite them. The rate is not accepted from client
or company input, and later marketplace-rate changes apply only to future Deals.
Step 8.2 will consume the current setting through the trusted server helper.

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
