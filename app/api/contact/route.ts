import { Resend } from "resend";

import { buildContactEmailHtml, buildContactEmailText } from "@/lib/contact-email";

export const runtime = "nodejs";

const otherService = "Autre";

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  city?: unknown;
  service?: unknown;
  details?: unknown;
  website?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanServices(value: unknown) {
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(items.map((item) => cleanText(item, 160)).filter(Boolean))];
}

export async function POST(request: Request) {
  let payload: ContactPayload;

  try {
    payload = await request.json() as ContactPayload;
  } catch {
    return Response.json({ message: "Données invalides." }, { status: 400 });
  }

  // This field is visually hidden. Bots commonly fill it in.
  if (cleanText(payload.website, 200)) {
    return Response.json({ ok: true });
  }

  const name = cleanText(payload.name, 100);
  const email = cleanText(payload.email, 254).toLowerCase();
  const phone = cleanText(payload.phone, 40);
  const city = cleanText(payload.city, 100);
  const services = cleanServices(payload.service);
  const details = cleanText(payload.details, 4000);

  if (!name || !phone || !city || services.length === 0) {
    return Response.json({ message: "Veuillez remplir les champs obligatoires." }, { status: 400 });
  }

  if (services.includes(otherService) && !details) {
    return Response.json({ message: "Veuillez préciser votre service." }, { status: 400 });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ message: "Veuillez saisir une adresse e-mail valide." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "S2MBOU <contact@batiplusmaroc.com>";
  const to = process.env.CONTACT_TO_EMAIL || "contact@batiplusmaroc.com";

  if (!apiKey || apiKey.startsWith("re_your_")) {
    console.error("Missing RESEND_API_KEY");
    return Response.json({ message: "Le formulaire est momentanément indisponible." }, { status: 503 });
  }

  const emailData = { name, email, phone, city, services, details };
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    ...(email ? { replyTo: email } : {}),
    subject: `Nouvelle demande — ${services.join(", ")}`,
    text: buildContactEmailText(emailData),
    html: buildContactEmailHtml(emailData),
  });

  if (error) {
    console.error("Resend contact error", error);
    return Response.json({ message: "L’envoi a échoué. Veuillez réessayer." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
