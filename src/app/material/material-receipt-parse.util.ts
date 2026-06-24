/** One row parsed from receipt OCR text — user can edit before import. */
export interface ReceiptMaterialDraft {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  currentPrice: number;
  selected: boolean;
}

const SKIP_LINE =
  /ยอดรวม|รวมทั้งสิ้น|รวมเป็นเงิน|grand\s*total|sub\s*total|vat|ภาษี|เงินสด|เงินทอน|change|total|amount\s*due|ชำระ|paid|thank\s*you|ขอบคุณ|tel\.?|โทร|tax\s*id|เลขที่ใบเสร็จ|receipt|invoice|ใบเสร็จ|วันที่|date|time|เวลา/i;

const MONEY_TAIL = /\s+([\d,]+(?:\.\d{1,2})?)\s*$/;
const LEADING_QTY_X = /^(\d+(?:\.\d+)?)\s*(?:[xX×]|\*)\s*/;
const LEADING_QTY_SPACE = /^(\d+(?:\.\d+)?)\s+(?=\p{L})/u;

const UNIT_IN_NAME =
  /\b(\d+(?:\.\d+)?)\s*(kg|กก\.?|g|กรัม|ml|มล\.?|l|ลิตร|pcs|ชิ้น|ถุง|ขวด|กล่อง|แพ็ค|pack)\b/i;

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg',
  กก: 'kg',
  'กก.': 'kg',
  g: 'g',
  กรัม: 'g',
  ml: 'ml',
  มล: 'ml',
  'มล.': 'ml',
  l: 'l',
  ลิตร: 'l',
  pcs: 'pcs',
  ชิ้น: 'pcs',
  ถุง: 'pcs',
  ขวด: 'pcs',
  กล่อง: 'pcs',
  แพ็ค: 'pcs',
  pack: 'pcs',
};

function parseMoney(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

function parseQty(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }
  return Math.round(n * 1000) / 1000;
}

function normalizeUnitToken(raw: string): string {
  const key = raw.trim().toLowerCase();
  return UNIT_ALIASES[key] ?? UNIT_ALIASES[raw.trim()] ?? 'pcs';
}

function suggestCode(name: string, index: number, used: Set<string>): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let base = '';
  if (words.length > 0) {
    const latin = words
      .map((w) => w.replace(/[^\x00-\x7F]/g, ''))
      .filter((w) => w.length > 0);
    if (latin.length > 0) {
      base = latin
        .slice(0, 3)
        .map((w) => w.slice(0, 4).toUpperCase())
        .join('-');
    }
  }
  if (base.length < 3) {
    base = `MAT-${String(index + 1).padStart(3, '0')}`;
  }
  let code = base.slice(0, 20);
  let n = 1;
  while (used.has(code.toLowerCase())) {
    code = `${base.slice(0, 16)}-${n}`;
    n += 1;
  }
  used.add(code.toLowerCase());
  return code;
}

function extractUnitFromName(name: string): { name: string; unit: string } {
  const m = name.match(UNIT_IN_NAME);
  if (!m) {
    return { name: name.trim(), unit: 'pcs' };
  }
  const unit = normalizeUnitToken(m[2]);
  const cleaned = name.replace(UNIT_IN_NAME, ' ').replace(/\s+/g, ' ').trim();
  return { name: cleaned || name.trim(), unit };
}

function stripTrailingAmounts(line: string): { remainder: string; amounts: number[] } {
  const amounts: number[] = [];
  let s = line.trim();
  while (true) {
    const m = s.match(MONEY_TAIL);
    if (!m || m.index == null) {
      break;
    }
    const n = parseMoney(m[1]);
    if (n == null) {
      break;
    }
    amounts.unshift(n);
    s = s.slice(0, m.index).trim();
  }
  return { remainder: s, amounts };
}

function extractLeadingQty(remainder: string): { namePart: string; quantity: number } {
  let work = remainder.trim();
  let quantity = 1;
  const leadX = work.match(LEADING_QTY_X);
  if (leadX) {
    quantity = parseQty(leadX[1]);
    work = work.slice(leadX[0].length).trim();
  } else {
    const leadSpace = work.match(LEADING_QTY_SPACE);
    if (leadSpace) {
      quantity = parseQty(leadSpace[1]);
      work = work.slice(leadSpace[0].length).trim();
    }
  }
  return { namePart: work, quantity };
}

function resolvePrice(quantity: number, amounts: number[]): number {
  if (amounts.length === 0) {
    return 0;
  }
  if (amounts.length >= 2) {
    const unitPrice = amounts[amounts.length - 2];
    const lineTotal = amounts[amounts.length - 1];
    if (unitPrice > 0 && lineTotal > 0 && quantity > 0) {
      const impliedQty = lineTotal / unitPrice;
      if (Math.abs(impliedQty - quantity) <= 0.05 || Math.abs(impliedQty - Math.round(impliedQty)) <= 0.05) {
        return unitPrice;
      }
    }
    return unitPrice > 0 ? unitPrice : lineTotal / Math.max(quantity, 1);
  }
  const lineTotal = amounts[0];
  return quantity > 0 ? Math.round((lineTotal / quantity) * 100) / 100 : lineTotal;
}

function parseReceiptLine(line: string): Omit<ReceiptMaterialDraft, 'code' | 'selected'> | null {
  const trimmed = line.trim();
  if (trimmed.length < 2 || SKIP_LINE.test(trimmed)) {
    return null;
  }
  if (/^[\d,.\s]+$/.test(trimmed)) {
    return null;
  }
  if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(trimmed)) {
    return null;
  }

  const { remainder, amounts } = stripTrailingAmounts(trimmed);
  const { namePart, quantity } = extractLeadingQty(remainder);
  const { name, unit } = extractUnitFromName(namePart);
  if (name.length < 2 || SKIP_LINE.test(name)) {
    return null;
  }

  let qty = quantity;
  if (amounts.length >= 2 && qty === 1) {
    const unitPrice = amounts[amounts.length - 2];
    const lineTotal = amounts[amounts.length - 1];
    if (unitPrice > 0) {
      const implied = lineTotal / unitPrice;
      if (Math.abs(implied - Math.round(implied)) <= 0.05) {
        qty = Math.round(implied);
      }
    }
  }

  return {
    name: name.slice(0, 255),
    unit: unit.slice(0, 20),
    quantity: qty,
    currentPrice: resolvePrice(qty, amounts),
  };
}

/** Turn OCR text from a purchase receipt into material draft rows. */
export function parseReceiptTextToMaterialDrafts(raw: string): ReceiptMaterialDraft[] {
  const usedCodes = new Set<string>();
  const seenNames = new Set<string>();
  const out: ReceiptMaterialDraft[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseReceiptLine(line);
    if (!parsed) {
      continue;
    }
    const nameKey = parsed.name.toLowerCase();
    if (seenNames.has(nameKey)) {
      continue;
    }
    seenNames.add(nameKey);
    const code = suggestCode(parsed.name, out.length, usedCodes);
    out.push({
      code,
      name: parsed.name,
      unit: parsed.unit,
      quantity: parsed.quantity,
      currentPrice: parsed.currentPrice,
      selected: true,
    });
  }
  return out;
}
