import Firecrawl from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import { writeFile } from 'fs/promises';

// Load environment variables
dotenv.config();

// Initialize Firecrawl with your API key
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

/**
 * Sleep/delay utility function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const is429 = error.message?.includes('429') || error.statusCode === 429;
      const isLastAttempt = attempt === maxRetries - 1;

      if (is429 && !isLastAttempt) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s
        console.log(`      Rate limited. Retrying in ${delay/1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Crawls AppSumo for products in specific categories
 * @param {string[]} categories - Array of categories to filter by (e.g., ['productivity', 'marketing'])
 * @param {number} maxProducts - Maximum number of products to scrape
 * @param {string} sortBy - Sort order: 'rating', 'popularity', 'newest', or null for default
 */
async function crawlAppSumo(categories = [], maxProducts = 50, sortBy = null) {
  console.log('Starting AppSumo crawler...');
  console.log(`Target categories: ${categories.join(', ') || 'All'}`);
  if (sortBy) {
    console.log(`Sort by: ${sortBy}`);
  }

  try {
    // Determine the listing page URL based on categories and sort order
    const listingUrl = getCategoryUrl(categories, sortBy);
    console.log(`Using listing URL: ${listingUrl}`);

    // Step 1: Scrape the software listing page to get product URLs
    console.log('Step 1: Scraping software listing page...');
    const listingPage = await firecrawl.scrapeUrl(listingUrl, {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 1000,
    });

    // Extract product URLs from the listing page
    const productUrls = extractProductUrls(listingPage.markdown || '', maxProducts);
    console.log(`Found ${productUrls.length} products to scrape`);

    if (productUrls.length === 0) {
      console.log('No product URLs found on listing page');
      return [];
    }

    // Step 2: Scrape individual product pages in parallel batches
    console.log(`Step 2: Scraping ${productUrls.length} individual product pages in parallel...`);
    const productPages = [];
    const rateLimitedUrls = []; // Track URLs that failed due to rate limiting
    const batchSize = 2; // Further reduced to 2 to avoid rate limiting
    const batchDelay = 5000; // 5 second delay between batches

    for (let i = 0; i < productUrls.length; i += batchSize) {
      const batch = productUrls.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(productUrls.length / batchSize);

      console.log(`  Batch ${batchNum}/${totalBatches}: Scraping ${batch.length} products in parallel...`);

      // Scrape all URLs in this batch in parallel with retry logic
      const batchPromises = batch.map(async (url, idx) => {
        const globalIdx = i + idx;
        console.log(`    [${globalIdx + 1}/${productUrls.length}] Starting: ${url}`);

        try {
          // Wrap scrapeUrl in retry logic
          const page = await retryWithBackoff(async () => {
            return await firecrawl.scrapeUrl(url, {
              formats: ['markdown', 'html'],
              onlyMainContent: false,  // Get all content including pricing, ratings, reviews
              waitFor: 1000,
            });
          });

          console.log(`    [${globalIdx + 1}/${productUrls.length}] ✓ Completed: ${url}`);

          return {
            success: true,
            url: url,
            data: {
              markdown: page.markdown,
              html: page.html,
              metadata: {
                sourceURL: url,
                title: page.metadata?.title,
                description: page.metadata?.description,
              }
            }
          };
        } catch (error) {
          const isRateLimited = error.message?.includes('429') || error.statusCode === 429;
          const isTimeout = error.message?.includes('408') || error.statusCode === 408 ||
                           error.message?.includes('timed out') || error.message?.includes('timeout');
          const isServerError = error.message?.includes('502') || error.statusCode === 502 ||
                               error.message?.includes('503') || error.statusCode === 503 ||
                               error.message?.includes('504') || error.statusCode === 504;

          if (isRateLimited || isTimeout || isServerError) {
            const errorType = isTimeout ? 'Timeout (408)' :
                             isServerError ? 'Server Error (502/503/504)' :
                             'Rate Limited (429)';
            console.error(`    [${globalIdx + 1}/${productUrls.length}] ⚠️  ${errorType}: ${url}`);
            rateLimitedUrls.push({
              url: url,
              name: url.split('/').pop(),
              index: globalIdx + 1
            });
            return { success: false, rateLimited: true, url: url };
          } else {
            console.error(`    [${globalIdx + 1}/${productUrls.length}] ✗ Failed: ${url} - ${error.message}`);
            return { success: false, rateLimited: false, url: url };
          }
        }
      });

      // Wait for all requests in this batch to complete
      const batchResults = await Promise.all(batchPromises);

      // Add successful results to productPages
      batchResults.forEach(result => {
        if (result && result.success) {
          productPages.push(result.data);
        }
      });

      console.log(`  Batch ${batchNum}/${totalBatches} complete. Total scraped: ${productPages.length}/${productUrls.length}`);

      // Add delay between batches to avoid rate limiting (except for last batch)
      if (i + batchSize < productUrls.length) {
        console.log(`  Waiting ${batchDelay/1000}s before next batch...`);
        await sleep(batchDelay);
      }
    }

    console.log(`Successfully scraped ${productPages.length} product pages`);

    // Log rate limited products
    if (rateLimitedUrls.length > 0) {
      console.log(`\n⚠️  ${rateLimitedUrls.length} product(s) were rate limited:`);
      rateLimitedUrls.forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.index}] ${item.name} - ${item.url}`);
      });
    }

    // Process and filter products
    const products = await processProducts(productPages, categories);

    // Display results
    displayResults(products, categories);

    return {
      products: products,
      rateLimited: rateLimitedUrls
    };

  } catch (error) {
    console.error('Error crawling AppSumo:', error.message);
    throw error;
  }
}

/**
 * Get the appropriate AppSumo category URL based on user input
 *
 * AppSumo categories:
 * - Operations
 * - Marketing & sales
 * - Build it yourself
 * - Media tools
 * - Finance
 * - Development & IT
 * - Customer experience
 *
 * Sort options:
 * - recommended: AppSumo recommended
 * - rating: Sort by highest rating
 * - latest: Sort by latest deals
 * - review_count: Sort by most reviews
 * - popularity: Sort by most popular
 * - newest: Sort by newest first
 * - price_low: Sort by lowest price
 * - price_high: Sort by highest price
 */
function getCategoryUrl(categories, sortBy = null) {
  // Category mapping to AppSumo's exact category URLs
  const categoryMap = {
    // Marketing & sales
    'marketing': 'marketing-sales',
    'marketers': 'marketing-sales',
    'sales': 'marketing-sales',
    'marketing & sales': 'marketing-sales',
    'marketing-sales': 'marketing-sales',

    // Operations
    'operations': 'operations',
    'productivity': 'operations',
    'project': 'operations',

    // Media tools
    'media': 'media-tools',
    'media tools': 'media-tools',
    'media-tools': 'media-tools',
    'video': 'media-tools',
    'audio': 'media-tools',
    'design': 'media-tools',

    // Development & IT
    'development': 'development-it',
    'dev': 'development-it',
    'it': 'development-it',
    'development & it': 'development-it',
    'development-it': 'development-it',
    'developer': 'development-it',

    // Customer experience
    'customer': 'customer-experience',
    'customer experience': 'customer-experience',
    'customer-experience': 'customer-experience',
    'support': 'customer-experience',
    'crm': 'customer-experience',

    // Finance
    'finance': 'finance',
    'accounting': 'finance',
    'invoicing': 'finance',

    // Build it yourself
    'build': 'build-it-yourself',
    'build it yourself': 'build-it-yourself',
    'build-it-yourself': 'build-it-yourself',
    'builder': 'build-it-yourself',
    'website': 'build-it-yourself',
    'app': 'build-it-yourself',
  };

  let baseUrl = '';

  // If no categories specified, use general software page
  if (!categories || categories.length === 0) {
    baseUrl = 'https://appsumo.com/software/';
  } else {
    // Try to match the first category to a known category URL
    const firstCategory = categories[0].toLowerCase().trim();

    // First try exact match
    if (categoryMap[firstCategory]) {
      baseUrl = `https://appsumo.com/software/${categoryMap[firstCategory]}/`;
    } else {
      // Then try partial match
      let matched = false;
      for (const [key, value] of Object.entries(categoryMap)) {
        if (firstCategory.includes(key) || key.includes(firstCategory)) {
          baseUrl = `https://appsumo.com/software/${value}/`;
          matched = true;
          break;
        }
      }

      // If no match, use general software page
      if (!matched) {
        console.log(`Warning: Category "${firstCategory}" not recognized, using all software`);
        baseUrl = 'https://appsumo.com/software/';
      }
    }
  }

  // Add sort parameter if specified
  if (sortBy) {
    return `${baseUrl}?sort=${sortBy}`;
  }

  return baseUrl;
}

