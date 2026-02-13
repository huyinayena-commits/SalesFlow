// =====================================================
// AUTH.JS - AUTENTIKASI DAN HAK AKSES
// =====================================================

// =====================================================
// LOGIN & LOGOUT
// =====================================================
function loginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            showMessage('Login berhasil: ' + result.user.displayName);
        })
        .catch((error) => {
            console.error("Login error:", error);
            showMessage('Login gagal: ' + error.message);
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

// =====================================================
// ROLE MANAGEMENT
// =====================================================
async function checkUserRole(email) {
    // Check if super admin
    console.log('Checking Role. Port:', window.location.port, 'Email:', email);
    if (email === SUPER_ADMIN_EMAIL || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Super Admin detected via port or email');
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
    if (adminModeSection) adminModeSection.style.display = 'none';
    if (userManagementSection) userManagementSection.style.display = 'none';
    if (userRoleBadge) userRoleBadge.innerHTML = '';

    if (!currentUserRole) return;

    // Show role badge
    let badgeClass = '';
    let badgeText = '';

    switch (currentUserRole) {
        case 'superadmin':
            badgeClass = 'badge-superadmin';
            badgeText = 'Super Admin';
            if (adminModeSection) adminModeSection.style.display = 'none';
            if (userManagementSection) userManagementSection.style.display = 'block';
            break;
        case 'admin':
            badgeClass = 'badge-admin';
            badgeText = 'Admin';
            if (adminModeSection) adminModeSection.style.display = 'none';
            break;
        case 'staff':
            badgeClass = 'badge-staff';
            badgeText = 'Staff';
            break;
    }

    if (userRoleBadge) {
        userRoleBadge.innerHTML = `<span class="user-role-badge ${badgeClass}">${badgeText}</span>`;
    }
}

// =====================================================
// ACCESS REQUEST SYSTEM
// =====================================================
async function submitAccessRequest(email) {
    if (!systemConfig.openRegistration) {
        showMessage('Registrasi ditutup. Hubungi admin.');
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
        showMessage('Permintaan akses telah dikirim. Menunggu persetujuan admin.');
    } catch (error) {
        console.error('Error submitting access request:', error);
        showMessage('Gagal mengirim permintaan akses');
    }
}

async function loadAccessRequests() {
    const listEl = document.getElementById('accessRequestsList');
    if (!listEl) return;

    listEl.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Memuat...</p>';

    try {
        const snapshot = await db.collection('accessRequests')
            .orderBy('requestedAt', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">Tidak ada</div>
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
                            <div class="request-time">${requestTime}</div>
                        </div>
                        <div class="request-actions">
                            <select id="roleFor_${email.replace(/[@.]/g, '_')}">
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button class="btn-approve" onclick="approveAccessRequest('${email}')">Setujui</button>
                            <button class="btn-reject" onclick="rejectAccessRequest('${email}')">Tolak</button>
                        </div>
                    </div>
                `;
            } else {
                const statusText = data.status === 'approved' ? 'Disetujui' : 'Ditolak';
                html += `
                    <div class="access-request-item ${statusClass}">
                        <div class="request-info">
                            <div class="request-email">${email}</div>
                            <div class="request-time">${statusText} - ${requestTime}</div>
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
    const statPending = document.getElementById('statPendingRequests');
    const statApproved = document.getElementById('statApprovedToday');
    const statRejected = document.getElementById('statRejectedToday');
    const badge = document.getElementById('pendingRequestsBadge');

    if (statPending) statPending.textContent = pending;
    if (statApproved) statApproved.textContent = approved;
    if (statRejected) statRejected.textContent = rejected;

    if (badge) {
        if (pending > 0) {
            badge.textContent = pending;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
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
        showMessage(`${email} disetujui sebagai ${role}`);
        loadAccessRequests();

    } catch (error) {
        console.error('Error approving request:', error);
        showMessage('Gagal menyetujui permintaan');
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
        showMessage(`Permintaan dari ${email} ditolak`);
        loadAccessRequests();

    } catch (error) {
        console.error('Error rejecting request:', error);
        showMessage('Gagal menolak permintaan');
    }
}

// =====================================================
// AUTH STATE LISTENER
// =====================================================
auth.onAuthStateChanged(async (user) => {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        console.log("User ID:", user.uid);
        console.log("User Email:", user.email);

        // Check user role
        currentUserRole = await checkUserRole(user.email);

        if (!currentUserRole) {
            // User not registered - submit access request automatically
            await submitAccessRequest(user.email);
            showMessage('Email Anda belum terdaftar. Permintaan akses telah dikirim ke admin.');
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
                showMessage('Akun Anda dinonaktifkan. Hubungi admin.');
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
        // Check for Dev/Live Preview Environment
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port === '3000') {
            console.log("Dev environment detected (Live Preview). Force Super Admin.");

            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';

            currentUserRole = 'superadmin';
            adminModeEnabled = true;

            updateUIForRole();
            showMessage('Mode Super Admin Aktif (Live Preview)');
            generateTableStructure();
            await initializeMonth();
            hideLoading();
            return;
        }

        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        currentUserRole = null;
        adminModeEnabled = false;
        updateUIForRole();
        showMessage('Silakan Login untuk menyimpan data');
        generateTableStructure();
        await initializeMonth();
        hideLoading();
    }
});
