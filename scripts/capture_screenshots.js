const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MOCK_API_PORT = 5000;
const CLIENT_PORT = 4173;
const CDP_PORT = 9222;
const DIST_DIR = path.resolve(__dirname, '../client/dist');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ----------------------------------------------------
// 1. Mock API Server (Port 5000)
// ----------------------------------------------------
const mockUser = {
  id: 'usr_7f89b',
  _id: 'usr_7f89b',
  name: 'Alex Mercer',
  email: 'alex.mercer@scraper.io',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
};

const mockJobs = [
  {
    _id: 'job_101',
    name: 'E-Commerce Best Sellers & Live Pricing',
    status: 'idle',
    mode: 'static',
    aiFallback: true,
    urls: [
      'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
      'https://books.toscrape.com/catalogue/category/books/mystery_3/index.html',
      'https://books.toscrape.com/catalogue/category/books/historical-fiction_4/index.html',
      'https://books.toscrape.com/catalogue/category/books/sequential-art_5/index.html',
    ],
    selectors: {
      title: 'article.product_pod h3 a',
      price: '.price_color',
      rating: 'p.star-rating',
      availability: '.availability',
    },
    suggestedSelectors: {
      price: {
        selector: 'p.price_color',
        verifiedAt: '2026-11-25T08:30:00.000Z',
        sampleUrl: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
      },
      rating: {
        selector: 'p.star-rating',
        verifiedAt: '2026-11-25T08:30:00.000Z',
        sampleUrl: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
      },
    },
    createdAt: '2026-11-20T10:15:00.000Z',
  },
  {
    _id: 'job_102',
    name: 'TechCrunch AI Funding Rounds & Valuations',
    status: 'completed',
    mode: 'static',
    aiFallback: true,
    urls: [
      'https://techcrunch.com/category/artificial-intelligence/',
      'https://techcrunch.com/category/venture/',
    ],
    selectors: {
      headline: 'h2.post-block__title a',
      author: 'span.river-byline__authors a',
      summary: 'div.post-block__content',
    },
    createdAt: '2026-11-21T14:30:00.000Z',
  },
  {
    _id: 'job_103',
    name: 'Hacker News Front Page Top Discussions',
    status: 'running',
    mode: 'static',
    aiFallback: false,
    urls: [
      'https://news.ycombinator.com/',
      'https://news.ycombinator.com/news?p=2',
    ],
    selectors: {
      title: 'tr.athing .titleline > a',
      points: 'td.subtext .score',
      by: 'td.subtext .hnuser',
    },
    createdAt: '2026-11-22T09:00:00.000Z',
  },
  {
    _id: 'job_104',
    name: 'Shopify Merchant Competitor Inventory',
    status: 'idle',
    mode: 'static',
    aiFallback: true,
    urls: [
      'https://demo-store.myshopify.com/collections/all',
    ],
    selectors: {
      productName: 'h3.card-title',
      sku: 'span.sku',
      inStock: '.stock-level',
    },
    createdAt: '2026-11-23T11:45:00.000Z',
  },
];

