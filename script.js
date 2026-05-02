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

// Format for UI only: YYYY-MM-DD -> DD-MM-YYYY
function formatDisplayDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  if (!y || !m || !d) return iso;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}-${mm}-${y}`;
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
  daySelect: document.getElementById('daySelect'),
  monthSelect: document.getElementById('monthSelect'),
  yearSelect: document.getElementById('yearSelect'),
  gpay: document.getElementById('gpay'),
};


// LocalStorage removed for online-only mode
let entries = [];
let editIndex = -1;
let originalEditDate = null; // Track date to handle ID changes in Firestore
let dailySalesChart = null; 
let totalDonutChart = null; 
let importedEntriesTemp = null;
let lastChanged = null; 
let dashboardMonth = null; 

// Date helpers
function setToday() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  els.date.value = `${y}-${m}-${d}`;

  // Update selects
  if (els.daySelect) els.daySelect.value = parseInt(d, 10);
  if (els.monthSelect) els.monthSelect.value = parseInt(m, 10);
  if (els.yearSelect) els.yearSelect.value = y;
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
  const g = toPaise(els.gpay.value);
  const box = toPaise(els.boxActual.value);
  let taken = toPaise(els.takenSaving.value);
  let leftOverPaise = toPaise(els.leftOver.value);

  // If empty, treat as zero
  if (isNaN(taken)) taken = 0;
  if (isNaN(leftOverPaise)) leftOverPaise = 0;
  const gpayVal = isNaN(g) ? 0 : g;

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

  if ([p, s, gpayVal, box, taken, leftOverPaise].some(v => Number.isNaN(v))) {
    els.status.textContent = 'Please enter valid numbers (no negatives).';
    els.status.className = 'status err';
    return false;
  }
  if ([p, s, gpayVal, box, taken, leftOverPaise].some(v => v < 0)) {
    els.status.textContent = 'Negative values are not allowed.';
    els.status.className = 'status err';
    return false;
  }

  // Expected total = prev change + total sales
  const expected = p + s;
  // Actual total = cash in box + gpay online
  const actualTotal = box + gpayVal;
  const variancePaise = actualTotal - expected;

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
  ['prevChange', 'todaySales', 'gpay', 'boxActual'].forEach(id => {
    if (els[id]) {
      els[id].addEventListener(ev, () => {
        lastChanged = null;
        validateAndCalc();
      });
    }
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

// Render the total sales doughnut (multi-segment like reference, amount in center)
function renderTotalDonut() {
  // Determine selected month
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year; month = dashboardMonth.month;
  } else {
    const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1;
  }

  // Monthly aggregates for 5 segments
  let agg = { prevChange: 0, sales: 0, gpay: 0, leftOver: 0, saving: 0 };
  entries.forEach(e => {
    const [y, m] = e.date.split('-').map(Number);
    if (y === year && m === month) {
      agg.prevChange += e.prevChange || 0;
      agg.sales += e.todaySales || 0;
      agg.gpay += e.gpay || 0;
      agg.leftOver += e.leftOver || 0;
      agg.saving += e.takenSaving || 0;
    }
  });

  const ctx = document.getElementById('totalDonutChart');
  if (!ctx) return;

  // Colors/palette similar to the screenshot (pink, blue, indigo, teal, peach)
  const colors = ['#ec4899', '#3b82f6', '#6366f1', '#06b6d4', '#f59e0b'];
  const values = [
    Math.max(agg.prevChange, 0),
    Math.max(agg.sales - agg.gpay, 0), // Cash Sales
    Math.max(agg.gpay, 0),             // GPay
    Math.max(agg.leftOver, 0),
    Math.max(agg.saving, 0)
  ];

  // Fallback to a faint ring if all values are zero
  const allZero = values.every(v => v === 0);
  const data = {
    labels: ['Prev change', 'Cash Sales', 'GPay', 'Left over', '500 Notes'],
    datasets: [{
      data: allZero ? [1, 1, 1, 1, 1] : values,
      backgroundColor: colors,
      borderWidth: 0,
      hoverOffset: 6,
      spacing: 4,            // gap between segments
      borderRadius: 8        // rounded arc ends
    }]
  };
  const config = {
    type: 'doughnut',
    data,
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false } // clean look like the reference
      },
      cutout: '72%',               // ring thickness similar to reference
      rotation: -Math.PI / 2       // start at top
    }
  };

  if (totalDonutChart) {
    totalDonutChart.data = data;
    totalDonutChart.options.cutout = config.options.cutout;
    totalDonutChart.options.rotation = config.options.rotation;
    totalDonutChart.update();
  } else {
    totalDonutChart = new Chart(ctx, config);
  }
}

// Set up month picker for dashboard
function setupDashboardMonthPicker() {
  const monthInput = document.getElementById('dashboardMonth');
  if (!monthInput) return;
  // Set default to current month
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  monthInput.value = ym;
  dashboardMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  monthInput.addEventListener('change', () => {
    const [y, m] = monthInput.value.split('-').map(Number);
    dashboardMonth = { year: y, month: m };
    renderDailySalesChart();
    updateMonthlySales();
    renderTotalDonut(); // ensure donut updates
  });
}

// Chart rendering: show daily sales for selected month
function renderDailySalesChart() {
  // Use dashboardMonth if set, else current month
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year;
    month = dashboardMonth.month;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const daysInMonth = new Date(year, month, 0).getDate();

  // Prepare daily sales array
  const salesByDay = new Array(daysInMonth).fill(0);

  entries.forEach(entry => {
    const [y, m, d] = entry.date.split('-').map(Number);
    if (y === year && m === month) {
      salesByDay[d - 1] += entry.todaySales;
    }
  });

  const salesInRupees = salesByDay.map(val => val);
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());

  // Plugin to draw label at the last point
  const endLabelPlugin = {
    id: 'endLabelPlugin',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[0];
      if (!dataset || !dataset.data.length) return;
      const meta = chart.getDatasetMeta(0);
      const lastIndex = dataset.data.length - 1;
      const point = meta.data[lastIndex];
      if (!point) return;
      const value = dataset.data[lastIndex];
      ctx.save();
      ctx.font = 'bold 14px Inter, Arial, sans-serif';
      ctx.fillStyle = '#7aa2f7';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = `₹${value.toLocaleString('en-IN')}`;
      ctx.fillText(label, point.x + 8, point.y - 12);
      ctx.restore();
    }
  };

  // Line chart (replace bar chart)
  const ctxLine = document.getElementById('monthlySalesChart').getContext('2d');
  if (dailySalesChart) {
    dailySalesChart.data.labels = dayLabels;
    dailySalesChart.data.datasets[0].data = salesInRupees;
    dailySalesChart.update();
  } else {
    dailySalesChart = new Chart(ctxLine, {
      type: 'line',
      data: {
        labels: dayLabels,
        datasets: [{
          label: 'Daily Sales (₹)',
          data: salesInRupees,
          fill: false,
          backgroundColor: "rgba(0,0,255,1.0)",
          borderColor: "rgba(0,0,255,0.7)",
          tension: 0.2,
          pointRadius: 3,
          pointBackgroundColor: "#7aa2f7"
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Day of Month' } },
          y: { title: { display: true, text: 'Sales (₹)' }, beginAtZero: true, ticks: { precision: 0 } }
        }
      },
      plugins: [endLabelPlugin]
    });
  }
}

// Monthly sales update (for selected month)
function updateMonthlySales() {
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year;
    month = dashboardMonth.month;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  let totalSalesPaise = 0;
  entries.forEach(entry => {
    const [y, m] = entry.date.split('-');
    if (parseInt(y, 10) === year && parseInt(m, 10) === month) {
      totalSalesPaise += entry.todaySales;
    }
  });
  const formatted = fromPaise(totalSalesPaise) || '0';
  if (els.monthlySalesAmount) {
    els.monthlySalesAmount.textContent = `₹${formatted}`;
  }
}

// Table rendering
function renderTable() {
  els.salesTableBody.innerHTML = '';
  let totalSalesPaise = 0;
  let totalBoxPaise = 0;

  // Get filter value from reportsMonth if it exists
  const filterMonth = document.getElementById('reportsMonth')?.value; // "YYYY-MM"

  const filteredEntries = entries.filter(entry => {
    if (!filterMonth) return true;
    const [y, m] = entry.date.split('-');
    return `${y}-${m.padStart(2, '0')}` === filterMonth;
  });

  filteredEntries.forEach((entry, i) => {
    totalSalesPaise += entry.todaySales;
    totalBoxPaise += entry.boxActual;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Date">${formatDisplayDate(entry.date)}</td>
      <td data-label="Total Sales (₹)">₹${fromPaise(entry.todaySales)}</td>
      <td data-label="GPay (₹)">₹${fromPaise(entry.gpay || 0)}</td>
      <td data-label="Box (₹)">₹${fromPaise(entry.boxActual)}</td>
      <td data-label="Prev Day Change (₹)">₹${fromPaise(entry.prevChange)}</td>
      <td data-label="More or Less (₹)" class="${entry.variance > 0 ? 'variance-positive' : entry.variance < 0 ? 'variance-negative' : ''}">₹${fromPaise(entry.variance)}</td>
      <td data-label="Next Day Change (₹)">₹${fromPaise(entry.leftOver)}</td>
      <td data-label="Actions">
        <button class="btn-ghost btn-edit" data-index="${entries.indexOf(entry)}">Edit</button>
        <button class="btn-danger btn-delete" data-index="${entries.indexOf(entry)}">Delete</button>
      </td>
    `;
    els.salesTableBody.appendChild(tr);
  });

  const noDataRow = document.getElementById('noDataRow');
  if (noDataRow) noDataRow.hidden = filteredEntries.length > 0;
  
  const tfoot = els.salesTableBody.closest('table').querySelector('tfoot');
  if (tfoot) tfoot.hidden = filteredEntries.length === 0;

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
  renderTotalDonut();
}

