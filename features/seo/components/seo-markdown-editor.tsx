"use client";

import {
  Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered,
  Pilcrow, Quote, Redo2, Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { SeoMediaPicker, type SeoMediaSelection } from "@/features/seo/components/seo-media-picker";
import { SEO_PRESS } from "@/features/seo/components/seo-workspace-shell";

type Props = {
  value: string;
  onChange: (value: string) => void;
  locale: "fr" | "en";
  disabled?: boolean;
};

type History = { values: string[]; index: number };

export function SeoMarkdownEditor({ value, onChange, locale, disabled = false }: Props) {
  const t = useTranslations("seoCms.editor.toolbar");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<History>({ values: [value], index: 0 });
  const internalValue = useRef(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (value === internalValue.current) return;
    internalValue.current = value;
    historyRef.current = { values: [value], index: 0 };
    const frame = window.requestAnimationFrame(() => {
      setHistoryAvailability({ canUndo: false, canRedo: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  function commit(next: string, selectionStart?: number, selectionEnd?: number) {
    const history = historyRef.current;
    const values = history.values.slice(0, history.index + 1);
    if (values.at(-1) !== next) values.push(next);
    historyRef.current = { values: values.slice(-100), index: Math.min(values.length - 1, 99) };
    internalValue.current = next;
    onChange(next);
    setHistoryAvailability({ canUndo: historyRef.current.index > 0, canRedo: false });
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea || selectionStart === undefined) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
    });
  }

  function replaceSelection(transform: (selected: string) => { text: string; startOffset?: number; endOffset?: number }) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const result = transform(value.slice(start, end));
    const next = `${value.slice(0, start)}${result.text}${value.slice(end)}`;
    commit(next, start + (result.startOffset ?? result.text.length), start + (result.endOffset ?? result.text.length));
  }

  function wrap(before: string, after = before, fallback = "") {
    replaceSelection((selected) => {
      const body = selected || fallback;
      return { text: `${before}${body}${after}`, startOffset: before.length, endOffset: before.length + body.length };
    });
  }

  function prefixLines(prefix: string | ((index: number) => string), stripExisting = false) {
    replaceSelection((selected) => {
      const source = selected || t("textPlaceholder");
      const text = source.split("\n").map((line, index) => {
        const clean = stripExisting ? line.replace(/^(?:#{1,3}|>|[-*]|\d+\.)\s+/, "") : line;
        return `${typeof prefix === "function" ? prefix(index) : prefix}${clean}`;
      }).join("\n");
      return { text, startOffset: 0, endOffset: text.length };
    });
  }

  function undo() {
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    const next = history.values[history.index] ?? "";
    internalValue.current = next;
    onChange(next);
    setHistoryAvailability({ canUndo: history.index > 0, canRedo: true });
  }

  function redo() {
    const history = historyRef.current;
    if (history.index >= history.values.length - 1) return;
    history.index += 1;
    const next = history.values[history.index] ?? "";
    internalValue.current = next;
    onChange(next);
    setHistoryAvailability({ canUndo: true, canRedo: history.index < history.values.length - 1 });
  }

  function insertImage(selection: SeoMediaSelection) {
    const alt = (selection.altText || selection.filename.replace(/\.[^.]+$/, "")).replace(/[\[\]]/g, "");
    replaceSelection(() => ({ text: `![${alt}](media:${selection.mediaId})`, startOffset: 0 }));
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#dfe3e8] bg-white focus-within:border-[#2f6bff] focus-within:ring-2 focus-within:ring-[#2f6bff]/15">
      <div aria-label={t("label")} className="flex flex-wrap gap-1 border-b border-[#e7eaee] bg-[#f7f8fa] p-2" role="toolbar">
        <ToolbarButton disabled={disabled} icon={<Pilcrow aria-hidden className="size-4" />} label={t("paragraph")} onClick={() => prefixLines("", true)} />
        <ToolbarButton disabled={disabled} icon={<Heading2 aria-hidden className="size-4" />} label={t("heading2")} onClick={() => prefixLines("## ", true)} />
        <ToolbarButton disabled={disabled} icon={<Heading3 aria-hidden className="size-4" />} label={t("heading3")} onClick={() => prefixLines("### ", true)} />
        <ToolbarButton disabled={disabled} icon={<Bold aria-hidden className="size-4" />} label={t("bold")} onClick={() => wrap("**", "**", t("textPlaceholder"))} />
        <ToolbarButton disabled={disabled} icon={<Italic aria-hidden className="size-4" />} label={t("italic")} onClick={() => wrap("*", "*", t("textPlaceholder"))} />
        <ToolbarButton disabled={disabled} icon={<List aria-hidden className="size-4" />} label={t("bulletList")} onClick={() => prefixLines("- ", true)} />
        <ToolbarButton disabled={disabled} icon={<ListOrdered aria-hidden className="size-4" />} label={t("numberedList")} onClick={() => prefixLines((index) => `${index + 1}. `, true)} />
        <ToolbarButton disabled={disabled} icon={<Quote aria-hidden className="size-4" />} label={t("blockquote")} onClick={() => prefixLines("> ", true)} />
        <ToolbarButton disabled={disabled} icon={<Link2 aria-hidden className="size-4" />} label={t("link")} onClick={() => wrap("[", "](https://)", t("linkPlaceholder"))} />
        <span aria-hidden className="mx-1 w-px self-stretch bg-[#dfe3e8]" />
        <ToolbarButton disabled={disabled} icon={<ImagePlus aria-hidden className="size-4" />} label={t("image")} onClick={() => setPickerOpen(true)} />
        <span aria-hidden className="mx-1 w-px self-stretch bg-[#dfe3e8]" />
        <ToolbarButton disabled={disabled || !historyAvailability.canUndo} icon={<Undo2 aria-hidden className="size-4" />} label={t("undo")} onClick={undo} />
        <ToolbarButton disabled={disabled || !historyAvailability.canRedo} icon={<Redo2 aria-hidden className="size-4" />} label={t("redo")} onClick={redo} />
      </div>
      <textarea
        aria-label={t("contentLabel")}
        className="min-h-80 w-full resize-y bg-white px-4 py-4 font-mono text-[0.9rem] leading-6 outline-none disabled:cursor-not-allowed disabled:bg-[#f4f6f8] disabled:opacity-70"
        disabled={disabled}
        onChange={(event) => commit(event.target.value)}
        ref={textareaRef}
        required
        value={value}
      />
      <SeoMediaPicker locale={locale} onClose={() => setPickerOpen(false)} onSelect={insertImage} open={pickerOpen} />
    </div>
  );
}

function ToolbarButton({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return <button aria-label={label} className={`grid size-11 place-items-center rounded-[10px] text-[#4d535a] hover:bg-white hover:text-[#17191d] disabled:cursor-not-allowed disabled:opacity-35 ${SEO_PRESS}`} disabled={disabled} onClick={onClick} title={label} type="button">{icon}</button>;
}
