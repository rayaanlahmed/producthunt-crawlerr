// Simple scoring logic for Product Hunt crawler results

export function evaluateProducts(products) {
  // products: array of product objects from the crawler
  return products.map((p) => {
    let score = 0;

    // ---- 1. Quantitative Analysis ----
    if (p.votes >= 500) score += 40;
    else if (p.votes >= 250) score += 30;
    else if (p.votes >= 100) score += 20;
    else score += 10;

    // ---- 2. Keyword/Topic Relevance ----
    const topicStr = (p.topics || "").toLowerCase();
    const tagline = (p.tagline || "").toLowerCase();

    if (topicStr.includes("ai") || tagline.includes("ai")) score += 20;
    if (topicStr.includes("productivity") || tagline.includes("automation")) score += 10;
    if (topicStr.includes("developer") || topicStr.includes("tools")) score += 5;

    // ---- 3. Recency (Launch Date) ----
    try {
      const launchDate = new Date(p.launchDate);
      const daysSinceLaunch = (Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLaunch < 7) score += 15;
      else if (daysSinceLaunch < 30) score += 10;
      else score += 5;
    } catch {
      score += 0;
    }

    // ---- 4. Sentiment/Tagline Heuristic ----
    if (tagline.includes("best") || tagline.includes("fast") || tagline.includes("easy"))
      score += 5;
    if (tagline.includes("community") || tagline.includes("open source"))
      score += 5;

    if (score > 100) score = 100;

    return { ...p, score };
  });
}
