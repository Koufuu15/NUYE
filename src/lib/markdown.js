function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character] ?? character);
}
function safeLinkTarget(value) {
    const target = value.trim();
    return /^(https?:\/\/|mailto:|\/|#|\.\.?\/)/i.test(target) ? target : null;
}
function renderInlineMarkdown(value) {
    const escaped = escapeHtml(value);
    const tokens = [];
    const preserve = (html) => {
        const token = `\u0000${tokens.length}\u0000`;
        tokens.push(html);
        return token;
    };
    const inlineCode = escaped.replace(/`([^`]+)`/g, (_match, code) => preserve(`<code>${code}</code>`));
    const linked = inlineCode.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_match, label, href, title) => {
        const target = safeLinkTarget(href);
        if (!target)
            return label;
        const titleAttribute = title ? ` title="${title}"` : '';
        return preserve(`<a href="${target}"${titleAttribute} rel="noopener noreferrer">${label}</a>`);
    });
    const formatted = linked
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>');
    return formatted.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] ?? '');
}
function splitTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}
function isTableDivider(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}
function renderTable(lines) {
    const headers = splitTableRow(lines[0]);
    const alignments = splitTableRow(lines[1]).map((cell) => cell.startsWith(':') && cell.endsWith(':')
        ? 'center'
        : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : '');
    const rows = lines.slice(2).map(splitTableRow);
    const renderCells = (cells, tag) => cells.map((cell, index) => {
        const align = alignments[index];
        return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${renderInlineMarkdown(cell)}</${tag}>`;
    }).join('');
    return `<table><thead><tr>${renderCells(headers, 'th')}</tr></thead><tbody>${rows.map((row) => `<tr>${renderCells(row, 'td')}</tr>`).join('')}</tbody></table>`;
}
export function markdownToHtml(markdown) {
    const lines = markdown.split(/\r?\n/);
    const output = [];
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) {
            index++;
            continue;
        }
        const fence = /^\s*```/.exec(line);
        if (fence) {
            const codeLines = [];
            index++;
            while (index < lines.length && !/^\s*```/.test(lines[index]))
                codeLines.push(lines[index++]);
            if (index < lines.length)
                index++;
            output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            continue;
        }
        if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
            const tableLines = [line, lines[index + 1]];
            index += 2;
            while (index < lines.length && lines[index].trim() && lines[index].includes('|'))
                tableLines.push(lines[index++]);
            output.push(renderTable(tableLines));
            continue;
        }
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            index++;
            continue;
        }
        if (/^\s*(?:(?:-{3,})|(?:\*{3,})|(?:_{3,}))\s*$/.test(line)) {
            output.push('<hr>');
            index++;
            continue;
        }
        if (/^\s*>/.test(line)) {
            const quoteLines = [];
            while (index < lines.length && /^\s*>/.test(lines[index]))
                quoteLines.push(lines[index++].replace(/^\s*>\s?/, ''));
            output.push(`<blockquote>${markdownToHtml(quoteLines.join('\n'))}</blockquote>`);
            continue;
        }
        const listMatch = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
        if (listMatch) {
            const ordered = /^\d/.test(listMatch[1]);
            const items = [];
            while (index < lines.length) {
                const item = /^\s*([-*+]|\d+[.)])\s+(.+)$/.exec(lines[index]);
                if (!item || /^\d/.test(item[1]) !== ordered)
                    break;
                items.push(`<li>${renderInlineMarkdown(item[2])}</li>`);
                index++;
            }
            const tag = ordered ? 'ol' : 'ul';
            output.push(`<${tag}>${items.join('')}</${tag}>`);
            continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim()
            && !/^\s*(?:```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[index])
            && !/^\s*(?:(?:-{3,})|(?:\*{3,})|(?:_{3,}))\s*$/.test(lines[index])
            && !(index + 1 < lines.length && lines[index].includes('|') && isTableDivider(lines[index + 1]))) {
            paragraph.push(lines[index++]);
        }
        output.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
    }
    return output.join('');
}
