# SEO team access

The SEO workspace is not a public signup role. A deployment operator creates
the complete email/password identity and exact `seo_team` user in one internal
action. Password hashing and credential storage remain inside Convex Auth.

Always select the intended deployment explicitly.

## Create an SEO account from scratch

```sh
npx convex run seo/accounts:createSeoTeamAccount '{"email":"seo2@example.test","password":"TestPassword123!","confirmation":"CREATE_BATIPLUS_SEO_TEAM"}' --deployment dev
```

The action refuses existing client, company, and admin users. If the address is
already an SEO password account, the supplied password must match; the action
will never replace an existing password implicitly.

Sign in at `/fr/connexion` or `/en/connexion` with the supplied email and
password. The normal sign-in redirect sends the exact `seo_team` role to
`/fr/seo/dashboard` or `/en/seo/dashboard`.

## Revoke access

```sh
npx convex run seo/accounts:revokeSeoTeamUser '{"email":"seo@example.test","confirmation":"REVOKE_BATIPLUS_SEO_TEAM"}' --deployment dev
```

Revocation preserves the auth identity but removes the `seo_team` role, so the
backend guard denies the next request even if an auth session still exists.
Do not use production credentials or `--prod` while operating on development.
