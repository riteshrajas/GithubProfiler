// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::*;
use std::sync::Mutex;
use chrono::Local;

// ═══════════════════════════════════════════════════════════════════════════════
// APP INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

fn main() {
    // Load profiles from disk
    let persisted = load_state_from_disk();

    let app_state = AppState {
        profiles: Mutex::new(persisted.profiles),
        active_index: Mutex::new(persisted.active_index),
        logs: Mutex::new(vec![LogEntry {
            timestamp: Local::now().format("%H:%M:%S").to_string(),
            message: "System initialized".to_string(),
            log_type: "info".to_string(),
        }]),
    };
    
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_profiles,
            add_profile,
            delete_profile,
            select_profile,
            get_active_index,
            switch_identity,
            check_credentials,
            override_credentials,
            get_logs,
            get_current_time,
            get_git_identity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
