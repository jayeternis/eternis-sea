# ATL-TEC-ETL-001 · Eternis Sea — Request Page · Build Brief for Claude Code
Rev 01 · 16 August 2026 · Classification C-2 · #SEA

Paste this file into a new Claude Code session as the task. Build exactly this; do not add features.

## 1. What this is
A single mobile-first web page for **Eternis Tours** that shows six high-ticket sea products and takes a **booking request** (not a card payment). Requests go to a Google Sheet, alert the Operations Director, and open a WhatsApp thread with the guest. Payment happens afterwards by Bokun link or bank/QR link once the quote is confirmed. It is a request page, not a booking engine, and it must never store supplier net rates or take card data.

## 2. Stack (keep it boring)
- Static site: HTML + Tailwind (CDN) + one small vanilla JS file. No framework, no build step.
- Hosting: Cloudflare Pages or Vercel free tier. Repo on GitHub under the Eternis account.
- Form backend: Google Apps Script web app bound to a Google Sheet (see §6). The page POSTs JSON to the Apps Script URL. Apps Script appends a row and calls the alert.
- Alert: Apps Script sends an email to `eternisgroupofcompaniesltd@gmail.com` and, if a Telegram bot token is configured, a Telegram message. WhatsApp alert is out of scope for v1 (no Business API); the guest-side WhatsApp deep link covers the conversation.
- Domain: `sea.eternistours.com` if the DNS is available; otherwise the Pages default URL until it is. Config value, not hard-coded.

## 3. Brand (from Eternis Master Brand Guidelines Vol 01 and the ERGON brand card)
- Colours: obsidian `#090A0B` (ground), antique gold `#C8A45B` (accents, rules, buttons outline), archive ivory `#F1EBDD` (text on dark), mist `#A8A49B` (secondary text). No gradients, no other colours.
- Type: display serif for headings (Cormorant Garamond via Google Fonts, fallback Georgia); body sans (Inter or system, light/regular).
- Voice: short sentences, second person, no exclamation marks, no "amazing/unforgettable", no countdowns or fake scarcity, no comparisons with other operators. Facts first.
- Footer line: "Eternis Group of Companies Ltd · trading as Eternis Tours · Tourism Authority online tour operator licence TEL/3729/T/TO · BRN C25222605".

## 4. Page structure
1. **Header**: small Eternis wordmark, one line: "Private days at sea. Quoted and confirmed on WhatsApp."
2. **Six product cards** (order fixed). Each card: one photo, name, one-line description, price line, capacity line, "Request this day" button.
3. **Request form** (opens as a bottom sheet / modal from any card): product (pre-filled), date, alternate date, guests (adults, children), pickup point (hotel or villa name + area), name, WhatsApp number (with country code), notes (dietary, occasion). Submit button: "Send request".
4. **Success state**: "Received. Darshan will confirm price and availability on WhatsApp within a few hours during the day." Then a button "Continue on WhatsApp" that opens `https://wa.me/2305944 1336` (digits only) with a prefilled message: `Eternis Sea request · {product} · {date} · {guests} guests · {pickup} · ref {REQ-ID}`.
5. **Concierge mode**: if the URL has `?ref=<code>`, store the code in the request row and show a discreet line under the header: "Introduced by {code}". No discount shown, no tier shown.
6. **Legal line** at bottom: agent statement — "Eternis Tours arranges these charters with licensed operators; the operator's own conditions of carriage apply." Link to a plain terms page (`/terms.html`) with cancellation, weather and payment terms as issued in ATL-PRD-ETL-004 §07 (guest pays 100% at booking; weather substitution; refunds per operator policy).

## 5. The six products (copy is final; prices are from supplier documents on file)
Currency display: euros for Yacht Mauritius as published; rupees for the rest. Show the guest price exactly as below. Never show commission or net.

