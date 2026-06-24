# posfont (Angular frontend)

This repo is the **POS Angular UI only**.

The **backend API** is not in this folder. It lives at:

**`f:/src/pos/api/pos`**

When working on orders, foods, tables, auth, or any `/api/*` behaviour:

1. Change Kotlin/Spring code in **`f:/src/pos/api/pos`**
2. Mirror models and services under `src/app/`
3. Read **`f:/src/pos/api/pos/NOTIFY-FRONTEND.md`** for the full sync checklist

Default API base URL: `http://localhost:8080` (`src/app/app.config.ts`).
