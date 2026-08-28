export type ContactEmailData = {
  name: string;
  email: string;
  phone: string;
  city: string;
  services: string[];
  details: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] ?? character);
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function fieldRow(label: string, valueHtml: string) {
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e6eef2;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a94;font-weight:700;">${label}</p>
        <p style="margin:0;font-size:16px;line-height:1.45;color:#15212b;font-weight:600;">${valueHtml}</p>
      </td>
    </tr>`;
}

export function buildContactEmailText(data: ContactEmailData) {
  return [
    "Nouvelle demande de devis — S2MBOU",
    "",
    `Nom complet : ${data.name}`,
    `Téléphone : ${data.phone}`,
    `Ville : ${data.city}`,
    `E-mail : ${data.email || "Non renseigné"}`,
    `Services : ${data.services.join(", ")}`,
    ...(data.details ? ["", "Précision :", data.details] : []),
  ].join("\n");
}

export function buildContactEmailHtml(data: ContactEmailData) {
  const servicesHtml = data.services.map((service) => (
    `<span style="display:inline-block;margin:0 8px 8px 0;padding:7px 12px;background:#edf5f9;color:#07598e;border:1px solid #c5d9e4;border-radius:999px;font-size:13px;font-weight:700;">${escapeHtml(service)}</span>`
  )).join("");

  const emailValue = data.email
    ? `<a href="mailto:${escapeHtml(data.email)}" style="color:#07598e;text-decoration:none;">${escapeHtml(data.email)}</a>`
    : `<span style="color:#8a9aa3;font-weight:500;">Non renseigné</span>`;

  const detailsBlock = data.details
    ? `
      <tr>
        <td style="padding:22px 0 8px;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a94;font-weight:700;">Précision du client</p>
          <p style="margin:0;padding:16px 18px;background:#f6f9fb;border-left:3px solid #e5b43c;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;color:#15212b;white-space:pre-wrap;">${escapeHtml(data.details).replace(/\n/g, "<br>")}</p>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#eef3f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(11,34,58,0.08);">
            <tr>
              <td style="background:#0b223a;padding:28px 32px 24px;border-bottom:4px solid #e5b43c;">
                <p style="margin:0;color:#e5b43c;font-size:11px;letter-spacing:0.18em;font-weight:700;text-transform:uppercase;">S2MBOU · Agadir</p>
                <h1 style="margin:10px 0 0;color:#ffffff;font-size:26px;line-height:1.2;font-weight:700;">Nouvelle demande de devis</h1>
                <p style="margin:10px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">Un client a envoyé une demande depuis batiplusmaroc.com</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 10px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${fieldRow("Nom complet", escapeHtml(data.name))}
                  ${fieldRow("Téléphone", `<a href="${telHref(data.phone)}" style="color:#07598e;text-decoration:none;">${escapeHtml(data.phone)}</a>`)}
                  ${fieldRow("Ville", escapeHtml(data.city))}
                  ${fieldRow("E-mail", emailValue)}
                  <tr>
                    <td style="padding:14px 0;border-bottom:1px solid #e6eef2;">
                      <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a94;font-weight:700;">Services demandés</p>
                      <div>${servicesHtml}</div>
                    </td>
                  </tr>
                  ${detailsBlock}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:10px;">
                      <a href="${telHref(data.phone)}" style="display:inline-block;background:#07598e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">Appeler le client</a>
                    </td>
                    ${data.email ? `<td><a href="mailto:${escapeHtml(data.email)}" style="display:inline-block;background:#0b223a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:700;">Répondre par e-mail</a></td>` : ""}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#f6f9fb;padding:18px 32px;color:#7a8a94;font-size:12px;line-height:1.6;">
                S2MBOU Construction · Hay Dakhla, Agadir<br>
                <a href="https://batiplusmaroc.com" style="color:#07598e;text-decoration:none;">batiplusmaroc.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
