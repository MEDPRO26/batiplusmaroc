# R2 public media

Batiplus stores public marketplace images in Cloudflare R2. Private company
verification documents continue to use Convex Storage.

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

## Legacy portfolio migration

Existing `coverImageStorageId` and `portfolioMedia.storageId` records remain
readable. A later migration can copy each public image to a company-scoped R2
key, verify the R2 object with HEAD, create its `publicMedia` metadata row, and
atomically switch the portfolio reference. Keep the old Convex Storage object
until the migrated URL has been audited in production; deletion requires a
separate, explicitly approved cleanup pass.
