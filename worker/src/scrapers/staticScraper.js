import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FireCrawl/1.0';

/**
 * Scrapes a static HTML page using Cheerio and extracts selectors
 * @param {Object} options
 * @param {string} options.url
 * @param {Record<string, string> | Map<string, string>} options.selectors
 * @param {string} [options.html] Optional direct HTML fixture for testing
 * @returns {Promise<Record<string, any>>}
 */
export async function scrape({ url, selectors, html }) {
  let content = html;

  if (!content) {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    content = response.data;
  }

  const $ = cheerio.load(content);
  const data = {};
  let hasAnyData = false;

  const selectorEntries =
    selectors instanceof Map
      ? Array.from(selectors.entries())
      : typeof selectors?.toJSON === 'function'
      ? Object.entries(selectors.toJSON())
      : Object.entries(selectors || {});

  for (const [field, rawSelector] of selectorEntries) {
    if (!rawSelector || typeof rawSelector !== 'string') {
      data[field] = null;
      continue;
    }

    let value = null;
    const trimmedSelector = rawSelector.trim();

    if (trimmedSelector.includes('@')) {
      // Attribute syntax: selector@attr (e.g. "a.link@href")
      const atIndex = trimmedSelector.lastIndexOf('@');
      const cssSelector = trimmedSelector.substring(0, atIndex).trim();
      const attrName = trimmedSelector.substring(atIndex + 1).trim();

      const el = $(cssSelector).first();
      if (el.length > 0) {
        const attrVal = el.attr(attrName);
        if (attrVal !== undefined && attrVal !== null) {
          const trimmedVal = attrVal.trim();
          if (trimmedVal.length > 0) {
            value = trimmedVal;
          }
        }
      }
    } else {
      // Text syntax: $(selector).first().text().trim()
      const el = $(trimmedSelector).first();
      if (el.length > 0) {
        const textVal = el.text().trim();
        if (textVal.length > 0) {
          value = textVal;
        }
      }
    }

    data[field] = value;
    if (value !== null) {
      hasAnyData = true;
    }
  }

  // If a page returns no data for ALL fields, treat as failure
  if (!hasAnyData) {
    const err = new Error('NO_DATA_EXTRACTED: Page returned no data for all fields');
    err.code = 'NO_DATA_EXTRACTED';
    throw err;
  }

  return data;
}
