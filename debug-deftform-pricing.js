import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugPricing() {
  const url = 'https://appsumo.com/products/deftform';
  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Find "One time payment of" in HTML
  const index = page.html.indexOf('One time payment of');
  if (index !== -1) {
    const snippet = page.html.substring(Math.max(0, index - 500), index + 500);
    console.log('=== HTML around "One time payment of" ===');
    console.log(snippet);
    await writeFile('pricing-snippet.html', snippet);
  } else {
    console.log('"One time payment of" not found in HTML');
  }

  // Check for tier name patterns
  const tierNames = [...page.html.matchAll(/<p[^>]*class="[^"]*(?:text-xl|font-medium)[^"]*"[^>]*>([^<]+)<\/p>/g)];
  console.log('\n=== All <p> tags with text-xl or font-medium ===');
  tierNames.forEach((match, i) => console.log(`${i + 1}. "${match[1].trim()}"`));
}

debugPricing().catch(console.error);
