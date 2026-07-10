/** Minimal HTML → Markdown converter (headings, bold, italic, lists, links, images, tables, code). */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  return walk(root).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function walk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const kids = () => Array.from(node.childNodes).map(walk).join("");
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "h1": return `\n# ${kids()}\n\n`;
    case "h2": return `\n## ${kids()}\n\n`;
    case "h3": return `\n### ${kids()}\n\n`;
    case "strong": case "b": return `**${kids()}**`;
    case "em": case "i": return `*${kids()}*`;
    case "u": return `<u>${kids()}</u>`;
    case "s": case "strike": return `~~${kids()}~~`;
    case "code": return `\`${kids()}\``;
    case "pre": return `\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
    case "blockquote": return kids().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
    case "p": return `${kids()}\n\n`;
    case "br": return "  \n";
    case "hr": return "\n---\n\n";
    case "a": return `[${kids()}](${node.getAttribute("href") ?? ""})`;
    case "img": return `![${node.getAttribute("alt") ?? ""}](${node.getAttribute("src") ?? ""})`;
    case "ul": return Array.from(node.children).map((li) => `- ${walk(li).trim()}`).join("\n") + "\n\n";
    case "ol": return Array.from(node.children).map((li, i) => `${i + 1}. ${walk(li).trim()}`).join("\n") + "\n\n";
    case "li": return kids();
    case "table": {
      const rows = Array.from(node.querySelectorAll("tr"));
      if (!rows.length) return "";
      const cells = (r: Element) => Array.from(r.querySelectorAll("th,td")).map((c) => walk(c).trim().replace(/\n/g, " "));
      const head = cells(rows[0]);
      const body = rows.slice(1).map(cells);
      const sep = head.map(() => "---");
      const line = (arr: string[]) => `| ${arr.join(" | ")} |`;
      return [line(head), line(sep), ...body.map(line)].join("\n") + "\n\n";
    }
    default: return kids();
  }
}

export function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
