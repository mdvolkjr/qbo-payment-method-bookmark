// ==UserScript==
// @name         QBO Set Bank Deposit Payment Method
// @namespace    qbo-bulk-deposit-fields
// @version      3.1
// @description  Bulk-set Payment Method and Account on the QBO Bank Deposit page
// @match        https://app.qbo.intuit.com/*
// @match        https://qbo.intuit.com/*
// @match        https://qbo.intuit.com/app/deposit*
// @updateURL    https://raw.githubusercontent.com/mdvolkjr/qbo-payment-method-bookmark/main/tampermonkey.user.js
// @downloadURL  https://raw.githubusercontent.com/mdvolkjr/qbo-payment-method-bookmark/main/tampermonkey.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

var PM_VALUES   = ['Check', 'Clio Payments', 'LawPay'];
var ACCT_VALUES = ['Operating Account - 2104', 'Expense Account - 0387', 'IOLTA - 5899'];

setInterval(function () {
  if (location.pathname === '/app/deposit' || location.pathname.indexOf('/app/deposit?') === 0 || location.pathname.indexOf('/app/deposit/') === 0) {
    injectBtn('qbo-pm-btn',   'Set Payment Methods', '120px', '#2ca01c', '#108000', showPMPicker);
    injectBtn('qbo-acct-btn', 'Set Account',         '290px', '#0077c5', '#005a96', showAcctPicker);
  } else {
    ['qbo-pm-btn','qbo-acct-btn','qbo-picker'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }
}, 1000);

function injectBtn(id, label, right, bg, bgHover, handler) {
  if (document.getElementById(id)) return;
  var btn = document.createElement('button');
  btn.id = id;
  btn.textContent = label;
  btn.style.cssText = 'position:fixed;top:8px;right:' + right + ';z-index:2147483647;' +
    'background:' + bg + ';color:#fff;border:none;border-radius:6px;' +
    'padding:6px 12px;font-family:system-ui,sans-serif;font-size:13px;' +
    'font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);';
  btn.onmouseover = function() { btn.style.background = bgHover; };
  btn.onmouseout  = function() { btn.style.background = bg; };
  btn.onclick = handler;
  document.body.appendChild(btn);
}

function showPMPicker()   { showPicker('Set ALL Payment Methods to:', PM_VALUES,   '#2ca01c', '#108000', 'payment method', '120px'); }
function showAcctPicker() { showPicker('Set ALL Accounts to:',        ACCT_VALUES, '#0077c5', '#005a96', 'account',        '290px'); }

function showPicker(title, values, bg, bgHover, mode, right) {
  var existing = document.getElementById('qbo-picker');
  if (existing) { existing.remove(); return; }

  var overlay = document.createElement('div');
  overlay.id = 'qbo-picker';
  overlay.style.cssText = 'position:fixed;top:44px;right:' + right + ';z-index:2147483647;' +
    'background:#fff;border:1px solid #d4d7dc;border-radius:8px;padding:14px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.18);font-family:system-ui,sans-serif;font-size:14px;width:250px;';

  var titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.cssText = 'font-weight:600;margin-bottom:10px;color:#393a3d;';
  overlay.appendChild(titleEl);

  values.forEach(function(v) {
    var b = document.createElement('button');
    b.textContent = v;
    b.style.cssText = 'display:block;width:100%;margin:4px 0;padding:8px 12px;' +
      'background:' + bg + ';color:#fff;border:none;border-radius:4px;' +
      'cursor:pointer;font-size:13px;font-weight:500;text-align:left;';
    b.onmouseover = function() { b.style.background = bgHover; };
    b.onmouseout  = function() { b.style.background = bg; };
    b.onclick = function() { overlay.remove(); runBulkSet(mode, v); };
    overlay.appendChild(b);
  });

  var cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'display:block;width:100%;margin-top:8px;padding:6px 12px;' +
    'background:#f4f5f8;border:1px solid #d4d7dc;border-radius:4px;cursor:pointer;' +
    'font-size:13px;color:#393a3d;';
  cancel.onclick = function() { overlay.remove(); };
  overlay.appendChild(cancel);

  document.body.appendChild(overlay);
}

// ── Main dispatch ─────────────────────────────────────────────────────────

function runBulkSet(mode, value) {
  if (mode === 'account') {
    runDirect(value);
  } else {
    runPaymentMethod(value);
  }
}

// On some QBO page states the payment method inputs are already in the DOM;
// on others they are lazy and only appear after clicking the cell.
// Try direct first; fall back to cell-click if nothing is found.
async function runPaymentMethod(value) {
  var directInputs = Array.from(document.querySelectorAll('input[data-testid*="payment_method"]'));
  if (directInputs.length > 0) {
    console.log('[QBO] payment method inputs already in DOM, using direct mode');
    await runDirectPM(directInputs, value);
  } else {
    console.log('[QBO] payment method inputs not in DOM, using cell-click mode');
    await runViaCell(value);
  }
}

async function runDirectPM(inputs, value) {
  var status = makeStatus('Setting payment methods to "' + value + '"...');
  try {
    var total = inputs.length;
    var updated = 0;
    var MAX = 20;
    var failed = new Set();

    while (updated < MAX) {
      var currentInputs = Array.from(document.querySelectorAll('input[data-testid*="payment_method"]'));
      var v = value.trim().toLowerCase();
      var input = null;
      for (var j = 0; j < currentInputs.length; j++) {
        var key = currentInputs[j].dataset.testid || currentInputs[j].id || currentInputs[j].name;
        if (currentInputs[j].value.trim().toLowerCase() !== v && !failed.has(key)) {
          input = currentInputs[j]; break;
        }
      }
      if (!input) break;

      var ikey = input.dataset.testid || input.id || input.name;
      try {
        await setComboValue(input, value);
        updated++;
        await sleep(250);
      } catch(e) {
        console.warn('[QBO] direct PM failed on', input, e);
        failed.add(ikey);
      }
    }

    status.textContent = 'Updated ' + updated + ' of ' + total + ' rows.';
    if (updated === 0) status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 3500);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 5000);
  }
}

