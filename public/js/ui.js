// =====================================================
// UI.JS - MANIPULASI UI
// =====================================================

// =====================================================
// LOADING & STATUS
// =====================================================
function showLoading(text = 'Memuat data...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('show');
    setNavigationEnabled(false);
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = true;
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
    setNavigationEnabled(true);
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = false;
}

function setNavigationEnabled(enabled) {
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    if (btnPrev) btnPrev.disabled = !enabled;
    if (btnNext) btnNext.disabled = !enabled;
}

function updateCacheStatus(status) {
    const el = document.getElementById('cacheStatus');
    if (!el) return;
    el.className = 'cache-status ' + status;
    el.title = status === 'synced' ? 'Data tersinkronisasi' :
        status === 'pending' ? 'Menunggu sinkronisasi' :
            status === 'error' ? 'Error sinkronisasi' : 'Status tidak diketahui';
}

function showMessage(text) {
    const existingMsg = document.querySelector('.status-message');
    if (existingMsg) existingMsg.remove();

    const msg = document.createElement('div');
    msg.className = 'status-message';
    msg.textContent = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2500);
}

// =====================================================
// DIRTY STATE MANAGEMENT
// =====================================================
function setDirty(dirty) {
    isDirty = dirty;
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn) return;

    if (isDirty) {
        saveBtn.classList.add('unsaved');
        saveBtn.title = 'Ada perubahan belum disimpan! Klik untuk simpan.';
    } else {
        saveBtn.classList.remove('unsaved');
        saveBtn.title = 'Simpan Data';
    }
}

// =====================================================
// THEME MANAGEMENT
// =====================================================
function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeButton();
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    updateThemeButton();
    showMessage('Tema berhasil diubah');
}

function updateThemeButton() {
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    if (!icon || !text) return;

    if (currentTheme === 'dark') {
        icon.textContent = String.fromCodePoint(0x2600, 0xFE0F); // Sun emoji
        text.textContent = 'Light';
    } else {
        icon.textContent = String.fromCodePoint(0x1F319); // Moon emoji
        text.textContent = 'Dark';
    }
}

// =====================================================
// MODAL FUNCTIONS
// =====================================================
function toggleSettingsModal() {
    document.getElementById('settingsModal').classList.toggle('show');
}

function toggleExportModal() {
    document.getElementById('exportModal').classList.toggle('show');
}

function toggleImportModal() {
    document.getElementById('importModal').classList.toggle('show');
}

function copyExportText() {
    const text = document.getElementById('exportTextArea').value;
    navigator.clipboard.writeText(text)
        .then(() => showMessage('Teks berhasil disalin'))
        .catch(() => showMessage('Gagal menyalin teks'));
}

// =====================================================
// SCROLL FUNCTIONS
// =====================================================
function scrollToToday(force = false) {
    const today = new Date();
    if (currentDate.getFullYear() === today.getFullYear() && currentDate.getMonth() === today.getMonth()) {
        const todayRow = document.querySelector(`tr[data-rowindex="${today.getDate() - 1}"]`);
        if (todayRow) {
            const tableWrapper = document.getElementById('tableWrapper');
            if (force || tableWrapper.scrollTop === 0) {
                todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                todayRow.classList.add('highlight-today');
                setTimeout(() => todayRow.classList.remove('highlight-today'), 2000);
            }
        }
    }
}

// =====================================================
// ROW SELECTION
// =====================================================
function selectRow(rowIndex) {
    deselectAllRows();
    const row = document.querySelector(`tr[data-rowindex="${rowIndex}"]`);
    if (row) {
        row.classList.add('selected-row');
        selectedRowIndex = rowIndex;
        const dateText = row.cells[1].textContent.split(', ')[1];
        const copyBtn = document.getElementById('copyReportBtn');
        if (copyBtn) copyBtn.title = `Salin Laporan untuk ${dateText}`;
    }
}

function deselectAllRows() {
    const currentlySelected = document.querySelector('.selected-row');
    if (currentlySelected) currentlySelected.classList.remove('selected-row');
    selectedRowIndex = null;
    const copyBtn = document.getElementById('copyReportBtn');
    if (copyBtn) copyBtn.title = 'Salin Laporan (Pilih tanggal dulu)';
}

// =====================================================
// TEMPLATE EDITOR
// =====================================================
function toggleTemplateEditor() {
    const modal = document.getElementById('templateEditorModal');
    if (!modal.classList.contains('show')) loadTemplate();
    modal.classList.toggle('show');
    toggleSettingsModal();
}

