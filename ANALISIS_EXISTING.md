# Analisis Detail Codebase SalesFlow (Existing)

> [!IMPORTANT]
> Dokumen ini adalah "Cetak Biru" dari sistem SalesFlow saat ini. Gunakan sebagai referensi mutlak saat melakukan pembangunan ulang untuk memastikan tidak ada fitur logika bisnis yang hilang (Feature Parity).

## 1. Arsitektur & Struktur File
Aplikasi ini adalah Single Page Application (SPA) berbasis Vanilla JS yang tidak menggunakan *module bundler* (seperti Webpack/Vite) pada fase runtime browser.

### A. Struktur Folder Hierarkis
```
public/
├── index.html          # Shell aplikasi (Layout Skeleton, Firebase SDK, & Script Load Order)
├── app.js              # Bootstrapper (Init Logic, Global Error Handling)
├── styles.css          # CSS Entry Point (Hanya berisi @import)
├── css/                # Modular CSS
│   ├── variables.css   # Design Token (Warna, Font, Spacing)
│   ├── base.css        # Reset & Typography
│   ├── components.css  # Button, Modal, Card, Input Styles
│   ├── table.css       # Spesifik style untuk Tabel Laporan yang kompleks
│   ├── admin.css       # Style untuk panel admin
│   └── responsive.css  # Media Queries (Mobile breakpoint)
└── js/                 # Modular JavaScript (Separation of Concerns)
    ├── config.js       # Firebase Config & System Constants
    ├── utils.js        # Pure Functions (Formatting, Parsing, Date calc)
    ├── ui.js           # DOM Manipulation & Visual Feedback
    ├── auth.js         # Security Layer (Role, Login, Access Request)
    ├── data.js         # BUSINESS LOGIC CORE (Cache, Calculation, CRUD)
    └── admin.js        # Super Admin Logic
```

---

## 2. Analisis Logika Bisnis (Core Business Logic)

### A. Data Model (Firestore Schema)
Data tidak disimpan per hari, melainkan **per bulan** dalam satu dokumen untuk mengurangi biaya read/write Firestore.

**Collection**: `salesReports`
**Document ID**: `salesData_YYYY_M` (e.g., `salesData_2023_10`)

**Schema JSON**:
```json
{
  "timestamp": "Timestamp (Server Time)",
  "data": [
    // Array dengan panjang = Jumlah Hari dalam bulan tersebut (28/30/31)
    {
      "s1": 1500000,          // [Input] Shift 1 Sales
      "s2": 2000000,          // [Input] Shift 2 Sales
      "st1": 50,              // [Input] Shift 1 Struk
      "st2": 45,              // [Input] Shift 2 Struk
      
      // -- Calculated Fields (Bisa di-overwrite user) --
      "totalNet": 3500000,    // (s1 + s2) OR Manual Input
      "akmSales": 7000000,    // (totalNet hari ini + akmSales kemarin) OR Manual
      "spd": 3500000,         // akmSales / (index hari + 1)
      "totalStruk": 95,       // (st1 + st2) OR Manual
      "akmStruk": 190,        // (totalStruk hari ini + akmStruk kemarin) OR Manual
      "std": 95,              // akmStruk / (index hari + 1)
      "apc": 36842,           // spd / std
      
      // -- Flags untuk Manual Override (PENTING) --
      // Jika true, kalkulasi otomatis tidak akan menimpa nilai ini lagi
      "m_total": false,       // User edit kolom Total Net secara manual
      "m_akmS": false,        // User edit kolom AKM Sales secara manual
      "m_totalSt": false,     // User edit kolom Total Struk secara manual
      "m_akmSt": false        // User edit kolom AKM Struk secara manual
    }
  ]
}
```

### B. Mekanisme Kalkulasi Tabel (`calculateRow` di `data.js`)
Sistem menggunakan pendekatan "Cascading Update".
1.  **Trigger**: User mengedit input (misal Shift 1, Tanggal 5).
2.  **Process**:
    *   Hitung ulang baris tanggal 5 (Total, AKM, SPD, APC).
    *   **Loop Forward**: Karena AKM hari ini mempengaruhi AKM besok, maka sistem otomatis melakukan loop dari tanggal 5 s/d akhir bulan untuk menghitung ulang semua baris di bawahnya (`handleRowChange`).
3.  **Growth Logic**:
    *   Mengecek `DataCache` untuk bulan sebelumnya (`YYYY, M-1`).
    *   Jika data ada, bandingkan `SPD Hari Ini` vs `SPD Tanggal Sama Bulan Lalu`.
    *   Rumus: `((Current / Prev) - 1) * 100`.
    *   Visual: Merah jika minus, Hijau jika positif.

