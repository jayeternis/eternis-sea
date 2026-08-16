/**
 * Eternis Sea — Request Page · form backend
 * ATL-TEC-ETL-001 Rev 01
 *
 * Bound to the Eternis Sea tracker spreadsheet and deployed as a web app
 * ("Execute as: me", "Who has access: anyone"). The page POSTs JSON; this
 * script appends a row, generates the request id, alerts Operations, and
 * returns { ok: true, req_id }.
 *
 * Script properties used (Project Settings → Script properties):
 *   ALERT_EMAIL         optional, defaults to eternisgroupofcompaniesltd@gmail.com
 *   ALLOWED_ORIGINS     comma separated list of origins allowed to post
 *   TELEGRAM_BOT_TOKEN  optional, enables the Telegram alert
 *   TELEGRAM_CHAT_ID    optional, required with the token
 */

var SHEET_NAME = 'requests';
var DAILY_SHEET_NAME = 'daily';
var DEFAULT_ALERT_EMAIL = 'eternisgroupofcompaniesltd@gmail.com';
var DEFAULT_ALLOWED_ORIGINS = 'https://sea.eternistours.com';
var RATE_LIMIT_PER_MINUTE = 5;

var HEADERS = [
  'timestamp', 'req_id', 'product', 'date', 'alt_date', 'adults', 'children',
  'pickup', 'name', 'whatsapp', 'notes', 'ref_code', 'source_url', 'status',
  'quoted_price', 'paid_amount', 'paid_date', 'operator', 'operator_confirmed',
  'commission_expected', 'notes_ops'
];

/**
 * Preflight. Apps Script web apps answer simple cross-origin POSTs with a
 * permissive header of their own and do not let us set response headers, so
 * the origin allowlist is enforced in doPost against the posted source_url.
 * The page posts as text/plain, which keeps the request simple and normally
 * avoids a preflight altogether.
 */
function doOptions(e) {
  return ContentService.createTextOutput('');
}

function doPost(e) {
  try {
    var payload = parsePayload(e);

    if (!originAllowed(payload.source_url)) {
      return json({ ok: false, error: 'origin not allowed' });
    }

    var missing = missingFields(payload);
    if (missing.length) {
      return json({ ok: false, error: 'missing: ' + missing.join(', ') });
    }

    if (rateLimited(clientKey(e, payload))) {
      return json({ ok: false, error: 'too many requests' });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var reqId;
    try {
      var sheet = requestsSheet();
      reqId = nextRequestId();
      sheet.appendRow([
        new Date(),
        reqId,
        payload.product,
        payload.date,
        payload.alt_date,
        payload.adults,
        payload.children,
        payload.pickup,
        payload.name,
        payload.whatsapp,
        payload.notes,
        payload.ref_code,
        payload.source_url,
        'new',
        '', '', '', '', '', '', ''
      ]);
    } finally {
      lock.releaseLock();
    }

    sendAlerts(reqId, payload);

    return json({ ok: true, req_id: reqId });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ---------------- payload ---------------- */

function parsePayload(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  var data = JSON.parse(raw);
  return {
    product: str(data.product, 200),
    date: str(data.date, 30),
    alt_date: str(data.alt_date, 30),
    adults: int(data.adults),
    children: int(data.children),
    pickup: str(data.pickup, 300),
    name: str(data.name, 150),
    whatsapp: str(data.whatsapp, 40),
    notes: str(data.notes, 1000),
    ref_code: str(data.ref_code, 40),
    source_url: str(data.source_url, 500)
  };
}

function missingFields(p) {
  var missing = [];
  if (!p.product) missing.push('product');
  if (!p.date) missing.push('date');
  if (!(p.adults >= 1)) missing.push('adults');
  if (!p.name) missing.push('name');
  if (!p.whatsapp) missing.push('whatsapp');
  return missing;
}

function str(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function int(value) {
  var n = parseInt(value, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

/* ---------------- origin allowlist ---------------- */

function originAllowed(sourceUrl) {
  var allowed = (prop('ALLOWED_ORIGINS') || DEFAULT_ALLOWED_ORIGINS)
    .split(',')
    .map(function (o) { return o.trim().toLowerCase(); })
    .filter(function (o) { return o; });
  if (!allowed.length) return true;
  var match = String(sourceUrl || '').match(/^https?:\/\/[^\/]+/i);
  if (!match) return false;
  return allowed.indexOf(match[0].toLowerCase()) !== -1;
}

/* ---------------- rate limit (best effort) ---------------- */

/**
 * Apps Script does not expose the caller's IP to a web app, so the key falls
 * back through whatever the request does carry. Best effort, as briefed.
 */
function clientKey(e, payload) {
  var param = e && e.parameter ? e.parameter : {};
  var ip = param['ip'] || param['X-Forwarded-For'] || '';
  return 'rl_' + (ip || payload.whatsapp || 'anon');
}

function rateLimited(key) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key) || '0', 10) + 1;
  cache.put(key, String(count), 60);
  return count > RATE_LIMIT_PER_MINUTE;
}

/* ---------------- request id ---------------- */

function nextRequestId() {
  var stamp = Utilities.formatDate(new Date(), timezone(), 'yyyyMMdd');
  var props = PropertiesService.getScriptProperties();
  var key = 'counter_' + stamp;
  var next = parseInt(props.getProperty(key) || '0', 10) + 1;
  props.setProperty(key, String(next));
  return 'SEA-' + stamp + '-' + ('00' + next).slice(-3);
}

/* ---------------- alerts ---------------- */

function sendAlerts(reqId, p) {
  var lines = [
    'Request ' + reqId,
    '',
    'Product: ' + p.product,
    'Date: ' + p.date + (p.alt_date ? '  (alternate ' + p.alt_date + ')' : ''),
    'Guests: ' + p.adults + ' adults, ' + p.children + ' children',
    'Pickup: ' + (p.pickup || '—'),
    'Name: ' + p.name,
    'WhatsApp: ' + p.whatsapp,
    'Notes: ' + (p.notes || '—'),
    'Ref code: ' + (p.ref_code || '—'),
    'Source: ' + (p.source_url || '—')
  ];
  var body = lines.join('\n');

  try {
    MailApp.sendEmail({
      to: prop('ALERT_EMAIL') || DEFAULT_ALERT_EMAIL,
      subject: 'Eternis Sea request ' + reqId + ' — ' + p.product,
      body: body
    });
  } catch (err) {
    Logger.log('email alert failed: ' + err);
  }

  var token = prop('TELEGRAM_BOT_TOKEN');
  var chatId = prop('TELEGRAM_CHAT_ID');
  if (token && chatId) {
    try {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        payload: { chat_id: chatId, text: body },
        muteHttpExceptions: true
      });
    } catch (err) {
      Logger.log('telegram alert failed: ' + err);
    }
  }
}

/* ---------------- sheet ---------------- */

function requestsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function timezone() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Indian/Mauritius';
}

function prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- one-off setup ---------------- */

/**
 * Run once from the editor to create both tabs. Adds the request headers and
 * the daily summary formulas: per day, per product and per ref code.
 * "Quoted" counts rows with a quoted_price, "paid" counts rows with a
 * paid_amount, so the summary follows what Operations actually fills in.
 */
function setup() {
  requestsSheet();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var daily = ss.getSheetByName(DAILY_SHEET_NAME);
  if (!daily) {
    daily = ss.insertSheet(DAILY_SHEET_NAME);
  }
  daily.clear();

  var q = "'" + SHEET_NAME + "'!";

  daily.getRange('A1').setValue('By day');
  daily.getRange('A2:E2').setValues([['Date', 'Requests', 'Quoted', 'Paid', 'Paid amount']]);
  daily.getRange('A3').setFormula(
    '=IFERROR(QUERY({ARRAYFORMULA(INT(' + q + 'A2:A)), ' + q + 'B2:B}, ' +
    '"select Col1, count(Col2) where Col1 > 0 group by Col1 order by Col1 desc label Col1 \'\', count(Col2) \'\'", 0), "")'
  );
  daily.getRange('C3').setFormula(
    '=ARRAYFORMULA(IF(A3:A="","",COUNTIFS(' + q + '$O$2:$O,">0",' + q + '$A$2:$A,">="&A3:A,' + q + '$A$2:$A,"<"&A3:A+1)))'
  );
  daily.getRange('D3').setFormula(
    '=ARRAYFORMULA(IF(A3:A="","",COUNTIFS(' + q + '$P$2:$P,">0",' + q + '$A$2:$A,">="&A3:A,' + q + '$A$2:$A,"<"&A3:A+1)))'
  );
  daily.getRange('E3').setFormula(
    '=ARRAYFORMULA(IF(A3:A="","",SUMIFS(' + q + '$P$2:$P,' + q + '$A$2:$A,">="&A3:A,' + q + '$A$2:$A,"<"&A3:A+1)))'
  );

  daily.getRange('G1').setValue('By product');
  daily.getRange('G2:J2').setValues([['Product', 'Requests', 'Quoted', 'Paid amount']]);
  daily.getRange('G3').setFormula(
    '=IFERROR(QUERY({' + q + 'C2:C, ' + q + 'B2:B, ' + q + 'O2:O, ' + q + 'P2:P}, ' +
    '"select Col1, count(Col2), count(Col3), sum(Col4) where Col1 is not null and Col1 != \'\' ' +
    'group by Col1 order by count(Col2) desc label Col1 \'\', count(Col2) \'\', count(Col3) \'\', sum(Col4) \'\'", 0), "")'
  );

  daily.getRange('L1').setValue('By ref code');
  daily.getRange('L2:O2').setValues([['Ref code', 'Requests', 'Quoted', 'Paid amount']]);
  daily.getRange('L3').setFormula(
    '=IFERROR(QUERY({' + q + 'L2:L, ' + q + 'B2:B, ' + q + 'O2:O, ' + q + 'P2:P}, ' +
    '"select Col1, count(Col2), count(Col3), sum(Col4) where Col1 is not null and Col1 != \'\' ' +
    'group by Col1 order by count(Col2) desc label Col1 \'\', count(Col2) \'\', count(Col3) \'\', sum(Col4) \'\'", 0), "")'
  );

  daily.getRange('A3:A').setNumberFormat('yyyy-mm-dd');
  daily.setFrozenRows(2);
}
