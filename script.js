
/* Utility: parse currency string to integer paise (avoid float issues). */
function toPaise(str){
  if (str === null || str === undefined) return 0;
  str = String(str).trim().replace(/,/g, '');
  if (str === '') return 0;
  if (/^-/.test(str)) return NaN;
  const parts = str.split('.');
  const rupees = parseInt(parts[0] || '0', 10);
  if (isNaN(rupees)) return NaN;
  let paise = rupees * 100;
  if (parts[1]){
    let dec = parts[1].slice(0,2);
    if (dec.length === 1) dec = dec + '0';
    while (dec.length < 2) dec += '0';
    const d = parseInt(dec,10);
    if (isNaN(d)) return NaN;
    paise += d;
  }
  return paise;
}

function fromPaise(p){
  if (isNaN(p)) return '';
  const sign = p < 0 ? '-' : '';
  p = Math.abs(p);
  const rupees = Math.floor(p / 100);
  const paise = p % 100;
  return sign + rupees.toLocaleString('en-IN') + '.' + String(paise).padStart(2,'0');
}

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
};

let entries = [];
let editIndex = -1;

function saveToLocalStorage() {
  localStorage.setItem('salesEntries', JSON.stringify(entries));
}

function loadFromLocalStorage() {
  const data = localStorage.getItem('salesEntries');
  if (data) {
    try {
      entries = JSON.parse(data);
    } catch {
      entries = [];
    }
  }
}

function setToday(){
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  els.date.value = `${y}-${m}-${d}`;
}

function setPrevChangeFromLastEntry(){
  if(entries.length === 0){
    els.prevChange.value = '0.00';
  } else {
    const lastLeftOver = entries[entries.length -1].leftOver;
    els.prevChange.value = fromPaise(lastLeftOver) || '0.00';
  }
}

// On load and after reset: set date + prevChange from last leftover
function setTodayAndPrevChange(){
  setToday();
  setPrevChangeFromLastEntry();
}

function validateAndCalc(){
  const p = toPaise(els.prevChange.value);
  const s = toPaise(els.todaySales.value);
  const box = toPaise(els.boxActual.value);
  const taken = toPaise(els.takenSaving.value);

  if ([p,s,box,taken].some(v => Number.isNaN(v))){
    els.status.textContent = 'Please enter valid non-negative numbers (use dot for decimals).';
    els.status.className = 'status err';
    els.leftOver.value = '';
    els.expectedBox.value = '';
    els.variance.value = '';
    return false;
  }
  if ([p,s,box,taken].some(v => v < 0)){
    els.status.textContent = 'Negative values are not allowed.';
    els.status.className = 'status err';
    return false;
  }

  const expected = p + s;
  const leftOverPaise = box - taken;
  const variancePaise = box - expected;

  els.expectedBox.value = fromPaise(expected);
  els.variance.value = fromPaise(variancePaise);
  els.leftOver.value = isNaN(leftOverPaise) ? '' : fromPaise(leftOverPaise);

  if (variancePaise === 0){
    els.status.textContent = 'Exact match: Actual equals expected.';
    els.status.className = 'status ok';
  } else if (variancePaise > 0){
    els.status.textContent = 'Positive variance: more cash than expected.';
    els.status.className = 'status warn';
  } else {
    els.status.textContent = 'Negative variance: less cash than expected.';
    els.status.className = 'status err';
  }
  if (leftOverPaise < 0){
    els.status.textContent = 'Warning: Taken for saving exceeds box (leftover negative).';
    els.status.className = 'status err';
  }

  return true;
}

['input','change','blur'].forEach(ev=>{
  ['prevChange','todaySales','boxActual','takenSaving'].forEach(id=>{
    document.getElementById(id).addEventListener(ev, validateAndCalc);
  });
});

els.resetBtn.addEventListener('click', ()=>{
  document.getElementById('saleForm').reset();
  setTodayAndPrevChange();
  els.leftOver.value = els.expectedBox.value = els.variance.value = '';
  els.status.textContent = 'Form reset.';
  els.status.className = 'status ok';
  editIndex = -1;
  els.saveBtn.textContent = 'Save Entry';
});
let monthlySalesChart; // chart instance

