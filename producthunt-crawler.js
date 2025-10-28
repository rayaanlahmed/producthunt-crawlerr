import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending or topic-specific software
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Map frontend category to Product Hunt topic slug
  const topicMap = {
    "artificial-intelligence": "artificial-intelligence",
    "developer-tools": "developer-tools",
    "design-tools": "design-tools",
    "marketing": "marketing",
    "productivity": "productivity",
    "finance": "finance",
    "education": "education",
    "healthtech": "healthtech",
    "web3": "web3",
    "startups": "startups",
    "customer-communication": "customer-communication",
    "wearables": "wearables",
  };

  const topicSlug = topic ? topicMap[topic] || topic : null;

  // 🧠 Choose query based on whether a topic is selected
  const query = topicSlug
    ? `
      query {
        topic(slug: "${topicSlug}") {
          name
          posts(order: RANKING, first: ${limit}) {
            edges {
              node {
                name
                tagline
                votesCount
                website
                description
                createdAt
                thumbnail { url }
                url
              }
            }
          }
        }
      }`
    : `
      query {
        posts(order: RANKING, first: ${limit}) {
          edges {
            node {
              name
              tagline
              votesCount
              website
              description
              createdAt
              thumbnail { url }
              url
            }
          }
        }
      }`;

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.PRODUCTHUNT_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) throw new Error(`Product Hunt API failed: ${response.statusText}`);

  const data = await response.json();

  // 🧹 Normalize response structure
  const posts =
    topicSlug && data.data.topic
      ? data.data.topic.posts.edges
      : data.data.posts?.edges || [];

  if (!posts || posts.length === 0) return [];

  return posts.map(({ node }) => ({
    name: node.name,
    tagline: node.tagline,
    votes: node.votesCount,
    url: node.website,
    producthunt_url: node.url,
    description: node.description,
    thumbnail: node.thumbnail?.url,
    launchDate: node.createdAt,
  }));
}
