// =====================================================
// DATA.JS - MANAJEMEN DATA DAN CACHE
// =====================================================

// =====================================================
// DATA CACHE SYSTEM
// =====================================================
const DataCache = {
    _cache: new Map(),
    _pendingRequests: new Map(),

    _key(year, month) {
        return `${year}_${month}`;
    },

    get(year, month) {
        return this._cache.get(this._key(year, month));
    },

    set(year, month, data) {
        this._cache.set(this._key(year, month), {
            data: data,
            timestamp: Date.now()
        });
    },

    invalidate(year, month) {
        this._cache.delete(this._key(year, month));
    },

    clear() {
        this._cache.clear();
        this._pendingRequests.clear();
    },

    has(year, month) {
        return this._cache.has(this._key(year, month));
    },

    async fetch(year, month, forceRefresh = false) {
        const key = this._key(year, month);

        if (!forceRefresh && this._cache.has(key)) {
            return this._cache.get(key).data;
        }

        if (this._pendingRequests.has(key)) {
            return this._pendingRequests.get(key);
        }

        const requestPromise = this._fetchFromServer(year, month);
        this._pendingRequests.set(key, requestPromise);

        try {
            const data = await requestPromise;
            this.set(year, month, data);
            return data;
        } finally {
            this._pendingRequests.delete(key);
        }
    },

    async _fetchFromServer(year, month) {
        if (!auth.currentUser) return null;

        const docId = `salesData_${year}_${month}`;
        try {
            const doc = await db.collection("salesReports").doc(docId).get();
            if (!doc.exists) return null;
            const docData = doc.data();
            // Simpan notes ke cache terpisah jika ada
            if (docData.notes) {
                this._notesCache = this._notesCache || {};
                this._notesCache[this._key(year, month)] = docData.notes;
            }
            return docData.data;
        } catch (error) {
            console.error(`Error fetching ${docId}:`, error);
            throw error;
        }
    },

    async prefetchPreviousMonth(year, month) {
        const prevYear = month === 0 ? year - 1 : year;
        const prevMonth = month === 0 ? 11 : month - 1;

        if (!this.has(prevYear, prevMonth)) {
            try {
                await this.fetch(prevYear, prevMonth);
            } catch (e) {
                // Data bulan lalu opsional
            }
        }
    }
};

// =====================================================
// MONTHLY TARGET - LOAD & SAVE
// =====================================================
async function loadMonthlyTarget(year, month) {
    // Reset target bulan ini
    currentMonthTarget = { targetSpd: 0, targetAkm: 0 };
    updateTargetCards(0, 0);

    if (!auth.currentUser) return;

    const docId = `target_${year}_${month}`;
    try {
        const doc = await db.collection('monthlyTargets').doc(docId).get();
        if (doc.exists) {
            const data = doc.data();
            currentMonthTarget.targetSpd = data.targetSpd || 0;
            currentMonthTarget.targetAkm = data.targetAkm || 0;
            updateTargetCards(currentMonthTarget.targetSpd, currentMonthTarget.targetAkm);
        }
    } catch (error) {
        console.error('Error loading monthly target:', error);
    }
}

async function saveMonthlyTarget(year, month, targetSpd, targetAkm) {
    const docId = `target_${year}_${month}`;
    await db.collection('monthlyTargets').doc(docId).set({
        targetSpd: targetSpd,
        targetAkm: targetAkm,
        updatedAt: new Date(),
        updatedBy: auth.currentUser?.email || 'unknown'
    });
}

// =====================================================
// MONTH NAVIGATION
// =====================================================
async function changeMonth(delta) {
    if (isLoading) return;

    // Check for unsaved changes
    if (isDirty) {
        if (!confirm('Ada perubahan yang belum disimpan. Yakin ingin pindah bulan?')) {
            return;
        }
    }

    currentDate.setMonth(currentDate.getMonth() + delta);
    setDirty(false);
    await initializeMonth();
}

async function resetToCurrentMonth() {
    if (isLoading) return;

    const today = new Date();
    if (currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth()) {
        scrollToToday(true);
    } else {
        if (isDirty) {
            if (!confirm('Ada perubahan yang belum disimpan. Yakin ingin pindah?')) {
                return;
            }
        }
        currentDate = today;
        setDirty(false);
        await initializeMonth();
    }
    showMessage('Kembali ke hari ini');
}

