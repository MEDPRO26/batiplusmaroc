# Development first-admin bootstrap

Batiplus does not expose admin as a public signup role. Password and OAuth signup can create only `client` or `company` accounts.

Use this operator-only flow to create the first administrator in a development deployment:

1. Create a normal development account and verify that its email is stored in the development deployment.
2. From the repository root, run the internal mutation with the exact development account email:

   ```sh
   npx convex run internal.admin.bootstrap.promoteFirstAdmin '{"email":"admin@example.test","confirmation":"PROMOTE_FIRST_BATIPLUS_ADMIN"}' --deployment dev
   ```

3. Sign out and sign back in, then open `/fr/admin` or `/en/admin`.

The mutation is `internal`, so a browser or unauthenticated public API client cannot invoke it. It requires Convex deployment operator credentials, is idempotent for the first promoted account, and refuses to bootstrap a different account after an admin exists.

Always select the development deployment explicitly. Do not add `--prod` or use production credentials for development bootstrap. Future admin-management functions must require the stored admin role on the backend; they are intentionally outside this foundation step.
