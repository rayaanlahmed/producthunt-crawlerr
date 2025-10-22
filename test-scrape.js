import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testScrape() {
  console.log('Testing AppSumo scrape...\n');

  try {
    // Test 1: Scrape a single page
    console.log('Test 1: Scraping /software/ page...');
    const softwarePage = await firecrawl.scrapeUrl('https://appsumo.com/software/', {
      formats: ['markdown', 'html'],
    });

    console.log('Software page metadata:', softwarePage.metadata);
    console.log('Software page has markdown:', !!softwarePage.markdown);
    console.log('Markdown length:', softwarePage.markdown?.length || 0);

    await writeFile('test-software-page.json', JSON.stringify(softwarePage, null, 2));
    console.log('✓ Saved to test-software-page.json\n');

    // Test 2: Try crawling with very small limit
    console.log('Test 2: Crawling with limit of 5...');
    const crawlResult = await firecrawl.crawlUrl('https://appsumo.com/software/', {
      limit: 5,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        waitFor: 3000,
      },
      includePaths: [
        'products/*',
        'software/*',
      ],
      excludePaths: [
        'account/*',
        'cart/*',
        'checkout/*',
        'login',
        'signup',
      ],
    });

    console.log('Crawl result:', {
      success: crawlResult.success,
      totalPages: crawlResult.data?.length || 0,
      pages: crawlResult.data?.map(p => ({
        url: p.metadata?.sourceURL,
        title: p.metadata?.title,
      })) || []
    });

    await writeFile('test-crawl-result.json', JSON.stringify(crawlResult, null, 2));
    console.log('✓ Saved to test-crawl-result.json\n');

    // Test 3: Try a direct product page
    console.log('Test 3: Scraping a direct product page...');
    const productPage = await firecrawl.scrapeUrl('https://appsumo.com/products/nexuscale/', {
      formats: ['markdown', 'html'],
    });

    console.log('Product page metadata:', productPage.metadata);
    console.log('Product has markdown:', !!productPage.markdown);

    await writeFile('test-product-page.json', JSON.stringify(productPage, null, 2));
    console.log('✓ Saved to test-product-page.json\n');

    console.log('All tests completed!');

  } catch (error) {
    console.error('Error during test:', error.message);
    console.error('Full error:', error);
  }
}

testScrape();
