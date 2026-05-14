// ==UserScript==
// @name         QBO Bulk Payment Method
// @namespace    qbo-bulk-payment-method
// @version      1.3
// @description  Adds a button on the QBO Bank Deposit page to set all Payment Method fields at once
// @match        https://app.qbo.intuit.com/*
// @match        https://qbo.intuit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VALUES = ['Check', 'Clio Payments', 'LawPay'];
  const BUTTON_ID = 'qbo-bulk-pm-btn';
  const PICKER_ID = 'qbo-bulk-pm-picker';

  // Poll every second — simpler and more reliable than MutationObserver
  // for SPA navigation. Injects the button on /app/deposit, removes it elsewhere.
  setInterval(() => {
    if (location.pathname.startsWith('/app/deposit')) {
      injectButton();
    } else {
      const btn = document.getElementById(BUTTON_ID);
      if (btn) btn.remove();
    }
  }, 1000);

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return; // already there

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.textContent = '💳 Set Payment Methods';
    Object.assign(btn.style, {
      position: 'fixed', top: '8px', right: '120px', zIndex: '2147483647',
      background: '#2ca01c', color: '#fff', border: 'none', borderRadius: '6px',
      padding: '6px 12px', fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)'
    });
    btn.onmouseover = () => (btn.style.background = '#108000');
    btn.onmouseout = () => (btn.style.background = '#2ca01c');
    btn.onclick = showPicker;
    document.body.appendChild(btn);
  }

  function showPicker() {
    const existing = document.getElementById(PICKER_ID);
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = PICKER_ID;
    Object.assign(overlay.style, {
      position: 'fixed', top: '44px', right: '120px', zIndex: '2147483647',
      background: '#fff', border: '1px solid #d4d7dc', borderRadius: '8px',
      padding: '14px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '14px',
      width: '220px'
    });

    const title = document.createElement('div');
    title.textContent = 'Set ALL Payment Methods to:';
    Object.assign(title.style, { fontWeight: '600', marginBottom: '10px', color: '#393a3d' });
    overlay.appendChild(title);

    VALUES.forEach(v => {
      const b = document.createElement('button');
      b.textContent = v;
      Object.assign(b.style, {
        display: 'block', width: '100%', margin: '4px 0', padding: '8px 12px',
        background: '#2ca01c', color: '#fff', border: 'none', borderRadius: '4px',
        cursor: 'pointer', fontSize: '14px', fontWeight: '500'
      });
      b.onmouseover = () => (b.style.background = '#108000');
      b.onmouseout = () => (b.style.background = '#2ca01c');
      b.onclick = () => { overlay.remove(); runBulkSet(v); };
      overlay.appendChild(b);
    });

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, {
      display: 'block', width: '100%', marginTop: '8px', padding: '6px 12px',
      background: '#f4f5f8', border: '1px solid #d4d7dc', borderRadius: '4px',
      cursor: 'pointer', fontSize: '13px', color: '#393a3d'
    });
    cancel.onclick = () => overlay.remove();
    overlay.appendChild(cancel);

    document.body.appendChild(overlay);
  }

  // ── Bulk set ──────────────────────────────────────────────────────────────

  async function runBulkSet(value) {
    const status = makeStatus('Setting payment methods to "' + value + '"...');
    try {
      const total = findPaymentMethodInputs().length;
      console.log('[QBO bulk] Found', total, 'Payment Method inputs');
      if (total === 0) {
        status.style.background = '#d52b1e';
        status.textContent = 'No payment method fields found. Open a Bank Deposit first.';
        setTimeout(() => status.remove(), 4000);
        return;
      }

      let updated = 0;
      const MAX = 20;
      const failed = new Set();

      while (updated < MAX) {
        const inputs = findPaymentMethodInputs();
        const v = value.trim().toLowerCase();
        const input = inputs.find(i => {
          const key = i.dataset.testid || i.id || i.name;
          return i.value.trim().toLowerCase() !== v && !failed.has(key);
        });
        if (!input) break;

        const key = input.dataset.testid || input.id || input.name;
        try {
          await setComboValue(input, value);
          updated++;
          await sleep(250);
        } catch (e) {
          console.warn('[QBO bulk] Failed on', input, e);
          failed.add(key);
        }
      }

      status.textContent = 'Updated ' + updated + ' of ' + total + ' rows.';
      if (updated === 0) {
        status.style.background = '#d52b1e';
        status.textContent += ' (No matches — see console.)';
      }
      setTimeout(() => status.remove(), 3500);
    } catch (e) {
      console.error('[QBO bulk] Error', e);
      status.textContent = 'Error — see console';
      status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 4500);
    }
  }

  function makeStatus(text) {
    const s = document.createElement('div');
    Object.assign(s.style, {
      position: 'fixed', top: '44px', right: '120px', zIndex: '2147483647',
      background: '#393a3d', color: '#fff', padding: '10px 14px',
      borderRadius: '6px', fontFamily: 'system-ui', fontSize: '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)', maxWidth: '320px'
    });
    s.textContent = text;
    document.body.appendChild(s);
    return s;
  }

  // ── Find inputs ───────────────────────────────────────────────────────────

  function findPaymentMethodInputs() {
    // 1. Precise data-testid match (line_payment_method_N__textField)
    const precise = Array.from(document.querySelectorAll('input[data-testid*="payment_method"]'));
    if (precise.length) return precise;

    // 2. aria-label="Select an element." is on payment method comboboxes specifically
    const byLabel = Array.from(document.querySelectorAll('input[aria-label="Select an element."]'));
    if (byLabel.length) return byLabel;

    // 3. Column-position: find the PAYMENT METHOD header, collect inputs from that column
    const colInputs = findByColumnPosition();
    if (colInputs.length) return colInputs;

    // 4. No safe fallback — return empty rather than grabbing unrelated fields
    return [];
  }

  function findByColumnPosition() {
    const allCells = Array.from(document.querySelectorAll('th, td, div[role="columnheader"], div[role="cell"]'));
    const pmHeader = allCells.find(el => el.textContent.trim().toUpperCase() === 'PAYMENT METHOD');
    if (!pmHeader) return [];
    const headerRow = pmHeader.closest('tr, [role="row"]');
    if (!headerRow) return [];
    const colIndex = Array.from(headerRow.children).indexOf(pmHeader);
    if (colIndex === -1) return [];
    const container = headerRow.closest('table, [role="table"]');
    if (!container) return [];
    const dataRows = Array.from(container.querySelectorAll('tr, [role="row"]')).filter(r => r !== headerRow);
    const inputs = [];
    for (const row of dataRows) {
      const cell = row.children[colIndex];
      if (!cell) continue;
      const input = cell.querySelector('input[role="combobox"], input[aria-autocomplete]');
      if (input) inputs.push(input);
    }
    return inputs;
  }

  // ── Set a React-controlled combobox ───────────────────────────────────────

  async function setComboValue(input, value) {
    // QBO inputs need a real click to become interactive — focus() alone is not enough
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    input.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
    input.focus();
    await sleep(150);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const opt = await waitForOption(input, value, 800);
    if (opt) {
      opt.click();
      await sleep(80);
      return;
    }

    nativeSetter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
    }));
    input.blur();
    await sleep(80);
    throw new Error('Option "' + value + '" not found in dropdown');
  }

  async function waitForOption(input, value, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const opt = findOptionForInput(input, value) || findOptionGlobal(value);
      if (opt) return opt;
      await sleep(80);
    }
    return null;
  }

  function findOptionForInput(input, value) {
    const listboxId = input.getAttribute('aria-controls');
    if (!listboxId) return null;
    const listbox = document.getElementById(listboxId);
    if (!listbox) return null;
    return pickOption(Array.from(listbox.querySelectorAll('[role="option"], li')), value);
  }

  function findOptionGlobal(value) {
    return pickOption(
      Array.from(document.querySelectorAll('[role="option"], li[role="option"]')),
      value
    );
  }

  function pickOption(options, value) {
    const v = value.trim().toLowerCase();
    const safe = options.filter(o => !/add new|new payment/i.test(o.textContent));
    return (
      safe.find(o => o.textContent.trim().toLowerCase() === v) ||
      safe.find(o => o.textContent.trim().toLowerCase().includes(v))
    );
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
