import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function findFounderName() {
  const url = 'https://appsumo.com/products/repliq';

  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Find the profile image and surrounding HTML
  const profileImgMatch = page.html.match(/alt="Maxime_N"[\s\S]{0,2000}/);

  if (profileImgMatch) {
    console.log('=== HTML Around Profile Image ===');
    const snippet = profileImgMatch[0].substring(0, 1500);
    console.log(snippet);
    await writeFile('profile-area.html', snippet);
    console.log('\nSaved to profile-area.html');
  }

  // Look for the LinkedIn link area
  const linkedInMatch = page.html.match(/linkedin\.com\/in\/maxime-neau[\s\S]{0,500}/);
  if (linkedInMatch) {
    console.log('\n=== Area Before LinkedIn Link ===');
    const index = page.html.indexOf('linkedin.com/in/maxime-neau');
    const before = page.html.substring(Math.max(0, index - 800), index + 100);
    console.log(before);
  }
}

findFounderName().catch(console.error);
