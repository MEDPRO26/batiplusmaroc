import { defineApp } from "convex/server";
import { v } from "convex/values";

export default defineApp({
  env: {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
  },
});
