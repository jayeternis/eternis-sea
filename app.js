/* Eternis Sea — Request Page
   Renders product status labels, handles the request sheet, posts the request
   to the Apps Script endpoint and hands the guest over to WhatsApp. */
(function () {
  'use strict';

  var CONFIG = window.ETERNIS_SEA || {};

  var sheet = document.getElementById('sheet');
  var sheetPanel = sheet.querySelector('.sheet-panel');
  var form = document.getElementById('request-form');
  var successState = document.getElementById('success-state');
  var errorEl = document.getElementById('form-error');
  var submitBtn = document.getElementById('submit-btn');
  var lastFocused = null;

  /* ---- Concierge mode: ?ref=<code> ---- */
  var refCode = '';
  try {
    refCode = (new URLSearchParams(window.location.search).get('ref') || '').trim().slice(0, 40);
  } catch (e) {
    refCode = '';
  }
  if (refCode) {
    var conciergeLine = document.getElementById('concierge-line');
    conciergeLine.textContent = 'Introduced by ' + refCode;
    conciergeLine.hidden = false;
  }

  /* ---- Status label per product, from config ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.product'), function (card) {
    var key = card.getAttribute('data-key');
    var entry = (CONFIG.products && CONFIG.products[key]) || {};
    var label = card.querySelector('.status');
    if (label) {
      label.textContent = entry.available ? 'Available' : 'On request';
    }
  });

  /* ---- Date fields cannot be in the past ---- */
  var today = new Date();
  var todayISO = [
    today.getFullYear(),
    ('0' + (today.getMonth() + 1)).slice(-2),
    ('0' + today.getDate()).slice(-2)
  ].join('-');
  document.getElementById('f-date').min = todayISO;
  document.getElementById('f-alt-date').min = todayISO;

  /* ---- Sheet open / close ---- */
  function openSheet(productName) {
    lastFocused = document.activeElement;
    form.hidden = false;
    successState.hidden = true;
    errorEl.hidden = true;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send request';
    document.getElementById('f-product').value = productName;
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    // Let the panel paint at its start position before transitioning in.
    window.requestAnimationFrame(function () {
      sheet.classList.add('is-open');
      document.getElementById('f-date').focus();
    });
  }

  function closeSheet() {
    sheet.classList.remove('is-open');
    sheet.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.request-btn'), function (btn) {
    btn.addEventListener('click', function () {
      openSheet(btn.getAttribute('data-product') || '');
    });
  });

  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !sheet.hidden) {
      closeSheet();
    }
  });

  /* ---- Keep focus inside the sheet while it is open ---- */
  sheetPanel.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var focusable = sheetPanel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([readonly]), select, textarea'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ---- Submit ---- */
  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function buildWhatsappLink(payload, reqId) {
    var guests = payload.adults + payload.children;
    var message = 'Eternis Sea request · ' + payload.product +
      ' · ' + payload.date +
      ' · ' + guests + ' guests' +
      ' · ' + (payload.pickup || 'pickup to confirm') +
      ' · ref ' + reqId;
    return 'https://wa.me/' + (CONFIG.whatsappNumber || '') + '?text=' + encodeURIComponent(message);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.hidden = true;

    var payload = {
      product: document.getElementById('f-product').value.trim(),
      date: document.getElementById('f-date').value,
      alt_date: document.getElementById('f-alt-date').value,
      adults: parseInt(document.getElementById('f-adults').value, 10) || 0,
      children: parseInt(document.getElementById('f-children').value, 10) || 0,
      pickup: document.getElementById('f-pickup').value.trim(),
      name: document.getElementById('f-name').value.trim(),
      whatsapp: document.getElementById('f-whatsapp').value.trim(),
      notes: document.getElementById('f-notes').value.trim(),
      ref_code: refCode,
      source_url: window.location.href
    };

    if (!payload.product || !payload.date || payload.adults < 1 || !payload.name || !payload.whatsapp) {
      showError('Please give a date, at least one adult, your name and your WhatsApp number.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending';

    // text/plain keeps this a simple request, so no CORS preflight is needed.
    fetch(CONFIG.formEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        if (!result || !result.ok) {
          throw new Error((result && result.error) || 'rejected');
        }
        document.getElementById('req-id').textContent = result.req_id;
        document.getElementById('whatsapp-link').href = buildWhatsappLink(payload, result.req_id);
        form.hidden = true;
        successState.hidden = false;
        document.getElementById('sheet-title').textContent = 'Request sent';
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send request';
        showError('The request did not go through. Please try again, or message us on WhatsApp.');
      });
  });
})();