/**
 * Extract product URLs from the listing page markdown
 */
function extractProductUrls(markdown, maxProducts = 50) {
  const urls = [];
  const urlRegex = /https:\/\/appsumo\.com\/products\/([a-z0-9-]+)\//gi;
  const matches = markdown.matchAll(urlRegex);

  for (const match of matches) {
    const url = match[0];
    // Remove trailing slash and avoid duplicates
    const cleanUrl = url.replace(/\/$/, '');
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }

    if (urls.length >= maxProducts) {
      break;
    }
  }

  return urls;
}

/**
 * Process crawled data to extract product information
 */
async function processProducts(pages, targetCategories) {
  const products = [];

  if (!pages || !Array.isArray(pages)) {
    console.log('No pages to process');
    return products;
  }

  console.log(`Processing ${pages.length} pages...`);

  for (let idx = 0; idx < pages.length; idx++) {
    const page = pages[idx];
    console.log(`  Page ${idx + 1}: sourceURL = ${page.metadata?.sourceURL}`);
    console.log(`    Has markdown: ${!!page.markdown}, Has metadata: ${!!page.metadata}`);

    // Check if this is a product page
    if (page.metadata?.sourceURL?.includes('/products/')) {
      const content = page.markdown || page.html || '';

      // Extract founder info once (instead of 3 separate calls)
      const founderInfo = await extractFounderInfo(page);

      const product = {
        name: extractProductName(page.metadata?.sourceURL) || page.metadata?.title || 'Unknown Product',
        url: page.metadata?.sourceURL,
        summary: extractSummary(page),
        description: page.metadata?.description || '',
        pricing: extractPricingTiers(page),
        rating: extractRating(page),
        reviews: extractReviews(page),
        homepage: extractHomepage(page),
        founder: founderInfo.name,
        founderLinkedIn: founderInfo.linkedIn,
        founderAppSumoProfile: founderInfo.appSumoProfile,
        foundingDate: extractFoundingDate(page),
        categories: extractCategories(page),
      };

      console.log(`    ✓ Added product: ${product.name}`);
      products.push(product);
    } else {
      console.log(`    ✗ Skipped (not a product page)`);
    }
  }

  console.log(`Processed ${products.length} products total`);
  return products;
}

/**
 * Extract product name from URL
 * Example: https://appsumo.com/products/nexuscale -> NEXUSCALE
 */
