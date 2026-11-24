# FireCrawl

Distributed web scraping and data extraction engine with real-time UI dashboard, BullMQ job queues, Redis caching, per-domain rate limiting, and analytics.

---

## Architecture Overview

FireCrawl is organized as an npm workspace monorepo:
- **`server/`**: Express REST API with MongoDB (Mongoose), JWT & OAuth authentication (Google & GitHub), Zod validation, centralized error handling, and stats aggregation pipelines.
- **`worker/`**: BullMQ distributed scraping worker with Cheerio static parsing, Redis HTML caching, batched atomic DB writes, per-domain rate limiting, and robots.txt compliance.
- **`client/`**: React SPA (Vite + Tailwind CSS + React Router + Recharts + Lucide icons) providing job management, real-time run progress polling, streaming CSV/JSON export, and KPI analytics.
- **`shared/`**: Common `@scraper/shared` library exporting Mongoose models, queue constants, and typed application exceptions.

---

## Frontend Dashboard Pages

The client application includes a responsive dashboard UI:

1. **Authentication (`/login`)**:
   - Secure email signup and login with form validation and user-friendly error banners.
   - One-click Google and GitHub OAuth single sign-on with secure one-time code exchange.
2. **Jobs List (`/jobs`)**:
   - Overview of all created scraping jobs with status badges (`idle`, `queued`, `running`, `completed`, `failed`).
   - One-click "Run Now" action triggering immediate BullMQ scraping runs.
   - Quick access to job details, URLs count, and last run stats.
3. **Create Job (`/jobs/new`)**:
   - Form to define job name and dynamic target URLs (1–500 URLs supported).
   - Dynamic CSS selector key-value mappings (e.g. `title: h1`, `price: .price`).
   - Scrape mode selection (`static` HTML or `dynamic`).
   - Optional immediate run trigger on creation.
4. **Job Detail (`/jobs/:id`)**:
   - **Results Tab**: Paginated scraped data table with search query filtering and streaming export buttons (CSV and JSON) featuring formula injection neutralization.
   - **Runs Tab**: Execution history showing runtime duration, pages scraped, pages skipped, cache hits, duplicates, and robots blocked with error tags.
   - **Settings Tab**: Configuration summary with option to trigger run with **Force Refresh** bypassing the Redis HTML cache.
   - **Live Progress Polling**: Automatic 2-second polling hook (`useRunProgress`) that tracks running jobs and pauses when the browser tab is hidden (`document.hidden`).
5. **Analytics & Stats (`/stats`)**:
   - KPI metrics cards: Total Jobs, Total Runs, Pages Scraped, Pages Failed, Scrape Success Rate, Cache Hit Rate, and Average Page Latency.
   - Visual charts powered by Recharts:
     - 14-day scraping activity bar chart (runs count and pages scraped per day).
     - Failure reasons breakdown and deduplication statistics.

---

## Local Development & Setup

### Prerequisites
- Node.js >= 18
- Docker & Docker Compose (for local MongoDB & Redis)

### 1. Start Infrastructure Services
```bash
docker compose -f docker-compose.dev.yml up -d
```
Starts MongoDB on `localhost:27017` and Redis on `localhost:6379`.

### 2. Configure Environment Variables
Copy `.env.example` in each package:
```bash
cp server/.env.example server/.env
cp worker/.env.example worker/.env
cp client/.env.example client/.env
```

### 3. Run Development Servers
```bash
# Start backend API (runs on http://localhost:3000)
npm run dev --prefix server

# Start worker service (processes "scrape-url" BullMQ queue)
npm run dev --prefix worker

# Start frontend application (runs on http://localhost:5173)
npm run dev --prefix client
```

---

## Running Tests

Run unit and integration test suites:
```bash
# Server tests (Jest - auth, jobs, stats, export, exceptions, efficiency)
npm test --prefix server

# Client tests (Vitest - UI kit, protected routes, pages, polling hook)
npm test --prefix client
```

---

## Documentation

- [Realtime Progress Architecture](docs/realtime.md)
- [Error Handling & Exceptions](docs/errors.md)
- [Screenshots Directory](docs/screenshots/)