function loadTemplate() {
    const textarea = document.getElementById('reportTemplateTextarea');
    if (textarea) {
        textarea.value = localStorage.getItem('reportTemplate') || DEFAULT_REPORT_TEMPLATE;
    }

    const tagsContainer = document.querySelector('.placeholder-tags');
    if (!tagsContainer) return;

    tagsContainer.innerHTML = '';

    REPORT_PLACEHOLDERS.forEach(tag => {
        const span = document.createElement('span');
        span.textContent = `{${tag}}`;
        span.onclick = () => navigator.clipboard.writeText(`{${tag}}`)
            .then(() => showMessage(`Tag {${tag}} disalin`));
        tagsContainer.appendChild(span);
    });
}

function saveTemplate() {
    const textarea = document.getElementById('reportTemplateTextarea');
    if (textarea) {
        localStorage.setItem('reportTemplate', textarea.value);
    }
    showMessage('Template berhasil disimpan.');
    toggleTemplateEditor();
}

function resetTemplate() {
    if (confirm('Yakin ingin mengembalikan template ke default?')) {
        const textarea = document.getElementById('reportTemplateTextarea');
        if (textarea) {
            textarea.value = DEFAULT_REPORT_TEMPLATE;
        }
        saveTemplate();
    }
}

// =====================================================
// QUICK INPUT MODAL
// =====================================================
function openQuickInputModal() {
    const today = new Date();
    if (currentDate.getFullYear() !== today.getFullYear() || currentDate.getMonth() !== today.getMonth()) {
        if (!confirm("Mode input cepat hanya untuk hari ini. Pindah ke bulan ini?")) return;
        resetToCurrentMonth();
        return;
    }

    const modal = document.getElementById('quickInputModal');
    const body = document.getElementById('quickInputBody');
    const title = document.getElementById('quickInputTitle');
    if (title) title.textContent = `Input Cepat - ${formatDate(today).split(', ')[1]}`;

    const rowIndex = today.getDate() - 1;
    const row = document.getElementById('tableBody').rows[rowIndex];
    const inputs = row ? row.getElementsByTagName('input') : [{}, {}, {}, {}, {}, {}, {}, {}];

    const existingS1 = parseNumber(inputs[0]?.value || 0);
    const existingS2 = parseNumber(inputs[1]?.value || 0);
    const existingSt1 = parseNumber(inputs[6]?.value || 0);
    const existingSt2 = parseNumber(inputs[7]?.value || 0);

    body.innerHTML = `
        <div id="quickInputForm">
            <!-- Penjualan Shift 1 -->
            <div class="station-block">
                <div class="station-block-title">Penjualan Net (Shift 1)</div>
                <div class="station-inputs">
                    <div class="station-input-group">
                        <label>Station 1</label>
                        <input type="text" inputmode="decimal" id="salesS1Stat1" placeholder="0">
                    </div>
                    <div class="station-input-group">
                        <label>Station 2</label>
                        <input type="text" inputmode="decimal" id="salesS1Stat2" placeholder="0">
                    </div>
                </div>
                <div class="station-total" id="salesS1Total">Total: ${formatNumber(existingS1) || '0'}</div>
            </div>

            <!-- Penjualan Shift 2 -->
            <div class="station-block">
                <div class="station-block-title">Penjualan Net (Shift 2)</div>
                <div class="station-inputs">
                    <div class="station-input-group">
                        <label>Station 1</label>
                        <input type="text" inputmode="decimal" id="salesS2Stat1" placeholder="0">
                    </div>
                    <div class="station-input-group">
                        <label>Station 2</label>
                        <input type="text" inputmode="decimal" id="salesS2Stat2" placeholder="0">
                    </div>
                </div>
                <div class="station-total" id="salesS2Total">Total: ${formatNumber(existingS2) || '0'}</div>
            </div>

            <!-- Struk Shift 1 -->
            <div class="station-block">
                <div class="station-block-title">Struk (Shift 1)</div>
                <div class="station-inputs">
                    <div class="station-input-group">
                        <label>Station 1</label>
                        <input type="text" inputmode="decimal" id="strukS1Stat1" placeholder="0">
                    </div>
                    <div class="station-input-group">
                        <label>Station 2</label>
                        <input type="text" inputmode="decimal" id="strukS1Stat2" placeholder="0">
                    </div>
                </div>
                <div class="station-total" id="strukS1Total">Total: ${formatNumber(existingSt1) || '0'}</div>
            </div>

            <!-- Struk Shift 2 -->
            <div class="station-block">
                <div class="station-block-title">Struk (Shift 2)</div>
                <div class="station-inputs">
                    <div class="station-input-group">
                        <label>Station 1</label>
                        <input type="text" inputmode="decimal" id="strukS2Stat1" placeholder="0">
                    </div>
                    <div class="station-input-group">
                        <label>Station 2</label>
                        <input type="text" inputmode="decimal" id="strukS2Stat2" placeholder="0">
                    </div>
                </div>
                <div class="station-total" id="strukS2Total">Total: ${formatNumber(existingSt2) || '0'}</div>
            </div>

            <button id="quickSaveBtn" onclick="handleQuickSave()">Simpan Data</button>
        </div>
    `;

    // Setup input formatting and live calculation
    const stationInputs = [
        { stat1: 'salesS1Stat1', stat2: 'salesS1Stat2', total: 'salesS1Total' },
        { stat1: 'salesS2Stat1', stat2: 'salesS2Stat2', total: 'salesS2Total' },
        { stat1: 'strukS1Stat1', stat2: 'strukS1Stat2', total: 'strukS1Total' },
        { stat1: 'strukS2Stat1', stat2: 'strukS2Stat2', total: 'strukS2Total' }
    ];

    stationInputs.forEach(group => {
        const stat1Input = document.getElementById(group.stat1);
        const stat2Input = document.getElementById(group.stat2);
        const totalDisplay = document.getElementById(group.total);

        const updateTotal = () => {
            const val1 = parseNumber(stat1Input.value);
            const val2 = parseNumber(stat2Input.value);
            const total = val1 + val2;
            totalDisplay.textContent = `Total: ${formatNumber(total) || '0'}`;
        };

        stat1Input.addEventListener('input', function () {
            formatInputValue(this);
            updateTotal();
        });

        stat2Input.addEventListener('input', function () {
            formatInputValue(this);
            updateTotal();
        });
    });

    modal.classList.add('show');
    document.getElementById('salesS1Stat1').focus();
}

