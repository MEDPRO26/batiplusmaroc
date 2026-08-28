import { Resend } from "resend";

export const runtime = "nodejs";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] ?? character);
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
  const service = cleanText(payload.service, 160);
  const details = cleanText(payload.details, 4000);

  if (!name || !email || !phone || !city || !service || !details) {
    return Response.json({ message: "Veuillez remplir tous les champs." }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ message: "Veuillez saisir une adresse e-mail valide." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "S2MBOU <contact@batiplusmaroc.com>";
  const to = process.env.CONTACT_TO_EMAIL || "contact@batiplusmaroc.com";

  if (!apiKey || apiKey.startsWith("re_your_")) {
    console.error("Missing RESEND_API_KEY");
    return Response.json({ message: "Le formulaire est momentanément indisponible." }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: email,
    subject: `Nouvelle demande — ${service}`,
    text: [
      `Nom complet : ${name}`,
      `E-mail : ${email}`,
      `Téléphone : ${phone}`,
      `Ville : ${city}`,
      `Service : ${service}`,
      "",
      "Besoin :",
      details,
    ].join("\n"),
    html: `
      <h1>Nouvelle demande de contact</h1>
      <p><strong>Nom complet :</strong> ${escapeHtml(name)}</p>
      <p><strong>E-mail :</strong> ${escapeHtml(email)}</p>
      <p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>
      <p><strong>Ville :</strong> ${escapeHtml(city)}</p>
      <p><strong>Service :</strong> ${escapeHtml(service)}</p>
      <h2>Besoin</h2>
      <p>${escapeHtml(details).replace(/\n/g, "<br>")}</p>
    `,
  });

  if (error) {
    console.error("Resend contact error", error);
    return Response.json({ message: "L’envoi a échoué. Veuillez réessayer." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
