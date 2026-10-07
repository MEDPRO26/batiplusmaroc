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
      "next/link": "next-link",
      "next/navigation": "next-navigation",
      "next-intl/server": "next-intl-server",
      "@convex-dev/auth/react": "convex-auth",
    };
    builder.onResolve({ filter: /^(convex\/react|@\/i18n\/navigation|@\/convex\/_generated\/api|next\/font\/google|next\/image|next\/link|next\/navigation|next-intl\/server|@convex-dev\/auth\/react)$/ }, (args) => ({ path: mocked[args.path], namespace: "mock" }));
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
            window.__queryCalls = [...(window.__queryCalls || []), query.__path];
            const handler = (window.__queryHandlers || {})[query.__path];
            if (handler) return handler(args);
            return window.__queries[query.__path];
          }
          export function useConvex() { return { async query(query, args) {
            window.__directQueryCalls = [...(window.__directQueryCalls || []), { path: query.__path, args }];
            const handler = (window.__queryHandlers || {})[query.__path];
            return handler ? await handler(args) : window.__queries[query.__path];
          } }; }
          export function usePaginatedQuery(query, args, options) {
            useHarnessVersion();
            window.__queryCalls = [...(window.__queryCalls || []), query.__path];
            window.__paginatedArgs = [...(window.__paginatedArgs || []), { path: query.__path, args, options }];
            const queryHandler = (window.__paginatedQueryHandlers || {})[query.__path];
            const state = (queryHandler ? queryHandler(args) : (window.__paginatedQueries || {})[query.__path]) || { results: [], status: "Exhausted" };
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
          export function useConvexAuth() { return { isAuthenticated: false, isLoading: false }; }
          export function useConvexConnectionState() { return { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 }; }
          export function useMutation(mutation) {
            return async (args) => {
              window.__mutationCalls = [...(window.__mutationCalls || []), { path: mutation.__path, args }];
              try {
              const delay = (window.__mutationDelays || {})[mutation.__path];
              if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
              const error = (window.__mutationErrors || {})[mutation.__path];
              if (error) throw new Error(error);
              const handler = (window.__mutationHandlers || {})[mutation.__path];
              if (handler) return await handler(args);
              return (window.__mutationResults || {})[mutation.__path] ?? {};
              } finally {
                window.__mutationCompletions = [...(window.__mutationCompletions || []), mutation.__path];
              }
            };
          }
        `,
        // Plain Next links use the same anchor behavior as localized links in this standalone harness.
        "next-link": `export { Link as default } from "@/i18n/navigation";`,
        navigation: `
          import React from "react";
          export function Link({ children, href, ...props }) {
            const url = typeof href === "string" ? href : Object.entries(href.params || {}).reduce((path, [key, value]) => path.replace(\`[\${key}]\`, value), href.pathname);
            const query = typeof href === "string" ? "" : new URLSearchParams(href.query || {}).toString();
            return <a href={query ? url + "?" + query : url} {...props}>{children}</a>;
          }
          const navigate = (method) => (href) => { window.__navigationCalls = [...(window.__navigationCalls || []), { method, href }]; };
          export function useRouter() { return { replace: navigate("replace"), push: navigate("push") }; }
          export function usePathname() { return window.__pathname || "/admin/verification"; }
          export function getPathname({ href, locale }) {
            const pathname = typeof href === "string" ? href : href.pathname;
            return "/" + locale + (pathname === "/" ? "" : pathname);
          }
        `,
        "convex-auth": `
          export function useAuthActions() { return { signIn: async () => undefined, signOut: async () => undefined }; }
          export function useAuthToken() { return window.__authToken ?? null; }
        `,
        "next-navigation": `
          export function useParams() { return { locale: window.__locale }; }
        `,
        "next-intl-server": `
          import { createTranslator, createFormatter } from "next-intl";
          import en from "@/messages/en.json";
          import fr from "@/messages/fr.json";
          export async function getTranslations(namespace) { return createTranslator({ locale: window.__locale, messages: window.__locale === "fr" ? fr : en, namespace }); }
          export async function getLocale() { return window.__locale; }
          export async function getFormatter() { return createFormatter({ locale: window.__locale, timeZone: "Africa/Casablanca" }); }
        `,
        "next-font-google": `
          export function Outfit() { return { className: "font-outfit", variable: "--font-outfit", style: { fontFamily: "Outfit" } }; }
        `,
        image: `
          import React from "react";
          export default function Image({ fill, sizes, priority, unoptimized, ...props }) { return <img {...props} data-unoptimized={unoptimized || undefined} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined} />; }
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
    define: { "process.env.NODE_ENV": '"test"', "process.env.NEXT_PUBLIC_CONVEX_SITE_URL": '"https://verification-test.convex.site"' },
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

/** Borrow real CSS without leaving Next's hydrated app/HMR running behind the mocked component. */
export async function mountHarness(page: Page, bundle: string, state: Record<string, unknown>) {
  const response = await page.request.get("/en");
  if (!response.ok()) throw new Error(`Harness stylesheet page returned ${response.status()}`);
  const html = await response.text();
  const url = response.url();
  const styles = [...new Set([...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"]+)"[^>]*>/g)]
    .map((match) => new URL(match[1].replaceAll("&amp;", "&"), url).href))];
  if (!styles.length) throw new Error("Harness stylesheet page contained no stylesheets");
  const shell = `<html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("")}</head><body><div id="root"></div></body></html>`;
  const serveShell = (route: import("@playwright/test").Route) => route.fulfill({ contentType: "text/html", body: shell });
  await page.route(url, serveShell);
  try {
    // A navigation creates a fresh JavaScript realm. setContent on a live Next
    // page lets its pending hydration overwrite the harness and delay "load".
    await page.goto(url);
  } finally {
    await page.unroute(url, serveShell);
  }
  await page.evaluate((values) => Object.assign(window, values), state);
  await page.addScriptTag({ content: bundle });
}

export async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}
