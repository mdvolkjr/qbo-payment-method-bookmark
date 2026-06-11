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
      // First try: inputs already in the DOM (common case)
      const directInputs = findPaymentMethodInputs();
      if (directInputs.length > 0) {
        await runDirect(directInputs, value, status);
      } else {
        // Fallback: inputs are lazy — must click each cell to reveal them
        await runViaCell(value, status);
      }
    } catch (e) {
      console.error('[QBO bulk] Error', e);
      status.textContent = 'Error — see console';
      status.style.background = '#d52b1e';
      setTimeout(() => status.remove(), 4500);
    }
  }

  async function runDirect(inputs, value, status) {
    const total = inputs.length;
    console.log('[QBO bulk] Direct: found', total, 'Payment Method inputs');

    let updated = 0;
    const MAX = 20;
    const failed = new Set();

    while (updated < MAX) {
      const currentInputs = findPaymentMethodInputs();
      const v = value.trim().toLowerCase();
      const input = currentInputs.find(i => {
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
  }

  async function runViaCell(value, status) {
    const cells = findColumnCells('PAYMENT METHOD');
    const total = cells.length;
    console.log('[QBO bulk] Via-cell: found', total, 'Payment Method cells');

    if (total === 0) {
      status.style.background = '#d52b1e';
      status.textContent = 'No payment method column found. Make sure rows are loaded.';
      setTimeout(() => status.remove(), 5000);
      return;
    }

    let updated = 0;
    const usedInputs = new Set();

    for (let i = 0; i < total; i++) {
      status.textContent = 'Row ' + (i + 1) + ' of ' + total + '...';
      try {
        const liveCells = findColumnCells('PAYMENT METHOD');
        const cell = liveCells[i];
        if (!cell) { console.warn('[QBO bulk] row', i, 'cell missing'); continue; }

        cell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        await sleep(100);
        const cellRect = cell.getBoundingClientRect();

        let input = null;
        for (let attempt = 0; attempt < 3 && !input; attempt++) {
          if (attempt > 0) {
            const retryCells = findColumnCells('PAYMENT METHOD');
            const retryCell = retryCells[i];
            if (retryCell) {
              retryCell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              await sleep(150);
              retryCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              retryCell.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
              retryCell.click();
              await sleep(600);
            }
          } else {
            await activateCell(cell);
            await sleep(500);
          }
          input = await waitForInputNearCell(cellRect, 800, usedInputs);
        }

        if (!input) { console.warn('[QBO bulk] row', i, 'no input found after 3 attempts'); continue; }

        usedInputs.add(input);
        await setComboValue(input, value);
        updated++;
        input.blur();
        await sleep(300);
      } catch (e) {
        console.warn('[QBO bulk] row', i, 'error:', e.message);
      }
    }

    status.textContent = 'Updated ' + updated + ' of ' + total + ' rows.';
    if (updated === 0) status.style.background = '#d52b1e';
    setTimeout(() => status.remove(), 3500);
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

  // ── Find inputs already in the DOM ────────────────────────────────────────

  function findPaymentMethodInputs() {
    // 1. Precise: data-testid contains "payment_method"
    const precise = Array.from(
      document.querySelectorAll('input[data-testid*="payment_method"]')
    );
    if (precise.length) return precise;

    // 2. Find the "PAYMENT METHOD" column header and search within its table
    const headers = Array.from(document.querySelectorAll('div, span, th'))
      .filter(el => el.textContent.trim().toUpperCase() === 'PAYMENT METHOD');
    if (headers.length) {
      const table = headers[0].closest(
        'table, [role="table"], section, div[class*="Deposit"], div[class*="deposit"], form'
      );
      if (table) {
        const found = Array.from(table.querySelectorAll(
          'input[role="combobox"], input[aria-haspopup="listbox"], input[aria-autocomplete="list"]'
        ));
        if (found.length) return found;
      }
    }

    return [];
  }

  // ── Find column cells by header text (for lazy-rendered inputs) ───────────

  function isInDepositTable(el) {
    return !!(
      el.closest('[id="depositTable"]') ||
      el.closest('[id="depositTableAccordionHeader"]') ||
      el.closest('[class*="AccordionItemBody"]') ||
      el.closest('[class*="depositTableQuickFill"]') ||
      el.closest('[class*="depositWrapper"]')
    );
  }

  function findColumnCells(headerText) {
    const upper = headerText.toUpperCase();
    const headerCells = [];

    Array.from(document.querySelectorAll('th')).forEach(th => {
      if (isInDepositTable(th)) return;
      const txt = th.textContent.trim().toUpperCase();
      if (txt === upper || txt.indexOf(upper) === 0) headerCells.push(th);
    });
    Array.from(document.querySelectorAll('td')).forEach(td => {
      if (isInDepositTable(td)) return;
      if (td.textContent.trim().toUpperCase() === upper && !headerCells.includes(td))
        headerCells.push(td);
    });

    if (headerCells.length === 0) return [];

    const allBodyCells = [];
    headerCells.forEach(headerCell => {
      const headerRect = headerCell.getBoundingClientRect();
      if (headerRect.width === 0) return;
      const headerCx = (headerRect.left + headerRect.right) / 2;
      const table = headerCell.closest('table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const cells = Array.from(tbody.querySelectorAll('td')).filter(td => {
        const r = td.getBoundingClientRect();
        if (r.width === 0) return false;
        return Math.abs((r.left + r.right) / 2 - headerCx) < 30;
      });
      allBodyCells.push(...cells);
    });

    return allBodyCells;
  }

  // ── Activate a lazy cell to reveal its input ──────────────────────────────

  async function activateCell(cell) {
    const rect = cell.getBoundingClientRect();
    const cx = Math.round((rect.left + rect.right) / 2);
    const cy = Math.round((rect.top + rect.bottom) / 2);
    const target = document.elementFromPoint(cx, cy) || cell;

    const pOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true, pressure: 0.5, view: window };
    const mOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, buttons: 1, view: window };
    target.dispatchEvent(new PointerEvent('pointerover',  Object.assign({}, pOpts, { pressure: 0 })));
    target.dispatchEvent(new MouseEvent('mouseover',      mOpts));
    target.dispatchEvent(new PointerEvent('pointermove',  Object.assign({}, pOpts, { pressure: 0 })));
    target.dispatchEvent(new MouseEvent('mousemove',      mOpts));
    target.dispatchEvent(new PointerEvent('pointerdown',  pOpts));
    target.dispatchEvent(new MouseEvent('mousedown',      mOpts));
    await sleep(30);
    target.dispatchEvent(new PointerEvent('pointerup',    Object.assign({}, pOpts, { pressure: 0 })));
    target.dispatchEvent(new MouseEvent('mouseup',        Object.assign({}, mOpts, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent('click',          Object.assign({}, mOpts, { buttons: 0 })));
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
        k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0
      );
      if (!fiberKey) return;
      let fiber = element[fiberKey];
      while (fiber) {
        const props = fiber.memoizedProps || {};
        const handler = props.onClick || props.onMouseDown || props.onPointerDown;
        if (handler) {
          handler({ type: 'click', target: element, currentTarget: element,
            clientX: cx, clientY: cy, bubbles: true, cancelable: true,
            preventDefault() {}, stopPropagation() {},
            nativeEvent: { target: element, clientX: cx, clientY: cy } });
          return;
        }
        fiber = fiber.return;
      }
    } catch (e) {}
  }

  async function waitForInputNearCell(rect, timeout, exclude) {
    const deadline = Date.now() + timeout;
    const cellCy = (rect.top + rect.bottom) / 2;
    const cellCx = (rect.left + rect.right) / 2;
    while (Date.now() < deadline) {
      const candidates = Array.from(document.querySelectorAll(
        'input[role="combobox"], input[aria-autocomplete], input[aria-haspopup="listbox"]'
      ));
      for (const inp of candidates) {
        if (exclude.has(inp)) continue;
        const r = inp.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (Math.abs((r.top + r.bottom) / 2 - cellCy) < 80 &&
            Math.abs((r.left + r.right) / 2 - cellCx) < 150) return inp;
      }
      await sleep(50);
    }
    return null;
  }

  // ── Set a React-controlled combobox ───────────────────────────────────────

  async function setComboValue(input, value) {
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    input.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
    input.focus();
    await sleep(100);

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
    input.dispatchEvent(new Event('input',  { bubbles: true }));
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
