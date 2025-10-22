import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugTest() {
  console.log('Scraping one product page to debug...\n');

  const page = await firecrawl.scrapeUrl('https://appsumo.com/products/tidycal', {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 3000,
  });

  console.log('=== PAGE OBJECT STRUCTURE ===');
  console.log('Keys:', Object.keys(page));
  console.log('\n=== METADATA ===');
  console.log('metadata keys:', page.metadata ? Object.keys(page.metadata) : 'NO METADATA');
  console.log('metadata.sourceURL:', page.metadata?.sourceURL);
  console.log('metadata.title:', page.metadata?.title);
  console.log('metadata.description:', page.metadata?.description);

  console.log('\n=== CONTENT ===');
  console.log('Has markdown:', !!page.markdown);
  console.log('Has html:', !!page.html);
  console.log('Markdown length:', page.markdown?.length || 0);

  // Test the condition
  console.log('\n=== CONDITION TEST ===');
  console.log('sourceURL includes /products/:', page.metadata?.sourceURL?.includes('/products/'));

  // Show how we're building the product object
  const productPages = [{
    markdown: page.markdown,
    html: page.html,
    metadata: {
      sourceURL: page.metadata?.sourceURL || 'MISSING',
      title: page.metadata?.title,
      description: page.metadata?.description,
    }
  }];

  console.log('\n=== PRODUCT PAGE OBJECT ===');
  console.log('productPages[0].metadata.sourceURL:', productPages[0].metadata.sourceURL);
  console.log('Includes /products/:', productPages[0].metadata.sourceURL?.includes('/products/'));
}

debugTest();
