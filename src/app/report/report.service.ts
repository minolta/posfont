import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';
import { resolvedLineStatus } from '../order/order-line-status.util';
import type { PosOrder } from '../order/order.model';
import {
  readOrderPaidByCredit,
  readOrderPaidByQrScan,
  readPosOrderChange,
  readPosOrderNote,
  readPosOrderPaidPrice,
} from '../order/order-pay.util';
import { OrderService } from '../order/order.service';

import type { DailyReport, DailyReportApiDto, DailyReportFoodTableRow, DailyReportTableRow } from './report.model';

/** By food rows: highest line-total first, then highest quantity; code breaks ties. */
function compareFoodRowsByTotalThenQtyDesc(
  a: DailyReportFoodTableRow,
  b: DailyReportFoodTableRow,
): number {
  const t = b.total - a.total;
  if (t !== 0) {
    return t;
  }
  const q = b.quantity - a.quantity;
  if (q !== 0) {
    return q;
  }
  return a.foodCode.localeCompare(b.foodCode);
}

function n(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

function localYmdFromIso(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function payableTotal(o: PosOrder): number {
  return (o.lines ?? []).reduce((sum, ln) => {
    if (resolvedLineStatus(ln, o) === 'CANCEL') {
      return sum;
    }
    return sum + ln.quantity * ln.unitPrice;
  }, 0);
}

/** Calendar day cash was settled (preferred for daily cash report). */
function paidLocalYmd(order: PosOrder): string | null {
  return localYmdFromIso(order.paidAt ?? order.orderDate);
}

function normalizeApiFoodRow(raw: unknown): DailyReportFoodTableRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const codeRaw = row['foodCode'] ?? row['food_code'];
  const code =
    typeof codeRaw === 'string' && codeRaw.trim() !== ''
      ? codeRaw.trim()
      : typeof codeRaw === 'number'
        ? String(codeRaw)
        : '';
  const nameRaw = row['foodName'] ?? row['food_name'];
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() !== ''
      ? nameRaw.trim()
      : code || '—';
  const qty = n(row['quantity'] ?? row['qty']);
  const total = n(row['total'] ?? row['lineTotal'] ?? row['line_total']);
  return {
    foodCode: code || '—',
    foodName: name,
    quantity: Math.max(0, Math.round(qty)),
    total,
  };
}

/**
 * Daily report row DTOs may use `orderNote`, `order_note`, or `note`. Using `??` alone fails when
 * `note` is present but empty — we must pick the first non-empty string (prefer order-specific keys).
 */
function extractDailyReportRowOrderNote(row: Record<string, unknown>): string {
  const keyOrder = [
    'orderNote',
    'order_note',
    'orderNoteText',
    'order_note_text',
    'Note',
    'note',
  ] as const;
  for (const key of keyOrder) {
    const v = row[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim().slice(0, 2000);
    }
  }
  const nested = row['order'];
  if (nested && typeof nested === 'object') {
    const or = nested as Record<string, unknown>;
    for (const key of ['note', 'orderNote', 'order_note']) {
      const v = or[key];
      if (typeof v === 'string' && v.trim().length > 0) {
        return v.trim().slice(0, 2000);
      }
    }
  }
  return '';
}

function normalizeApiRow(raw: unknown): DailyReportTableRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const orderId = n(row['orderId'] ?? row['order_id']);
  const orderNo = String(row['orderNo'] ?? row['order_no'] ?? '').trim() || `#${orderId}`;
  const paidAtRaw = row['paidAt'] ?? row['paid_at'];
  const paidAt = typeof paidAtRaw === 'string' ? paidAtRaw : null;
  const totalDue = n(row['totalDue'] ?? row['total_due']);
  const pp = row['paidPrice'] ?? row['paid_price'];
  const ch = row['change'] ?? row['change_amount'];
  const qrRaw = row['paidByQrScan'] ?? row['paid_by_qr_scan'];
  const paidByQrScan =
    qrRaw === true || qrRaw === 'true' || qrRaw === 1 || qrRaw === '1';
  const creditRaw = row['paidByCredit'] ?? row['paid_by_credit'];
  const paidByCredit =
    creditRaw === true || creditRaw === 'true' || creditRaw === 1 || creditRaw === '1';
  const orderNote = extractDailyReportRowOrderNote(row);
  return {
    orderId,
    orderNo,
    paidAt,
    totalDue,
    paidPrice: pp != null && pp !== '' ? n(pp) : null,
    change: ch != null && ch !== '' ? n(ch) : null,
    paidByQrScan,
    paidByCredit,
    orderNote,
  };
}

