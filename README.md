# AASTU Gibi Gubae — Resource App Backend

Express + TypeScript REST API powering the AASTU Gibi Gubae freshman course resource app — Stream → Department → Course → Resource browsing, premium access via manual payment approval, and device-bound content protection.

## Tech Stack

- **Runtime:** Node.js + Express 5 + TypeScript 7
- **Database:** PostgreSQL (Neon) via Prisma ORM
- **File storage:** Cloudflare R2

## Getting Started

1. Clone the repo and install dependencies:
```bash
   npm install
```

2. Copy the environment template and fill in real values:
```bash
   cp .env.example .env
```

3. Run database migrations:
```bash
   npx prisma migrate dev
```

4. Start the dev server (auto-restarts on file changes):
```bash
   npm run dev
```

   Server runs on `http://localhost:3000` by default. Confirm it's up:
```bash
   curl http://localhost:3000/health
```

## Project Structure
```
src/
app.ts # Configured Express app (middleware + routers, no .listen())
server.ts # Starts the HTTP server + scheduled jobs
modules/ # One folder per business domain
auth/ # Login, signup, token issuance/refresh
users/ # Core User entity (no routes — internal only)
catalog/ # Stream/Department/Course/Resource + browse/access logic
premium/ # Manual payment approval flow
device/ # Device fingerprint activation/revocation
issues/ # Resource issue reporting
notifications/ # In-app notifications
infrastructure/ # Cross-cutting technical concerns
database/ # Prisma client singleton
storage/ # Cloudflare R2 client
security/ # JWT signing/verification, password hashing
audit/ # Admin action logging
shared/ # Reusable code with no business logic of its own
middleware/ # Auth guards, upload handling, error handling, rate limiting
errors/ # Typed application error classes
types/ # Shared TypeScript types (e.g. Express request augmentation)
validation/ # Reusable validation schemas
utils/ # Small helpers with no dependencies on modules/
jobs/ # Scheduled background tasks
config/ # Environment validation, app-wide constants
prisma/
schema.prisma
tests/
integration/
```

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with auto-restart on changes |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build (production) |
| `npm run prisma:generate` | Regenerate the Prisma client after schema changes |
| `npm run prisma:migrate` | Create and apply a new database migration |

## Branching & Contributing

- `main` is always in a deployable state. **Never push directly to `main`.**
- All work happens on a `feature/<name>` branch off `main`, merged via Pull Request.
- Before starting new work: `git checkout main && git pull` first, so your branch starts from the latest `main`.

## Environment Variables

See `.env.example` for the full list of required variables and what each one is for.