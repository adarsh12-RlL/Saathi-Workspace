# SAATHI web app

This Next.js App Router project is the responsive PWA layer for SAATHI. It imports the framework-neutral cloud controller from the parent `cloud/` folder and keeps account-bound state behind the verified Supabase Auth boundary.

## Run locally

```powershell
Set-Location -LiteralPath 'C:\Users\coool\projects\saathi-workspace\web'
Copy-Item .env.example .env.local
# Fill the two NEXT_PUBLIC_* values in .env.local, then:
npm run dev
```

With empty configuration, the app deliberately shows a setup screen. It does not create a mock account or seed fake missions. After valid public Supabase configuration, the app verifies the session, shows sign-in/sign-up, and then loads the owner-bound mission list.

## Checks

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

The web app currently provides mission capture, list, edit, optimistic revision-aware save, soft archive and sync state. The constrained mini-app renderer migration and offline queue are the next UI slices. See the parent [cloud integration handoff](../cloud/INTEGRATION.md).