function renderMonthlySalesChart() {
  // Prepare data: sum sales per month for the current year
  const now = new Date();
  const currentYear = now.getFullYear();

  // Initialize array with 12 months = 0 paise sales each
  const salesByMonth = new Array(12).fill(0);

  entries.forEach(entry => {
    const entryDate = new Date(entry.date);
    if (entryDate.getFullYear() === currentYear) {
      const month = entryDate.getMonth(); // 0-11
      salesByMonth[month] += entry.todaySales;
    }
  });

  // Convert paise to rupees for labels
  const salesInRupees = salesByMonth.map(paise => parseFloat(fromPaise(paise)));

  // Month labels
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // If chart exists, update data, else create new chart
  const ctx = document.getElementById('monthlySalesChart').getContext('2d');

  if (monthlySalesChart) {
    monthlySalesChart.data.datasets[0].data = salesInRupees;
    monthlySalesChart.update();
  } else {
    monthlySalesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Monthly Sales (₹)',
          data: salesInRupees,
          backgroundColor: '#50fa7b',
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#50fa7b',
            },
            grid: {
              color: '#44475a',
            }
          },
          x: {
            ticks: {
              color: '#50fa7b',
            },
            grid: {
              color: '#44475a',
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#50fa7b',
              font: {
                size: 14,
                weight: 'bold',
              }
            }
          }
        },
        responsive: true,
        maintainAspectRatio: false,
      }
    });
  }
}

