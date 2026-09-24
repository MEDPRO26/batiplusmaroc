# Homepage V1 legacy link fixes

The WordPress homepage linked to seven URLs that returned `404`. V1 does not reproduce those URLs and does not add redirects. The replacement behavior is implemented through the new service and project navigation.

| Old URL | Old anchor text | Old section/context | New destination | Reason |
|---|---|---|---|---|
| `/prestations-metallerie` | En savoir plus | Services / prestations metalwork CTA | `/nos-services/` | The CTA describes service capability; the protected services overview is the closest valid destination. |
| `/charpente-metallique` | Empty image link | Services / metalwork capability item | `/nos-services/` | The broken standalone capability link is replaced by crawlable expertise text within the services experience. |
| `/bardage-metallique/` | Empty image link | Services / metalwork capability item | `/nos-services/` | The broken standalone capability link is replaced by crawlable expertise text within the services experience. |
| `/serrurerie/` | Empty image link | Services / metalwork capability item | `/nos-services/` | The broken standalone capability link is replaced by crawlable expertise text within the services experience. |
| `/construction-parasismique/` | Empty image link | Services / construction capability item | `/nos-services/` | No verified standalone page exists; the valid services overview preserves the service context. |
| `/ossature-metallique/` | Empty image link | Services / metalwork capability item | `/nos-services/` | No verified standalone page exists; the valid services overview preserves the service context. |
| `/realisations-metallerie` | En savoir plus | Realizations / portfolio CTA | `/nos-realisations/` | The CTA is project-oriented, so it now points to the protected realizations overview. |

No redirects or replacement pages were created for these legacy defects.
