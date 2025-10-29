import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending products, optionally by topic
 * @param {number} limit - Number of posts to fetch
 * @param {string|null} topic - Optional topic filter (ex: "Artificial Intelligence")
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Normalize topic to match Product Hunt's slugs
  const topicSlug = topic
    ? topic.toLowerCase().replace(/&/g, "and").replace(/\s+/g, "-")
    : null;

  // Build query
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

  // ✅ Defensive checks to avoid “Cannot read properties of undefined”
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

  console.log(
    `✅ Found ${formatted.length} posts for topic: ${topicSlug || "Trending"}`
  );

  return formatted;
}

// Optional: test manually
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "Artificial Intelligence")
    .then((data) => console.log(JSON.stringify(data, null, 2)))
    .catch((err) => console.error(err));
}
