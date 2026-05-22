# Posfont User Manual (POS)

This guide explains how staff use the POS: ordering, menu setup, reports, backup, and guest ordering.

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [Main menu](#2-main-menu)
3. [Tables and zones](#3-tables-and-zones)
4. [Orders](#4-orders)
5. [Foods and categories](#5-foods-and-categories)
6. [Kitchens and kitchen prep](#6-kitchens-and-kitchen-prep)
7. [Reports](#7-reports)
8. [Backup and restore](#8-backup-and-restore)
9. [User management](#9-user-management)
10. [Guest ordering](#10-guest-ordering)
11. [FAQ](#11-faq)

---

## 1. Getting started

### Sign in

1. Open the POS in your browser.
2. Click **Sign in** in the top menu.
3. Enter **Username** and **Password** from your administrator.
4. Click **Sign in**.

> Some features (tables, orders) work without signing in. **Users** is available only after sign-in.

### Sign out

Click **Sign out** in the top menu.

### Language

Use the **EN | ไทย** switch in the top menu to change the UI language. Your choice is remembered.

---

## 2. Main menu

| Menu | Purpose |
|------|---------|
| **Orders** | All orders |
| **New order** | Create a new order |
| **Foods** / **Add food** | Menu list / add item |
| **Categories** / **New category** | Food categories |
| **Kitchens** / **Kitchen prep** / **Add kitchen** | Kitchens / prep screen |
| **Zones** / **Add zone** | Dining areas |
| **Tables** / **Add table** | Tables |
| **Reports** | Daily report and backup |
| **User manual** | This guide (English or Thai) |
| **Users** | User admin (sign-in required) |

---

## 3. Tables and zones

### Zones

Zones are areas in the restaurant (e.g. floor 1, patio, VIP).

- Open **Zones** to list zones.
- **Add zone** to create one.
- **Edit** or **Delete** from the list.

### Tables

Each table belongs to one zone.

1. Open **Tables**.
2. **Search** by table code.
3. **Add table** to create one.
4. From the list you can create orders, edit, pay open bills, or delete.

---

## 4. Orders

### New order

1. **New order** or create from **Tables**.
2. Pick a table.
3. Add line items with quantity and notes.
4. Save.

### Manage orders

On **Orders**:

- **Search** by order number.
- **Show only not done** filters incomplete orders.
- Click an order number to **Edit**.
- Update line status (wait / finish cooking / complete / cancel).
- **Pay** — cash, PromptPay QR, or credit as supported.

### Key statuses

| Status | Meaning |
|--------|---------|
| **Done** | Order complete |
| **Cancel** | Order cancelled |
| **Paid** | Payment recorded |

---

## 5. Foods and categories

### Categories

Open **Categories** to add, edit, or remove groups (mains, drinks, desserts).

### Foods

1. Open **Foods**.
2. **Add food** for a new item.
3. Set name, price, category, and kitchen.
4. Edit or delete from the list.

> Set up categories and kitchens before service so ordering and kitchen prep work correctly.

---

## 6. Kitchens and kitchen prep

### Kitchens

Manage kitchens on **Kitchens**. Link each food item to the right kitchen.

### Kitchen prep

For kitchen staff:

1. Open **Kitchen prep**.
2. Filter by kitchen or **All kitchens**.
3. Lines in **WAIT** for unpaid table orders appear here.
4. Tap **Finish cooking** when ready.
5. The screen auto-refreshes; use **Refresh** for an immediate reload.

---

## 7. Reports

Open **Reports → Daily report**.

1. Set **Start date** and **End date**.
2. Click **Refresh**.
3. Review sales, order counts, payment methods, and line detail.

**Notes:**

- Figures use **paid** orders in the date range.
- **Cash received** and **Change returned** count **cash** only.
- If the report API is unavailable, totals may be estimated locally.

---

## 8. Backup and restore

Open **Reports → Backup**.

### What is included

| Data | Always in backup | Date filter |
|------|------------------|-------------|
| Zones | ✓ | — |
| Tables | ✓ | — |
| Kitchens | ✓ | — |
| Categories | ✓ | — |
| Foods | ✓ | — |
| Orders | ✓ (or filtered) | ✓ |

### Export

1. **Reports → Backup**
2. Optionally set **From** / **To** order dates, or **All orders**.
3. **Create backup**
4. **Download ZIP** when ready.

Master data is always exported in full; only orders can be filtered by order date.

### Import

> **Warning:** Import **replaces all** POS data on the server.

1. Choose a `.zip` or `.json` backup file.
2. Check **I understand all current data will be replaced.**
3. **Import & replace database**

Always export a fresh backup before importing.

---

## 9. User management

Sign in first, then open **Users**.

- **Create user** with username, password, display name, and roles (`ADMIN`, `STAFF`, etc.).
- Enable or disable accounts from the list.

---

## 10. Guest ordering

Guests order via QR at the table without staff login.

- Guest pages hide the staff menu.
- Staff continue from **Orders** or **Kitchen prep**.

---

## 11. FAQ

### Q: No Download ZIP after export?
**A:** Wait for **Create backup** to finish successfully first.

### Q: From date after To date?
**A:** **From** must be on or before **To**.

### Q: Orders missing after import?
**A:** Import replaces the whole database. Export first; the backup may not include today’s orders.

### Q: Daily report ≠ cash drawer?
**A:** Confirm orders are **Paid** and separate cash from QR/credit.

### Q: Kitchen prep empty?
**A:** Need unpaid table orders with lines in **WAIT**.

### Q: Forgot password?
**A:** Contact your POS administrator.

---

## Support

Note any red error text and status code (e.g. `(500)`) and report to your IT contact.

---

*Posfont POS — updated for backup, reports, and multilingual UI*