const mockResults = [
  {
    _id: 'res_1',
    url: 'https://books.toscrape.com/catalogue/it-s-only-the-himalayas_981/index.html',
    data: {
      title: "It's Only the Himalayas",
      price: '£45.17',
      rating: 'Two',
      availability: 'In stock (19 available)',
    },
    meta: {
      extractedBy: {
        title: 'selector',
        price: 'suggested',
        rating: 'ai',
        availability: 'selector',
      },
    },
    scrapedAt: '2026-11-25T08:35:12.000Z',
  },
  {
    _id: 'res_2',
    url: 'https://books.toscrape.com/catalogue/full-moon-over-noahs-ark_980/index.html',
    data: {
      title: "Full Moon over Noah's Ark",
      price: '£49.43',
      rating: 'Four',
      availability: 'In stock (15 available)',
    },
    meta: {
      extractedBy: {
        title: 'selector',
        price: 'selector',
        rating: 'suggested',
        availability: 'selector',
      },
    },
    scrapedAt: '2026-11-25T08:35:14.000Z',
  },
  {
    _id: 'res_3',
    url: 'https://books.toscrape.com/catalogue/see-america_979/index.html',
    data: {
      title: 'See America: A Celebration of Our National Parks',
      price: '£21.14',
      rating: 'Three',
      availability: 'In stock (14 available)',
    },
    meta: {
      extractedBy: {
        title: 'selector',
        price: 'suggested',
        rating: 'ai',
        availability: 'selector',
      },
    },
    scrapedAt: '2026-11-25T08:35:15.000Z',
  },
  {
    _id: 'res_4',
    url: 'https://books.toscrape.com/catalogue/vagabonding-uncommon-guide_978/index.html',
    data: {
      title: 'Vagabonding: An Uncommon Guide to Long-Term World Travel',
      price: '£36.94',
      rating: 'Five',
      availability: 'In stock (8 available)',
    },
    meta: {
      extractedBy: {
        title: 'selector',
        price: 'selector',
        rating: 'selector',
        availability: 'selector',
      },
    },
    scrapedAt: '2026-11-25T08:35:18.000Z',
  },
  {
    _id: 'res_5',
    url: 'https://books.toscrape.com/catalogue/under-the-tuscan-sun_977/index.html',
    data: {
      title: 'Under the Tuscan Sun: At Home in Italy',
      price: '£37.33',
      rating: 'Three',
      availability: 'In stock (12 available)',
    },
    meta: {
      extractedBy: {
        title: 'selector',
        price: 'suggested',
        rating: 'suggested',
        availability: 'selector',
      },
    },
    scrapedAt: '2026-11-25T08:35:20.000Z',
  },
];

const mockRuns = [
  {
    _id: 'run_901',
    jobId: 'job_101',
    status: 'completed',
    startedAt: '2026-11-25T08:34:00.000Z',
    finishedAt: '2026-11-25T08:35:25.000Z',
    durationMs: 85200,
    totalUrls: 120,
    pagesScraped: 118,
    pagesFailed: 2,
    pagesSkipped: 14,
    duplicatesSkipped: 14,
    robotsBlocked: 0,
    cacheHits: 48,
    aiCalls: 8,
    aiFallbackPages: 8,
    aiTokensIn: 48500,
    aiTokensOut: 4120,
    failureReasons: {
      HTTP_429: 2,
    },
    failedUrls: [
      {
        url: 'https://books.toscrape.com/catalogue/category/books/travel_2/page-99.html',
        code: 'HTTP_429',
        message: 'Rate limit exceeded by target server (HTTP 429)',
      },
    ],
  },
  {
    _id: 'run_900',
    jobId: 'job_101',
    status: 'completed',
    startedAt: '2026-11-24T18:00:00.000Z',
    finishedAt: '2026-11-24T18:01:20.000Z',
    durationMs: 80100,
    totalUrls: 120,
    pagesScraped: 120,
    pagesFailed: 0,
    pagesSkipped: 5,
    duplicatesSkipped: 5,
    robotsBlocked: 0,
    cacheHits: 92,
    aiCalls: 0,
    aiFallbackPages: 0,
    aiTokensIn: 0,
    aiTokensOut: 0,
  },
];

const mockStats = {
  totalJobs: 14,
  totalRuns: 182,
  totalPagesScraped: 54280,
  totalPagesFailed: 86,
  successRate: 0.9984,
  avgMsPerPage: 218,
  cacheHitRate: 0.764,
  duplicatesSkipped: 3840,
  robotsBlocked: 42,
  aiFallbackPages: 312,
  aiCalls: 156,
  aiCacheHits: 156,
  aiSuccess: 152,
  aiFailures: 4,
  aiTokensIn: 948000,
  aiTokensOut: 78200,
  failureReasons: {
    HTTP_429: 38,
    TIMEOUT: 26,
    PARSE_ERROR: 14,
    ROBOTS_DISALLOWED: 8,
  },
  runsPerDay: [
    { date: '11/12', runs: 8, pagesScraped: 2400 },
    { date: '11/13', runs: 11, pagesScraped: 3250 },
    { date: '11/14', runs: 9, pagesScraped: 2800 },
    { date: '11/15', runs: 14, pagesScraped: 4100 },
    { date: '11/16', runs: 12, pagesScraped: 3900 },
    { date: '11/17', runs: 16, pagesScraped: 5100 },
    { date: '11/18', runs: 15, pagesScraped: 4850 },
    { date: '11/19', runs: 18, pagesScraped: 5600 },
    { date: '11/20', runs: 13, pagesScraped: 3950 },
    { date: '11/21', runs: 17, pagesScraped: 5200 },
    { date: '11/22', runs: 19, pagesScraped: 5900 },
    { date: '11/23', runs: 22, pagesScraped: 6800 },
    { date: '11/24', runs: 25, pagesScraped: 7450 },
    { date: '11/25', runs: 21, pagesScraped: 6480 },
  ],
};

