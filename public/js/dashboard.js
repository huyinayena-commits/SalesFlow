// =====================================================
// DASHBOARD.JS - DASHBOARD ANALITIK PENJUALAN
// =====================================================

// Simpan referensi instance Chart.js agar bisa di-destroy
let dashboardCharts = [];

// =====================================================
// BUKA / TUTUP DASHBOARD
// =====================================================
function openDashboard() {
    const overlay = document.getElementById('dashboardOverlay');
    if (!overlay) return;

    // Tampilkan overlay
    overlay.style.display = 'block';
    // Trigger reflow agar animasi jalan
    overlay.offsetHeight;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Render chart setelah modal terbuka penuh
    setTimeout(() => {
        renderDashboard();
    }, 100);
}

function closeDashboard() {
    const overlay = document.getElementById('dashboardOverlay');
    if (!overlay) return;

    overlay.classList.remove('active');
    document.body.style.overflow = '';

    // Bersihkan chart instance agar tidak memory leak
    destroyAllCharts();

    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

function destroyAllCharts() {
    dashboardCharts.forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    dashboardCharts = [];
}

// =====================================================
// AMBIL DATA DARI TABEL AKTIF
// =====================================================
function getDashboardData() {
    const rows = document.getElementById('tableBody')?.rows;
    if (!rows) return [];

    const data = [];
    for (let i = 0; i < rows.length - 1; i++) {
        const row = rows[i];
        if (row.classList.contains('summary')) continue;

        const inputs = row.getElementsByTagName('input');
        const dateCell = row.cells[1]?.textContent || '';

        // Ambil hari dan tanggal
        const dayLabel = dateCell.split(',')[0]?.trim() || `Hari ${i + 1}`;
        const dateLabel = dateCell.split(',')[1]?.trim() || '';

        data.push({
            day: i + 1,
            dayLabel: dayLabel,
            dateLabel: dateLabel,
            s1: parseNumber(inputs[0]?.value),
            s2: parseNumber(inputs[1]?.value),
            totalNet: parseNumber(inputs[2]?.value),
            akmSales: parseNumber(inputs[3]?.value),
            spd: parseNumber(inputs[4]?.value),
            st1: parseNumber(inputs[5]?.value),
            st2: parseNumber(inputs[6]?.value),
            totalStruk: parseNumber(inputs[7]?.value),
            akmStruk: parseNumber(inputs[8]?.value),
            std: parseNumber(inputs[9]?.value),
            apc: parseNumber(inputs[10]?.value)
        });
    }
    return data;
}

// =====================================================
// WARNA CHART BERDASARKAN TEMA
// =====================================================
function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        primary: isDark ? '#38bdf8' : '#6366f1',
        secondary: isDark ? '#34d399' : '#10b981',
        tertiary: isDark ? '#fbbf24' : '#f59e0b',
        quaternary: isDark ? '#f87171' : '#ef4444',
        text: isDark ? '#e6f1ff' : '#212529',
        textSecondary: isDark ? '#94a3b8' : '#6c757d',
        gridColor: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.06)',
        bgFill1: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(99, 102, 241, 0.12)',
        bgFill2: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(16, 185, 129, 0.12)',
    };
}

// =====================================================
// RENDER SELURUH DASHBOARD
// =====================================================
function renderDashboard() {
    destroyAllCharts();

    const data = getDashboardData();
    const monthLabel = document.getElementById('currentMonth')?.textContent || '';
    const dashMonthEl = document.getElementById('dashMonthLabel');
    if (dashMonthEl) dashMonthEl.textContent = monthLabel;

    // Filter data yang punya penjualan
    const filledData = data.filter(d => d.totalNet > 0);

    if (filledData.length === 0) {
        showDashboardEmpty();
        return;
    }

    // Sembunyikan empty state
    const emptyEl = document.getElementById('dashboardEmpty');
    const contentEl = document.getElementById('dashboardContent');
    if (emptyEl) emptyEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // Render KPI cards
    renderKPICards(filledData);

    // Render charts
    renderSalesTrendChart(filledData);
    renderShiftComparisonChart(filledData);
    renderShiftCompositionChart(filledData);
    renderAkmTrendChart(data);
}