// =====================================================
// INITIALIZE MONTH
// =====================================================
async function initializeMonth() {
    const loadId = ++currentLoadId;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    showLoading('Memuat data...');
    updateCacheStatus('pending');
    isDataLoaded = false;

    try {
        // Reset catatan saat ganti bulan
        DailyNotes.clear();

        generateTableStructure();

        const prefetchPromise = DataCache.prefetchPreviousMonth(year, month);
        const currentData = await DataCache.fetch(year, month);

        if (loadId !== currentLoadId) {
            console.log('Load cancelled - month changed');
            return;
        }

        await prefetchPromise;

        if (currentData) {
            populateTableData(currentData);
        }

        // Muat catatan dari cache notes
        const notesKey = DataCache._key(year, month);
        const cachedNotes = DataCache._notesCache && DataCache._notesCache[notesKey];
        if (cachedNotes) {
            DailyNotes.fromObject(cachedNotes);
            refreshAllNoteButtons();
        }

        // Load target bulanan SEBELUM kalkulasi
        await loadMonthlyTarget(year, month);

        calculateAllRows();
        updateSummary();

        updateCacheStatus('synced');
        scrollToToday();
        isDataLoaded = true;

    } catch (error) {
        console.error('Error initializing month:', error);
        updateCacheStatus('error');
        showMessage('Gagal memuat data: ' + error.message);
    } finally {
        if (loadId === currentLoadId) {
            hideLoading();
        }
    }
}

// =====================================================
// GENERATE TABLE STRUCTURE
// =====================================================
function generateTableStructure() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);

    const currentMonthEl = document.getElementById('currentMonth');
    const dayCountEl = document.getElementById('dayCount');
    if (currentMonthEl) currentMonthEl.textContent = `${monthNames[month]} ${year}`;
    if (dayCountEl) dayCountEl.textContent = `${daysInMonth} hari`;

    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    deselectAllRows();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const row = document.createElement('tr');
        row.dataset.rowindex = day - 1;
        if (isWeekend(date)) row.classList.add('weekend');

        row.innerHTML = `
            <td class="number-cell">${day}</td>
            <td class="date-cell"><div class="date-cell-inner"><span class="date-text">${formatDate(date)}</span>${renderNoteButton(day - 1)}</div></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="0"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="1"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="2"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="3"></td>
            <td><input type="text" readonly data-row="${day - 1}" data-input="4"></td>
            <td class="achm-td" data-row="${day - 1}" data-value="0"></td>
            <td class="growth-td" data-row="${day - 1}" data-type="spd"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="7"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="8"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="9"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="10"></td>
            <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="11"></td>
            <td class="growth-td" data-row="${day - 1}" data-type="std"></td>
            <td><input type="text" readonly data-row="${day - 1}" data-input="13"></td>
            <td class="growth-td" data-row="${day - 1}" data-type="apc"></td>
        `;
        tbody.appendChild(row);

        row.cells[0].onclick = () => selectRow(day - 1);
        row.cells[1].onclick = () => selectRow(day - 1);

        const inputs = row.getElementsByTagName('input');
        setupInputEventListeners(inputs, day - 1, daysInMonth);
    }

    addSummaryRow();
}


function setupInputEventListeners(inputs, rowIndex, totalDays) {
    // Shift inputs (0, 1) dan struk inputs (5, 6) - manual input
    // Mapping: 0=salesS1, 1=salesS2, 2=total, 3=akm, 4=spd, 5=st1, 6=st2, 7=totalSt, 8=akmSt, 9=std, 10=apc
    [0, 1, 5, 6].forEach(index => {
        const input = inputs[index];
        setupEnterNavigation(input, rowIndex, index, totalDays);
        input.addEventListener('input', function () {
            formatInputValue(this);
            // Auto update totals for shift inputs
            if (index === 0 || index === 1) {
                const totalInput = inputs[2];
                delete totalInput.dataset.manual;
                totalInput.classList.remove('manual-override');
            } else if (index === 5 || index === 6) {
                const totalInput = inputs[7];
                delete totalInput.dataset.manual;
                totalInput.classList.remove('manual-override');
            }

            handleRowChange(rowIndex);
            setDirty(true);
        });
        if (index === 0 || index === 1) {
            input.addEventListener('blur', function () { checkUnreasonableValue(this); });
        }
    });

    // Total & AKM inputs (2, 3, 7, 8)
    [2, 7, 3, 8].forEach(index => {
        const input = inputs[index];
        if (index === 2 || index === 7) {
            setupTotalEnterJump(input, rowIndex, index, totalDays);
        }
        input.addEventListener('input', function () {
            formatInputValue(this);
            const hasValue = this.value.trim() !== '';
            this.dataset.manual = hasValue ? 'true' : 'false';
            this.classList.toggle('manual-override', hasValue);

            if ((index === 2 || index === 7) && hasValue) {
                const totalVal = parseNumber(this.value);
                const half = Math.floor(totalVal / 2);
                const remainder = totalVal - half;
                if (index === 2) {
                    inputs[0].value = formatNumber(half);
                    inputs[1].value = formatNumber(remainder);
                } else {
                    inputs[5].value = formatNumber(half);
                    inputs[6].value = formatNumber(remainder);
                }
            }
            handleRowChange(rowIndex);
            setDirty(true);
        });
    });
}

