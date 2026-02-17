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
let editingIndex = null;
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
const editFormEl = document.getElementById('edit-form');
const editNameInput = document.getElementById('edit-name');
const editEmailInput = document.getElementById('edit-email');
const btnUpdate = document.getElementById('btn-update');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
// editingIndex is already declared above

// Tabs & Labs Elements
const tabProfiles = document.getElementById('tab-profiles');
const tabLabs = document.getElementById('tab-labs');
const viewConfig = document.getElementById('view-config');
const viewLabs = document.getElementById('view-labs');
const coAuthorListEl = document.getElementById('co-author-list');
const coAuthorPreviewEl = document.getElementById('co-author-preview');
const btnCopyCoAuthors = document.getElementById('btn-copy-coauthors');
const autostartToggle = document.getElementById('autostart-toggle');
let selectedCoAuthors = new Set();

// Menu Elements
const btnMenu = document.getElementById('btn-menu');
const mainMenuDropdown = document.getElementById('main-menu-dropdown');

const graphSection = document.getElementById('graph-section');
const contributionGraph = document.getElementById('contribution-graph');

const menuAbout = document.getElementById('menu-about');

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

        // Check autostart status
        try {
            const isAutostart = await tauriInvoke('is_autostart_enabled');
            autostartToggle.checked = isAutostart;
        } catch (e) {
            console.warn('Autostart check failed:', e);
        }

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

        // Load graph if profile active
        if (activeIndex !== null && profiles[activeIndex]) {
            loadContributionGraph(profiles[activeIndex].name);
        }

        // Render UI
        renderProfiles();
        renderAvatarStrip();
        renderCoAuthorList(); // Initialize lab list
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

        // Try to construct avatar URL - using a slightly more robust check for username vs real name
        // Heuristic: If name has no spaces, it might be a handle. Otherwise, rely on initials check fallback
        const avatarUrl = `https://github.com/${profile.name}.png`;

        card.innerHTML = `
            <div class="avatar-container">
                <img src="${avatarUrl}" class="avatar-img" 
                     onload="this.style.display='block'; this.nextElementSibling.style.display='none'"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" 
                     style="display:none" />
                <div class="avatar" style="background: ${color}25; border: 1.5px solid ${color}80; color: ${color}; display:flex"> 
                    ${profile.initials}
                </div>
            </div>
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-email">${escapeHtml(profile.email)}</div>
            </div>
            ${isActive ? '<div class="live-badge">LIVE</div>' : ''}
            <button class="edit-btn" data-index="${index}">✎</button>
            <button class="delete-btn" data-index="${index}">✕</button>
        `;

        // Click to select
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-btn') && !e.target.classList.contains('edit-btn')) {
                selectProfile(index);
            }
        });

        // Edit button
        const editBtn = card.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditProfile(index);
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
        const avatarUrl = `https://github.com/${profile.name}.png`;

        const container = document.createElement('div');
        container.className = `avatar-container-strip${isActive ? ' active' : ''}`;
        container.title = `${profile.name} <${profile.email}>`;

        // Image element
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'avatar-img-strip';
        img.style.display = 'none'; // Hidden by default until loaded

        // Initials fallback
        const div = document.createElement('div');
        div.className = `avatar`;
        div.style.cssText = `
            background: ${color}25;
            border: 1.5px solid ${color}80;
            color: ${color};
            display: flex;
        `;
        div.textContent = profile.initials;

        // Load handler
        img.onload = () => {
            img.style.display = 'block';
            div.style.display = 'none';
        };

        container.appendChild(img);
        container.appendChild(div);
        avatarStripEl.appendChild(container);
    });
}

