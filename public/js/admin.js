// =====================================================
// ADMIN.JS - FITUR ADMIN (USER, ROLE, AUDIT)
// =====================================================

// =====================================================
// TAB NAVIGATION
// =====================================================
function switchAdminTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.tab-btn[onclick="switchAdminTab('${tabId}')"]`).classList.add('active');

    if (tabId === 'tabAccessRequests') loadAccessRequests();
    if (tabId === 'tabUsers') loadUsers();
    if (tabId === 'tabRoles') loadCustomRoles();
    if (tabId === 'tabAudit') loadAuditLogs();
    if (tabId === 'tabSystem') loadSystemConfig();
}

// Alias for HTML onclick
function switchTab(shortName) {
    const map = {
        'accessRequests': 'tabAccessRequests',
        'userManagement': 'tabUsers',
        'roleManagement': 'tabRoles',
        'systemConfig': 'tabSystem',
        'auditLog': 'tabAudit'
    };
    switchAdminTab(map[shortName]);
}

// =====================================================
// MODAL MANAGEMENT
// =====================================================
function openUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
        // Tutup settings modal dulu
        document.getElementById('settingsModal')?.classList.remove('show');
        // Tampilkan admin modal
        modal.classList.add('show');
        switchAdminTab('tabAccessRequests');
    }
}

function closeUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) modal.classList.remove('show');
}

// =====================================================
// USER MANAGEMENT
// =====================================================
async function loadUsers() {
    const userList = document.getElementById('userList');
    if (!userList) return;

    userList.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat pengguna...</p>';

    try {
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
        allUsers = []; // Update global users list

        if (snapshot.empty) {
            userList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"></div>
                    <div class="empty-state-text">Belum ada pengguna</div>
                </div>
            `;
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            allUsers.push({ id: doc.id, ...data });

            // Don't show super admin in the list to edit
            if (doc.id === SUPER_ADMIN_EMAIL) return;

            const statusClass = data.active ? 'status-active' : 'status-inactive';
            const statusText = data.active ? 'Aktif' : 'Nonaktif';
            const roleBadge = getRoleBadge(data.role);

            html += `
                <div class="user-item-enhanced ${!data.active ? 'inactive' : ''}">
                    <div class="user-avatar">${doc.id.charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <div class="user-name">${doc.id}</div>
                        <div class="user-meta">
                            ${roleBadge} • <span class="user-status-badge ${statusClass}">${statusText}</span>
                            • Terdaftar: ${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('id-ID') : '-'}
                        </div>
                    </div>
                    <div class="user-item-actions">
                        <button onclick="toggleUserStatus('${doc.id}', ${data.active})">
                            ${data.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <select onchange="changeUserRole('${doc.id}', this.value)" style="padding: 6px; border-radius: 6px;">
                            <option value="staff" ${data.role === 'staff' ? 'selected' : ''}>Staff</option>
                            <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <!-- Custom roles will be added here dynamically if we had them loaded -->
                        </select>
                    </div>
                </div>
            `;
        });

        userList.innerHTML = html;
        updateUserStats(allUsers);

    } catch (error) {
        console.error('Error loading users:', error);
        userList.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat data pengguna.</p>';
    }
}

function getRoleBadge(role) {
    if (role === 'admin') return '<span class="role-type-badge role-system">Admin</span>';
    if (role === 'staff') return '<span class="role-type-badge role-system">Staff</span>';
    return `<span class="role-type-badge role-custom">${role}</span>`;
}

function updateUserStats(users) {
    const total = users.length;
    const active = users.filter(u => u.active).length;

    // We assume these elements exist in the admin panel
    const statTotalUsers = document.getElementById('statTotalUsers');
    const statActiveUsers = document.getElementById('statActiveUsers');

    if (statTotalUsers) statTotalUsers.textContent = total;
    if (statActiveUsers) statActiveUsers.textContent = active;
}

