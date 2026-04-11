# Supabase backup

1. Create a project at [supabase.com](https://supabase.com) (you can sign in with GitHub).
2. **Project Settings → API**
   - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`
   - Copy **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`  
     This JWT is required for `npm run backup:supabase` to write rows. Do not expose it in the browser.
3. **SQL Editor → New query** → paste the contents of `migrations/20260208120000_admin_storage_backup.sql` → **Run**.

After that, from the project root:

```bash
npm run shelf:sync
```

(Older alias: `npm run backup:supabase` — same script.)

Dry run (list files only, no upload):

```bash
npm run shelf:sync -- --dry-run
```

This uploads JSON from `data/admin/` into `public.admin_storage_backup` (one row per file).

**Security:** If any API key was shared in chat or committed by mistake, rotate it in the Supabase dashboard and update `.env.local`.
