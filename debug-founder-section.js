import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

dotenv.config();

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

async function debugFounderSection() {
  const url = 'https://appsumo.com/products/repliq';

  const page = await firecrawl.scrapeUrl(url, {
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    waitFor: 1000,
  });

  // Look for "From the founders" section in markdown
  const founderSectionMatch = page.markdown.match(/from the founders?[\s\S]{0,1000}/i);

  console.log('=== "From the Founders" Section (Markdown) ===');
  if (founderSectionMatch) {
    console.log(founderSectionMatch[0].substring(0, 500));
  } else {
    console.log('Section not found in markdown');
  }

  // Look for founder section in HTML
  const htmlFounderMatch = page.html.match(/from[-\s]the[-\s]founders?[\s\S]{0,1000}/i);

  console.log('\n=== "From the Founders" Section (HTML) ===');
  if (htmlFounderMatch) {
    const snippet = htmlFounderMatch[0].substring(0, 800);
    console.log(snippet);
    await writeFile('founder-section.html', snippet);
  } else {
    console.log('Section not found in HTML');
  }

  // Look for any <h2> or <h3> tags that might indicate sections
  const headings = [...page.html.matchAll(/<h[23][^>]*>([^<]+)<\/h[23]>/gi)];
  console.log('\n=== All H2/H3 Headings ===');
  headings.forEach(h => console.log('-', h[1].trim()));
}

debugFounderSection().catch(console.error);