function extractProductName(url) {
  if (!url) return null;

  const match = url.match(/\/products\/([^\/\?#]+)/);
  if (match && match[1]) {
    // Convert slug to uppercase (nexuscale -> NEXUSCALE)
    return match[1].toUpperCase();
  }

  return null;
}

/**
 * Extract summary of what the software does
 */
function extractSummary(page) {
  const content = page.markdown || '';

  // Try to find the main product description/summary
  // Look for common patterns in AppSumo pages
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip images, links, and other markdown formatting
    if (line.startsWith('![') || line.startsWith('[!') || line.startsWith('http')) {
      continue;
    }

    // Remove markdown link formatting
    const cleanLine = line.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

    // Look for descriptive sentences (usually 50-300 chars)
    if (cleanLine.length > 50 && cleanLine.length < 400 && !cleanLine.startsWith('#')) {
      // Avoid common non-summary content
      if (!cleanLine.includes('AppSumo') &&
          !cleanLine.includes('Deal') &&
          !cleanLine.includes('reviews') &&
          !cleanLine.includes('logo') &&
          !cleanLine.includes('image') &&
          !cleanLine.startsWith('From the') &&          // Skip "From the Founders" section
          !cleanLine.includes('From the Founders') &&
          !cleanLine.includes('From the founders')) {
        return cleanLine;
      }
    }
  }

  return page.metadata?.description || '';
}

/**
 * Extract pricing tiers and details
 * Strategy 1: Use markdown/text patterns first, then enhance with HTML
 */
function extractPricingTiers(page) {
  const html = page.html || '';
  const markdown = page.markdown || '';
  const content = markdown || html || '';

  const pricing = {
    lifetime: null,
    regular: null,
    tiers: []
  };

  // Strategy 1: Extract tier NAMES from content (don't worry about prices yet)
  const tierNamePatterns = [
    /License\s+Tier\s+(\d+)/gi,        // "License Tier 1", "License Tier 2", etc.
    /(\d+)\s+Codes?/gi,                 // "1 Code", "2 Codes", "3 Codes", etc.
    /Code\s+(\d+)/gi,                   // "Code 1", "Code 2", etc.
    /([A-Z][a-z]+)\s+Plan/gi,          // "Individual Plan", "Agency Plan", etc.
    /Plan\s+(\d+)/gi,                   // "Plan 1", "Plan 2", etc.
    /Tier\s+(\d+)/gi,                   // "Tier 1", "Tier 2", etc.
  ];

  const foundTierNames = new Set();

  for (const pattern of tierNamePatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const fullMatch = match[0]; // Full tier name like "License Tier 1" or "2 Codes"
      foundTierNames.add(fullMatch);
    }
  }

  // If we found tier names, try to match them with prices using HTML structure
  if (foundTierNames.size > 0 && html) {
    const tierNamesArray = Array.from(foundTierNames);

    for (const tierName of tierNamesArray) {
      // Find this tier name in HTML and look for price below it
      const escapedTierName = tierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tierSectionMatch = html.match(new RegExp(`>${escapedTierName}<[\\s\\S]{0,500}?\\$(\\d+(?:\\.\\d{2})?)`, 'i'));

      if (tierSectionMatch) {
        const price = tierSectionMatch[1];
        const tierNumMatch = tierName.match(/(\d+)/);
        const tierNum = tierNumMatch ? tierNumMatch[1] : tierName;

        pricing.tiers.push({
          tier: tierNum,
          name: tierName,
          price: `$${price}`
        });
      }
    }
  }

  // Strategy 2: If no tiers found, use HTML "One time payment of" pattern as fallback
  if (pricing.tiers.length === 0 && html) {
    const paymentSections = html.split(/One time payment of/i);

    for (let i = 1; i < paymentSections.length; i++) {
      const beforeSection = paymentSections[i - 1];
      const afterSection = paymentSections[i];

      // Extract tier name from before section - look for last <p> with text-xl or font-medium
      const tierNameMatches = beforeSection.matchAll(/<p[^>]*class="[^"]*(?:text-xl|font-medium)[^"]*"[^>]*>([^<]+)<\/p>/g);
      const allMatches = [...tierNameMatches];
      const lastMatch = allMatches[allMatches.length - 1];
      const tierName = lastMatch ? lastMatch[1].trim() : null;

      // Extract price from after section
      const priceMatch = afterSection.match(/<strong[^>]*>\s*\$(\d+(?:\.\d{2})?)\s*<\/strong>/);
      const price = priceMatch ? priceMatch[1] : null;

      // Extract regular/strikethrough price
      const regularMatch = afterSection.match(/<span[^>]*line-through[^>]*>\s*\$(\d+(?:\.\d{2})?)\s*<\/span>/);
      const regularPrice = regularMatch ? regularMatch[1] : null;

      if (price && tierName) {
        // Try to extract tier number from name, otherwise use sequential number
        const tierNumMatch = tierName.match(/(?:Tier|Plan|Code|License)\s*(\d+)/i);
        const tierNum = tierNumMatch ? tierNumMatch[1] : String(pricing.tiers.length + 1);

        pricing.tiers.push({
          tier: tierNum,
          name: tierName,
          price: `$${price}`,
          regular: regularPrice ? `$${regularPrice}` : null
        });
      }
    }
  }

  // Sort tiers by tier number
  pricing.tiers.sort((a, b) => parseInt(a.tier) - parseInt(b.tier));

  // Extract lifetime and regular prices
  if (pricing.tiers.length > 0 && pricing.tiers[0]) {
    pricing.lifetime = pricing.tiers[0].price;
    pricing.regular = pricing.tiers[0].regular || null;
  } else {
    // Fallback: look for standalone lifetime/regular prices
    const lifetimeMatch = content.match(/\$(\d+(?:\.\d{2})?)\/lifetime/i);
    if (lifetimeMatch) {
      pricing.lifetime = `$${lifetimeMatch[1]}`;
    }

    const regularMatch = content.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:regular|original)/i);
    if (regularMatch) {
      pricing.regular = `$${regularMatch[1]}`;
    }
  }

  return pricing;
}