/** Sum tendered via credit card (`paidPrice` when set, otherwise line due). */
function totalReceivedByCreditFromRows(rows: DailyReportTableRow[]): number {
  return rows.reduce((sum, r) => {
    if (!r.paidByCredit) {
      return sum;
    }
    const amt = r.paidPrice != null ? r.paidPrice : r.totalDue;
    return sum + amt;
  }, 0);
}

/** Sum tendered via QR (`paidPrice` when set, otherwise line due). */
function totalReceivedByQrScanFromRows(rows: DailyReportTableRow[]): number {
  return rows.reduce((sum, r) => {
    if (!r.paidByQrScan) {
      return sum;
    }
    const amt = r.paidPrice != null ? r.paidPrice : r.totalDue;
    return sum + amt;
  }, 0);
}

/** Tendered amounts for cash-paid rows only (excludes QR and credit). */
function totalCashReceivedFromRows(rows: DailyReportTableRow[]): number {
  return rows.reduce((sum, r) => {
    if (r.paidByQrScan || r.paidByCredit || r.paidPrice == null) {
      return sum;
    }
    return sum + r.paidPrice;
  }, 0);
}

/** Change given back on cash-paid rows only (QR and credit excluded). */
function totalChangeCashOnlyFromRows(rows: DailyReportTableRow[]): number {
  return rows.reduce((sum, r) => {
    if (r.paidByQrScan || r.paidByCredit || r.change == null) {
      return sum;
    }
    return sum + r.change;
  }, 0);
}

function mapApiToDailyReport(raw: DailyReportApiDto, fallbackStart: string, fallbackEnd: string): DailyReport {
  const fromApiStart = raw.startDate ?? raw.start_date ?? raw.date;
  const fromApiEnd = raw.endDate ?? raw.end_date ?? raw.date;
  const startDate = String(fromApiStart ?? fallbackStart).slice(0, 10);
  const endDate = String(fromApiEnd ?? fallbackEnd).slice(0, 10);
  const listRaw = raw.rows ?? raw.orders ?? [];
  const rows = Array.isArray(listRaw) ? listRaw.map(normalizeApiRow) : [];
  const foodsRaw = raw.foods ?? raw.items ?? [];
  const foodsIn = Array.isArray(foodsRaw) ? foodsRaw.map(normalizeApiFoodRow) : [];
  const foods =
    foodsIn.length > 0 ? [...foodsIn].sort(compareFoodRowsByTotalThenQtyDesc) : [];
  const apiQrRaw = raw.totalReceivedByQrScan ?? raw.total_received_by_qr_scan;
  const apiCreditRaw = raw.totalReceivedByCredit ?? raw.total_received_by_credit;
  let totalReceivedByQrScan = totalReceivedByQrScanFromRows(rows);
  if (
    rows.length === 0 &&
    apiQrRaw !== undefined &&
    apiQrRaw !== null &&
    String(apiQrRaw).trim() !== ''
  ) {
    totalReceivedByQrScan = n(apiQrRaw);
  }
  let totalReceivedByCredit = totalReceivedByCreditFromRows(rows);
  if (
    rows.length === 0 &&
    apiCreditRaw !== undefined &&
    apiCreditRaw !== null &&
    String(apiCreditRaw).trim() !== ''
  ) {
    totalReceivedByCredit = n(apiCreditRaw);
  }
  const paidByCreditOrderCount =
    rows.length > 0
      ? rows.reduce((c, row) => c + (row.paidByCredit ? 1 : 0), 0)
      : n(raw.paidByCreditOrderCount ?? raw.paid_by_credit_order_count);
  const totalSalesNum = n(raw.totalSales ?? raw.total_sales);
  const realCashSalesDueInShop = Math.max(
    0,
    totalSalesNum - totalReceivedByQrScan - totalReceivedByCredit,
  );
  let totalCashReceived = n(raw.totalCashReceived ?? raw.total_cash_received);
  let totalChange = n(raw.totalChange ?? raw.total_change);
  if (rows.length > 0) {
    totalCashReceived = totalCashReceivedFromRows(rows);
    totalChange = totalChangeCashOnlyFromRows(rows);
  }
  return {
    startDate,
    endDate,
    orderCount: n(raw.orderCount ?? raw.order_count),
    paidOrderCount: n(raw.paidOrderCount ?? raw.paid_order_count),
    paidByQrScanOrderCount: n(
      raw.paidByQrScanOrderCount ?? raw.paid_by_qr_scan_order_count,
    ),
    paidByCreditOrderCount,
    totalReceivedByQrScan,
    totalReceivedByCredit,
    realCashSalesDueInShop,
    totalSales: totalSalesNum,
    totalCashReceived,
    totalChange,
    source: 'api',
    rows,
    foods,
  };
}

