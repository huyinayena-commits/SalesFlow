// =====================================================
// BACKUP.JS - BACKUP OTOMATIS KE TELEGRAM
// =====================================================

// Konfigurasi Bot Telegram
const TELEGRAM_CONFIG = {
    botToken: '8558504746:AAEB8Wap-w7OFeriJL5d8NfVwVNfB4n-X_I',
    chatId: '1708695776',
    get apiUrl() {
        return `https://api.telegram.org/bot${this.botToken}`;
    }
};

// Koleksi Firestore untuk preferensi backup
const BACKUP_SETTINGS_COLLECTION = 'appSettings';
const BACKUP_SETTINGS_DOC = 'telegramBackup';

// =====================================================
// LOAD & SAVE PREFERENSI BACKUP
// =====================================================

// Muat preferensi dari Firestore, update UI dropdown & label
async function loadBackupPreference() {
    const freqSelect = document.getElementById('backupFrequency');
    const lastLabel = document.getElementById('lastBackupTime');

    // Default: Mati
    if (freqSelect) freqSelect.value = 'off';
    if (lastLabel) lastLabel.textContent = 'Belum pernah';

    if (!auth.currentUser) return;

    try {
        const doc = await db.collection(BACKUP_SETTINGS_COLLECTION)
            .doc(BACKUP_SETTINGS_DOC).get();
        if (doc.exists) {
            const data = doc.data();
            if (freqSelect && data.frequency) {
                freqSelect.value = data.frequency;
            }
            if (lastLabel && data.lastBackupTimestamp) {
                const ts = data.lastBackupTimestamp.toDate
                    ? data.lastBackupTimestamp.toDate()
                    : new Date(data.lastBackupTimestamp);
                lastLabel.textContent = formatBackupTimestamp(ts);
            }
        }
    } catch (error) {
        console.error('Gagal memuat preferensi backup:', error);
    }
}

// Simpan preferensi frekuensi ke Firestore
async function saveBackupPreference() {
    const freqSelect = document.getElementById('backupFrequency');
    if (!freqSelect || !auth.currentUser) return;

    const frequency = freqSelect.value;

    try {
        await db.collection(BACKUP_SETTINGS_COLLECTION)
            .doc(BACKUP_SETTINGS_DOC)
            .set({ frequency: frequency }, { merge: true });
        showMessage('Preferensi backup disimpan: ' + getFrequencyLabel(frequency));
    } catch (error) {
        console.error('Gagal menyimpan preferensi backup:', error);
        showMessage('Gagal menyimpan preferensi backup');
    }
}

// =====================================================
// BACKUP KE TELEGRAM (MANUAL / AUTO)
// =====================================================

