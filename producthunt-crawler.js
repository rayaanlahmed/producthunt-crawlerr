import fetch from "node-fetch";
import { evaluateProducts } from "./evaluation-engine.js";

/**
 * Crawl Product Hunt for trending software
 * Returns list of products with metadata
 */
export async function crawlProductHunt(limit = 10) {
  const query = `
    query {
      posts(order: RANKING, first: ${limit}) {
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
      // 👇 This reads your secret key from Vercel Environment Variables
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

  return posts;
}

// Optional test runner — this lets you test it manually
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt()
    .then((data) => {
      console.log(JSON.stringify(data, null, 2));
    })
    .catch((error) => {
      console.error("Error running Product Hunt crawler:", error.message);
    });
}
