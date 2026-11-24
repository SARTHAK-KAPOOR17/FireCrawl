import axios from 'axios';
import * as cheerio from 'cheerio';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const CONCURRENCY =
  process.env.WORKER_CONCURRENCY ||
  process.argv.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] ||
  '1';

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
      // User exists, log in
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

async function runBenchmark() {
  console.log(`=== FireCrawl Benchmark (Target Concurrency: ${CONCURRENCY}) ===`);
  console.log(`Server URL: ${SERVER_URL}`);

  try {
    const token = await getAuthToken();
    console.log('Authenticated successfully.');

    const urls = await collect100BookUrls();
    if (urls.length < 100) {
      throw new Error(`Expected 100 URLs, but only collected ${urls.length}`);
    }

    console.log('Creating job and queuing scrape run...');
    const createRes = await axios.post(
      `${SERVER_URL}/jobs`,
      {
        name: `Benchmark 100 Books (Concurrency ${CONCURRENCY})`,
        urls,
        selectors: {
          title: 'h1',
          price: '.price_color',
          availability: '.availability',
        },
        mode: 'static',
        runNow: true,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const { job, run } = createRes.data;
    console.log(`Job Created: ID=${job._id}, Run ID=${run._id}`);
    console.log('Polling run progress...');

    const startTime = Date.now();
    let completedRun = null;

    while (!completedRun) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const runsRes = await axios.get(`${SERVER_URL}/jobs/${job._id}/runs`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const currentRun = runsRes.data?.runs?.[0];
      if (currentRun) {
        const processed =
          (currentRun.pagesScraped || 0) +
          (currentRun.pagesFailed || 0) +
          (currentRun.pagesSkipped || 0);

        process.stdout.write(
          `\rProgress: ${processed}/${currentRun.totalUrls} | Scraped: ${currentRun.pagesScraped} | Failed: ${currentRun.pagesFailed} | Skipped: ${currentRun.pagesSkipped} | Status: ${currentRun.status}`
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
        ? new Date(completedRun.finishedAt).getTime() -
          new Date(completedRun.startedAt).getTime()
        : Date.now() - startTime);

    const totalSeconds = (durationMs / 1000).toFixed(2);
    const avgMsPerPage = (durationMs / completedRun.totalUrls).toFixed(1);
    const pagesPerSec = (
      completedRun.pagesScraped /
      (durationMs / 1000 || 1)
    ).toFixed(2);

    console.log('\n### Benchmark Results\n');
    console.log('| Metric | Value |');
    console.log('|---|---|');
    console.log(`| WORKER_CONCURRENCY | ${CONCURRENCY} |`);
    console.log(`| Final Status | ${completedRun.status} |`);
    console.log(`| Total Time | ${totalSeconds}s (${durationMs}ms) |`);
    console.log(`| Total URLs | ${completedRun.totalUrls} |`);
    console.log(`| Pages Scraped | ${completedRun.pagesScraped} |`);
    console.log(`| Pages Failed | ${completedRun.pagesFailed} |`);
    console.log(`| Pages Skipped | ${completedRun.pagesSkipped} |`);
    console.log(`| Avg ms / Page | ${avgMsPerPage} ms |`);
    console.log(`| Throughput | ${pagesPerSec} pages/sec |`);
    console.log('\nBenchmark completed successfully.');
  } catch (error) {
    console.error('\nBenchmark failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

runBenchmark();
