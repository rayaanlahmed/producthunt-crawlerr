import fetch from "node-fetch";

/**
 * Crawl Product Hunt for trending software (optionally filter by topic keyword)
 */
export async function crawlProductHunt(limit = 10, topic = null) {
  // Product Hunt GraphQL API doesn’t support topic filters directly,
  // so we’ll fetch the top posts, then filter them manually by keyword.
  const query = `
    query {
      posts(order: RANKING, first: ${limit * 3}) {
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
  const posts = data?.data?.posts?.edges || [];

  // --- Filter by topic keyword if user selected one ---
  const filtered = topic
    ? posts.filter(({ node }) =>
        node.topics.edges.some(t =>
          t.node.name.toLowerCase().includes(topic.toLowerCase())
        )
      )
    : posts;

  // --- Format data ---
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

  console.log(`✅ Found ${formatted.length} matching posts${topic ? ` for topic "${topic}"` : ""}.`);
  return formatted;
}

// Manual test mode
if (import.meta.url === `file://${process.argv[1]}`) {
  crawlProductHunt(10, "Artificial Intelligence")
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => console.error(err));
}
