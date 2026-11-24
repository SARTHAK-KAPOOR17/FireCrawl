import * as cheerio from 'cheerio';
import crypto from 'crypto';

/**
 * Cleans raw HTML for LLM ingestion:
 * - Strips script, style, noscript, svg, iframe, comments, and hidden elements
 * - Keeps title and essential attributes (id, class, href, src, itemprop, aria-label, alt)
 * - Prefers main -> article -> body content
 * - Collapses whitespace
 * - Truncates to maxChars (default 20,000)
 *
 * @param {string} rawHtml
 * @param {Object} [options]
 * @param {number} [options.maxChars]
 * @returns {{ cleanedHtml: string, hash: string }}
 */
export function cleanHtml(
  rawHtml,
  { maxChars = parseInt(process.env.MAX_AI_HTML_CHARS || '20000', 10) } = {}
) {
  if (!rawHtml || typeof rawHtml !== 'string') {
    const emptyHash = crypto.createHash('sha256').update('').digest('hex');
    return { cleanedHtml: '', hash: emptyHash };
  }

  const $ = cheerio.load(rawHtml);

  // Preserve page title
  const titleText = $('head title').text().trim();

  // 1. Remove unwanted tags
  $('script, style, noscript, svg, iframe').remove();

  // 2. Remove hidden elements
  $(
    '[hidden], [style*="display: none"], [style*="display:none"], [style*="visibility: hidden"], [style*="visibility:hidden"]'
  ).remove();

  // 3. Remove HTML comments
  $('*')
    .contents()
    .each(function () {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });

  // 4. Strip all attributes except allowed whitelist
  const allowedAttrs = new Set(['id', 'class', 'href', 'src', 'itemprop', 'aria-label', 'alt']);
  $('*').each(function () {
    const attribs = this.attribs || {};
    for (const attr of Object.keys(attribs)) {
      if (!allowedAttrs.has(attr.toLowerCase())) {
        $(this).removeAttr(attr);
      }
    }
  });

  // 5. Select main content container (main -> article -> body)
  let target = $('main');
  if (target.length === 0) {
    target = $('article');
  }
  if (target.length === 0) {
    target = $('body');
  }
  if (target.length === 0) {
    target = $.root();
  }

  let htmlStr = target.html() || '';

  if (titleText) {
    htmlStr = `<title>${titleText}</title>\n` + htmlStr;
  }

  // 6. Collapse redundant whitespace
  htmlStr = htmlStr
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  // 7. Truncate to maximum characters limit
  if (htmlStr.length > maxChars) {
    htmlStr = htmlStr.slice(0, maxChars);
  }

  const hash = crypto.createHash('sha256').update(htmlStr).digest('hex');
  return { cleanedHtml: htmlStr, hash };
}