function showDashboardEmpty() {
    const emptyEl = document.getElementById('dashboardEmpty');
    const contentEl = document.getElementById('dashboardContent');
    if (emptyEl) emptyEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';
}

// =====================================================
// KPI CARDS
// =====================================================
function renderKPICards(data) {
    // Total Penjualan bulan ini
    const totalSales = data.reduce((sum, d) => sum + d.totalNet, 0);

    // Rata-rata harian
    const avgDaily = data.length > 0 ? totalSales / data.length : 0;

    // Hari terbaik
    let bestDay = data[0] || {};
    data.forEach(d => {
        if (d.totalNet > bestDay.totalNet) bestDay = d;
    });

    // Pencapaian target
    const targetSpd = currentMonthTarget?.targetSpd || 0;
    const lastFilledSpd = data.length > 0 ? data[data.length - 1].spd : 0;
    const targetPercent = targetSpd > 0 ? ((lastFilledSpd / targetSpd) * 100).toFixed(1) : 0;

    // Update DOM
    const elTotal = document.getElementById('kpiTotalSales');
    const elAvg = document.getElementById('kpiAvgDaily');
    const elBest = document.getElementById('kpiBestDay');
    const elBestSub = document.getElementById('kpiBestDaySub');
    const elTarget = document.getElementById('kpiTarget');
    const elTargetSub = document.getElementById('kpiTargetSub');

    if (elTotal) elTotal.textContent = formatNumber(totalSales);
    if (elAvg) elAvg.textContent = formatNumber(Math.round(avgDaily));
    if (elBest) elBest.textContent = formatNumber(bestDay.totalNet);
    if (elBestSub) elBestSub.textContent = `Tanggal ${bestDay.day} (${bestDay.dayLabel})`;

    if (targetSpd > 0) {
        if (elTarget) elTarget.textContent = `${targetPercent}%`;
        if (elTargetSub) {
            elTargetSub.textContent = `SPD ${formatNumber(Math.round(lastFilledSpd))} / ${formatNumber(targetSpd)}`;
            elTargetSub.className = 'kpi-sub ' + (parseFloat(targetPercent) >= 100 ? 'positive' : 'negative');
        }
    } else {
        if (elTarget) elTarget.textContent = '-';
        if (elTargetSub) {
            elTargetSub.textContent = 'Target belum diisi';
            elTargetSub.className = 'kpi-sub';
        }
    }
}

// =====================================================
// LINE CHART - TREN PENJUALAN HARIAN
// =====================================================
function renderSalesTrendChart(data) {
    const ctx = document.getElementById('chartSalesTrend')?.getContext('2d');
    if (!ctx) return;

    const colors = getChartColors();
    const labels = data.map(d => `${d.day}`);
    const values = data.map(d => d.totalNet);

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Penjualan',
                data: values,
                borderColor: colors.primary,
                backgroundColor: colors.bgFill1,
                borderWidth: 2.5,
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointBackgroundColor: colors.primary,
                pointBorderColor: colors.primary,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.text === '#e6f1ff' ? '#1e293b' : '#fff',
                    titleColor: colors.text,
                    bodyColor: colors.text,
                    borderColor: colors.gridColor,
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function (ctx) {
                            return 'Rp ' + formatNumber(ctx.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: colors.gridColor },
                    ticks: { color: colors.textSecondary, font: { size: 11 } },
                    title: { display: true, text: 'Tanggal', color: colors.textSecondary, font: { size: 11 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textSecondary,
                        font: { size: 11 },
                        callback: function (value) {
                            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'jt';
                            if (value >= 1000) return (value / 1000).toFixed(0) + 'rb';
                            return value;
                        }
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
    dashboardCharts.push(chart);
}

// =====================================================
// BAR CHART - PERBANDINGAN SHIFT 1 VS SHIFT 2
// =====================================================
function renderShiftComparisonChart(data) {
    const ctx = document.getElementById('chartShiftComparison')?.getContext('2d');
    if (!ctx) return;

    const colors = getChartColors();
    const labels = data.map(d => `${d.day}`);

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Shift 1',
                    data: data.map(d => d.s1),
                    backgroundColor: colors.primary + 'cc',
                    borderRadius: 4,
                    borderSkipped: false,
                },
                {
                    label: 'Shift 2',
                    data: data.map(d => d.s2),
                    backgroundColor: colors.secondary + 'cc',
                    borderRadius: 4,
                    borderSkipped: false,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: colors.textSecondary, font: { size: 11 }, boxWidth: 12, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': Rp ' + formatNumber(ctx.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: colors.textSecondary, font: { size: 10 } },
                    title: { display: true, text: 'Tanggal', color: colors.textSecondary, font: { size: 11 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textSecondary,
                        font: { size: 11 },
                        callback: function (value) {
                            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'jt';
                            if (value >= 1000) return (value / 1000).toFixed(0) + 'rb';
                            return value;
                        }
                    }
                }
            }
        }
    });
    dashboardCharts.push(chart);
}