function setupEnterNavigation(input, rowIndex, inputIndex, totalRows) {
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const rows = document.getElementById('tableBody').rows;
            const navOrder = [0, 1, 5, 6];
            const currentPos = navOrder.indexOf(inputIndex);
            let nextInput = null;

            if (currentPos !== -1 && currentPos < navOrder.length - 1) {
                nextInput = rows[rowIndex].getElementsByTagName('input')[navOrder[currentPos + 1]];
            } else if (rowIndex + 1 < totalRows) {
                nextInput = rows[rowIndex + 1].getElementsByTagName('input')[navOrder[0]];
            }
            if (nextInput && !nextInput.hasAttribute('readonly')) {
                nextInput.focus();
                nextInput.select();
            }
        }
    });
}

function setupTotalEnterJump(input, rowIndex, inputIndex, totalRows) {
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (rowIndex + 1 < totalRows) {
                const nextInput = document.getElementById('tableBody').rows[rowIndex + 1].getElementsByTagName('input')[inputIndex];
                if (nextInput && !nextInput.hasAttribute('readonly')) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        }
    });
}

function checkUnreasonableValue(inputElement) {
    const value = parseNumber(inputElement.value);
    if (value === 0) return;
    if (value < 1000000 || value > 10000000) {
        if (!confirm(`Angka yang kamu input (${inputElement.value}) tampaknya tidak wajar. Yakin data sudah benar?`)) {
            setTimeout(() => { inputElement.focus(); inputElement.select(); }, 0);
        }
    }
}

// =====================================================
// POPULATE TABLE DATA
// =====================================================
function populateTableData(data) {
    if (!data || !Array.isArray(data)) return;

    const rows = document.getElementById('tableBody').rows;

    for (let i = 0; i < data.length && i < rows.length - 1; i++) {
        const d = data[i];
        if (!d) continue;

        const inputs = rows[i].getElementsByTagName('input');

        inputs[0].value = formatNumber(d.s1);
        inputs[1].value = formatNumber(d.s2);
        inputs[5].value = formatNumber(d.st1);
        inputs[6].value = formatNumber(d.st2);

        inputs[2].value = formatNumber(d.totalNet);
        inputs[3].value = formatNumber(d.akmSales);
        inputs[4].value = formatNumber(d.spd);
        inputs[7].value = formatNumber(d.totalStruk);
        inputs[8].value = formatNumber(d.akmStruk);
        inputs[9].value = formatNumber(d.std);
        inputs[10].value = formatNumber(d.apc);

        // ACHM disimpan sebagai data attribute, akan dirender ulang saat calculateRow
        const achmTd = rows[i].querySelector('.achm-td');
        if (achmTd && d.achm) achmTd.dataset.value = d.achm;

        if (d.m_total) {
            inputs[2].dataset.manual = 'true';
            inputs[2].classList.add('manual-override');
        }
        if (d.m_akmS) {
            inputs[3].dataset.manual = 'true';
            inputs[3].classList.add('manual-override');
        }
        if (d.m_totalSt) {
            inputs[7].dataset.manual = 'true';
            inputs[7].classList.add('manual-override');
        }
        if (d.m_akmSt) {
            inputs[8].dataset.manual = 'true';
            inputs[8].classList.add('manual-override');
        }
    }
}

// =====================================================
// ROW CALCULATIONS
// =====================================================
function handleRowChange(startRowIndex) {
    const totalRows = document.getElementById('tableBody').rows.length - 1;
    for (let i = startRowIndex; i < totalRows; i++) {
        calculateRow(i);
    }
    updateSummary();
}

