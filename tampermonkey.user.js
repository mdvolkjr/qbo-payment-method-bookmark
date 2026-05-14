// ==UserScript==
// @name         QBO Bulk Deposit Fields
// @namespace    qbo-bulk-deposit-fields
// @version      2.2
// @description  Adds buttons on the QBO Bank Deposit page to bulk-set Payment Method and Account fields
// @match        https://app.qbo.intuit.com/*
// @match        https://qbo.intuit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PM_VALUES = ['Check', 'Clio Payments', 'LawPay'];
  const ACCT_VALUES = ['Operating Account - 2104', 'Expense Account - 0387', 'IOLTA - 5899'];

  const PM_BTN_ID   = 'qbo-bulk-pm-btn';
  const ACCT_BTN_ID = 'qbo-bulk-acct-btn';
  const PICKER_ID   = 'qbo-bulk-picker';

  setInterval(() => {
    if (location.pathname.startsWith('/app/deposit')) {
      injectButton(PM_BTN_ID,   '💳 Set Payment Methods', '120px', '#2ca01c', '#108000',
                   () => showPicker('Set ALL Payment Methods to:', PM_VALUES, 'payment method', '120px'));
      injectButton(ACCT_BTN_ID, '🏦 Set Account',          '300px', '#0077c5', '#005a96',
                   () => showPicker('Set ALL Accounts to:', ACCT_VALUES, 'account-direct', '300px'));
    } else {
      [PM_BTN_ID, ACCT_BTN_ID, PICKER_ID].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
  }, 1000);

  function injectButton(id, label, right, bg, bgHover, onClick) {
    if (document.getElementById(id)) return;
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = label;
    Object.assign(btn.style, {
      position: 'fixed', top: '8px', right: right, zIndex: '2147483647',
      background: bg, color: '#fff', border: 'none', borderRadius: '6px',
      padding: '6px 12px', fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)'
    });
    btn.onmouseover = () => (btn.style.background = bgHover);
    btn.onmouseout  = () => (btn.style.background = bg);
    btn.onclick = onClick;
    document.body.appendChild(btn);
  }

  function showPicker(title, values, columnHeader, right) {
    const existing = document.getElementById(PICKER_ID);
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = PICKER_ID;
    Object.assign(overlay.style, {
      position: 'fixed', top: '44px', right: right, zIndex: '2147483647',
      background: '#fff', border: '1px solid #d4d7dc', borderRadius: '8px',
      padding: '14px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '14px',
      width: '240px'
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    Object.assign(titleEl.style, { fontWeight: '600', marginBottom: '10px', color: '#393a3d' });
    overlay.appendChild(titleEl);

    const isAcct = columnHeader === 'account';
    const bg     = isAcct ? '#0077c5' : '#2ca01c';
    const bgHov  = isAcct ? '#005a96' : '#108000';

    values.forEach(v => {
      const b = document.createElement('button');
      b.textContent = v;
      Object.assign(b.style, {
        display: 'block', width: '100%', margin: '4px 0', padding: '8px 12px',
        background: bg, color: '#fff', border: 'none', borderRadius: '4px',
        cursor: 'pointer', fontSize: '13px', fontWeight: '500', textAlign: 'left'
      });
      b.onmouseover = () => (b.style.background = bgHov);
      b.onmouseout  = () => (b.style.background = bg);
      b.onclick = () => { overlay.remove(); runBulkSet(columnHeader, v); };
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

  // columnHeader: exact text of the column header (case-insensitive), e.g. 'payment method' or 'account'
  async function runBulkSet(columnHeader, value) {
    // Account inputs are always in the DOM — set them directly without clicking.
    // Payment method inputs are lazy-rendered — must click each cell first.
    if (columnHeader === 'account-direct') {
      await runBulkSetDirect(value);
    } else {
      await runBulkSetViaCell(columnHeader, value);
    }
  }

  // Account fields: inputs already exist in the DOM, no cell-click needed.
  async function runBulkSetDirect(value) {
    const status = makeStatus('Finding account fields...');
    try {
      const inputs = Array.from(document.querySelectorAll(
        'input[data-testid*="payment_account"], input[aria-label="Choose an account"]'
      ));
      const total = inputs.length;

      if (total === 0) {
        status.style.background = '#d52b1e';
        status.textContent = 'No account fields found. Make sure rows are loaded.';
        setTimeout(() => status.remove(), 5000);
        return;
      }

      status.textContent = 'Found ' + total + ' account(s). Setting to "' + value + '"...';
      let updated = 0;

      for (let i = 0; i < inputs.length; i++) {
        status.textContent = 'Setting account ' + (i + 1) + ' of ' + total + '...';
        try {
          await setComboValue(inputs[i], value);
          updated++;
          await sleep(300);
        } catch (e) {
          console.warn('[QBO bulk] Account row', i, 'failed:', e.message);
        }
      }

      status.textContent = 'Updated ' + updated + ' of ' + total + ' accounts.';
      if (updated === 0) status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 3500);
    } catch (e) {
      console.error('[QBO bulk] Error', e);
      status.textContent = 'Error: ' + e.message;
      status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 5000);
    }
  }

  // Payment method fields: inputs are lazy-rendered, must click each cell to reveal.
  async function runBulkSetViaCell(columnHeader, value) {
    const status = makeStatus('Finding ' + columnHeader + ' cells...');
    try {
      const cells = findColumnCells(columnHeader);
      const total = cells.length;

      if (total === 0) {
        status.style.background = '#d52b1e';
        status.textContent = 'No "' + columnHeader + '" column found. Make sure rows are loaded.';
        setTimeout(() => status.remove(), 5000);
        return;
      }

      status.textContent = 'Found ' + total + ' row(s). Setting to "' + value + '"...';
      let updated = 0;
      const usedInputs = new Set();

      for (let i = 0; i < total; i++) {
        status.textContent = 'Row ' + (i + 1) + ' of ' + total + '...';
        try {
          const liveCells = findColumnCells(columnHeader);
          console.log('[QBO bulk] Row', i, '— live cell count:', liveCells.length);
          const cell = liveCells[i];
          if (!cell) {
            console.warn('[QBO bulk] Row', i, '— cell missing from DOM');
            continue;
          }

          cell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          await sleep(100);
          const cellRect = cell.getBoundingClientRect();
          console.log('[QBO bulk] Row', i, '— cellRect:', JSON.stringify({
            top: Math.round(cellRect.top), left: Math.round(cellRect.left),
            width: Math.round(cellRect.width), height: Math.round(cellRect.height)
          }));

          await activateCell(cell);
          await sleep(400);

          const allInputs = Array.from(document.querySelectorAll(
            'input[role="combobox"], input[aria-autocomplete], input[aria-haspopup="listbox"]'
          ));
          console.log('[QBO bulk] Row', i, '— comboboxes after click:',
            allInputs.map(inp => {
              const r = inp.getBoundingClientRect();
              return { top: Math.round(r.top), left: Math.round(r.left), value: inp.value, excluded: usedInputs.has(inp) };
            })
          );

          const input = await waitForInputNearCell(cellRect, 1500, usedInputs);
          if (!input) {
            console.warn('[QBO bulk] Row', i, '— no input found near cellRect');
            continue;
          }
          console.log('[QBO bulk] Row', i, '— using input at top:', Math.round(input.getBoundingClientRect().top));

          usedInputs.add(input);
          await setComboValue(input, value);
          updated++;
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

  // Find tbody cells in the column whose header matches the given text.
  function findColumnCells(columnHeader) {
    const needle = columnHeader.trim().toUpperCase();
    const pmHeader = Array.from(document.querySelectorAll('*')).find(
      el => el.children.length === 0 && el.textContent.trim().toUpperCase() === needle
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

  // ── Cell activation ───────────────────────────────────────────────────────

  async function activateCell(cell) {
    const rect = cell.getBoundingClientRect();
    const cx = Math.round((rect.left + rect.right) / 2);
    const cy = Math.round((rect.top + rect.bottom) / 2);
    const target = document.elementFromPoint(cx, cy) || cell;

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

    fireReactClick(target, cx, cy);
    let el = target.parentElement;
    for (let i = 0; i < 5 && el && el !== document.body; i++) {
      fireReactClick(el, cx, cy);
      el = el.parentElement;
    }
  }

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

  // ── Input search ──────────────────────────────────────────────────────────

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

  // ── Status overlay ────────────────────────────────────────────────────────

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