// Edit & Delete
function loadEntryForEdit(index) {
  const e = entries[index];
  els.prevChange.value = fromPaise(e.prevChange);
  els.todaySales.value = fromPaise(e.todaySales);
  els.gpay.value = fromPaise(e.gpay || 0);
  els.boxActual.value = fromPaise(e.boxActual);
  els.takenSaving.value = fromPaise(e.takenSaving);
  els.leftOver.value = fromPaise(e.leftOver);
  els.expectedBox.value = fromPaise(e.expectedBox);
  els.variance.value = fromPaise(e.variance);

  // Update date selects
  const [y, m, d] = e.date.split('-').map(Number);
  if (els.daySelect) els.daySelect.value = d;
  if (els.monthSelect) els.monthSelect.value = m;
  if (els.yearSelect) els.yearSelect.value = y;


  editIndex = index;
  originalEditDate = e.date;
  els.saveBtn.textContent = 'Update Entry';
  els.status.textContent = `Editing entry for ${formatDisplayDate(e.date)}`;
  els.status.className = 'status warn';
  lastChanged = null;

  // Switch to Home tab for editing
  activateTab('home');

}
function deleteEntry(index) {
  if (!currentUser) {
    alert("Please login to delete entries.");
    return;
  }
  const entry = entries[index];
  if (confirm(`Delete entry for ${formatDisplayDate(entry.date)}?`)) {
    deleteEntryFromCloud(entry.date)
      .then(() => {
        els.status.textContent = 'Entry deleted.';
        els.status.className = 'status ok';
      })
      .catch(err => {
        els.status.textContent = 'Error deleting: ' + err.message;
        els.status.className = 'status err';
      });
  }
}

