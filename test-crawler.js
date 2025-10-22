import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testCrawl() {
  console.log('Testing crawl with 1 page...');

  try {
    const crawlResult = await firecrawl.crawlUrl('https://appsumo.com/software/', {
      limit: 1,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      },
      maxDepth: 2,
    });

    console.log('\n=== CRAWL RESULT ===');
    console.log(JSON.stringify(crawlResult, null, 2));

    console.log('\n=== DATA STRUCTURE ===');
    console.log('Has data property:', !!crawlResult.data);
    console.log('Data is array:', Array.isArray(crawlResult.data));
    console.log('Data length:', crawlResult.data?.length);

    if (crawlResult.data && crawlResult.data.length > 0) {
      console.log('\n=== ALL PAGE URLs ===');
      crawlResult.data.forEach((page, idx) => {
        console.log(`${idx + 1}. ${page.metadata?.sourceURL}`);
      });

      console.log('\n=== FIRST PAGE SAMPLE ===');
      const firstPage = crawlResult.data[0];
      console.log('Keys:', Object.keys(firstPage));
      console.log('URL:', firstPage.metadata?.sourceURL);
      console.log('Has markdown:', !!firstPage.markdown);
      console.log('Has html:', !!firstPage.html);

      // Check for product pages
      const productPages = crawlResult.data.filter(p => p.metadata?.sourceURL?.includes('/products/'));
      console.log('\n=== PRODUCT PAGES FOUND ===');
      console.log('Product page count:', productPages.length);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

testCrawl();
