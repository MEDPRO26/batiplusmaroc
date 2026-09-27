# Direct Company Invitations

Batiplus supports the direct marketplace path without creating a second transaction system:

Client discovers Company → selects an owned active Project → sends Invitation → Company accepts or declines → accepted Company submits an initial Proposal → existing Conversation / Final Quote / Deal / Commission / Completion / Review flow continues.

## Data model

`invitations` is the current state for one Client Project and invited Company. It stores the server-derived Client owner, optional message, `pending | accepted | declined` status, timestamps, and terminal decision timestamp. `invitationStatusHistory` is append-only. The existing `marketplaceActivity` projection records creation, acceptance, and decline with the invitation, Project, Company, actor, and status transition.

Only one Invitation is allowed for a Project + Company in V1. Pending and accepted Invitations cannot be duplicated. Declined Invitations are preserved and cannot be silently resent.

## Authorization and eligibility

- Only an authenticated, fully onboarded Client may create an Invitation.
- The Client must own the Project.
- The Project must be `published` or `in_discussion` and must not have a selected Company.
- The target Company must be fully onboarded, verified, and have an active member.
- Only an active member of the invited Company may list or decide its Invitation.
- Company and Client reads are scoped server-side. Another Company cannot read or act on the Invitation, and another Client cannot list Invitations for the Project.
- Admin and SEO accounts have no marketplace-flow bypass.

## Messaging and proposal convergence

Pending and declined Invitations do not authorize a Proposal or Conversation, including when the same Project is otherwise public in the marketplace. Other Companies without an Invitation retain the normal open-Project path. Acceptance moves a published Project to `in_discussion`, but does not create a Proposal, Final Quote, or Deal.

The accepted Company then uses the existing initial Proposal command. For an accepted direct Invitation, that Proposal atomically transitions to the existing `discussion_open` state and creates the existing Conversation. All message authorization remains in the shared Conversation backend. The downstream Site Visit, Final Quote, Company Selection, Deal, Commission, Completion, and Review modules are unchanged.

## UI

The existing Company directory drawer and public Company profile use the same Invite CTA. The dialog lists only the Client's eligible Projects, accepts an optional message, shows prior Invitation state, and links to Project creation when no eligible Project exists.

Companies manage pending, accepted, and declined Invitations at the localized Company invitations route. Accepted rows link to the existing Project / initial Proposal workspace. Client Project details show the Companies already invited and their status. All invitation UI is available in French and English.