// =====================================================
// DOUGHNUT CHART - KOMPOSISI SHIFT
// =====================================================
function renderShiftCompositionChart(data) {
    const ctx = document.getElementById('chartShiftComposition')?.getContext('2d');
    if (!ctx) return;

    const colors = getChartColors();
    const totalS1 = data.reduce((sum, d) => sum + d.s1, 0);
    const totalS2 = data.reduce((sum, d) => sum + d.s2, 0);

    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Shift 1', 'Shift 2'],
            datasets: [{
                data: [totalS1, totalS2],
                backgroundColor: [colors.primary + 'dd', colors.secondary + 'dd'],
                borderColor: [colors.primary, colors.secondary],
                borderWidth: 2,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: colors.textSecondary, font: { size: 12 }, padding: 16, boxWidth: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return ctx.label + ': Rp ' + formatNumber(ctx.parsed) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
    dashboardCharts.push(chart);
}

// =====================================================
// AREA CHART - TREN AKUMULASI (AKM)
// =====================================================
function renderAkmTrendChart(data) {
    const ctx = document.getElementById('chartAkmTrend')?.getContext('2d');
    if (!ctx) return;

    const colors = getChartColors();
    // Hanya tampilkan hingga data terakhir yang ada isinya
    const filledData = data.filter(d => d.akmSales > 0);
    if (filledData.length === 0) return;

    const labels = filledData.map(d => `${d.day}`);

    const datasets = [{
        label: 'AKM Penjualan',
        data: filledData.map(d => d.akmSales),
        borderColor: colors.primary,
        backgroundColor: colors.bgFill1,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
    }];

    // Tambah garis target jika tersedia
    const targetAkm = currentMonthTarget?.targetAkm || 0;
    if (targetAkm > 0) {
        datasets.push({
            label: 'Target AKM',
            data: filledData.map(() => targetAkm),
            borderColor: colors.tertiary,
            borderWidth: 2,
            borderDash: [8, 4],
            fill: false,
            pointRadius: 0,
        });
    }

    const chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: colors.textSecondary, font: { size: 11 }, boxWidth: 12, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return ctx.dataset.label + ': Rp ' + formatNumber(ctx.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: colors.gridColor },
                    ticks: { color: colors.textSecondary, font: { size: 11 } },
                    title: { display: true, text: 'Tanggal', color: colors.textSecondary, font: { size: 11 } }
                },
                y: {
                    grid: { color: colors.gridColor },
                    ticks: {
                        color: colors.textSecondary,
                        font: { size: 11 },
                        callback: function (value) {
                            if (value >= 1000000000) return (value / 1000000000).toFixed(1) + 'M';
                            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'jt';
                            if (value >= 1000) return (value / 1000).toFixed(0) + 'rb';
                            return value;
                        }
                    }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
    dashboardCharts.push(chart);
}
