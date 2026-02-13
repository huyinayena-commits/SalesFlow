// =====================================================
// UTILS.JS - FUNGSI UTILITAS
// =====================================================

// =====================================================
// DATE UTILITIES
// =====================================================
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDate(date) {
    const day = dayNames[date.getDay()];
    const dateNum = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}, ${dateNum}/${month}/${year}`;
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

// =====================================================
// NUMBER FORMATTING
// =====================================================
function formatNumber(num) {
    if (!num || num === 0) return '';
    return Math.round(num).toLocaleString('en-US');
}

function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.toString().replace(/,/g, '')) || 0;
}

function formatInputValue(input) {
    let cursorPos = input.selectionStart;
    let oldLength = input.value.length;
    let numericValue = input.value.replace(/[^\d]/g, '');
    if (numericValue === '') { input.value = ''; return; }
    let formattedValue = parseInt(numericValue).toLocaleString('en-US');
    input.value = formattedValue;
    let newLength = formattedValue.length;
    input.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
}

function formatGrowth(growth) {
    if (isNaN(growth) || !isFinite(growth)) return '';
    return growth.toFixed(2) + '%';
}

function applyGrowthColor(input, value) {
    input.classList.remove('growth-positive', 'growth-negative');
    if (value > 0) input.classList.add('growth-positive');
    else if (value < 0) input.classList.add('growth-negative');
}

// Render ACHM sebagai progress bar mini
function renderAchmCell(value) {
    if (!value || value === 0) return '';
    // Tentukan level warna berdasarkan persentase
    let levelClass = 'achm-low';
    if (value >= 100) levelClass = 'achm-exceed';
    else if (value >= 80) levelClass = 'achm-high';
    else if (value >= 50) levelClass = 'achm-mid';

    // Bar width clamp max 100%
    const barWidth = Math.min(value, 100);

    return `<div class="achm-cell ${levelClass}">
        <span class="achm-text">${value.toFixed(1)}%</span>
        <div class="achm-bar-track">
            <div class="achm-bar-fill" style="width:${barWidth}%"></div>
        </div>
    </div>`;
}

// Render Growth sebagai pill badge dengan panah
function renderGrowthBadge(value) {
    if (isNaN(value) || !isFinite(value)) return '';
    const text = value.toFixed(2) + '%';
    let badgeClass, arrow;

    if (value > 0) {
        badgeClass = 'growth-pos';
        // Panah atas SVG
        arrow = '<svg class="growth-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    } else if (value < 0) {
        badgeClass = 'growth-neg';
        // Panah bawah SVG
        arrow = '<svg class="growth-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    } else {
        badgeClass = 'growth-zero';
        arrow = '';
    }

    return `<span class="growth-badge ${badgeClass}">${arrow}${text}</span>`;
}
