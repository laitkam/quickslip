// DOM elements with defensive check
function getEl(id) {
  const el = document.getElementById(id);
  if (!el && id !== 'noDataRow') console.warn(`Element with ID "${id}" not found.`);
  return el;
}

/* Utility: parse currency string to integer rupees (no decimals). */
function toPaise(str) {
  if (str === null || str === undefined) return 0;
  str = String(str).trim().replace(/,/g, '');
  if (str === '') return 0;
  if (/^-/.test(str)) return NaN; // Negative not allowed
  const rupees = parseInt(str.split('.')[0] || '0', 10);
  if (isNaN(rupees)) return NaN;
  return rupees;
}

function fromPaise(p, includeSymbol = false) {
  if (isNaN(p)) return '';
  const sign = p < 0 ? '-' : '';
  const symbol = includeSymbol ? '₹' : '';
  p = Math.abs(p);
  return sign + symbol + p.toLocaleString('en-IN');
}

function formatDisplayDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}-${mm}-${y}`;
}

const els = {
  date: getEl('date'),
  prevChange: getEl('prevChange'),
  todaySales: getEl('todaySales'),
  boxActual: getEl('boxActual'),
  takenSaving: getEl('takenSaving'),
  leftOver: getEl('leftOver'),
  expectedBox: getEl('expectedBox'),
  variance: getEl('variance'),
  status: getEl('status'),
  resetBtn: getEl('resetBtn'),
  saveBtn: getEl('saveBtn'),
  salesTableBody: document.querySelector('#salesTable tbody'),
  monthlySalesAmount: getEl('monthlySalesAmount'),
  exportCsvBtn: getEl('exportCsvBtn'),
  importCsvBtn: getEl('importCsvBtn'),
  importCsvInput: getEl('importCsvInput'),
  daySelect: getEl('daySelect'),
  monthSelect: getEl('monthSelect'),
  yearSelect: getEl('yearSelect'),
  gpay: getEl('gpay'),
};

let entries = [];
let editIndex = -1;
let originalEditDate = null;
let dailySalesChart = null; 
let totalDonutChart = null; 
let importedEntriesTemp = null;
let lastChanged = null; 
let dashboardMonth = null; 

function setToday() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  if (els.date) els.date.value = `${y}-${m}-${d}`;
  if (els.daySelect) els.daySelect.value = parseInt(d, 10);
  if (els.monthSelect) els.monthSelect.value = parseInt(m, 10);
  if (els.yearSelect) els.yearSelect.value = y;
}

function setPrevChangeFromLastEntry() {
  if (entries.length === 0) {
    if (els.prevChange) els.prevChange.value = '';
  } else {
    const last = entries[entries.length - 1];
    if (els.prevChange) els.prevChange.value = fromPaise(last.leftOver);
  }
}
function setTodayAndPrevChange() {
  setToday();
  setPrevChangeFromLastEntry();
}

function validateAndCalc() {
  if (!els.prevChange || !els.todaySales || !els.gpay || !els.boxActual) return false;
  const p = toPaise(els.prevChange.value);
  const s = toPaise(els.todaySales.value);
  const g = toPaise(els.gpay.value);
  const box = toPaise(els.boxActual.value);
  let taken = toPaise(els.takenSaving?.value);
  let leftOverPaise = toPaise(els.leftOver?.value);
  if (isNaN(taken)) taken = 0;
  if (isNaN(leftOverPaise)) leftOverPaise = 0;
  const gpayVal = isNaN(g) ? 0 : g;
  if (lastChanged === 'saving') {
    leftOverPaise = box - taken;
    if (els.leftOver) els.leftOver.value = isNaN(leftOverPaise) ? '' : fromPaise(leftOverPaise);
  } else if (lastChanged === 'leftOver') {
    taken = box - leftOverPaise;
    if (els.takenSaving) els.takenSaving.value = isNaN(taken) ? '' : fromPaise(taken);
  } else {
    leftOverPaise = box - taken;
    if (els.leftOver) els.leftOver.value = isNaN(leftOverPaise) ? '' : fromPaise(leftOverPaise);
  }
  if ([p, s, gpayVal, box, taken, leftOverPaise].some(v => Number.isNaN(v))) {
    if (els.status) { els.status.textContent = 'Please enter valid numbers.'; els.status.className = 'status err'; }
    return false;
  }
  const expected = p + s;
  const actualTotal = box + gpayVal;
  const variancePaise = actualTotal - expected;
  if (els.expectedBox) els.expectedBox.value = fromPaise(expected, true);
  if (els.variance) els.variance.value = fromPaise(variancePaise, true);
  if (els.status) {
    if (variancePaise === 0) { els.status.textContent = 'All inputs look good.'; els.status.className = 'status ok'; }
    else { els.status.textContent = 'Check variance and cash values.'; els.status.className = 'status warn'; }
  }
  return true;
}

['input', 'change', 'blur'].forEach(ev => {
  ['prevChange', 'todaySales', 'gpay', 'boxActual'].forEach(id => {
    if (els[id]) els[id].addEventListener(ev, () => { lastChanged = null; validateAndCalc(); });
  });
  if (els.takenSaving) els.takenSaving.addEventListener(ev, () => { lastChanged = 'saving'; validateAndCalc(); });
  if (els.leftOver) els.leftOver.addEventListener(ev, () => { lastChanged = 'leftOver'; validateAndCalc(); });
});

if (els.resetBtn) els.resetBtn.addEventListener('click', () => {
  const form = document.getElementById('saleForm'); if (form) form.reset();
  setTodayAndPrevChange();
  if (els.leftOver) els.leftOver.value = '';
  if (els.expectedBox) els.expectedBox.value = '';
  if (els.variance) els.variance.value = '';
  if (els.status) { els.status.textContent = 'Form reset.'; els.status.className = 'status ok'; }
  editIndex = -1;
  if (els.saveBtn) els.saveBtn.textContent = 'Save Entry';
  lastChanged = null;
});

function renderTotalDonut() {
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year; month = dashboardMonth.month;
  } else {
    const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1;
  }
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
  const ctx = document.getElementById('totalDonutChart'); if (!ctx) return;
  const colors = ['#7aa2f7', '#9ece6a', '#bb9af7', '#e0af68', '#f7768e'];
  const values = [Math.max(agg.prevChange,0), Math.max(agg.sales-agg.gpay,0), Math.max(agg.gpay,0), Math.max(agg.leftOver,0), Math.max(agg.saving,0)];
  const allZero = values.every(v => v === 0);
  const data = {
    labels: ['Prev change', 'Cash Sales', 'GPay', 'Left over', '500 Notes'],
    datasets: [{ data: allZero ? [1,1,1,1,1] : values, backgroundColor: colors, borderWidth: 0, hoverOffset: 10, spacing: 5, borderRadius: 10 }]
  };
  if (totalDonutChart && typeof totalDonutChart.update === 'function') {
    totalDonutChart.data = data; totalDonutChart.update();
  } else if (window.Chart) {
    totalDonutChart = new Chart(ctx, { type: 'doughnut', data, options: { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: true } }, cutout: '75%', rotation: -90 } });
  }
}

function setupDashboardMonthPicker() {
  const monthInput = document.getElementById('dashboardMonth'); if (!monthInput) return;
  const now = new Date();
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  dashboardMonth = { year: now.getFullYear(), month: now.getMonth()+1 };
  monthInput.addEventListener('change', () => {
    const [y, m] = monthInput.value.split('-').map(Number);
    dashboardMonth = { year: y, month: m };
    renderDailySalesChart(); updateMonthlySales(); renderTotalDonut();
  });
}

function renderDailySalesChart() {
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) {
    year = dashboardMonth.year; month = dashboardMonth.month;
  } else {
    const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  const salesByDay = new Array(daysInMonth).fill(0);
  entries.forEach(entry => {
    const [y, m, d] = entry.date.split('-').map(Number);
    if (y === year && m === month) salesByDay[d - 1] += entry.todaySales;
  });
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
  const ctxLine = document.getElementById('monthlySalesChart'); if (!ctxLine) return;
  if (dailySalesChart && typeof dailySalesChart.update === 'function') {
    dailySalesChart.data.labels = dayLabels; dailySalesChart.data.datasets[0].data = salesByDay; dailySalesChart.update();
  } else if (window.Chart) {
    dailySalesChart = new Chart(ctxLine, {
      type: 'line', data: { labels: dayLabels, datasets: [{ label: 'Sales', data: salesByDay, borderColor: '#7aa2f7', backgroundColor: 'rgba(122, 162, 247, 0.2)', fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#7982a9' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#7982a9' } } } }
    });
  }
}

function updateMonthlySales() {
  let year, month;
  if (dashboardMonth && dashboardMonth.year && dashboardMonth.month) { year = dashboardMonth.year; month = dashboardMonth.month; }
  else { const now = new Date(); year = now.getFullYear(); month = now.getMonth() + 1; }
  let totalSalesPaise = 0; entries.forEach(e => { const [y, m] = e.date.split('-'); if (parseInt(y,10) === year && parseInt(m,10) === month) totalSalesPaise += e.todaySales; });
  if (els.monthlySalesAmount) els.monthlySalesAmount.textContent = `₹${fromPaise(totalSalesPaise) || '0'}`;
}

function renderTable() {
  if (!els.salesTableBody) return;
  els.salesTableBody.innerHTML = '';
  const filterMonth = document.getElementById('reportsMonth')?.value;
  const filteredEntries = entries.filter(e => { if (!filterMonth) return true; const [y, m] = e.date.split('-'); return `${y}-${m.padStart(2,'0')}` === filterMonth; });
  filteredEntries.forEach(entry => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${formatDisplayDate(entry.date)}</td><td>₹${fromPaise(entry.todaySales)}</td><td>₹${fromPaise(entry.gpay || 0)}</td><td>₹${fromPaise(entry.boxActual)}</td><td style="text-align: right;"><button class="btn-ghost btn-edit" data-index="${entries.indexOf(entry)}">Edit</button><button class="btn-danger btn-delete" data-index="${entries.indexOf(entry)}">Delete</button></td>`;
    els.salesTableBody.appendChild(tr);
  });
  const noData = document.getElementById('noDataRow'); if (noData) noData.hidden = filteredEntries.length > 0;
  document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => loadEntryForEdit(parseInt(btn.dataset.index, 10))));
  document.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', () => deleteEntry(parseInt(btn.dataset.index, 10))));
  renderDailySalesChart(); updateMonthlySales(); renderTotalDonut();
}