function calculateAllRows() {
    const rows = document.getElementById('tableBody').rows;
    for (let i = 0; i < rows.length - 1; i++) {
        calculateRow(i);
    }
}

function calculateRow(rowIndex) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const rows = document.getElementById('tableBody').rows;
    const row = rows[rowIndex];
    if (!row || row.classList.contains('summary')) return;

    const inputs = row.getElementsByTagName('input');

    const penjualanShift1 = parseNumber(inputs[0].value);
    const penjualanShift2 = parseNumber(inputs[1].value);

    if (inputs[2].dataset.manual !== 'true') {
        inputs[2].value = formatNumber(penjualanShift1 + penjualanShift2);
    }
    const totalPenjualan = parseNumber(inputs[2].value);

    if (inputs[3].dataset.manual !== 'true') {
        const prevAkm = rowIndex > 0 ? parseNumber(rows[rowIndex - 1].getElementsByTagName('input')[3].value) : 0;
        inputs[3].value = formatNumber(totalPenjualan + prevAkm);
    }
    const akmSales = parseNumber(inputs[3].value);
    const spd = akmSales / (rowIndex + 1);
    inputs[4].value = formatNumber(spd);

    // Hitung ACHM otomatis: (SPD / Target SPD) * 100
    const achmTd = row.querySelector('.achm-td');
    if (currentMonthTarget.targetSpd > 0 && spd > 0) {
        const achm = (spd / currentMonthTarget.targetSpd) * 100;
        if (achmTd) {
            achmTd.dataset.value = achm;
            achmTd.innerHTML = renderAchmCell(achm);
        }
    } else {
        if (achmTd) {
            achmTd.dataset.value = 0;
            achmTd.innerHTML = '';
        }
    }

    const strukShift1 = parseNumber(inputs[5].value);
    const strukShift2 = parseNumber(inputs[6].value);

    if (inputs[7].dataset.manual !== 'true') {
        inputs[7].value = formatNumber(strukShift1 + strukShift2);
    }
    const totalStruk = parseNumber(inputs[7].value);

    if (inputs[8].dataset.manual !== 'true') {
        const prevAkm = rowIndex > 0 ? parseNumber(rows[rowIndex - 1].getElementsByTagName('input')[8].value) : 0;
        inputs[8].value = formatNumber(totalStruk + prevAkm);
    }
    const akmStruk = parseNumber(inputs[8].value);
    const std = akmStruk / (rowIndex + 1);
    inputs[9].value = formatNumber(Math.floor(std));

    const apc = (spd > 0 && std > 0) ? (spd / std) : 0;
    inputs[10].value = formatNumber(apc);

    // Growth cells - ambil elemen div bukan input
    const growthSpdTd = row.querySelector('.growth-td[data-type="spd"]');
    const growthStdTd = row.querySelector('.growth-td[data-type="std"]');
    const growthApcTd = row.querySelector('.growth-td[data-type="apc"]');

    if (growthSpdTd) growthSpdTd.innerHTML = '';
    if (growthStdTd) growthStdTd.innerHTML = '';
    if (growthApcTd) growthApcTd.innerHTML = '';

    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;

    const cachedPrevMonth = DataCache.get(prevYear, prevMonth);

    if (cachedPrevMonth && cachedPrevMonth.data && cachedPrevMonth.data[rowIndex]) {
        const prevDayData = cachedPrevMonth.data[rowIndex];
        const prevSpd = prevDayData.spd || 0;
        const prevStd = prevDayData.std || 0;
        const prevApc = prevDayData.apc || 0;

        if (spd > 0 && prevSpd > 0) {
            const growth = ((spd / prevSpd) - 1) * 100;
            if (growthSpdTd) growthSpdTd.innerHTML = renderGrowthBadge(growth);
        }

        if (std > 0 && prevStd > 0) {
            const growth = ((std / prevStd) - 1) * 100;
            if (growthStdTd) growthStdTd.innerHTML = renderGrowthBadge(growth);
        }

        if (apc > 0 && prevApc > 0) {
            const growth = ((apc / prevApc) - 1) * 100;
            if (growthApcTd) growthApcTd.innerHTML = renderGrowthBadge(growth);
        }
    }
}

