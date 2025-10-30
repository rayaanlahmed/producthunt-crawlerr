import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending products, optionally by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic filter (ex: "ai")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // ✅ Use slug instead of name (Product Hunt requires slug format)
  const topicSlug = topic ? topic.trim().toLowerCase().replace(/\s+/g, "-") : null;

  // Build query using `slug` instead of `name`
  const query = topicSlug
    ? `
      query {
        topic(slug: "${topicSlug}") {
          name
          posts(first: ${limit}) {
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

  // Fetch data from Product Hunt API
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

  // ✅ Defensive check
  if (topicSlug) {
    if (data?.data?.topic?.posts?.edges?.length) {
      posts = data.data.topic.posts.edges.map(({ node }) => node);
    } else {
      console.log(`⚠️ No posts found for topic: ${topicSlug}`);
      return [];
    }
  } else if (data?.data?.posts?.edges?.length) {
    posts = data.data.posts.edges.map(({ node }) => node);
  } else {
    console.log("⚠️ No posts field returned by Product Hunt");
    return [];
  }

  // Format data for frontend
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
  crawlProductHunt(10, "ai")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((err) => console.error(err));
}