// Save Entry
els.saveBtn.addEventListener('click', () => {
  if (!currentUser) {
    alert("Please login to save entries.");
    return;
  }
  if (!validateAndCalc()) return;

  const entry = {
    date: els.date.value,
    prevChange: toPaise(els.prevChange.value),
    todaySales: toPaise(els.todaySales.value),
    gpay: toPaise(els.gpay.value) || 0,
    boxActual: toPaise(els.boxActual.value),
    takenSaving: toPaise(els.takenSaving.value),
    leftOver: toPaise(els.leftOver.value),
    expectedBox: toPaise(els.expectedBox.value),
    variance: toPaise(els.variance.value),
  };

  els.status.textContent = 'Saving to cloud...';
  
  let promise;
  if (editIndex >= 0) {
    // If date changed, delete old one
    if (entry.date !== originalEditDate) {
      promise = deleteEntryFromCloud(originalEditDate).then(() => saveEntryToCloud(entry));
    } else {
      promise = saveEntryToCloud(entry);
    }
  } else {
    promise = saveEntryToCloud(entry);
  }

  promise.then(() => {
    els.status.textContent = 'Entry saved to cloud.';
    els.status.className = 'status ok';
    
    document.getElementById('saleForm').reset();
    setPrevChangeFromLastEntry();
    els.leftOver.value = els.expectedBox.value = els.variance.value = '';
    editIndex = -1;
    originalEditDate = null;
    els.saveBtn.textContent = 'Save Entry';
  }).catch(err => {
    els.status.textContent = 'Error saving: ' + err.message;
    els.status.className = 'status err';
  });
});

