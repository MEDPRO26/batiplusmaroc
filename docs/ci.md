# CI / PR pipeline

Feature-by-feature PRs into `main`, with GitHub Actions as the quality gate and Vercel as the deployer.

## Flow

1. Branch from up-to-date `main` (example: `feature/company-onboarding`).
2. Complete one feature slice (UI + Convex rules + FR/EN + tests as required by `docs/constitution.md`).
3. Push and open a PR → `main`.
4. CI runs on the PR: lint → typecheck → test → build.
5. If green, review and merge.
6. Pull `main` and start the next feature branch.

Do not wait until all of V1 is finished before opening PRs.

## Workflow

File: `.github/workflows/ci.yml`

Triggers:

- `pull_request` targeting `main`
- `push` to `main`

Required check name (for branch protection):

`lint-typecheck-test-build`

## Local equivalent

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Branch protection (required)

Until this is enabled, red CI does not block merges.

On GitHub → **Settings → Rules → Rulesets** (or **Branches**):

1. Target branch: `main`
2. Require a pull request before merging
3. Require status checks to pass → select **`lint-typecheck-test-build`**
4. Optional: require branch to be up to date before merging

Merge the CI workflow PR first so the check appears in the status list, then enable the rule.

## Vercel

- Production deploys from `main`
- Preview deploys from PRs (UI review)
- Vercel preview success is useful; it is **not** a substitute for GitHub Actions CI

Do not run `npx convex deploy` or seed scripts in PR CI.

## Optional Actions Variables

Build uses compile-only placeholders by default. You may set repo **Variables** (not secrets) to override:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `R2_PUBLIC_BASE_URL`

Keep R2 credentials and Convex Auth secrets on Convex / Vercel, not in Next.js CI.
