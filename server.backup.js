import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlAppSumo } from './appsumo-crawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API endpoint for crawling with Server-Sent Events (progressive results)
app.post('/api/crawl', async (req, res) => {
    try {
        const { categories = [], maxPages = 30, sortBy = null } = req.body;

        console.log(`Received crawl request - Categories: ${categories.join(', ') || 'All'}, Max Pages: ${maxPages}${sortBy ? `, Sort: ${sortBy}` : ''}`);

        // Validate input
        if (!Array.isArray(categories)) {
            return res.status(400).json({ error: 'Categories must be an array' });
        }

        if (typeof maxPages !== 'number' || maxPages < 1 || maxPages > 100) {
            return res.status(400).json({ error: 'maxPages must be a number between 1 and 100' });
        }

        const validSorts = ['recommended', 'rating', 'latest', 'review_count', 'popularity', 'newest', 'price_low', 'price_high'];
        if (sortBy && !validSorts.includes(sortBy)) {
            return res.status(400).json({ error: `sortBy must be one of: ${validSorts.join(', ')}` });
        }

        // Setup SSE for progressive results
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Import progressive crawler
        const { crawlAppSumoProgressive } = await import('./appsumo-crawler.js');

        // Start progressive crawling with callbacks
        await crawlAppSumoProgressive(categories, maxPages, sortBy, {
            onProgress: (progressData) => {
                // Send progress updates for sub-batches
                res.write(`data: ${JSON.stringify({
                    type: 'progress',
                    ...progressData
                })}\n\n`);
            },
            onBatchComplete: (batchData) => {
                // Send batch results to client
                res.write(`data: ${JSON.stringify({
                    type: 'batch',
                    ...batchData
                })}\n\n`);
            },
            onComplete: (finalData) => {
                // Send final results
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    ...finalData
                })}\n\n`);
                res.end();
            },
            onError: (error) => {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: error.message
                })}\n\n`);
                res.end();
            }
        });

    } catch (error) {
        console.error('Error in /api/crawl:', error);
        res.status(500).json({
            error: error.message || 'An error occurred while crawling'
        });
    }
});

// Retry endpoint for rate-limited products
app.post('/api/retry', async (req, res) => {
    try {
        const { urls } = req.body;

        if (!Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'URLs array is required' });
        }

        console.log(`\nRetrying ${urls.length} rate-limited products after 60s delay...`);
        console.log('Waiting 60 seconds to avoid rate limiting...');

        // Wait 60 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 60000));

        console.log('Starting retry...');

        const productPages = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`  Retrying ${i + 1}/${urls.length}: ${url}`);

            try {
                const page = await firecrawl.scrapeUrl(url, {
                    formats: ['markdown', 'html'],
                    onlyMainContent: true,
                    waitFor: 1000,
                });

                productPages.push({
                    markdown: page.markdown,
                    html: page.html,
                    metadata: {
                        sourceURL: url,
                        title: page.metadata?.title,
                        description: page.metadata?.description,
                    }
                });

                console.log(`  ✓ Success: ${url}`);

                // Add 3 second delay between retries
                if (i < urls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (error) {
                console.error(`  ✗ Failed again: ${url} - ${error.message}`);
            }
        }

        // Process the products
        const { processProducts } = await import('./appsumo-crawler.js');
        const products = await processProducts(productPages, []);

        res.json({
            success: true,
            count: products.length,
            products: products
        });

    } catch (error) {
        console.error('Error in /api/retry:', error);
        res.status(500).json({
            error: error.message || 'An error occurred while retrying'
        });
    }
});

// Serve the HTML interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   AppSumo Crawler Server                      ║
║   Running at: http://localhost:${PORT}         ║
║                                               ║
║   Open your browser and navigate to:         ║
║   http://localhost:${PORT}                     ║
╚═══════════════════════════════════════════════╝
    `);
});