### C. Quick Input Mode (Fitur Unik)
Fitur ini tidak terlihat di tabel utama, tapi ada di tombol FAB (`+`).
*   **Masalah user**: User kadang menghitung uang dari 2 mesin kasir (Station) berbeda dluar aplikasi lalu menjumlahkannya manual.
*   **Solusi App**: Modal Quick Input memecah input menjadi:
    *   `Shift 1 - Station 1` + `Shift 1 - Station 2` -> Dijumlahkan otomatis masuk ke `s1`.
    *   `Shift 2 - Station 1` + `Shift 2 - Station 2` -> Dijumlahkan otomatis masuk ke `s2`.
    *   Hal yang sama berlaku untuk Struk.

---

## 3. Sistem Keamanan & Autentikasi (`auth.js`)

Sistem ini menerapkan "Semi-Closed Registration".

### Diagram Alur Login:
1.  **Google Sign-In**: User login dengan akun Google.
2.  **Check Whitelist (Super Admin)**: Jika email hardcoded di config, bypass semua cek -> Role `superadmin`.
3.  **Check Firestore (`users` collection)**:
    *   **User Ditemukan & Aktif**: Login sukses, set role sesuai database (`admin` / `staff`).
    *   **User Ditemukan tapi Nonaktif**: Tampilkan pesan error "Akun dinonaktifkan".
    *   **User Tidak Ditemukan**:
        1.  Buat dokumen di `accessRequests` collection.
        2.  Tampilkan pesan "Menunggu Persetujuan Admin".
        3.  Kirim notifikasi (audit log) ke admin.

### Role Permissions:
*   `Staff`:
    *   Hanya bisa edit baris di Tabel untuk **Hari Ini** dan **Kemarin** (H-1).
    *   Input untuk tanggal lain di-disable (`readonly`).
*   `Admin`: Full akses edit data kapanpun.
*   `Super Admin`: Full akses + Panel manajemen user.

---

## 4. UI/UX Micro-Interactions (Penting untuk Dipertahankan)

Saat rewrite, hal-hal kecil ini yang membuat user merasa aplikasi "enak dipakai":

1.  **Format Input Angka (Ribuan)**:
    *   Saat user mengetik `1` -> `0`.
    *   Mengetik `10000` -> Otomatis jadi `10.000` real-time tanpa kursor lompat ke akhir. Logika ini ada di `formatInputValue()` menggunakan seleksi kursor manual.
2.  **Enter Key Navigation (Custom Tab Index)**:
    *   User menekan `Enter` di kolom `Shift 1` -> Pindah ke `Shift 2`.
    *   `Enter` di `Shift 2` -> Pindah ke `Struk 1`.
    *   `Enter` di `Struk 2` -> Pindah ke `Shift 1` (Baris Berikutnya/Besok).
    *   Alur ini dioptimalkan untuk input data massal dengan cepat menggunakan Numpad.
3.  **Smart Split (Total Input)**:
    *   Jika user malas mengisi per shift dan langsung mengisi kolom `Total`, sistem otomatis membagi 2 angka tersebut untuk mengisi `Shift 1` dan `Shift 2`.
    *   Rumus: `Shift 1 = floor(Total / 2)`, `Shift 2 = Total - Shift 1`.

---

## 5. System Configuration (`config.js` & `admin.js`)
Konfigurasi tersentralisasi yang bisa diubah Super Admin tanpa coding:
*   `openRegistration`: Jika false, user baru tidak bisa request akses sama sekali.
*   `auditLogging`: Toggle pencatatan log aktivitas.
*   `autoLock`: Fitur (shadow) untuk mengunci data lama secara otomatis (terimplementasi sebagian).

## 6. Integrasi Eksternal & Utilitas
*   **Template Report Generator**: Menggunakan *placeholder substitution* (`{spd}`, `{totalNet}`) untuk membuat teks laporan WhatsApp yang dinamis sesuai data hari yang dipilih.
*   **JSON Import/Export**: Backup data manual dalam format JSON array plain text.

## 7. Rekomendasi Stack untuk Rewrite (Modernisasi)

Melihat kompleksitas *state management* (terutama *Cascading Update*) dan interaksi UI yang reaktif:

*   **Logic Layer**: Sangat disarankan pindah ke **React** (dengan Vite) karena manajemen *State* tabel yang saling bergantungan akan jauh lebih bersih menggunakan `useEffect` atau `useMemo` dibandingkan Vanilla JS DOM manipulation.
*   **Database**: Tetap **Firebase Firestore** (sudah cocok dengan skema dokumen per bulan).
*   **Styling**: **Tailwind CSS**. Class CSS saat ini (`css/table.css`) cukup *verbose*, Tailwind akan merapikan ini.
*   **Type Safety**: **TypeScript**. Struktur data JSON yang kompleks (banyak field angka) rawan error string vs number. TypeScript akan mengeliminasi bug seperti `"1000" + "2000" = "10002000"`.