// Kirim data bulan ini sebagai file JSON ke Telegram
async function backupToTelegram() {
    if (!auth.currentUser) {
        showMessage('Login dulu untuk membuat backup');
        return;
    }

    showLoading('Mengirim backup ke Telegram...');

    try {
        // Kumpulkan data dari tabel
        const data = collectTableData();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthName = monthNames[month] || `Bulan_${month}`;

        // Buat objek backup lengkap
        const backupPayload = {
            appName: 'SalesFlow',
            exportDate: new Date().toISOString(),
            period: `${monthName} ${year}`,
            year: year,
            month: month,
            totalDays: data.length,
            filledDays: data.filter(d => d.totalNet > 0).length,
            data: data
        };

        // Konversi ke JSON string
        const jsonString = JSON.stringify(backupPayload, null, 2);

        // Buat Blob dan File
        const blob = new Blob([jsonString], { type: 'application/json' });
        const fileName = `SalesFlow_${year}_${String(month + 1).padStart(2, '0')}_${monthName}.json`;

        // Buat FormData untuk Telegram API
        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CONFIG.chatId);
        formData.append('document', blob, fileName);
        formData.append('caption',
            `Backup SalesFlow\n` +
            `Periode: ${monthName} ${year}\n` +
            `Hari terisi: ${backupPayload.filledDays}/${backupPayload.totalDays}\n` +
            `Waktu: ${new Date().toLocaleString('id-ID')}\n` +
            `Oleh: ${auth.currentUser.email}`
        );

        // Kirim ke Telegram via sendDocument
        const response = await fetch(`${TELEGRAM_CONFIG.apiUrl}/sendDocument`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.ok) {
            // Update timestamp di Firestore
            await updateLastBackupTimestamp();
            showMessage('Backup berhasil dikirim ke Telegram');
        } else {
            throw new Error(result.description || 'Gagal mengirim ke Telegram');
        }

    } catch (error) {
        console.error('Backup error:', error);
        showMessage('Gagal backup: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Perbarui timestamp backup terakhir di Firestore dan UI
async function updateLastBackupTimestamp() {
    const now = new Date();

    try {
        await db.collection(BACKUP_SETTINGS_COLLECTION)
            .doc(BACKUP_SETTINGS_DOC)
            .set({
                lastBackupTimestamp: now,
                lastBackupBy: auth.currentUser?.email || 'unknown'
            }, { merge: true });
    } catch (error) {
        console.error('Gagal update timestamp backup:', error);
    }

    // Update label di UI
    const lastLabel = document.getElementById('lastBackupTime');
    if (lastLabel) lastLabel.textContent = formatBackupTimestamp(now);
}

// =====================================================
// AUTO BACKUP CHECK (SAAT ADMIN LOGIN / BUKA APP)
// =====================================================

// Dipanggil setelah login berhasil & role = admin/superadmin
async function checkAutoBackup() {
    // Hanya jalankan untuk admin/superadmin
    if (!currentUserRole || (currentUserRole !== 'superadmin' && currentUserRole !== 'admin')) {
        return;
    }

    if (!auth.currentUser) return;

    try {
        const doc = await db.collection(BACKUP_SETTINGS_COLLECTION)
            .doc(BACKUP_SETTINGS_DOC).get();

        if (!doc.exists) return;

        const data = doc.data();
        const frequency = data.frequency || 'off';

        // Jika mati atau manual, tidak perlu auto-check
        if (frequency === 'off' || frequency === 'manual') return;

        const lastBackup = data.lastBackupTimestamp
            ? (data.lastBackupTimestamp.toDate
                ? data.lastBackupTimestamp.toDate()
                : new Date(data.lastBackupTimestamp))
            : null;

        const now = new Date();
        let shouldBackup = false;

        if (!lastBackup) {
            // Belum pernah backup sama sekali
            shouldBackup = true;
        } else {
            switch (frequency) {
                case 'daily':
                    // Backup jika sudah beda hari
                    shouldBackup = !isSameDay(now, lastBackup);
                    break;
                case 'weekly':
                    // Backup jika sudah 7 hari sejak terakhir
                    shouldBackup = getDaysDiff(now, lastBackup) >= 7;
                    break;
                case 'monthly':
                    // Backup jika tanggal 1 atau sudah 30 hari
                    shouldBackup = now.getDate() === 1 || getDaysDiff(now, lastBackup) >= 30;
                    break;
            }
        }

        if (shouldBackup) {
            console.log(`Auto backup triggered (frequency: ${frequency})`);
            // Tunggu sebentar agar data bulan ini sudah termuat
            setTimeout(() => {
                backupToTelegram();
            }, 3000);
        }

    } catch (error) {
        console.error('Error saat cek auto backup:', error);
    }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Cek apakah dua tanggal adalah hari yang sama
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
}

// Hitung selisih hari antara dua tanggal
function getDaysDiff(date1, date2) {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// Format timestamp ke string yang mudah dibaca
function formatBackupTimestamp(date) {
    if (!date) return 'Belum pernah';
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Dapatkan label frekuensi dalam Bahasa Indonesia
function getFrequencyLabel(freq) {
    const labels = {
        'off': 'Mati',
        'daily': 'Harian',
        'weekly': 'Mingguan',
        'monthly': 'Bulanan',
        'manual': 'Manual'
    };
    return labels[freq] || freq;
}