// Account inputs are always in the DOM — set directly, no clicking needed.
async function runDirect(value) {
  var status = makeStatus('Finding account fields...');
  try {
    var inputs = Array.from(document.querySelectorAll(
      'input[data-testid*="payment_account"], input[aria-label="Choose an account"]'
    )).filter(function(inp) {
      return !inp.dataset.testid || inp.dataset.testid.indexOf('cashback') === -1;
    });
    var total = inputs.length;
    console.log('[QBO] account inputs found:', total);

    if (total === 0) {
      status.style.background = '#d52b1e';
      status.textContent = 'No account fields found. Make sure rows are loaded.';
      setTimeout(function() { status.remove(); }, 5000);
      return;
    }

    var updated = 0;
    for (var i = 0; i < inputs.length; i++) {
      status.textContent = 'Account ' + (i+1) + ' of ' + total + '...';
      try {
        await setComboValue(inputs[i], value);
        updated++;
        await sleep(300);
      } catch(e) {
        console.warn('[QBO] account row', i, 'failed:', e.message);
      }
    }

    status.textContent = 'Updated ' + updated + ' of ' + total + ' accounts.';
    if (updated === 0) status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 3500);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 5000);
  }
}

// Payment method inputs are lazy — must click each cell to reveal them.
async function runViaCell(value) {
  var status = makeStatus('Finding payment method cells...');
  try {
    var cells = findColumnCells('PAYMENT METHOD');
    var total = cells.length;
    console.log('[QBO] payment method cells found:', total);

    if (total === 0) {
      status.style.background = '#d52b1e';
      status.textContent = 'No payment method column found. Make sure rows are loaded.';
      setTimeout(function() { status.remove(); }, 5000);
      return;
    }

    var updated = 0;
    var usedInputs = new Set();

    for (var i = 0; i < total; i++) {
      status.textContent = 'Row ' + (i+1) + ' of ' + total + '...';
      try {
        var liveCells = findColumnCells('PAYMENT METHOD');
        var cell = liveCells[i];
        if (!cell) { console.warn('[QBO] row', i, 'cell missing'); continue; }

        cell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        await sleep(100);
        var cellRect = cell.getBoundingClientRect();
        console.log('[QBO] row', i, 'cellRect top:', Math.round(cellRect.top), 'left:', Math.round(cellRect.left));

        // Try clicking up to 3 times — the last row sometimes needs a second attempt
        // because QBO may still be settling from the previous save.
        var input = null;
        for (var attempt = 0; attempt < 3 && !input; attempt++) {
          if (attempt > 0) {
            console.log('[QBO] row', i, 'retry attempt', attempt + 1);
            // Re-query the live cell in case React replaced it
            var retryCells = findColumnCells('PAYMENT METHOD');
            var retryCell = retryCells[i];
            if (retryCell) {
              retryCell.scrollIntoView({ block: 'nearest', behavior: 'instant' });
              await sleep(150);
              // Alternate strategy: direct click on the cell element itself
              retryCell.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true }));
              retryCell.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, cancelable:true }));
              retryCell.click();
              await sleep(600);
            }
          } else {
            await activateCell(cell);
            await sleep(500);
          }

          var allInputs = Array.from(document.querySelectorAll(
            'input[role="combobox"], input[aria-autocomplete], input[aria-haspopup="listbox"]'
          ));
          console.log('[QBO] row', i, 'attempt', attempt + 1, '— inputs:',
            allInputs.map(function(inp) {
              var r = inp.getBoundingClientRect();
              return { top: Math.round(r.top), left: Math.round(r.left), val: inp.value, excl: usedInputs.has(inp) };
            })
          );

          input = await waitForInputNearCell(cellRect, 800, usedInputs);
        }

        if (!input) { console.warn('[QBO] row', i, 'no input found after 3 attempts'); continue; }
        console.log('[QBO] row', i, 'found input at top:', Math.round(input.getBoundingClientRect().top));

        usedInputs.add(input);
        await setComboValue(input, value);
        updated++;
        input.blur();
        await sleep(300);
      } catch(e) {
        console.warn('[QBO] row', i, 'error:', e.message);
      }
    }

    status.textContent = 'Updated ' + updated + ' of ' + total + ' rows.';
    if (updated === 0) status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 3500);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.background = '#d52b1e';
    setTimeout(function() { status.remove(); }, 5000);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isInDepositTable(el) {
  // Returns true if the element is inside the read-only "Add funds to this deposit" section.
  // We identify it by the accordion body wrapper or the depositTable div.
  return !!(
    el.closest('[id="depositTable"]') ||
    el.closest('[id="depositTableAccordionHeader"]') ||
    el.closest('[class*="AccordionItemBody"]') ||
    el.closest('[class*="depositTableQuickFill"]') ||
    el.closest('[class*="depositWrapper"]')
  );
}

