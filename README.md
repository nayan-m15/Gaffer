# Sport Coaching Tool

Development foundation for a sport coaching platform with a React/Vite frontend
and NestJS backend.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Base UI,
  Lucide, TanStack Query, Socket.io client, Oxlint
- Backend: NestJS, TypeScript, Drizzle ORM, PostgreSQL/Neon driver, Zod,
  better-auth, Socket.io, Swagger/OpenAPI
- Testing: Jest, Supertest, Playwright

## Setup

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

Copy `.env.example` to `.env` when database or auth secrets are available.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
```

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:3000`.
Swagger docs are available at `http://localhost:3000/api/docs`.

## Structure

```text
SportCoachingTool/
├── frontend/
├── backend/
├── docs/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