function addSummaryRow() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const row = tbody.insertRow();
    row.className = 'summary';
    row.innerHTML = `
        <td colspan="2">TOTAL / RATA-RATA</td>
        <td id="sumShift1Penjualan">-</td>
        <td id="sumShift2Penjualan">-</td>
        <td id="totalPenjualan">-</td>
        <td>-</td><td>-</td><td>-</td><td>-</td>
        <td id="sumShift1Struk">-</td>
        <td id="sumShift2Struk">-</td>
        <td id="totalStruk">-</td>
        <td>-</td><td>-</td><td>-</td>
        <td id="avgAPC">-</td>
        <td>-</td>
    `;
}

function updateSummary() {
    const rows = document.getElementById('tableBody').rows;
    let sumS1P = 0, sumS2P = 0, sumS1S = 0, sumS2S = 0, totalA = 0, countA = 0;

    for (let i = 0; i < rows.length - 1; i++) {
        const inputs = rows[i].getElementsByTagName('input');
        // Setelah ACHM dan Growth jadi div, indexnya:
        // 0=salesS1, 1=salesS2, 2=total, 3=akm, 4=spd, 5=st1, 6=st2, 7=totalSt, 8=akmSt, 9=std, 10=apc
        sumS1P += parseNumber(inputs[0].value);
        sumS2P += parseNumber(inputs[1].value);
        sumS1S += parseNumber(inputs[5].value);
        sumS2S += parseNumber(inputs[6].value);
        const apc = parseNumber(inputs[10].value);
        if (apc > 0) { totalA += apc; countA++; }
    }

    const el1 = document.getElementById('sumShift1Penjualan');
    const el2 = document.getElementById('sumShift2Penjualan');
    const el3 = document.getElementById('totalPenjualan');
    const el4 = document.getElementById('sumShift1Struk');
    const el5 = document.getElementById('sumShift2Struk');
    const el6 = document.getElementById('totalStruk');
    const el7 = document.getElementById('avgAPC');

    if (el1) el1.textContent = formatNumber(sumS1P) || '-';
    if (el2) el2.textContent = formatNumber(sumS2P) || '-';
    if (el3) el3.textContent = formatNumber(sumS1P + sumS2P) || '-';
    if (el4) el4.textContent = formatNumber(sumS1S) || '-';
    if (el5) el5.textContent = formatNumber(sumS2S) || '-';
    if (el6) el6.textContent = formatNumber(sumS1S + sumS2S) || '-';
    if (el7) el7.textContent = countA > 0 ? formatNumber(totalA / countA) : '-';
}

// =====================================================
// SAVE DATA
// =====================================================
async function manualSave() {
    // function manualSave() {
    // if (!isDataLoaded) { ... } -> DIHAPUS agar tidak memblokir simpan data


    const data = collectTableData();
    const hasData = data.some(row => row.s1 > 0 || row.s2 > 0 || row.st1 > 0 || row.st2 > 0);
    if (!hasData) {
        if (!confirm('Semua data kosong. Yakin ingin menyimpan data kosong?')) {
            return;
        }
    }

    if (!auth.currentUser) {
        showMessage('Login dulu untuk menyimpan!');
        return;
    }

    showLoading('Menyimpan data...');

    try {
        await saveDataToServer();
        setDirty(false);
        showMessage('Data tersimpan ke server');
        updateCacheStatus('synced');
    } catch (error) {
        console.error('Save error:', error);
        showMessage('Gagal simpan: ' + error.message);
        updateCacheStatus('error');
    } finally {
        hideLoading();
    }
}

async function saveDataToServer() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const docId = `salesData_${year}_${month}`;
    const data = collectTableData();
    const notes = DailyNotes.toObject();

    await db.collection("salesReports").doc(docId).set({
        data: data,
        notes: notes,
        timestamp: new Date()
    });

    // Simpan notes ke cache
    DataCache._notesCache = DataCache._notesCache || {};
    DataCache._notesCache[DataCache._key(year, month)] = notes;

    DataCache.set(year, month, data);
}