async function toggleUserStatus(email, currentStatus) {
    const newStatus = !currentStatus;
    const action = newStatus ? 'mengaktifkan' : 'menonaktifkan';

    if (!confirm(`Yakin ingin ${action} akses untuk ${email}?`)) return;

    try {
        await db.collection('users').doc(email).update({
            active: newStatus,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('user', `User ${email} status changed to ${newStatus ? 'active' : 'inactive'}`);
        showMessage(`Status pengguna ${email} diperbarui`);
        loadUsers();

    } catch (error) {
        console.error('Error updating user status:', error);
        showMessage('Gagal memperbarui status pengguna');
    }
}

async function changeUserRole(email, newRole) {
    if (!confirm(`Ubah role ${email} menjadi ${newRole}?`)) {
        loadUsers(); // Reset select
        return;
    }

    try {
        await db.collection('users').doc(email).update({
            role: newRole,
            updatedAt: new Date(),
            updatedBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('user', `User ${email} role changed to ${newRole}`);
        showMessage(`Role pengguna ${email} diubah menjadi ${newRole}`);
        // No need to reload entire list, just implicit success
    } catch (error) {
        console.error('Error changing user role:', error);
        showMessage('Gagal mengubah role pengguna');
        loadUsers(); // Reset on error
    }
}

function refreshUserList() {
    loadUsers();
}

function filterUsers() {
    const input = document.getElementById('userSearchInput');
    const filter = input.value.toLowerCase();
    const list = document.getElementById('userList');

    // We need to re-render based on allUsers filtered
    if (!allUsers || allUsers.length === 0) return;

    const filtered = allUsers.filter(u =>
        u.id.toLowerCase().includes(filter) ||
        (u.role && u.role.toLowerCase().includes(filter))
    );

    // Re-use rendering logic (simplified duplication for now)
    let html = '';
    filtered.forEach(data => {
        // Don't show super admin in the list to edit
        if (data.id === SUPER_ADMIN_EMAIL) return;

        const statusClass = data.active ? 'status-active' : 'status-inactive';
        const statusText = data.active ? 'Aktif' : 'Nonaktif';
        const roleBadge = getRoleBadge(data.role);

        html += `
            <div class="user-item-enhanced ${!data.active ? 'inactive' : ''}">
                <div class="user-avatar">${data.id.charAt(0).toUpperCase()}</div>
                <div class="user-details">
                    <div class="user-name">${data.id}</div>
                    <div class="user-meta">
                        ${roleBadge} • <span class="user-status-badge ${statusClass}">${statusText}</span>
                        • Terdaftar: ${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString('id-ID') : '-'}
                    </div>
                </div>
                <div class="user-item-actions">
                    <button onclick="toggleUserStatus('${data.id}', ${data.active})">
                        ${data.active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <select onchange="changeUserRole('${data.id}', this.value)" style="padding: 6px; border-radius: 6px;">
                        <option value="staff" ${data.role === 'staff' ? 'selected' : ''}>Staff</option>
                        <option value="admin" ${data.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </div>
            </div>
        `;
    });

    if (html === '') html = '<div class="empty-state"><div class="empty-state-text">Tidak ditemukan</div></div>';
    list.innerHTML = html;
}

async function addNewUser() {
    const emailInput = document.getElementById('newUserEmail');
    const roleInput = document.getElementById('newUserRole');

    const email = emailInput.value.trim();
    const role = roleInput.value;

    if (!email) {
        showMessage('Email harus diisi');
        return;
    }

    try {
        // Check if user already exists
        const check = await db.collection('users').doc(email).get();
        if (check.exists) {
            showMessage('User sudah terdaftar');
            return;
        }

        await db.collection('users').doc(email).set({
            role: role,
            createdAt: new Date(),
            createdBy: auth.currentUser?.email || 'admin',
            active: true
        });

        await logAuditAction('user', `Added new user manually: ${email} as ${role}`);
        showMessage(`User ${email} berhasil ditambahkan`);
        emailInput.value = ''; // Reset input
        loadUsers(); // Refresh list

    } catch (error) {
        console.error('Error adding user:', error);
        showMessage('Gagal menambahkan user');
    }
}

// =====================================================
// CUSTOM ROLES MANAGEMENT
// =====================================================
async function loadCustomRoles() {
    const container = document.getElementById('rolesList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat role...</p>';

    try {
        const snapshot = await db.collection('customRoles').get();
        let html = '';

        // Default System Roles
        html += `
            <div class="role-card">
                <div class="role-header">
                    <span class="role-name">Admin</span>
                    <span class="role-type-badge role-system">System Info</span>
                </div>
                <div class="permission-list">
                    <span class="permission-tag granted">Full Access</span>
                    <span class="permission-tag granted">User Management</span>
                    <span class="permission-tag granted">System Config</span>
                </div>
            </div>
            <div class="role-card">
                <div class="role-header">
                    <span class="role-name">Staff</span>
                    <span class="role-type-badge role-system">System Default</span>
                </div>
                <div class="permission-list">
                    <span class="permission-tag granted">Input Data</span>
                    <span class="permission-tag granted">View Reports</span>
                </div>
            </div>
        `;

        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                const data = doc.data();
                html += `
                    <div class="role-card">
                        <div class="role-header">
                            <span class="role-name">${data.name}</span>
                            <div>
                                <span class="role-type-badge role-custom">Custom</span>
                                <button class="btn-delete" style="padding: 4px 8px; font-size: 10px; margin-left: 5px;" 
                                    onclick="deleteRole('${doc.id}')">Hapus</button>
                            </div>
                        </div>
                        <div class="permission-list">
                            ${data.permissions?.canEdit ? '<span class="permission-tag granted">Edit Data</span>' : ''}
                            ${data.permissions?.canDelete ? '<span class="permission-tag granted">Delete Data</span>' : ''}
                            ${data.permissions?.canExport ? '<span class="permission-tag granted">Export</span>' : ''}
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading roles:', error);
        container.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat role.</p>';
    }
}

async function createCustomRole() {
    const nameInput = document.getElementById('newRoleName');
    const name = nameInput.value.trim();

    if (!name) {
        showMessage('Nama role harus diisi');
        return;
    }

    const permissions = {
        canInput: document.getElementById('perm_inputData')?.checked || false,
        canViewReports: document.getElementById('perm_viewReports')?.checked || false,
        canExport: document.getElementById('perm_exportData')?.checked || false
    };

    await saveRole(name, permissions);
    nameInput.value = ''; // Reset
}

async function saveRole(name, permissions) {
    try {
        const id = name.toLowerCase().replace(/\s+/g, '_');
        await db.collection('customRoles').doc(id).set({
            name: name,
            permissions: permissions,
            createdAt: new Date(),
            createdBy: auth.currentUser?.email || 'localhost'
        });

        await logAuditAction('config', `Created new role: ${name}`);
        showMessage(`Role ${name} berhasil dibuat`);
        loadCustomRoles();
    } catch (error) {
        console.error('Error creating role:', error);
        showMessage('Gagal membuat role');
    }
}

async function deleteRole(roleId) {
    if (!confirm('Yakin ingin menghapus role ini?')) return;

    try {
        await db.collection('customRoles').doc(roleId).delete();
        await logAuditAction('config', `Deleted role: ${roleId}`);
        showMessage('Role berhasil dihapus');
        loadCustomRoles();
    } catch (error) {
        console.error('Error deleting role:', error);
        showMessage('Gagal menghapus role');
    }
}

// =====================================================
// AUDIT LOG SYSTEM
// =====================================================
async function logAuditAction(actionType, details, metadata = {}) {
    if (!systemConfig.auditLogging) return;

    try {
        await db.collection('auditLogs').add({
            actionType: actionType, // 'login', 'data_change', 'user_management', 'config', 'security'
            details: details,
            metadata: metadata,
            timestamp: new Date(),
            userEmail: auth.currentUser?.email || 'system',
            userAgent: navigator.userAgent
        });
    } catch (e) {
        console.error('Audit log failed:', e);
    }
}

async function loadAuditLogs() {
    const container = document.getElementById('auditLogList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat log...</p>';

    try {
        const snapshot = await db.collection('auditLogs')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        allAuditLogs = []; // Store globally for filtering

        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                allAuditLogs.push({ id: doc.id, ...doc.data() });
            });
        }

        renderAuditLogs(allAuditLogs);

    } catch (error) {
        console.error('Error loading audit logs:', error);
        container.innerHTML = '<p style="text-align:center; color: var(--delete-bg);">Gagal memuat log.</p>';
    }
}

function renderAuditLogs(logs) {
    const container = document.getElementById('auditLogList');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"></div>
                <div class="empty-state-text">Tidak ada riwayat aktivitas</div>
            </div>
        `;
        return;
    }

    let html = '';
    logs.forEach(data => {
        const date = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        const timeStr = date.toLocaleString('id-ID');
        let icon = '';
        let iconClass = '';

        switch (data.actionType) {
            case 'login': icon = 'L'; iconClass = 'action-login'; break;
            case 'user': icon = 'U'; iconClass = 'action-user'; break;
            case 'config': icon = 'C'; iconClass = 'action-config'; break;
            case 'security': icon = 'S'; iconClass = 'action-security'; break;
            default: icon = 'A'; iconClass = 'action-config';
        }

        html += `
            <div class="audit-log-item">
                <div class="audit-icon ${iconClass}">${icon}</div>
                <div class="audit-content">
                    <div class="audit-action">${data.details}</div>
                    <div class="audit-details">User: ${data.userEmail || 'System'}</div>
                </div>
                <div class="audit-time">${timeStr}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function filterAuditLog() {
    const input = document.getElementById('auditSearchInput');
    const typeSelect = document.getElementById('auditFilterType');

    const filterText = input.value.toLowerCase();
    const filterType = typeSelect.value;

    if (!allAuditLogs) return;

    const filtered = allAuditLogs.filter(log => {
        const matchesText = log.details.toLowerCase().includes(filterText) ||
            (log.userEmail && log.userEmail.toLowerCase().includes(filterText));
        const matchesType = filterType === 'all' || log.actionType === filterType;

        return matchesText && matchesType;
    });

    renderAuditLogs(filtered);
}

function refreshAuditLogs() {
    loadAuditLogs();
}
