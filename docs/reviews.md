# Client reviews (V1 Step 10)

## Domain rule

A Client Review is the completed Deal owner's one rating and comment about the
Company selected for that Deal. Reviews are Client-to-Company only. Batiplus
does not support Company-to-Client reviews, reviews without a Deal, or multiple
reviews for one Deal.

## Eligibility and integrity

`reviews.index.createReview` accepts only `dealId`, `rating`, and `comment`.
Convex Auth supplies the Client identity. The backend requires a completed Deal
completed by that same Client and re-validates the Deal's Project, selected
Company, initial quote, conversation, accepted Final Quote, and accepted
revision. An integer rating from 1 through 5 and normalized plain-text comment
from 10 through 2,000 characters are required.

The unique `reviews.by_dealId` index enforces one review per Deal. Review
creation, Company aggregate adjustment, and immutable marketplace activity are
committed atomically.

## Public visibility and rating

New reviews are `visible`. Public Company profiles expose only the rating,
comment, creation date, limited reviewer display name, and Project title. They
never expose internal review, Deal, Client, moderation, or audit identifiers.

Companies maintain an exact visible `reviewCount` and `reviewRatingTotal`; the
displayed average is `reviewRatingTotal / reviewCount`. Hidden reviews are
excluded from both the public list and aggregate. An empty visible set returns
no rating and a count of zero.

## Permissions and moderation

- The completed Deal owner may create the review and read their own submitted
  review, including whether it is currently hidden.
- Company members may read the same public review surface as any visitor and
  cannot create, edit, hide, restore, or delete reviews.
- Admins may list, search, and filter reviews and transition visibility between
  `visible` and `hidden`.
- Admins cannot edit review content. Clients cannot edit or delete it in V1.
- Every creation, hide, and restore action appends a marketplace activity row.

## UI contract

The Client Project workspace shows the review action only after Deal completion
and replaces it reactively with the submitted review. Public Company profiles
show the visible average, count, and latest public reviews. The Admin Reviews
area offers search, visibility filters, and hide/restore actions only. All
surfaces are localized in French and English and support narrow mobile layouts.