function closeQuickInputModal() {
    document.getElementById('quickInputModal').classList.remove('show');
}

function handleQuickSave() {
    const today = new Date();
    const rowIndex = today.getDate() - 1;
    const row = document.getElementById('tableBody').rows[rowIndex];
    if (!row) { showMessage('Terjadi kesalahan'); return; }

    const inputs = row.getElementsByTagName('input');

    // Calculate totals from station inputs
    const salesS1 = parseNumber(document.getElementById('salesS1Stat1').value) +
        parseNumber(document.getElementById('salesS1Stat2').value);
    const salesS2 = parseNumber(document.getElementById('salesS2Stat1').value) +
        parseNumber(document.getElementById('salesS2Stat2').value);
    const strukS1 = parseNumber(document.getElementById('strukS1Stat1').value) +
        parseNumber(document.getElementById('strukS1Stat2').value);
    const strukS2 = parseNumber(document.getElementById('strukS2Stat1').value) +
        parseNumber(document.getElementById('strukS2Stat2').value);

    // Only update if there's a value
    if (salesS1 > 0) inputs[0].value = formatNumber(salesS1);
    if (salesS2 > 0) inputs[1].value = formatNumber(salesS2);
    if (strukS1 > 0) inputs[6].value = formatNumber(strukS1);
    if (strukS2 > 0) inputs[7].value = formatNumber(strukS2);

    delete inputs[2].dataset.manual; inputs[2].classList.remove('manual-override');
    delete inputs[8].dataset.manual; inputs[8].classList.remove('manual-override');

    handleRowChange(rowIndex);
    setDirty(true);

    document.getElementById('quickInputBody').innerHTML = `
        <div class="post-save-actions">
            <h3>Data Berhasil Disimpan!</h3>
            <p style="color: var(--text-secondary); margin-bottom: 15px;">
                Penjualan S1: ${formatNumber(salesS1)}<br>
                Penjualan S2: ${formatNumber(salesS2)}<br>
                Struk S1: ${formatNumber(strukS1)}<br>
                Struk S2: ${formatNumber(strukS2)}
            </p>
            <div class="action-buttons">
                <button onclick="manualSave().then(() => handleCopyReport(${rowIndex}))">Simpan & Salin Laporan</button>
                <button onclick="handleCopyReport(${rowIndex})">Salin Laporan Saja</button>
                <button onclick="closeQuickInputModal()">Selesai</button>
            </div>
        </div>
    `;
}