/**
 * Extract homepage URL
 * Strategy: Find links where product name appears in the DOMAIN only (not path/review sites)
 */
function extractHomepage(page) {
  const content = page.markdown || page.html || '';
  const productName = extractProductName(page.metadata?.sourceURL);

  // Strategy 1: Extract ALL markdown links [text](url) from content
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi;
  const markdownLinks = [...content.matchAll(markdownLinkPattern)];

  // Filter out AppSumo, social media, and review sites
  const excludedDomains = ['appsumo.com', 'linkedin.com', 'facebook.com', 'twitter.com',
                           'instagram.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
                           'reddit.com', 'capterra.com', 'g2.com', 'trustpilot.com',
                           'getapp.com', 'softwareadvice.com'];

  const validLinks = markdownLinks.filter(match => {
    const url = match[2];
    return !excludedDomains.some(domain => url.includes(domain));
  });

  // If we have a product name, ONLY match if product name is in the DOMAIN
  if (productName && validLinks.length > 0) {
    const productSlug = productName.toLowerCase();

    for (const match of validLinks) {
      const url = match[2];

      // Extract domain from URL (e.g., https://webability.io/path -> webability.io)
      const domainMatch = url.match(/^https?:\/\/(?:www\.)?([^\/]+)/);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();

        // Check if product name appears in domain (not full URL)
        if (domain.includes(productSlug)) {
          return url.replace(/\/$/, ''); // Remove trailing slash
        }
      }
    }

    // Second try: Look for root domain URLs (likely homepage)
    for (const match of validLinks) {
      const url = match[2];
      if (url.match(/^https?:\/\/[^\/]+\/?$/)) {
        return url.replace(/\/$/, '');
      }
    }
  }

  // Fallback: return first valid non-social link found (only if it's a root domain)
  if (validLinks.length > 0) {
    for (const match of validLinks) {
      const url = match[2];
      // Prefer root domains over deep links
      if (url.match(/^https?:\/\/[^\/]+\/?$/)) {
        return url.replace(/\/$/, '');
      }
    }
    // If no root domain found, return first valid link
    return validLinks[0][2].replace(/\/$/, '');
  }

  // Strategy 2: Look for standalone URLs (not in markdown links)
  const urlPattern = /https?:\/\/(?!(?:www\.)?(?:appsumo|linkedin|facebook|twitter|instagram|youtube|tiktok|pinterest|reddit|capterra|g2|trustpilot)\.com)[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(?:\/[^\s\)"\]]*)?/gi;
  const standaloneUrls = content.match(urlPattern) || [];

  if (productName && standaloneUrls.length > 0) {
    const productSlug = productName.toLowerCase();
    for (const url of standaloneUrls) {
      // Extract domain and check if product name is in domain only
      const domainMatch = url.match(/^https?:\/\/(?:www\.)?([^\/]+)/);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();
        if (domain.includes(productSlug)) {
          return url.replace(/[,.]$/, '');
        }
      }
    }
  }

  // Return first standalone root domain URL
  if (standaloneUrls.length > 0) {
    for (const url of standaloneUrls) {
      if (url.match(/^https?:\/\/[^\/]+\/?$/)) {
        return url.replace(/[,.]$/, '');
      }
    }
  }

  return null;
}

/**
 * Extract founder name and LinkedIn/AppSumo profile together
 * Uses HTML structure and aggressive pattern matching
 */
