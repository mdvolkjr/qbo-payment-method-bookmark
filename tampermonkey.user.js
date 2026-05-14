// ==UserScript==
// @name         QBO Bulk Payment Method
// @namespace    qbo-bulk-payment-method
// @version      2.0
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

  setInterval(() => {
    if (location.pathname.startsWith('/app/deposit')) {
      injectButton();
    } else {
      const btn = document.getElementById(BUTTON_ID);
      if (btn) btn.remove();
    }
  }, 1000);

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

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
    const status = makeStatus('Finding payment method cells...');
    try {
      const cells = findPaymentMethodCells();
      const total = cells.length;

      if (total === 0) {
        status.style.background = '#d52b1e';
        status.textContent = 'No payment method cells found. Make sure you are on the Bank Deposit page with rows loaded.';
        setTimeout(() => status.remove(), 5000);
        return;
      }

      status.textContent = 'Found ' + total + ' row(s). Setting to "' + value + '"...';
      let updated = 0;
      const usedInputs = new Set(); // never re-use an input we already set

      // Re-query cells on every iteration — React re-renders the table after each
      // dropdown selection, which detaches previously cached cell elements.
      for (let i = 0; i < total; i++) {
        try {
          const liveCells = findPaymentMethodCells();
          const cell = liveCells[i];
          if (!cell) {
            console.warn('[QBO bulk] Cell', i, 'no longer in DOM');
            continue;
          }

          // Scroll into view first, then capture rect after scroll settles.
          // If we capture before scrolling, row 4 (below the fold) has a stale
          // Y position — after scrollIntoView inside activateCell the input
          // renders at a different coordinate and the search misses it.
          cell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          await sleep(100);
          const cellRect = cell.getBoundingClientRect();

          await activateCell(cell);
          await sleep(400);
          const input = await waitForInputNearCell(cellRect, 1500, usedInputs);
          if (!input) {
            console.warn('[QBO bulk] No input appeared near cell', i);
            continue;
          }

          usedInputs.add(input);
          await setComboValue(input, value);
          updated++;
          // Blur to collapse the dropdown so it doesn't interfere with the next row
          input.blur();
          await sleep(300);
        } catch (e) {
          console.warn('[QBO bulk] Failed on row', i, e);
        }
      }

      status.textContent = 'Updated ' + updated + ' of ' + total + ' rows.';
      if (updated === 0) status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 3500);
    } catch (e) {
      console.error('[QBO bulk] Error', e);
      status.textContent = 'Error: ' + e.message;
      status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 5000);
    }
  }

  // Try every available technique to make QBO reveal the combobox input.
  // Caller must scroll into view and capture cellRect before calling this.
  async function activateCell(cell) {
    const rect = cell.getBoundingClientRect();
    const cx = Math.round((rect.left + rect.right) / 2);
    const cy = Math.round((rect.top + rect.bottom) / 2);

    // Use the actual on-screen element at those coordinates
    const target = document.elementFromPoint(cx, cy) || cell;

    // 1. Full pointer + mouse event sequence with real coordinates
    const pOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pressure: 0.5, view: window };
    const mOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: 1, view: window };
    target.dispatchEvent(new PointerEvent('pointerover',  { ...pOpts, pressure: 0 }));
    target.dispatchEvent(new MouseEvent('mouseover',      mOpts));
    target.dispatchEvent(new PointerEvent('pointermove',  { ...pOpts, pressure: 0 }));
    target.dispatchEvent(new MouseEvent('mousemove',      mOpts));
    target.dispatchEvent(new PointerEvent('pointerdown',  pOpts));
    target.dispatchEvent(new MouseEvent('mousedown',      mOpts));
    await sleep(30);
    target.dispatchEvent(new PointerEvent('pointerup',    { ...pOpts, pressure: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup',        { ...mOpts, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('click',          { ...mOpts, buttons: 0 }));

    await sleep(80);

    // 2. Also try calling React's onClick handler directly off the fiber tree —
    //    bypasses any isTrusted checks that might filter synthetic events
    fireReactClick(target, cx, cy);
    // Walk up a few ancestors too, in case the handler is on a wrapper
    let el = target.parentElement;
    for (let i = 0; i < 5 && el && el !== document.body; i++) {
      fireReactClick(el, cx, cy);
      el = el.parentElement;
    }
  }

  // Call a React onClick or onMouseDown handler found in the fiber tree.
  function fireReactClick(element, cx, cy) {
    try {
      const fiberKey = Object.keys(element).find(k =>
        k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (!fiberKey) return;
      let fiber = element[fiberKey];
      while (fiber) {
        const props = fiber.memoizedProps || {};
        const handler = props.onClick || props.onMouseDown || props.onPointerDown;
        if (handler) {
          handler({
            type: props.onClick ? 'click' : 'mousedown',
            target: element, currentTarget: element,
            clientX: cx, clientY: cy,
            bubbles: true, cancelable: true,
            preventDefault: () => {}, stopPropagation: () => {},
            nativeEvent: { target: element, clientX: cx, clientY: cy }
          });
          return;
        }
        fiber = fiber.return;
      }
    } catch (_) { /* ignore */ }
  }

  // Find the PAYMENT METHOD column cells using horizontal position matching.
  function findPaymentMethodCells() {
    const pmHeader = Array.from(document.querySelectorAll('*')).find(
      el => el.children.length === 0 && el.textContent.trim().toUpperCase() === 'PAYMENT METHOD'
    );
    if (!pmHeader) return [];

    const headerCell = pmHeader.closest('th, td');
    if (!headerCell) return [];

    const headerRect = headerCell.getBoundingClientRect();
    if (headerRect.width === 0) return [];
    const headerCx = (headerRect.left + headerRect.right) / 2;

    const table = headerCell.closest('table');
    if (!table) return [];
    const tbody = table.querySelector('tbody');
    if (!tbody) return [];

    return Array.from(tbody.querySelectorAll('td')).filter(td => {
      const r = td.getBoundingClientRect();
      if (r.width === 0) return false;
      const tdCx = (r.left + r.right) / 2;
      return Math.abs(tdCx - headerCx) < 30;
    });
  }

  // Poll for a combobox input near the given cell rect, skipping already-used inputs.
  async function waitForInputNearCell(rect, timeout, exclude = new Set()) {
    const deadline = Date.now() + timeout;
    const cellCy = (rect.top + rect.bottom) / 2;
    const cellCx = (rect.left + rect.right) / 2;

    while (Date.now() < deadline) {
      const candidates = Array.from(document.querySelectorAll(
        'input[role="combobox"], input[aria-autocomplete], input[aria-haspopup="listbox"]'
      ));
      const match = candidates.find(input => {
        if (exclude.has(input)) return false;
        const r = input.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const inputCy = (r.top + r.bottom) / 2;
        const inputCx = (r.left + r.right) / 2;
        return Math.abs(inputCy - cellCy) < 80 && Math.abs(inputCx - cellCx) < 150;
      });
      if (match) return match;
      await sleep(50);
    }
    return null;
  }

  function makeStatus(text) {
    const s = document.createElement('div');
    Object.assign(s.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: '2147483647',
      background: '#393a3d', color: '#fff', padding: '18px 24px',
      borderRadius: '8px', fontFamily: 'system-ui', fontSize: '15px',
      fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,.5)',
      maxWidth: '500px', textAlign: 'center'
    });
    s.textContent = text;
    document.body.appendChild(s);
    return s;
  }

  // ── Set a React-controlled combobox ───────────────────────────────────────

  async function setComboValue(input, value) {
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
