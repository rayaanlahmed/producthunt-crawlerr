# AppSumo Crawler

A web application to crawl and discover AppSumo products by category using Firecrawl API.

## Features

- Browse products by 7 main AppSumo categories
- Scrape product details including name, price, rating, and reviews
- Export results as JSON or Markdown
- Beautiful, responsive UI

## Deployment

### Deploy to Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy:
```bash
vercel
```

4. Set environment variable in Vercel dashboard:
   - Go to your project settings
   - Add `FIRECRAWL_API_KEY` with your API key

### Deploy to Railway

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login and deploy:
```bash
railway login
railway init
railway up
```

3. Set environment variable:
```bash
railway variables set FIRECRAWL_API_KEY=your_api_key
```

### Deploy to Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variable `FIRECRAWL_API_KEY`

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
FIRECRAWL_API_KEY=your_api_key_here
```

3. Run the server:
```bash
npm start
```

4. Open http://localhost:3000

## Environment Variables

- `FIRECRAWL_API_KEY` - Your Firecrawl API key (required)

## License

MIT
