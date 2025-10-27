import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending products, optionally by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic filter (ex: "Artificial Intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // --- Topic mapping to real Product Hunt slugs ---
  const topicSlugMap = {
    "artificial intelligence": "artificial-intelligence",
    "developer tools": "developer-tools",
    "design tools": "design-tools",
    "marketing": "marketing",
    "productivity": "productivity",
    "finance": "finance",
    "education": "education",
    "health & fitness": "healthtech", // Product Hunt doesn't have "Health & Fitness"
    "web3": "web3",
    "startups": "startups",
  };

  const topicSlug = topic
    ? topicSlugMap[topic.toLowerCase()] || topic.toLowerCase().replace(/\s+/g, "-")
    : null;

  // --- Build GraphQL query ---
  const query = topicSlug
    ? `
      query {
        topic(slug: "${topicSlug}") {
          name
          posts(first: ${limit}, order: RANKING) {
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

  // --- Fetch data ---
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

  // Handle cases safely
  if (topicSlug && data?.data?.topic?.posts?.edges) {
    posts = data.data.topic.posts.edges.map(({ node }) => node);
  } else if (data?.data?.posts?.edges) {
    posts = data.data.posts.edges.map(({ node }) => node);
  } else {
    console.log(`⚠️ No posts found for topic: ${topicSlug}`);
    return [];
  }

  // --- Format results ---
  const formatted = posts.map((node) => ({
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

  console.log(
    `✅ Found ${formatted.length} posts for topic: ${topicSlug || "Trending"}`
  );

  return formatted;
}

// --- Manual test runner ---
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "Artificial Intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((err) => console.error(err));
}

