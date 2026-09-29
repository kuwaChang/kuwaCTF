function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url) {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:)/i.test(value)) {
    return value;
  }
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }
  return "";
}

function renderInline(raw) {
  const tokens = [];
  const source = String(raw);
  const tokenized = source.replace(/`([^`\n]+)`|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)/g, (all, code, alt, imageUrl, label, linkUrl) => {
    const id = tokens.length;
    if (code !== undefined) {
      tokens.push({ type: "code", value: code });
    } else if (imageUrl !== undefined) {
      tokens.push({ type: "image", alt: alt || "", url: imageUrl });
    } else {
      tokens.push({ type: "link", label, url: linkUrl });
    }
    return `\u0000${id}\u0000`;
  });

  let html = escapeHtml(tokenized);
  html = html.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, star, under) => `<strong>${star || under}</strong>`);
  html = html.replace(/(^|[^\w*])\*([^*\n]+)\*/g, (_, lead, text) => `${lead}<em>${text}</em>`);
  html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

  return html.replace(/\u0000(\d+)\u0000/g, (_, id) => {
    const token = tokens[Number(id)];
    if (!token) {
      return "";
    }
    if (token.type === "code") {
      return `<code>${escapeHtml(token.value)}</code>`;
    }
    const href = safeUrl(token.url);
    if (!href) {
      return escapeHtml(token.type === "image"
        ? `![${token.alt}](${token.url})`
        : `[${token.label}](${token.url})`);
    }
    const safeHref = escapeHtml(href);
    if (token.type === "image") {
      return `<img src="${safeHref}" alt="${escapeHtml(token.alt)}">`;
    }
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(token.label)}</a>`;
  });
}

function isHeading(line) {
  return /^#{1,4}\s+\S/.test(line);
}

function isRule(line) {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function isQuote(line) {
  return /^>\s?/.test(line);
}

function isUnordered(line) {
  return /^\s*[-*+]\s+\S/.test(line);
}

function isOrdered(line) {
  return /^\s*\d+\.\s+\S/.test(line);
}

function isFence(line) {
  return /^```/.test(line.trim());
}

function isTableStart(lines, index) {
  const current = lines[index] || "";
  const next = lines[index + 1] || "";
  return current.trim().startsWith("|") && current.includes("|") && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next.trim());
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) {
    row = row.slice(1);
  }
  if (row.endsWith("|")) {
    row = row.slice(0, -1);
  }
  return row.split("|").map((cell) => cell.trim());
}

function isBlockStart(lines, index) {
  const line = lines[index] || "";
  return isFence(line) || isHeading(line) || isRule(line) || isQuote(line) || isUnordered(line) || isOrdered(line) || isTableStart(lines, index);
}

export function renderMarkdown(source) {
  const text = String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const code = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (isHeading(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push(`<h${level}>${renderInline(line.replace(/^#{1,4}\s+/, ""))}</h${level}>`);
      index += 1;
      continue;
    }

    if (isRule(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (isQuote(line)) {
      const quoted = [];
      while (index < lines.length && isQuote(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    if (isUnordered(line) || isOrdered(line)) {
      const ordered = isOrdered(line);
      const marker = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (index < lines.length && (ordered ? isOrdered(lines[index]) : isUnordered(lines[index]))) {
        items.push(`<li>${renderInline(lines[index].replace(marker, ""))}</li>`);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitTableRow(lines[index]);
      index += 2;
      const body = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        body.push(splitTableRow(lines[index]));
        index += 1;
      }
      const headHtml = `<tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>`;
      const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("");
      blocks.push(`<table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(renderInline(lines[index]));
      index += 1;
    }
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.join("<br>")}</p>`);
    }
  }

  return blocks.join("");
}

if (typeof window !== "undefined") {
  window.renderMarkdown = renderMarkdown;
}
