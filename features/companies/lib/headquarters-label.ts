import type { CompanyHeadquartersInput } from "@/lib/geography/company-headquarters";
import { getProvince, getRegion } from "@/lib/geography/morocco";

/** Display the saved headquarters only; never infer it from coverage or legal data. */
export function headquartersLabel(
  city: string,
  headquarters: Pick<CompanyHeadquartersInput, "regionCode" | "provinceCode"> | undefined,
  locale: string,
) {
  const region = getRegion(headquarters?.regionCode);
  const province = getProvince(headquarters?.provinceCode);
  const name = (item: { nameFr: string; nameEn: string }) => locale === "fr" ? item.nameFr : item.nameEn;
  return [
    city,
    province && (!region || province.regionCode === region.code) ? name(province) : null,
    region ? name(region) : null,
  ].filter(Boolean).join(" · ");
}
