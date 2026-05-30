/** Notifies other tabs (customer display) to refetch this order; `storage` events only fire outside the writing tab. */
export function pingOrderCustomerDisplayRefresh(orderId: number): void {
  try {
    localStorage.setItem(`orderDisplayPing_${orderId}`, String(Date.now()));
  } catch {
    /* private mode / quota */
  }
}

export const ORDER_CUSTOMER_DISPLAY_PING_PREFIX = 'orderDisplayPing_';
