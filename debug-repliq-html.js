import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugRepliq() {
  const url = 'https://appsumo.com/products/repliq';

  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Look for all profile links
  const profileMatches = [...page.html.matchAll(/<a[^>]*href="\/profile\/([^"\/]+)\/?["'][^>]*>([^<]{3,100})<\/a>/gi)];

  console.log('=== All Profile Links Found ===');
  profileMatches.forEach((match, i) => {
    console.log(`${i + 1}. Handle: "${match[1]}" | Display: "${match[2].trim()}"`);
  });

  // Look for JSON data
  const jsonMatch = page.html.match(/"username":"([^"]+)"[^}]*"firstName":"([^"]+)"[^}]*"lastName":"([^"]+)"/);
  console.log('\n=== JSON Founder Data ===');
  if (jsonMatch) {
    console.log('Username:', jsonMatch[1]);
    console.log('First Name:', jsonMatch[2]);
    console.log('Last Name:', jsonMatch[3]);
  } else {
    console.log('No JSON founder data found');
  }

  // Save HTML snippet around profile link for inspection
  const profileIndex = page.html.indexOf('/profile/Maxime_N');
  if (profileIndex !== -1) {
    const snippet = page.html.substring(Math.max(0, profileIndex - 500), Math.min(page.html.length, profileIndex + 500));
    await writeFile('repliq-profile-snippet.html', snippet);
    console.log('\nHTML snippet saved to repliq-profile-snippet.html');
  }
}

debugRepliq().catch(console.error);
