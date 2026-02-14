// =====================================================
// NOTES.JS - CATATAN HARIAN PER TANGGAL
// =====================================================

// Simpan catatan dalam memory (di-sync saat save/load data)
const DailyNotes = {
    _notes: {},

    // Ambil catatan untuk row tertentu
    get(rowIndex) {
        return this._notes[rowIndex] || '';
    },

    // Simpan catatan untuk row tertentu
    set(rowIndex, text) {
        if (text && text.trim()) {
            this._notes[rowIndex] = text.trim();
        } else {
            delete this._notes[rowIndex];
        }
    },

    // Hapus catatan
    remove(rowIndex) {
        delete this._notes[rowIndex];
    },

    // Reset semua catatan (saat ganti bulan)
    clear() {
        this._notes = {};
    },

    // Konversi ke object biasa untuk disimpan
    toObject() {
        return { ...this._notes };
    },

    // Muat dari object (dari Firestore)
    fromObject(obj) {
        this._notes = {};
        if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => {
                if (obj[key] && obj[key].trim()) {
                    this._notes[key] = obj[key].trim();
                }
            });
        }
    }
};

// Referensi popover yang sedang terbuka
let activeNotePopover = null;
let activeNoteRowIndex = null;

// =====================================================
// RENDER IKON CATATAN DI KOLOM TANGGAL
// =====================================================
function renderNoteButton(rowIndex) {
    const noteText = DailyNotes.get(rowIndex);
    const hasNote = !!noteText;
    const iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';

    let tooltipHtml = '';
    if (hasNote) {
        // Escape HTML dan batasi panjang untuk tooltip
        const escaped = noteText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const truncated = escaped.length > 80 ? escaped.substring(0, 80) + '...' : escaped;
        tooltipHtml = `<span class="note-tooltip">${truncated}</span>`;
    }

    return `<button class="note-btn ${hasNote ? 'has-note' : ''}" onclick="openNoteEditor(${rowIndex}, event)" title="${hasNote ? '' : 'Tambah catatan'}">${iconSvg}${tooltipHtml}</button>`;
}

// =====================================================
// BUKA POPOVER EDITOR
// =====================================================
function openNoteEditor(rowIndex, event) {
    event.stopPropagation();

    // Tutup popover sebelumnya
    closeNoteEditor();

    const noteText = DailyNotes.get(rowIndex);
    activeNoteRowIndex = rowIndex;

    // Buat popover
    const popover = document.createElement('div');
    popover.className = 'note-popover';
    popover.id = 'notePopover';
    popover.onclick = (e) => e.stopPropagation();

    const dayNum = rowIndex + 1;

    popover.innerHTML = `
        <div class="note-popover-header">
            <span>Catatan - Tanggal ${dayNum}</span>
            <button class="note-popover-close" onclick="closeNoteEditor()">&times;</button>
        </div>
        <div class="note-popover-body">
            <textarea class="note-textarea" id="noteTextarea" placeholder="Tulis catatan... (contoh: Promo akhir pekan, Libur nasional)">${noteText}</textarea>
        </div>
        <div class="note-popover-actions">
            ${noteText ? '<button class="note-delete-btn" onclick="deleteNote()">Hapus</button>' : ''}
            <button class="note-save-btn" onclick="saveCurrentNote()">Simpan</button>
        </div>
    `;

    document.body.appendChild(popover);
    activeNotePopover = popover;

    // Posisi popover relatif terhadap tombol
    const btnRect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = 280;

    // Horizontal: coba taruh di kanan tombol, kalau keluar viewport taruh di kiri
    let left = btnRect.right + 8;
    if (left + popoverWidth > viewportWidth - 16) {
        left = btnRect.left - popoverWidth - 8;
    }
    if (left < 16) left = 16;

    // Vertical: di bawah tombol
    let top = btnRect.top - 10;
    if (top + 220 > viewportHeight) {
        top = viewportHeight - 230;
    }
    if (top < 10) top = 10;

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';

    // Animasi masuk
    requestAnimationFrame(() => {
        popover.classList.add('visible');
    });

    // Focus ke textarea
    setTimeout(() => {
        const ta = document.getElementById('noteTextarea');
        if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        }
    }, 100);

    // Tutup saat klik di luar
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 50);
}

// =====================================================
// TUTUP POPOVER
// =====================================================
function closeNoteEditor() {
    document.removeEventListener('click', handleOutsideClick);

    if (activeNotePopover) {
        activeNotePopover.classList.remove('visible');
        setTimeout(() => {
            if (activeNotePopover && activeNotePopover.parentNode) {
                activeNotePopover.parentNode.removeChild(activeNotePopover);
            }
            activeNotePopover = null;
            activeNoteRowIndex = null;
        }, 200);
    }
}

function handleOutsideClick(e) {
    if (activeNotePopover && !activeNotePopover.contains(e.target)) {
        closeNoteEditor();
    }
}

// =====================================================
// SIMPAN CATATAN
// =====================================================
function saveCurrentNote() {
    if (activeNoteRowIndex === null) return;

    const textarea = document.getElementById('noteTextarea');
    const text = textarea ? textarea.value : '';

    DailyNotes.set(activeNoteRowIndex, text);
    updateNoteButtonInRow(activeNoteRowIndex);
    setDirty(true);
    closeNoteEditor();
}

function deleteNote() {
    if (activeNoteRowIndex === null) return;

    DailyNotes.remove(activeNoteRowIndex);
    updateNoteButtonInRow(activeNoteRowIndex);
    setDirty(true);
    closeNoteEditor();
}

// =====================================================
// UPDATE IKON DI BARIS TERTENTU
// =====================================================
function updateNoteButtonInRow(rowIndex) {
    const rows = document.getElementById('tableBody')?.rows;
    if (!rows || !rows[rowIndex]) return;

    const dateCell = rows[rowIndex].cells[1];
    if (!dateCell) return;

    const noteBtn = dateCell.querySelector('.note-btn');
    if (noteBtn) {
        // Ganti tombol dengan versi baru
        const temp = document.createElement('div');
        temp.innerHTML = renderNoteButton(rowIndex);
        noteBtn.replaceWith(temp.firstElementChild);
    }
}

// =====================================================
// REFRESH SEMUA IKON (saat load data baru)
// =====================================================
function refreshAllNoteButtons() {
    const rows = document.getElementById('tableBody')?.rows;
    if (!rows) return;

    for (let i = 0; i < rows.length; i++) {
        if (rows[i].classList.contains('summary')) continue;
        updateNoteButtonInRow(i);
    }
}
