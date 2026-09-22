const STORAGE_KEY = "batiplus.oauthSignup";
const MAX_AGE_MS = 30 * 60 * 1000;

export type OAuthSignupIntent = {
  accountType: "client" | "company";
  acceptedTerms: true;
  marketingOptIn: boolean;
  createdAt: number;
};

export function saveOAuthSignupIntent(intent: {
  accountType: "client" | "company";
  marketingOptIn: boolean;
}) {
  if (typeof window === "undefined") return;
  const payload: OAuthSignupIntent = {
    accountType: intent.accountType,
    acceptedTerms: true,
    marketingOptIn: intent.marketingOptIn,
    createdAt: Date.now(),
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function consumeOAuthSignupIntent(): OAuthSignupIntent | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OAuthSignupIntent>;
    if (parsed.accountType !== "client" && parsed.accountType !== "company") return null;
    if (parsed.acceptedTerms !== true) return null;
    if (typeof parsed.createdAt !== "number") return null;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) return null;
    return {
      accountType: parsed.accountType,
      acceptedTerms: true,
      marketingOptIn: parsed.marketingOptIn === true,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
