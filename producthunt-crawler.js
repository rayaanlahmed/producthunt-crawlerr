import fetch from "node-fetch";
import { evaluateProducts } from "./evaluation-engine.js"; // 🧠 Import your evaluation engine

/**
 * Crawl Product Hunt for trending software or by topic
 * @param {number} limit - number of posts to fetch
 * @param {string|null} topic - optional topic slug (e.g., "artificial-intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // 🧠 GraphQL query with optional topic filter
  const query = topic
    ? `
      query {
        posts(order: RANKING, first: ${limit}, featured: true, topic: "${topic}") {
          edges {
            node {
              name
              tagline
              votesCount
              website
              topics {
                edges {
                  node { name }
                }
              }
              description
              createdAt
              thumbnail { url }
              url
            }
          }
        }
      }
    `
    : `
      query {
        posts(order: RANKING, first: ${limit}, featured: true) {
          edges {
            node {
              name
              tagline
              votesCount
              website
              topics {
                edges {
                  node { name }
                }
              }
              description
              createdAt
              thumbnail { url }
              url
            }
          }
        }
      }
    `;

  // --- Make API call ---
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

  // ✅ Defensive check
  if (!data.data || !data.data.posts) {
    console.log("⚠️ No posts found for topic:", topic);
    return [];
  }

  // --- Format results ---
  const posts = data.data.posts.edges.map(({ node }) => ({
    name: node.name,
    tagline: node.tagline,
    votes: node.votesCount,
    url: node.website,
    producthunt_url: node.url,
    topics: node.topics.edges.map(t => t.node.name).join(", "),
    description: node.description,
    thumbnail: node.thumbnail?.url,
    launchDate: node.createdAt,
  }));

  // 🧩 Run each product through evaluation engine for scoring
  const evaluatedPosts = evaluateProducts(posts);

  return evaluatedPosts;
}

// Manual test (optional)
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "artificial-intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((error) => console.error("❌ Error running Product Hunt crawler:", error.message));
}