function startMockApi() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://localhost:${MOCK_API_PORT}`);
      const pathname = url.pathname;

      res.setHeader('Content-Type', 'application/json');

      if (pathname === '/auth/me') {
        res.writeHead(200);
        res.end(JSON.stringify({ user: mockUser }));
        return;
      }

      if (pathname === '/jobs') {
        res.writeHead(200);
        res.end(JSON.stringify({ jobs: mockJobs, totalJobs: mockJobs.length, page: 1, totalPages: 1 }));
        return;
      }

      if (pathname === '/jobs/job_101') {
        res.writeHead(200);
        res.end(JSON.stringify({ job: mockJobs[0] }));
        return;
      }

      if (pathname === '/jobs/job_101/results') {
        res.writeHead(200);
        res.end(JSON.stringify({ results: mockResults, total: mockResults.length, page: 1, totalPages: 1 }));
        return;
      }

      if (pathname === '/jobs/job_101/runs') {
        res.writeHead(200);
        res.end(JSON.stringify({ runs: mockRuns }));
        return;
      }

      if (pathname === '/jobs/job_101/runs/latest') {
        res.writeHead(200);
        res.end(JSON.stringify({ run: null }));
        return;
      }

      if (pathname === '/jobs/job_103') {
        res.writeHead(200);
        res.end(JSON.stringify({ job: mockJobs[2] }));
        return;
      }

      if (pathname === '/jobs/job_103/runs/latest') {
        res.writeHead(200);
        res.end(JSON.stringify({
          run: {
            _id: 'run_903',
            jobId: 'job_103',
            status: 'running',
            pagesScraped: 42,
            pagesFailed: 0,
            pagesSkipped: 3,
            totalUrls: 60,
            cacheHits: 18,
          }
        }));
        return;
      }

      if (pathname === '/stats') {
        res.writeHead(200);
        res.end(JSON.stringify({ stats: mockStats }));
        return;
      }

      // Default fallback
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    });

    server.listen(MOCK_API_PORT, () => {
      console.log(`Mock API running on port ${MOCK_API_PORT}`);
      resolve(server);
    });
  });
}

// ----------------------------------------------------
// 2. Client Static File Server (Port 4173)
// ----------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${CLIENT_PORT}`);
      let filePath = path.join(DIST_DIR, parsedUrl.pathname);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    server.listen(CLIENT_PORT, () => {
      console.log(`Client Static Server running on port ${CLIENT_PORT}`);
      resolve(server);
    });
  });
}