function loadEntryForEdit(index) {
  const e = entries[index];
  if (els.prevChange) els.prevChange.value = fromPaise(e.prevChange);
  if (els.todaySales) els.todaySales.value = fromPaise(e.todaySales);
  if (els.gpay) els.gpay.value = fromPaise(e.gpay || 0);
  if (els.boxActual) els.boxActual.value = fromPaise(e.boxActual);
  if (els.takenSaving) els.takenSaving.value = fromPaise(e.takenSaving);
  if (els.leftOver) els.leftOver.value = fromPaise(e.leftOver);
  if (els.expectedBox) els.expectedBox.value = fromPaise(e.expectedBox);
  if (els.variance) els.variance.value = fromPaise(e.variance);
  const [y, m, d] = e.date.split('-').map(Number);
  if (els.daySelect) els.daySelect.value = d; if (els.monthSelect) els.monthSelect.value = m; if (els.yearSelect) els.yearSelect.value = y;
  editIndex = index; originalEditDate = e.date; if (els.saveBtn) els.saveBtn.textContent = 'Update Entry';
  activateTab('home');
}

function deleteEntry(index) {
  if (!currentUser) return;
  const entry = entries[index];
  if (confirm(`Delete entry for ${formatDisplayDate(entry.date)}?`)) deleteEntryFromCloud(entry.date).catch(err => alert(err));
}

