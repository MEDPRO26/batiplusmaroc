import { build } from "esbuild";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

let harnessBundle = "";

test.beforeAll(async () => {
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    stdin: {
      contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import { ReviewDialog } from "./features/projects/components/review-dialog";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";

        function Harness() {
          const locale = window.__reviewLocale || "en";
          const [open, setOpen] = useState(false);
          const [submitted, setSubmitted] = useState(null);
          return <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
            <button onClick={() => setOpen(true)} type="button">Open review test</button>
            {open ? <ReviewDialog busy={false} error="" onCancel={() => setOpen(false)} onSubmit={(draft) => { setSubmitted(draft); setOpen(false); }} /> : null}
            <output data-testid="submission">{submitted ? JSON.stringify(submitted) : ""}</output>
          </NextIntlClientProvider>;
        }
        createRoot(document.getElementById("root")).render(<Harness />);
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  harnessBundle = result.outputFiles[0].text;
});

async function mountReviewDialog(page: Page, locale: "en" | "fr") {
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate((value) => { (window as Window & { __reviewLocale?: string }).__reviewLocale = value; }, locale);
  await page.addScriptTag({ content: harnessBundle });
  await page.getByRole("button", { name: "Open review test" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("typing and rating changes preserve independent review state", async ({ page }) => {
  await mountReviewDialog(page, "en");
  const comment = page.getByRole("textbox", { name: "Your review" });
  const fourthStar = page.getByRole("radio", { name: "4 stars" });
  const fifthStar = page.getByRole("radio", { name: "5 stars" });

  await fourthStar.click();
  await comment.click();
  await comment.pressSequentially("More than one word", { delay: 5 });
  await expect(comment).toHaveValue("More than one word");
  await expect(fourthStar).toHaveAttribute("aria-checked", "true");
  await expect(comment).toBeFocused();

  const sentence = " with a long, clear sentence about reliable construction work and communication throughout the project.";
  await comment.pressSequentially(sentence, { delay: 1 });
  const beforeRatingChange = await comment.inputValue();
  expect(beforeRatingChange.length).toBeGreaterThan(100);

  await fifthStar.click();
  await expect(comment).toHaveValue(beforeRatingChange);
  await expect(fifthStar).toHaveAttribute("aria-checked", "true");
  await comment.focus();
  await comment.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length));
  await comment.pressSequentially(" Delivery stayed professional.", { delay: 2 });
  await expect(comment).toHaveValue(`${beforeRatingChange} Delivery stayed professional.`);
  await expect(fifthStar).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("validation rejects a short comment and submits a valid draft", async ({ page }) => {
  await mountReviewDialog(page, "en");
  const comment = page.getByRole("textbox", { name: "Your review" });
  await page.getByRole("radio", { name: "4 stars" }).click();
  await comment.fill("short");
  await page.getByRole("button", { name: "Publish review" }).click();
  await expect(page.getByRole("alert")).toContainText("between 10 and 2,000 characters");
  await expect(page.getByTestId("submission")).toBeEmpty();
  await expect(page.getByRole("dialog")).toBeVisible();

  await comment.fill("Exactly valid review text.");
  await page.getByRole("button", { name: "Publish review" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("submission")).toContainText('"rating":4');
  await expect(page.getByTestId("submission")).toContainText("Exactly valid review text.");

  await page.getByRole("button", { name: "Open review test" }).click();
  await expect(page.getByRole("textbox", { name: "Your review" })).toHaveValue("");
  await expect(page.getByRole("radio", { name: "1 stars" })).toHaveAttribute("aria-checked", "false");
});

test("French controls retain a multi-word comment across rating changes", async ({ page }) => {
  await mountReviewDialog(page, "fr");
  const comment = page.getByRole("textbox", { name: "Votre avis" });
  const text = "Très bonne entreprise, travail sérieux et communication claire pendant tout le projet.";
  await page.getByRole("radio", { name: "4 étoiles" }).click();
  await comment.pressSequentially(text, { delay: 2 });
  await page.getByRole("radio", { name: "5 étoiles" }).click();
  await expect(comment).toHaveValue(text);
  await comment.focus();
  await comment.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length));
  await comment.pressSequentially(" Je recommande cette entreprise.", { delay: 2 });
  await expect(comment).toHaveValue(`${text} Je recommande cette entreprise.`);
  await page.getByRole("button", { name: "Publier l’avis" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("submission")).toContainText('"rating":5');
  await expect(page.getByTestId("submission")).toContainText(`${text} Je recommande cette entreprise.`);
});
