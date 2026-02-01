use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use rand::Rng;
use chrono::Local;
use tauri::State;

// ═══════════════════════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Profile {
    pub name: String,
    pub email: String,
    pub initials: String,
    pub color: [u8; 3],
}

impl Profile {
    pub fn new(name: &str, email: &str, color: [u8; 3]) -> Self {
        let initials = name
            .split_whitespace()
            .take(2)
            .filter_map(|w| w.chars().next())
            .collect::<String>()
            .to_uppercase();
        Self {
            name: name.to_string(),
            email: email.to_string(),
            initials,
            color,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PersistedState {
    pub profiles: Vec<Profile>,
    pub active_index: Option<usize>,
}

#[derive(Serialize, Clone, Debug)]
pub struct LogEntry {
    pub timestamp: String,
    pub message: String,
    pub log_type: String, // "info", "success", "error", "command"
}

#[derive(Serialize, Debug)]
pub struct CredentialStatus {
    pub has_conflict: bool,
    pub active_profile_index: Option<usize>,
}

#[derive(Serialize, Debug, Default)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

#[derive(Default)]
pub struct AppState {
    pub profiles: Mutex<Vec<Profile>>,
    pub active_index: Mutex<Option<usize>>,
    pub logs: Mutex<Vec<LogEntry>>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = config_dir.join("git-shift");
    fs::create_dir_all(&app_dir).ok();
    app_dir.join("profiles.json")
}

pub fn load_state_from_disk() -> PersistedState {
    let path = get_config_path();
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            // Try new format first
            if let Ok(state) = serde_json::from_str::<PersistedState>(&data) {
                return state;
            }
            // Backward compatibility: old format was just an array of profiles
            if let Ok(profiles) = serde_json::from_str::<Vec<Profile>>(&data) {
                return PersistedState {
                    profiles,
                    active_index: None,
                };
            }
        }
    }
    PersistedState::default()
}

fn save_state_to_disk(profiles: &[Profile], active_index: Option<usize>) {
    let path = get_config_path();
    let state = PersistedState {
        profiles: profiles.to_vec(),
        active_index,
    };

    if let Ok(json) = serde_json::to_string_pretty(&state) {
        fs::write(path, json).ok();
    }
}

fn add_log(state: &State<AppState>, message: &str, log_type: &str) {
    let entry = LogEntry {
        timestamp: Local::now().format("%H:%M:%S").to_string(),
        message: message.to_string(),
        log_type: log_type.to_string(),
    };
    let mut logs = state.logs.lock().unwrap();
    logs.push(entry);
    if logs.len() > 50 {
        logs.remove(0);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_profiles(state: State<AppState>) -> Vec<Profile> {
    state.profiles.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_profile(state: State<AppState>, name: String, email: String) -> Profile {
    let mut rng = rand::thread_rng();
    let color = [
        rng.gen_range(100..255),
        rng.gen_range(100..255),
        rng.gen_range(100..255),
    ];
    let profile = Profile::new(&name, &email, color);

    let mut profiles = state.profiles.lock().unwrap();
    profiles.push(profile.clone());
    let active = *state.active_index.lock().unwrap();
    save_state_to_disk(&profiles, active);

    add_log(&state, &format!("Profile '{}' added", name), "success");
    profile
}

#[tauri::command]
pub fn delete_profile(state: State<AppState>, index: usize) -> Result<(), String> {
    let mut profiles = state.profiles.lock().unwrap();
    if index >= profiles.len() {
        return Err("Invalid profile index".to_string());
    }

    let name = profiles[index].name.clone();
    profiles.remove(index);

    // Update active index if needed
    let mut active = state.active_index.lock().unwrap();
    if let Some(active_idx) = *active {
        if active_idx == index {
            *active = None;
        } else if active_idx > index {
            *active = Some(active_idx - 1);
        }
    }
    save_state_to_disk(&profiles, *active);

    add_log(&state, &format!("Profile '{}' deleted", name), "info");
    Ok(())
}

#[tauri::command]
pub fn select_profile(state: State<AppState>, index: usize) -> Result<(), String> {
    let profiles = state.profiles.lock().unwrap();
    if index >= profiles.len() {
        return Err("Invalid profile index".to_string());
    }

    let mut active = state.active_index.lock().unwrap();
    *active = Some(index);
    save_state_to_disk(&profiles, *active);

    add_log(&state, &format!("Selected profile: {}", profiles[index].name), "info");
    Ok(())
}

#[tauri::command]
pub fn get_active_index(state: State<AppState>) -> Option<usize> {
    *state.active_index.lock().unwrap()
}

#[tauri::command]
pub fn switch_identity(state: State<AppState>) -> Result<String, String> {
    let active_idx = {
        let active = state.active_index.lock().unwrap();
        match *active {
            Some(idx) => idx,
            None => return Err("No profile selected".to_string()),
        }
    };
    
    let (name, email) = {
        let profiles = state.profiles.lock().unwrap();
        if active_idx >= profiles.len() {
            return Err("Invalid profile index".to_string());
        }
        (profiles[active_idx].name.clone(), profiles[active_idx].email.clone())
    };
    
    // Log the commands
    add_log(&state, &format!("git config --global user.name \"{}\"", name), "command");
    add_log(&state, &format!("git config --global user.email \"{}\"", email), "command");
    
    // Execute git commands
    let name_result = Command::new("git")
        .args(["config", "--global", "user.name", &name])
        .output();
    
    let email_result = Command::new("git")
        .args(["config", "--global", "user.email", &email])
        .output();
    
    match (name_result, email_result) {
        (Ok(_), Ok(_)) => {
            add_log(&state, "✓ Identity switched successfully", "success");
            Ok(format!("Switched to {} <{}>", name, email))
        }
        _ => {
            add_log(&state, "✗ Failed to switch identity", "error");
            Err("Failed to execute git config commands".to_string())
        }
    }
}

#[tauri::command]
pub fn check_credentials(state: State<AppState>) -> CredentialStatus {
    let mut has_conflict = false;

    // Check for credential manager
    if let Ok(output) = Command::new("git").args(["config", "--list"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("credential.helper=manager") {
            has_conflict = true;
            add_log(&state, "Credential Manager conflict detected", "error");
        }
    }

    // Auto-detect active profile
    let active_profile_index = {
        let profiles = state.profiles.lock().unwrap();
        let current_name = Command::new("git")
            .args(["config", "--global", "user.name"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        
        let current_email = Command::new("git")
            .args(["config", "--global", "user.email"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let found_idx = profiles.iter().position(|p| p.name == current_name && p.email == current_email);

        if let Some(idx) = found_idx {
            let mut active = state.active_index.lock().unwrap();
            *active = Some(idx);
            save_state_to_disk(&profiles, *active);
        }

        found_idx
    };

    CredentialStatus {
        has_conflict,
        active_profile_index,
    }
}

#[tauri::command]
pub fn override_credentials(state: State<AppState>) -> Result<(), String> {
    let result = Command::new("git")
        .args(["config", "--global", "--unset", "credential.helper"])
        .output();
    
    match result {
        Ok(_) => {
            add_log(&state, "Credential manager override applied", "success");
            Ok(())
        }
        Err(e) => {
            add_log(&state, &format!("Failed to override: {}", e), "error");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn get_logs(state: State<AppState>) -> Vec<LogEntry> {
    state.logs.lock().unwrap().clone()
}

#[tauri::command]
pub fn get_current_time() -> String {
    Local::now().format("%A, %B %d, %Y • %I:%M %p").to_string()
}

#[tauri::command]
pub fn get_git_identity() -> GitIdentity {
    let name = Command::new("git")
        .args(["config", "--global", "user.name"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    let email = Command::new("git")
        .args(["config", "--global", "user.email"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    GitIdentity { name, email }
}
