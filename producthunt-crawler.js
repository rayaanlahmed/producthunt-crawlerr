import fetch from "node-fetch";
export async function crawlProductHunt(limit = 10) {
  const query = `
    query {
      posts(order: RANKING, first: ${limit}) {
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
  const posts = data.data.posts.edges.map(({ node }) => ({
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

  return posts;
}

