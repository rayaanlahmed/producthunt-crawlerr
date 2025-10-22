import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugDeftform() {
  const url = 'https://appsumo.com/products/deftform';
  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Check for "From the" in markdown
  const fromTheIndex = page.markdown.toLowerCase().indexOf('from the');
  if (fromTheIndex !== -1) {
    console.log('=== Context around "From the" ===');
    console.log(page.markdown.substring(Math.max(0, fromTheIndex - 100), fromTheIndex + 200));
  }

  // Check rating/reviews
  console.log('\n=== Rating/Review Patterns ===');
  const ratingMatch = page.markdown.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*5/i);
  console.log('Rating regex match:', ratingMatch ? ratingMatch[0] : 'NO MATCH');

  const reviewMatch = page.markdown.match(/(\d+)\s*(?:reviews?|ratings?)/i);
  console.log('Review regex match:', reviewMatch ? reviewMatch[0] : 'NO MATCH');

  // Look for rating in first 2000 chars
  console.log('\n=== First 2000 chars of markdown ===');
  console.log(page.markdown.substring(0, 2000));

  // Check pricing - look for "One time payment"
  console.log('\n=== Pricing HTML Structure ===');
  const pricingMatch = page.html.match(/<p class="text-xl[^"]*"[^>]*>([^<]+)<\/p>[\s\S]{0,300}?One time payment of[\s\S]{0,200}?\$(\d+)/i);
  console.log('Pricing match:', pricingMatch ? `Tier: ${pricingMatch[1]}, Price: $${pricingMatch[2]}` : 'NO MATCH');
}

debugDeftform().catch(console.error);