if (els.saveBtn) {
  els.saveBtn.addEventListener('click', () => {
    if (!currentUser) return; if (!validateAndCalc()) return;
    const entry = { date: els.date.value, prevChange: toPaise(els.prevChange.value), todaySales: toPaise(els.todaySales.value), gpay: toPaise(els.gpay.value) || 0, boxActual: toPaise(els.boxActual.value), takenSaving: toPaise(els.takenSaving.value), leftOver: toPaise(els.leftOver.value), expectedBox: toPaise(els.expectedBox.value), variance: toPaise(els.variance.value) };
    let promise = (editIndex >= 0 && entry.date !== originalEditDate) ? deleteEntryFromCloud(originalEditDate).then(() => saveEntryToCloud(entry)) : saveEntryToCloud(entry);
    promise.then(() => { const form = document.getElementById('saleForm'); if (form) form.reset(); setTodayAndPrevChange(); editIndex = -1; if (els.saveBtn) els.saveBtn.textContent = 'Save Entry'; }).catch(err => alert(err));
  });
}

function entriesToCSV(data) { const headers = ["date", "todaySales", "gpay", "boxActual", "prevChange", "takenSaving", "leftOver", "expectedBox", "variance"]; const rows = data.map(e => headers.map(h => e[h] || 0).join(',')); return headers.join(',') + '\n' + rows.join('\n'); }
function csvToEntries(csvStr) { const lines = csvStr.trim().split(/\r?\n/); const headers = lines.shift().split(','); return lines.map(line => { const vals = line.split(','); const obj = {}; headers.forEach((h, i) => { obj[h] = h === 'date' ? vals[i] : parseInt(vals[i], 10) || 0; }); return obj; }); }

