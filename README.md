# LostMate AI

LostMate AI is a mobile-first, AI-assisted lost-and-found platform for campuses, offices, events, and public institutions. People describe a lost or found item naturally, add a photo when useful, review the extracted details, and explicitly confirm before a report is created. Staff review transparent match suggestions and document handovers.

## Architecture

This repository started as a Next.js + PostgreSQL + Drizzle runtime, so the production implementation uses that existing foundation as one shared web and Android frontend/backend boundary:

```text
Next.js App Router / React client
        |
        +-- Same-origin route handlers (or NEXT_PUBLIC_API_BASE_URL)
        |       |
        |       +-- Drizzle ORM -> PostgreSQL
        |       +-- Gemini adapter (optional, server-only)
        |       +-- Supabase Storage adapter (optional, server-only)
        |
        +-- Capacitor Android shell (same React application)
```

This preserves the requested one-codebase rule: Android does not duplicate business logic. The route handlers are intentionally separated so a deployed FastAPI service can replace the HTTP boundary later without changing the UI contracts. The current sandbox does not contain a Python service, and adding a disconnected FastAPI mock would make the application less reliable.

### Important runtime choices

- **Database:** PostgreSQL through Drizzle ORM. `src/db/schema.ts` is the source of truth.
- **Auth:** signed, HTTP-only cookie sessions with scrypt password hashing in `src/lib/auth.ts`. This is a runnable local adapter for the available repository. Supabase Auth can replace this adapter behind the same session/user contract when its project credentials and redirect configuration are available. No WebView Google OAuth is faked.
- **AI:** `src/lib/ai.ts` classifies intent before extraction. Gemini is called only on the server when `GEMINI_API_KEY` or `GOOGLE_GEMINI_API_KEY` is set. A deterministic, validated fallback keeps the core flow usable when Gemini is unavailable.
- **Matching:** `src/lib/matching.ts` combines item family, category, type, brand, color, location, time proximity, and description overlap. Obviously unrelated item families are heavily penalized. The stored result includes a confidence score, signals, and human-readable reasoning. pgvector/embeddings can be added behind this service later.
- **Storage:** `src/lib/storage.ts` uses the Supabase Storage REST API with the service-role key only on the server. Without storage credentials, local image preview still works and reports can be submitted without a persisted image.
- **Native:** `capacitor.config.ts`, `src/lib/native.ts`, and the generated `android/` project provide the shared Capacitor path. Native camera/gallery, Android back button, keyboard resize, and status-bar settings are isolated from browser behavior.

## Features implemented

- Public landing page with AI chat demonstration and clear lost/found CTAs.
- Email/password signup, login, logout, session persistence, and server-side role checks.
- Mobile-first app shell with safe-area support, one scroll region, persistent bottom navigation, and desktop sidebar navigation.
- Natural-language AI assistant with intent safety: greetings and casual conversation never create reports.
- Follow-up extraction for item, category, location, and approximate time, plus explicit confirmation before database mutation.
- Lost and found report persistence, optional image upload, holding location, and robust empty/loading/error states.
- Structured matching with confidence and explanations; no automatic certainty or auto-claiming.
- Staff dashboard statistics, responsive report queue, match review, claims, handover completion, and staff audit history.
- Mobile report cards instead of dense narrow tables; desktop table layout remains available.
- Capacitor Android project with camera/gallery, back-button, keyboard, and status-bar plugin integration.

## Database schema

`src/db/schema.ts` defines:

- `profiles`: email, password hash, role, display details, timestamps.
- `reports`: lost/found item details, AI metadata, location, time, image URL, holding location, status.
- `matches`: unique lost/found pair, confidence, explanation, signals, review state.
- `claims`: claimant, report/match, notes, status, handover location.
- `staff_actions`: append-only review/claim activity for the audit trail.

Indexes cover role, report type/status, category, location, timestamps, match status/confidence, and claim status.

## API endpoints

### Auth

- `POST /api/auth/signup` — create a user and set a session.
- `POST /api/auth/login` — sign in; local demo credentials are provisioned on first use.
- `POST /api/auth/logout` — clear the session.
- `GET /api/auth/me` — return the current safe user.

### Reports and AI

- `POST /api/assistant` — classify intent and return validated extraction/follow-up data. This route never writes a report.
- `GET /api/reports` — current user reports, or staff queue; supports `type` and `q`.
- `POST /api/reports` — create a lost/found report only when `confirmed: true` is supplied.
- `POST /api/uploads` — validate a JPG/PNG/WebP data URL and upload to configured Supabase Storage.

