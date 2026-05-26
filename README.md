# Posfont

ระบบ POS สำหรับร้านอาหาร (Angular) — สั่งอาหาร จัดการเมนู ครัว รายงาน สำรองข้อมูล และลูกค้าสั่งเองผ่าน QR

## คู่มือการใช้งาน

| ภาษา | อ่านบน GitHub | ในแอป |
|------|----------------|--------|
| **ไทย** | [docs/manual-th.md](docs/manual-th.md) | เมนู **คู่มือ** หรือ `/manual` (เลือก ไทย) |
| **English** | [docs/manual-en.md](docs/manual-en.md) | เมนู **User manual** (เลือก EN) |

คู่มือครอบคลุม: เข้าสู่ระบบ, โต๊ะ/โซน, ออเดอร์, เมนู, ครัว, รายงาน, Backup/Import, ผู้ใช้, Guest ordering และคำถามที่พบบ่อย

---

## Development

```bash
npm install
npm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:4200/`

### Build

```bash
npm run build
```

ผลลัพธ์อยู่ใน `dist/`

### Tests

```bash
npm test
```

---

## โครงสร้างเอกสาร

| ไฟล์ | ใช้สำหรับ |
|------|-----------|
| `docs/manual-th.md` | คู่มือไทยบน GitHub (แหล่งอ้างอิงหลัก) |
| `docs/manual-en.md` | คู่มืออังกฤษบน GitHub (แหล่งอ้างอิงหลัก) |
| `public/docs/manual-th.md` | คู่มือในแอป (เนื้อหาตรงกับ `docs/manual-th.md` ยกเว้นบรรทัดแนะนำ GitHub) |
| `public/docs/manual-en.md` | คู่มือในแอป (เนื้อหาตรงกับ `docs/manual-en.md` ยกเว้นบรรทัดแนะนำ GitHub) |

---

สร้างด้วย [Angular CLI](https://github.com/angular/angular-cli) 21.x
