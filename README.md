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
prisma/
src/
├── app.ts                  # Configured Express app (middleware + routers, no .listen())
├── server.ts               # Entry point: Starts HTTP server + initiates background jobs
│
├── modules/                # Domain-Driven Core (One folder per business capability)
│   ├── auth/               # Login, signup, session tokens & refresh issuance
│   ├── users/              # Core User domain (Internal service contracts only — no public routes)
│   ├── catalog/            # Streams, Departments, Courses, Resources & browsing controllers
│   ├── premium/            # Manual payment verification & administrative approval pipelines
│   ├── device/             # Hardware fingerprint bindings, device activations & revocations
│   ├── issues/             # User resource issue reporting & moderation tracking
│   └── notifications/      # Real-time state & internal web event updates
│
├── infrastructure/         # External System Adapters & Low-Level Modules
│   ├── database/           # Global Prisma Client engine singleton wrapper
│   ├── storage/            # Cloudflare R2 object bucket API connectors
│   ├── security/           # Token signatures, cryptographic validation & crypt-hashing
│   └── audit/              # Immutable admin lifecycle action logs
│
├── shared/                 # Business-Agnostic Core Reusable Primitives
│   ├── middleware/         # Identity guards, multer storage, global catch-alls & rate-limiters
│   ├── errors/             # Custom subclassed error tracking models
│   ├── types/              # Type extensions (e.g., Request context modifications)
│   ├── validation/         # Shared Zod data integrity structural schemas
│   └── utils/              # Pure algorithmic helper utilities
│
└── config/                 # Strong-typed runtime environment schemas & unchanging constants
│
prisma/
└── schema.prisma           # Core data relationship graph definition map
│
tests/
└── integration/            # Full-stack network controller integration pipelines
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

## Authentication API

All authenticated requests use `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/signup` | Create a student account with `name`, `email`, `phone`, and `password` |
| `POST` | `/auth/login` | Exchange email and password for access and refresh tokens |
| `POST` | `/auth/refresh` | Rotate a refresh token |
| `POST` | `/auth/logout` | Revoke a refresh token |
| `GET` | `/users/me` | Read the signed-in user's profile |
| `PATCH` | `/users/me` | Update `name` and/or `phone` |

Phone numbers are stored in normalized E.164 format. Ethiopian local mobile input such as `0912345678` is normalized to `+251912345678`.