function collectTableData() {
    const data = [];
    const rows = document.getElementById('tableBody').rows;

    for (let i = 0; i < rows.length - 1; i++) {
        const inputs = rows[i].getElementsByTagName('input');
        data.push({
            s1: parseNumber(inputs[0].value) || 0,
            s2: parseNumber(inputs[1].value) || 0,
            st1: parseNumber(inputs[5].value) || 0,
            st2: parseNumber(inputs[6].value) || 0,
            totalNet: parseNumber(inputs[2].value) || 0,
            akmSales: parseNumber(inputs[3].value) || 0,
            spd: parseNumber(inputs[4].value) || 0,
            achm: parseFloat(rows[i].querySelector('.achm-td')?.dataset.value) || 0,
            totalStruk: parseNumber(inputs[7].value) || 0,
            akmStruk: parseNumber(inputs[8].value) || 0,
            std: parseNumber(inputs[9].value) || 0,
            apc: parseNumber(inputs[10].value) || 0,
            m_total: inputs[2].dataset.manual === 'true',
            m_akmS: inputs[3].dataset.manual === 'true',
            m_totalSt: inputs[7].dataset.manual === 'true',
            m_akmSt: inputs[8].dataset.manual === 'true'
        });
    }
    return data;
}

// =====================================================
// DELETE DATA
// =====================================================
async function clearCurrentMonthData() {
    if (!confirm('Yakin ingin hapus semua data bulan ini? Tindakan ini tidak dapat diurungkan.')) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const docId = `salesData_${year}_${month}`;

    showLoading('Menghapus data...');

    try {
        await db.collection("salesReports").doc(docId).delete();
        DataCache.invalidate(year, month);
        setDirty(false);
        await initializeMonth();
        showMessage('Data berhasil dihapus');
        toggleSettingsModal();
    } catch (e) {
        console.error('Delete error:', e);
        showMessage('Gagal hapus: ' + e.message);
    } finally {
        hideLoading();
    }
}

// =====================================================
// EXPORT DATA
// =====================================================
function exportCurrentMonth() {
    const rows = document.getElementById('tableBody').rows;
    const data = [];

    for (let i = 0; i < rows.length - 1; i++) {
        const cells = rows[i].getElementsByTagName('td');
        const inputs = rows[i].getElementsByTagName('input');

        if (!inputs[2] || inputs[2].value.trim() === '' || !inputs[7] || inputs[7].value.trim() === '') continue;

        data.push({
            no: i + 1,
            tanggal: cells[1].textContent,
            s1: parseNumber(inputs[0].value) || 0,
            s2: parseNumber(inputs[1].value) || 0,
            totalNet: parseNumber(inputs[2].value) || 0,
            akmNet: parseNumber(inputs[3].value) || 0,
            achm: parseFloat(rows[i].querySelector('.achm-td')?.dataset.value) || 0,
            st1: parseNumber(inputs[5].value) || 0,
            st2: parseNumber(inputs[6].value) || 0,
            totalStruk: parseNumber(inputs[7].value) || 0,
            akmStruk: parseNumber(inputs[8].value) || 0
        });
    }

    const textarea = document.getElementById('exportTextArea');
    if (textarea) textarea.value = JSON.stringify(data, null, 2);
    toggleSettingsModal();
    toggleExportModal();
    showMessage('Data siap untuk disalin');
}

async function exportAllData() {
    showLoading('Mengambil semua data...');

    try {
        const snapshot = await db.collection("salesReports").get();
        const allData = [];

        for (const doc of snapshot.docs) {
            const parts = doc.id.split('_');
            if (parts.length !== 3 || parts[0] !== 'salesData') continue;

            const year = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10);
            const monthData = doc.data().data || [];

            let akmNet = 0, akmStruk = 0;

            for (let rowIndex = 0; rowIndex < monthData.length; rowIndex++) {
                const row = monthData[rowIndex] || {};
                let totalNet = row.totalNet || (row.s1 + row.s2) || 0;
                let totalStruk = row.totalStruk || (row.st1 + row.st2) || 0;

                if (!totalNet || !totalStruk) continue;

                akmNet += totalNet;
                akmStruk += totalStruk;

                const dateObj = new Date(year, month, rowIndex + 1);
                const tanggalStr = dateObj.toLocaleDateString('id-ID', {
                    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
                });

                allData.push({
                    no: 0,
                    tanggal: tanggalStr,
                    s1: row.s1 || 0,
                    s2: row.s2 || 0,
                    totalNet: totalNet,
                    akmNet: akmNet,
                    achm: row.achm || 0,
                    st1: row.st1 || 0,
                    st2: row.st2 || 0,
                    totalStruk: totalStruk,
                    akmStruk: akmStruk
                });
            }
        }

        allData.sort((a, b) => {
            const extractDate = (str) => {
                const parts = str.split(', ');
                const datePart = parts[1] || parts[0];
                const [day, month, year] = datePart.split('/').map(Number);
                return new Date(year, month - 1, day);
            };
            return extractDate(a.tanggal) - extractDate(b.tanggal);
        });

        allData.forEach((obj, index) => { obj.no = index + 1; });

        const textarea = document.getElementById('exportTextArea');
        if (textarea) textarea.value = JSON.stringify(allData, null, 2);
        toggleSettingsModal();
        toggleExportModal();
        showMessage('Data semua bulan siap untuk disalin');
    } catch (e) {
        console.error('Export all error:', e);
        showMessage('Gagal export: ' + e.message);
    } finally {
        hideLoading();
    }
}

