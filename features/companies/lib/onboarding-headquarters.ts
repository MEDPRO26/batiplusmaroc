import {
  companyHeadquartersSnapshot,
  normalizeCompanyHeadquarters,
  type CompanyHeadquartersInput,
} from "@/lib/geography/company-headquarters";

/** Capability comes from the private reader; the backend remains authoritative. */
export function onboardingHeadquarters(
  form: FormData,
  supportsHeadquarters: boolean,
  required: boolean,
) {
  if (!supportsHeadquarters) {
    return required
      ? { ok: false as const, error: "COMPANY_HEADQUARTERS_POLICY_UNAVAILABLE" as const }
      : { ok: true as const, headquarters: undefined };
  }
  const rawCommune = String(form.get("communeName") ?? "");
  const input: CompanyHeadquartersInput = {
    regionCode: String(form.get("regionCode") ?? "") || null,
    provinceCode: String(form.get("provinceCode") ?? "") || null,
    communeName: rawCommune.trim() === "" && !/\p{Cc}/u.test(rawCommune) ? null : rawCommune,
  };
  const result = normalizeCompanyHeadquarters(input, required);
  if (!result.ok) return result;
  return { ok: true as const, headquarters: companyHeadquartersSnapshot(result.fields) };
}
