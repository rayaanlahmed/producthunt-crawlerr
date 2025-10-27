import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending software by topic
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Fetch more posts so we have more to filter from
  const query = `
    query {
      posts(order: RANKING, first: 100) {
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

  if (!response.ok) throw new Error(`Product Hunt API failed: ${response.statusText}`);

  const data = await response.json();
  const posts = data?.data?.posts?.edges || [];

  // Fuzzy match for topic (so “Health” matches “Healthcare”, etc.)
  const filtered = topic
    ? posts.filter(({ node }) => {
        const allTopics = node.topics.edges.map(t => t.node.name.toLowerCase());
        const topicLower = topic.toLowerCase();
        return allTopics.some(t =>
          t.includes(topicLower) ||
          topicLower.includes(t)
        );
      })
    : posts;

  // Format clean results
  const formatted = filtered.slice(0, limit).map(({ node }) => ({
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

  console.log(`✅ Found ${formatted.length} posts for topic "${topic || 'All'}"`);
  return formatted;
}

// Optional test runner
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "AI").then(console.log).catch(console.error);
}

