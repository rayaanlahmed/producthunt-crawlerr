import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { processProducts } from './appsumo-crawler.js';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testRepliq() {
  console.log('Testing REPLIQ founder extraction...\n');

  const url = 'https://appsumo.com/products/repliq';

  try {
    console.log('Scraping REPLIQ page...');
    const page = await firecrawl.scrapeUrl(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      waitFor: 1000,
    });

    console.log('Processing...');
    const products = await processProducts([{
      markdown: page.markdown,
      html: page.html,
      metadata: {
        sourceURL: url,
        title: page.metadata?.title,
        description: page.metadata?.description,
      }
    }], []);

    if (products.length > 0) {
      const product = products[0];
      console.log('\n=== REPLIQ Results ===');
      console.log('Name:', product.name);
      console.log('Founder:', product.founder);
      console.log('Founder LinkedIn:', product.founderLinkedIn);
      console.log('Founder AppSumo Profile:', product.founderAppSumoProfile);
      console.log('\nPricing Tiers:');
      console.log(JSON.stringify(product.pricing.tiers, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRepliq();
