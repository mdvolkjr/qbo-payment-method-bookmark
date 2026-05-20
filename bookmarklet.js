(function () {
  'use strict';

  const VALUES = ['Check', 'Clio Payments', 'LawPay'];

  const existing = document.getElementById('qbo-bulk-pm-picker');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'qbo-bulk-pm-picker';
  Object.assign(overlay.style, {
    position: 'fixed', top: '90px', right: '24px', zIndex: '2147483647',
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
    const btn = document.createElement('button');
    btn.textContent = v;
    Object.assign(btn.style, {
      display: 'block', width: '100%', margin: '4px 0', padding: '8px 12px',
      background: '#2ca01c', color: '#fff', border: 'none', borderRadius: '4px',
      cursor: 'pointer', fontSize: '14px', fontWeight: '500'
    });
    btn.onmouseover = () => (btn.style.background = '#108000');
    btn.onmouseout  = () => (btn.style.background = '#2ca01c');
    btn.onclick = () => { overlay.remove(); runBulkSet(v); };
    overlay.appendChild(btn);
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

  // ── Bulk set ──────────────────────────────────────────────────────────────

  async function runBulkSet(value) {
    const status = makeStatus('Setting payment methods to "' + value + '"...');
    try {
      // Count total rows upfront for the status message
      const total = findPaymentMethodInputs().length;
      console.log('[QBO bulk] Found', total, 'Payment Method inputs');

      let updated = 0;
      const MAX = 20;
      const failed = new Set(); // keyed by testid/id so re-rendered elements are still skipped

      // Re-query after each row — React re-renders the table after each
      // dropdown selection, which detaches previously cached input references.
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
          await sleep(250); // let React settle before re-querying
        } catch (e) {
          console.warn('[QBO bulk] Failed on', input, e);
          failed.add(key); // skip this row next iteration, keep going for others
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
      position: 'fixed', top: '90px', right: '24px', zIndex: '2147483647',
      background: '#393a3d', color: '#fff', padding: '10px 14px',
      borderRadius: '6px', fontFamily: 'system-ui', fontSize: '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)', maxWidth: '320px'
    });
    s.textContent = text;
    document.body.appendChild(s);
    return s;
  }

  // ── Find inputs ───────────────────────────────────────────────────────────
  // QBO stamps each payment-method cell with data-testid="line_payment_method_N__textField".
  // Fall back to broader selectors only if that yields nothing.

  function findPaymentMethodInputs() {
    // Scope to the "Select payments" section; exclude the accordion "Other funds" section.
    const isInBadSection = el =>
      el.closest('[id*="accordion__item-body"]') || el.closest('#depositTable');

    const paymentSection =
      document.querySelector('[class*="undepositedWrapper"]') ||
      document.querySelector('[class*="paymentTableWrapper"]');

    // 1. Precise: data-testid contains "payment_method", scoped to correct section first
    if (paymentSection) {
      const scoped = Array.from(
        paymentSection.querySelectorAll('input[data-testid*="payment_method"]')
      );
      if (scoped.length) return scoped;
    }

    const precise = Array.from(
      document.querySelectorAll('input[data-testid*="payment_method"]')
    ).filter(i => !isInBadSection(i));
    if (precise.length) return precise;

    // 2. Find the "PAYMENT METHOD" column header, excluding accordion/deposit table
    const headers = Array.from(document.querySelectorAll('div, span, th'))
      .filter(el => el.textContent.trim().toUpperCase() === 'PAYMENT METHOD' && !isInBadSection(el));
    if (headers.length) {
      const table = headers[0].closest(
        'table, [role="table"], section, div[class*="Deposit"], div[class*="deposit"], form'
      );
      if (table) {
        const found = Array.from(table.querySelectorAll(
          'input[role="combobox"], input[aria-haspopup="listbox"], input[aria-autocomplete="list"]'
        )).filter(i => !isInBadSection(i));
        if (found.length) return found;
      }
    }

    // 3. Last resort: every combobox not in the accordion/deposit section
    return Array.from(document.querySelectorAll(
      'input[role="combobox"], input[aria-autocomplete]'
    )).filter(i => !isInBadSection(i));
  }

  // ── Set a React-controlled combobox ───────────────────────────────────────

  async function setComboValue(input, value) {
    input.focus();
    await sleep(60);

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Poll for the matching option — give QBO up to 800ms to render the dropdown.
    // Never press Enter as a fallback: QBO treats Enter-with-no-match as "Add new".
    const opt = await waitForOption(input, value, 800);
    if (opt) {
      opt.click();
      await sleep(80);
      return;
    }

    // Option not found — clear the field and bail rather than triggering "Add new".
    nativeSetter.call(input, '');
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
    }));
    input.blur();
    await sleep(80);
    throw new Error('Option "' + value + '" not found in dropdown');
  }

  // Poll every 80ms up to `timeout` ms for the option to appear in the listbox.
  async function waitForOption(input, value, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const opt = findOptionForInput(input, value) || findOptionGlobal(value);
      if (opt) return opt;
      await sleep(80);
    }
    return null;
  }

  // Look inside the listbox that this specific input controls
  function findOptionForInput(input, value) {
    const listboxId = input.getAttribute('aria-controls');
    if (!listboxId) return null;
    const listbox = document.getElementById(listboxId);
    if (!listbox) return null;
    return pickOption(Array.from(listbox.querySelectorAll('[role="option"], li')), value);
  }

  // Fallback: search entire page for any visible option element
  function findOptionGlobal(value) {
    return pickOption(
      Array.from(document.querySelectorAll('[role="option"], li[role="option"]')),
      value
    );
  }

  function pickOption(options, value) {
    const v = value.trim().toLowerCase();
    // Exclude "Add new" / "New Payment Method" entries — clicking those opens a dialog
    const safe = options.filter(o => !/add new|new payment/i.test(o.textContent));
    return (
      safe.find(o => o.textContent.trim().toLowerCase() === v) ||
      safe.find(o => o.textContent.trim().toLowerCase().includes(v))
    );
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
