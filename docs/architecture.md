# Architecture & Working Diagrams

FireCrawl is a high-throughput, fault-tolerant web scraping and structured data extraction engine built with Node.js, Express, BullMQ, Redis, MongoDB, and React. It features an automated **rule-based extraction pipeline**, an **opt-in AI fallback with self-healing CSS selectors**, and a **sub-250ms real-time event streaming layer**.

---

## Table of Contents
1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [End-to-End Scraping Pipeline Flowchart](#2-end-to-end-scraping-pipeline-flowchart)
3. [Real-Time WebSocket Streaming Sequence](#3-real-time-websocket-streaming-sequence)
4. [Self-Healing Selector Lifecycle](#4-self-healing-selector-lifecycle)
5. [Database Data Models & Relationships](#5-database-data-models--relationships)
6. [Interactive UI Walkthrough & Screenshot Gallery](#6-interactive-ui-walkthrough--screenshot-gallery)

---

## 1. High-Level System Architecture

The following diagram illustrates the interaction between the frontend client, backend API gateway, BullMQ job queues, distributed worker pool, Redis caching and pub/sub layer, AI fallback service, and MongoDB persistence.

```mermaid
flowchart TB
    subgraph ClientLayer["Frontend Client (React + Vite + Tailwind)"]
        UI["SPA Dashboard (Jobs, Detail, Stats)"]
        SocketHook["useRunProgress Hook (Socket.io Client)"]
    end

    subgraph ServerLayer["API Gateway (Express.js)"]
        Auth["Auth & JWT Middleware"]
        JobRoutes["Job & Run Controllers"]
        StatsRoutes["Stats & Analytics Aggregator"]
        SocketServer["Socket.io Server (@socket.io/redis-adapter)"]
    end

    subgraph MessageLayer["Redis (In-Memory Infrastructure)"]
        BullQueue["BullMQ Job Queue ('scrape-queue')"]
        HtmlCache["SHA-256 HTML Cache (TTL: 1 hour)"]
        PubSub["Pub/Sub Channel ('scrape:events')"]
    end

    subgraph WorkerLayer["Distributed Worker Engine"]
        Processor["Queue Processor"]
        CheerioScraper["Rule-Based Scraper (Cheerio)"]
        AiFallbackEngine["AI Fallback Engine (Gemini Flash)"]
        ResultWriter["Batched Result Writer (25 docs / 200ms)"]
        EventThrottle["Event Throttle & Publisher (250ms Buffer)"]
    end

    subgraph StorageLayer["Persistence (MongoDB)"]
        MongoUsers[("Users Collection")]
        MongoJobs[("Jobs Collection")]
        MongoRuns[("JobRuns Collection")]
        MongoResults[("Results Collection")]
    end

    %% Client to Server
    UI -->|REST API Requests (JWT)| Auth
    Auth --> JobRoutes
    Auth --> StatsRoutes
    SocketHook <-->|WebSocket Events| SocketServer

    %% Server to Redis & Mongo
    JobRoutes -->|Enqueue Jobs| BullQueue
    JobRoutes --> MongoJobs
    StatsRoutes --> MongoRuns
    SocketServer <-->|Adapter Sync| PubSub

    %% Worker Execution
    BullQueue --> Processor
    Processor -->|Check Cache| HtmlCache
    Processor --> CheerioScraper
    CheerioScraper -.->|On Missing Fields| AiFallbackEngine
    AiFallbackEngine -->|Reverse Selector Test| CheerioScraper
    AiFallbackEngine -.->|Update Discovered Selectors| MongoJobs
    Processor --> ResultWriter
    ResultWriter -->|Unordered insertMany| MongoResults
    Processor --> EventThrottle
    EventThrottle -->|Publish Batch Events| PubSub
```

---

## 2. End-to-End Scraping Pipeline Flowchart

Every URL processed by the scraping worker moves through a multi-tier pipeline designed for optimal speed, cache reusability, fault isolation, and cost containment.

```mermaid
flowchart TD
    Start([Worker picks up URL job]) --> RobotsCheck{Robots.txt Disallowed?}
    RobotsCheck -- Yes --> BlockRobots[Record RobotsDisallowedError & Increment robotsBlocked]
    BlockRobots --> NextUrl([Finish URL])

    RobotsCheck -- No --> CacheCheck{Force Refresh or Cache Miss?}
    CacheCheck -- Cache Hit --> UseCache[Load HTML from Redis Cache]
    CacheCheck -- Cache Miss / Bypass --> FetchNet[HTTP GET via Axios with Retry Policy]

    FetchNet --> FetchSuccess{HTTP 2xx & < 2MB?}
    FetchSuccess -- Yes --> WriteCache[Store in Redis: htmlcache:sha256]
    WriteCache --> ParseHtml[Parse DOM via Cheerio]
    FetchSuccess -- No / Timeout --> ClassifyErr[Classify Scrape Error & Apply Retry Backoff]
    ClassifyErr --> TerminalCheck{Max Retries Exceeded?}
    TerminalCheck -- No --> FetchNet
    TerminalCheck -- Yes --> RecordFailure[Record in JobRun.failedUrls & failureReasons]
    RecordFailure --> NextUrl

    UseCache --> ParseHtml
    ParseHtml --> RuleExtraction[Extract Fields via CSS Selectors]
    RuleExtraction --> MissingCheck{Any Fields Missing & aiFallback Enabled?}

    MissingCheck -- No (All Found) --> BuildResult[Build Result with extractedBy: 'selector']
    MissingCheck -- Yes --> CleanHtml[Clean DOM: Strip Scripts, Styles, SVG, Hidden Elements]
    CleanHtml --> CallGemini[Invoke Gemini Flash Structured JSON API]

    CallGemini --> ValidateAi{Valid Structured Output?}
    ValidateAi -- No --> FallbackPartial[Keep Partial Selector Fields]
    ValidateAi -- Yes --> ReverseVerify{Suggested Selector Verified on Raw HTML?}
    ReverseVerify -- Verified --> UpdateJobMeta[Store in Job.suggestedSelectors & extractedBy: 'suggested']
    ReverseVerify -- Unverified / Direct --> FallbackAi[extractedBy: 'ai']

    UpdateJobMeta --> BuildResult
    FallbackAi --> BuildResult
    FallbackPartial --> BuildResult

    BuildResult --> BufferWriter[Add to ResultWriter Buffer]
    BufferWriter --> BatchCheck{Buffer >= 25 or Timer >= 200ms?}
    BatchCheck -- Yes --> InsertBatch[Result.insertMany unordered: false]
    InsertBatch --> HandleDups{E11000 Duplicate Key?}
    HandleDups -- Duplicate --> IncDup[Increment duplicatesSkipped & pagesSkipped]
    HandleDups -- Inserted --> IncScraped[Increment pagesScraped]

    IncDup --> RunTracker[Update JobRun State]
    IncScraped --> RunTracker
    RunTracker --> ThrottleCheck{250ms Throttle Elapsed?}
    ThrottleCheck -- Yes --> PublishEvents[Publish page:batch & run:progress to Redis Pub/Sub]
    ThrottleCheck -- No --> BufferEvent[Buffer event for next flush]

    PublishEvents --> CheckRunEnd{All URLs Processed?}
    BufferEvent --> CheckRunEnd
    CheckRunEnd -- No --> NextUrl
    CheckRunEnd -- Yes --> FinalizeRun[Atomic Finalization: Emit run:finished & set status: completed]
```

---

## 3. Real-Time WebSocket Streaming Sequence

To avoid overwhelming client browsers during massive multi-thousand URL scrapes, the worker enforces a **250ms batching throttle** on `page:done` events before publishing over Redis Pub/Sub to the Socket.io gateway.

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker Scraper
    participant ET as EventThrottle (250ms)
    participant R as Redis Pub/Sub
    participant S as Server Gateway
    participant C as Client (useRunProgress)

    C->>S: WebSocket Connect (auth: { token })
    S-->>C: Connection Authenticated & Join Room (user_<id>)
    C->>S: Request Snapshot: GET /jobs/:id/runs/latest
    S-->>C: Return Current Snapshot { scraped, failed, skipped, total }

    loop Processing URLs
        W->>W: Process URL (Cheerio / AI Fallback)
        W->>ET: recordPageDone({ url, outcome, code, cached })
        alt Throttle Timer < 250ms
            ET->>ET: Buffer into current batch array
        else Throttle Timer >= 250ms
            ET->>R: PUBLISH 'scrape:events' { type: 'page:batch', pages: [...] }
            ET->>R: PUBLISH 'scrape:events' { type: 'run:progress', scraped, total }
            R->>S: Deliver events to Redis Adapter
            S->>C: Emit 'page:batch' & 'run:progress' to user room
            C->>C: Update Progress Bar & Append to Dark Terminal Log
        end
    end

    W->>R: PUBLISH 'scrape:events' { type: 'run:finished', status: 'completed', durationMs }
    R->>S: Deliver run:finished
    S->>C: Emit 'run:finished'
    C->>C: Stop Polling / Finalize Run State in UI
```

---

## 4. Self-Healing Selector Lifecycle

When website markup shifts and selectors break, FireCrawl's AI fallback bridges the gap while repairing future runs.

```mermaid
sequenceDiagram
    autonumber
    participant Dom as Target Web Page
    participant Worker as Scraping Engine
    participant LLM as Gemini Flash 2.5
    participant DB as MongoDB (Job Model)
    participant UI as Dashboard Client

    Worker->>Dom: Fetch page HTML
    Worker->>Worker: Run CSS Selector: `.old-price-class`
    Worker-->>Worker: Extraction returns null (Markup Changed!)
    Worker->>Worker: Clean DOM (remove scripts, styles, noise)
    Worker->>LLM: Send cleaned snippet with extraction schema
    LLM-->>Worker: { price: "$49.99", suggestedSelector: "span[data-price]" }
    Worker->>Worker: Test `span[data-price]` against original raw HTML
    Note over Worker: Verification confirmed: selector returns "$49.99"
    Worker->>DB: Save to Job.suggestedSelectors["price"]
    Worker->>DB: Save Result with meta.extractedBy = "suggested"
    UI->>DB: Fetch Job Details
    UI-->>UI: Display Alert: "1 New Self-Healing Selector Discovered"
    UI->>UI: User clicks "Apply Selected (1)"
    UI->>DB: PATCH /jobs/:id (Promote suggestedSelector to active selector)
    Note over Worker,UI: Next run executes 100% rule-based via Cheerio at 0 LLM cost!
```

---

## 5. Database Data Models & Relationships

The MongoDB persistence layer uses 4 primary collections linked with indexed relations:

```mermaid
erDiagram
    User ||--o{ Job : owns
    User ||--o{ JobRun : triggers
    Job ||--o{ JobRun : executes
    Job ||--o{ Result : generates
    JobRun ||--o{ Result : contains

    User {
        ObjectId _id PK
        string email UK
        string password
        string name
        string provider
        date createdAt
    }

    Job {
        ObjectId _id PK
        ObjectId userId FK
        string name
        string status
        string mode
        array urls
        map selectors
        map suggestedSelectors
        boolean aiFallback
        object schedule
        date createdAt
    }

    JobRun {
        ObjectId _id PK
        ObjectId jobId FK
        ObjectId userId FK
        string status
        number totalUrls
        number pagesScraped
        number pagesFailed
        number pagesSkipped
        number duplicatesSkipped
        number robotsBlocked
        number cacheHits
        number aiFallbackPages
        number aiCalls
        number aiTokensIn
        number aiTokensOut
        map failureReasons
        array failedUrls
        date startedAt
        date finishedAt
        number durationMs
    }

    Result {
        ObjectId _id PK
        ObjectId jobId FK
        ObjectId runId FK
        string url
        string contentHash
        object data
        object meta
        date scrapedAt
    }
```

---

## 6. Interactive UI Walkthrough & Screenshot Gallery

All views are fully responsive, styled with Tailwind CSS, and equipped with friendly error states, badges, and progress indicators.

### 6.1 Authentication & Access Control
The entry portal supports secure credential login and one-click Google/GitHub OAuth integrations with JWT token generation and automated refresh handling.

![Authentication & Login](screenshots/login.png)

---

### 6.2 Scraping Jobs Overview
A centralized command center displaying all configured scraping jobs, operational statuses (`IDLE`, `RUNNING`, `QUEUED`, `COMPLETED`), URL counts, creation dates, and action controls for manual execution, cache-bypassing force refreshes, and deletion.

![Scraping Jobs Dashboard](screenshots/jobs_list.png)

---

### 6.3 Job Creation & AI Fallback Configuration
An interactive job configuration form featuring dynamic URL parsing with real-time validation counters, key-value CSS selector mappings, and an opt-in toggle for Gemini AI fallback extraction.

![Create Job Form](screenshots/create_job.png)

---

### 6.4 Extracted Tabular Results & Provenance Badging
The primary data exploration view displays scraped records with individual field provenance tags (`selector`, `suggested`, `ai`), real-time search filtering, and one-click sanitized CSV/JSON streaming export.

![Job Detail Results](screenshots/job_detail_results.png)

---

### 6.5 Execution Diagnostics & Run History
An expandable diagnostic view tracking run execution histories, execution latencies, scrape/fail/skip counts, Redis cache hits, AI token expenditures, and full error breakdown cards for failed targets.

![Job Detail Run History & Diagnostics](screenshots/job_detail_progress.png)

---

### 6.6 Real-Time Progress & Streaming Terminal
Active jobs feature live Socket.io streaming progress bars, percent counters, connection mode pills (`Realtime (Socket.io)` vs `Polling Fallback`), and real-time page outcome updates.

![Live Running Progress](screenshots/job_detail_live_progress.png)

---

### 6.7 Self-Healing Selector Management
The Job Configuration view allows developers to inspect CSS selectors discovered by AI, review the sample URLs and verification timestamps, and promote them to active selectors with a single click.

![Self-Healing Selectors Management](screenshots/job_detail_settings.png)

---

### 6.8 Platform Analytics & AI Cost Performance
Comprehensive performance analytics showing 14-day scraping throughput charts, global success and cache hit rates, failure code breakdowns, and AI self-healing efficiency statistics.

![Platform Analytics Dashboard](screenshots/stats_analytics.png)
