import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { processProducts } from './appsumo-crawler.js';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testDeftform() {
  console.log('Testing DEFTFORM extraction...\n');

  const url = 'https://appsumo.com/products/deftform';

  try {
    console.log('Scraping DEFTFORM page...');
    const page = await firecrawl.scrapeUrl(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: false,
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
      console.log('\n=== DEFTFORM Results ===');
      console.log('Name:', product.name);
      console.log('Founder:', product.founder || 'NOT FOUND');
      console.log('Founder LinkedIn:', product.founderLinkedIn || 'NOT FOUND');
      console.log('Rating:', product.rating || 'NOT FOUND');
      console.log('Reviews:', product.reviews || 'NOT FOUND');
      console.log('\nPricing Tiers:');
      console.log(JSON.stringify(product.pricing.tiers, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDeftform();
