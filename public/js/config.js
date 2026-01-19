// =====================================================
// CONFIG.JS - KONFIGURASI DAN INISIALISASI
// =====================================================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBZwZdIHdOBg0euyu2q4Zd3ieHExiCllj8",
    authDomain: "salesflow-35f8d.firebaseapp.com",
    projectId: "salesflow-35f8d",
    storageBucket: "salesflow-35f8d.firebasestorage.app",
    messagingSenderId: "541136712082",
    appId: "1:541136712082:web:89c518c39bcf58f7c1114b",
    measurementId: "G-5K6Q2Q378K"
};

// Initialize Firebase
let db, auth;
try {
    if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK belum dimuat. Periksa koneksi internet Anda.');
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    console.log('Firebase initialized successfully');
} catch (e) {
    console.error('Firebase Init Error:', e);
    // Kita biarkan app.js yang menangani tampilan error
    window.firebaseInitError = e;
}

// =====================================================
// ADMIN CONFIGURATION
// =====================================================
const SUPER_ADMIN_EMAIL = "huyinayena@gmail.com";

// =====================================================
// SYSTEM CONFIGURATION
// =====================================================
let systemConfig = {
    defaultTheme: 'light',
    openRegistration: true,
    auditLogging: true,
    loginWarning: true,
    autoLock: true
};

// =====================================================
// CONSTANTS
// =====================================================
const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const DEFAULT_REPORT_TEMPLATE = `LAPORAN HARIAN
TOKO    : FWYJ PERMATA ROYAL
TGL  SALES :{tglSales}

SALES HARIAN
sift  : sales net/std
Sift 1 : {salesS1}/{strukS1}
Sift 2 : {salesS2}/{strukS2}

TOTAL NET = {totalNet}
TOTAL STRUK : {totalStruk}
AKM SALES : {akmSales}
AKM STRUK : {akmStruk}

SALES LALU
NET SALES : {prev_totalNet}
TOTAL STRUK : {prev_totalStruk}
SPD LALU : {prev_spd}
STD LALU  : {prev_std}

SPD
SPD NOW : {spd}
SPD LALU  : {prev_spd}
GROWTH VS LALU : {growthSpd}

STD
STD NOW : {std}
STD LALU : {prev_std}
GROWTH VS LALU : {growthStd}

APC
APC NOW : {apc}
APC LALU : {prev_apc}
GROWTH VS LALU : {growthApc}`;

const REPORT_PLACEHOLDERS = [
    'tglSales', 'salesS1', 'salesS2', 'totalNet', 'akmSales', 'spd', 'growthSpd',
    'strukS1', 'strukS2', 'totalStruk', 'akmStruk', 'std', 'growthStd', 'apc', 'growthApc',
    'prev_totalNet', 'prev_totalStruk', 'prev_spd', 'prev_std', 'prev_apc'
];

// =====================================================
// GLOBAL VARIABLES
// =====================================================
let currentDate = new Date();
let currentTheme = localStorage.getItem('theme') || 'light';
let selectedRowIndex = null;
let isLoading = false;
let currentLoadId = 0;
let isDirty = false;
let isDataLoaded = false;
let currentUserRole = null;
let adminModeEnabled = false;
let allUsers = [];
let allAuditLogs = [];

// =====================================================
// SYSTEM CONFIG FUNCTIONS
// =====================================================
async function loadSystemConfig() {
    try {
        const doc = await db.collection('systemConfig').doc('main').get();
        if (doc.exists) {
            systemConfig = { ...systemConfig, ...doc.data() };
        }
        updateConfigUI();
    } catch (error) {
        console.error('Error loading system config:', error);
    }
}

function updateConfigUI() {
    const themeSelect = document.getElementById('configDefaultTheme');
    if (themeSelect) {
        themeSelect.value = systemConfig.defaultTheme;
    }

    ['openRegistration', 'auditLogging', 'loginWarning', 'autoLock'].forEach(key => {
        const toggle = document.getElementById(`config${key.charAt(0).toUpperCase() + key.slice(1)}`);
        if (toggle) {
            toggle.classList.toggle('active', systemConfig[key]);
        }
    });
}

function toggleConfig(key) {
    systemConfig[key] = !systemConfig[key];
    const toggle = document.getElementById(`config${key.charAt(0).toUpperCase() + key.slice(1)}`);
    if (toggle) {
        toggle.classList.toggle('active', systemConfig[key]);
    }
}

async function saveSystemConfig() {
    const themeSelect = document.getElementById('configDefaultTheme');
    if (themeSelect) {
        systemConfig.defaultTheme = themeSelect.value;
    }

    try {
        await db.collection('systemConfig').doc('main').set({
            ...systemConfig,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('config', 'Konfigurasi sistem diperbarui', systemConfig);
        showMessage('Konfigurasi berhasil disimpan');
    } catch (error) {
        console.error('Error saving config:', error);
        showMessage('Gagal menyimpan konfigurasi');
    }
}
