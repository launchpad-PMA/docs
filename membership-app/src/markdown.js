function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  return text;
}

export function renderMarkdown(markdown) {
  const blocks = String(markdown).replaceAll("\r\n", "\n").split(/\n{2,}/);
  const html = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const trimmed = lines.map((line) => line.trimEnd());
    if (trimmed.every((line) => line.trim() === "")) continue;
    if (trimmed[0].startsWith("### ")) {
      html.push(`<h3>${inline(trimmed[0].slice(4))}</h3>`);
      continue;
    }
    if (trimmed[0].startsWith("## ")) {
      html.push(`<h2>${inline(trimmed[0].slice(3))}</h2>`);
      continue;
    }
    if (trimmed[0].startsWith("# ")) {
      html.push(`<h1>${inline(trimmed[0].slice(2))}</h1>`);
      continue;
    }
    if (trimmed.every((line) => line.startsWith("- "))) {
      html.push(`<ul>${trimmed.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`);
      continue;
    }
    if (trimmed.every((line) => line.startsWith("> "))) {
      html.push(`<blockquote><p>${trimmed.map((line) => inline(line.slice(2))).join("<br>")}</p></blockquote>`);
      continue;
    }
    html.push(`<p>${trimmed.map((line) => inline(line)).join("<br>")}</p>`);
  }
  return html.join("\n");
}
