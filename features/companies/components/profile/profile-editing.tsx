"use client";

import { useAction, useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Pencil, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useId, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode, type Ref } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/features/shared/components/app-feedback";
import { FriendlyAlert } from "@/features/shared/components/error-state";
import { workspaceButton } from "@/features/shared/components/workspace-page";
import { mapConvexFailure } from "@/lib/errors";

export type ProfileManager = FunctionReturnType<typeof api.companies.index.getProfileManager>;
type UpdateArgs = FunctionArgs<typeof api.companies.index.updatePublicProfile>;
export type ProfilePatch = UpdateArgs;

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxLogoBytes = 5 * 1024 * 1024;
const maxCoverBytes = 10 * 1024 * 1024;

class ProfileSaveError extends Error {}

/** Each focused editor sends only the fields owned by its section. */
export function useProfileSave() {
  const t = useTranslations("companyProfileManager");
  const tUx = useTranslations("ux");
  const update = useMutation(api.companies.index.updatePublicProfile);
  const setImage = useMutation(api.companies.index.setCompanyPublicImage);
  const requestUpload = useAction(api.storage.r2.requestPublicMediaUpload);
  const verifyUpload = useAction(api.storage.r2.verifyPublicMediaUpload);
  const { showToast } = useToast();

  async function save(patch: ProfilePatch) {
    try {
      await update(patch);
    } catch (caught) {
      throw new ProfileSaveError(mapConvexFailure(caught, tUx).message);
    }
    showToast(t("success"));
  }

  async function saveImage(kind: "logo" | "cover", uploadToken: string) {
    try {
      await setImage({ kind, uploadToken });
    } catch (caught) {
      throw new ProfileSaveError(mapConvexFailure(caught, tUx).message);
    }
    showToast(t("success"));
  }

  async function uploadImage(file: File, purpose: "companyLogo" | "companyCover") {
    const maximum = purpose === "companyLogo" ? maxLogoBytes : maxCoverBytes;
    if (!imageTypes.includes(file.type) || file.size < 1 || file.size > maximum) {
      throw new ProfileSaveError(t(purpose === "companyLogo" ? "branding.logoHelp" : "branding.coverHelp"));
    }
    try {
      const intent = await requestUpload({ purpose, contentType: file.type, size: file.size });
      const response = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) throw new Error("PUBLIC_MEDIA_UPLOAD_FAILED");
      await verifyUpload({ uploadToken: intent.uploadToken });
      return intent.uploadToken;
    } catch (caught) {
      throw new ProfileSaveError(mapConvexFailure(caught, tUx).message);
    }
  }

  return { save, saveImage, uploadImage };
}

export function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught);
}

export function EditIconButton({
  label,
  ref,
  ...props
}: { label: string; ref?: Ref<HTMLButtonElement> } & Omit<ComponentPropsWithoutRef<"button">, "children">) {
  return (
    <button
      {...props}
      aria-label={label}
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-brand-border bg-white text-brand transition-colors hover:border-brand/50 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      ref={ref}
      title={label}
      type="button"
    >
      <Pencil aria-hidden className="size-3.5" strokeWidth={2} />
    </button>
  );
}

