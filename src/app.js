// ═══════════════════════════════════════════════════════════════════════════════
// GIT-SHIFT - Frontend Application
// ═══════════════════════════════════════════════════════════════════════════════

// Resolve Tauri invoke from globals (supports both v1 and v2 shapes)
function resolveInvoke() {
    if (window.__TAURI__?.invoke) return window.__TAURI__.invoke;
    if (window.__TAURI__?.core?.invoke) return window.__TAURI__.core.invoke;
    return null;
}

let invokeCache = null;

async function waitForInvoke(timeoutMs = 3000) {
    if (invokeCache) {
        return invokeCache;
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const inv = resolveInvoke();
        if (inv) {
            invokeCache = inv;
            return inv;
        }
        await new Promise((res) => setTimeout(res, 50));
    }

    throw new Error('Tauri API not available (invoke missing)');
}

async function tauriInvoke(...args) {
    const inv = await waitForInvoke();
    return inv(...args);
}

// State
let profiles = [];
let activeIndex = null;
let hasCredentialConflict = false;
let gitIdentity = { name: '', email: '' };
let isLoading = true;
let showProfileSelector = false;

// DOM Elements
const datetimeEl = document.getElementById('datetime');
const avatarStripEl = document.getElementById('avatar-strip');
const profilesListEl = document.getElementById('profiles-list');
const addFormEl = document.getElementById('add-form');
const btnAdd = document.getElementById('btn-add');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const btnSync = document.getElementById('btn-sync');
const btnAlert = document.getElementById('btn-alert');
const configDisplayEl = document.getElementById('config-display');
const logsContentEl = document.getElementById('logs-content');
const newNameInput = document.getElementById('new-name');
const newEmailInput = document.getElementById('new-email');

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
    console.log('Initializing Git-Shift...');

    try {
        // Show loading screen
        showLoadingScreen();

        // Ensure Tauri is available before continuing
        await waitForInvoke();

        // Update datetime
        updateDateTime();
        setInterval(updateDateTime, 1000);

        // Load profiles
        await syncProfilesAndActive();

        // Load current git config for display/prefill
        await loadGitIdentity();

        // Prefill form with current git identity when available
        await prefillFromGit();

        // Check credentials
        const status = await tauriInvoke('check_credentials');
        console.log('Credential status:', status);
        
        hasCredentialConflict = status.has_conflict;
        if (status.active_profile_index !== null) {
            activeIndex = status.active_profile_index;
        }

        // Render UI
        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        renderAlertButton();
        await refreshLogs();

        // Start log polling
        setInterval(refreshLogs, 2000);
        
        console.log('Git-Shift initialized successfully');
        
        // Hide loading screen
        hideLoadingScreen();
    } catch (error) {
        console.error('Failed to initialize:', error);
        hideLoadingScreen();
        logsContentEl.innerHTML = `<div class="log-entry error">Failed to initialize: ${error}</div>`;
    }
}

async function updateDateTime() {
    try {
        const time = await tauriInvoke('get_current_time');
        datetimeEl.textContent = time;
    } catch {
        datetimeEl.textContent = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function showLoadingScreen() {
    isLoading = true;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">Initializing Git-Shift...</div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
}

function hideLoadingScreen() {
    isLoading = false;
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.remove();
        }, 300);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function rgbToHex(r, g, b) {
    return `rgb(${r}, ${g}, ${b})`;
}

function renderProfiles() {
    profilesListEl.innerHTML = '';

    profiles.forEach((profile, index) => {
        const isActive = index === activeIndex;
        const color = rgbToHex(profile.color[0], profile.color[1], profile.color[2]);

        const card = document.createElement('div');
        card.className = `profile-card${isActive ? ' active' : ''}`;
        card.style.setProperty('color', color);

        card.innerHTML = `
            <div class="avatar" style="background: ${color}25; border: 1.5px solid ${color}80; color: ${color}">
                ${profile.initials}
            </div>
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-email">${escapeHtml(profile.email)}</div>
            </div>
            ${isActive ? '<div class="live-badge">LIVE</div>' : ''}
            <button class="delete-btn" data-index="${index}">✕</button>
        `;

        // Click to select
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                selectProfile(index);
            }
        });

        // Delete button
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProfile(index);
        });

        profilesListEl.appendChild(card);
    });
}

