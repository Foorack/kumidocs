/**
 * Auto-detect CSV delimiter by counting semicolons vs commas in header row.
 * Returns ";" or ",".
 */
function detectDelimiter(text: string): string {
  const firstNewline = text.indexOf("\n");
  const header = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const semicolons = (header.match(/;/gu) ?? []).length;
  const commas = (header.match(/,/gu) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

/**
 * Parse a CSV / delimited-text string into a 2D array of strings.
 * Auto-detects comma vs semicolon delimiter.
 * Handles quoted fields, escaped quotes (""), and multi-line quoted values.
 */
function parseCsv(text: string): string[][] {
  if (text.length === 0) {
    return [[""]];
  }

  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  // oxlint-disable-next-line id-length
  for (let idx = 0; idx < text.length; idx++) {
    const char = text[idx];
    const next = text[idx + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        idx++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delim) {
      currentRow.push(currentField);
      currentField = "";
    } else if (char === "\n") {
      currentRow.push(currentField);
      currentField = "";
      rows.push(currentRow);
      currentRow = [];
    } else if (char !== "\r") {
      currentField += char;
    }
  }

  // last field
  currentRow.push(currentField);

  // Push last row if it has meaningful content
  const hasContent = currentRow.length > 1 || currentRow[0] !== "";
  if (rows.length === 0 || hasContent) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Serialize a 2D array back to delimited text (semicolons).
 * Properly quotes fields that contain the delimiter, quotes, or newlines.
 */
function serializeCsv(rows: string[][], delim = ";"): string {
  return rows
    .map((row) =>
      row
        .map((field) => {
          if (field.includes('"') || field.includes(delim) || field.includes("\n")) {
            return `"${field.replaceAll('"', '""')}"`;
          }
          return field;
        })
        .join(delim),
    )
    .join("\n");
}

/**
 * Convert a 0-based column index to an Excel-style column letter.
 * 0 -> "A", 1 -> "B", ..., 25 -> "Z", 26 -> "AA", 27 -> "AB", etc.
 */
function columnLetter(colIndex: number): string {
  let result = "";
  // oxlint-disable-next-line id-length
  let n = colIndex + 1;
  while (n > 0) {
    n--;
    // oxlint-disable-next-line unicorn/prefer-code-point
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

export { columnLetter, parseCsv, serializeCsv };