function findColumnCells(headerText) {
  var upper = headerText.toUpperCase();
  var headerCells = [];

  // Find th elements whose text starts with headerText — handles sort-icon text appended after.
  // Skip headers inside the read-only "Add funds to this deposit" accordion table.
  Array.from(document.querySelectorAll('th')).forEach(function(th) {
    if (isInDepositTable(th)) return;
    var txt = th.textContent.trim().toUpperCase();
    if (txt === upper || txt.indexOf(upper) === 0) {
      headerCells.push(th);
    }
  });

  // Also catch td-based plain-text headers, excluding the deposit table.
  Array.from(document.querySelectorAll('td')).forEach(function(td) {
    if (isInDepositTable(td)) return;
    if (td.textContent.trim().toUpperCase() === upper && headerCells.indexOf(td) === -1) {
      headerCells.push(td);
    }
  });

  if (headerCells.length === 0) {
    console.warn('[QBO] header not found:', headerText);
    return [];
  }

  var allBodyCells = [];
  headerCells.forEach(function(headerCell) {
    var headerRect = headerCell.getBoundingClientRect();
    if (headerRect.width === 0) return;
    var headerCx = (headerRect.left + headerRect.right) / 2;
    var table = headerCell.closest('table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var cells = Array.from(tbody.querySelectorAll('td')).filter(function(td) {
      var r = td.getBoundingClientRect();
      if (r.width === 0) return false;
      return Math.abs((r.left + r.right) / 2 - headerCx) < 30;
    });
    allBodyCells = allBodyCells.concat(cells);
  });

  return allBodyCells;
}

async function activateCell(cell) {
  var rect = cell.getBoundingClientRect();
  var cx = Math.round((rect.left + rect.right) / 2);
  var cy = Math.round((rect.top + rect.bottom) / 2);
  var target = document.elementFromPoint(cx, cy) || cell;

  var pOpts = { bubbles:true, cancelable:true, clientX:cx, clientY:cy, pointerId:1, isPrimary:true, pressure:0.5, view:window };
  var mOpts = { bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0, buttons:1, view:window };
  target.dispatchEvent(new PointerEvent('pointerover',  Object.assign({}, pOpts, { pressure:0 })));
  target.dispatchEvent(new MouseEvent('mouseover',      mOpts));
  target.dispatchEvent(new PointerEvent('pointermove',  Object.assign({}, pOpts, { pressure:0 })));
  target.dispatchEvent(new MouseEvent('mousemove',      mOpts));
  target.dispatchEvent(new PointerEvent('pointerdown',  pOpts));
  target.dispatchEvent(new MouseEvent('mousedown',      mOpts));
  await sleep(30);
  target.dispatchEvent(new PointerEvent('pointerup',    Object.assign({}, pOpts, { pressure:0 })));
  target.dispatchEvent(new MouseEvent('mouseup',        Object.assign({}, mOpts, { buttons:0 })));
  target.dispatchEvent(new MouseEvent('click',          Object.assign({}, mOpts, { buttons:0 })));
  await sleep(80);

  fireReactClick(target, cx, cy);
  var el = target.parentElement;
  for (var i = 0; i < 5 && el && el !== document.body; i++) {
    fireReactClick(el, cx, cy);
    el = el.parentElement;
  }
}