async function extractFounderInfo(page) {
  const html = page.html || '';
  const markdown = page.markdown || '';
  const content = markdown || html || '';

  // Strategy 1: HTML section with id="from-the-founders" or founder profile data
  if (html) {
    // Pattern 1a: Look for founder data in JSON/structured format (most reliable)
    const founderDataMatch = html.match(/"username":"([^"]+)"[^}]*"firstName":"([^"]+)"[^}]*"lastName":"([^"]+)"/);
    if (founderDataMatch) {
      const username = founderDataMatch[1];
      const firstName = founderDataMatch[2];
      const lastName = founderDataMatch[3];
      const fullName = `${firstName} ${lastName}`.trim();

      // Validate it looks like a real name (not just random words)
      if (fullName.length >= 4 && fullName.split(' ').length >= 2) {
        // Look for LinkedIn URL
        const linkedInMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)/);

        return {
          name: fullName,
          linkedIn: linkedInMatch ? linkedInMatch[0] : null,
          appSumoProfile: `https://appsumo.com/profile/${username}`
        };
      }
    }

    // Pattern 1b: Look for profile link ONLY (ignore anything that comes before it)
    // Match: <a href="/profile/USERNAME">DISPLAY_NAME</a>
    // We ONLY want DISPLAY_NAME, not surrounding text
    const profileLinkMatches = html.matchAll(/<a[^>]*href="\/profile\/([^"\/]+)\/?["'][^>]*>([^<]{3,40})<\/a>/gi);

    for (const match of profileLinkMatches) {
      const profileHandle = match[1];
      const displayName = match[2].trim();
      const lowerName = displayName.toLowerCase();

      // Reject sentences/phrases (check FIRST before anything else)
      const rejectWords = ['the', 'from', 'founder', 'are', 'is', 'was', 'beyond', 'genius',
                          'great', 'amazing', 'best', 'team', 'company', 'recognized', 'that',
                          'who', 'what', 'when', 'where', 'why', 'how', 'this', 'these', 'those'];
      const hasRejectWord = rejectWords.some(word => lowerName.includes(word));

      if (hasRejectWord) {
        continue; // Skip this match entirely
      }

      // Only accept if it looks like a person's name (2+ words, each starting with capital)
      // Must be ONLY letters and spaces (no special chars, numbers, or extra symbols)
      if (displayName.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/) && displayName.length <= 30) {
        // Look for LinkedIn URL in nearby context
        const linkedInMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)/);

        return {
          name: displayName,
          linkedIn: linkedInMatch ? linkedInMatch[0] : null,
          appSumoProfile: `https://appsumo.com/profile/${profileHandle}`
        };
      }
    }

    // Pattern 2: <a href="/profile/Name/">Name</a> ... <span>CEO/Founder</span> ... <a href="linkedin">
    const ceoPatternMatch = html.match(/<a[^>]*href="\/profile\/([^"\/]+)\/?"[^>]*>\s*<img[^>]*alt="([^"]+)"[\s\S]{0,500}?<span[^>]*>(?:CEO|Founder|Co-founder|Co-CEO)<\/span>[\s\S]{0,200}?href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"]+)"/i);

    if (ceoPatternMatch) {
      const profileHandle = ceoPatternMatch[1];
      const name = ceoPatternMatch[2].trim();
      const linkedInUrl = ceoPatternMatch[3];

      return {
        name: name,
        linkedIn: linkedInUrl,
        appSumoProfile: `https://appsumo.com/profile/${profileHandle}/`
      };
    }

    // Pattern 3: <a ... href="/profile/...">Name</a> with nearby LinkedIn link
    const profileWithLinkedInMatch = html.match(/<a[^>]*href="\/profile\/([^"\/]+)\/?"[^>]*>([^<]+)<\/a>[\s\S]{0,300}?href="(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^"]+)"/i);

    if (profileWithLinkedInMatch) {
      const profileHandle = profileWithLinkedInMatch[1];
      const name = profileWithLinkedInMatch[2].trim();
      const linkedInUrl = profileWithLinkedInMatch[3];

      return {
        name: name,
        linkedIn: linkedInUrl,
        appSumoProfile: `https://appsumo.com/profile/${profileHandle}/`
      };
    }
  }

  // Strategy 2: AppSumo profile link - extract username and clean it up
  // But skip navigation links like "[From the founders](url)"
  const appSumoPattern = /\[([^\]]+)\]\((https?:\/\/appsumo\.com\/profile\/([a-zA-Z0-9_-]+))\/?/;
  const appSumoMatch = content.match(appSumoPattern);

  if (appSumoMatch) {
    const linkText = appSumoMatch[1].trim();
    const profileUrl = appSumoMatch[2];
    const username = appSumoMatch[3];

    // Convert username to proper name format: "Maxime_N" -> "Maxime N"
    const cleanedName = username.replace(/_/g, ' ');

    // Only use this if it looks like a real name (not a review snippet or nav link)
    const rejectWords = ['the', 'from', 'founder', 'are', 'is', 'was', 'beyond', 'genius',
                        'great', 'amazing', 'best', 'team', 'company', 'recognized', 'that'];
    const hasRejectWord = rejectWords.some(word => cleanedName.toLowerCase().includes(word));

    if (!hasRejectWord && cleanedName.match(/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/)) {
      const linkedInUrl = content.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+)/);
      return {
        name: cleanedName,
        linkedIn: linkedInUrl ? linkedInUrl[1] : null,
        appSumoProfile: profileUrl
      };
    }
  }

  // Strategy 3: LinkedIn link with anchor text: [Name](linkedin-url)
  const linkedInPattern = /\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\]\((https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+)\)/;
  const linkedInMatch = content.match(linkedInPattern);

  if (linkedInMatch) {
    return {
      name: linkedInMatch[1].trim(),
      linkedIn: linkedInMatch[2],
      appSumoProfile: null
    };
  }

  // Strategy 3: Explicit founder keywords with names
  const explicitPatterns = [
    /(?:Co-?founder|Founder)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,       // "Founder: Name Name" or "Co-founder Name Name"
    /(?:Founded by|Created by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,     // "Founded by Name Name"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)[,\s]+(?:Co-?founder|Founder)/i,       // "Name Name, Founder"
    /(?:CEO|Co-CEO)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,                // "CEO: Name Name"
  ];

  for (const pattern of explicitPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();

      // Reject common non-name phrases
      const rejectWords = ['the', 'from', 'founders', 'are', 'is', 'was', 'beyond', 'genius',
                          'great', 'amazing', 'best', 'team', 'company', 'recognized', 'that'];
      const hasRejectWord = rejectWords.some(word => name.toLowerCase().includes(word));

      if (!hasRejectWord && name.split(/\s+/).length >= 2) {  // Must have 2+ words
        const linkedInUrl = content.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+)/);
        const appSumoUrl = content.match(/(https?:\/\/appsumo\.com\/profile\/[a-zA-Z0-9_-]+)/);

        return {
          name: name,
          linkedIn: linkedInUrl ? linkedInUrl[1] : null,
          appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
        };
      }
    }
  }

  // Strategy 4: Look for "Founder" keyword and extract nearby capitalized names
  const founderIndex = content.search(/\b(?:Co-?founder|Founder)\b/i);
  if (founderIndex !== -1) {
    // Get a larger window of text around "Founder" (300 chars before and after)
    const start = Math.max(0, founderIndex - 300);
    const end = Math.min(content.length, founderIndex + 300);
    const window = content.substring(start, end);

    // Look for capitalized name patterns (First Last or First Middle Last)
    const nameNearFounder = [
      /(?:Co-?founder|Founder)[:\s]*\[?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\]?/i,  // "Founder [Name Name]" or "Founder: Name Name"
      /\[?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\]?[,\s]+(?:Co-?founder|Founder)/i,   // "[Name Name], Founder"
      /(?:Co-?founder|Founder)[^\[]*\[([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\]/i,     // "Founder ... [Name Name]"
    ];

    for (const pattern of nameNearFounder) {
      const match = window.match(pattern);
      if (match && match[1] && match[1].split(/\s+/).length >= 2) {
        const linkedInUrl = content.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+)/);
        const appSumoUrl = content.match(/(https?:\/\/appsumo\.com\/profile\/[a-zA-Z0-9_-]+)/);

        return {
          name: match[1].trim(),
          linkedIn: linkedInUrl ? linkedInUrl[1] : null,
          appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
        };
      }
    }
  }

  // Strategy 5: Find person mentions near social links (lightweight entity linking)
  // If we have LinkedIn/AppSumo profiles, try to find associated names
  const linkedInUrl = content.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+))/);
  const appSumoUrl = content.match(/(https?:\/\/appsumo\.com\/profile\/([a-zA-Z0-9_-]+))/);

  if (linkedInUrl || appSumoUrl) {
    const handle = linkedInUrl ? linkedInUrl[2] : (appSumoUrl ? appSumoUrl[2] : '');

    // Look for capitalized names in markdown links near these URLs
    const nearbyNamePattern = new RegExp(`\\[([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+)\\]\\([^)]*(?:${handle}|profile)[^)]*\\)`, 'i');
    const nameMatch = content.match(nearbyNamePattern);

    if (nameMatch && nameMatch[1]) {
      return {
        name: nameMatch[1].trim(),
        linkedIn: linkedInUrl ? linkedInUrl[1] : null,
        appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
      };
    }

    // Fallback: Extract first/last from handle (e.g., "JohnDoe" or "john-doe")
    // This is a weak signal but better than nothing
    const handleParts = handle.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
    if (handleParts.length >= 2) {
      const inferredName = handleParts
        .slice(0, 2)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');

      // Only return if it looks like a real name (not numbers/single chars)
      if (inferredName.match(/^[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}$/)) {
        return {
          name: inferredName,
          linkedIn: linkedInUrl ? linkedInUrl[1] : null,
          appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
        };
      }
    }
  }

  // Last resort: If we found LinkedIn URL but no name, try to scrape LinkedIn or use username
  if (linkedInUrl && !linkedInUrl[1].includes('company')) {
    const linkedInUsername = linkedInUrl[1].match(/\/in\/([a-zA-Z0-9-]+)/);

    if (linkedInUsername) {
      const username = linkedInUsername[1];

      // Try to scrape the LinkedIn page for the actual name
      try {
        console.log(`    Attempting to scrape LinkedIn profile for founder name: ${linkedInUrl[1]}`);
        const linkedInPage = await firecrawl.scrapeUrl(linkedInUrl[1], {
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 1000,
        });

        // LinkedIn pages typically have the name in the title or early in content
        // Pattern: "Name | LinkedIn" or "Name - LinkedIn"
        const titleMatch = linkedInPage.metadata?.title?.match(/^([^|\-]+?)(?:\s*[\|\-]|$)/);
        if (titleMatch) {
          const name = titleMatch[1].trim();
          // Validate it looks like a real name
          if (name.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/) && name.length <= 50) {
            console.log(`    ✓ Found name from LinkedIn: ${name}`);
            return {
              name: name,
              linkedIn: linkedInUrl[1],
              appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
            };
          }
        }

        // Fallback: Look for name in first few lines of LinkedIn content
        const lines = linkedInPage.markdown?.split('\n').slice(0, 10) || [];
        for (const line of lines) {
          const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
          if (nameMatch && nameMatch[1].length <= 50) {
            console.log(`    ✓ Found name from LinkedIn content: ${nameMatch[1]}`);
            return {
              name: nameMatch[1].trim(),
              linkedIn: linkedInUrl[1],
              appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
            };
          }
        }
      } catch (error) {
        console.log(`    ⚠️  Could not scrape LinkedIn (${error.message}), using username fallback`);
      }

      // Final fallback: Convert LinkedIn username to a readable name
      // "maxime-neau" -> "Maxime Neau"
      const nameParts = username.split('-').filter(p => p.length > 0);
      if (nameParts.length >= 2) {
        const inferredName = nameParts
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');

        console.log(`    Using LinkedIn username as fallback: ${inferredName}`);
        return {
          name: inferredName,
          linkedIn: linkedInUrl[1],
          appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
        };
      }
    }
  }

  // No founder found
  return {
    name: null,
    linkedIn: linkedInUrl ? linkedInUrl[1] : null,
    appSumoProfile: appSumoUrl ? appSumoUrl[1] : null
  };
}

