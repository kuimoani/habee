import { marked } from "marked";

export function renderMarkdown(markdown) {
  return marked.parse(escapeHtml(String(markdown || "")));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
