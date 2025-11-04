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

  // ✅ General query (Product Hunt removed topic.posts and filters)
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
            reviewsRating
            reviewsCount
            makers { name username profileImage }
            thumbnail { url }
            topics { edges { node { name slug } } }
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

  // ✅ Fuzzy topic matching (for cases like "wearables" vs "smart-wearables")
  let posts = topicSlug
    ? allPosts.filter(p =>
        p.topics.edges.some(t =>
          t.node.slug.toLowerCase().includes(topicSlug)
        )
      )
    : allPosts;

  // ✅ Fallback: if no posts match, show general trending instead
  if (topicSlug && posts.length === 0) {
    console.warn(`⚠️ No products found for topic "${topicSlug}". Showing trending products instead.`);
    posts = allPosts;
  }

  const formatted = posts.map((node) => ({
    name: node.name,
    tagline: node.tagline,
    votes: node.votesCount,
    rating: node.reviewsRating || "N/A",
    reviewsCount: node.reviewsCount || 0,
    founders:
      node.makers?.map(
        (m) =>
          `<a href="https://www.producthunt.com/@${m.username}" target="_blank">${m.name}</a>`
      ).join(", ") || "Unknown",
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

