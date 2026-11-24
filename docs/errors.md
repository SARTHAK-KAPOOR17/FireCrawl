# Error Handling & Exceptions Reference

This document describes the unified error hierarchy, standard error codes, retry policies, and exception handling conventions across FireCrawl (`shared`, `server`, and `worker`).

---

## Error Catalog

| Error Code | HTTP Status | Retryable | Description |
| :--- | :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | No | Request payload, query, or parameters failed schema validation (e.g. Zod or Mongoose validation). |
| `INVALID_URL` | 400 | No | Target URL is malformed, missing, or has an unsupported protocol. |
| `AUTHENTICATION_ERROR` | 401 | No | Missing, invalid, or expired authentication token or invalid login credentials. |
| `AUTHORIZATION_ERROR` | 403 | No | Access denied due to insufficient permissions or resource ownership check failure. |
| `ROBOTS_DISALLOWED` | 403 | No | Target scraping URL is blocked according to `robots.txt` rules. |
| `SSRF_BLOCKED` | 403 | No | Target URL resolves to a private or loopback IP address (Server-Side Request Forgery protection). |
| `NOT_FOUND` | 404 | No | Requested route, job, run, result, or user does not exist. |
| `CONFLICT` | 409 | No | Resource conflict (e.g., duplicate email address, duplicate key 11000, or job run already active). |
| `PARSE_ERROR` | 422 | No | HTML content was malformed or failed parsing during extraction. |
| `NO_DATA_EXTRACTED` | 422 | No | Scraper completed but all requested selector fields evaluated to `null`/empty. |
| `RATE_LIMIT_EXCEEDED` | 429 | No | Incoming API rate limit exceeded by client. |
| `INTERNAL_ERROR` | 500 | No | Non-operational or unhandled internal error. Stack trace and sensitive info hidden in production. |
| `NETWORK_ERROR` | 502 | Yes | Network connection dropped, connection refused, or DNS resolution failed during scraping. |
| `TIMEOUT_ERROR` | 504 | Yes | Target request timed out waiting for connection or data response. |
| `RATE_LIMIT_WAIT_TIMEOUT` | 504 | Yes | Timed out waiting in the queue for a domain-specific rate limit slot. |
| `HTTP_STATUS_ERROR` | Dynamic | Dynamic (Yes for 5xx/429, No for 4xx) | Target server returned an error HTTP status. Retryable for server errors (5xx) or rate limits (429). |

---

## Core Principles & Architecture

### 1. Base Class: `AppError`
All custom errors extend `AppError` in `shared/src/exceptions/AppError.js`:
- `code` *(string)*: Machine-readable error code from `ErrorCodes`.
- `statusCode` *(number)*: Standard HTTP status code.
- `isOperational` *(boolean)*: `true` for expected domain errors; `false` for programmer/system bugs.
- `details` *(any)*: Optional metadata, field validation errors, or debug info.
- `retryable` *(boolean)*: Indicates whether worker jobs or clients should retry on this error.

### 2. Error Normalization: `normalizeError`
Located in `shared/src/exceptions/normalizeError.js`, this utility intercepts errors from external libraries and normalizes them into `AppError` subclasses:
- **Axios**: Maps timeouts to `TimeoutError`, HTTP errors to `HttpStatusError`, and network errors to `NetworkError`.
- **Mongoose**: Maps duplicate key `11000` to `ConflictError`, validation errors to `ValidationError`, and invalid IDs to `ValidationError`.
- **JWT**: Maps `JsonWebTokenError` and `TokenExpiredError` to `AuthenticationError`.
- **Zod**: Maps validation failures to `ValidationError` with structured `{ field, message }` details.
- **Generic/Unknown**: Wrapped as non-operational `AppError` with status 500 (`INTERNAL_ERROR`).

### 3. Server Handling & Response Format
- **`asyncHandler`**: Wraps async controller routes to forward rejections to the central handler.
- **Central `errorHandler`**:
  - Always formats client responses as:
    ```json
    {
      "success": false,
      "code": "ERROR_CODE",
      "message": "Human readable message",
      "details": []
    }
    ```
  - Logs 4xx errors as `warn` and 5xx errors as `error` with `requestId`, `userId`, and `route`.
  - In production (`NODE_ENV=production`), hides internal error messages and stack traces for non-operational errors.
- **Process Handlers**: Dedicated handlers catch `uncaughtException` and `unhandledRejection`, log errors, and gracefully exit.

### 4. Worker Retry Policy & Run Tracking
- **`retryPolicy`**: Inspects scraped errors. If an error is non-retryable (`!err.retryable`), it wraps the error in BullMQ's `UnrecoverableError` to immediately halt failed retries. Retryable errors are rethrown to leverage BullMQ exponential backoff.
- **Atomic Failure Tracking**: On terminal failure, `runTracker.js` atomically updates `JobRun`:
  - `failureReasons`: Map of `code -> count` tracking failure categories.
  - `failedUrls`: Capped list (last 50) of `{ url, code, message }` entries using MongoDB `$slice: -50`.
