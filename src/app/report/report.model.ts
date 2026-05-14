/** Rows returned by `GET /api/reports/daily` (camelCase); snake_case is normalized in the service. */
export interface DailyReportRow {
  orderId?: number | null;
  order_id?: number | null;
  orderNo?: string;
  order_no?: string;
  paidAt?: string | null;
  paid_at?: string | null;
  /** Amount due / sales for the order before change */
  totalDue?: number | null;
  total_due?: number | null;
  paidPrice?: number | null;
  paid_price?: number | null;
  change?: number | null;
  change_amount?: number | null;
  paidByQrScan?: boolean | null;
  paid_by_qr_scan?: boolean | null;
}

/** Paid lines rolled up per food (`GET /api/reports/daily`). */
export interface DailyReportFoodRow {
  foodCode?: string | null;
  food_code?: string | null;
  foodName?: string | null;
  food_name?: string | null;
  quantity?: number | null;
  qty?: number | null;
  total?: number | null;
}

/** Aggregate daily report payload from API. */
export interface DailyReportApiDto {
  date?: string | null;
  startDate?: string | null;
  start_date?: string | null;
  endDate?: string | null;
  end_date?: string | null;
  orderCount?: number | null;
  order_count?: number | null;
  paidOrderCount?: number | null;
  paid_order_count?: number | null;
  paidByQrScanOrderCount?: number | null;
  paid_by_qr_scan_order_count?: number | null;
  /** Optional server sum of amounts received for QR-settled orders; UI also derives from rows when absent. */
  totalReceivedByQrScan?: number | null;
  total_received_by_qr_scan?: number | null;
  totalSales?: number | null;
  total_sales?: number | null;
  totalCashReceived?: number | null;
  total_cash_received?: number | null;
  totalChange?: number | null;
  total_change?: number | null;
  rows?: DailyReportRow[] | null;
  orders?: DailyReportRow[] | null;
  foods?: DailyReportFoodRow[] | null;
  items?: DailyReportFoodRow[] | null;
}

/** View model for the daily report screen. */
export interface DailyReport {
  /** Inclusive range; equal when reporting a single day. */
  startDate: string;
  endDate: string;
  orderCount: number;
  paidOrderCount: number;
  paidByQrScanOrderCount: number;
  /** Sum of money received for orders settled by QR (`paidPrice` when set, otherwise line total due). */
  totalReceivedByQrScan: number;
  /** Cash-side sales due: total sales due minus QR received totals. */
  realCashSalesDueInShop: number;
  totalSales: number;
  /** Sum of tendered amounts for cash-paid orders only (QR excluded). */
  totalCashReceived: number;
  /** Change returned on cash-paid orders only (QR excluded). */
  totalChange: number;
  source: 'api' | 'client';
  rows: DailyReportTableRow[];
  /** Non-cancelled line quantities × unit price, paid orders in range only. */
  foods: DailyReportFoodTableRow[];
}

export interface DailyReportFoodTableRow {
  foodCode: string;
  foodName: string;
  quantity: number;
  total: number;
}

export interface DailyReportTableRow {
  orderId: number;
  orderNo: string;
  paidAt: string | null;
  totalDue: number;
  paidPrice: number | null;
  change: number | null;
  paidByQrScan: boolean;
}