function renderCoAuthorList() {
    coAuthorListEl.innerHTML = '';

    profiles.forEach((profile, index) => {
        const item = document.createElement('div');
        const isSelected = selectedCoAuthors.has(index);
        item.className = `multi-select-item${isSelected ? ' selected' : ''}`;

        item.innerHTML = `
            <div class="checkbox">✓</div>
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-email" style="font-size: 0.8em; opacity: 0.7">${escapeHtml(profile.email)}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            toggleCoAuthor(index);
        });

        coAuthorListEl.appendChild(item);
    });

    updateCoAuthorPreview();
}

function toggleCoAuthor(index) {
    if (selectedCoAuthors.has(index)) {
        selectedCoAuthors.delete(index);
    } else {
        selectedCoAuthors.add(index);
    }
    renderCoAuthorList();
}

function updateCoAuthorPreview() {
    if (selectedCoAuthors.size === 0) {
        coAuthorPreviewEl.value = '';
        return;
    }

    const lines = [];
    // Convert Set to Array and sort for consistency
    const indices = Array.from(selectedCoAuthors).sort();

    indices.forEach(idx => {
        const p = profiles[idx];
        lines.push(`Co-authored-by: ${p.name} <${p.email}>`);
    });

    coAuthorPreviewEl.value = lines.join('\n');
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

// Preview area
coAuthorPreviewEl.style.display = selectedCoAuthors.size > 0 ? 'block' : 'none';
coAuthorPreviewEl.textContent = Array.from(selectedCoAuthors).join(', ');

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

        if (profiles[index]) {
            loadContributionGraph(profiles[index].name);
        }

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
        btnAdd.style.display = '';

        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
    } catch (e) {
        console.error('Failed to add profile:', e);
    }
}

// Edit Profile Functions
function openEditProfile(index) {
    editingIndex = index;
    const profile = profiles[index];
    editNameInput.value = profile.name;
    editEmailInput.value = profile.email;

    addFormEl.style.display = 'none';
    editFormEl.style.display = 'block';

    // Hide add button while editing
    btnAdd.style.display = 'none';
}

function closeEditForm() {
    editingIndex = null;
    editFormEl.style.display = 'none';
    editNameInput.value = '';
    editEmailInput.value = '';
    btnAdd.style.display = '';
}

// Event Listeners for Edit Form
btnCancelEdit.addEventListener('click', closeEditForm);
btnUpdate.addEventListener('click', updateProfile);

// Tab Navigation
tabProfiles.addEventListener('click', () => {
    tabProfiles.classList.add('active');
    tabLabs.classList.remove('active');

    viewConfig.classList.add('active');
    viewLabs.classList.remove('active');

    // Clear inline styles if any
    viewConfig.style.display = '';
    viewLabs.style.display = '';
});

tabLabs.addEventListener('click', () => {
    tabLabs.classList.add('active');
    tabProfiles.classList.remove('active');

    viewLabs.classList.add('active');
    viewConfig.classList.remove('active');

    // Clear inline styles if any
    viewLabs.style.display = '';
    viewConfig.style.display = '';

    renderCoAuthorList(); // Refresh list in case profiles changed
});

// Copy Co-Authors
btnCopyCoAuthors.addEventListener('click', () => {
    const text = coAuthorPreviewEl.value;
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
        const originalText = btnCopyCoAuthors.innerText;
        btnCopyCoAuthors.innerText = '✓ Copied!';
        setTimeout(() => {
            btnCopyCoAuthors.innerText = originalText;
        }, 2000);
    });
});

autostartToggle.addEventListener('change', async (e) => {
    try {
        await tauriInvoke('toggle_autostart', { enable: e.target.checked });
        console.log(`Autostart ${e.target.checked ? 'enabled' : 'disabled'}`);
    } catch (err) {
        console.error('Failed to toggle autostart:', err);
        e.target.checked = !e.target.checked; // Revert on failure
        alert('Failed to update startup settings');
    }
});

async function updateProfile() {
    if (editingIndex === null) {
        return;
    }

    const name = editNameInput.value.trim();
    const email = editEmailInput.value.trim();

    if (!name || !email) {
        alert('Please enter both name and email');
        return;
    }

    if (!email.includes('@')) {
        alert('Please enter a valid email');
        return;
    }

    try {
        await tauriInvoke('update_profile', { index: editingIndex, name, email });
        editingIndex = null;
        editFormEl.style.display = 'none';
        btnAdd.style.display = '';

        await syncProfilesAndActive();
        renderProfiles();
        renderAvatarStrip();
        renderConfigDisplay();
        await refreshLogs();
    } catch (e) {
        console.error('Failed to update profile:', e);
    }
}

async function switchIdentity() {
    if (activeIndex === null) {
        return;
    }

    const originalBtnContent = btnSync.innerHTML;
    const activeCard = profilesListEl.children[activeIndex];

    // 1. Start Loading State
    btnSync.disabled = true;
    btnSync.classList.add('btn-loading');
    if (activeCard) activeCard.classList.add('applying');

    // Spinner Icon
    btnSync.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" class="icon-spin" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
        <span>Applying...</span>
    `;

    try {
        // Artificial delay for "feel" (min 500ms)
        const start = Date.now();
        await tauriInvoke('switch_identity');
        await refreshLogs();
        const elapsed = Date.now() - start;
        if (elapsed < 600) {
            await new Promise(r => setTimeout(r, 600 - elapsed));
        }

        // 2. Success State
        btnSync.classList.remove('btn-loading');
        btnSync.classList.add('btn-success-state');
        btnSync.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Applied!</span>
        `;

        // Remove highlighting
        if (activeCard) activeCard.classList.remove('applying');

        // Reset button after delay
        setTimeout(() => {
            btnSync.classList.remove('btn-success-state');
            btnSync.innerHTML = originalBtnContent;
            btnSync.disabled = false;
        }, 2000);

    } catch (e) {
        console.error('Failed to switch identity:', e);
        await refreshLogs();

        // Error State
        btnSync.classList.remove('btn-loading');
        btnSync.classList.add('btn-danger');
        btnSync.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Failed</span>
        `;

        if (activeCard) activeCard.classList.remove('applying');

        setTimeout(() => {
            btnSync.classList.remove('btn-danger');
            btnSync.innerHTML = originalBtnContent;
            btnSync.disabled = false;
        }, 3000);
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
    btnAdd.style.display = '';
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

// Dropdown Menu
if (btnMenu) {
    btnMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        mainMenuDropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (mainMenuDropdown.classList.contains('active')) {
            mainMenuDropdown.classList.remove('active');
        }
    });



    menuAbout.addEventListener('click', () => {
        showAboutDialog();
    });

    // Disable default context menu
    document.addEventListener('contextmenu', event => event.preventDefault());
}

function showAboutDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-header" style="justify-content: center;">
                <h2>Git-Shift</h2>
            </div>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                Version 1.0<br><br>
                A seamless Git identity manager for developers.<br>
                Switch profiles with a single click.
            </p>
            <div class="modal-actions" style="justify-content: center;">
                <button class="btn btn-primary" id="btn-close-about">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#btn-close-about');
    const close = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    };

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRIBUTION GRAPH
// ═══════════════════════════════════════════════════════════════════════════════

async function loadContributionGraph(username) {
    if (!username) return;

    // GitHub username validation (simple check)
    // GitHub usernames are alphanumeric and dashes, no spaces
    const cleanUsername = username.trim();
    if (cleanUsername.includes(' ')) {
        graphSection.style.display = 'none';
        return;
    }

    graphSection.style.display = 'block';
    contributionGraph.innerHTML = '<div class="graph-loading">Loading graph for ' + cleanUsername + '...</div>';

    try {
        const svgContent = await tauriInvoke('fetch_contribution_graph', { username: cleanUsername });

        // Extract the Graph content (now a table, not SVG)
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'text/html');
        const graphContainer = doc.querySelector('.js-calendar-graph');

        if (graphContainer) {
            contributionGraph.innerHTML = '';
            // Remove some utility classes that might conflict or add spacing
            graphContainer.classList.remove('mx-md-2', 'mx-3', 'd-flex', 'flex-column');
            graphContainer.style.width = '100%';

            contributionGraph.appendChild(graphContainer);

            // Add tooltip overlay
            const tooltip = document.createElement('div');
            tooltip.className = 'graph-tooltip';
            tooltip.style.display = 'none';
            contributionGraph.appendChild(tooltip);

            // Simple tooltip logic for table cells
            const cells = graphContainer.querySelectorAll('.ContributionCalendar-day');

            cells.forEach(cell => {
                cell.addEventListener('mouseenter', (e) => {
                    const date = cell.getAttribute('data-date');
                    const level = cell.getAttribute('data-level');
                    // Tooltip text is in the 'sr-only' span usually, or title attribute
                    // GitHub puts text in <span class="sr-only">X contributions on Y date</span>
                    const srText = cell.querySelector('.sr-only')?.textContent || cell.textContent;

                    if (date) {
                        tooltip.textContent = srText || `${level} activity on ${date}`;
                        tooltip.style.display = 'block';

                        // Position info
                        const rectBounds = cell.getBoundingClientRect();
                        const containerBounds = contributionGraph.getBoundingClientRect();

                        let left = rectBounds.left - containerBounds.left - 50;
                        let top = rectBounds.top - containerBounds.top - 30;

                        if (left < 0) left = 0;
                        if (top < 0) top = 0;

                        tooltip.style.left = left + 'px';
                        tooltip.style.top = top + 'px';
                    }
                });

                cell.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            });

        } else {
            contributionGraph.innerHTML = '<div class="graph-error">No graph data found for user.</div>';
        }
    } catch (err) {
        console.error('Failed to load graph:', err);
        contributionGraph.innerHTML = `<div class="graph-error">Could not load graph for ${cleanUsername}</div>`;
    }
}

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

