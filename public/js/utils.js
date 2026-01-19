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
