import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { processProducts } from './appsumo-crawler.js';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testFullContent() {
  console.log('Testing DEFTFORM with FULL content (not onlyMainContent)...\n');

  const url = 'https://appsumo.com/products/deftform';

  try {
    console.log('Scraping DEFTFORM page WITHOUT onlyMainContent filter...');
    const page = await firecrawl.scrapeUrl(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: false,  // Get ALL content
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
      console.log('\n=== DEFTFORM Results (Full Content) ===');
      console.log('Rating:', product.rating || 'NOT FOUND');
      console.log('Reviews:', product.reviews || 'NOT FOUND');
      console.log('\nPricing Tiers:');
      if (product.pricing.tiers.length > 0) {
        console.log(JSON.stringify(product.pricing.tiers, null, 2));
      } else {
        console.log('NO TIERS FOUND');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFullContent();
