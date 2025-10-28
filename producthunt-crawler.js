import fetch from "node-fetch";
import { evaluateProducts } from "./evaluation-engine.js";

/**
 * Crawl Product Hunt for trending software or by topic
 * @param {number} limit - number of posts to fetch
 * @param {string|null} topic - optional topic slug (e.g., "artificial-intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  const topicFilter = topic
    ? `(order: RANKING, first: ${limit}, featured: true, topic: "${topic}")`
    : `(order: RANKING, first: ${limit}, featured: true)`;

  const query = `
    query {
      posts${topicFilter} {
        edges {
          node {
            name
            tagline
            description
            votesCount
            website
            url
            createdAt
            thumbnail { url }
            topics { edges { node { name } } }
            makers {
              edges {
                node {
                  name
                  profileUrl
                }
              }
            }
          }
        }
      }
    }
  `;

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

  if (!data.data || !data.data.posts) {
    console.log("⚠️ No posts found for topic:", topic);
    return [];
  }

  const posts = data.data.posts.edges.map(({ node }) => ({
    name: node.name,
    tagline: node.tagline,
    description: node.description,
    votes: node.votesCount,
    url: node.website,
    producthunt_url: node.url,
    topics: node.topics.edges.map(t => t.node.name).join(", "),
    founder: node.makers?.edges?.[0]?.node?.name || null,
    founderProfile: node.makers?.edges?.[0]?.node?.profileUrl || null,
    thumbnail: node.thumbnail?.url,
    launchDate: node.createdAt,
  }));

  // 🧠 Apply evaluation scoring before returning
  const evaluated = evaluateProducts(posts);
  return evaluated;
}

// Manual test (optional)
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "artificial-intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((error) => console.error("❌ Error running Product Hunt crawler:", error.message));
}
