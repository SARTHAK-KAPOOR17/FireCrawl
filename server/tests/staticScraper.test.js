import { describe, it, expect } from '@jest/globals';
import { NoDataExtractedError } from '@scraper/shared';
import { scrape } from '../../worker/src/scrapers/staticScraper.js';

const HTML_FIXTURE = `
<!DOCTYPE html>
<html>
  <head><title>Sample Book</title></head>
  <body>
    <article class="product_page">
      <h1 class="book-title">  A Light in the Attic  </h1>
      <p class="price_color">£51.77</p>
      <p class="instock availability">
        <i class="icon-ok"></i> In stock (22 available)
      </p>
      <a class="cover-image" href="/media/cache/cover.jpg">View Cover</a>
      <div class="metadata" data-isbn="9780060256739" data-rating="three">Book info</div>
      <span class="empty-field">   </span>
    </article>
  </body>
</html>
`;

describe('Static Scraper (worker/src/scrapers/staticScraper.js)', () => {
  it('extracts text for standard CSS selectors', async () => {
    const data = await scrape({
      url: 'https://example.com/test-book',
      selectors: {
        title: 'h1.book-title',
        price: '.price_color',
        availability: '.availability',
      },
      html: HTML_FIXTURE,
    });

    expect(data).toEqual({
      title: 'A Light in the Attic',
      price: '£51.77',
      availability: 'In stock (22 available)',
    });
  });

  it('supports attribute syntax (selector@attr)', async () => {
    const data = await scrape({
      url: 'https://example.com/test-book',
      selectors: {
        title: 'h1.book-title',
        coverUrl: 'a.cover-image@href',
        isbn: '.metadata@data-isbn',
        rating: '.metadata@data-rating',
      },
      html: HTML_FIXTURE,
    });

    expect(data).toEqual({
      title: 'A Light in the Attic',
      coverUrl: '/media/cache/cover.jpg',
      isbn: '9780060256739',
      rating: 'three',
    });
  });

  it('returns null for missing fields or nonexistent selectors', async () => {
    const data = await scrape({
      url: 'https://example.com/test-book',
      selectors: {
        title: 'h1.book-title',
        missingTag: '.non-existent-class',
        missingAttr: 'a.cover-image@data-missing',
        emptyTag: '.empty-field',
      },
      html: HTML_FIXTURE,
    });

    expect(data.title).toBe('A Light in the Attic');
    expect(data.missingTag).toBeNull();
    expect(data.missingAttr).toBeNull();
    expect(data.emptyTag).toBeNull();
  });

  it('throws a failure error when ALL fields return no data', async () => {
    await expect(
      scrape({
        url: 'https://example.com/test-book',
        selectors: {
          missing1: '.missing-1',
          missing2: '.missing-2',
          missingAttr: 'h1@data-unknown',
        },
        html: HTML_FIXTURE,
      })
    ).rejects.toThrow(NoDataExtractedError);
  });
});
