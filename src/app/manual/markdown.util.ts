/** Minimal markdown → HTML for user-manual pages (headings, lists, tables, emphasis). */
export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^---+$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    if (line.startsWith('#### ')) {
      out.push(`<h4>${inline(line.slice(5))}</h4>`);
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      out.push(`<h2 id="${slug(line.slice(3))}">${inline(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quote.push(inline(lines[i].slice(2)));
        i++;
      }
      out.push(`<blockquote><p>${quote.join(' ')}</p></blockquote>`);
      continue;
    }

    if (/^\|.+\|$/.test(line.trim()) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
      const header = parseTableRow(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        body.push(parseTableRow(lines[i]));
        i++;
      }
      out.push(renderTable(header, body));
      continue;
    }

    if (/^(\d+\.\s|\-\s|\*\s)/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.\s|\-\s|\*\s)/.test(lines[i])) {
        const item = lines[i].replace(/^(\d+\.\s|\-\s|\*\s)/, '');
        items.push(`<li>${inline(item)}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(inline(lines[i]));
      i++;
    }
    if (para.length > 0) {
      out.push(`<p>${para.join(' ')}</p>`);
    }
  }

  return out.join('\n');
}

function isBlockStart(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith('#') ||
    t.startsWith('> ') ||
    /^---+$/.test(t) ||
    /^(\d+\.\s|\-\s|\*\s)/.test(line) ||
    /^\|.+\|$/.test(t)
  );
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const head = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = href.startsWith('#') ? href : escapeAttr(href);
    return `<a href="${safeHref}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}
