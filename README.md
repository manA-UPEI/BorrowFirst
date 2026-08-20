# BorrowFirst

BorrowFirst is a simple lending app for UPEI users. Students can register, list items, request items, approve requests, and rate each other.

## Tech Stack

- Backend: JavaScript with Node.js and Express
- Frontend: HTML, CSS, and vanilla JavaScript
- Database: PostgreSQL

## Project Structure

```text
src/
  domain/          Business entities and policies
  application/     Use cases and dependency ports
  infrastructure/  Database and external-service adapters
  interface/       HTTP adapters and response mapping

server/
  db/            PostgreSQL connection, migration runner, and pagination helpers
  db/migrations/ Numbered SQL migrations, applied in order at startup
  middleware/    Session protection
  models/        Database queries
  routes/        API routes and page routes

public/
  css/           Styles
  images/        Static images
  js/            Browser controllers and shared helpers
  views/         HTML pages
```

The backend API is organized using Clean Architecture boundaries. Typed domain/application code owns business workflows, typed HTTP adapters own request/response translation, and the existing PostgreSQL, email, image-storage, and session implementations are infrastructure adapters behind application ports. The frontend remains vanilla JavaScript in this phase.

## Database Migrations

Schema changes live in `server/db/migrations` as numbered `.sql` files. The runner
(`server/db/migrate.js`) applies any file not yet recorded in the `schema_migrations`
table, one transaction per file, on every startup. Migrations are never edited once
they have shipped -- add a new file instead.

To add one, create the next numbered file:

```bash
touch server/db/migrations/006_add_categories.sql
```

Two constraints on what you can write in them:

- The suite and DATABASE_URL-less local development run on `pg-mem`, which implements
  a subset of Postgres. `REPLACE`, correlated subqueries referencing the outer table,
  and `INSERT ... SELECT` with a correlated `NOT EXISTS` are not supported; standard
  `SUBSTRING`, `UPDATE ... FROM`, `DISTINCT ON`, `ILIKE`, and `LEFT JOIN` are.
- Better Auth's Kysely queries always double-quote identifiers, so its camelCase
  columns must stay quoted in SQL that touches the `session`, `account`, or
  `verification` tables.

## Development Commands

```bash
npm run build
npm test
npm start
```

`npm test` runs ESLint, then `tsc`, then the Node test runner. TypeScript output is
generated in `dist/` and is not committed.

```bash
npm run lint
```

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Copy `.env.example` to `.env` and fill in the SMTP section for OTP email delivery.

Required values:

- `SESSION_SECRET`
- `APP_ORIGIN`
- `DATABASE_URL` for production or for persistent local development
- `NODE_ENV` and `PORT` as needed for your environment
- Either:
  - `RESEND_API_KEY` and `OTP_FROM_EMAIL`
  - or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `OTP_FROM_EMAIL`

Optional but recommended for deployment:

- `TRUST_PROXY=1` when running behind a reverse proxy or platform load balancer
- `SESSION_NAME` if you want a custom cookie name
- `TRANSACTION_CODE_SECRET` if you do not want transaction codes derived from `SESSION_SECRET`
- `REGISTRATION_OTP_ENABLED=false` if you want to temporarily bypass OTP verification and create accounts immediately

3. Start the app:

```bash
npm start
```

4. Open:

```text
http://localhost:3000/login
```

## Demo Data

The app no longer seeds a demo account automatically on startup.

If you want sample data for local development, run:

```bash
npm run seed:demo
```

## Features

- Register and login with a `@upei.ca` email
- Email-based OTP verification during signup
- View available products
- Search products on the home page
- Create new product listings
- Choose pickup options for a product
- Send borrow requests
- Approve or reject requests
- View profile details and ratings
- Rate users after approved lending/borrowing interactions, with later ratings updating the previous score

## Production Notes

- Sessions are stored in PostgreSQL instead of Express's in-memory store.
- Security headers are enabled, including a restrictive Content Security Policy.
- Health checks are available at `/healthz`.
- Origin checks protect all state-changing API routes.
- PostgreSQL-backed rate limiting is applied to login, OTP, and rating submission endpoints.
- In production, the app requires a configured `SESSION_SECRET`, `APP_ORIGIN`, `DATABASE_URL`, and OTP email delivery.
- For free Render deployments, use `RESEND_API_KEY` instead of SMTP because free Render web services cannot send mail over SMTP port `587`.
- If `REGISTRATION_OTP_ENABLED=false`, OTP delivery is bypassed and email credentials are not required.

## Notes

- Outside production, if `DATABASE_URL` is omitted, the app falls back to an in-memory Postgres-compatible database for tests and temporary local development.
- Uploaded item images are stored in Cloudinary, with image metadata stored in PostgreSQL.
- OTP signup email delivery requires either Resend or SMTP credentials in `.env`.
