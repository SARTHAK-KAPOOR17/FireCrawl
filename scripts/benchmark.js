import axios from 'axios';
import * as cheerio from 'cheerio';
import Redis from 'ioredis';
import { AppError } from '@scraper/shared';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';

function parseArgs() {
  const args = process.argv.slice(2);
  let concurrency = process.env.WORKER_CONCURRENCY || '5';
  let label = 'Phase 3 Efficiency Benchmark';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--concurrency=')) {
      concurrency = arg.split('=')[1];
    } else if (arg === '--concurrency' && args[i + 1]) {
      concurrency = args[++i];
    } else if (arg.startsWith('--label=')) {
      label = arg.split('=')[1];
    } else if (arg === '--label' && args[i + 1]) {
      label = args[++i];
    }
  }

  return { concurrency, label };
}

const { concurrency: CONCURRENCY, label: BENCHMARK_LABEL } = parseArgs();

const BENCHMARK_USER = {
  email: 'benchmark@example.com',
  password: 'BenchmarkPassword123!',
  name: 'Benchmark Runner',
};

async function getAuthToken() {
  try {
    const signupRes = await axios.post(`${SERVER_URL}/auth/signup`, BENCHMARK_USER);
    return signupRes.data.token;
  } catch (err) {
    if (err.response?.status === 409) {
      const loginRes = await axios.post(`${SERVER_URL}/auth/login`, {
        email: BENCHMARK_USER.email,
        password: BENCHMARK_USER.password,
      });
      return loginRes.data.token;
    }
    throw err;
  }
}

async function collect100BookUrls() {
  console.log('Collecting 100 distinct URLs from books.toscrape.com...');
  const distinctUrls = new Set();
  let page = 1;

  while (distinctUrls.size < 100 && page <= 10) {
    const pageUrl = `https://books.toscrape.com/catalogue/page-${page}.html`;
    try {
      const res = await axios.get(pageUrl, { timeout: 10000 });
      const $ = cheerio.load(res.data);

      $('article.product_pod h3 a').each((_, el) => {
        let href = $(el).attr('href');
        if (href) {
          href = href.replace(/^(\.\.\/)+/, '').replace(/^catalogue\//, '');
          const fullUrl = `https://books.toscrape.com/catalogue/${href}`;
          distinctUrls.add(fullUrl);
        }
      });
    } catch (fetchErr) {
      console.error(`Error fetching page ${page}:`, fetchErr.message);
    }
    page++;
  }

  const urls = Array.from(distinctUrls).slice(0, 100);
  console.log(`Collected ${urls.length} distinct book URLs.`);
  return urls;
}

async function clearHtmlCache() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    let cursor = '0';
    let clearedCount = 0;
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'htmlcache:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        clearedCount += keys.length;
      }
    } while (cursor !== '0');
    console.log(`Cleared ${clearedCount} HTML cache keys in Redis.`);
  } catch (err) {
    console.warn('Could not clear Redis cache (is Redis running?):', err.message);
  } finally {
    try {
      await redis.quit();
    } catch (_) {}
  }
}

async function pollJobRunUntilComplete(token, jobId, runId) {
  const startTime = Date.now();
  let completedRun = null;

  while (!completedRun) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const runsRes = await axios.get(`${SERVER_URL}/jobs/${jobId}/runs`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const currentRun = runsRes.data?.runs?.find((r) => r._id === runId) || runsRes.data?.runs?.[0];
    if (currentRun) {
      const processed =
        (currentRun.pagesScraped || 0) +
        (currentRun.pagesFailed || 0) +
        (currentRun.pagesSkipped || 0);

      process.stdout.write(
        `\rProgress: ${processed}/${currentRun.totalUrls} | Scraped: ${currentRun.pagesScraped} | Failed: ${currentRun.pagesFailed} | Skipped: ${currentRun.pagesSkipped} | Hits: ${currentRun.cacheHits || 0} | Status: ${currentRun.status}`
      );

      if (currentRun.status !== 'running') {
        completedRun = currentRun;
        console.log('\n');
      }
    }
  }

  const durationMs =
    completedRun.durationMs ||
    (completedRun.finishedAt
      ? new Date(completedRun.finishedAt).getTime() - new Date(completedRun.startedAt).getTime()
      : Date.now() - startTime);

  return {
    ...completedRun,
    durationMs,
  };
}