function renderAvatarStrip() {
    avatarStripEl.innerHTML = '';

    profiles.forEach((profile, index) => {
        const isActive = index === activeIndex;
        const color = rgbToHex(profile.color[0], profile.color[1], profile.color[2]);

        const avatar = document.createElement('div');
        avatar.className = `avatar${isActive ? ' active' : ''}`;
        avatar.style.cssText = `
            background: ${color}25;
            border: 1.5px solid ${color}80;
            color: ${color};
        `;
        avatar.textContent = profile.initials;
        avatar.title = `${profile.name} <${profile.email}>`;

        avatarStripEl.appendChild(avatar);
    });
}

function renderConfigDisplay() {
    if (activeIndex !== null && profiles[activeIndex]) {
        const p = profiles[activeIndex];
        configDisplayEl.innerHTML = `
            <div class="label">ACTIVE CONFIG</div>
            <div class="config-line">user.name = "${escapeHtml(p.name)}"</div>
            <div class="config-line secondary">user.email = "${escapeHtml(p.email)}"</div>
        `;
    } else if (gitIdentity.name || gitIdentity.email) {
        const name = gitIdentity.name || 'not set';
        const email = gitIdentity.email || 'not set';
        configDisplayEl.innerHTML = `
            <div class="label">CURRENT GIT CONFIG</div>
            <div class="config-line">user.name = "${escapeHtml(name)}"</div>
            <div class="config-line secondary">user.email = "${escapeHtml(email)}"</div>
        `;
    } else {
        configDisplayEl.innerHTML = '<span class="no-selection">No profile selected</span>';
    }
}

function renderAlertButton() {
    btnAlert.style.display = hasCredentialConflict ? 'block' : 'none';
}

