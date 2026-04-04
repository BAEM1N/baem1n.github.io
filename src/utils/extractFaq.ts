/**
 * Extract FAQ question-answer pairs from markdown content.
 * Looks for a "## FAQ" section with "### question?" subsections.
 */
export type FaqItem = {
  question: string;
  answer: string;
};

export function extractFaq(markdown: string | undefined | null): FaqItem[] {
  if (!markdown) return [];

  // Find the FAQ section
  const faqMatch = markdown.match(/^## FAQ\s*$/m);
  if (!faqMatch || faqMatch.index === undefined) return [];

  // Get content after ## FAQ until next ## heading or end
  const afterFaq = markdown.slice(faqMatch.index + faqMatch[0].length);
  const nextH2 = afterFaq.match(/^## [^#]/m);
  const faqContent = nextH2?.index
    ? afterFaq.slice(0, nextH2.index)
    : afterFaq;

  // Extract ### question? and their answers
  const items: FaqItem[] = [];
  const questionRegex = /^### (.+\?)\s*\n([\s\S]*?)(?=^### |\Z)/gm;

  let match;
  while ((match = questionRegex.exec(faqContent)) !== null) {
    const question = match[1].trim();
    const answer = match[2]
      .trim()
      .replace(/\n{2,}/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown links
      .replace(/[*_`#]/g, "") // strip markdown formatting
      .trim();

    if (question && answer) {
      items.push({ question, answer });
    }
  }

  return items;
}

export function buildFaqJsonLd(items: FaqItem[]) {
  if (items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