// Monthly sales update
function updateMonthlySales() {
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year;
    month = dashboardMonth.month;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  let totalSalesPaise = 0;

  entries.forEach(entry => {
    const [y, m] = entry.date.split('-');
    if (parseInt(y, 10) === year && parseInt(m, 10) === month) {
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
  const headers = ["date", "todaySales", "gpay", "boxActual", "prevChange", "takenSaving", "leftOver", "expectedBox", "variance"];
  const rows = data.map(entry => headers.map(h => entry[h] || 0).join(','));
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
    // Ensure gpay exists if it was an old export
    if (obj.gpay === undefined) obj.gpay = 0;
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
  // Always reset value so Android allows picking the same file again
  els.importCsvInput.value = '';
  // Use a longer timeout for Android reliability
  setTimeout(() => {
    els.importCsvInput.click();
  }, 300);
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
  if (!importedEntriesTemp || !currentUser) return;
  saveEntriesToFirestore(currentUser.uid, importedEntriesTemp)
    .then(() => {
      els.importPreviewContainer.style.display = 'none';
      els.backupReminder.style.display = 'none';
      importedEntriesTemp = null;
      alert("Import successful!");
    })
    .catch(err => alert("Import failed: " + err.message));
});
els.cancelImportBtn.addEventListener('click', () => {
  els.importPreviewContainer.style.display = 'none';
  els.backupReminder.style.display = 'none';
  importedEntriesTemp = null;
});

// Tab system
const navItems = document.querySelectorAll('.nav-item');
const contents = document.querySelectorAll('.tab-content');

function activateTab(targetTab) {
  navItems.forEach(item => {
    const isActive = item.dataset.tab === targetTab;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  contents.forEach(content => {
    content.classList.toggle('active', content.id === targetTab);
  });
}

navItems.forEach(item => {
  item.addEventListener('click', () => activateTab(item.dataset.tab));
});


// --- Firebase Auth & Firestore Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyCZR6kpfRg17DcStAoGDF6PuOaxXcdIpLY",
  authDomain: "quickslip-403a4.firebaseapp.com",
  projectId: "quickslip-403a4",
  storageBucket: "quickslip-403a4.appspot.com",
  messagingSenderId: "535666998042",
  appId: "1:535666998042:web:aac21cce82a755448c0aa3",
  measurementId: "G-401V268YT7"
};

let firestore = null;
let userUnsub = null;
let currentUser = null;

function loadFirebaseDeps(cb) {
  if (typeof firebase === "undefined") {
    const script = document.createElement('script');
    script.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
    script.onload = () => {
      const authScript = document.createElement('script');
      authScript.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
      authScript.onload = () => {
        const fsScript = document.createElement('script');
        fsScript.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js";
        fsScript.onload = cb;
        document.head.appendChild(fsScript);
      };
      document.head.appendChild(authScript);
    };
    document.head.appendChild(script);
  } else {
    cb();
  }
}

loadFirebaseDeps(initFirebaseAuth);

function initFirebaseAuth() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.firebaseAuth = firebase.auth();
  firestore = firebase.firestore();
  setupAuthUI();
}

// --- Firestore Sync Logic ---
function getUserSalesRef(uid) {
  return firestore.collection('users').doc(uid).collection('sales');
}

// Save all entries to Firestore (overwrite)
function saveEntriesToFirestore(uid, entries) {
  const ref = getUserSalesRef(uid);
  // Remove all docs, then add all entries (simple approach)
  return ref.get().then(snapshot => {
    const batch = firestore.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    entries.forEach(entry => {
      const docRef = ref.doc(entry.date);
      batch.set(docRef, entry);
    });
    return batch.commit();
  });
}

function listenToUserSales(uid) {
  if (userUnsub) userUnsub();
  userUnsub = getUserSalesRef(uid).onSnapshot(snapshot => {
    const newEntries = [];
    snapshot.forEach(doc => newEntries.push(doc.data()));
    // Sort by date ascending
    newEntries.sort((a, b) => a.date.localeCompare(b.date));
    entries = newEntries;
    renderTable();
    setPrevChangeFromLastEntry();
  });
}

function saveEntryToCloud(entry) {
  if (!currentUser) return Promise.reject("Not logged in");
  return getUserSalesRef(currentUser.uid).doc(entry.date).set(entry);
}

function deleteEntryFromCloud(date) {
  if (!currentUser) return Promise.reject("Not logged in");
  return getUserSalesRef(currentUser.uid).doc(date).delete();
}

// --- Auth UI ---
function setupAuthUI() {
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');
  const googleSignInBtn = document.getElementById('googleSignInBtn');

  function showLoginModal() {
    loginModal.style.display = 'flex';
    registerModal.style.display = 'none';
  }
  function showRegisterModal() {
    loginModal.style.display = 'none';
    registerModal.style.display = 'flex';
  }
  showRegister.onclick = (e) => { e.preventDefault(); showRegisterModal(); };
  showLogin.onclick = (e) => { e.preventDefault(); showLoginModal(); };

  loginForm.onsubmit = function (e) {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    firebaseAuth.signInWithEmailAndPassword(email, password)
      .catch(err => { loginError.textContent = err.message; });
  };
  registerForm.onsubmit = function (e) {
    e.preventDefault();
    registerError.textContent = '';
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    firebaseAuth.createUserWithEmailAndPassword(email, password)
      .catch(err => { registerError.textContent = err.message; });
  };
  logoutBtn.onclick = function () {
    firebaseAuth.signOut();
  };

  googleSignInBtn.onclick = function (e) {
    e.preventDefault();
    loginError.textContent = '';
    const provider = new firebase.auth.GoogleAuthProvider();
    firebaseAuth.signInWithPopup(provider)
      .catch(err => { loginError.textContent = err.message; });
  };

  firebaseAuth.onAuthStateChanged(user => {
    if (user) {
      loginModal.style.display = 'none';
      registerModal.style.display = 'none';
      logoutBtn.style.display = 'block';
      document.body.classList.remove('auth-locked');
      currentUser = user;
      // Sync from Firestore
      listenToUserSales(user.uid);
      syncProfileIcons();
    } else {
      loginModal.style.display = 'flex';
      registerModal.style.display = 'none';
      logoutBtn.style.display = 'none';
      document.body.classList.add('auth-locked');
      currentUser = null;
      if (userUnsub) userUnsub();
      entries = [];
      renderTable();
      setPrevChangeFromLastEntry();
      syncProfileIcons();
    }
  });
}

// Prevent app interaction if not logged in
(function lockUIUntilLogin() {
  const style = document.createElement('style');
  style.innerHTML = `
    /* Keep visual dim/blur but allow clicks so filters/buttons work */
    body.auth-locked .container > *:not(#loginModal):not(#registerModal):not(#logoutBtn) {
      /* pointer-events: none;  <-- removed so UI remains clickable */
      filter: blur(2px) grayscale(0.5);
      user-select: none;
      opacity: 0.5;
    }
  `;
  document.head.appendChild(style);
})();

// --- Date Select Initialization ---
function initDateSelects() {
  if (!els.daySelect || !els.monthSelect || !els.yearSelect) return;

  // Populate days
  for (let i = 1; i <= 31; i++) {
    const opt = document.createElement('option');
    const val = String(i);
    opt.value = val; opt.textContent = i;
    els.daySelect.appendChild(opt);
  }

  // Populate months
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  months.forEach((m, i) => {
    const opt = document.createElement('option');
    const val = String(i + 1);
    opt.value = val; opt.textContent = m;
    els.monthSelect.appendChild(opt);
  });

  // Populate years (last 5 years)
  const cy = new Date().getFullYear();
  for (let i = cy; i >= cy - 5; i--) {
    const opt = document.createElement('option');
    const val = String(i);
    opt.value = val; opt.textContent = i;
    els.yearSelect.appendChild(opt);
  }

  function updateHiddenDate() {
    const d = String(els.daySelect.value).padStart(2, '0');
    const m = String(els.monthSelect.value).padStart(2, '0');
    const y = els.yearSelect.value;
    els.date.value = `${y}-${m}-${d}`;
  }

  [els.daySelect, els.monthSelect, els.yearSelect].forEach(s => {
    s.addEventListener('change', updateHiddenDate);
  });

  // Initial sync
  updateHiddenDate();
}

// --- Profile picture logic updated for Firestore ---
function syncProfileIcons() {
  const topImg = document.getElementById('profileBtnImg');
  const topDef = document.getElementById('profileBtnDefault');

  if (currentUser) {
    firestore.collection('users').doc(currentUser.uid).get().then(doc => {
      const data = doc.data();
      if (data && data.profilePic) {
        if (topImg) {
          topImg.src = data.profilePic;
          topImg.style.display = 'block';
        }
        if (topDef) topDef.style.display = 'none';
      } else {
        if (topImg) topImg.style.display = 'none';
        if (topDef) topDef.style.display = 'block';
      }
    });
  } else {
    if (topImg) topImg.style.display = 'none';
    if (topDef) topDef.style.display = 'block';
  }
}

function setupReportsFilter() {
  const monthInput = document.getElementById('reportsMonth');
  const clearBtn = document.getElementById('reportsMonthClear');
  if (!monthInput) return;

  // Default to current month
  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  monthInput.addEventListener('change', renderTable);
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      monthInput.value = '';
      renderTable();
    });
  }
}