async function refreshLogs() {
    try {
        const logs = await tauriInvoke('get_logs');
        logsContentEl.innerHTML = logs.map(log =>
            `<div class="log-entry ${log.log_type}">[${log.timestamp}] ${escapeHtml(log.message)}</div>`
        ).join('');
        logsContentEl.scrollTop = logsContentEl.scrollHeight;
    } catch (e) {
        console.error('Failed to refresh logs:', e);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function selectProfile(index) {
    try {
        await tauriInvoke('select_profile', { index });
        activeIndex = await tauriInvoke('get_active_index');
        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
    } catch (e) {
        console.error('Failed to select profile:', e);
    }
}

async function deleteProfile(index) {
    if (!confirm(`Delete profile "${profiles[index].name}"?`)) {
        return;
    }

    try {
        await tauriInvoke('delete_profile', { index });
        await syncProfilesAndActive();
        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
    } catch (e) {
        console.error('Failed to delete profile:', e);
    }
}

async function addProfile() {
    const name = newNameInput.value.trim();
    const email = newEmailInput.value.trim();

    if (!name || !email) {
        alert('Please enter both name and email');
        return;
    }

    if (!email.includes('@')) {
        alert('Please enter a valid email');
        return;
    }

    try {
        await tauriInvoke('add_profile', { name, email });
        await syncProfilesAndActive();

        // Clear form
        newNameInput.value = '';
        newEmailInput.value = '';
        addFormEl.style.display = 'none';
        btnAdd.style.display = 'block';

        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
    } catch (e) {
        console.error('Failed to add profile:', e);
    }
}

async function switchIdentity() {
    if (activeIndex === null) {
        return;
    }

    try {
        await tauriInvoke('switch_identity');
        await refreshLogs();
    } catch (e) {
        console.error('Failed to switch identity:', e);
        await refreshLogs();
    }
}

async function overrideCredentials() {
    try {
        await tauriInvoke('override_credentials');
        hasCredentialConflict = false;
        renderAlertButton();
        await refreshLogs();
        
        // Show profile selector dialog if profiles exist
        if (profiles.length > 0) {
            showProfileSelector = true;
            showProfileSelectionDialog();
        }
    } catch (e) {
        console.error('Failed to override credentials:', e);
    }
}

function showProfileSelectionDialog() {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'profile-selector-modal';
    modal.className = 'modal-overlay';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Select Profile to Apply</h2>
            <p class="modal-subtitle">Choose which profile to activate now that system credentials have been overridden</p>
        </div>
        <div class="modal-profiles" id="modal-profiles-list"></div>
        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Render profiles in modal
    const modalProfilesList = document.getElementById('modal-profiles-list');
    profiles.forEach((profile, index) => {
        const color = rgbToHex(profile.color[0], profile.color[1], profile.color[2]);
        
        const profileItem = document.createElement('div');
        profileItem.className = 'modal-profile-item';
        profileItem.innerHTML = `
            <div class="avatar" style="background: ${color}25; border: 1.5px solid ${color}80; color: ${color}">
                ${profile.initials}
            </div>
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-email">${escapeHtml(profile.email)}</div>
            </div>
        `;
        
        profileItem.addEventListener('click', async () => {
            const success = await selectAndApplyProfile(index);
            if (success) {
                closeProfileSelectionDialog();
            }
        });
        
        modalProfilesList.appendChild(profileItem);
    });
    
    // Cancel button
    document.getElementById('modal-cancel').addEventListener('click', closeProfileSelectionDialog);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProfileSelectionDialog();
        }
    });
}

function closeProfileSelectionDialog() {
    const modal = document.getElementById('profile-selector-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
    showProfileSelector = false;
}

async function selectAndApplyProfile(index) {
    try {
        // Select the profile
        await tauriInvoke('select_profile', { index });
        activeIndex = await tauriInvoke('get_active_index');
        
        // Automatically apply it (switch identity)
        await tauriInvoke('switch_identity');
        
        // Update UI
        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
        
        return true; // Success
    } catch (e) {
        console.error('Failed to select and apply profile:', e);
        alert('Failed to apply profile. Please try again or apply manually.');
        return false; // Failure
    }
}

async function syncProfilesAndActive() {
    profiles = await tauriInvoke('get_profiles');
    activeIndex = await tauriInvoke('get_active_index');
}

async function prefillFromGit() {
    try {
        const identity = gitIdentity.name || gitIdentity.email ? gitIdentity : await tauriInvoke('get_git_identity');
        if (identity?.name && !newNameInput.value) {
            newNameInput.value = identity.name;
        }
        if (identity?.email && !newEmailInput.value) {
            newEmailInput.value = identity.email;
        }
    } catch (e) {
        console.warn('Could not prefill from git config:', e);
    }
}

async function loadGitIdentity() {
    try {
        gitIdentity = await tauriInvoke('get_git_identity');
    } catch (e) {
        console.warn('Could not load git identity:', e);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

btnAdd.addEventListener('click', () => {
    console.debug('Add button clicked');
    addFormEl.style.display = 'block';
    btnAdd.style.display = 'none';
    newNameInput.focus();
});

btnCancel.addEventListener('click', () => {
    addFormEl.style.display = 'none';
    btnAdd.style.display = 'block';
    newNameInput.value = '';
    newEmailInput.value = '';
});

btnSave.addEventListener('click', addProfile);

btnSync.addEventListener('click', switchIdentity);

btnAlert.addEventListener('click', overrideCredentials);

// Enter key to save profile
newEmailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addProfile();
    }
});

newNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        newEmailInput.focus();
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already ready
    init();
}