function fireReactClick(element, cx, cy) {
  try {
    var keys = Object.keys(element);
    var fiberKey = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber') === 0 || keys[i].indexOf('__reactInternalInstance') === 0) {
        fiberKey = keys[i]; break;
      }
    }
    if (!fiberKey) return;
    var fiber = element[fiberKey];
    while (fiber) {
      var props = fiber.memoizedProps || {};
      var handler = props.onClick || props.onMouseDown || props.onPointerDown;
      if (handler) {
        handler({ type:'click', target:element, currentTarget:element,
          clientX:cx, clientY:cy, bubbles:true, cancelable:true,
          preventDefault:function(){}, stopPropagation:function(){},
          nativeEvent:{ target:element, clientX:cx, clientY:cy } });
        return;
      }
      fiber = fiber.return;
    }
  } catch(e) {}
}

async function waitForInputNearCell(rect, timeout, exclude) {
  var deadline = Date.now() + timeout;
  var cellCy = (rect.top + rect.bottom) / 2;
  var cellCx = (rect.left + rect.right) / 2;
  while (Date.now() < deadline) {
    var candidates = Array.from(document.querySelectorAll(
      'input[role="combobox"], input[aria-autocomplete], input[aria-haspopup="listbox"]'
    ));
    for (var i = 0; i < candidates.length; i++) {
      var inp = candidates[i];
      if (exclude.has(inp)) continue;
      var r = inp.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (Math.abs((r.top+r.bottom)/2 - cellCy) < 80 && Math.abs((r.left+r.right)/2 - cellCx) < 150) return inp;
    }
    await sleep(50);
  }
  return null;
}

async function setComboValue(input, value) {
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true }));
  input.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, cancelable:true }));
  input.dispatchEvent(new MouseEvent('click',     { bubbles:true, cancelable:true }));
  input.focus();
  await sleep(150);

  var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input',  { bubbles:true }));
  input.dispatchEvent(new Event('change', { bubbles:true }));

  var opt = await waitForOption(input, value, 800);
  if (opt) { opt.click(); await sleep(80); return; }

  nativeSetter.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles:true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', keyCode:27, which:27, bubbles:true }));
  input.blur();
  await sleep(80);
  throw new Error('Option not found: ' + value);
}

async function waitForOption(input, value, timeout) {
  var deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    var opt = findOptionForInput(input, value) || findOptionGlobal(value);
    if (opt) return opt;
    await sleep(80);
  }
  return null;
}

function findOptionForInput(input, value) {
  var listboxId = input.getAttribute('aria-controls');
  if (!listboxId) return null;
  var listbox = document.getElementById(listboxId);
  if (!listbox) return null;
  return pickOption(Array.from(listbox.querySelectorAll('[role="option"], li')), value);
}

function findOptionGlobal(value) {
  return pickOption(Array.from(document.querySelectorAll('[role="option"], li[role="option"]')), value);
}

function pickOption(options, value) {
  var v = value.trim().toLowerCase();
  var safe = options.filter(function(o) { return !/add new|new payment/i.test(o.textContent); });
  return safe.find(function(o) { return o.textContent.trim().toLowerCase() === v; }) ||
         safe.find(function(o) { return o.textContent.trim().toLowerCase().indexOf(v) !== -1; });
}

function makeStatus(text) {
  var s = document.createElement('div');
  s.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'z-index:2147483647;background:#393a3d;color:#fff;padding:18px 24px;' +
    'border-radius:8px;font-family:system-ui;font-size:15px;font-weight:600;' +
    'box-shadow:0 8px 32px rgba(0,0,0,.5);max-width:500px;text-align:center;';
  s.textContent = text;
  document.body.appendChild(s);
  return s;
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

})();
