export const SETTINGS_SECTIONS = ["profile", "contact", "verification"] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
