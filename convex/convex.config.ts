import migrations from "@convex-dev/migrations/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    ADMIN_SITE_VISIT_GEOGRAPHY_POLICY_VERSION: v.optional(v.literal("indexed_v1")),
    COMPANY_HEADQUARTERS_POLICY_VERSION: v.optional(v.literal("structured_v1")),
    VERIFICATION_WEB_ORIGINS: v.optional(v.string()),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
  },
});

app.use(migrations);

export default app;
