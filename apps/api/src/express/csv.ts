export type CsvRow = Record<string, string>;

export function parseCsv(source: string): { headers: string[]; rows: CsvRow[] } {
  const cells: string[][] = [[]];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells[cells.length - 1].push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      cells[cells.length - 1].push(value);
      value = '';
      cells.push([]);
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  cells[cells.length - 1].push(value);

  const nonEmpty = cells.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((header) => header.trim());
  if (headers.some((header) => header.length === 0) || new Set(headers).size !== headers.length) {
    throw new Error('CSV headers must be present and unique.');
  }
  return {
    headers,
    rows: nonEmpty.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? '']))),
  };
}

function escapeCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\r\n');
}
