"use client";

import { useLocale, useTranslations } from "next-intl";
import { catalogServiceName } from "@/features/companies/lib/service-label";
import {
  EditDialog,
  MultiSelectField,
  fieldClass,
  optionalNumber,
  readList,
  useProfileSave,
  type ProfileManager,
} from "./profile-editing";

type Props = { profile: ProfileManager };
type Service = ProfileManager["selectedServiceIds"][number];
type Area = ProfileManager["serviceAreaOptions"][number];
type Language = ProfileManager["languageOptions"][number];
type Size = ProfileManager["companySizeOptions"][number];

const labelClass = "block text-sm font-medium text-ink";

function useEditor() {
  const t = useTranslations("companyProfileManager");
  const { save } = useProfileSave();
  const fail = (key: Parameters<typeof t>[0]) => {
    throw new Error(t(key));
  };
  return { t, save, fail };
}

export function IdentityEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      lead={t("dialogs.identityLead")}
      onSave={async (form) => {
        const name = String(form.get("name") ?? "").trim();
        const city = String(form.get("city") ?? "").trim();
        if (name.length < 2) fail("validation.name");
        if (city.length < 2) fail("validation.city");
        await save({ name, city });
      }}
      title={t("dialogs.identityTitle")}
      triggerLabel={t("dialogs.editIdentity")}
    >
      {() => (
        <div className="grid gap-4">
          <label className={labelClass}>{t("fields.name")}<input className={fieldClass} defaultValue={profile.name} maxLength={120} name="name" required /></label>
          <label className={labelClass}>{t("fields.city")}<input className={fieldClass} defaultValue={profile.city} maxLength={80} name="city" required /></label>
        </div>
      )}
    </EditDialog>
  );
}

export function AboutEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      lead={t("overview.lead")}
      onSave={async (form) => {
        const description = String(form.get("description") ?? "").trim();
        if (description.length < 20 || description.length > 1000) fail("validation.description");
        await save({ description });
      }}
      title={t("profileView.about")}
      triggerLabel={t("dialogs.editAbout")}
      wide
    >
      {() => (
        <label className={labelClass}>
          {t("fields.description")}
          <textarea className={`${fieldClass} min-h-56 resize-y leading-7`} defaultValue={profile.description} maxLength={1000} name="description" required />
          <span className="mt-1.5 block text-xs font-normal text-muted">{t("dialogs.descriptionHelp")}</span>
        </label>
      )}
    </EditDialog>
  );
}

export function CompanyInfoEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      lead={t("dialogs.infoLead")}
      onSave={async (form) => {
        const companySize = String(form.get("companySize") ?? "") as Size;
        if (!companySize) fail("validation.companySize");
        await save({
          yearsExperience: optionalNumber(form, "yearsExperience"),
          foundedYear: optionalNumber(form, "foundedYear"),
          companySize,
        });
      }}
      title={t("profileView.companyInfo")}
      triggerLabel={t("dialogs.editInfo")}
    >
      {() => (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>{t("fields.yearsExperience")}<input className={fieldClass} defaultValue={profile.yearsExperience ?? ""} inputMode="numeric" max="100" min="0" name="yearsExperience" step="1" type="number" /></label>
          <label className={labelClass}>{t("fields.foundedYear")}<input className={fieldClass} defaultValue={profile.foundedYear ?? ""} inputMode="numeric" max={new Date().getFullYear()} min="1800" name="foundedYear" step="1" type="number" /></label>
          <label className={`${labelClass} sm:col-span-2`}>
            {t("fields.companySize")}
            <select className={fieldClass} defaultValue={profile.companySize ?? ""} name="companySize" required>
              <option disabled value="">{t("fields.companySizePlaceholder")}</option>
              {profile.companySizeOptions.map((size) => <option key={size} value={size}>{t(`companySize.${size}`)}</option>)}
            </select>
          </label>
        </div>
      )}
    </EditDialog>
  );
}

export function LanguagesEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      onSave={async (form) => {
        const languages = readList<Language>(form, "languages");
        if (languages.length === 0) fail("validation.languages");
        await save({ languages });
      }}
      title={t("fields.languages")}
      triggerLabel={t("dialogs.editLanguages")}
    >
      {() => (
        <MultiSelectField<Language>
          initial={profile.languages}
          labelFor={(value) => t(`languages.${value}`)}
          name="languages"
          options={profile.languageOptions}
          selectedLabel={t("dialogs.selected")}
        />
      )}
    </EditDialog>
  );
}

export function ServicesEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  const locale = useLocale();
  return (
    <EditDialog
      lead={t("dialogs.servicesLead")}
      onSave={async (form) => {
        const serviceIds = readList<Service>(form, "services");
        if (serviceIds.length === 0) fail("validation.services");
        await save({ serviceIds });
      }}
      title={t("services.title")}
      triggerLabel={t("dialogs.editServices")}
      wide
    >
      {() => (
        <MultiSelectField<Service>
          initial={profile.selectedServiceIds}
          labelFor={(value) => { const row = profile.catalogServices.find(item => item._id === value); return row ? catalogServiceName(row, locale) : value; }}
          name="services"
          options={profile.catalogServices.filter(item => item.isActive).map(item => item._id)}
          selectedLabel={t("dialogs.selected")}
        />
      )}
    </EditDialog>
  );
}

export function ServiceAreasEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      lead={t("dialogs.areasLead")}
      onSave={async (form) => {
        const serviceAreas = readList<Area>(form, "serviceAreas");
        if (serviceAreas.length === 0) fail("validation.serviceAreas");
        await save({ serviceAreas });
      }}
      title={t("serviceAreas.title")}
      triggerLabel={t("dialogs.editAreas")}
      wide
    >
      {() => (
        <MultiSelectField<Area>
          initial={profile.serviceAreas}
          labelFor={(value) => t(`serviceAreaOptions.${value}`)}
          name="serviceAreas"
          options={profile.serviceAreaOptions}
          searchLabel={t("dialogs.searchCities")}
          searchable
          selectedLabel={t("dialogs.selected")}
        />
      )}
    </EditDialog>
  );
}

export function ContactEditor({ profile }: Props) {
  const { t, save, fail } = useEditor();
  return (
    <EditDialog
      lead={t("dialogs.contactLead")}
      onSave={async (form) => {
        const phone = String(form.get("phone") ?? "").trim();
        if (!phone) fail("validation.phone");
        await save({ phone, website: String(form.get("website") ?? "").trim() });
      }}
      title={t("settings.contact")}
      triggerLabel={t("dialogs.editContact")}
    >
      {() => (
        <div className="grid gap-4">
          <label className={labelClass}>{t("fields.phone")}<input autoComplete="tel" className={fieldClass} defaultValue={profile.phone} inputMode="tel" name="phone" placeholder={t("fields.phonePlaceholder")} required type="tel" /></label>
          <label className={labelClass}>{t("fields.website")}<input autoComplete="url" className={fieldClass} defaultValue={profile.website} name="website" placeholder={t("fields.websitePlaceholder")} type="url" /></label>
        </div>
      )}
    </EditDialog>
  );
}
