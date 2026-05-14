import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import type { OrderRequest, PayOrderRequest, PosOrder } from './order.model';
import { orderRequestToWireBody, payRequestToWireBody } from './order-pay.util';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/orders`;

  /** `GET /api/orders` — optional `q` filters by order number substring. */
  searchOrders(q?: string | null): Observable<PosOrder[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<PosOrder[]>(this.rootUrl, { params });
  }

  getOrders(): Observable<PosOrder[]> {
    return this.searchOrders();
  }

  /**
   * Prefer `GET /api/orders/{id}` when the backend exposes it (full order incl. pay fields);
   * otherwise fall back to finding the order in `GET /api/orders`.
   */
  getOrderById(id: number): Observable<PosOrder | undefined> {
    return this.http.get<PosOrder>(`${this.rootUrl}/${id}`).pipe(
      catchError(() => this.getOrders().pipe(map((orders) => orders.find((o) => o.id === id)))),
    );
  }

  createOrder(request: OrderRequest): Observable<PosOrder> {
    return this.http.post<PosOrder>(this.rootUrl, orderRequestToWireBody(request));
  }

  updateOrder(id: number, request: OrderRequest): Observable<PosOrder> {
    return this.http.put<PosOrder>(`${this.rootUrl}/${id}`, orderRequestToWireBody(request));
  }

  deleteOrder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }

  /** `POST /api/orders/{id}/pay` — marks settled; open orders cannot be edited afterward. */
  payOrder(id: number, body: PayOrderRequest): Observable<PosOrder> {
    return this.http.post<PosOrder>(`${this.rootUrl}/${id}/pay`, payRequestToWireBody(body));
  }

  /**
   * `POST /api/orders/{id}/pay/qr-scan` — same as {@link payOrder} after scanning a payment QR (PromptPay etc.).
   * Sends `paidByQrScan` + `qrScanPayload`; optional amounts overlay the order like `POST …/pay`.
   */
  payOrderByQrScan(
    id: number,
    body: { qrScanPayload: string; paidPrice?: number; change?: number },
  ): Observable<PosOrder> {
    const clipped = body.qrScanPayload.trim().slice(0, 1024);
    const wire: Record<string, unknown> = {
      qrScanPayload: clipped,
      qr_scan_payload: clipped,
    };
    if (body.paidPrice != null) {
      wire['paidPrice'] = body.paidPrice;
      wire['paid_price'] = body.paidPrice;
    }
    if (body.change != null) {
      wire['change'] = body.change;
      wire['change_amount'] = body.change;
    }
    return this.http.post<PosOrder>(`${this.rootUrl}/${id}/pay/qr-scan`, wire);
  }
}
