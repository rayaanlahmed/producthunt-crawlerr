import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending software by topic (if provided)
 * Returns list of products with metadata
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Choose query depending on whether topic is selected
  const topicFilter = topic
    ? `posts(order: RANKING, first: ${limit}, where: { topics: { name: "${topic}" } })`
    : `posts(order: RANKING, first: ${limit})`;

  const query = `
    query {
      ${topicFilter} {
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

  if (!response.ok) {
    throw new Error(`Product Hunt API failed: ${response.statusText}`);
  }

  const data = await response.json();

  //  Defensive check: make sure posts exist
  const posts = data?.data?.posts?.edges;
  if (!posts) {
    console.warn("No posts found in Product Hunt API response:", data);
    return [];
  }

  // --- Format data ---
  const formatted = posts.map(({ node }) => ({
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

  return formatted;
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
