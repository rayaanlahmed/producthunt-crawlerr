import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending products, optionally by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic filter (ex: "artificial-intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  console.log("🧠 Starting crawl for topic:", topic);
  console.log("🔑 Using API key:", !!process.env.PRODUCTHUNT_API_KEY);

  const topicSlug = topic
    ? topic.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-")
    : null;

  // ✅ Updated query (no deprecated topic.posts or filters)
  const query = `
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

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.PRODUCTHUNT_API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`❌ Product Hunt API failed: ${response.statusText}`);
  }

  const data = await response.json();
  console.log("🧩 Product Hunt Raw Response:", JSON.stringify(data, null, 2));

  if (data.errors) {
    console.error("🚨 API Error:", data.errors);
    return [];
  }

  const allPosts = data?.data?.posts?.edges?.map(({ node }) => node) || [];

  // ✅ Client-side topic filtering since API no longer supports filters
  const posts = topicSlug
    ? allPosts.filter(p =>
        p.topics.edges.some(t =>
          t.node.slug.toLowerCase() === topicSlug.toLowerCase()
        )
      )
    : allPosts;

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

  console.log(`✅ Found ${formatted.length} posts for topic: ${topicSlug || "Trending"}`);
  return formatted;
}

// Optional manual test
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "artificial-intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((err) => console.error(err));
}

