import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending software or by topic
 * @param {number} limit - number of posts to fetch
 * @param {string|null} topic - optional topic slug (e.g., "artificial-intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // 🧠 Build the GraphQL query dynamically
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
      "Authorization": `Bearer ${process.env.PRODUCTHUNT_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Product Hunt API failed: ${response.statusText}`);
  }

  const data = await response.json();

  // ✅ Defensive check to prevent “Cannot read properties of undefined”
  if (!data.data || !data.data.posts) {
    console.log("⚠️ No posts found for topic:", topic);
    return [];
  }

  // --- Format data ---
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

  return posts;
}

// Manual test (optional)
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "artificial-intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((error) => console.error("❌ Error running Product Hunt crawler:", error.message));
}
