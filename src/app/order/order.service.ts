import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { map, Observable, tap } from 'rxjs';

import { POS_API_BASE_URL } from '../api/pos-api-base-url.token';

import { orderIsPaid, orderUserId, lineUserId, type OrderRequest, type PosOrder } from './order.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly rootUrl = `${inject(POS_API_BASE_URL)}/api/orders`;

  /** Dev-only: log paid-related fields + full body so UI rules can be aligned with the API. */
  private logOrderListDev(label: string, q: string | undefined, orders: PosOrder[]): void {
    if (!isDevMode()) {
      return;
    }
    const paidSummary = orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      paid: o.paid,
      isPaid: o.isPaid,
      is_paid: o.is_paid,
      paidAt: o.paidAt,
      paid_at: o.paid_at,
      paymentStatus: o.paymentStatus,
      payment_state: o.payment_state,
      complateOrder: o.complateOrder,
      orderIsPaidUi: orderIsPaid(o),
      userId: orderUserId(o),
      lineUserIds: (o.lines ?? []).map((ln) => lineUserId(ln)),
    }));
    console.log(`[OrderService] ${label}`, { url: this.rootUrl, q: q ?? '(none)', count: orders.length, paidSummary });
    console.log(`[OrderService] ${label} raw JSON`, orders);
    const first = orders[0];
    if (first != null) {
      console.log(`[OrderService] ${label} keys (first order)`, Object.keys(first as object));
    }
  }

  private logOrderOneDev(label: string, id: number, body: OrderRequest | PosOrder, order: PosOrder): void {
    if (!isDevMode()) {
      return;
    }
    console.log(`[OrderService] ${label}`, {
      url: `${this.rootUrl}/${id}`,
      requestOrMerge: body,
      responsePaidSummary: {
        id: order.id,
        paid: order.paid,
        isPaid: order.isPaid,
        is_paid: order.is_paid,
        paidAt: order.paidAt,
        paid_at: order.paid_at,
        paymentStatus: order.paymentStatus,
        payment_state: order.payment_state,
        complateOrder: order.complateOrder,
        orderIsPaidUi: orderIsPaid(order),
        userId: orderUserId(order),
        lineUserIds: (order.lines ?? []).map((ln) => lineUserId(ln)),
      },
      rawResponse: order,
    });
    console.log(`[OrderService] ${label} response keys`, Object.keys(order as object));
  }

  /** `GET /api/orders` — optional `q` filters by order number substring. */
  searchOrders(q?: string | null): Observable<PosOrder[]> {
    let params = new HttpParams();
    const trimmed = q?.trim();
    if (trimmed) {
      params = params.set('q', trimmed);
    }
    return this.http.get<PosOrder[]>(this.rootUrl, {
      params,
      headers: new HttpHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' }),
    }).pipe(
      tap((orders) => this.logOrderListDev('GET orders', trimmed, orders)),
    );
  }

  getOrders(): Observable<PosOrder[]> {
    return this.searchOrders();
  }

  getOrderById(id: number): Observable<PosOrder | undefined> {
    return this.getOrders().pipe(map((orders) => orders.find((o) => o.id === id)));
  }

  createOrder(request: OrderRequest): Observable<PosOrder> {
    return this.http.post<PosOrder>(this.rootUrl, request).pipe(
      tap((order) => {
        if (isDevMode()) {
          this.logOrderOneDev('POST order (create)', order.id ?? 0, request, order);
        }
      }),
    );
  }

  /**
   * `PUT /api/orders/{id}` — creates/updates order state on the server.
   * Pay/settlement is done here too (e.g. `paid`, `paidAt`, line statuses, amounts); there is no separate pay URL in this client.
   */
  updateOrder(id: number, request: OrderRequest): Observable<PosOrder> {
    return this.http.put<PosOrder>(`${this.rootUrl}/${id}`, request).pipe(
      tap((order) => this.logOrderOneDev('PUT order', id, request, order)),
    );
  }

  deleteOrder(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rootUrl}/${id}`);
  }
}
