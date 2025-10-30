import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending products, optionally by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic slug (e.g. "artificial-intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  console.log("🧠 Received crawl request for topic:", topic);
  console.log("🔑 ProductHunt key loaded:", !!process.env.PRODUCTHUNT_API_KEY);

  // ✅ Ensure topic is defined correctly
  const topicSlug = topic ? topic.trim().toLowerCase() : null;

  // Build GraphQL query
  const query = topicSlug
    ? `
      query {
        topic(slug: "${topicSlug}") {
          name
          posts(first: ${limit}) {
            edges {
              node {
                name
                tagline
                votesCount
                website
                url
                description
                createdAt
                thumbnail { url }
                topics {
                  edges { node { name slug } }
                }
              }
            }
          }
        }
      }
    `
    : `
      query {
        posts(order: RANKING, first: ${limit}) {
          edges {
            node {
              name
              tagline
              votesCount
              website
              url
              description
              createdAt
              thumbnail { url }
              topics {
                edges { node { name slug } }
              }
            }
          }
        }
      }
    `;

  // Fetch data from Product Hunt API
  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.PRODUCTHUNT_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Product Hunt API failed: ${response.statusText}`);
  }

  const data = await response.json();

  let posts = [];

  // ✅ Defensive checks to prevent undefined topic errors
  if (topicSlug) {
    if (data?.data?.topic?.posts?.edges?.length) {
      posts = data.data.topic.posts.edges.map(({ node }) => node);
    } else {
      console.log(`⚠