function setupProfileDropdown() {
  const profileBtn = document.getElementById('profileBtn');
  const profileDropdown = document.getElementById('profileDropdown');
  const profileBtnPic = document.getElementById('profileBtnPic');

  if (profileBtnPic && profileBtn) {
    profileBtnPic.addEventListener('click', (e) => {
      e.stopPropagation();
      profileBtn.focus();
      profileBtn.click();
    });
  }

  if (profileBtn) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const show = profileDropdown.style.display !== 'block';
      profileDropdown.style.display = show ? 'block' : 'none';
      profileBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    });
  }

  document.addEventListener('click', (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target) && profileBtn && !profileBtn.contains(e.target)) {
      profileDropdown.style.display = 'none';
      profileBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

function setupMobileSidebar() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('default-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (sidebarToggle && sidebar && backdrop) {
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = sidebarToggle.getAttribute('aria-expanded') === 'true';
      sidebarToggle.setAttribute('aria-expanded', !expanded);
      sidebar.classList.toggle('open', !expanded);
      backdrop.toggleAttribute('hidden', expanded);
    });

    backdrop.addEventListener('click', () => {
      sidebarToggle.setAttribute('aria-expanded', 'false');
      sidebar.classList.remove('open');
      backdrop.setAttribute('hidden', '');
    });
  }
}

