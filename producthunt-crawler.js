import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending software by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic name (e.g. "AI Tools")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Build filter
  const topicFilter = topic
    ? `(topics: { slug: "${topic.toLowerCase().replace(/\s+/g, "-")}" })`
    : "";

  // GraphQL query
  const query = `
    query {
      posts(order: RANKING, first: ${limit}, ${topic ? `after: null` : ""}) {
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
                  slug
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

  // API call
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

  // Defensive check to avoid "undefined posts" errors
  if (!data.data || !data.data.posts) {
    console.log("⚠️ No posts found for topic:", topic);
    return [];
  }

  const posts = data.data.posts.edges.map(({ node }) => ({
    name: node.name,
    tagline: node.tagline,
    votes: node.votesCount,
    url: node.website,
    producthunt_url: node.url,
    topics: node.topics.edges.map((t) => t.node.name).join(", "),
    description: node.description,
    thumbnail: node.thumbnail?.url,
    launchDate: node.createdAt,
  }));

  console.log(`✅ Found ${posts.length} posts for topic: ${topic || "Trending"}`);
  return posts;
}

// Optional test
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "AI Tools").then(console.log).catch(console.error);
}
