# R2 public media

Batiplus retains legacy Company covers and other existing public marketplace media
in Cloudflare R2. New Company logos, Company covers and portfolio cover/gallery
images use private Convex Storage with exact-file moderation. See
[Company cover moderation](company-cover-moderation-v1.md),
[portfolio image moderation](portfolio-image-moderation-v1.md) and
[Company logo moderation](company-logo-moderation-v1.md). Private Company
verification documents also use Convex Storage.

## Runtime configuration

Set these values on the Convex deployment only:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- `R2_PUBLIC_BASE_URL`

`R2_PUBLIC_BASE_URL` is not a secret. Set the same value in the Vercel project
so `next/image` can add the exact delivery host at build time. Never copy R2
credentials to `.env.local` and never prefix them with `NEXT_PUBLIC_`.

For production, connect an R2 custom domain (for example,
`https://media.batiplusmaroc.com`) and use that origin as
`R2_PUBLIC_BASE_URL`. The Cloudflare-managed `r2.dev` URL is suitable only for
development.

## Browser upload CORS

The bucket CORS policy must allow direct `PUT` uploads from both application
origins and the `Content-Type` request header:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://www.batiplusmaroc.com"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Keep public bucket access read-only. Writes happen only through short-lived,
object-specific presigned URLs.

## Legacy portfolio rollout

Existing `coverImageStorageId`, `coverMediaId`, `portfolioMedia.storageId` and
`publicMediaId` records/files are retained but treated as unreviewed, with no
application portfolio URL fallback. Previously issued URLs may remain public.
A separately authorized rollout must inventory those links/caches and review
new private copies or re-uploads per file. No legacy file is migrated, deleted
or automatically approved by the moderation backend.
