# Eternis Sea — Request Page

A single mobile-first page showing six private sea days and taking a **booking request**, not a
card payment. Requests land in a Google Sheet, alert Operations by email (and Telegram if
configured), and hand the guest over to WhatsApp. Built to
`ATL-TEC-ETL-001 Eternis Sea Request Page Build Brief Rev01`.

Static HTML, Tailwind from the CDN and one vanilla JS file. No framework, no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | Header, six product cards, request sheet, success state, legal line |
| `terms.html` | Cancellation, weather and payment terms |
| `styles.css` | Brand type and form controls, on top of Tailwind |
| `app.js` | Sheet open/close, validation, POST, WhatsApp hand-off, concierge `?ref=` |
| `config.js` | Endpoint, WhatsApp number, domain, per-product availability |
| `img/` | Placeholder images, one per product |
| `apps-script.gs` | The Google Apps Script backend and the one-off sheet `setup()` |

## 1. Google Sheet

1. In the Eternis Google account, create a spreadsheet named **Eternis Sea — Requests**.
2. File → Settings → set the time zone to **(GMT+04:00) Port Louis**. Request ids and the daily
   summary use the spreadsheet time zone.
3. Share it with the Operations Director as **Editor**.

Tab `requests` holds one row per request, in this column order:

```
timestamp | req_id | product | date | alt_date | adults | children | pickup | name | whatsapp |
notes | ref_code | source_url | status | quoted_price | paid_amount | paid_date | operator |
operator_confirmed | commission_expected | notes_ops
```

Columns from `status` onward are filled in by hand. `status` values:
`new · quoted · paid · confirmed · done · lost`.

Tab `daily` summarises requests, quoted, paid (count and amount) per day, per product and per
ref code — the source of the 21:00 daily line and the Sunday total. It counts a row as *quoted*
when `quoted_price` is filled and as *paid* when `paid_amount` is filled, so the summary follows
what Operations actually enters.

## 2. Apps Script

1. In the spreadsheet: **Extensions → Apps Script**.
2. Delete the placeholder file and paste the contents of `apps-script.gs`. Save.
3. **Project Settings → Script properties**, add:
   - `ALLOWED_ORIGINS` — comma separated, e.g.
     `https://sea.eternistours.com,https://<account>.github.io`
     (include the GitHub Pages origin while the domain is not live, and localhost while testing)
   - `ALERT_EMAIL` — optional, defaults to `eternisgroupofcompaniesltd@gmail.com`
   - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` — optional, both needed for the Telegram alert
4. Run the `setup()` function once from the editor. Accept the authorisation prompts (Sheets, Gmail
   and, if Telegram is configured, external requests). This creates both tabs.
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the `/exec` URL into `formEndpoint` in `config.js`.

After any edit to the script, deploy again with **Manage deployments → edit → Version: New version**,
or the live URL keeps serving the old code.

Notes on the two request-hygiene items in the brief:

- **Origin.** Apps Script web apps do not let a script set response headers, so the origin is checked
  in `doPost` against the `source_url` the page sends, and anything outside `ALLOWED_ORIGINS` is
  rejected. The page posts as `text/plain`, which keeps it a simple request and avoids a preflight.
- **Rate limit.** Five posts per minute per caller, in the script cache. Apps Script does not expose
  the caller's IP to a web app, so the key falls back to the WhatsApp number. Best effort, as briefed.

## 3. GitHub Pages

The site is served from the repository root on `main`.

1. Merge this branch into `main`.
2. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main**,
   Folder **/ (root)**. Save.
3. The site appears at `https://<account>.github.io/<repo>/` within a minute or two.
4. Custom domain, once the DNS is available: add a `CNAME` file at the repository root containing
   `sea.eternistours.com`, then create a DNS `CNAME` record for `sea` pointing at
   `<account>.github.io`. In **Settings → Pages** set the custom domain and tick **Enforce HTTPS**
   once the certificate is issued.
5. Add the live origin to `ALLOWED_ORIGINS` in the Apps Script properties.

Until the domain is live, use the Pages URL. The domain is a config value in `config.js`, not
hard-coded in the markup.

## 4. Images

`/img` holds a placeholder per product. Replace each file with the real photograph, keeping the
same name, and keep the credit line that sits under it in `index.html`:

| File | Photo | Credit |
|---|---|---|
| `img/p1.svg` | Yacht Mauritius Maga Kani brochure image | Photo: Yacht Mauritius |
| `img/p2.svg` | Yacht Mauritius C'est La Vie brochure image | Photo: Yacht Mauritius |
| `img/p3.svg` | Yacht Mauritius sunset image | Photo: Yacht Mauritius |
| `img/p4.svg` | Blue Safari Paille-en-Queue image | Photo: Blue Safari |
| `img/p5.svg` | Blue Safari Blue Sensation image | Photo: Blue Safari |
| `img/p6.svg` | Yacht Mauritius overnight image | Photo: Yacht Mauritius |

If the replacements are JPEGs, update the `src` in `index.html` to match the new extension.

## 5. Config

```js
window.ETERNIS_SEA = {
  formEndpoint: "<Apps Script web app URL>",
  whatsappNumber: "23059441336",
  domain: "sea.eternistours.com",
  products: { p1:{available:false}, p2:{available:false}, p3:{available:false}, p4:{available:true}, p5:{available:true}, p6:{available:false} }
};
```

`available: false` shows **On request**, `true` shows **Available**. The card behaves the same
either way. When Yacht Mauritius compliance is complete, flip `p1`, `p2`, `p3` and `p6` to `true`.

Concierge mode: `https://<site>/?ref=CODE` shows "Introduced by CODE" under the header and stores
the code in `ref_code`. No discount or tier is shown.

## 6. Test before handing over

From a phone, on the live URL:

1. Open a card, send one request.
2. Confirm the row appears in `requests` with a `req_id` of the form `SEA-YYYYMMDD-001`.
3. Confirm the alert email arrives at the Operations inbox.
4. Tap **Continue on WhatsApp** and confirm the thread opens on `+230 5944 1336` with the
   prefilled text: `Eternis Sea request · {product} · {date} · {guests} guests · {pickup} · ref {REQ-ID}`.

---

Eternis Group of Companies Ltd · trading as Eternis Tours · Tourism Authority online tour operator
licence TEL/3729/T/TO · BRN C25222605
