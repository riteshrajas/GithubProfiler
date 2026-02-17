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
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
            use tauri::Manager;

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|app| {
            // Check for --minimized argument
            use tauri::Manager;
            let window = app.get_webview_window("main").unwrap();
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                window.hide().unwrap();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_profiles,
            add_profile,
            update_profile,
            delete_profile,
            select_profile,
            get_active_index,
            switch_identity,
            check_credentials,
            override_credentials,
            get_logs,
            get_current_time,
            get_git_identity,
            toggle_autostart,
            is_autostart_enabled,
            fetch_contribution_graph,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