| # | Card name | Photo | Description (one line) | Price line | Capacity line | Status label |
|---|---|---|---|---|---|---|
| 1 | Private motor yacht — full day, south-west | Yacht Mauritius Maga Kani brochure image | La Balise Marina to La Preneuse, Crystal Rock and Le Morne, lunch on board, back by four. | From €1,850 for two · €85 per extra guest | Up to 8 guests | On request |
| 2 | Private sailing catamaran — full day, Benitier | Yacht Mauritius C'est La Vie brochure image | A slow day under sail along the south-west coast, snorkelling at La Preneuse, lunch, back by four. | From €895 for two · €85 per extra guest | Up to 13 guests | On request |
| 3 | Sunset on a private yacht | Yacht Mauritius sunset image | Two hours toward Tamarin Bay with drinks and canapés as the light goes. | From €1,230 for two (motor yacht) · €535 for two (catamaran) | Up to 8 / 13 guests | On request |
| 4 | Big-game fishing — half or full day | Blue Safari Paille-en-Queue image (from supplier catalogue) | Marlin, tuna and wahoo with a professional crew from the north. Six or nine hours. | From Rs 47,000 half day · Rs 53,000 full day (50 ft) | Up to the boat's licensed capacity | Available |
| 5 | Private speedboat day — northern islands | Blue Safari Blue Sensation image | Îlot Gabriel and Coin de Mire by private boat, swimming and snorkelling, your own pace. | From Rs 25,000 per boat, up to 12 | Up to 12 guests | Available |
| 6 | A night at anchor — private catamaran | Yacht Mauritius overnight image | Sail to Benitier or the northern islands, sleep on board, dolphins and breakfast at dawn. | From €1,550 for two (Benitier) · €1,735 (north) | Up to 6 guests overnight | On request |

"On request" cards still open the same form; the success text is identical. When compliance for Yacht Mauritius is complete, the label changes to "Available" via a single config flag per product.

Photos: extract from `Yacht_Mauritius_Charters_2026_SHARE_copy.pdf` and the Blue Safari catalogue in the Eternis file; credit line under each photo: "Photo: Yacht Mauritius" / "Photo: Blue Safari".

## 6. Google Sheet (tracker) — columns, in order
`timestamp | req_id | product | date | alt_date | adults | children | pickup | name | whatsapp | notes | ref_code | source_url | status | quoted_price | paid_amount | paid_date | operator | operator_confirmed | commission_expected | notes_ops`
- `req_id` = `SEA-` + YYYYMMDD + `-` + 3-digit counter, generated by Apps Script.
- `status` values: `new · quoted · paid · confirmed · done · lost`. Operations updates by hand.
- A second tab `daily` with a formula summary per day: requests, quoted, paid (count and Rs), by product and by ref_code — this is the source of the 21:00 daily line and the Sunday total.
- Sheet lives in the Eternis Google account; share with the Operations Director as editor.

## 7. Apps Script (doPost)
- Accepts JSON, validates required fields (product, date, adults, name, whatsapp), appends row, generates req_id, sends email alert with the row, optionally Telegram, returns `{ok:true, req_id}`.
- CORS: respond to OPTIONS; allow the site origin only.
- Rate limit: reject more than 5 posts per minute from the same IP header (best effort).
- No secrets in the front-end other than the Apps Script URL.

## 8. Do not
- Do not take card details, do not embed Bokun checkout in v1, do not store net rates, do not add a "book now" that implies instant confirmation.
- Do not use countdowns, "only 2 left", or star ratings.
- Do not mention StayEasy anywhere.
- Do not add analytics beyond a privacy-respecting page counter (Cloudflare Web Analytics is fine).

## 9. Config file (`config.js`)
```
window.ETERNIS_SEA = {
  formEndpoint: "<Apps Script web app URL>",
  whatsappNumber: "23059441336",
  domain: "sea.eternistours.com",
  products: { p1:{available:false}, p2:{available:false}, p3:{available:false}, p4:{available:true}, p5:{available:true}, p6:{available:false} }
};
```

## 10. Deliverables
`index.html`, `terms.html`, `styles.css` (if not all Tailwind), `app.js`, `config.js`, `/img/*`, `apps-script.gs`, `README.md` with deploy steps (Pages + Apps Script + DNS). Test: submit one request from a phone, confirm the row and the email arrive, confirm the WhatsApp deep link opens with the prefilled text.

Issued 16 August 2026 · Rev 01 · Eternis Group of Companies Ltd · trading as Eternis Tours.