// =====================================================
// IMPORT DATA
// =====================================================
async function handleImport() {
    const textarea = document.getElementById('importTextArea');
    const rawText = textarea ? textarea.value : '';

    if (!rawText || !rawText.trim()) {
        showMessage('Kolom import kosong');
        return;
    }

    if (!confirm('Mengimpor data akan menimpa semua data bulan ini. Lanjutkan?')) return;

    try {
        const parsed = JSON.parse(rawText);
        if (!Array.isArray(parsed)) throw new Error('Format bukan array');

        const tableRows = document.getElementById('tableBody').rows;
        const dateIndexMap = {};

        for (let i = 0; i < tableRows.length - 1; i++) {
            const cells = tableRows[i].getElementsByTagName('td');
            if (cells && cells[1]) {
                dateIndexMap[cells[1].textContent.trim()] = i;
            }
        }

        parsed.forEach(rowData => {
            const targetIndex = dateIndexMap[rowData.tanggal];
            if (targetIndex === undefined) return;

            const inputs = tableRows[targetIndex].getElementsByTagName('input');

            inputs[0].value = formatNumber(parseFloat(rowData.s1) || 0);
            inputs[1].value = formatNumber(parseFloat(rowData.s2) || 0);

            const sumNet = (parseFloat(rowData.s1) || 0) + (parseFloat(rowData.s2) || 0);
            const totalNetVal = parseFloat(rowData.totalNet) || 0;
            inputs[2].value = formatNumber(totalNetVal);

            if (totalNetVal !== 0 && Math.round(totalNetVal) !== Math.round(sumNet)) {
                inputs[2].dataset.manual = 'true';
                inputs[2].classList.add('manual-override');
            } else {
                delete inputs[2].dataset.manual;
                inputs[2].classList.remove('manual-override');
            }

            delete inputs[3].dataset.manual;
            inputs[3].classList.remove('manual-override');

            // ACHM disimpan di data-value pada achm-td, bukan input
            const achmTd = tableRows[targetIndex].querySelector('.achm-td');
            if (achmTd) achmTd.dataset.value = parseFloat(rowData.achm) || 0;

            inputs[5].value = formatNumber(parseFloat(rowData.st1) || 0);
            inputs[6].value = formatNumber(parseFloat(rowData.st2) || 0);

            const sumStruk = (parseFloat(rowData.st1) || 0) + (parseFloat(rowData.st2) || 0);
            const totalStrukVal = parseFloat(rowData.totalStruk) || 0;
            inputs[7].value = formatNumber(totalStrukVal);

            if (totalStrukVal !== 0 && Math.round(totalStrukVal) !== Math.round(sumStruk)) {
                inputs[7].dataset.manual = 'true';
                inputs[7].classList.add('manual-override');
            } else {
                delete inputs[7].dataset.manual;
                inputs[7].classList.remove('manual-override');
            }

            delete inputs[8].dataset.manual;
            inputs[8].classList.remove('manual-override');
        });

        calculateAllRows();
        updateSummary();
        setDirty(true);

        if (textarea) textarea.value = '';
        showMessage('Data berhasil di-import');
        toggleImportModal();
        toggleSettingsModal();
    } catch (e) {
        console.error('Import error:', e);
        showMessage('Gagal import: Format teks tidak valid');
    }
}