function renderTable(){
  function updateMonthlySales() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let totalSalesPaise = 0;

  entries.forEach(entry => {
    const entryDate = new Date(entry.date);
    if (
      entryDate.getMonth() === currentMonth &&
      entryDate.getFullYear() === currentYear
    ) {
      totalSalesPaise += entry.todaySales;
    }
  });

  const formatted = fromPaise(totalSalesPaise) || '0.00';
  const monthlyElem = document.getElementById('monthlySalesAmount');
  if (monthlyElem) {
    monthlyElem.textContent = `₹${formatted}`;
  }
}

  els.salesTableBody.innerHTML = '';

  let totalSalesPaise = 0;
  let totalBoxPaise = 0;

  entries.forEach((entry, i) => {
    totalSalesPaise += entry.todaySales;
    totalBoxPaise += entry.boxActual;

    const varianceClass = entry.variance >= 0 ? 'variance-positive' : 'variance-negative';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>₹${fromPaise(entry.todaySales)}</td>
      <td>₹${fromPaise(entry.boxActual)}</td>
      <td>₹${fromPaise(entry.prevChange)}</td>
      <td class="${varianceClass}">₹${fromPaise(entry.variance)}</td>
      <td>₹${fromPaise(entry.leftOver)}</td>
      <td class="actions">
        <button class="btn-ghost btn-edit" data-index="${i}" aria-label="Edit entry for ${entry.date}">Edit</button>
        <button class="btn-danger btn-delete" data-index="${i}" aria-label="Delete entry for ${entry.date}">Delete</button>
      </td>
    `;
    els.salesTableBody.appendChild(tr);
     updateMonthlySales();
     renderMonthlySalesChart();
  });
  

  els.totalSales.textContent = `₹${fromPaise(totalSalesPaise)}`;
  els.totalBox.textContent = `₹${fromPaise(totalBoxPaise)}`;

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.target.dataset.index;
      loadEntryForEdit(idx);
    });
  });
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.target.dataset.index;
      deleteEntry(idx);
    });
  });
}

function loadEntryForEdit(index){
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
}

function deleteEntry(index){
  if(confirm(`Delete entry for ${entries[index].date}?`)){
    entries.splice(index,1);
    if(editIndex === index) {
      els.resetBtn.click();
    } else if (editIndex > index) {
      editIndex--;
    }
    saveToLocalStorage();
    renderTable();
    setPrevChangeFromLastEntry();
  }
}

els.saveBtn.addEventListener('click', () => {
  if(!validateAndCalc()) return;

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

  if(editIndex >= 0){
    entries[editIndex] = entry;
    els.status.textContent = `Entry updated for ${entry.date}`;
  } else {
    entries.push(entry);
    els.status.textContent = `Entry saved for ${entry.date}`;
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


// Initialize on page load
loadFromLocalStorage();
renderTable();
function updateMonthlySales() {
  console.log('updateMonthlySales running');
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let totalSalesPaise = 0;

  entries.forEach(entry => {
    const entryDate = new Date(entry.date);
    console.log('Entry:', entry.date, entryDate, entry.todaySales);
    if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
      totalSalesPaise += entry.todaySales;
    }
  });

  const formatted = fromPaise(totalSalesPaise) || '0.00';
  console.log('Monthly sales total:', formatted);

  const monthlyElem = document.getElementById('monthlySalesAmount');
  if (monthlyElem) {
    monthlyElem.textContent = `₹${formatted}`;
  } else {
    console.error('#monthlySalesAmount element not found');
  }
    updateMonthlySales();
}

setTodayAndPrevChange();
validateAndCalc();
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const importCsvInput = document.getElementById('importCsvInput');

// Utility: Convert entries array to CSV string
function entriesToCSV(data) {
  const headers = ["date","todaySales","boxActual","prevChange","takenSaving","leftOver","expectedBox","variance"];
  const rows = data.map(entry => headers.map(h => {
    // Convert paise integers back to string like "1234.56"
    if (typeof entry[h] === 'number') {
      return (entry[h]/100).toFixed(2);
    }
    return entry[h] ?? '';
  }).join(','));
  return headers.join(',') + '\n' + rows.join('\n');
  updateMonthlySales();
}

// Utility: Parse CSV string to entries array
function csvToEntries(csvStr) {
  const lines = csvStr.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const values = line.split(',');
    const entry = {};
    headers.forEach((h,i) => {
      if (["todaySales","boxActual","prevChange","takenSaving","leftOver","expectedBox","variance"].includes(h)) {
        // Convert string amount to paise integer
        entry[h] = Math.round(parseFloat(values[i] || '0') * 100);
      } else {
        entry[h] = values[i];
      }
    });
    return entry;
  });
}

// Export CSV
exportCsvBtn.addEventListener('click', () => {
  const csvData = entriesToCSV(entries);
  const blob = new Blob([csvData], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sales_data_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Import CSV
importCsvBtn.addEventListener('click', () => {
  importCsvInput.value = '';
  importCsvInput.click();
});

importCsvInput.addEventListener('change', e => {
  const importPreviewContainer = document.getElementById('importPreviewContainer');
const importPreviewTable = document.getElementById('importPreviewTable');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const backupReminder = document.getElementById('backupReminder');

let importedEntriesTemp = null; // temp store for previewed data

// Updated CSV import input listener
importCsvInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const importedEntries = csvToEntries(event.target.result);

      if (!Array.isArray(importedEntries)) throw new Error('Invalid CSV format');
      if(importedEntries.length === 0) throw new Error('CSV file is empty');

      // Save to temp var instead of immediately loading
      importedEntriesTemp = importedEntries;

      // Show preview
      showCSVPreview(importedEntriesTemp);

      // Show the preview container and buttons
      importPreviewContainer.style.display = 'block';

      els.status.textContent = `Previewing ${importedEntries.length} entries. Confirm import or cancel.`;
      els.status.className = 'status warn';

    } catch (err) {
      els.status.textContent = 'Error importing CSV: ' + err.message;
      els.status.className = 'status err';
    }
  };
  reader.readAsText(file);
});

// Function to create preview table
function showCSVPreview(data) {
  // Clear table
  importPreviewTable.innerHTML = '';

  if(data.length === 0) return;

  // Add headers
  const headers = Object.keys(data[0]);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  importPreviewTable.appendChild(thead);

  // Add rows (limit to 10 for preview)
  const tbody = document.createElement('tbody');
  data.slice(0,10).forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      if(typeof row[h] === 'number'){
        td.textContent = (row[h]/100).toFixed(2);
      } else {
        td.textContent = row[h];
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  importPreviewTable.appendChild(tbody);
}

// Confirm import
confirmImportBtn.addEventListener('click', () => {
  if (!importedEntriesTemp) return;
  entries = importedEntriesTemp;
  saveToLocalStorage();
  renderTable();
  setPrevChangeFromLastEntry();

  els.status.textContent = `Imported ${entries.length} entries successfully.`;
  els.status.className = 'status ok';

  // Hide preview and reset temp
  importPreviewContainer.style.display = 'none';
  importedEntriesTemp = null;
});

// Cancel import
cancelImportBtn.addEventListener('click', () => {
  importPreviewContainer.style.display = 'none';
  importedEntriesTemp = null;
  els.status.textContent = 'Import canceled.';
  els.status.className = 'status ok';
  importCsvInput.value = ''; // Reset file input so user can pick again if needed
});

  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const importedEntries = csvToEntries(event.target.result);

      if (!Array.isArray(importedEntries)) throw new Error('Invalid CSV format');

      entries = importedEntries;
      saveToLocalStorage();
      renderTable();
      setPrevChangeFromLastEntry();

      els.status.textContent = `Imported ${entries.length} entries from CSV.`;
      els.status.className = 'status ok';
    } catch (err) {
      els.status.textContent = 'Error importing CSV: ' + err.message;
      els.status.className = 'status err';
    }
  };
  reader.readAsText(file);
});
const importPreviewContainer = document.getElementById('importPreviewContainer');
const importPreviewTable = document.getElementById('importPreviewTable');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const backupReminder = document.getElementById('backupReminder');

let importedEntriesTemp = null; // temp store for previewed data

// Updated CSV import input listener
importCsvInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const importedEntries = csvToEntries(event.target.result);

      if (!Array.isArray(importedEntries)) throw new Error('Invalid CSV format');
      if(importedEntries.length === 0) throw new Error('CSV file is empty');

      // Save to temp var instead of immediately loading
      importedEntriesTemp = importedEntries;

      // Show preview
      showCSVPreview(importedEntriesTemp);

      // Show the preview container and buttons
      importPreviewContainer.style.display = 'block';

      els.status.textContent = `Previewing ${importedEntries.length} entries. Confirm import or cancel.`;
      els.status.className = 'status warn';

    } catch (err) {
      els.status.textContent = 'Error importing CSV: ' + err.message;
      els.status.className = 'status err';
    }
  };
  reader.readAsText(file);
});

// Function to create preview table
function showCSVPreview(data) {
  // Clear table
  importPreviewTable.innerHTML = '';

  if(data.length === 0) return;

  // Add headers
  const headers = Object.keys(data[0]);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  importPreviewTable.appendChild(thead);

  // Add rows (limit to 10 for preview)
  const tbody = document.createElement('tbody');
  data.slice(0,10).forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      if(typeof row[h] === 'number'){
        td.textContent = (row[h]/100).toFixed(2);
      } else {
        td.textContent = row[h];
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  importPreviewTable.appendChild(tbody);
}

// Confirm import
confirmImportBtn.addEventListener('click', () => {
  if (!importedEntriesTemp) return;
  entries = importedEntriesTemp;
  renderTable();
  
  updateMonthlySales();
  setPrevChangeFromLastEntry();


  els.status.textContent = `Imported ${entries.length} entries successfully.`;
  els.status.className = 'status ok';

  // Hide preview and reset temp
  importPreviewContainer.style.display = 'none';
  importedEntriesTemp = null;
});

// Cancel import
cancelImportBtn.addEventListener('click', () => {
  importPreviewContainer.style.display = 'none';
  importedEntriesTemp = null;
  els.status.textContent = 'Import canceled.';
  els.status.className = 'status ok';
  importCsvInput.value = ''; // Reset file input so user can pick again if needed
});
// Tab system logic
const tabs = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active classes
    tabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    contents.forEach(c => c.classList.remove('active'));

    // Activate clicked tab and content
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const target = tab.dataset.tab;
    document.getElementById(target).classList.add('active');
  });
});


