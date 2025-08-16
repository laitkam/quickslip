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
let dailySalesChart = null; // now used for line chart only
let importedEntriesTemp = null;
let lastChanged = null; // Track which field was last changed: 'saving' or 'leftOver'
let dashboardMonth = null; // {year, month} for dashboard chart

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

  renderDailySalesChart(); // always use the dashboardMonth
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

// --- Firebase Auth Setup ---
const firebaseConfig = {
  apiKey: "AIzaSyCZR6kpfRg17DcStAoGDF6PuOaxXcdIpLY",
  authDomain: "quickslip-403a4.firebaseapp.com",
  projectId: "quickslip-403a4",
  storageBucket: "quickslip-403a4.firebasestorage.app",
  messagingSenderId: "535666998042",
  appId: "1:535666998042:web:aac21cce82a755448c0aa3",
  measurementId: "G-401V268YT7" // (optional, for analytics)
};
if (typeof firebase === "undefined") {
  const script = document.createElement('script');
  script.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
  script.onload = () => {
    const authScript = document.createElement('script');
    authScript.src = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
    authScript.onload = initFirebaseAuth;
    document.head.appendChild(authScript);
  };
  document.head.appendChild(script);
} else {
  initFirebaseAuth();
}

function initFirebaseAuth() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.firebaseAuth = firebase.auth();
  setupAuthUI();
}

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

  loginForm.onsubmit = function(e) {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    firebaseAuth.signInWithEmailAndPassword(email, password)
      .catch(err => { loginError.textContent = err.message; });
  };
  registerForm.onsubmit = function(e) {
    e.preventDefault();
    registerError.textContent = '';
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    firebaseAuth.createUserWithEmailAndPassword(email, password)
      .catch(err => { registerError.textContent = err.message; });
  };
  logoutBtn.onclick = function() {
    firebaseAuth.signOut();
  };

  googleSignInBtn.onclick = function(e) {
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
      // Optionally: load user-specific data here
    } else {
      loginModal.style.display = 'flex';
      registerModal.style.display = 'none';
      logoutBtn.style.display = 'none';
      document.body.classList.add('auth-locked');
    }
  });
}

// Prevent app interaction if not logged in
(function lockUIUntilLogin() {
  const style = document.createElement('style');
  style.innerHTML = `
    body.auth-locked .container > *:not(#loginModal):not(#registerModal):not(#logoutBtn) {
      pointer-events: none;
      filter: blur(2px) grayscale(0.5);
      user-select: none;
      opacity: 0.5;
    }
  `;
  document.head.appendChild(style);
})();

// Init
loadFromLocalStorage();
setupDashboardMonthPicker();
renderTable();
setTodayAndPrevChange();
validateAndCalc();