// =====================================================
// COPY REPORT
// =====================================================
function getReportData(rowIndex) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const rows = document.getElementById('tableBody').rows;
    if (!rows[rowIndex]) return null;

    const formatReportNumber = (num) => Math.round(num).toLocaleString('id-ID');
    const formatGrowthForReport = (val) => {
        if (!val) return '';
        const num = parseFloat(val.replace('%', ''));
        return (num > 0 ? '+' : '') + num.toFixed(1) + '%';
    };

    const currentInputs = rows[rowIndex].getElementsByTagName('input');
    // Mapping input setelah ACHM/Growth jadi div:
    // 0=salesS1, 1=salesS2, 2=totalNet, 3=akmSales, 4=spd,
    // 5=strukS1(st1), 6=strukS2(st2), 7=totalStruk, 8=akmStruk, 9=std, 10=apc
    const achmTd = rows[rowIndex].querySelector('.achm-td');
    const growthSpdTd = rows[rowIndex].querySelector('.growth-td[data-type="spd"]');
    const growthStdTd = rows[rowIndex].querySelector('.growth-td[data-type="std"]');
    const growthApcTd = rows[rowIndex].querySelector('.growth-td[data-type="apc"]');

    // Helper: ambil teks dari growth badge
    const getGrowthText = (td) => {
        if (!td) return '';
        const badge = td.querySelector('.growth-badge');
        return badge ? badge.textContent.trim() : '';
    };

    const dataNow = {
        tglSales: rows[rowIndex].cells[1].textContent.split(', ')[1],
        salesS1: formatReportNumber(parseNumber(currentInputs[0].value)),
        salesS2: formatReportNumber(parseNumber(currentInputs[1].value)),
        totalNet: formatReportNumber(parseNumber(currentInputs[2].value)),
        akmSales: formatReportNumber(parseNumber(currentInputs[3].value)),
        spd: formatReportNumber(parseNumber(currentInputs[4].value)),
        growthSpd: formatGrowthForReport(getGrowthText(growthSpdTd)),
        strukS1: formatReportNumber(parseNumber(currentInputs[5].value)),
        strukS2: formatReportNumber(parseNumber(currentInputs[6].value)),
        totalStruk: formatReportNumber(parseNumber(currentInputs[7].value)),
        akmStruk: formatReportNumber(parseNumber(currentInputs[8].value)),
        std: formatReportNumber(parseNumber(currentInputs[9].value)),
        growthStd: formatGrowthForReport(getGrowthText(growthStdTd)),
        apc: formatReportNumber(parseNumber(currentInputs[10].value)),
        growthApc: formatGrowthForReport(getGrowthText(growthApcTd)),
        catatan: DailyNotes.get(rowIndex) || ''
    };

    let dataPrev = {
        prev_totalNet: '0', prev_totalStruk: '0',
        prev_spd: '0', prev_std: '0', prev_apc: '0'
    };

    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const cachedPrevMonth = DataCache.get(prevYear, prevMonth);

    if (cachedPrevMonth && cachedPrevMonth.data && cachedPrevMonth.data[rowIndex]) {
        const prevDayData = cachedPrevMonth.data[rowIndex];
        dataPrev.prev_totalNet = formatReportNumber(prevDayData.totalNet);
        dataPrev.prev_totalStruk = formatReportNumber(prevDayData.totalStruk);
        dataPrev.prev_spd = formatReportNumber(prevDayData.spd);
        dataPrev.prev_std = formatReportNumber(Math.floor(prevDayData.std));
        dataPrev.prev_apc = formatReportNumber(prevDayData.apc);
    }

    return { ...dataNow, ...dataPrev };
}

function handleCopyReport(rowIndex) {
    const reportData = getReportData(rowIndex);
    if (!reportData) {
        showMessage('Data tidak ditemukan untuk disalin.');
        return;
    }

    let template = localStorage.getItem('reportTemplate') || DEFAULT_REPORT_TEMPLATE;
    let reportText = template.replace(/\{(\w+)\}/g, (match, key) => reportData[key] || '0');

    navigator.clipboard.writeText(reportText)
        .then(() => {
            showMessage('Laporan berhasil disalin!');
            deselectAllRows();
        })
        .catch(err => showMessage('Gagal menyalin laporan.'));
}

function copyReport() {
    let indexToCopy;
    if (selectedRowIndex !== null) {
        indexToCopy = selectedRowIndex;
    } else {
        const today = new Date();
        if (currentDate.getFullYear() !== today.getFullYear() || currentDate.getMonth() !== today.getMonth()) {
            showMessage('Pilih tanggal dulu, atau pindah ke bulan ini.');
            return;
        }
        indexToCopy = today.getDate() - 1;
    }
    handleCopyReport(indexToCopy);
}
