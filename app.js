// =====================================================
// KONFIGURASI DAN INISIALISASI
// =====================================================
const firebaseConfig = {
    apiKey: "AIzaSyBZwZdIHdOBg0euyu2q4Zd3ieHExiCllj8",
    authDomain: "salesflow-35f8d.firebaseapp.com",
    projectId: "salesflow-35f8d",
    storageBucket: "salesflow-35f8d.firebasestorage.app",
    messagingSenderId: "541136712082",
    appId: "1:541136712082:web:89c518c39bcf58f7c1114b",
    measurementId: "G-5K6Q2Q378K"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// =====================================================
// KONFIGURASI ADMIN
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
    document.getElementById('configDefaultTheme').value = systemConfig.defaultTheme;

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
    systemConfig.defaultTheme = document.getElementById('configDefaultTheme').value;

    try {
        await db.collection('systemConfig').doc('main').set({
            ...systemConfig,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('config', 'Konfigurasi sistem diperbarui', systemConfig);
        showMessage('âœ… Konfigurasi berhasil disimpan');
    } catch (error) {
        console.error('Error saving config:', error);
        showMessage('âŒ Gagal menyimpan konfigurasi');
    }
}

// =====================================================
// ACCESS REQUEST SYSTEM
// =====================================================
async function submitAccessRequest(email) {
    if (!systemConfig.openRegistration) {
        showMessage('âŒ Registrasi ditutup. Hubungi admin.');
        return;
    }

    try {
        await db.collection('accessRequests').doc(email).set({
            email: email,
            status: 'pending',
            requestedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            assignedRole: null
        });

        await logAuditAction('login', `Permintaan akses baru: ${email}`);
        showMessage('ðŸ“§ Permintaan akses telah dikirim. Menunggu persetujuan admin.');
    } catch (error) {
        console.error('Error submitting access request:', error);
        showMessage('âŒ Gagal mengirim permintaan akses');
    }
}

async function loadAccessRequests() {
    const listEl = document.getElementById('accessRequestsList');
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat...</p>';

    try {
        const snapshot = await db.collection('accessRequests')
            .orderBy('requestedAt', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            listEl.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state-icon">ðŸ“­</div>
                            <div class="empty-state-text">Tidak ada permintaan akses</div>
                        </div>
                    `;
            updateAccessRequestStats(0, 0, 0);
            return;
        }

        let html = '';
        let pendingCount = 0, approvedToday = 0, rejectedToday = 0;
        const today = new Date().toDateString();

        snapshot.forEach(doc => {
            const data = doc.data();
            const email = doc.id;
            const statusClass = data.status;
            const requestTime = data.requestedAt?.toDate ?
                data.requestedAt.toDate().toLocaleString('id-ID') : 'Unknown';

            if (data.status === 'pending') pendingCount++;
            if (data.status === 'approved' && data.reviewedAt?.toDate?.().toDateString() === today) approvedToday++;
            if (data.status === 'rejected' && data.reviewedAt?.toDate?.().toDateString() === today) rejectedToday++;

            if (data.status === 'pending') {
                html += `
                            <div class="access-request-item ${statusClass}">
                                <div class="request-info">
                                    <div class="request-email">${email}</div>
                                    <div class="request-time">ðŸ“… ${requestTime}</div>
                                </div>
                                <div class="request-actions">
                                    <select id="roleFor_${email.replace(/[@.]/g, '_')}">
                                        <option value="staff">Staff</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <button class="btn-approve" onclick="approveAccessRequest('${email}')">âœ“ Setujui</button>
                                    <button class="btn-reject" onclick="rejectAccessRequest('${email}')">âœ— Tolak</button>
                                </div>
                            </div>
                        `;
            } else {
                const statusText = data.status === 'approved' ? 'âœ“ Disetujui' : 'âœ— Ditolak';
                const statusIcon = data.status === 'approved' ? 'ðŸŸ¢' : 'ðŸ”´';
                html += `
                            <div class="access-request-item ${statusClass}">
                                <div class="request-info">
                                    <div class="request-email">${email}</div>
                                    <div class="request-time">${statusIcon} ${statusText} â€¢ ${requestTime}</div>
                                </div>
                            </div>
                        `;
            }
        });

        listEl.innerHTML = html;
        updateAccessRequestStats(pendingCount, approvedToday, rejectedToday);

    } catch (error) {
        console.error('Error loading access requests:', error);
        listEl.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat permintaan.</p>';
    }
}

function updateAccessRequestStats(pending, approved, rejected) {
    document.getElementById('statPendingRequests').textContent = pending;
    document.getElementById('statApprovedToday').textContent = approved;
    document.getElementById('statRejectedToday').textContent = rejected;

    const badge = document.getElementById('pendingRequestsBadge');
    if (pending > 0) {
        badge.textContent = pending;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

async function approveAccessRequest(email) {
    const roleSelectId = `roleFor_${email.replace(/[@.]/g, '_')}`;
    const roleSelect = document.getElementById(roleSelectId);
    const role = roleSelect ? roleSelect.value : 'staff';

    try {
        // Add user to users collection
        await db.collection('users').doc(email).set({
            role: role,
            createdAt: new Date(),
            createdBy: auth.currentUser?.email || 'localhost',
            active: true
        });

        // Update access request status
        await db.collection('accessRequests').doc(email).update({
            status: 'approved',
            assignedRole: role,
            reviewedAt: new Date(),
            reviewedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('user', `Permintaan akses disetujui: ${email} sebagai ${role}`);
        showMessage(`âœ… ${email} disetujui sebagai ${role}`);
        loadAccessRequests();

    } catch (error) {
        console.error('Error approving request:', error);
        showMessage('âŒ Gagal menyetujui permintaan');
    }
}

async function rejectAccessRequest(email) {
    if (!confirm(`Tolak permintaan akses dari ${email}?`)) return;

    try {
        await db.collection('accessRequests').doc(email).update({
            status: 'rejected',
            reviewedAt: new Date(),
            reviewedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('user', `Permintaan akses ditolak: ${email}`);
        showMessage(`âœ— Permintaan dari ${email} ditolak`);
        loadAccessRequests();

    } catch (error) {
        console.error('Error rejecting request:', error);
        showMessage('âŒ Gagal menolak permintaan');
    }
}

// =====================================================
// ENHANCED USER MANAGEMENT
// =====================================================
let allUsers = [];

async function loadEnhancedUserList() {
    const listEl = document.getElementById('userListEnhanced');
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat...</p>';

    try {
        const snapshot = await db.collection('users').get();
        allUsers = [];
        let activeCount = 0, inactiveCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            allUsers.push({
                email: doc.id,
                ...data
            });
            if (data.active !== false) activeCount++;
            else inactiveCount++;
        });

        document.getElementById('statTotalUsers').textContent = allUsers.length;
        document.getElementById('statActiveUsers').textContent = activeCount;
        document.getElementById('statInactiveUsers').textContent = inactiveCount;

        renderUserList(allUsers);

    } catch (error) {
        console.error('Error loading users:', error);
        listEl.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat pengguna.</p>';
    }
}

function renderUserList(users) {
    const listEl = document.getElementById('userListEnhanced');

    if (users.length === 0) {
        listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">ðŸ‘¥</div>
                        <div class="empty-state-text">Tidak ada pengguna</div>
                    </div>
                `;
        return;
    }

    let html = '';
    users.forEach(user => {
        const roleLabel = user.role === 'admin' ? 'ðŸ”‘ Admin' : 'ðŸ‘¤ Staff';
        const isActive = user.active !== false;
        const statusClass = isActive ? 'status-active' : 'status-inactive';
        const statusText = isActive ? 'Aktif' : 'Nonaktif';
        const avatar = user.email.charAt(0).toUpperCase();
        const createdAt = user.createdAt?.toDate ?
            user.createdAt.toDate().toLocaleDateString('id-ID') : 'Unknown';

        html += `
                    <div class="user-item-enhanced ${isActive ? '' : 'inactive'}">
                        <div style="display: flex; align-items: center;">
                            <div class="user-avatar">${avatar}</div>
                            <div class="user-details">
                                <div class="user-name">${user.email}</div>
                                <div class="user-meta">${roleLabel} â€¢ Bergabung: ${createdAt}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="user-status-badge ${statusClass}">${statusText}</span>
                            <div class="user-item-actions">
                                <button onclick="changeUserRole('${user.email}', '${user.role === 'admin' ? 'staff' : 'admin'}')" style="background-color: var(--accent-color); padding: 6px 10px;">
                                    ${user.role === 'admin' ? 'ðŸ‘¤' : 'ðŸ”‘'}
                                </button>
                                <button onclick="toggleUserStatus('${user.email}', ${!isActive})" style="background-color: ${isActive ? '#ffc107' : '#28a745'}; padding: 6px 10px;">
                                    ${isActive ? 'ðŸ”’' : 'ðŸ”“'}
                                </button>
                                <button onclick="viewUserActivity('${user.email}')" style="background-color: var(--text-secondary); padding: 6px 10px;">
                                    ðŸ“‹
                                </button>
                                <button onclick="deleteUser('${user.email}')" class="btn-delete" style="padding: 6px 10px;">ðŸ—‘ï¸</button>
                            </div>
                        </div>
                    </div>
                `;
    });

    listEl.innerHTML = html;
}

function filterUsers() {
    const searchTerm = document.getElementById('userSearchInput').value.toLowerCase();
    const filtered = allUsers.filter(user =>
        user.email.toLowerCase().includes(searchTerm) ||
        user.role.toLowerCase().includes(searchTerm)
    );
    renderUserList(filtered);
}

async function toggleUserStatus(email, active) {
    try {
        await db.collection('users').doc(email).update({ active: active });
        await logAuditAction('user', `Status pengguna diubah: ${email} â†’ ${active ? 'Aktif' : 'Nonaktif'}`);
        showMessage(`âœ… ${email} ${active ? 'diaktifkan' : 'dinonaktifkan'}`);
        loadEnhancedUserList();
    } catch (error) {
        console.error('Error toggling user status:', error);
        showMessage('âŒ Gagal mengubah status pengguna');
    }
}

async function viewUserActivity(email) {
    const logs = await getAuditLogForUser(email);
    let html = `<h3>ðŸ“‹ Aktivitas ${email}</h3><div class="audit-log-list" style="max-height: 300px;">`;

    if (logs.length === 0) {
        html += '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Tidak ada aktivitas tercatat</p>';
    } else {
        logs.forEach(log => {
            html += `
                        <div class="audit-log-item">
                            <div class="audit-icon action-${log.type}">
                                ${log.type === 'login' ? 'ðŸ”' : log.type === 'user' ? 'ðŸ‘¤' : 'âš™ï¸'}
                            </div>
                            <div class="audit-content">
                                <div class="audit-action">${log.action}</div>
                                <div class="audit-time">${log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('id-ID') : ''}</div>
                            </div>
                        </div>
                    `;
        });
    }
    html += '</div>';

    alert('Fitur Riwayat Aktivitas: Lihat di tab Audit Log dengan filter email');
}

// =====================================================
// ROLE MANAGEMENT
// =====================================================
async function loadCustomRoles() {
    const listEl = document.getElementById('customRolesList');

    try {
        const snapshot = await db.collection('customRoles').get();

        if (snapshot.empty) {
            listEl.innerHTML = '';
            return;
        }

        let html = '<h3 style="margin: 20px 0 15px 0;">ðŸŽ¨ Role Kustom</h3>';

        snapshot.forEach(doc => {
            const data = doc.data();
            const permissions = data.permissions || [];

            html += `
                        <div class="role-card">
                            <div class="role-header">
                                <span class="role-name">ðŸ·ï¸ ${data.name}</span>
                                <span class="role-type-badge role-custom">Kustom</span>
                            </div>
                            <div class="permission-list">
                                ${permissions.map(p => `<span class="permission-tag granted">${p}</span>`).join('')}
                            </div>
                            <div style="margin-top: 10px;">
                                <button onclick="deleteCustomRole('${doc.id}')" class="btn-delete" style="padding: 6px 12px; font-size: 12px;">ðŸ—‘ï¸ Hapus</button>
                            </div>
                        </div>
                    `;
        });

        listEl.innerHTML = html;

    } catch (error) {
        console.error('Error loading custom roles:', error);
    }
}

async function createCustomRole() {
    const name = document.getElementById('newRoleName').value.trim();
    if (!name) {
        showMessage('âŒ Nama role tidak boleh kosong');
        return;
    }

    const permissions = [];
    if (document.getElementById('perm_inputData').checked) permissions.push('Input Data');

    if (document.getElementById('perm_viewReports').checked) permissions.push('Lihat Laporan');
    if (document.getElementById('perm_exportData').checked) permissions.push('Export Data');

    try {
        await db.collection('customRoles').add({
            name: name,
            permissions: permissions,
            createdAt: new Date(),
            createdBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('config', `Role kustom dibuat: ${name}`);
        document.getElementById('newRoleName').value = '';
        showMessage(`âœ… Role "${name}" berhasil dibuat`);
        loadCustomRoles();

    } catch (error) {
        console.error('Error creating role:', error);
        showMessage('âŒ Gagal membuat role');
    }
}

async function deleteCustomRole(roleId) {
    if (!confirm('Yakin ingin menghapus role ini?')) return;

    try {
        await db.collection('customRoles').doc(roleId).delete();
        await logAuditAction('config', `Role kustom dihapus: ${roleId}`);
        showMessage('âœ… Role berhasil dihapus');
        loadCustomRoles();
    } catch (error) {
        console.error('Error deleting role:', error);
        showMessage('âŒ Gagal menghapus role');
    }
}

// =====================================================
// AUDIT LOG SYSTEM
// =====================================================
let allAuditLogs = [];

async function logAuditAction(type, action, details = null) {
    if (!systemConfig.auditLogging) return;

    try {
        await db.collection('auditLogs').add({
            type: type,
            action: action,
            details: details,
            userId: auth.currentUser?.email || 'localhost',
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error logging audit action:', error);
    }
}

async function loadAuditLog() {
    const listEl = document.getElementById('auditLogList');
    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat...</p>';

    try {
        const snapshot = await db.collection('auditLogs')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        allAuditLogs = [];
        snapshot.forEach(doc => {
            allAuditLogs.push({ id: doc.id, ...doc.data() });
        });

        renderAuditLog(allAuditLogs);

    } catch (error) {
        console.error('Error loading audit log:', error);
        listEl.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat log.</p>';
    }
}

function renderAuditLog(logs) {
    const listEl = document.getElementById('auditLogList');

    if (logs.length === 0) {
        listEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">ðŸ“‹</div>
                        <div class="empty-state-text">Tidak ada log aktivitas</div>
                    </div>
                `;
        return;
    }

    let html = '';
    logs.forEach(log => {
        const icon = log.type === 'login' ? 'ðŸ”' :
            log.type === 'user' ? 'ðŸ‘¤' :
                log.type === 'config' ? 'âš™ï¸' : 'ðŸ”’';
        const time = log.timestamp?.toDate ?
            log.timestamp.toDate().toLocaleString('id-ID') : 'Unknown';

        html += `
                    <div class="audit-log-item">
                        <div class="audit-icon action-${log.type}">${icon}</div>
                        <div class="audit-content">
                            <div class="audit-action">${log.action}</div>
                            <div class="audit-details">${log.userId}</div>
                        </div>
                        <div class="audit-time">${time}</div>
                    </div>
                `;
    });

    listEl.innerHTML = html;
}

function filterAuditLog() {
    const searchTerm = document.getElementById('auditSearchInput').value.toLowerCase();
    const filterType = document.getElementById('auditFilterType').value;

    const filtered = allAuditLogs.filter(log => {
        const matchesSearch = log.action.toLowerCase().includes(searchTerm) ||
            log.userId?.toLowerCase().includes(searchTerm);
        const matchesType = filterType === 'all' || log.type === filterType;
        return matchesSearch && matchesType;
    });

    renderAuditLog(filtered);
}

async function getAuditLogForUser(email) {
    try {
        const snapshot = await db.collection('auditLogs')
            .where('userId', '==', email)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const logs = [];
        snapshot.forEach(doc => logs.push(doc.data()));
        return logs;
    } catch (error) {
        console.error('Error getting user audit log:', error);
        return [];
    }
}

function exportAuditLog() {
    const text = JSON.stringify(allAuditLogs, null, 2);
    navigator.clipboard.writeText(text)
        .then(() => showMessage('ðŸ“‹ Log berhasil disalin'))
        .catch(() => showMessage('âŒ Gagal menyalin log'));
}

async function clearAuditLog() {
    if (!confirm('Yakin ingin menghapus log lama (lebih dari 30 hari)?')) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
        const snapshot = await db.collection('auditLogs')
            .where('timestamp', '<', thirtyDaysAgo)
            .get();

        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        showMessage(`âœ… ${snapshot.size} log lama dihapus`);
        loadAuditLog();
    } catch (error) {
        console.error('Error clearing audit log:', error);
        showMessage('âŒ Gagal menghapus log');
    }
}

// =====================================================
// TAB NAVIGATION
// =====================================================
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick*="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Load data for the selected tab
    switch (tabName) {
        case 'accessRequests':
            loadAccessRequests();
            break;
        case 'userManagement':
            loadEnhancedUserList();
            break;
        case 'roleManagement':
            loadCustomRoles();
            break;
        case 'systemConfig':
            loadSystemConfig();
            break;
        case 'auditLog':
            loadAuditLog();
            break;
    }
}


// =====================================================
// SISTEM PROTEKSI DATA (UNSAVED CHANGES)
// =====================================================
let isDirty = false;

function setDirty(dirty) {
    isDirty = dirty;
    updateSaveButtonState();
}

function updateSaveButtonState() {
    const saveBtn = document.getElementById('saveBtn');
    if (isDirty) {
        saveBtn.classList.add('unsaved');
        saveBtn.title = 'âš ï¸ Ada perubahan belum disimpan! Klik untuk simpan.';
    } else {
        saveBtn.classList.remove('unsaved');
        saveBtn.title = 'Simpan Data';
    }
}

// Browser beforeunload protection
window.addEventListener('beforeunload', function (e) {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Perubahan yang Anda buat mungkin tidak disimpan.';
        return e.returnValue;
    }
});

// Back button protection (for mobile)
window.addEventListener('popstate', function (e) {
    if (isDirty) {
        if (!confirm('Perubahan yang Anda buat mungkin tidak disimpan. Yakin ingin keluar?')) {
            history.pushState(null, '', window.location.href);
        }
    }
});

// Push initial state for back button protection
history.pushState(null, '', window.location.href);

// =====================================================
// SISTEM HAK AKSES & ROLE
// =====================================================
let currentUserRole = null; // 'superadmin', 'admin', 'staff', atau null


async function checkUserRole(email) {
    // Check if super admin
    if (email === SUPER_ADMIN_EMAIL) {
        return 'superadmin';
    }

    // Check from Firebase
    try {
        const doc = await db.collection('users').doc(email).get();
        if (doc.exists) {
            return doc.data().role || 'staff';
        }
    } catch (error) {
        console.error('Error checking user role:', error);
    }

    return null; // Not registered
}

function updateUIForRole() {
    const adminModeSection = document.getElementById('adminModeSection');
    const userManagementSection = document.getElementById('userManagementSection');
    const userRoleBadge = document.getElementById('userRoleBadge');

    // Reset
    adminModeSection.style.display = 'none';
    userManagementSection.style.display = 'none';
    userRoleBadge.innerHTML = '';

    if (!currentUserRole) return;

    // Show role badge
    let badgeClass = '';
    let badgeText = '';

    switch (currentUserRole) {
        case 'superadmin':
            badgeClass = 'badge-superadmin';
            badgeText = 'ðŸ‘‘ Super Admin';
            adminModeSection.style.display = 'none';
            userManagementSection.style.display = 'block';
            break;
        case 'admin':
            badgeClass = 'badge-admin';
            badgeText = 'ðŸ”‘ Admin';
            adminModeSection.style.display = 'none';
            break;
        case 'staff':
            badgeClass = 'badge-staff';
            badgeText = 'ðŸ‘¤ Staff';
            break;
    }

    userRoleBadge.innerHTML = `<span class="user-role-badge ${badgeClass}">${badgeText}</span>`;
}

// =====================================================
// USER MANAGEMENT (SUPER ADMIN ONLY)
// =====================================================
async function loadUserList() {
    if (currentUserRole !== 'superadmin') return;

    const userList = document.getElementById('userList');
    userList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat...</p>';

    try {
        const snapshot = await db.collection('users').get();

        if (snapshot.empty) {
            userList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Belum ada pengguna terdaftar.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const email = doc.id;
            const role = data.role || 'staff';
            const roleLabel = role === 'admin' ? 'ðŸ”‘ Admin' : 'ðŸ‘¤ Staff';

            html += `
                        <div class="user-item">
                            <div class="user-item-info">
                                <div class="user-item-email">${email}</div>
                                <div class="user-item-role">${roleLabel}</div>
                            </div>
                            <div class="user-item-actions">
                                <button onclick="changeUserRole('${email}', '${role === 'admin' ? 'staff' : 'admin'}')" style="background-color: var(--accent-color);">
                                    ${role === 'admin' ? 'ðŸ‘¤' : 'ðŸ”‘'}
                                </button>
                                <button onclick="deleteUser('${email}')" class="btn-delete">ðŸ—‘ï¸</button>
                            </div>
                        </div>
                    `;
        });

        userList.innerHTML = html;
    } catch (error) {
        console.error('Error loading users:', error);
        userList.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat pengguna.</p>';
    }
}

async function addNewUser() {
    if (currentUserRole !== 'superadmin') return;

    const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
    const role = document.getElementById('newUserRole').value;

    if (!email) {
        showMessage('âŒ Email tidak boleh kosong');
        return;
    }

    if (!email.includes('@')) {
        showMessage('âŒ Format email tidak valid');
        return;
    }

    if (email === SUPER_ADMIN_EMAIL) {
        showMessage('âŒ Email Super Admin tidak bisa ditambahkan');
        return;
    }

    showLoading('Menambahkan pengguna...');

    try {
        await db.collection('users').doc(email).set({
            role: role,
            createdAt: new Date(),
            createdBy: auth.currentUser.email
        });

        document.getElementById('newUserEmail').value = '';
        await loadUserList();
        showMessage(`âœ… Pengguna ${email} berhasil ditambahkan sebagai ${role}`);
    } catch (error) {
        console.error('Error adding user:', error);
        showMessage('âŒ Gagal menambahkan pengguna: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function changeUserRole(email, newRole) {
    if (currentUserRole !== 'superadmin') return;

    try {
        await db.collection('users').doc(email).update({ role: newRole });
        await loadUserList();
        showMessage(`âœ… Role ${email} diubah menjadi ${newRole}`);
    } catch (error) {
        console.error('Error changing role:', error);
        showMessage('âŒ Gagal mengubah role');
    }
}

async function deleteUser(email) {
    if (currentUserRole !== 'superadmin') return;

    if (!confirm(`Yakin ingin menghapus akses untuk ${email}?`)) return;

    try {
        await db.collection('users').doc(email).delete();
        await loadUserList();
        showMessage(`âœ… Pengguna ${email} berhasil dihapus`);
    } catch (error) {
        console.error('Error deleting user:', error);
        showMessage('âŒ Gagal menghapus pengguna');
    }
}

function openUserManagementModal() {
    if (currentUserRole !== 'superadmin') return;
    toggleSettingsModal();
    document.getElementById('userManagementModal').classList.add('show');
    loadUserList();
}

function closeUserManagementModal() {
    document.getElementById('userManagementModal').classList.remove('show');
}

// =====================================================
// SISTEM CACHE DATA - INTI EFISIENSI
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
            return doc.exists ? doc.data().data : null;
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
// VARIABEL GLOBAL
// =====================================================
let currentDate = new Date();
let currentTheme = localStorage.getItem('theme') || 'light';
let selectedRowIndex = null;
let isLoading = false;
let currentLoadId = 0;

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const DEFAULT_REPORT_TEMPLATE = `LAPORAN HARIAN
TOKO    : FWYJ PERMATA ROYAL
TGL  SALES :{tglSales}

âœ… SALES HARIAN
sift  : sales net/std
Sift 1 : {salesS1}/{strukS1}
Sift 2 : {salesS2}/{strukS2}

TOTAL NET = {totalNet}
TOTAL STRUK : {totalStruk}
AKM SALES : {akmSales}
AKM STRUK : {akmStruk}

âœ… SALES LALU
NET SALES : {prev_totalNet}
TOTAL STRUK : {prev_totalStruk}
SPD LALU : {prev_spd}
STD LALU  : {prev_std}

âœ… SPD
SPD NOW : {spd}
SPD LALU  : {prev_spd}
GROWTH VS LALU : {growthSpd}

âœ… STD
STD NOW : {std}
STD LALU : {prev_std}
GROWTH VS LALU : {growthStd}

âœ… APC
APC NOW : {apc}
APC LALU : {prev_apc}
GROWTH VS LALU : {growthApc}`;

const REPORT_PLACEHOLDERS = [
    'tglSales', 'salesS1', 'salesS2', 'totalNet', 'akmSales', 'spd', 'growthSpd',
    'strukS1', 'strukS2', 'totalStruk', 'akmStruk', 'std', 'growthStd', 'apc', 'growthApc',
    'prev_totalNet', 'prev_totalStruk', 'prev_spd', 'prev_std', 'prev_apc'
];

// =====================================================
// FUNGSI LOADING & UI
// =====================================================
// Flag untuk menandai data sudah dimuat
let isDataLoaded = false;

function showLoading(text = 'Memuat data...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('show');
    setNavigationEnabled(false);
    // Disable save button saat loading
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = true;
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
    setNavigationEnabled(true);
    // Re-enable save button setelah loading selesai
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = false;
}

function setNavigationEnabled(enabled) {
    document.getElementById('btnPrev').disabled = !enabled;
    document.getElementById('btnNext').disabled = !enabled;
}

function updateCacheStatus(status) {
    const el = document.getElementById('cacheStatus');
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
// FUNGSI UTILITAS
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

// =====================================================
// TEMA
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
    if (currentTheme === 'dark') {
        icon.textContent = 'â˜€ï¸'; text.textContent = 'Light';
    } else {
        icon.textContent = 'ðŸŒ™'; text.textContent = 'Dark';
    }
}

// =====================================================
// NAVIGASI BULAN - DENGAN PROTEKSI
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
// INISIALISASI BULAN - FUNGSI UTAMA
// =====================================================
async function initializeMonth() {
    const loadId = ++currentLoadId;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    showLoading('Memuat data...');
    updateCacheStatus('pending');
    isDataLoaded = false; // Reset flag saat mulai loading

    try {
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

        calculateAllRows();
        updateSummary();


        updateCacheStatus('synced');
        scrollToToday();
        isDataLoaded = true; // Set flag setelah data berhasil dimuat

    } catch (error) {
        console.error('Error initializing month:', error);
        updateCacheStatus('error');
        showMessage('âŒ Gagal memuat data: ' + error.message);
    } finally {
        if (loadId === currentLoadId) {
            hideLoading();
        }
    }
}

// =====================================================
// GENERATE TABEL (TANPA DATA)
// =====================================================
function generateTableStructure() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);

    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    document.getElementById('dayCount').textContent = `${daysInMonth} hari`;

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    deselectAllRows();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const row = document.createElement('tr');
        row.dataset.rowindex = day - 1;
        if (isWeekend(date)) row.classList.add('weekend');

        row.innerHTML = `
                    <td class="number-cell">${day}</td>
                    <td class="date-cell">${formatDate(date)}</td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="0"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="1"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="2"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="3"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="4"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="5"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="6"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="7"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="8"></td>
                    <td><input type="text" inputmode="decimal" data-row="${day - 1}" data-input="9"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="10"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="11"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="12"></td>
                    <td><input type="text" readonly data-row="${day - 1}" data-input="13"></td>
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
    // Shift inputs (0, 1, 6, 7)
    [0, 1, 6, 7].forEach(index => {
        const input = inputs[index];
        setupEnterNavigation(input, rowIndex, index, totalDays);
        input.addEventListener('input', function () {
            formatInputValue(this);
            const totalInput = inputs[(index <= 1) ? 2 : 8];
            delete totalInput.dataset.manual;
            totalInput.classList.remove('manual-override');
            handleRowChange(rowIndex);
            setDirty(true); // Mark as dirty
        });
        if (index === 0 || index === 1) {
            input.addEventListener('blur', function () { checkUnreasonableValue(this); });
        }
    });

    // Total & AKM inputs (2, 3, 8, 9)
    [2, 8, 3, 9].forEach(index => {
        const input = inputs[index];
        if (index === 2 || index === 8) {
            setupTotalEnterJump(input, rowIndex, index, totalDays);
        }
        input.addEventListener('input', function () {
            formatInputValue(this);
            const hasValue = this.value.trim() !== '';
            this.dataset.manual = hasValue ? 'true' : 'false';
            this.classList.toggle('manual-override', hasValue);

            if ((index === 2 || index === 8) && hasValue) {
                const totalVal = parseNumber(this.value);
                const half = Math.floor(totalVal / 2);
                const remainder = totalVal - half;
                if (index === 2) {
                    inputs[0].value = formatNumber(half);
                    inputs[1].value = formatNumber(remainder);
                } else {
                    inputs[6].value = formatNumber(half);
                    inputs[7].value = formatNumber(remainder);
                }
            }
            handleRowChange(rowIndex);
            setDirty(true); // Mark as dirty
        });
    });
}

function setupEnterNavigation(input, rowIndex, inputIndex, totalRows) {
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const rows = document.getElementById('tableBody').rows;
            const navOrder = [0, 1, 6, 7];
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
        if (!confirm(`âš ï¸ Angka yang kamu input (${inputElement.value}) tampaknya tidak wajar. Yakin data sudah benar?`)) {
            setTimeout(() => { inputElement.focus(); inputElement.select(); }, 0);
        }
    }
}

// =====================================================
// POPULATE DATA KE TABEL
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
        inputs[6].value = formatNumber(d.st1);
        inputs[7].value = formatNumber(d.st2);

        inputs[2].value = formatNumber(d.totalNet);
        inputs[3].value = formatNumber(d.akmSales);
        inputs[4].value = formatNumber(d.spd);
        inputs[8].value = formatNumber(d.totalStruk);
        inputs[9].value = formatNumber(d.akmStruk);
        inputs[10].value = formatNumber(d.std);
        inputs[12].value = formatNumber(d.apc);

        if (d.m_total) {
            inputs[2].dataset.manual = 'true';
            inputs[2].classList.add('manual-override');
        }
        if (d.m_akmS) {
            inputs[3].dataset.manual = 'true';
            inputs[3].classList.add('manual-override');
        }
        if (d.m_totalSt) {
            inputs[8].dataset.manual = 'true';
            inputs[8].classList.add('manual-override');
        }
        if (d.m_akmSt) {
            inputs[9].dataset.manual = 'true';
            inputs[9].classList.add('manual-override');
        }
    }
}

// =====================================================
// KALKULASI BARIS
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

    const strukShift1 = parseNumber(inputs[6].value);
    const strukShift2 = parseNumber(inputs[7].value);

    if (inputs[8].dataset.manual !== 'true') {
        inputs[8].value = formatNumber(strukShift1 + strukShift2);
    }
    const totalStruk = parseNumber(inputs[8].value);

    if (inputs[9].dataset.manual !== 'true') {
        const prevAkm = rowIndex > 0 ? parseNumber(rows[rowIndex - 1].getElementsByTagName('input')[9].value) : 0;
        inputs[9].value = formatNumber(totalStruk + prevAkm);
    }
    const akmStruk = parseNumber(inputs[9].value);
    const std = akmStruk / (rowIndex + 1);
    inputs[10].value = formatNumber(Math.floor(std));

    const apc = (spd > 0 && std > 0) ? (spd / std) : 0;
    inputs[12].value = formatNumber(apc);

    inputs[5].value = '';
    inputs[11].value = '';
    inputs[13].value = '';

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
            inputs[5].value = formatGrowth(growth);
            applyGrowthColor(inputs[5], growth);
        }

        if (std > 0 && prevStd > 0) {
            const growth = ((std / prevStd) - 1) * 100;
            inputs[11].value = formatGrowth(growth);
            applyGrowthColor(inputs[11], growth);
        }

        if (apc > 0 && prevApc > 0) {
            const growth = ((apc / prevApc) - 1) * 100;
            inputs[13].value = formatGrowth(growth);
            applyGrowthColor(inputs[13], growth);
        }
    }
}

function addSummaryRow() {
    const row = document.getElementById('tableBody').insertRow();
    row.className = 'summary';
    row.innerHTML = `
                <td colspan="2">TOTAL / RATA-RATA</td>
                <td id="sumShift1Penjualan">-</td>
                <td id="sumShift2Penjualan">-</td>
                <td id="totalPenjualan">-</td>
                <td>-</td><td>-</td><td>-</td>
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
        sumS1P += parseNumber(inputs[0].value);
        sumS2P += parseNumber(inputs[1].value);
        sumS1S += parseNumber(inputs[6].value);
        sumS2S += parseNumber(inputs[7].value);
        const apc = parseNumber(inputs[12].value);
        if (apc > 0) { totalA += apc; countA++; }
    }

    document.getElementById('sumShift1Penjualan').textContent = formatNumber(sumS1P) || '-';
    document.getElementById('sumShift2Penjualan').textContent = formatNumber(sumS2P) || '-';
    document.getElementById('totalPenjualan').textContent = formatNumber(sumS1P + sumS2P) || '-';
    document.getElementById('sumShift1Struk').textContent = formatNumber(sumS1S) || '-';
    document.getElementById('sumShift2Struk').textContent = formatNumber(sumS2S) || '-';
    document.getElementById('totalStruk').textContent = formatNumber(sumS1S + sumS2S) || '-';
    document.getElementById('avgAPC').textContent = countA > 0 ? formatNumber(totalA / countA) : '-';
}

// =====================================================
// SIMPAN DATA
// =====================================================
async function manualSave() {
    // Cek apakah data sudah dimuat
    if (!isDataLoaded) {
        showMessage('Tunggu data selesai dimuat sebelum menyimpan');
        return;
    }

    // Cek apakah ada data yang valid (tidak semua kosong)
    const data = collectTableData();
    const hasData = data.some(row => row.s1 > 0 || row.s2 > 0 || row.st1 > 0 || row.st2 > 0);
    if (!hasData) {
        if (!confirm('Semua data kosong. Yakin ingin menyimpan data kosong?')) {
            return;
        }
    }

    if (!auth.currentUser) {
        showMessage('âš ï¸ Login dulu untuk menyimpan!');
        return;
    }

    showLoading('Menyimpan data...');

    try {
        await saveDataToServer();
        setDirty(false); // Reset dirty flag on success
        showMessage('âœ… Data tersimpan ke server');
        updateCacheStatus('synced');
    } catch (error) {
        console.error('Save error:', error);
        showMessage('âŒ Gagal simpan: ' + error.message);
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

    await db.collection("salesReports").doc(docId).set({
        data: data,
        timestamp: new Date()
    });

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
            st1: parseNumber(inputs[6].value) || 0,
            st2: parseNumber(inputs[7].value) || 0,
            totalNet: parseNumber(inputs[2].value) || 0,
            akmSales: parseNumber(inputs[3].value) || 0,
            spd: parseNumber(inputs[4].value) || 0,
            totalStruk: parseNumber(inputs[8].value) || 0,
            akmStruk: parseNumber(inputs[9].value) || 0,
            std: parseNumber(inputs[10].value) || 0,
            apc: parseNumber(inputs[12].value) || 0,
            m_total: inputs[2].dataset.manual === 'true',
            m_akmS: inputs[3].dataset.manual === 'true',
            m_totalSt: inputs[8].dataset.manual === 'true',
            m_akmSt: inputs[9].dataset.manual === 'true'
        });
    }
    return data;
}

// =====================================================
// HAPUS DATA
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
        showMessage('âœ… Data berhasil dihapus');
        toggleSettingsModal();
    } catch (e) {
        console.error('Delete error:', e);
        showMessage('âŒ Gagal hapus: ' + e.message);
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

        if (!inputs[2] || inputs[2].value.trim() === '' || !inputs[8] || inputs[8].value.trim() === '') continue;

        data.push({
            no: i + 1,
            tanggal: cells[1].textContent,
            s1: parseNumber(inputs[0].value) || 0,
            s2: parseNumber(inputs[1].value) || 0,
            totalNet: parseNumber(inputs[2].value) || 0,
            akmNet: parseNumber(inputs[3].value) || 0,
            st1: parseNumber(inputs[6].value) || 0,
            st2: parseNumber(inputs[7].value) || 0,
            totalStruk: parseNumber(inputs[8].value) || 0,
            akmStruk: parseNumber(inputs[9].value) || 0
        });
    }

    document.getElementById('exportTextArea').value = JSON.stringify(data, null, 2);
    toggleSettingsModal();
    toggleExportModal();
    showMessage('âœ… Data siap untuk disalin');
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

        document.getElementById('exportTextArea').value = JSON.stringify(allData, null, 2);
        toggleSettingsModal();
        toggleExportModal();
        showMessage('âœ… Data semua bulan siap untuk disalin');
    } catch (e) {
        console.error('Export all error:', e);
        showMessage('âŒ Gagal export: ' + e.message);
    } finally {
        hideLoading();
    }
}

// =====================================================
// IMPORT DATA
// =====================================================
async function handleImport() {
    const textarea = document.getElementById('importTextArea');
    const rawText = textarea.value;

    if (!rawText || !rawText.trim()) {
        showMessage('âŒ Kolom import kosong');
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

            inputs[6].value = formatNumber(parseFloat(rowData.st1) || 0);
            inputs[7].value = formatNumber(parseFloat(rowData.st2) || 0);

            const sumStruk = (parseFloat(rowData.st1) || 0) + (parseFloat(rowData.st2) || 0);
            const totalStrukVal = parseFloat(rowData.totalStruk) || 0;
            inputs[8].value = formatNumber(totalStrukVal);

            if (totalStrukVal !== 0 && Math.round(totalStrukVal) !== Math.round(sumStruk)) {
                inputs[8].dataset.manual = 'true';
                inputs[8].classList.add('manual-override');
            } else {
                delete inputs[8].dataset.manual;
                inputs[8].classList.remove('manual-override');
            }

            delete inputs[9].dataset.manual;
            inputs[9].classList.remove('manual-override');
        });

        calculateAllRows();
        updateSummary();
        setDirty(true);

        textarea.value = '';
        showMessage('âœ… Data berhasil di-import');
        toggleImportModal();
        toggleSettingsModal();
    } catch (e) {
        console.error('Import error:', e);
        showMessage('âŒ Gagal import: Format teks tidak valid');
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
        .then(() => showMessage('ðŸ“‹ Teks berhasil disalin'))
        .catch(() => showMessage('âŒ Gagal menyalin teks'));
}

// =====================================================
// SELEKSI BARIS & COPY REPORT
// =====================================================
function selectRow(rowIndex) {
    deselectAllRows();
    const row = document.querySelector(`tr[data-rowindex="${rowIndex}"]`);
    if (row) {
        row.classList.add('selected-row');
        selectedRowIndex = rowIndex;
        const dateText = row.cells[1].textContent.split(', ')[1];
        document.getElementById('copyReportBtn').title = `Salin Laporan untuk ${dateText}`;
    }
}

function deselectAllRows() {
    const currentlySelected = document.querySelector('.selected-row');
    if (currentlySelected) currentlySelected.classList.remove('selected-row');
    selectedRowIndex = null;
    document.getElementById('copyReportBtn').title = 'Salin Laporan (Pilih tanggal dulu)';
}

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
    const dataNow = {
        tglSales: rows[rowIndex].cells[1].textContent.split(', ')[1],
        salesS1: formatReportNumber(parseNumber(currentInputs[0].value)),
        salesS2: formatReportNumber(parseNumber(currentInputs[1].value)),
        totalNet: formatReportNumber(parseNumber(currentInputs[2].value)),
        akmSales: formatReportNumber(parseNumber(currentInputs[3].value)),
        spd: formatReportNumber(parseNumber(currentInputs[4].value)),
        growthSpd: formatGrowthForReport(currentInputs[5].value),
        strukS1: formatReportNumber(parseNumber(currentInputs[6].value)),
        strukS2: formatReportNumber(parseNumber(currentInputs[7].value)),
        totalStruk: formatReportNumber(parseNumber(currentInputs[8].value)),
        akmStruk: formatReportNumber(parseNumber(currentInputs[9].value)),
        std: formatReportNumber(parseNumber(currentInputs[10].value)),
        growthStd: formatGrowthForReport(currentInputs[11].value),
        apc: formatReportNumber(parseNumber(currentInputs[12].value)),
        growthApc: formatGrowthForReport(currentInputs[13].value)
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
        showMessage('âŒ Data tidak ditemukan untuk disalin.');
        return;
    }

    let template = localStorage.getItem('reportTemplate') || DEFAULT_REPORT_TEMPLATE;
    let reportText = template.replace(/\{(\w+)\}/g, (match, key) => reportData[key] || '0');

    navigator.clipboard.writeText(reportText)
        .then(() => {
            showMessage('âœ… Laporan berhasil disalin!');
            deselectAllRows();
        })
        .catch(err => showMessage('âŒ Gagal menyalin laporan.'));
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
    document.getElementById('reportTemplateTextarea').value =
        localStorage.getItem('reportTemplate') || DEFAULT_REPORT_TEMPLATE;

    const tagsContainer = document.querySelector('.placeholder-tags');
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
    localStorage.setItem('reportTemplate', document.getElementById('reportTemplateTextarea').value);
    showMessage('âœ… Template berhasil disimpan.');
    toggleTemplateEditor();
}

function resetTemplate() {
    if (confirm('Yakin ingin mengembalikan template ke default?')) {
        document.getElementById('reportTemplateTextarea').value = DEFAULT_REPORT_TEMPLATE;
        saveTemplate();
    }
}

// =====================================================
// QUICK INPUT MODAL - STATION BASED
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
    document.getElementById('quickInputTitle').textContent = `Input Cepat - ${formatDate(today).split(', ')[1]}`;

    const rowIndex = today.getDate() - 1;
    const row = document.getElementById('tableBody').rows[rowIndex];
    const inputs = row ? row.getElementsByTagName('input') : [{}, {}, {}, {}, {}, {}, {}, {}];

    // Get existing values
    const existingS1 = parseNumber(inputs[0].value);
    const existingS2 = parseNumber(inputs[1].value);
    const existingSt1 = parseNumber(inputs[6].value);
    const existingSt2 = parseNumber(inputs[7].value);

    body.innerHTML = `
                <div id="quickInputForm">
                    <!-- Penjualan Shift 1 -->
                    <div class="station-block">
                        <div class="station-block-title">ðŸ’° Penjualan Net (Shift 1)</div>
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
                        <div class="station-block-title">ðŸ’° Penjualan Net (Shift 2)</div>
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
                        <div class="station-block-title">ðŸ§¾ Struk (Shift 1)</div>
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
                        <div class="station-block-title">ðŸ§¾ Struk (Shift 2)</div>
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

                    <button id="quickSaveBtn" onclick="handleQuickSave()">ðŸ’¾ Simpan Data</button>
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
    if (!row) { showMessage('âŒ Terjadi kesalahan'); return; }

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
                    <h3>âœ“ Data Berhasil Disimpan!</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 15px;">
                        Penjualan S1: ${formatNumber(salesS1)}<br>
                        Penjualan S2: ${formatNumber(salesS2)}<br>
                        Struk S1: ${formatNumber(strukS1)}<br>
                        Struk S2: ${formatNumber(strukS2)}
                    </p>
                    <div class="action-buttons">
                        <button onclick="manualSave().then(() => handleCopyReport(${rowIndex}))">ðŸ’¾ Simpan & Salin Laporan</button>
                        <button onclick="handleCopyReport(${rowIndex})">ðŸ“‹ Salin Laporan Saja</button>
                        <button onclick="closeQuickInputModal()">âœ“ Selesai</button>
                    </div>
                </div>
            `;
}

// =====================================================
// SCROLL TO TODAY
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
// AUTENTIKASI
// =====================================================
function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            showMessage('âœ… Login berhasil: ' + result.user.displayName);
        })
        .catch((error) => {
            console.error("Login error:", error);
            showMessage('âŒ Login gagal: ' + error.message);
        });
}

function logoutGoogle() {
    if (isDirty) {
        if (!confirm('Ada perubahan yang belum disimpan. Yakin ingin keluar?')) {
            return;
        }
    }

    auth.signOut().then(() => {
        DataCache.clear();
        currentUserRole = null;
        adminModeEnabled = false;
        setDirty(false);
        showMessage('Sampai jumpa!');
        generateTableStructure();
        updateUIForRole();
    });
}

// Auth state listener
auth.onAuthStateChanged(async (user) => {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');



    if (user) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        console.log("User ID:", user.uid);
        console.log("User Email:", user.email);

        // Check user role
        currentUserRole = await checkUserRole(user.email);

        if (!currentUserRole) {
            // User not registered - submit access request automatically
            await submitAccessRequest(user.email);
            showMessage('ðŸ“§ Email Anda belum terdaftar. Permintaan akses telah dikirim ke admin.');
            await logAuditAction('login', `Login attempt from unregistered user: ${user.email}`);
            updateUIForRole();
            generateTableStructure();

            hideLoading();
            return;
        }

        // Check if user is active
        try {
            const userDoc = await db.collection('users').doc(user.email).get();
            if (userDoc.exists && userDoc.data().active === false) {
                showMessage('ðŸ”’ Akun Anda dinonaktifkan. Hubungi admin.');
                await logAuditAction('security', `Login attempt from disabled account: ${user.email}`);
                currentUserRole = null;
                updateUIForRole();
                generateTableStructure();

                hideLoading();
                return;
            }
        } catch (e) {
            console.error('Error checking user status:', e);
        }

        await logAuditAction('login', `User logged in: ${user.email}`);
        updateUIForRole();
        await initializeMonth();
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        currentUserRole = null;
        adminModeEnabled = false;
        updateUIForRole();
        showMessage('Silakan Login untuk menyimpan data');
        generateTableStructure();
        hideLoading();
    }
});

// =====================================================
// INISIALISASI APLIKASI
// =====================================================
window.onload = function () {
    initTheme();
    generateTableStructure();
    updateSaveButtonState();
};
