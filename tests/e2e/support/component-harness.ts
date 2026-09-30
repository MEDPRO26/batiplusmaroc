import { build, type Plugin } from "esbuild";
import type { Page } from "@playwright/test";

/**
 * Bundles real feature components against mocked Convex/navigation modules so pages can be
 * rendered with the app's compiled CSS without an authenticated session.
 * Queries resolve from `window.__queries[<function path>]`; mutations resolve from
 * `window.__mutationResults[<function path>]` and are counted in `window.__mutationCalls`.
 */
const mocks: Plugin = {
  name: "component-harness-mocks",
  setup(builder) {
    const mocked: Record<string, string> = {
      "convex/react": "convex-react",
      "@/i18n/navigation": "navigation",
      "@/convex/_generated/api": "api",
      "next/font/google": "next-font-google",
      "next/image": "image",
      "next/navigation": "next-navigation",
      "@convex-dev/auth/react": "convex-auth",
    };
    builder.onResolve({ filter: /^(convex\/react|@\/i18n\/navigation|@\/convex\/_generated\/api|next\/font\/google|next\/image|next\/navigation|@convex-dev\/auth\/react)$/ }, (args) => ({ path: mocked[args.path], namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => {
      const contents: Record<string, string> = {
        api: `
          const ref = (path) => new Proxy({}, { get: (_t, key) => key === "__path" ? path.join(".") : ref([...path, key]) });
          export const api = ref([]);
        `,
        "convex-react": `
          import { useEffect, useState } from "react";
          function useHarnessVersion() {
            const [, setVersion] = useState(0);
            useEffect(() => {
              const update = () => setVersion((value) => value + 1);
              window.addEventListener("convex-harness-update", update);
              return () => window.removeEventListener("convex-harness-update", update);
            }, []);
          }
          export function useQuery(query, args) {
            useHarnessVersion();
            if (args === "skip") return undefined;
            return window.__queries[query.__path];
          }
          export function usePaginatedQuery(query) {
            useHarnessVersion();
            const state = (window.__paginatedQueries || {})[query.__path] || { results: [], status: "Exhausted" };
            return {
              ...state,
              loadMore(numItems) {
                window.__paginationCalls = [...(window.__paginationCalls || []), { path: query.__path, numItems }];
                const handler = (window.__paginationHandlers || {})[query.__path];
                if (handler) handler(numItems);
              },
            };
          }
          export function useAction(action) { return useMutation(action); }
          export function useConvexConnectionState() { return { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 }; }
          export function useMutation(mutation) {
            return async (args) => {
              window.__mutationCalls = [...(window.__mutationCalls || []), { path: mutation.__path, args }];
              const delay = (window.__mutationDelays || {})[mutation.__path];
              if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
              const error = (window.__mutationErrors || {})[mutation.__path];
              if (error) throw new Error(error);
              const handler = (window.__mutationHandlers || {})[mutation.__path];
              if (handler) return await handler(args);
              return (window.__mutationResults || {})[mutation.__path] ?? {};
            };
          }
        `,
        navigation: `
          import React from "react";
          export function Link({ children, href, ...props }) {
            const url = typeof href === "string" ? href : Object.entries(href.params || {}).reduce((path, [key, value]) => path.replace(\`[\${key}]\`, value), href.pathname);
            const query = typeof href === "string" ? "" : new URLSearchParams(href.query || {}).toString();
            return <a href={query ? url + "?" + query : url} {...props}>{children}</a>;
          }
          export function useRouter() { return { replace() {}, push() {} }; }
          export function usePathname() { return window.__pathname || "/admin/verification"; }
          export function getPathname({ href, locale }) {
            const pathname = typeof href === "string" ? href : href.pathname;
            return "/" + locale + (pathname === "/" ? "" : pathname);
          }
        `,
        "convex-auth": `
          export function useAuthActions() { return { signIn: async () => undefined, signOut: async () => undefined }; }
        `,
        "next-navigation": `
          export function useParams() { return { locale: window.__locale }; }
        `,
        "next-font-google": `
          export function Outfit() { return { className: "font-outfit", variable: "--font-outfit", style: { fontFamily: "Outfit" } }; }
        `,
        image: `
          import React from "react";
          export default function Image({ fill, sizes, priority, ...props }) { return <img {...props} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined} />; }
        `,
      };
      return { loader: "jsx", resolveDir: process.cwd(), contents: contents[args.path] };
    });
  },
};

/** `render` is JSX source evaluated inside a NextIntlClientProvider; `imports` brings components into scope. */
export async function buildHarness(imports: string, render: string) {
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    plugins: [mocks],
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { NextIntlClientProvider } from "next-intl";
        import en from "./messages/en.json";
        import fr from "./messages/fr.json";
        ${imports}
        const locale = window.__locale;
        createRoot(document.getElementById("root")).render(
          <NextIntlClientProvider locale={locale} messages={locale === "fr" ? fr : en} timeZone="Africa/Casablanca">
            ${render}
          </NextIntlClientProvider>
        );
      `,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    write: false,
  });
  return result.outputFiles[0].text;
}

/** Loads the running app once to borrow its compiled stylesheets, then mounts the harness. */
export async function mountHarness(page: Page, bundle: string, state: Record<string, unknown>) {
  await page.goto("/en");
  const styles = await page.$$eval('link[rel="stylesheet"]', (links) => links.map((link) => (link as HTMLLinkElement).href));
  await page.setContent(`<html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><div id="root"></div></body></html>`, { waitUntil: "load" });
  await page.evaluate((values) => Object.assign(window, values), state);
  await page.addScriptTag({ content: bundle });
}

export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}
