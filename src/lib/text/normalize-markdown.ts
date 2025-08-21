/**
 * Normalize LLM Markdown output to prefer clean Markdown over HTML or fenced prose.
 * - Unwrap full-document fenced blocks that are clearly prose/markdown
 * - Convert common HTML tags to Markdown or plain text and handle <br>/<p>
 * - Escape stray angle brackets outside code/math so they don't look like HTML
 */
export function normalizeModelMarkdown(input: string): string {
  let text = String(input || '');

  if (!text.trim()) return '';

  // 1) Unwrap a single full-document fenced block (```md / ```markdown / ``` / any)
  {
    const m1 = text.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i);
    if (m1) {
      text = m1[1].trim();
    } else {
      const m2 = text.match(/^```([A-Za-z0-9+_.-]*)\s*\n([\s\S]*?)\n```\s*$/);
      if (m2) {
        const lang = (m2[1] || '').toLowerCase();
        const inner = m2[2];
        const looksLikeProse =
          lang === '' ||
          lang === 'markdown' ||
          lang === 'md' ||
          /^(#{1,6}\s|[-*]\s|\d+\.\s)/m.test(inner) ||
          /\n\n/.test(inner);
        if (looksLikeProse) text = inner.trim();
      }
    }
  }

  // Handle legacy placeholders from a previous sanitizer bug and any leaked masks
  text = text.replace(/<<MD_MASK_\d+>>/g, '');
  text = text.replace(/&lt;&lt;MD_MASK_\d+&gt;&gt;/g, '');
  text = text.replace(/%%MDMASK:\d+%%/g, '');
  // Heuristic repairs for common masked holes seen in prior content
  // e.g., "time complexity (-notation)" -> "time complexity (Big-O notation)"
  text = text.replace(/\(\s*-\s*notation\s*\)/gi, '(Big-O notation)');
  // Remove empty example parentheses "(e.g., )" and generic empty parens
  text = text.replace(/\(\s*e\.g\.,\s*\)/gi, '');
  text = text.replace(/\(\s*\)/g, '');

  // 2) Convert a few safe HTML tags to Markdown equivalents or plain text
  // Paragraphs and line breaks
  text = text
    .replace(/<br\s*\/?>(\s*)/gi, '  \n')
    .replace(/\s*<\/p>\s*/gi, '\n\n')
    .replace(/\s*<p[^>]*>\s*/gi, '');

  // Bold/italic/code wrappers (greedy across lines in a conservative way)
  const wrap = (
    s: string,
    openTag: RegExp,
    closeTag: RegExp,
    mdWrapper: (content: string) => string
  ) => {
    let out = s;
    // Replace repeatedly in case of multiple occurrences
    for (let i = 0; i < 10; i++) {
      const mOpen = out.match(openTag);
      const mClose = out.match(closeTag);
      if (!mOpen || !mClose) break;
      const start = mOpen.index! + mOpen[0].length;
      const end = mClose.index!;
      if (end <= start) break;
      const before = out.slice(0, mOpen.index!);
      const content = out.slice(start, end);
      const after = out.slice(mClose.index! + mClose[0].length);
      out = before + mdWrapper(content) + after;
    }
    return out;
  };

  text = wrap(text, /<strong>/i, /<\/strong>/i, (c) => `**${c}**`);
  text = wrap(text, /<b>/i, /<\/b>/i, (c) => `**${c}**`);
  text = wrap(text, /<em>/i, /<\/em>/i, (c) => `*${c}*`);
  text = wrap(text, /<i>/i, /<\/i>/i, (c) => `*${c}*`);
  text = wrap(text, /<code>/i, /<\/code>/i, (c) => `\`${c}\``);
  // For <sub>/<sup>, keep the content but drop the tags
  text = text.replace(/<\/?(?:sub|sup)[^>]*>/gi, '');

  // 3) Escape angle brackets OUTSIDE code blocks, inline code, or math
  // Mask protected regions first, escape the rest, then restore
  const masks: string[] = [];
  const mask = (match: string) => {
    masks.push(match);
    return `%%MDMASK:${masks.length - 1}%%`;
  };

  // Code fences
  text = text.replace(/```[\s\S]*?```/g, mask);
  // Math blocks $$...$$
  text = text.replace(/\$\$[\s\S]*?\$\$/g, mask);
  // Inline code `...`
  text = text.replace(/`[^`]*`/g, mask);
  // Inline math $...$ (naive but practical; avoids $$ pairs)
  text = text.replace(/(?<!\$)\$([^$\n]|[^$\n][\s\S]*?[^$\n])\$(?!\$)/g, mask);
  // LaTeX math delimiters \( ... \) and \[ ... \]
  text = text.replace(/\\\([\s\S]*?\\\)/g, mask).replace(/\\\[[\s\S]*?\\\]/g, mask);

  // Escape remaining angle brackets
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Escape stray dollar signs so remark-math does not treat $...$ across
  // unrelated content (e.g., Qlik's $ identifier). Preserve already-escaped \$.
  try {
    text = text.replace(/(?<!\\)\$/g, '\\\$');
  } catch {
    // Fallback when lookbehind unsupported (shouldn't happen in Node 18+)
    text = text.replace(/(^|[^\\])\$/g, '$1\\$');
  }

  // Restore masks
  text = text.replace(/%%MDMASK:(\d+)%%/g, (_, idx) => masks[Number(idx)] || '');

  // 4) If there is a single stray ``` fence, strip it to avoid rendering issues
  const tickCount = (text.match(/```/g) || []).length;
  if (tickCount === 1) text = text.replace(/```/g, '');

  return text.trim();
}

/**
 * Append a short, strong formatting instruction to a prompt.
 * Useful to enforce consistent Markdown with math.
 */
export function withStrictMarkdownRules(prompt: string): string {
  const rules = [
    'STRICT FORMATTING:',
    '- Use Markdown only. Do NOT use raw HTML tags.',
    '- For math, use inline $...$ or block $$...$$ (or \\(...\\), \\[...\\]).',
    '- Do NOT wrap normal prose in code fences. Use code fences only for actual code.',
    '- Avoid placeholder tokens like <X>; write them plainly or escape as &lt;X&gt;.',
  ].join('\n');
  return `${prompt}\n\n${rules}`;
}


/**
 * Strip meta/dependent phrasing like "Based on the lesson" or "According to the text"
 * from model outputs so prompts/answers read as self-contained.
 */
export function stripDependentPhrasing(input: string): string {
  let s = String(input || '');
  if (!s.trim()) return '';

  // 1) Remove common leading meta qualifiers
  const leadingPatterns: RegExp[] = [
    /^(\s*)(based on|according to|from|using|with reference to|given|considering|in)\s+(?:the\s+)?(?:lesson|content|text|passage|reading|material|document|context|above|provided|this(?:\s+(?:lesson|content|text|passage|reading|material|document|context))?)\s*(?:,|:|-)?\s*/i,
    /^(\s*)(in\s+(?:the|this)\s+(?:lesson|content|text|passage|reading|material|document|context))\s*(?:,|:|-)?\s*/i,
  ];
  for (const re of leadingPatterns) s = s.replace(re, '');

  // 2) Remove in-line meta references that add dependency wording
  const inlinePatterns: RegExp[] = [
    /\b(based on|according to|from|within|using|in)\s+(?:the\s+)?(?:lesson|content|text|passage|reading|material|document|context|above|provided|this(?:\s+(?:lesson|content|text|passage|reading|material|document|context))?)\b/gi,
    /\b(as\s+described\s+in|as\s+stated\s+in)\s+(?:the\s+)?(?:lesson|content|text|passage|reading|material|document|context)\b/gi,
    /\b(in\s+(?:the|this)\s+(?:lesson|content|text|passage|reading|material|document|context))\b/gi,
  ];
  for (const re of inlinePatterns) s = s.replace(re, '');

  // 3) Remove trailing qualifiers like ", in the lesson." or ", from the text."
  s = s.replace(/(,?\s*)(in|from|within)\s+(?:the\s+)?(?:lesson|content|text|passage|reading|material|document|context|above)\s*[\.]?\s*$/i, '');

  // 4) Collapse extra spaces and fix common punctuation spacing
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+([,.;!?])/g, '$1');
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

  return s.trim();
}

