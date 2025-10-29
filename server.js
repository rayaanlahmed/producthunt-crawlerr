import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlProductHunt } from './producthunt-crawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API endpoint for crawling Product Hunt
app.post('/api/crawl', async (req, res) => {
    try {
        // ✅ FIXED: match frontend request body
        const { maxPages = 10, categories = [] } = req.body;
        const topic = categories.length > 0 ? categories[0] : null;
        const limit = maxPages;

        // Setup Server-Sent Events
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log(`🚀 Starting Product Hunt crawl... Topic: ${topic || 'Trending'}`);

        try {
            // Pass topic to the crawler
            const products = await crawlProductHunt(limit, topic);

            res.write(`data: ${JSON.stringify({
                type: 'complete',
                success: true,
                count: products.length,
                products: products
            })}\n\n`);
            res.end();
        } catch (error) {
            console.error('❌ Error during Product Hunt crawl:', error);
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: error.message
            })}\n\n`);
            res.end();
        }

    } catch (error) {
        console.error('❌ Error in /api/crawl:', error);
        res.status(500).json({
            error: error.message || 'An error occurred while crawling Product Hunt'
        });
    }
});

// Optional: direct endpoint to test Product Hunt data
app.get('/api/producthunt', async (req, res) => {
    try {
        const data = await crawlProductHunt(10); // Fetch top 10 posts
        res.json({ success: true, count: data.length, results: data });
    } catch (error) {
        console.error('❌ Error in Product Hunt crawl:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║   🧠 Product Hunt Crawler Server              ║
║   Running at: http://localhost:${PORT}        ║
║                                               ║
║   Open your browser and navigate to:          ║
║   👉 http://localhost:${PORT}                 ║
╚═══════════════════════════════════════════════╝
    `);
});

