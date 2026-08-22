"use client";

import type { FormEvent } from "react";

const serviceOptions = [
  "Construction complète",
  "Rénovation intérieure",
  "Décoration / aménagement intérieur",
  "Suivi administratif de dossier (permis, autorisation, etc.)",
  "Autre",
] as const;

const inputClass = "min-h-13 w-full border-0 border-b border-[#c8d4db] bg-transparent px-0 py-3 text-base text-[#15212b] outline-none transition placeholder:text-[#89959d] focus:border-[#07598e] focus:ring-0";

export function ContactForm() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `Demande de contact — ${data.get("service") ?? "Projet"}`;
    const body = [
      `Nom complet : ${data.get("name") ?? ""}`,
      `Téléphone : ${data.get("phone") ?? ""}`,
      `Ville : ${data.get("city") ?? ""}`,
      `Service : ${data.get("service") ?? ""}`,
      "",
      "Besoin :",
      String(data.get("details") ?? ""),
    ].join("\n");

    window.location.href = `mailto:sgta.btp@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <form className="grid gap-10" onSubmit={handleSubmit}>
      <fieldset>
        <legend className="mb-5 text-sm font-semibold text-[#15212b]">Quel type de service recherchez-vous ?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {serviceOptions.map((option, index) => (
            <label className={`group relative cursor-pointer ${index === serviceOptions.length - 1 ? "sm:col-span-2" : ""}`} key={option}>
              <input className="peer sr-only" type="radio" name="service" value={option} required={index === 0} />
              <span className="flex min-h-14 items-center gap-3 border border-[#d5dfe5] bg-white px-4 py-3 text-sm font-medium text-[#56636d] transition hover:border-[#8aa7b9] peer-checked:border-[#07598e] peer-checked:bg-[#edf5f9] peer-checked:text-[#07598e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#07598e]">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[#aebdc7] transition peer-checked:border-[#07598e]" aria-hidden="true">
                  <span className="size-2 rounded-full bg-[#07598e] opacity-0 transition group-has-[:checked]:opacity-100" />
                </span>
                {option}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#15212b]">Précisez votre service</span>
        <textarea className="min-h-32 resize-y border border-[#c8d4db] bg-white p-4 text-base text-[#15212b] outline-none transition placeholder:text-[#89959d] focus:border-[#07598e] focus:ring-1 focus:ring-[#07598e]" name="details" placeholder="Décrivez votre besoin" required />
      </label>

      <div className="grid gap-8 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">Ville</span>
          <input className={inputClass} type="text" name="city" placeholder="Votre ville" autoComplete="address-level2" required />
        </label>
        <label className="grid gap-1">
          <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">Nom complet</span>
          <input className={inputClass} type="text" name="name" placeholder="Votre nom" autoComplete="name" required />
        </label>
      </div>

      <label className="grid gap-1">
        <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">Téléphone</span>
        <input className={inputClass} type="tel" name="phone" placeholder="Votre numéro" autoComplete="tel" inputMode="tel" required />
      </label>

      <div className="flex flex-col items-start gap-5 border-t border-[#d9e2e7] pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-sm text-xs leading-5 text-[#77858e]">L’envoi ouvre votre application e-mail avec les informations du formulaire déjà préparées.</p>
        <button className="inline-flex min-h-14 w-full items-center justify-center gap-4 rounded-[8px] bg-[#07598e] px-7 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#064b78] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#07598e] sm:w-auto" type="submit">Envoyer ma demande <span aria-hidden="true">↗</span></button>
      </div>
    </form>
  );
}