/**
 * Extract founder name
 */
async function extractFounder(page) {
  const info = await extractFounderInfo(page);
  return info.name;
}

/**
 * Extract founder LinkedIn profile
 */
async function extractFounderLinkedIn(page) {
  const info = await extractFounderInfo(page);
  return info.linkedIn;
}

/**
 * Extract founder AppSumo profile
 */
async function extractFounderAppSumoProfile(page) {
  const info = await extractFounderInfo(page);
  return info.appSumoProfile;
}

/**
 * Extract founding date/year
 * Handles formats like "Founded February 26, 2024" or "Founded in 2024"
 */
function extractFoundingDate(page) {
  const content = page.markdown || page.html || '';

  // Look for founding date patterns - extract year from dates
  const patterns = [
    /(?:Founded|Established|Since)\s+(?:in\s+)?(\d{4})/i,           // "Founded in 2024" or "Since 2024"
    /(?:Founded|Established):\s*(\d{4})/i,                          // "Founded: 2024"
    /(?:Founded|Established)\s+\w+\s+\d{1,2},?\s+(\d{4})/i,         // "Founded February 26, 2024"
    /(?:Founded|Established)\s+\d{1,2}\/\d{1,2}\/(\d{4})/i,         // "Founded 02/26/2024"
    /(?:Founded|Established)\s+on\s+\w+\s+\d{1,2},?\s+(\d{4})/i,    // "Founded on February 26, 2024"
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const year = match[1];
      // Validate year is reasonable (between 1900 and current year + 1)
      const yearNum = parseInt(year);
      const currentYear = new Date().getFullYear();
      if (yearNum >= 1900 && yearNum <= currentYear + 1) {
        return year;
      }
    }
  }

  return null;
}

