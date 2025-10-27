import fetch from "node-fetch";
import { evaluateProducts } from "./evaluation-engine.js";

/**
 * Crawl Product Hunt for trending software
 * Optionally filter by topic/category
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // --- Build GraphQL query dynamically ---
  const topicFilter = topic
    ? `(order: RANKING, first: ${limit}, filters: {topics: ["${topic}"]})`
    : `(order: RANKING, first: ${limit})`;

  const query = `
    query {
      posts${topicFilter} {
        edges {
          node {
            name
            tagline
            votesCount
            website
            topics {
              edges {
                node {
                  name
                }
              }
            }
            description
            createdAt
            thumbnail {
              url
            }
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
      "Authorization": `Bearer ${process.env.PRODUCTHUNT_API_KEY}`
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Product Hunt API failed: ${response.statusText}`);
  }

  // --- Format data ---
  const data = await response.json();
  const posts = data.data.posts.edges.map(({ node }) => ({
    name: node.name,
    tagline: node.tagline,
    votes: node.votesCount,
    url: node.website,
    producthunt_url: node.url,
    topics: node.topics.edges.map(t => t.node.name).join(", "),
    description: node.description,
    thumbnail: node.thumbnail?.url,
    launchDate: node.createdAt
  }));

  // Optional evaluation hook (if you want to rank/filter later)
  if (typeof evaluateProducts === "function") {
    return evaluateProducts(posts);
  }

  return posts;
}

// Optional test runner — lets you run it manually
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "Artificial Intelligence")
    .then((data) => {
      console.log(JSON.stringify(data, null, 2));
    })
    .catch((error) => {
      console.error("Error running Product Hunt crawler:", error.message);
    });
}
