import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';
import { resolvedLineStatus } from '../order/order-line-status.util';
import type { PosOrder } from '../order/order.model';
import { readPosOrderChange, readPosOrderPaidPrice } from '../order/order-pay.util';
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

function normalizeApiRow(raw: unknown): DailyReportTableRow {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const orderId = n(row['orderId'] ?? row['order_id']);
  const orderNo = String(row['orderNo'] ?? row['order_no'] ?? '').trim() || `#${orderId}`;
  const paidAtRaw = row['paidAt'] ?? row['paid_at'];
  const paidAt = typeof paidAtRaw === 'string' ? paidAtRaw : null;
  const totalDue = n(row['totalDue'] ?? row['total_due']);
  const pp = row['paidPrice'] ?? row['paid_price'];
  const ch = row['change'] ?? row['change_amount'];
  return {
    orderId,
    orderNo,
    paidAt,
    totalDue,
    paidPrice: pp != null && pp !== '' ? n(pp) : null,
    change: ch != null && ch !== '' ? n(ch) : null,
  };
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
  return {
    startDate,
    endDate,
    orderCount: n(raw.orderCount ?? raw.order_count),
    paidOrderCount: n(raw.paidOrderCount ?? raw.paid_order_count),
    totalSales: n(raw.totalSales ?? raw.total_sales),
    totalCashReceived: n(raw.totalCashReceived ?? raw.total_cash_received),
    totalChange: n(raw.totalChange ?? raw.total_change),
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
    const due = payableTotal(o);
    totalSales += due;
    const pp = readPosOrderPaidPrice(o);
    const ch = readPosOrderChange(o);
    if (pp != null) {
      totalCashReceived += pp;
    }
    if (ch != null) {
      totalChange += ch;
    }
    rows.push({
      orderId: o.id,
      orderNo: o.orderNo,
      paidAt: o.paidAt,
      totalDue: due,
      paidPrice: pp,
      change: ch,
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

  return {
    startDate: start,
    endDate: end,
    orderCount: touchIds.size,
    paidOrderCount,
    totalSales,
    totalCashReceived,
    totalChange,
    source: 'client',
    rows,
    foods,
  };
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
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return this.orderService.getOrders().pipe(map((orders) => aggregateOrdersClientSide(orders, start, end)));
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
