# Fixing Vercel "404 NOT_FOUND" After Deploy

Your error (`This page doesn't exist — 404 NOT_FOUND`) means **Vercel received the request but found no matching file/route to serve**. The `bom1::...` string at the bottom is just a Vercel request trace ID (it confirms the request *did* reach Vercel — so this is not a DNS or deployment-down problem; it's a routing/build problem).

## Common causes (check in this order)

### 1. The build produced no output files (most common for static/Supabase apps)
If Vercel's **Output Directory** setting points to a folder that doesn't exist after the build, every route returns 404.

- Vercel Dashboard → your project → **Settings → Build & Development Settings**
- Make sure:
  - **Build Command**: correct for your framework (e.g. `npm run build`; empty for plain HTML)
  - **Output Directory**: e.g. `dist` (Vite), `build` (CRA), `.vercel/output/static` (Next.js static), or `public` / `.` for plain static sites
- Then check the actual build log: **Deployments → latest deployment → Building → View Build Logs**. Look for lines like:
  - `No Output Directory named "dist" found after the Build completed` → fix the Output Directory name.
  - Build errors (missing dependency, failed install) → the deploy may have used an old/no output.

### 2. You're opening a sub-route (SPA client-side routing)
If the homepage works but `/login`, `/history`, etc. return 404, Vercel needs a rewrite so all unknown paths fall back to `index.html`.

I've added a ready-to-use **`vercel.json`** in this repo root:

```json
{
  "rewrites": [
    { "source": "/((?!api/|_next/|assets/|.*\\..*).*)", "destination": "/index.html" }
  ]
}
```

Commit and push it (or paste it into your repo), then redeploy. For **Next.js** apps you don't need this — instead make sure the framework preset is detected correctly (see cause 4).

### 3. Wrong URL / project not deployed to Production
- In Vercel Dashboard → **Deployments**, confirm the latest deployment status is **Ready** (not Error/Canceled/Queued).
- Confirm you're visiting the **Production** URL, not an expired Preview URL.
- If your custom domain shows 404 but the `*.vercel.app` URL works, the domain isn't pointed at the right project (Settings → Domains).

### 4. Framework mis-detection
Vercel Dashboard → Settings → General → **Framework Preset**. If it says "Other" for a Next.js/Vite app, set it explicitly, or add the proper config file (`next.config.js`, `vite.config.js`) and `package.json` scripts.

## ⚠️ Important note about this repository

The repo I can see (`periodtracker` — "Supabase Period Tracker App") currently contains **only `README.md`** — there is no application code, `package.json`, or build configuration committed. That alone would cause Vercel to deploy an empty site and return 404 on every page.

Please verify:
1. Your app source was actually **committed and pushed** to the branch Vercel imports from (`git status`, `git log --stat`).
2. Vercel is importing the correct repo **and branch** (Settings → Git → Production Branch).
3. Required environment variables for Supabase are set: Vercel → Settings → Environment Variables → `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `..._ANON_KEY` (names must match what your code reads).

If you share the **build logs** from the failing deployment (Deployments → latest → Building → copy the log text), I can pinpoint the exact fix.
