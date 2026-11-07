function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let listOpen = false

  for (const line of lines) {
    const listItem = /^\s*[-*]\s+(.+)$/.exec(line)
    if (listItem) {
      if (!listOpen) {
        output.push('<ul>')
        listOpen = true
      }
      output.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`)
      continue
    }

    if (listOpen) {
      output.push('</ul>')
      listOpen = false
    }
    if (!line.trim()) continue

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
    } else {
      output.push(`<p>${renderInlineMarkdown(line)}</p>`)
    }
  }

  if (listOpen) output.push('</ul>')
  return output.join('')
}
