import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function verifyCrawl() {
  console.log('Testing exact configuration from appsumo-crawler.js...\n');

  try {
    const crawlResult = await firecrawl.crawlUrl('https://appsumo.com/software/', {
      limit: 2,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      },
      maxDepth: 2,
    });

    console.log('SUCCESS:', crawlResult.success);
    console.log('Status:', crawlResult.status);
    console.log('Completed:', crawlResult.completed);
    console.log('Total:', crawlResult.total);
    console.log('Credits used:', crawlResult.creditsUsed);
    console.log('\nPages crawled:');

    if (crawlResult.data && crawlResult.data.length > 0) {
      crawlResult.data.forEach((page, idx) => {
        console.log(`  ${idx + 1}. ${page.metadata?.sourceURL}`);
      });

      // Check for product pages
      const productPages = crawlResult.data.filter(p => p.metadata?.sourceURL?.includes('/products/'));
      console.log(`\nProduct pages found: ${productPages.length}`);
      productPages.forEach((page, idx) => {
        console.log(`  ${idx + 1}. ${page.metadata?.sourceURL}`);
      });
    } else {
      console.log('  NO PAGES CRAWLED!');
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

verifyCrawl();