// --- Master Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initDateSelects();
  setupDashboardMonthPicker();
  renderTable();
  setTodayAndPrevChange();
  validateAndCalc();
  setupReportsFilter();
  setupProfileDropdown();
  setupMobileSidebar();
  setupSettingsModal();
});

function setupSettingsModal() {
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', function () {
      settingsModal.style.display = 'flex';
      const profileDropdown = document.getElementById('profileDropdown');
      if (profileDropdown) profileDropdown.style.display = 'none';
      
      const img = document.getElementById('profilePicImg');
      const def = document.getElementById('profilePicDefault');
      
      if (currentUser) {
        firestore.collection('users').doc(currentUser.uid).get().then(doc => {
          const data = doc.data();
          if (data && data.profilePic) {
            img.src = data.profilePic;
            img.style.display = '';
            def.style.display = 'none';
          } else {
            img.style.display = 'none';
            def.style.display = '';
          }
        });
      }
      
      const status = document.getElementById('profilePicStatus');
      if (status) status.textContent = '';
      const input = document.getElementById('profilePicInput');
      if (input) input.value = '';
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', function () {
      settingsModal.style.display = 'none';
    });
  }

  let profilePicTempDataUrl = null;
  const profilePicInput = document.getElementById('profilePicInput');
  if (profilePicInput) {
    profilePicInput.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        profilePicTempDataUrl = e.target.result;
        const img = document.getElementById('profilePicImg');
        const def = document.getElementById('profilePicDefault');
        img.src = e.target.result;
        img.style.display = '';
        def.style.display = 'none';
        const status = document.getElementById('profilePicStatus');
        if (status) status.textContent = 'Preview only. Click Save to apply.';
      };
      reader.readAsDataURL(file);
    });
  }

  const saveProfilePicBtn = document.getElementById('saveProfilePicBtn');
  if (saveProfilePicBtn) {
    saveProfilePicBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (!currentUser) {
        alert("Please login to save profile picture.");
        return;
      }
      const status = document.getElementById('profilePicStatus');
      if (profilePicTempDataUrl) {
        status.textContent = 'Saving to cloud...';
        firestore.collection('users').doc(currentUser.uid).set({
          profilePic: profilePicTempDataUrl
        }, { merge: true }).then(() => {
          status.textContent = 'Profile picture saved to cloud!';
          profilePicTempDataUrl = null;
          syncProfileIcons();
        }).catch(err => {
          status.textContent = 'Error: ' + err.message;
        });
      } else {
        if (status) status.textContent = 'Please select a picture first.';
      }
    });
  }
}