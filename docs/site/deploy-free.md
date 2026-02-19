# Free Deployment Guide

This project can be deployed at zero cost using:
- GitHub (free)
- Cloudflare Pages (free)
- Supabase free tier (already used for data/auth)

## 1. Push code to GitHub
If this folder is already committed locally, run:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 2. Create Cloudflare Pages project
1. Go to Cloudflare Dashboard -> Workers & Pages -> Create Application -> Pages -> Connect to Git.
2. Select your GitHub repo.
3. Set build settings:
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

## 3. Add environment variables (Pages)
Set these in Cloudflare Pages project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_MOCK_CONNECTORS=false`

Optional:
- `NODE_VERSION=20`

## 4. Deploy
- Click Deploy.
- After build succeeds, open your `*.pages.dev` URL.

## 5. Verify
- App loads and routing works (SPA fallback handled by `wrangler.jsonc` asset config).
- Login and chat load correctly.
- BYOK key can be added in app settings.
