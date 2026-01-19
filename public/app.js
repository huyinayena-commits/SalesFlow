// =====================================================
// APP.JS - MAIN ENTRY POINT
// =====================================================

// =====================================================
// INITIALIZATION
// =====================================================
window.onload = async function () {
    try {
        // Cek Error Init Firebase
        if (window.firebaseInitError) {
            throw window.firebaseInitError;
        }

        // Cek Library Modules
        if (typeof initTheme !== 'function' || typeof loadSystemConfig !== 'function') {
            throw new Error('Gagal memuat modul JavaScript. Coba refresh halaman.');
        }

        initTheme();

        // Setup Navigation Listeners
        setupNavigationListeners();

        // Load System Config
        await loadSystemConfig();

        // Initialize Table
        generateTableStructure();

        // Check Auth State (Listener in auth.js will handle the rest)
        updateSaveButtonState();

        // Show initial loading
        if (!auth.currentUser) {
            await initializeMonth(); // Load cached/empty data for guest
        }
    } catch (e) {
        console.error('Critical Initialization Error:', e);
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.innerHTML = `
                Error: ${e.message}<br><br>
                <button onclick="location.reload()" style="padding: 10px 20px; border-radius: 5px; background: white; color: black; border: none; cursor: pointer; font-weight: bold;">
                    Muat Ulang Halaman
                </button>
            `;
            loadingText.style.color = '#ff6b6b';
        }
    }
};

// =====================================================
// GLOBAL EVENT LISTENERS
// =====================================================
function setupNavigationListeners() {
    // Month Navigation
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnToday = document.getElementById('btnToday');

    if (btnPrev) btnPrev.onclick = () => changeMonth(-1);
    if (btnNext) btnNext.onclick = () => changeMonth(1);
    if (btnToday) btnToday.onclick = () => resetToCurrentMonth();

    // Unsaved Changes Warning
    window.addEventListener('beforeunload', function (e) {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = 'Ada perubahan yang belum disimpan!';
        }
    });

    // Auto Lock / Idle Detection (Simple implementation)
    let idleTime = 0;
    document.addEventListener('mousemove', resetIdleTimer);
    document.addEventListener('keypress', resetIdleTimer);

    setInterval(timerIncrement, 60000); // Check every minute

    function resetIdleTimer() {
        idleTime = 0;
    }

    function timerIncrement() {
        idleTime++;
        if (idleTime > 30 && systemConfig.autoLock && auth.currentUser) { // 30 minutes
            // logoutGoogle(); // Auto logout functionality (optional)
            // console.log("User idle for 30 minutes");
        }
    }
}

// =====================================================
// ERROR HANDLING
// =====================================================
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Global Error:', error);
    showMessage('Terjadi kesalahan sistem');
    // Don't hide loading here as it might be critical
    return false;
};

window.onunhandledrejection = function (event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    // showMessage('Terjadi kesalahan jaringan/sistem');
};