/**
 * Extract categories from page content
 */
function extractCategories(page) {
  const categories = [];
  const content = page.markdown || page.html || '';

  // AppSumo category keywords
  const categoryKeywords = [
    'Small businesses', 'Marketers', 'Marketing agencies', 'Content creators',
    'Solopreneurs', 'Bloggers', 'Ecommerce', 'Freelancers', 'Developers',
    'Customer support', 'SaaS', 'Web design agencies', 'Sales managers',
    'Consultants', 'Course creators', 'Educators', 'Web designers', 'C-suite',
    'Entrepreneur-curious', 'Copywriters', 'Graphic designers', 'Online coaches',
    'IT/security agencies', 'Event organizers', 'Product managers',
    'Social media managers', 'Accountants', 'Influencers', 'Project managers',
    'Remote teams', 'Social media marketers', 'YouTubers', 'Recruiters',
    'Task Automation', 'Photographers', 'Real estate', 'Authors', 'Crypto',
    'Product designers', 'Podcasters', 'QA', 'Videographers', 'Nonprofits',
    'Virtual assistants', 'Visual artists'
  ];

  categoryKeywords.forEach(keyword => {
    if (content.toLowerCase().includes(keyword)) {
      categories.push(keyword);
    }
  });

  return [...new Set(categories)]; // Remove duplicates
}

/**
 * Extract price information
 */
function extractPrice(page) {
  const content = page.markdown || page.html || '';
  const priceMatch = content.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  return priceMatch ? priceMatch[0] : null;
}

/**
 * Extract rating
 */