function ymdInRange(ymd: string | null | undefined, start: string, end: string): boolean {
  if (ymd == null || ymd === '') {
    return false;
  }
  return ymd >= start && ymd <= end;
}

function aggregateOrdersClientSide(orders: PosOrder[], start: string, end: string): DailyReport {
  const rows: DailyReportTableRow[] = [];
  /** Group by food id when present else by code. */
  const foodBuckets = new Map<
    string,
    { foodCode: string; foodName: string; quantity: number; total: number }
  >();

  let paidOrderCount = 0;
  let paidByQrScanOrderCount = 0;
  let paidByCreditOrderCount = 0;
  let totalReceivedByQrScan = 0;
  let totalReceivedByCredit = 0;
  let totalSales = 0;
  let totalCashReceived = 0;
  let totalChange = 0;
  /** Orders overlapping the inclusive range by orderDate or paid day (for coarse count fallback). */
  const touchIds = new Set<number>();

  for (const o of orders) {
    if (o.id == null) {
      continue;
    }
    const created = localYmdFromIso(o.orderDate);
    const paidDay = o.paid ? paidLocalYmd(o) : null;
    if (ymdInRange(created, start, end) || ymdInRange(paidDay, start, end)) {
      touchIds.add(o.id);
    }
    if (!o.paid || !ymdInRange(paidDay, start, end)) {
      continue;
    }
    paidOrderCount += 1;
    const paidQr = readOrderPaidByQrScan(o);
    const paidCredit = readOrderPaidByCredit(o);
    const due = payableTotal(o);
    const pp = readPosOrderPaidPrice(o);
    const ch = readPosOrderChange(o);
    if (paidQr) {
      paidByQrScanOrderCount += 1;
      totalReceivedByQrScan += pp != null ? pp : due;
    } else if (paidCredit) {
      paidByCreditOrderCount += 1;
      totalReceivedByCredit += pp != null ? pp : due;
    }
    totalSales += due;
    if (!paidQr && !paidCredit) {
      if (pp != null) {
        totalCashReceived += pp;
      }
      if (ch != null) {
        totalChange += ch;
      }
    }
    rows.push({
      orderId: o.id,
      orderNo: o.orderNo,
      paidAt: o.paidAt,
      totalDue: due,
      paidPrice: pp,
      change: ch,
      paidByQrScan: paidQr,
      paidByCredit: paidCredit,
      orderNote: readPosOrderNote(o) ?? '',
    });
    for (const ln of o.lines ?? []) {
      if (resolvedLineStatus(ln, o) === 'CANCEL') {
        continue;
      }
      const f = ln.food;
      if (f == null) {
        continue;
      }
      const fid = f.id;
      const key = fid != null ? `id:${fid}` : `c:${f.code}`;
      const code = f.code?.trim() || (fid != null ? `#${fid}` : '?');
      const name = (f.name && f.name.trim() !== '') ? f.name.trim() : code;
      const q = ln.quantity;
      const lineTotal = q * ln.unitPrice;
      const existing = foodBuckets.get(key);
      if (existing) {
        existing.quantity += q;
        existing.total += lineTotal;
      } else {
        foodBuckets.set(key, { foodCode: code, foodName: name, quantity: q, total: lineTotal });
      }
    }
  }
  rows.sort((a, b) => a.orderId - b.orderId);
  const foods: DailyReportFoodTableRow[] = [...foodBuckets.values()].sort(
    compareFoodRowsByTotalThenQtyDesc,
  );

  const realCashSalesDueInShop = Math.max(0, totalSales - totalReceivedByQrScan - totalReceivedByCredit);

  return {
    startDate: start,
    endDate: end,
    orderCount: touchIds.size,
    paidOrderCount,
    paidByQrScanOrderCount,
    paidByCreditOrderCount,
    totalReceivedByQrScan,
    totalReceivedByCredit,
    realCashSalesDueInShop,
    totalSales,
    totalCashReceived,
    totalChange,
    source: 'client',
    rows,
    foods,
  };
}

