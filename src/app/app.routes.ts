import { Routes } from '@angular/router';
import { OrderLinePickerComponent } from './order/order-line-picker.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tables' },
  {
    path: 'tables/new',
    loadComponent: () =>
      import('./table/table-add-new.component').then((m) => m.TableAddNewComponent),
  },
  {
    path: 'tables/:id/edit',
    loadComponent: () =>
      import('./table/table-edit.component').then((m) => m.TableEditComponent),
  },
  {
    path: 'tables',
    loadComponent: () =>
      import('./table/table-list.component').then((m) => m.TableListComponent),
  },
  {
    path: 'orders/new',
    loadComponent: () =>
      import('./order/order-add-new.component').then((m) => m.OrderAddNewComponent),
  },
  {
    path: 'orders/new/line-picker',
    component: OrderLinePickerComponent,
  },
  {
    path: 'orders/display',
    loadComponent: () =>
      import('./order/order-customer-display.component').then((m) => m.OrderCustomerDisplayComponent),
  },
  {
    path: 'orders/:id/display',
    loadComponent: () =>
      import('./order/customer-display-legacy-redirect.component').then(
        (m) => m.CustomerDisplayLegacyRedirectComponent,
      ),
  },
  {
    path: 'orders/:id/edit',
    loadComponent: () =>
      import('./order/order-edit.component').then((m) => m.OrderEditComponent),
  },
  {
    path: 'orders',
    loadComponent: () =>
      import('./order/order-list.component').then((m) => m.OrderListComponent),
  },
  {
    path: 'zones/new',
    loadComponent: () =>
      import('./zone/zone-add-new.component').then((m) => m.ZoneAddNewComponent),
  },
  {
    path: 'zones/:id/edit',
    loadComponent: () =>
      import('./zone/zone-edit.component').then((m) => m.ZoneEditComponent),
  },
  {
    path: 'zones',
    loadComponent: () =>
      import('./zone/zone-list.component').then((m) => m.ZoneListComponent),
  },
  {
    path: 'kitchens/prep',
    loadComponent: () =>
      import('./kitchen/kitchen-prep.component').then((m) => m.KitchenPrepComponent),
  },
  {
    path: 'kitchens/new',
    loadComponent: () =>
      import('./kitchen/kitchen-add-new.component').then((m) => m.KitchenAddNewComponent),
  },
  {
    path: 'kitchens/:id/edit',
    loadComponent: () =>
      import('./kitchen/kitchen-edit.component').then((m) => m.KitchenEditComponent),
  },
  {
    path: 'kitchens',
    loadComponent: () =>
      import('./kitchen/kitchen-list.component').then((m) => m.KitchenListComponent),
  },
  {
    path: 'food-categories/:id/edit',
    loadComponent: () =>
      import('./food-category/food-category-edit.component').then((m) => m.FoodCategoryEditComponent),
  },
  {
    path: 'food-categories/new',
    loadComponent: () =>
      import('./food-category/food-category-add-new.component').then((m) => m.FoodCategoryAddNewComponent),
  },
  {
    path: 'food-categories',
    loadComponent: () =>
      import('./food-category/food-category-list.component').then((m) => m.FoodCategoryListComponent),
  },
  {
    path: 'foods/new',
    loadComponent: () =>
      import('./food/food-add-new.component').then((m) => m.FoodAddNewComponent),
  },
  {
    path: 'foods/:id/edit',
    loadComponent: () =>
      import('./food/food-edit.component').then((m) => m.FoodEditComponent),
  },
  {
    path: 'foods',
    loadComponent: () =>
      import('./food/food-list.component').then((m) => m.FoodListComponent),
  },
  { path: 'backup', redirectTo: 'reports/backup', pathMatch: 'full' },
  {
    path: 'reports',
    loadComponent: () =>
      import('./report/reports-layout.component').then((m) => m.ReportsLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'daily' },
      {
        path: 'daily',
        loadComponent: () =>
          import('./report/daily-report.component').then((m) => m.DailyReportComponent),
      },
      {
        path: 'backup',
        loadComponent: () => import('./backup/backup.component').then((m) => m.BackupComponent),
      },
    ],
  },
];
