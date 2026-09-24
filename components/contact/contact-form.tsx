"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

const serviceKeys = ["full", "renovation", "interior", "admin", "other"] as const;
const otherServiceKey = "other" as const;

const inputClass =
  "min-h-13 w-full border-0 border-b border-[#c8d4db] bg-transparent px-0 py-3 text-base text-[#15212b] outline-none transition placeholder:text-[#89959d] focus:border-[#07598e] focus:ring-0";

function RequiredMark({ label }: { label: string }) {
  return (
    <>
      <span className="text-[#c23a3a]" aria-hidden="true">
        {" "}
        *
      </span>
      <span className="sr-only"> ({label})</span>
    </>
  );
}

export function ContactForm() {
  const t = useTranslations("contact");
  const tCommon = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [needsDetails, setNeedsDetails] = useState(false);

  const otherServiceLabel = t(`services.${otherServiceKey}`);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const services = data
      .getAll("service")
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const city = String(data.get("city") ?? "").trim();
    const name = String(data.get("name") ?? "").trim();
    const phone = String(data.get("phone") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const details = String(data.get("details") ?? "").trim();

    if (services.length === 0) {
      setStatus("error");
      setMessage(t("selectServiceError"));
      form.querySelector<HTMLInputElement>('input[name="service"]')?.focus();
      return;
    }

    if (services.includes(otherServiceLabel) && !details) {
      setStatus("error");
      setMessage(t("specifyServiceError"));
      return;
    }

    if (!city || !name || !phone) {
      setStatus("error");
      setMessage(t("requiredFieldsError"));
      return;
    }

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: services,
          city,
          name,
          phone,
          email,
          details,
          website: data.get("website"),
        }),
      });
      await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error("UNKNOWN");
      }

      form.reset();
      setNeedsDetails(false);
      setStatus("success");
      setMessage(t("success"));
    } catch {
      setStatus("error");
      setMessage(t("error"));
    }
  }

  return (
    <form className="grid gap-10" onSubmit={handleSubmit}>
      <fieldset aria-required="true">
        <legend className="mb-2 text-sm font-semibold text-[#15212b]">
          {t("serviceLegend")}
          <RequiredMark label={tCommon("required")} />
        </legend>
        <p className="mb-5 text-xs text-[#77858e]">{t("serviceHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {serviceKeys.map((option, index) => {
            const label = t(`services.${option}`);
            return (
              <label
                className={`group relative cursor-pointer ${index === serviceKeys.length - 1 ? "sm:col-span-2" : ""}`}
                key={option}
              >
                <input
                  className="peer sr-only"
                  type="checkbox"
                  name="service"
                  value={label}
                  onChange={
                    option === otherServiceKey
                      ? (event) => setNeedsDetails(event.target.checked)
                      : undefined
                  }
                />
                <span className="flex min-h-14 items-center gap-3 border border-[#d5dfe5] bg-white px-4 py-3 text-sm font-medium text-[#56636d] transition hover:border-[#8aa7b9] peer-checked:border-[#07598e] peer-checked:bg-[#edf5f9] peer-checked:text-[#07598e] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#07598e]">
                  <span
                    className="grid size-5 shrink-0 place-items-center rounded-[4px] border border-[#aebdc7] transition group-has-[:checked]:border-[#07598e] group-has-[:checked]:bg-[#07598e]"
                    aria-hidden="true"
                  >
                    <svg
                      className="size-3 opacity-0 transition group-has-[:checked]:opacity-100"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.4 6.2 4.8 8.6 9.6 3.4"
                        stroke="white"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {needsDetails ? (
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[#15212b]">
            {t("detailsLabel")}
            <RequiredMark label={tCommon("required")} />
          </span>
          <textarea
            className="min-h-32 resize-y border border-[#c8d4db] bg-white p-4 text-base text-[#15212b] outline-none transition placeholder:text-[#89959d] focus:border-[#07598e] focus:ring-1 focus:ring-[#07598e]"
            name="details"
            placeholder={t("detailsPlaceholder")}
            required
          />
        </label>
      ) : null}

      <div className="grid gap-8 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">
            {t("city")}
            <RequiredMark label={tCommon("required")} />
          </span>
          <input
            className={inputClass}
            type="text"
            name="city"
            placeholder={t("cityPlaceholder")}
            autoComplete="address-level2"
            required
            aria-required="true"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">
            {t("name")}
            <RequiredMark label={tCommon("required")} />
          </span>
          <input
            className={inputClass}
            type="text"
            name="name"
            placeholder={t("namePlaceholder")}
            autoComplete="name"
            required
            aria-required="true"
          />
        </label>
      </div>

      <label className="grid gap-1">
        <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">
          {t("phoneLabel")}
          <RequiredMark label={tCommon("required")} />
        </span>
        <input
          className={inputClass}
          type="tel"
          name="phone"
          placeholder={t("phonePlaceholder")}
          autoComplete="tel"
          inputMode="tel"
          required
          aria-required="true"
        />
      </label>

      <label className="grid gap-1">
        <span className="text-[0.68rem] font-bold tracking-[0.15em] text-[#61717c] uppercase">
          {t("emailLabel")}
          <span className="font-medium normal-case tracking-normal text-[#89959d]">
            {" "}
            ({tCommon("optional")})
          </span>
        </span>
        <input
          className={inputClass}
          type="email"
          name="email"
          placeholder={t("emailPlaceholder")}
          autoComplete="email"
        />
      </label>

      <label className="sr-only" aria-hidden="true">
        {t("honeypot")}
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <div className="flex flex-col items-start gap-5 border-t border-[#d9e2e7] pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 max-w-sm text-xs leading-5 text-[#77858e]">{t("privacy")}</p>
        <button
          disabled={status === "sending"}
          className="inline-flex min-h-14 w-full items-center justify-center gap-4 rounded-[8px] bg-[#07598e] px-7 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#064b78] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#07598e] disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          type="submit"
        >
          {status === "sending" ? t("sending") : t("submit")} <span aria-hidden="true">↗</span>
        </button>
      </div>

      <p
        className={`m-0 rounded-[8px] px-4 py-3 text-sm font-medium ${
          status === "success"
            ? "bg-emerald-50 text-emerald-800"
            : status === "error"
              ? "bg-red-50 text-red-800"
              : "hidden"
        }`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  );
}
