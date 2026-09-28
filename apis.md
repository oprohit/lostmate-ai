# External APIs & Environment Configuration

All production secrets must be configured via environment variables and never committed to source control or exposed in client bundles.

## Required Production Variables

### Backend / Server (Server-Only Secrets)
```bash
# Supabase PostgreSQL Connection URL
DATABASE_URL=postgresql://<user>:<password>@<pooler-host>:<port>/postgres

# Session Secret (HMAC Cookie Signing)
SESSION_SECRET=YOUR_SESSION_SECRET_HERE

# Google Gemini AI API Key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
GEMINI_MODEL=gemini-flash-latest

# Supabase Storage & Service API
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
SUPABASE_STORAGE_BUCKET=lostmate-images
```

### Frontend Safe Variables (Public / Client-Safe)
```bash
# Optional API Base URL. Leave empty when frontend & backend are deployed together.
# When deployed across separate origins (or on native Android), set to the deployed HTTPS backend URL.
NEXT_PUBLIC_API_BASE_URL=
```

### Capacitor Native Shell
```bash
# Deployed HTTPS URL for native APK shell entrypoint
CAPACITOR_SERVER_URL=https://your-deployment-url.example.com
```