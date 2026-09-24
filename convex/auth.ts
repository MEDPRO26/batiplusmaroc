import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import {
  buildPasswordProfile,
  createOrUpdateAuthUser,
  validatePasswordRequirements,
} from "./lib/authSecurity";

const PasswordProvider = Password<DataModel>({
  profile: buildPasswordProfile,
  validatePasswordRequirements,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordProvider, Google],
  callbacks: {
    createOrUpdateUser: createOrUpdateAuthUser,
  },
});