if (els.exportCsvBtn) els.exportCsvBtn.addEventListener('click', () => { const csvData = entriesToCSV(entries); const blob = new Blob([csvData], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sales_${new Date().toISOString().slice(0,10)}.csv`; a.click(); });
if (els.importCsvBtn) els.importCsvBtn.addEventListener('click', () => { if (els.importCsvInput) els.importCsvInput.click(); });
if (els.importCsvInput) els.importCsvInput.addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const imported = csvToEntries(event.target.result); if (currentUser) saveEntriesToFirestore(currentUser.uid, imported).then(() => alert("Imported!")); } catch (e) { alert("Invalid CSV"); } }; reader.readAsText(file); });

function activateTab(targetTab) { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.tab === targetTab)); document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === targetTab)); }
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => activateTab(item.dataset.tab)));

const firebaseConfig = { apiKey: "AIzaSyCZR6kpfRg17DcStAoGDF6PuOaxXcdIpLY", authDomain: "quickslip-403a4.firebaseapp.com", projectId: "quickslip-403a4", storageBucket: "quickslip-403a4.appspot.com", messagingSenderId: "535666998042", appId: "1:535666998042:web:aac21cce82a755448c0aa3" };
let firestore, firebaseAuth, userUnsub, currentUser;

function loadFirebaseDeps(cb) {
  const scripts = ["https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js", "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"];
  let loaded = 0; scripts.forEach(src => { const s = document.createElement('script'); s.src = src; s.onload = () => { if(++loaded === scripts.length) cb(); }; document.head.appendChild(s); });
}

loadFirebaseDeps(() => { if (typeof firebase !== 'undefined') { if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); firebaseAuth = firebase.auth(); firestore = firebase.firestore(); setupAuthUI(); } });

function setupAuthUI() {
  const loginModal = document.getElementById('loginModal'); const registerModal = document.getElementById('registerModal'); const logoutBtn = document.getElementById('logoutBtn');
  if (firebaseAuth) { firebaseAuth.onAuthStateChanged(user => { currentUser = user; if (user) { if (loginModal) loginModal.style.display = 'none'; if (registerModal) registerModal.style.display = 'none'; if (logoutBtn) logoutBtn.style.display = 'block'; document.body.classList.remove('auth-locked'); listenToUserSales(user.uid); syncProfileIcons(); } else { if (loginModal) loginModal.style.display = 'flex'; if (logoutBtn) logoutBtn.style.display = 'none'; document.body.classList.add('auth-locked'); if (userUnsub) userUnsub(); entries = []; renderTable(); } }); }
  const lForm = document.getElementById('loginForm'); if (lForm) lForm.onsubmit = (e) => { e.preventDefault(); const email = document.getElementById('loginEmail')?.value; const pass = document.getElementById('loginPassword')?.value; if (email && pass) firebaseAuth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message)); };
  const rForm = document.getElementById('registerForm'); if (rForm) rForm.onsubmit = (e) => { e.preventDefault(); const email = document.getElementById('registerEmail')?.value; const pass = document.getElementById('registerPassword')?.value; if (email && pass) firebaseAuth.createUserWithEmailAndPassword(email, pass).catch(err => alert(err.message)); };
  document.getElementById('showRegister').onclick = () => { if (loginModal) loginModal.style.display = 'none'; if (registerModal) registerModal.style.display = 'flex'; };
  document.getElementById('showLogin').onclick = () => { if (loginModal) loginModal.style.display = 'flex'; if (registerModal) registerModal.style.display = 'none'; };
  document.getElementById('googleSignInBtn').onclick = () => { firebaseAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(err => alert(err.message)); };
  if (logoutBtn) logoutBtn.onclick = () => firebaseAuth.signOut();
}

function getUserSalesRef(uid) { return firestore.collection('users').doc(uid).collection('sales'); }
function saveEntriesToFirestore(uid, entries) { const ref = getUserSalesRef(uid); return ref.get().then(snap => { const batch = firestore.batch(); snap.forEach(doc => batch.delete(doc.ref)); entries.forEach(e => batch.set(ref.doc(e.date), e)); return batch.commit(); }); }
function listenToUserSales(uid) { if (userUnsub) userUnsub(); userUnsub = getUserSalesRef(uid).onSnapshot(snap => { entries = snap.docs.map(doc => doc.data()).sort((a,b) => a.date.localeCompare(b.date)); renderTable(); setPrevChangeFromLastEntry(); }); }
function saveEntryToCloud(entry) { if (currentUser) return getUserSalesRef(currentUser.uid).doc(entry.date).set(entry); return Promise.reject("No user"); }
function deleteEntryFromCloud(date) { if (currentUser) return getUserSalesRef(currentUser.uid).doc(date).delete(); return Promise.reject("No user"); }

function syncProfileIcons() {
  if (!currentUser) return;
  firestore.collection('users').doc(currentUser.uid).get().then(doc => { const data = doc.data(); const img = document.getElementById('profilePicImg'); const def = document.getElementById('profilePicDefault'); if (data && data.profilePic) { if (img) { img.src = data.profilePic; img.style.display = 'block'; } if (def) def.style.display = 'none'; } });
}

function initDateSelects() {
  const ds = els.daySelect, ms = els.monthSelect, ys = els.yearSelect;
  if (!ds || !ms || !ys) return;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach((m,i) => ms.add(new Option(m, i+1)));

  const cy = new Date().getFullYear();
  for (let i=cy; i>=cy-5; i--) ys.add(new Option(i, i));

  const updateDays = () => {
    const year = parseInt(ys.value);
    const month = parseInt(ms.value);
    const daysInMonth = new Date(year, month, 0).getDate();
    const currentDay = parseInt(ds.value) || 1;
    ds.innerHTML = '';
    for (let i = 1; i <= daysInMonth; i++) ds.add(new Option(i, i));
    ds.value = Math.min(currentDay, daysInMonth);
    updateHiddenDate();
  };

  const updateHiddenDate = () => {
    if (els.date) {
      els.date.value = `${ys.value}-${ms.value.padStart(2,'0')}-${ds.value.padStart(2,'0')}`;
      validateAndCalc();
    }
  };

  [ms, ys].forEach(s => s.addEventListener('change', updateDays));
  ds.addEventListener('change', updateHiddenDate);

  const today = new Date();
  ms.value = today.getMonth() + 1;
  ys.value = today.getFullYear();
  updateDays();
  ds.value = today.getDate();
  updateHiddenDate();
}

function setupReportsFilter() { const mi = document.getElementById('reportsMonth'); if (mi) mi.addEventListener('change', renderTable); const cl = document.getElementById('reportsMonthClear'); if (cl) cl.addEventListener('click', () => { mi.value = ''; renderTable(); }); }

function setupProfileManagement() {
  const input = document.getElementById('profilePicInput'); const save = document.getElementById('saveProfilePicBtn'); let temp;
  if (input) input.addEventListener('change', function() { const reader = new FileReader(); reader.onload = (e) => { temp = e.target.result; const img = document.getElementById('profilePicImg'); if (img) { img.src = temp; img.style.display = 'block'; } const def = document.getElementById('profilePicDefault'); if (def) def.style.display = 'none'; }; reader.readAsDataURL(this.files[0]); });
  if (save) save.addEventListener('click', () => { if (temp && currentUser) firestore.collection('users').doc(currentUser.uid).set({ profilePic: temp }, { merge: true }).then(() => alert("Saved!")).catch(err => alert(err.message)); });
}

document.addEventListener('DOMContentLoaded', () => { initDateSelects(); setupDashboardMonthPicker(); renderTable(); setTodayAndPrevChange(); validateAndCalc(); setupReportsFilter(); setupProfileManagement(); });