/**
 * List and daily-report aggregate responses often omit whole-order `note`. Fill from `GET /orders/{id}`.
 */
function enrichReportRowsWithOrderNotes(
  orderService: OrderService,
  report: DailyReport,
): Observable<DailyReport> {
  const idList = [...new Set(report.rows.filter((r) => r.orderNote.trim() === '').map((r) => r.orderId))];
  if (idList.length === 0) {
    return of(report);
  }
  return forkJoin(
    idList.map((id) =>
      orderService.getOrderRowById(id).pipe(catchError(() => of(null as PosOrder | null))),
    ),
  ).pipe(
    map((fullOrders) => {
      const noteById = new Map<number, string>();
      for (let i = 0; i < idList.length; i++) {
        const o = fullOrders[i];
        const id = idList[i];
        if (o?.id === id) {
          const n = readPosOrderNote(o);
          if (n) {
            noteById.set(id, n);
          }
        }
      }
      const rows: DailyReportTableRow[] = report.rows.map((r) => {
        const merged =
          r.orderNote.trim() || (noteById.get(r.orderId) ?? '');
        if (merged === r.orderNote) {
          return r;
        }
        return { ...r, orderNote: merged };
      });
      return { ...report, rows };
    }),
  );
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly orderService = inject(OrderService);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/reports`;

  /**
   * `GET /api/reports/daily` — single day: `?date=yyyy-MM-dd`. Range: `?startDate=&endDate=`.
   * If 404, builds totals from `GET /api/orders` (paid orders whose paid day falls in the inclusive range).
   */
  getReportRange(startYmd: string, endYmd: string): Observable<DailyReport> {
    let start = startYmd.slice(0, 10);
    let end = endYmd.slice(0, 10);
    if (end < start) {
      const t = start;
      start = end;
      end = t;
    }
    let params: Record<string, string>;
    if (start === end) {
      params = { date: start };
    } else {
      params = { startDate: start, endDate: end };
    }
    return this.http.get<DailyReportApiDto>(`${this.rootUrl}/daily`, { params }).pipe(
      map((raw) => mapApiToDailyReport(raw, start, end)),
      switchMap((report) => enrichReportRowsWithOrderNotes(this.orderService, report)),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return this.orderService.getOrders().pipe(
            map((orders) => aggregateOrdersClientSide(orders, start, end)),
            switchMap((report) => enrichReportRowsWithOrderNotes(this.orderService, report)),
          );
        }
        return throwError(() => err);
      }),
    );
  }

  /** Single day: `?date=`. Range: `?startDate=` & `?endDate=`. */
  getDailyReport(dateYmd: string): Observable<DailyReport> {
    const day = dateYmd.slice(0, 10);
    return this.getReportRange(day, day);
  }
}