async function runBenchmark() {
  console.log(`=== FireCrawl Benchmark ===`);
  console.log(`Label: ${BENCHMARK_LABEL}`);
  console.log(`Target Concurrency: ${CONCURRENCY}`);
  console.log(`Server URL: ${SERVER_URL}`);

  try {
    const token = await getAuthToken();
    console.log('Authenticated successfully.');

    const urls = await collect100BookUrls();
    if (urls.length < 100) {
      throw new AppError(`Expected 100 URLs, but only collected ${urls.length}`);
    }

    // --- COLD RUN ---
    console.log('\n>>> Starting COLD run (clearing Redis HTML cache)...');
    await clearHtmlCache();

    const createRes = await axios.post(
      `${SERVER_URL}/jobs`,
      {
        name: `Benchmark - ${BENCHMARK_LABEL} (Cold Run)`,
        urls,
        selectors: {
          title: 'h1',
          price: '.price_color',
          availability: '.availability',
        },
        mode: 'static',
        runNow: true,
        forceRefresh: false,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const { job, run: coldRunInitial } = createRes.data;
    console.log(`Job Created: ID=${job._id}, Cold Run ID=${coldRunInitial._id}`);
    const coldRun = await pollJobRunUntilComplete(token, job._id, coldRunInitial._id);

    // --- WARM RUN ---
    console.log('\n>>> Starting WARM run (same job, reading from cache)...');
    const warmStartRes = await axios.post(
      `${SERVER_URL}/jobs/${job._id}/run`,
      { forceRefresh: false },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const warmRunInitial = warmStartRes.data.run;
    console.log(`Warm Run ID=${warmRunInitial._id}`);
    const warmRun = await pollJobRunUntilComplete(token, job._id, warmRunInitial._id);

    // --- METRIC CALCULATIONS ---
    const coldDurationSec = (coldRun.durationMs / 1000).toFixed(2);
    const warmDurationSec = (warmRun.durationMs / 1000).toFixed(2);

    const coldThroughput = (
      (coldRun.pagesScraped || 0) / (coldRun.durationMs / 1000 || 1)
    ).toFixed(2);
    const warmThroughput = (
      ((warmRun.pagesScraped || 0) + (warmRun.duplicatesSkipped || 0)) /
      (warmRun.durationMs / 1000 || 1)
    ).toFixed(2);

    const coldSuccessRate = (
      ((coldRun.pagesScraped || 0) / (coldRun.totalUrls || 1)) *
      100
    ).toFixed(1);
    const warmSuccessRate = (
      (((warmRun.pagesScraped || 0) + (warmRun.pagesSkipped || 0)) / (warmRun.totalUrls || 1)) *
      100
    ).toFixed(1);

    const coldHitRate = (
      ((coldRun.cacheHits || 0) / (coldRun.totalUrls || 1)) *
      100
    ).toFixed(1);
    const warmHitRate = (
      ((warmRun.cacheHits || 0) / (warmRun.totalUrls || 1)) *
      100
    ).toFixed(1);

    console.log('\n### Benchmark Results\n');
    console.log(`**Label**: ${BENCHMARK_LABEL} | **Concurrency**: ${CONCURRENCY}\n`);
    console.log('| Metric | Cold Run | Warm Run |');
    console.log('| :--- | :--- | :--- |');
    console.log(`| Total Time | ${coldDurationSec}s (${coldRun.durationMs}ms) | ${warmDurationSec}s (${warmRun.durationMs}ms) |`);
    console.log(`| Throughput | ${coldThroughput} pages/sec | ${warmThroughput} pages/sec |`);
    console.log(`| Success Rate | ${coldSuccessRate}% | ${warmSuccessRate}% |`);
    console.log(`| Cache Hits | ${coldRun.cacheHits || 0} | ${warmRun.cacheHits || 0} |`);
    console.log(`| Cache Hit Rate | ${coldHitRate}% | ${warmHitRate}% |`);
    console.log(`| Duplicates Skipped | ${coldRun.duplicatesSkipped || 0} | ${warmRun.duplicatesSkipped || 0} |`);
    console.log(`| Robots Blocked | ${coldRun.robotsBlocked || 0} | ${warmRun.robotsBlocked || 0} |`);
    console.log(`| Status | ${coldRun.status} | ${warmRun.status} |`);
    console.log('\n> Note: DOMAIN_RATE_LIMIT_RPS affects cold-run speed. Warm run serves directly from the Redis HTML cache without rate limiting.\n');
  } catch (error) {
    console.error('\nBenchmark failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

runBenchmark();
