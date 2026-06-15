/**
 * Extract FAQ question-answer pairs from markdown content.
 * Looks for a FAQ section with "### question?" subsections.
 * Supported section headings:
 * - ## FAQ
 * - ## Frequently Asked Questions
 * - ## 자주 묻는 질문
 */
export type FaqItem = {
  question: string;
  answer: string;
};

export function extractFaq(markdown: string | undefined | null): FaqItem[] {
  if (!markdown) return [];

  // Find the FAQ section. Korean posts use "자주 묻는 질문" while English
  // posts may use either the terse "FAQ" or the expanded heading.
  const faqMatch = markdown.match(
    /^## (?:FAQ|Frequently Asked Questions|자주 묻는 질문)\s*$/m,
  );
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