### Review operations

- `GET /api/matches` — user-relevant matches or staff match queue.
- `PATCH /api/matches/:id` — staff accept/reject a suggestion.
- `GET /api/claims` — claims for the current user or all staff claims.
- `POST /api/claims` — authenticated user requests a claim.
- `PATCH /api/claims/:id` — staff approve, reject, or complete a handover.
- `GET /api/dashboard` — staff-only statistics and recent audit activity.
- `GET /api/health` — database-backed health check.

## Setup

### Requirements

- Node.js 20+
- npm
- PostgreSQL 14+
- Android Studio + Android SDK only if building the native app
- Optional: Gemini API key and a Supabase project with a public storage bucket

### Local web app

```bash
cp .env.example .env
# Set DATABASE_URL and SESSION_SECRET in .env
npm install
npx drizzle-kit push
npm run dev
```

Open `http://localhost:3000`.

The first local sign-in can use the demo buttons in the auth modal:

- Demo user: `demo@lostmate.demo` / `demo-user-2026`
- Staff view: `staff@lostmate.demo` / `demo-staff-2026`

These accounts are provisioned only when those exact demo credentials are used. Remove that convenience from `src/app/api/auth/login/route.ts` before a public production deployment.

### Gemini

Set `GEMINI_API_KEY` (or `GOOGLE_GEMINI_API_KEY`) in the server `.env`. The key is read only by the route-side AI adapter. If it is missing or Gemini times out, the app returns a clearly labeled fallback extraction and continues to work.

### Supabase Storage

Create a bucket named `lostmate-images` or set `SUPABASE_STORAGE_BUCKET`. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the server environment. The service-role key must never be exposed to browser code. Configure bucket policies appropriate to your deployment; the adapter uses the public object URL after upload.

For a future Supabase Auth deployment, keep the UI/user contract and replace the functions in `src/lib/auth.ts` with an SSR-safe Supabase Auth adapter. For Android, use email/password or a native deep-link OAuth plugin; do not run normal browser Google OAuth inside a WebView.

## Capacitor / Android

The Android project is checked into `android/` and has been generated and synced with the current Capacitor plugins.

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

For a deployed web app, set `CAPACITOR_SERVER_URL` to its HTTPS URL before syncing. The native shell uses that URL and communicates with the same deployed backend. Do not use a localhost URL for a production APK. The `public/index.html` file is a valid Capacitor asset fallback; the configured deployed URL is the normal native entry point.

From Android Studio, select the generated `android/` project and run it on an emulator/device. Camera/gallery permissions are handled by `@capacitor/camera`; keyboard and status-bar behavior are configured in `capacitor.config.ts`. The shared React chat handles the returned camera data URL and the app shell registers Android back navigation.

## Production deployment

1. Provision PostgreSQL and set `DATABASE_URL` and a strong random `SESSION_SECRET`.
2. Run `npx drizzle-kit push` for a fresh database, or use your normal migration pipeline.
3. Set optional Gemini and Supabase Storage secrets only on the server.
4. Set `NEXT_PUBLIC_API_BASE_URL` only when the API is hosted separately; leave it empty for same-origin Next route handlers.
5. Deploy the Next app behind HTTPS.
6. Set `CAPACITOR_SERVER_URL` to the HTTPS deployment and run `npx cap sync android` before opening Android Studio.
7. Configure secure cookies, Supabase bucket policies, rate limiting, backups, and monitoring at the hosting layer.

## Known limitations

- The available repository is a Next.js runtime, not a Vite + FastAPI + Supabase starter. The implementation keeps the existing deployable runtime rather than adding an untested second server.
- The local auth adapter uses PostgreSQL profiles and signed cookies. A Supabase Auth adapter is documented but not enabled without Supabase project credentials.
- Image persistence requires Supabase Storage configuration; without it, the UI handles image preview and graceful omission rather than pretending a URL was stored.
- Matching currently uses transparent structured/text signals, not pgvector embeddings or visual similarity. The service boundary is ready for that upgrade.
- The Android project is generated and `npx cap sync android` passes in this repository; an APK still requires Android Studio/SDK signing configuration.
- Rate limiting, email notifications, production CSRF strategy, and institution-specific moderation policies should be added before a public multi-tenant rollout.
