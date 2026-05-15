import { crc16xmodem } from 'crc';

/**
 * Thai PromptPay EMV Merchant-Presented Mode (same TLV layout as `promptpay-qr`).
 * Improved handling: short IDs that are NOT 10‑digit mobiles (`08…`) are encoded with
 * BOT subfield **02** (tax / citizen / merchant ID–style) zero‑padded to 13 digits, instead of
 * subfield **01** (phone), which commonly mis‑decodes values like **`2452692719`** as **`045…`**.
 */
const ID_PAYLOAD_FORMAT = '00';
const ID_POI_METHOD = '01';
const ID_MERCHANT_INFORMATION_BOT = '29';
const ID_TRANSACTION_CURRENCY = '53';
const ID_TRANSACTION_AMOUNT = '54';
const ID_COUNTRY_CODE = '58';
const ID_CRC = '63';

const PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE = '01';
const POI_METHOD_STATIC = '11';
const POI_METHOD_DYNAMIC = '12';

const MERCHANT_INFORMATION_TEMPLATE_ID_GUID = '00';
const GUID_PROMPTPAY = 'A000000677010111';

/** BOT merchant account information — phone */
const BOT_ID_MERCHANT_PHONE_NUMBER = '01';
/** BOT merchant account information — tax / citizen ID */
const BOT_ID_MERCHANT_TAX_ID = '02';
const BOT_ID_MERCHANT_EWALLET_ID = '03';

const TRANSACTION_CURRENCY_THB = '764';
const COUNTRY_CODE_TH = 'TH';

/** Strip separators; normalize `668xxxxxxxx` (intl mobile) to domestic `08xxxxxxxx`. */
export function normalizeThaiPromptPayDigits(trimmedReceiver: string): string {
  let d = trimmedReceiver.replace(/\D/g, '');
  const intlMobile = /^66([689])(\d{8})$/.exec(d);
  if (intlMobile) {
    d = `0${intlMobile[1]}${intlMobile[2]}`;
  }
  return d;
}

function f(id: string, value: string): string {
  return [id, (`00${value.length}`).slice(-2), value].join('');
}

function serialize(xs: Array<string | false | undefined>): string {
  return xs.filter(Boolean).join('');
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function formatCrc(crcValue: number): string {
  return (`0000${crcValue.toString(16).toUpperCase()}`).slice(-4);
}

/** `promptpay-qr` phone field: domestic 10‑digit mobiles become 066…‑padded–13‑digit BOT values. */
function formatPhoneTlvTarget(sanitized: string): string {
  const numbers = sanitized.replace(/\D/g, '');
  if (numbers.length >= 13) {
    return numbers;
  }
  return (`0000000000000${numbers.replace(/^0/, '66')}`).slice(-13);
}

/** 10‑digit PromptPay mobiles registered in Thailand (`0812345678`, `092…`, …). */
export function looksLikeTenDigitThaiPromptPayMobile(sanitizedDigits: string): boolean {
  return /^0[689]\d{8}$/.test(sanitizedDigits);
}

function tlvTypeAndMerchantValue(digitsOnly: string): { type: string; merchantValue: string } {
  if (digitsOnly.length >= 15) {
    return { type: BOT_ID_MERCHANT_EWALLET_ID, merchantValue: digitsOnly };
  }
  if (digitsOnly.length >= 13) {
    return { type: BOT_ID_MERCHANT_TAX_ID, merchantValue: digitsOnly };
  }
  if (looksLikeTenDigitThaiPromptPayMobile(digitsOnly)) {
    return { type: BOT_ID_MERCHANT_PHONE_NUMBER, merchantValue: formatPhoneTlvTarget(digitsOnly) };
  }
  return {
    type: BOT_ID_MERCHANT_TAX_ID,
    merchantValue: digitsOnly.padStart(13, '0'),
  };
}

/** Build the EMV QR string passed to QRCode.toDataURL. */
export function buildPromptPayQrPayload(digitsOnly: string, options: { amount?: number }): string {
  const amount = options.amount;
  const { type: targetType, merchantValue } = tlvTypeAndMerchantValue(digitsOnly);

  const innerBot = serialize([
    f(MERCHANT_INFORMATION_TEMPLATE_ID_GUID, GUID_PROMPTPAY),
    f(targetType, merchantValue),
  ]);

  const data: Array<string | false | undefined> = [
    f(ID_PAYLOAD_FORMAT, PAYLOAD_FORMAT_EMV_QRCPS_MERCHANT_PRESENTED_MODE),
    f(ID_POI_METHOD, amount != null ? POI_METHOD_DYNAMIC : POI_METHOD_STATIC),
    f(ID_MERCHANT_INFORMATION_BOT, innerBot),
    f(ID_COUNTRY_CODE, COUNTRY_CODE_TH),
    f(ID_TRANSACTION_CURRENCY, TRANSACTION_CURRENCY_THB),
    amount != null && f(ID_TRANSACTION_AMOUNT, formatAmount(amount)),
  ];

  const dataToCrc = serialize(data) + ID_CRC + '04';
  data.push(f(ID_CRC, formatCrc(crc16xmodem(dataToCrc, 0xffff))));
  return serialize(data);
}
