# Deal domain (V1 Step 8.2)

A Deal is Batiplus's authoritative commercial record after the project-owning
Client accepts the current revision of a Company's Final Quote. The accepted
Company owes the snapshotted marketplace commission to the Batiplus platform;
the Client does not owe this commission.

## Authoritative creation command

The only normal creation trigger is
`finalQuotes.index.review({ action: "accept" })`. The public command accepts
relationship identifiers only. It does not accept a Deal amount, commission
rate, commission amount, tier, configuration version, debtor, or beneficiary.

Inside one Convex mutation, the command:

1. authenticates a fully onboarded Client and verifies Project ownership;
2. verifies the Final Quote, current revision, initial quote, conversation,
   Company, and active Company membership all describe the same relationship;
3. checks the submitted revision is current, unexpired, and eligible;
4. validates the Project state transition to `company_selected`;
5. marks the Final Quote `accepted` and the Project `company_selected`;
6. calls `createDealFromAcceptedFinalQuote`, which derives the amount from the
   accepted revision and calls `resolveCommissionForDealAmount()`;
7. creates the immutable Deal and Company-to-Batiplus commission obligation;
8. appends status history and marketplace activity.

Convex commits all of these writes atomically. A missing or corrupt commission
schedule, relationship mismatch, authorization failure, or any other error
rolls back the quote acceptance, Company selection, Deal, and audit writes.
There is no frontend-controlled follow-up Deal creation step.

## Trusted amount and immutable snapshots

`finalQuoteRevisions.price` on the accepted current revision is the sole Deal
amount source. The backend normalizes it to centimes and stores it as
`agreedAmountMad`; the request cannot override it.

Every Deal freezes:

- Project, Client, selected Company, and creating Client;
- initial quote, conversation, accepted Final Quote, and accepted revision;
- agreed amount and `MAD` currency;
- commission rate and amount;
- matched tier lower and upper bounds;
- commission configuration version;
- selected Company as `commissionDebtorCompanyId`;
- `batiplus` as `commissionBeneficiary`;
- initial `commissionStatus: "due"`;
- Deal status and creation time.

These fields are historical facts. Later Final Quote edits or Admin commission
schedule changes never recalculate an existing Deal.

## Commission calculation and obligation

`resolveCommissionForDealAmount()` loads and validates the current Admin-managed
flat-bracket schedule. Exactly one tier applies its rate to the entire accepted
amount; the schedule is not progressive. Calculation uses integer-centime,
round-half-up arithmetic.

The Company-to-platform relationship is explicit:

```text
selected Company (debtor) -> Batiplus platform (beneficiary)
```

The Client is a Deal participant but is never the commission debtor. V1 embeds
the obligation snapshot in the Deal. An Admin may confirm receipt exactly once
with the `due -> paid` transition. This is manual operational tracking only: it
does not collect money or introduce invoicing, overdue handling, or accounting.

## State transitions and audit

Successful acceptance commits these lifecycle changes together:

- Final Quote: `submitted -> accepted`;
- Project: `published | in_discussion -> company_selected`;
- Deal: created as `active`;
- commission obligation: created as `due`.

When an Admin confirms receipt, the Deal stores the payment timestamp, Admin,
and optional reference/note. The same transaction appends one immutable
`commissionStatusHistory` row and a `commission_paid` marketplace activity.
Repeated confirmation is rejected, and the commercial snapshots are unchanged.

## Company commission visibility

An authenticated, active Company member can read only the commission
obligations where that member's Company is the snapshotted debtor. The query
derives the Company from Convex Auth and membership; it accepts no Company ID,
so another tenant cannot be probed.

The Company projection exposes only the Deal ID, project title, agreed amount,
commission rate and amount, commission configuration version, `due | paid`
status, Batiplus beneficiary, Deal date, and paid date. It does not expose the
Admin actor, payment reference, internal payment note, client identity, audit
history, or unrelated backend identifiers. The surface has no Company mutation:
only an Admin can record `due -> paid`.

The current schema requires Deal commission snapshots. As defense in depth, a
semantically incomplete or corrupt snapshot is displayed as unavailable and is
never recalculated from current commission settings or fabricated.

The initial `projectQuotes` participation record remains `discussion_open`
because the current state model has no `won` status. Competing proposals are not
automatically rejected. No separate Invitation state is invented.

The same transaction appends:

- `projectStatusHistory` for Company selection;
- `dealStatusHistory` for the initial active Deal;
- `final_quote_accepted` activity;
- `company_selected` activity;
- `deal_created` activity with the financial snapshot;
- `commission_due` activity with Company debtor and Batiplus beneficiary
  semantics.

## Duplicate prevention

Deals are indexed by Project and accepted Final Quote. The command reads those
indexes before insertion. Convex's serializable transaction retry behavior makes
double-clicks and concurrent retries converge on the first Deal. Repeating the
same acceptance returns an idempotent result and does not duplicate the Deal,
status history, `deal_created`, or `commission_due` activity. A different
accepted Final Quote cannot create a second Deal for the same Project.

## Flow convergence

Both supported participation paths converge before acceptance:

- open Project (`visibility: "marketplace"`) -> initial quote -> conversation
  -> Final Quote -> acceptance command;
- direct/invite-only Project (`visibility: "invite_only"`) -> initial quote ->
  conversation -> Final Quote -> the same acceptance command.

There is one Deal creation path and one commission resolver for both flows.

## Authorization and reads

Only the fully onboarded Client who owns the Project can execute the accepting
command. Company users, other Companies, other Clients, SEO-team users, Admins,
and anonymous callers cannot create marketplace Deals through this flow. No
Admin override exists.

The owning Client, active members of the selected Company, and Admins may read
the resulting Deal. Other users receive a non-disclosing error.

## Development migration note

The development deployment contained one obsolete single-rate settings row and
its matching history row. Both were removed before the strict tier schema was
validated; the development `deals` table was empty before the required Step 8.2
snapshot fields were added. Production was not inspected or changed. Any other
environment with legacy Deal rows requires an explicit migration before this
schema is promoted there.
