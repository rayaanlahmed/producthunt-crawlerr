import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugRepliq() {
  const url = 'https://appsumo.com/products/repliq';

  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Look for profile mentions in markdown
  const profileMatches = [...page.markdown.matchAll(/\[([^\]]+)\]\(https:\/\/appsumo\.com\/profile\/[^\)]+\)/gi)];

  console.log('=== Profile Links in Markdown ===');
  profileMatches.forEach((match, i) => {
    console.log(`${i + 1}. Link text: "${match[1]}"`);
  });

  // Search for "genius" context
  const geniusIndex = page.markdown.toLowerCase().indexOf('genius');
  if (geniusIndex !== -1) {
    const snippet = page.markdown.substring(Math.max(0, geniusIndex - 200), Math.min(page.markdown.length, geniusIndex + 200));
    console.log('\n=== Context around "genius" ===');
    console.log(snippet);
  }
}

debugRepliq().catch(console.error);
