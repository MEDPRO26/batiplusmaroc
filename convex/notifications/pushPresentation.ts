import type { Doc, Id } from "../_generated/dataModel";
import type { ActiveNotificationType } from "./constants";
import {
  localizedNotificationDestination,
  type NotificationAccountType,
} from "../../lib/notifications/destination";

export type PushLocale = "fr" | "en";

type PushNotificationRecord = Pick<
  Doc<"notifications">,
  "type" | "entity" | "payload"
> & { _id: Id<"notifications"> };

const BODY_TEMPLATES = {
  en: {
    proposal_received: "{companyName} sent a proposal for {projectTitle}.",
    proposal_accepted: "Discussion opened for your proposal on {projectTitle}.",
    invitation_received: "You were invited to work on {projectTitle}.",
    invitation_accepted: "{companyName} accepted your invitation for {projectTitle}.",
    invitation_declined: "{companyName} declined your invitation for {projectTitle}.",
    message_received: "New message from {actorDisplayName} about {projectTitle}.",
    site_visit_proposed: "{actorDisplayName} proposed a site visit for {projectTitle}.",
    site_visit_confirmed: "The site visit for {projectTitle} was confirmed.",
    site_visit_rescheduled: "{actorDisplayName} proposed a new site-visit time for {projectTitle}.",
    site_visit_cancelled: "The site visit for {projectTitle} was cancelled.",
    final_quote_submitted: "{companyName} submitted a final quote for {projectTitle}.",
    final_quote_accepted: "Your final quote for {projectTitle} was accepted.",
    commission_due: "A commission of {amountMad} MAD is due for {projectTitle}.",
    commission_paid: "The commission of {amountMad} MAD for {projectTitle} was marked paid.",
    deal_completed: "{projectTitle} was marked completed.",
    review_received: "You received a {rating}-star review for {projectTitle}.",
    company_verification_approved: "{companyName} has been verified.",
    company_verification_rejected: "Verification for {companyName} needs your attention.",
  },
  fr: {
    proposal_received: "{companyName} a envoyé une proposition pour {projectTitle}.",
    proposal_accepted: "La discussion est ouverte pour votre proposition sur {projectTitle}.",
    invitation_received: "Vous avez été invité à travailler sur {projectTitle}.",
    invitation_accepted: "{companyName} a accepté votre invitation pour {projectTitle}.",
    invitation_declined: "{companyName} a refusé votre invitation pour {projectTitle}.",
    message_received: "Nouveau message de {actorDisplayName} au sujet de {projectTitle}.",
    site_visit_proposed: "{actorDisplayName} a proposé une visite technique pour {projectTitle}.",
    site_visit_confirmed: "La visite technique pour {projectTitle} est confirmée.",
    site_visit_rescheduled: "{actorDisplayName} a proposé un nouvel horaire de visite pour {projectTitle}.",
    site_visit_cancelled: "La visite technique pour {projectTitle} a été annulée.",
    final_quote_submitted: "{companyName} a envoyé un devis final pour {projectTitle}.",
    final_quote_accepted: "Votre devis final pour {projectTitle} a été accepté.",
    commission_due: "Une commission de {amountMad} MAD est due pour {projectTitle}.",
    commission_paid: "La commission de {amountMad} MAD pour {projectTitle} a été marquée comme payée.",
    deal_completed: "{projectTitle} a été marqué comme terminé.",
    review_received: "Vous avez reçu un avis de {rating} étoiles pour {projectTitle}.",
    company_verification_approved: "{companyName} est désormais vérifiée.",
    company_verification_rejected: "La vérification de {companyName} nécessite votre attention.",
  },
} as const satisfies Record<PushLocale, Record<ActiveNotificationType, string>>;

function bodyFor(notification: PushNotificationRecord, locale: PushLocale) {
  const template = BODY_TEMPLATES[locale][notification.type as ActiveNotificationType];
  const values: Record<string, string> = {
    actorDisplayName: notification.payload.actorDisplayName ?? "",
    projectTitle: notification.payload.projectTitle ?? "",
    companyName: notification.payload.companyName ?? "",
    amountMad: notification.payload.amountMad === undefined
      ? ""
      : new Intl.NumberFormat(locale).format(notification.payload.amountMad),
    rating: notification.payload.rating?.toString() ?? "",
  };
  return template.replace(/\{([A-Za-z]+)\}/g, (_, key: string) => values[key] ?? "").slice(0, 240);
}

export function marketplacePushPresentation(
  notification: PushNotificationRecord,
  accountType: NotificationAccountType,
  locale: PushLocale,
) {
  return {
    title: "Batiplus Maroc",
    body: bodyFor(notification, locale),
    url: localizedNotificationDestination(locale, notification, accountType),
    tag: `batiplus-notification-${notification._id}`,
  };
}

export { BODY_TEMPLATES as MARKETPLACE_PUSH_BODY_TEMPLATES };