/** Pencil trigger + modal with its own Cancel/Save. Closing without saving discards edits. */
export function EditDialog({
  title,
  lead,
  triggerLabel,
  onSave,
  children,
  wide = false,
}: {
  title: string;
  lead?: string;
  triggerLabel: string;
  onSave: (form: FormData) => Promise<void>;
  children: (form: { error: string | null }) => ReactNode;
  wide?: boolean;
}) {
  const t = useTranslations("companyProfileManager");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(new FormData(event.currentTarget));
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      open={open}
    >
      <Dialog.Trigger asChild>
        <EditIconButton label={triggerLabel} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#0f1f2e]/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-[71] flex max-h-[min(88dvh,760px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-[0_24px_64px_rgb(15_31_46/0.22)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] ${wide ? "max-w-[720px]" : "max-w-[560px]"}`}
          {...(lead ? {} : { "aria-describedby": undefined })}
        >
          <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
            <div className="flex items-start justify-between gap-4 px-6 pt-6">
              <div>
                <Dialog.Title className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{title}</Dialog.Title>
                {lead ? <Dialog.Description className="mt-1.5 mb-0 text-sm leading-6 text-muted">{lead}</Dialog.Description> : null}
              </div>
              <Dialog.Close
                aria-label={t("cancel")}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-brand-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children({ error })}</div>
            {error ? (
              <div className="px-6 pb-3">
                <FriendlyAlert>{error}</FriendlyAlert>
              </div>
            ) : null}
            <div className="flex justify-end gap-2.5 border-t border-brand-border px-6 py-4">
              <Dialog.Close asChild>
                <button className={workspaceButton.secondary} type="button">{t("cancel")}</button>
              </Dialog.Close>
              <button className={workspaceButton.primary} disabled={saving} type="submit">
                {saving ? t("saving") : t("dialogs.save")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const fieldClass =
  "mt-1.5 w-full rounded-[10px] border border-brand-border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-brand focus:shadow-[0_0_0_3px_rgb(5_79_132/0.12)]";

/**
 * Chips for the current selection plus a checklist — the Upwork categories pattern.
 * `searchable` adds a filter for longer lists such as cities.
 */
export function MultiSelectField<T extends string>({
  name,
  options,
  initial,
  labelFor,
  selectedLabel,
  searchLabel,
  searchable = false,
}: {
  name: string;
  options: readonly T[];
  initial: readonly T[];
  labelFor: (value: T) => string;
  selectedLabel: string;
  searchLabel?: string;
  searchable?: boolean;
}) {
  const t = useTranslations("companyProfileManager");
  const [selected, setSelected] = useState<T[]>([...initial]);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const toggle = (value: T) =>
    setSelected((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  const needle = query.trim().toLocaleLowerCase();
  const visible = options.filter((option) => !needle || labelFor(option).toLocaleLowerCase().includes(needle));

  return (
    <div>
      <p className="m-0 text-sm font-medium text-ink">{selectedLabel}</p>
      <div aria-live="polite" className="mt-2 flex min-h-10 flex-wrap gap-2">
        {selected.length === 0 ? <p className="m-0 self-center text-sm text-muted">{t("dialogs.noneSelected")}</p> : null}
        {selected.map((value) => (
          <button
            aria-label={t("dialogs.remove", { item: labelFor(value) })}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-brand-soft pr-2.5 pl-3.5 text-sm font-medium text-brand-dark transition-colors hover:bg-[#dbe8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            key={value}
            onClick={() => toggle(value)}
            type="button"
          >
            {labelFor(value)}
            <X aria-hidden className="size-3.5" />
          </button>
        ))}
      </div>
      {selected.map((value) => (
        <input key={value} name={name} type="hidden" value={value} />
      ))}
      <div className="mt-5 border-t border-brand-border pt-4">
        {searchable ? (
          <label className="relative mb-3 block" htmlFor={searchId}>
            <span className="sr-only">{searchLabel}</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              className={`${fieldClass} mt-0 pl-10`}
              id={searchId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchLabel}
              type="search"
              value={query}
            />
          </label>
        ) : null}
        <div className="grid gap-1 sm:grid-cols-2">
          {visible.map((option) => (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-sm text-ink transition-colors hover:bg-[#f7f9fb]"
              key={option}
            >
              <input
                checked={selected.includes(option)}
                className="size-4 accent-brand"
                onChange={() => toggle(option)}
                type="checkbox"
              />
              {labelFor(option)}
            </label>
          ))}
          {visible.length === 0 ? <p className="m-0 px-3 py-2 text-sm text-muted">{t("dialogs.noMatches")}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function readList<T extends string>(form: FormData, name: string) {
  return form.getAll(name).map(String) as T[];
}

export function optionalNumber(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
}
