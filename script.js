/* Utility: parse currency string to integer rupees (no decimals). */
function toPaise(str) {
  if (str === null || str === undefined) return 0;
  str = String(str).trim().replace(/,/g, '');
  if (str === '') return 0;
  if (/^-/.test(str)) return NaN; // Negative not allowed
  // Only take integer part
  const rupees = parseInt(str.split('.')[0] || '0', 10);
  if (isNaN(rupees)) return NaN;
  return rupees;
}

function fromPaise(p) {
  if (isNaN(p)) return '';
  const sign = p < 0 ? '-' : '';
  p = Math.abs(p);
  // No decimals, just return integer with commas
  return sign + p.toLocaleString('en-IN');
}

// DOM elements
const els = {
  date: document.getElementById('date'),
  prevChange: document.getElementById('prevChange'),
  todaySales: document.getElementById('todaySales'),
  boxActual: document.getElementById('boxActual'),
  takenSaving: document.getElementById('takenSaving'),
  leftOver: document.getElementById('leftOver'),
  expectedBox: document.getElementById('expectedBox'),
  variance: document.getElementById('variance'),
  status: document.getElementById('status'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  salesTableBody: document.querySelector('#salesTable tbody'),
  totalSales: document.getElementById('totalSales'),
  totalBox: document.getElementById('totalBox'),
  monthlySalesAmount: document.getElementById('monthlySalesAmount'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  importCsvBtn: document.getElementById('importCsvBtn'),
  importCsvInput: document.getElementById('importCsvInput'),
  importPreviewContainer: document.getElementById('importPreviewContainer'),
  importPreviewTable: document.getElementById('importPreviewTable'),
  confirmImportBtn: document.getElementById('confirmImportBtn'),
  cancelImportBtn: document.getElementById('cancelImportBtn'),
  backupReminder: document.getElementById('backupReminder'),
};

let entries = [];
let editIndex = -1;
let dailySalesChart = null; // rename for clarity
let importedEntriesTemp = null;
let lastChanged = null; // Track which field was last changed: 'saving' or 'leftOver'

// LocalStorage
function saveToLocalStorage() {
  localStorage.setItem('salesEntries', JSON.stringify(entries));
}
function loadFromLocalStorage() {
  const data = localStorage.getItem('salesEntries');
  if (data) entries = JSON.parse(data);
}

// Date helpers
function setToday() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  els.date.value = `${y}-${m}-${d}`;
}
function setPrevChangeFromLastEntry() {
  if (entries.length === 0) {
    els.prevChange.value = '';
  } else {
    const last = entries[entries.length - 1];
    els.prevChange.value = fromPaise(last.leftOver);
  }
}
function setTodayAndPrevChange() {
  setToday();
  setPrevChangeFromLastEntry();
}

// Validation and calculation
function validateAndCalc() {
  const p = toPaise(els.prevChange.value);
  const s = toPaise(els.todaySales.value);
  const box = toPaise(els.boxActual.value);
  let taken = toPaise(els.takenSaving.value);
  let leftOverPaise = toPaise(els.leftOver.value);

  // If both are empty, treat as zero
  if (isNaN(taken)) taken = 0;
  if (isNaN(leftOverPaise)) leftOverPaise = 0;

  // Sync logic: if one is changed, update the other
  if (lastChanged === 'saving') {
    leftOverPaise = box - taken;
    els.leftOver.value = isNaN(leftOverPaise) ? '' : fromPaise(leftOverPaise);
  } else if (lastChanged === 'leftOver') {
    taken = box - leftOverPaise;
    els.takenSaving.value = isNaN(taken) ? '' : fromPaise(taken);
  } else {
    // Default: update leftOver based on saving
    leftOverPaise = box - taken;
    els.leftOver.value = isNaN(leftOverPaise) ? '' : fromPaise(leftOverPaise);
  }

  if ([p, s, box, taken, leftOverPaise].some(v => Number.isNaN(v))) {
    els.status.textContent = 'Please enter valid numbers (no negatives).';
    els.status.className = 'status err';
    return false;
  }
  if ([p, s, box, taken, leftOverPaise].some(v => v < 0)) {
    els.status.textContent = 'Negative values are not allowed.';
    els.status.className = 'status err';
    return false;
  }

  const expected = p + s;
  const variancePaise = box - expected;

  els.expectedBox.value = fromPaise(expected);
  els.variance.value = fromPaise(variancePaise);

  if (variancePaise === 0) {
    els.status.textContent = 'All inputs look good.';
    els.status.className = 'status ok';
  } else if (leftOverPaise < 0) {
    els.status.textContent = 'Warning: Left over cash is negative!';
    els.status.className = 'status err';
  } else {
    els.status.textContent = 'Check variance and cash values.';
    els.status.className = 'status warn';
  }
  return true;
}

// Input listeners
['input', 'change', 'blur'].forEach(ev => {
  ['prevChange', 'todaySales', 'boxActual'].forEach(id => {
    els[id].addEventListener(ev, () => {
      lastChanged = null;
      validateAndCalc();
    });
  });
  els.takenSaving.addEventListener(ev, () => {
    lastChanged = 'saving';
    validateAndCalc();
  });
  els.leftOver.addEventListener(ev, () => {
    lastChanged = 'leftOver';
    validateAndCalc();
  });
});

// Reset
els.resetBtn.addEventListener('click', () => {
  document.getElementById('saleForm').reset();
  setTodayAndPrevChange();
  els.leftOver.value = els.expectedBox.value = els.variance.value = '';
  els.status.textContent = 'Form reset.';
  els.status.className = 'status ok';
  editIndex = -1;
  els.saveBtn.textContent = 'Save Entry';
  lastChanged = null;
});

// Chart rendering: show daily sales for current month
function renderDailySalesChart() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Prepare daily sales array
  const salesByDay = new Array(daysInMonth).fill(0);

  entries.forEach(entry => {
    const [y, m, d] = entry.date.split('-').map(Number);
    if (y === currentYear && m === currentMonth + 1) {
      // day is 1-based, so subtract 1 for array index
      salesByDay[d - 1] += entry.todaySales;
    }
  });

  // No decimals
  const salesInRupees = salesByDay.map(val => val);
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
  const ctx = document.getElementById('monthlySalesChart').getContext('2d');

  if (dailySalesChart) {
    dailySalesChart.data.labels = dayLabels;
    dailySalesChart.data.datasets[0].data = salesInRupees;
    dailySalesChart.update();
  } else {
    dailySalesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{
          label: 'Daily Sales (₹)',
          data: salesInRupees,
          backgroundColor: '#7aa2f7',
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Day of Month' } },
          y: { title: { display: true, text: 'Sales (₹)' }, beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }
}

// Table rendering
function renderTable() {
  els.salesTableBody.innerHTML = '';
  let totalSalesPaise = 0;
  let totalBoxPaise = 0;

  entries.forEach((entry, i) => {
    totalSalesPaise += entry.todaySales;
    totalBoxPaise += entry.boxActual;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Date">${entry.date}</td>
      <td data-label="Today Sales (₹)">₹${fromPaise(entry.todaySales)}</td>
      <td data-label="Box (₹)">₹${fromPaise(entry.boxActual)}</td>
      <td data-label="Prev Day Change (₹)">₹${fromPaise(entry.prevChange)}</td>
      <td data-label="More or Less (₹)" class="${entry.variance > 0 ? 'variance-positive' : entry.variance < 0 ? 'variance-negative' : ''}">₹${fromPaise(entry.variance)}</td>
      <td data-label="Next Day Change (₹)">₹${fromPaise(entry.leftOver)}</td>
      <td data-label="Actions">
        <button class="btn-ghost btn-edit" data-index="${i}">Edit</button>
        <button class="btn-danger btn-delete" data-index="${i}">Delete</button>
      </td>
    `;
    els.salesTableBody.appendChild(tr);
  });

  els.totalSales.textContent = `₹${fromPaise(totalSalesPaise)}`;
  els.totalBox.textContent = `₹${fromPaise(totalBoxPaise)}`;

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', e => loadEntryForEdit(parseInt(btn.dataset.index, 10)));
  });
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', e => deleteEntry(parseInt(btn.dataset.index, 10)));
  });

  renderDailySalesChart();
  updateMonthlySales();
}

// Edit & Delete
function loadEntryForEdit(index) {
  const e = entries[index];
  els.date.value = e.date;
  els.prevChange.value = fromPaise(e.prevChange);
  els.todaySales.value = fromPaise(e.todaySales);
  els.boxActual.value = fromPaise(e.boxActual);
  els.takenSaving.value = fromPaise(e.takenSaving);
  els.leftOver.value = fromPaise(e.leftOver);
  els.expectedBox.value = fromPaise(e.expectedBox);
  els.variance.value = fromPaise(e.variance);

  editIndex = index;
  els.saveBtn.textContent = 'Update Entry';
  els.status.textContent = `Editing entry for ${e.date}`;
  els.status.className = 'status warn';
  lastChanged = null;

  // Switch to Home tab for editing
  tabs.forEach(t => t.classList.remove('active'));
  contents.forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="home"]').classList.add('active');
  document.getElementById('home').classList.add('active');
}
function deleteEntry(index) {
  if (confirm(`Delete entry for ${entries[index].date}?`)) {
    entries.splice(index, 1);
    saveToLocalStorage();
    renderTable();
    setPrevChangeFromLastEntry();
  }
}

// Save Entry
els.saveBtn.addEventListener('click', () => {
  if (!validateAndCalc()) return;

  const entry = {
    date: els.date.value,
    prevChange: toPaise(els.prevChange.value),
    todaySales: toPaise(els.todaySales.value),
    boxActual: toPaise(els.boxActual.value),
    takenSaving: toPaise(els.takenSaving.value),
    leftOver: toPaise(els.leftOver.value),
    expectedBox: toPaise(els.expectedBox.value),
    variance: toPaise(els.variance.value),
  };

  if (editIndex >= 0) {
    entries[editIndex] = entry;
    els.status.textContent = 'Entry updated.';
  } else {
    entries.push(entry);
    els.status.textContent = 'Entry saved.';
  }
  els.status.className = 'status ok';

  saveToLocalStorage();
  renderTable();
  setPrevChangeFromLastEntry();

  document.getElementById('saleForm').reset();
  setPrevChangeFromLastEntry();
  els.leftOver.value = els.expectedBox.value = els.variance.value = '';
  editIndex = -1;
  els.saveBtn.textContent = 'Save Entry';
});

// Monthly sales update
function updateMonthlySales() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let totalSalesPaise = 0;

  entries.forEach(entry => {
    const [y, m] = entry.date.split('-');
    if (parseInt(y, 10) === currentYear && parseInt(m, 10) === currentMonth + 1) {
      totalSalesPaise += entry.todaySales;
    }
  });

  const formatted = fromPaise(totalSalesPaise) || '0';
  if (els.monthlySalesAmount) {
    els.monthlySalesAmount.textContent = `₹${formatted}`;
  }
}

// CSV Export/Import
function entriesToCSV(data) {
  const headers = ["date", "todaySales", "boxActual", "prevChange", "takenSaving", "leftOver", "expectedBox", "variance"];
  const rows = data.map(entry => headers.map(h => entry[h]).join(','));
  return headers.join(',') + '\n' + rows.join('\n');
}
function csvToEntries(csvStr) {
  const lines = csvStr.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = h === 'date' ? vals[i] : parseInt(vals[i], 10) || 0;
    });
    return obj;
  });
}

// Export CSV
els.exportCsvBtn.addEventListener('click', () => {
  const csvData = entriesToCSV(entries);
  const blob = new Blob([csvData], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sales_data_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Import CSV with preview
els.importCsvBtn.addEventListener('click', () => {
  // Clear value to allow re-importing the same file on mobile
  els.importCsvInput.value = '';
  // On some mobile browsers, input.click() needs to be in a setTimeout to work reliably
  setTimeout(() => {
    els.importCsvInput.click();
  }, 100);
});
els.importCsvInput.addEventListener('click', (e) => {
  // For some mobile browsers, force re-creation of the input to ensure file picker opens
  e.target.value = '';
});
els.importCsvInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const imported = csvToEntries(event.target.result);
      importedEntriesTemp = imported;
      showCSVPreview(imported);
      els.importPreviewContainer.style.display = 'block';
      els.backupReminder.style.display = 'block';
    } catch (err) {
      alert('Invalid CSV file.');
    }
  };
  reader.readAsText(file);
});
function showCSVPreview(data) {
  els.importPreviewTable.innerHTML = '';
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  els.importPreviewTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.slice(0, 10).forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = h === 'date' ? row[h] : fromPaise(row[h]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  els.importPreviewTable.appendChild(tbody);
}
els.confirmImportBtn.addEventListener('click', () => {
  if (!importedEntriesTemp) return;
  entries = importedEntriesTemp;
  saveToLocalStorage();
  renderTable();
  setPrevChangeFromLastEntry();
  els.importPreviewContainer.style.display = 'none';
  els.backupReminder.style.display = 'none';
  importedEntriesTemp = null;
});
els.cancelImportBtn.addEventListener('click', () => {
  els.importPreviewContainer.style.display = 'none';
  els.backupReminder.style.display = 'none';
  importedEntriesTemp = null;
});

// Tab system
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Service worker registration (optional, adjust path if needed)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(reg => {
    // Listen for updates to the service worker
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New update available, prompt user to reload
          showUpdateNotification();
        }
      });
    });
  }).catch(() => {});
}

// Show update notification and reload button
function showUpdateNotification() {
  let notif = document.getElementById('pwaUpdateNotif');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'pwaUpdateNotif';
    notif.style.position = 'fixed';
    notif.style.bottom = '24px';
    notif.style.left = '50%';
    notif.style.transform = 'translateX(-50%)';
    notif.style.background = '#222';
    notif.style.color = '#fff';
    notif.style.padding = '16px 24px';
    notif.style.borderRadius = '8px';
    notif.style.boxShadow = '0 2px 12px #0008';
    notif.style.zIndex = '9999';
    notif.innerHTML = 'A new version is available. <button id="reloadPwaBtn" style="margin-left:12px;padding:6px 16px;border-radius:5px;border:none;background:#7aa2f7;color:#fff;font-weight:600;cursor:pointer;">Reload</button>';
    document.body.appendChild(notif);
    document.getElementById('reloadPwaBtn').onclick = () => window.location.reload(true);
  }
}

// Init
loadFromLocalStorage();
renderTable();
setTodayAndPrevChange();
validateAndCalc();