// ----------------------------------------------------
// 3. Chrome Automation via DevTools Protocol (CDP)
// ----------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAutomation() {
  console.log('Launching headless Chrome...');
  const tmpProfile = path.join(__dirname, '../.chrome-tmp');
  if (!fs.existsSync(tmpProfile)) {
    fs.mkdirSync(tmpProfile, { recursive: true });
  }

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpProfile}`,
      '--window-size=1440,900',
      '--force-device-scale-factor=1.25',
      '--disable-gpu',
      '--no-sandbox',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  chromeProcess.stderr.on('data', (d) => {
    // console.log('[Chrome]', d.toString());
  });

  // Wait for Chrome remote debugging to become available
  let debuggerUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
      if (res.ok) {
        const targets = await res.json();
        const pageTarget = targets.find((t) => t.type === 'page');
        if (pageTarget && pageTarget.webSocketDebuggerUrl) {
          debuggerUrl = pageTarget.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
  }

  if (!debuggerUrl) {
    chromeProcess.kill();
    throw new Error('Failed to connect to Chrome DevTools port');
  }

  console.log(`Connected to CDP at ${debuggerUrl}`);
  const ws = new WebSocket(debuggerUrl);

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  let msgId = 0;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const { resolve, reject } = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) {
        reject(data.error);
      } else {
        resolve(data.result);
      }
    }
  };

  function sendCDP(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      callbacks.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCDP('Page.enable');
  await sendCDP('Runtime.enable');
  await sendCDP('DOM.enable');

  async function capture(filename) {
    const res = await sendCDP('Page.captureScreenshot', { format: 'png' });
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`Captured: ${filename}`);
  }

  async function evaluate(code) {
    return await sendCDP('Runtime.evaluate', { expression: code, awaitPromise: true });
  }

  try {
    // 1. Capture Login Page
    console.log('Navigating to Login...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/login` });
    await sleep(1500);
    await capture('login.png');

    // Inject Mock Auth Token & User
    console.log('Injecting auth state...');
    await evaluate(`
      localStorage.setItem('token', 'fake-jwt-token-123456');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(mockUser)}));
    `);

    // 2. Capture Jobs List
    console.log('Navigating to Jobs List...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/jobs` });
    await sleep(1500);
    await capture('jobs_list.png');

    // 3. Capture Create Job
    console.log('Navigating to Create Job...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/jobs/new` });
    await sleep(1200);
    // Fill in demo inputs for a lively screenshot
    await evaluate(`
      const nameInput = document.querySelector('input[placeholder*="Job" i], input[type="text"]');
      if (nameInput) {
        nameInput.value = "Amazon Electronics Best Sellers";
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = "https://www.amazon.com/Best-Sellers-Electronics/zgbs/electronics\\nhttps://www.amazon.com/Best-Sellers-Computers-Accessories/zgbs/pc";
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await sleep(500);
    await capture('create_job.png');

    // 4. Capture Job Detail (Results Tab)
    console.log('Navigating to Job Detail (Results)...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/jobs/job_101` });
    await sleep(1800);
    await capture('job_detail_results.png');

    // 5. Capture Job Detail (Run History & Diagnostics Tab)
    console.log('Switching to Run History & Diagnostics Tab...');
    await evaluate(`
      const navButtons = document.querySelectorAll('nav button');
      if (navButtons && navButtons.length >= 2) {
        navButtons[1].click();
      }
    `);
    await sleep(800);
    // Expand the first run row to reveal detailed diagnostics & failure breakdown
    await evaluate(`
      const rows = document.querySelectorAll('table tbody tr');
      if (rows && rows.length > 0) rows[0].click();
    `);
    await sleep(1000);
    await capture('job_detail_progress.png');

    // 5b. Capture Active Running Job with Live Progress Bar
    console.log('Navigating to Running Job Detail (Live Progress)...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/jobs/job_103` });
    await sleep(1500);
    await capture('job_detail_live_progress.png');

    // Return to Job 101 for settings
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/jobs/job_101` });
    await sleep(1200);

    // 6. Capture Job Detail (Job Configuration & Self-Healing Tab)
    console.log('Switching to Job Configuration & Self-Healing Tab...');
    await evaluate(`
      const navButtons = document.querySelectorAll('nav button');
      if (navButtons && navButtons.length >= 3) {
        navButtons[2].click();
      }
    `);
    await sleep(1000);
    // Check one of the suggestions checkboxes to show active selection
    await evaluate(`
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      if (checkboxes && checkboxes.length > 0) checkboxes[0].click();
    `);
    await sleep(600);
    await capture('job_detail_settings.png');

    // 7. Capture Stats / Analytics Page
    console.log('Navigating to Stats / Analytics...');
    await sendCDP('Page.navigate', { url: `http://localhost:${CLIENT_PORT}/stats` });
    await sleep(2000);
    await capture('stats_analytics.png');

    console.log('All screenshots captured successfully!');
  } finally {
    ws.close();
    chromeProcess.kill();
  }
}

async function main() {
  const apiServer = await startMockApi();
  const staticServer = await startStaticServer();

  try {
    await runAutomation();
  } catch (err) {
    console.error('Automation failed:', err);
  } finally {
    apiServer.close();
    staticServer.close();
    process.exit(0);
  }
}

main();