function extractRating(page) {
  const content = page.markdown || page.html || '';
  const ratingMatch = content.match(/(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*5/i);
  return ratingMatch ? parseFloat(ratingMatch[1]) : null;
}

/**
 * Extract review count
 */
function extractReviews(page) {
  const content = page.markdown || page.html || '';
  const reviewMatch = content.match(/(\d+)\s*(?:reviews?|ratings?)/i);
  return reviewMatch ? parseInt(reviewMatch[1]) : null;
}

/**
 * Display results in a formatted way
 */
function displayResults(products, categories) {
  console.log('\n' + '='.repeat(60));
  console.log(`Found ${products.length} products`);
  if (categories.length > 0) {
    console.log(`Matching categories: ${categories.join(', ')}`);
  }
  console.log('='.repeat(60) + '\n');

  products.forEach((product, index) => {
    console.log(`${index + 1}. ${product.name}`);
    console.log(`   URL: ${product.url}`);
    console.log(`   Summary: ${product.summary}`);
    if (product.rating) console.log(`   Rating: ${product.rating}/5`);
    if (product.reviews) console.log(`   Reviews: ${product.reviews}`);
    if (product.pricing?.lifetime) console.log(`   Price: ${product.pricing.lifetime}`);
    if (product.homepage) console.log(`   Homepage: ${product.homepage}`);
    if (product.founder) console.log(`   Founder: ${product.founder}`);
    if (product.founderLinkedIn) console.log(`   LinkedIn: ${product.founderLinkedIn}`);
    if (product.foundingDate) console.log(`   Founded: ${product.foundingDate}`);
    console.log(`   Categories: ${product.categories.join(', ') || 'N/A'}`);
    console.log('');
  });
}

/**
 * Export products to JSON file
 */
async function exportToJSON(products, filename = 'appsumo_products.json') {
  await writeFile(filename, JSON.stringify(products, null, 2));
  console.log(`Results exported to ${filename}`);
}

// Example usage (only run when file is executed directly, not imported):
async function main() {
  // Example 1: Crawl for productivity and marketing tools
  const products = await crawlAppSumo(['productivity', 'marketing'], 30);

  // Export results
  await exportToJSON(products, 'appsumo_filtered_products.json');

  // Example 2: Get all products (no category filter)
  // const allProducts = await crawlAppSumo([], 100);
}

// Only run main() if this file is executed directly (not when imported by server)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

/**
 * Progressive crawling with batch processing and callbacks
 * Splits large requests into batches and sends results progressively
 */
async function crawlAppSumoProgressive(categories = [], maxProducts = 50, sortBy = null, crawlMode = 'fast', callbacks = {}) {
  console.log('Starting Progressive AppSumo crawler...');
  console.log(`Target categories: ${categories.join(', ') || 'All'}`);
  console.log(`Crawl mode: ${crawlMode}`);
  if (sortBy) {
    console.log(`Sort by: ${sortBy}`);
  }

  const onlyMainContent = crawlMode === 'fast';  // Use onlyMainContent for fast mode
  const SUPER_BATCH_SIZE = 20; // Process 20 products per super-batch
  const SUPER_BATCH_DELAY = 45000; // 45 second cooldown between super-batches

  try {
    // Determine the listing page URL
    const listingUrl = getCategoryUrl(categories, sortBy);
    console.log(`Using listing URL: ${listingUrl}`);

    // Step 1: Scrape the software listing page to get product URLs
    console.log('Step 1: Scraping software listing page...');
    const listingPage = await firecrawl.scrapeUrl(listingUrl, {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 1000,
    });

    const productUrls = extractProductUrls(listingPage.markdown || '', maxProducts);
    console.log(`Found ${productUrls.length} products to scrape`);

    if (productUrls.length === 0) {
      if (callbacks.onComplete) {
        callbacks.onComplete({ products: [], rateLimited: [] });
      }
      return { products: [], rateLimited: [] };
    }

    // Split into super-batches
    const superBatches = [];
    for (let i = 0; i < productUrls.length; i += SUPER_BATCH_SIZE) {
      superBatches.push(productUrls.slice(i, i + SUPER_BATCH_SIZE));
    }

    console.log(`Split into ${superBatches.length} super-batches of ${SUPER_BATCH_SIZE} products each`);

    const allProducts = [];
    const allRateLimited = [];

    // Process each super-batch
    for (let superBatchIdx = 0; superBatchIdx < superBatches.length; superBatchIdx++) {
      const superBatch = superBatches[superBatchIdx];
      console.log(`\n📦 Super-Batch ${superBatchIdx + 1}/${superBatches.length}: Processing ${superBatch.length} products...`);

      const productPages = [];
      const rateLimitedUrls = [];
      const batchSize = 2; // Mini-batch size for parallel scraping
      const batchDelay = 5000; // 5 seconds between mini-batches

      // Process super-batch with mini-batches (same logic as original)
      for (let i = 0; i < superBatch.length; i += batchSize) {
        const batch = superBatch.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(superBatch.length / batchSize);

        console.log(`  Batch ${batchNum}/${totalBatches}: Scraping ${batch.length} products in parallel...`);

        // Send progress update for sub-batch
        if (callbacks.onProgress) {
          callbacks.onProgress({
            superBatchNumber: superBatchIdx + 1,
            totalSuperBatches: superBatches.length,
            miniBatchNumber: batchNum,
            totalMiniBatches: totalBatches,
            productsScraped: productPages.length,
            totalInSuperBatch: superBatch.length
          });
        }

        const batchPromises = batch.map(async (url, idx) => {
          const globalIdx = i + idx;
          console.log(`    [${globalIdx + 1}/${superBatch.length}] Starting: ${url}`);

          try {
            const page = await retryWithBackoff(async () => {
              return await firecrawl.scrapeUrl(url, {
                formats: ['markdown', 'html'],
                onlyMainContent: onlyMainContent,  // Use mode setting: fast (true) or complete (false)
                waitFor: 1000,
              });
            });

            console.log(`    [${globalIdx + 1}/${superBatch.length}] ✓ Completed: ${url}`);

            return {
              success: true,
              url: url,
              data: {
                markdown: page.markdown,
                html: page.html,
                metadata: {
                  sourceURL: url,
                  title: page.metadata?.title,
                  description: page.metadata?.description,
                }
              }
            };
          } catch (error) {
            const isRateLimited = error.message?.includes('429') || error.statusCode === 429;
            const isTimeout = error.message?.includes('408') || error.statusCode === 408 ||
                             error.message?.includes('timed out') || error.message?.includes('timeout');
            const isServerError = error.message?.includes('502') || error.statusCode === 502 ||
                                 error.message?.includes('503') || error.statusCode === 503 ||
                                 error.message?.includes('504') || error.statusCode === 504;

            if (isRateLimited || isTimeout || isServerError) {
              const errorType = isTimeout ? 'Timeout (408)' :
                               isServerError ? 'Server Error (502/503/504)' :
                               'Rate Limited (429)';
              console.error(`    [${globalIdx + 1}/${superBatch.length}] ⚠️  ${errorType}: ${url}`);
              rateLimitedUrls.push({
                url: url,
                name: url.split('/').pop(),
                index: globalIdx + 1
              });
              return { success: false, rateLimited: true, url: url };
            } else {
              console.error(`    [${globalIdx + 1}/${superBatch.length}] ✗ Failed: ${url} - ${error.message}`);
              return { success: false, rateLimited: false, url: url };
            }
          }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
          if (result && result.success) {
            productPages.push(result.data);
          }
        });

        console.log(`  Batch ${batchNum}/${totalBatches} complete. Total scraped: ${productPages.length}/${superBatch.length}`);

        if (i + batchSize < superBatch.length) {
          console.log(`  Waiting ${batchDelay/1000}s before next batch...`);
          await sleep(batchDelay);
        }
      }

      // Process products from this super-batch
      const products = await processProducts(productPages, categories);
      allProducts.push(...products);
      allRateLimited.push(...rateLimitedUrls);

      console.log(`✅ Super-Batch ${superBatchIdx + 1} complete: ${products.length} products processed`);

      // Send batch results to client
      if (callbacks.onBatchComplete) {
        callbacks.onBatchComplete({
          batchNumber: superBatchIdx + 1,
          totalBatches: superBatches.length,
          products: products,
          rateLimited: rateLimitedUrls,
          totalProducts: allProducts.length,
          totalRateLimited: allRateLimited.length
        });
      }

      // Add cooldown between super-batches (except for last batch)
      if (superBatchIdx < superBatches.length - 1) {
        console.log(`\n⏳ Cooling down for ${SUPER_BATCH_DELAY/1000}s before next super-batch...`);
        await sleep(SUPER_BATCH_DELAY);
      }
    }

    console.log(`\n🎉 All batches complete! Total: ${allProducts.length} products, ${allRateLimited.length} rate-limited`);

    // Send final results
    if (callbacks.onComplete) {
      callbacks.onComplete({
        products: allProducts,
        rateLimited: allRateLimited
      });
    }

    return {
      products: allProducts,
      rateLimited: allRateLimited
    };

  } catch (error) {
    console.error('Error in progressive crawling:', error.message);
    if (callbacks.onError) {
      callbacks.onError(error);
    }
    throw error;
  }
}

export { crawlAppSumo, crawlAppSumoProgressive, processProducts, exportToJSON, extractProductUrls };
