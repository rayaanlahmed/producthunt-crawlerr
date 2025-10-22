import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function testSimpleCrawl() {
  console.log('Test 1: Basic crawl without filters...\n');

  try {
    const result1 = await firecrawl.crawlUrl('https://appsumo.com/software/', {
      limit: 2,
      maxDepth: 2,
    });

    console.log('Result 1 - No filters:');
    console.log('Completed:', result1.completed);
    console.log('Total:', result1.total);
    console.log('Credits used:', result1.creditsUsed);
    console.log('URLs crawled:');
    result1.data?.forEach((page, idx) => {
      console.log(`  ${idx + 1}. ${page.metadata?.sourceURL}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

    console.log('Test 2: With includePaths...\n');

    const result2 = await firecrawl.crawlUrl('https://appsumo.com/software/', {
      limit: 2,
      maxDepth: 2,
      includePaths: ['/products/*'],
    });

    console.log('Result 2 - With includePaths:');
    console.log('Completed:', result2.completed);
    console.log('Total:', result2.total);
    console.log('Credits used:', result2.creditsUsed);
    console.log('URLs crawled:');
    result2.data?.forEach((page, idx) => {
      console.log(`  ${idx + 1}. ${page.metadata?.sourceURL}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSimpleCrawl();
