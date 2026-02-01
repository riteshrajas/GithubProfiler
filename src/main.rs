use eframe::{egui::{self, UiBuilder}, App, Frame, NativeOptions};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::PathBuf;
use std::fs;
use chrono::Local;
use rand::Rng;

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM COLOR PALETTE - Refined Cyberpunk
// ═══════════════════════════════════════════════════════════════════════════════
const BG_GRADIENT_TOP: egui::Color32 = egui::Color32::from_rgb(15, 15, 25);
const BG_GRADIENT_BOTTOM: egui::Color32 = egui::Color32::from_rgb(8, 8, 15);
const GLASS_BG: egui::Color32 = egui::Color32::from_rgba_premultiplied(25, 28, 38, 235);
const GLASS_BORDER: egui::Color32 = egui::Color32::from_rgba_premultiplied(80, 90, 110, 80);
const GLASS_HIGHLIGHT: egui::Color32 = egui::Color32::from_rgba_premultiplied(255, 255, 255, 15);

const ACCENT_BLUE: egui::Color32 = egui::Color32::from_rgb(56, 182, 255);
const ACCENT_CYAN: egui::Color32 = egui::Color32::from_rgb(0, 230, 220);
const ACCENT_GREEN: egui::Color32 = egui::Color32::from_rgb(72, 255, 150);
const ACCENT_RED: egui::Color32 = egui::Color32::from_rgb(255, 92, 120);
const ACCENT_PURPLE: egui::Color32 = egui::Color32::from_rgb(180, 120, 255);

const TEXT_WHITE: egui::Color32 = egui::Color32::from_rgb(250, 250, 255);
const TEXT_SECONDARY: egui::Color32 = egui::Color32::from_rgb(160, 165, 185);
const TEXT_MUTED: egui::Color32 = egui::Color32::from_rgb(100, 105, 125);

// ═══════════════════════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Profile {
    name: String,
    email: String,
    initials: String,
    color: [u8; 3],
}

impl Profile {
    fn new(name: &str, email: &str, color: [u8; 3]) -> Self {
        let initials = name.split_whitespace()
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

struct GitShiftApp {
    profiles: Vec<Profile>,
    active_index: Option<usize>,
    logs: Vec<(String, LogType)>,
    show_alert: bool,
    time: f64,
    // Add profile UI state
    show_add_dialog: bool,
    new_name: String,
    new_email: String,
}

#[derive(Clone)]
enum LogType { Info, Success, Error, Command }

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = config_dir.join("git-shift");
    fs::create_dir_all(&app_dir).ok();
    app_dir.join("profiles.json")
}

impl GitShiftApp {
    fn new() -> Self {
        let profiles = Self::load_profiles();
        Self {
            profiles,
            active_index: None,
            logs: vec![
                (format!("[{}] System initialized", Local::now().format("%H:%M:%S")), LogType::Info),
            ],
            show_alert: false,
            time: 0.0,
            show_add_dialog: false,
            new_name: String::new(),
            new_email: String::new(),
        }
    }
    
    fn load_profiles() -> Vec<Profile> {
        let path = get_config_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(profiles) = serde_json::from_str(&data) {
                    return profiles;
                }
            }
        }
        Vec::new()
    }
    
    fn save_profiles(&self) {
        let path = get_config_path();
        if let Ok(json) = serde_json::to_string_pretty(&self.profiles) {
            fs::write(path, json).ok();
        }
    }
    
    fn add_profile(&mut self, name: String, email: String) {
        let mut rng = rand::thread_rng();
        let color = [
            rng.gen_range(100..255),
            rng.gen_range(100..255),
            rng.gen_range(100..255),
        ];
        let profile = Profile::new(&name, &email, color);
        self.profiles.push(profile);
        self.save_profiles();
        self.log(&format!("Profile '{}' added", name), LogType::Success);
    }
}

impl GitShiftApp {
    fn log(&mut self, msg: &str, log_type: LogType) {
        self.logs.push((format!("[{}] {}", Local::now().format("%H:%M:%S"), msg), log_type));
        if self.logs.len() > 50 { self.logs.remove(0); }
    }

    fn check_credentials(&mut self) {
        if let Ok(output) = Command::new("git").args(["config", "--list"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("credential.helper=manager") {
                self.show_alert = true;
                self.log("Credential Manager conflict detected", LogType::Error);
            }
        }
        
        // Auto-detect active profile
        if let (Ok(name), Ok(email)) = (
            Command::new("git").args(["config", "--global", "user.name"]).output(),
            Command::new("git").args(["config", "--global", "user.email"]).output()
        ) {
            let current_name = String::from_utf8_lossy(&name.stdout).trim().to_string();
            let current_email = String::from_utf8_lossy(&email.stdout).trim().to_string();
            
            for (i, p) in self.profiles.iter().enumerate() {
                if p.name == current_name && p.email == current_email {
                    self.active_index = Some(i);
                    break;
                }
            }
        }
    }

    fn switch_identity(&mut self) {
        if let Some(idx) = self.active_index {
            let (name, email) = {
                let p = &self.profiles[idx];
                (p.name.clone(), p.email.clone())
            };
            
            self.log(&format!("git config --global user.name \"{}\"", name), LogType::Command);
            self.log(&format!("git config --global user.email \"{}\"", email), LogType::Command);

            if Command::new("git").args(["config", "--global", "user.name", &name]).output().is_ok()
                && Command::new("git").args(["config", "--global", "user.email", &email]).output().is_ok() 
            {
                self.log("✓ Identity switched successfully", LogType::Success);
            } else {
                self.log("✗ Failed to switch identity", LogType::Error);
            }
        }
    }
    
    fn override_credentials(&mut self) {
        let _ = Command::new("git").args(["config", "--global", "--unset", "credential.helper"]).output();
        self.show_alert = false;
        self.log("Credential manager override applied", LogType::Success);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

fn draw_glass_panel(painter: &egui::Painter, rect: egui::Rect, corner_radius: f32) {
    // Main glass fill
    painter.rect_filled(rect, corner_radius, GLASS_BG);
    
    // Top highlight line (subtle glass shine)
    let highlight_rect = egui::Rect::from_min_size(rect.min, egui::vec2(rect.width(), 1.0));
    painter.rect_filled(highlight_rect, 0.0, GLASS_HIGHLIGHT);
    
    // Border
    painter.rect_stroke(rect, corner_radius, egui::Stroke::new(1.0, GLASS_BORDER), egui::StrokeKind::Inside);
}

fn draw_avatar(painter: &egui::Painter, center: egui::Pos2, radius: f32, profile: &Profile, is_active: bool, pulse: f32) {
    let color = egui::Color32::from_rgb(profile.color[0], profile.color[1], profile.color[2]);
    
    if is_active {
        // Outer glow pulse
        let glow_radius = radius + 4.0 + pulse * 2.0;
        painter.circle_filled(center, glow_radius, color.linear_multiply(0.15));
        painter.circle_stroke(center, radius + 2.0, egui::Stroke::new(2.0, color));
    }
    
    // Avatar circle with gradient-ish effect
    painter.circle_filled(center, radius, color.linear_multiply(0.25));
    painter.circle_stroke(center, radius, egui::Stroke::new(1.5, color.linear_multiply(0.8)));
    
    // Initials
    painter.text(
        center, 
        egui::Align2::CENTER_CENTER, 
        &profile.initials, 
        egui::FontId::proportional(radius * 0.7), 
        TEXT_WHITE
    );
}

fn draw_profile_card(ui: &mut egui::Ui, profile: &Profile, is_active: bool, rect: egui::Rect, pulse: f32) -> egui::Response {
    let painter = ui.painter();
    
    // Card background
    let bg = if is_active {
        egui::Color32::from_rgba_unmultiplied(profile.color[0] / 4, profile.color[1] / 4, profile.color[2] / 4, 180)
    } else {
        GLASS_BG
    };
    
    painter.rect_filled(rect, 12.0, bg);
    
    // Glow border for active
    let border_color = if is_active {
        egui::Color32::from_rgb(profile.color[0], profile.color[1], profile.color[2])
    } else {
        GLASS_BORDER
    };
    painter.rect_stroke(rect, 12.0, egui::Stroke::new(if is_active { 2.0 } else { 1.0 }, border_color), egui::StrokeKind::Inside);
    
    // Top shine
    if is_active {
        let shine = egui::Rect::from_min_size(rect.min + egui::vec2(12.0, 0.0), egui::vec2(rect.width() - 24.0, 1.0));
        painter.rect_filled(shine, 0.0, egui::Color32::from_rgba_unmultiplied(profile.color[0], profile.color[1], profile.color[2], 100));
    }
    
    // Avatar
    let avatar_center = rect.left_center() + egui::vec2(40.0, 0.0);
    draw_avatar(painter, avatar_center, 22.0, profile, is_active, pulse);
    
    // Text
    let text_x = rect.left() + 80.0;
    painter.text(egui::pos2(text_x, rect.top() + 18.0), egui::Align2::LEFT_TOP, &profile.name, egui::FontId::proportional(15.0), TEXT_WHITE);
    painter.text(egui::pos2(text_x, rect.top() + 38.0), egui::Align2::LEFT_TOP, &profile.email, egui::FontId::proportional(11.0), TEXT_SECONDARY);
    
    // Live badge
    if is_active {
        let badge_pos = rect.right_top() + egui::vec2(-50.0, 18.0);
        let badge_rect = egui::Rect::from_center_size(badge_pos, egui::vec2(40.0, 20.0));
        painter.rect_filled(badge_rect, 10.0, ACCENT_GREEN.linear_multiply(0.2));
        painter.rect_stroke(badge_rect, 10.0, egui::Stroke::new(1.0, ACCENT_GREEN), egui::StrokeKind::Inside);
        painter.text(badge_pos, egui::Align2::CENTER_CENTER, "LIVE", egui::FontId::proportional(10.0), ACCENT_GREEN);
    }
    
    ui.interact(rect, ui.id().with(profile.name.as_str()), egui::Sense::click())
}

fn draw_sync_button(ui: &mut egui::Ui, rect: egui::Rect, time: f64) -> egui::Response {
    let painter = ui.painter();
    let center = rect.center();
    
    // Outer rotating ring
    let ring_radius = rect.height() / 2.0 - 5.0;
    for i in 0..8 {
        let angle = (time * 0.5) as f32 + (i as f32 * std::f32::consts::TAU / 8.0);
        let pos = center + egui::vec2(angle.cos(), angle.sin()) * ring_radius;
        let alpha = ((i as f32 / 8.0) * 180.0) as u8 + 75;
        painter.circle_filled(pos, 3.0, egui::Color32::from_rgba_unmultiplied(56, 182, 255, alpha));
    }
    
    // Main button gradient background
    let btn_rect = rect.shrink(15.0);
    
    // Multi-layer gradient simulation
    let gradient_layers = [
        (btn_rect, egui::Color32::from_rgb(30, 100, 200)),
        (btn_rect.shrink(btn_rect.height() * 0.1), egui::Color32::from_rgb(40, 130, 220)),
        (btn_rect.shrink(btn_rect.height() * 0.2), egui::Color32::from_rgb(56, 160, 240)),
        (btn_rect.shrink(btn_rect.height() * 0.35), egui::Color32::from_rgb(80, 190, 255)),
    ];
    
    for (r, c) in &gradient_layers {
        painter.rect_filled(*r, 16.0, *c);
    }
    
    // Border glow
    painter.rect_stroke(btn_rect, 16.0, egui::Stroke::new(2.0, ACCENT_CYAN.linear_multiply(0.5)), egui::StrokeKind::Outside);
    
    // Play triangle
    let tri_size = btn_rect.height() * 0.25;
    let tri_center = btn_rect.center() + egui::vec2(tri_size * 0.1, 0.0); // Slight offset for visual centering
    let tri_points = vec![
        tri_center + egui::vec2(-tri_size * 0.5, -tri_size * 0.8),
        tri_center + egui::vec2(-tri_size * 0.5, tri_size * 0.8),
        tri_center + egui::vec2(tri_size * 0.8, 0.0),
    ];
    painter.add(egui::Shape::convex_polygon(tri_points, TEXT_WHITE, egui::Stroke::NONE));
    
    ui.interact(rect, ui.id().with("sync_button"), egui::Sense::click())
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

impl App for GitShiftApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut Frame) {
        // Continuous animation
        self.time = ctx.input(|i| i.time);
        ctx.request_repaint();
        
        let pulse = ((self.time * 2.0).sin() * 0.5 + 0.5) as f32;

        egui::CentralPanel::default().frame(egui::Frame::NONE.fill(BG_GRADIENT_TOP)).show(ctx, |ui| {
            let full_rect = ui.available_rect_before_wrap();
            
            // Gradient background
            {
                let painter = ui.painter();
                for i in 0..20 {
                    let t = i as f32 / 20.0;
                    let y = full_rect.top() + t * full_rect.height();
                    let color = egui::Color32::from_rgb(
                        (15.0 - t * 7.0) as u8,
                        (15.0 - t * 7.0) as u8,
                        (25.0 - t * 10.0) as u8,
                    );
                    painter.rect_filled(
                        egui::Rect::from_min_size(egui::pos2(full_rect.left(), y), egui::vec2(full_rect.width(), full_rect.height() / 20.0 + 1.0)),
                        0.0,
                        color
                    );
                }
            }
            
            // App Container (Glass Panel)
            let margin = 25.0;
            let container = full_rect.shrink(margin);
            draw_glass_panel(ui.painter(), container, 20.0);
            
            // Layout regions
            let header_height = 90.0;
            let log_height = 120.0;
            let header_rect = egui::Rect::from_min_size(container.min + egui::vec2(20.0, 15.0), egui::vec2(container.width() - 40.0, header_height));
            let content_rect = egui::Rect::from_min_max(
                egui::pos2(container.left() + 20.0, header_rect.bottom() + 15.0),
                egui::pos2(container.right() - 20.0, container.bottom() - log_height - 25.0)
            );
            let log_rect = egui::Rect::from_min_max(
                egui::pos2(container.left() + 20.0, container.bottom() - log_height - 10.0),
                egui::pos2(container.right() - 20.0, container.bottom() - 15.0)
            );
            
            // ═══ HEADER ═══
            {
                let painter = ui.painter();
                painter.text(header_rect.left_top() + egui::vec2(0.0, 10.0), egui::Align2::LEFT_TOP, "Git-Shift", egui::FontId::proportional(28.0), TEXT_WHITE);
                let time_str = Local::now().format("%A, %B %d, %Y • %I:%M %p").to_string();
                painter.text(header_rect.left_top() + egui::vec2(0.0, 45.0), egui::Align2::LEFT_TOP, &time_str, egui::FontId::proportional(12.0), TEXT_MUTED);
                
                // Avatar strip
                let avatar_y = header_rect.center().y + 15.0;
                for (i, profile) in self.profiles.iter().enumerate() {
                    let x = header_rect.right() - 50.0 - (i as f32 * 55.0);
                    draw_avatar(painter, egui::pos2(x, avatar_y), 20.0, profile, self.active_index == Some(i), pulse);
                }
            }
            
            // ═══ CONTENT GRID ═══
            let col_gap = 25.0;
            let left_width = (content_rect.width() - col_gap) * 0.45;
            let right_width = content_rect.width() - left_width - col_gap;
            
            let left_col = egui::Rect::from_min_size(content_rect.min, egui::vec2(left_width, content_rect.height()));
            let right_col = egui::Rect::from_min_size(content_rect.min + egui::vec2(left_width + col_gap, 0.0), egui::vec2(right_width, content_rect.height()));
            
            // Section labels
            {
                let painter = ui.painter();
                painter.text(left_col.left_top(), egui::Align2::LEFT_TOP, "Identity Profiles", egui::FontId::proportional(14.0), TEXT_SECONDARY);
                painter.text(right_col.left_top(), egui::Align2::LEFT_TOP, "Command Center", egui::FontId::proportional(14.0), TEXT_SECONDARY);
            }
            
            // ═══ LEFT: PROFILES ═══
            let profiles_area = egui::Rect::from_min_max(left_col.min + egui::vec2(0.0, 25.0), left_col.max);
            ui.allocate_new_ui(UiBuilder::new().max_rect(profiles_area), |ui| {
                egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
                    let mut clicked_idx = None;
                    for (i, profile) in self.profiles.iter().enumerate() {
                        let card_height = 70.0;
                        let (rect, _) = ui.allocate_exact_size(egui::vec2(ui.available_width(), card_height), egui::Sense::hover());
                        let response = draw_profile_card(ui, profile, self.active_index == Some(i), rect, pulse);
                        if response.clicked() {
                            clicked_idx = Some(i);
                        }
                        ui.add_space(10.0);
                    }
                    if let Some(i) = clicked_idx {
                        self.active_index = Some(i);
                    }
                    
                    ui.add_space(10.0);
                    
                    // Add Profile Section
                    if self.show_add_dialog {
                        // Add dialog panel
                        let dialog_rect = ui.available_rect_before_wrap();
                        let panel_rect = egui::Rect::from_min_size(dialog_rect.min, egui::vec2(ui.available_width(), 130.0));
                        draw_glass_panel(ui.painter(), panel_rect, 10.0);
                        
                        ui.allocate_new_ui(UiBuilder::new().max_rect(panel_rect.shrink(12.0)), |ui| {
                            ui.label(egui::RichText::new("Add New Profile").color(ACCENT_CYAN).size(12.0));
                            ui.add_space(8.0);
                            
                            ui.horizontal(|ui| {
                                ui.label(egui::RichText::new("Name:").color(TEXT_SECONDARY).size(11.0));
                                let name_edit = egui::TextEdit::singleline(&mut self.new_name)
                                    .desired_width(ui.available_width() - 10.0)
                                    .hint_text("John Doe");
                                ui.add(name_edit);
                            });
                            
                            ui.add_space(4.0);
                            
                            ui.horizontal(|ui| {
                                ui.label(egui::RichText::new("Email:").color(TEXT_SECONDARY).size(11.0));
                                let email_edit = egui::TextEdit::singleline(&mut self.new_email)
                                    .desired_width(ui.available_width() - 10.0)
                                    .hint_text("john@example.com");
                                ui.add(email_edit);
                            });
                            
                            ui.add_space(8.0);
                            
                            ui.horizontal(|ui| {
                                if ui.button(egui::RichText::new("✓ Save").color(ACCENT_GREEN)).clicked() {
                                    if !self.new_name.is_empty() && !self.new_email.is_empty() {
                                        let name = self.new_name.clone();
                                        let email = self.new_email.clone();
                                        self.add_profile(name, email);
                                        self.new_name.clear();
                                        self.new_email.clear();
                                        self.show_add_dialog = false;
                                    }
                                }
                                if ui.button(egui::RichText::new("✕ Cancel").color(ACCENT_RED)).clicked() {
                                    self.new_name.clear();
                                    self.new_email.clear();
                                    self.show_add_dialog = false;
                                }
                            });
                        });
                    } else {
                        // Add button
                        let btn_rect = egui::Rect::from_min_size(
                            ui.cursor().min,
                            egui::vec2(ui.available_width(), 40.0)
                        );
                        
                        let painter = ui.painter();
                        painter.rect_filled(btn_rect, 8.0, ACCENT_CYAN.linear_multiply(0.1));
                        painter.rect_stroke(btn_rect, 8.0, egui::Stroke::new(1.0, ACCENT_CYAN.linear_multiply(0.5)), egui::StrokeKind::Inside);
                        painter.text(btn_rect.center(), egui::Align2::CENTER_CENTER, "+ Add New Profile", egui::FontId::proportional(13.0), ACCENT_CYAN);
                        
                        let resp = ui.interact(btn_rect, ui.id().with("add_profile_btn"), egui::Sense::click());
                        if resp.clicked() {
                            self.show_add_dialog = true;
                        }
                    }
                });
            });
            
            // ═══ RIGHT: COMMAND CENTER ═══
            let cmd_area = egui::Rect::from_min_max(right_col.min + egui::vec2(0.0, 25.0), right_col.max);
            
            // Config Display
            let config_rect = egui::Rect::from_min_size(cmd_area.min, egui::vec2(cmd_area.width(), 70.0));
            draw_glass_panel(ui.painter(), config_rect, 12.0);
            
            {
                let painter = ui.painter();
                if let Some(idx) = self.active_index {
                    let p = &self.profiles[idx];
                    painter.text(config_rect.left_top() + egui::vec2(15.0, 12.0), egui::Align2::LEFT_TOP, "ACTIVE CONFIG", egui::FontId::proportional(10.0), ACCENT_GREEN);
                    painter.text(config_rect.left_top() + egui::vec2(15.0, 28.0), egui::Align2::LEFT_TOP, &format!("user.name = \"{}\"", p.name), egui::FontId::monospace(12.0), TEXT_WHITE);
                    painter.text(config_rect.left_top() + egui::vec2(15.0, 48.0), egui::Align2::LEFT_TOP, &format!("user.email = \"{}\"", p.email), egui::FontId::monospace(12.0), TEXT_SECONDARY);
                } else {
                    painter.text(config_rect.center(), egui::Align2::CENTER_CENTER, "No profile selected", egui::FontId::proportional(14.0), TEXT_MUTED);
                }
            }
            
            // Big Sync Button
            let btn_rect = egui::Rect::from_min_max(
                config_rect.left_bottom() + egui::vec2(0.0, 15.0),
                egui::pos2(config_rect.right(), cmd_area.bottom() - if self.show_alert { 55.0 } else { 0.0 })
            );
            
            ui.allocate_new_ui(UiBuilder::new().max_rect(btn_rect), |ui| {
                let (rect, _) = ui.allocate_exact_size(btn_rect.size(), egui::Sense::hover());
                let response = draw_sync_button(ui, rect, self.time);
                if response.clicked() {
                    self.switch_identity();
                }
            });
            
            // Alert button
            if self.show_alert {
                let alert_rect = egui::Rect::from_min_size(
                    egui::pos2(cmd_area.left(), cmd_area.bottom() - 45.0),
                    egui::vec2(cmd_area.width(), 40.0)
                );
                {
                    let painter = ui.painter();
                    painter.rect_filled(alert_rect, 8.0, ACCENT_RED.linear_multiply(0.15));
                    painter.rect_stroke(alert_rect, 8.0, egui::Stroke::new(1.0, ACCENT_RED), egui::StrokeKind::Inside);
                    painter.text(alert_rect.center(), egui::Align2::CENTER_CENTER, "⚠ OVERRIDE SYSTEM CREDENTIALS", egui::FontId::monospace(11.0), ACCENT_RED);
                }
                
                let resp = ui.interact(alert_rect, ui.id().with("alert_btn"), egui::Sense::click());
                if resp.clicked() {
                    self.override_credentials();
                }
            }
            
            // ═══ LOGS ═══
            draw_glass_panel(ui.painter(), log_rect, 12.0);
            
            ui.allocate_new_ui(UiBuilder::new().max_rect(log_rect.shrink(12.0)), |ui| {
                egui::ScrollArea::vertical().auto_shrink([false, false]).stick_to_bottom(true).show(ui, |ui| {
                    for (msg, log_type) in &self.logs {
                        let color = match log_type {
                            LogType::Info => TEXT_MUTED,
                            LogType::Success => ACCENT_GREEN,
                            LogType::Error => ACCENT_RED,
                            LogType::Command => ACCENT_CYAN,
                        };
                        ui.label(egui::RichText::new(msg).color(color).monospace().size(11.0));
                    }
                });
            });
            
            // Footer credit
            {
                let painter = ui.painter();
                painter.text(
                    egui::pos2(container.center().x, container.bottom() - 5.0), 
                    egui::Align2::CENTER_BOTTOM, 
                    "App made by Ritesh • Pyintel.online", 
                    egui::FontId::proportional(10.0), 
                    TEXT_MUTED.linear_multiply(0.6)
                );
            }
        });
    }
}

fn main() -> eframe::Result<()> {
    let options = NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([950.0, 700.0])
            .with_title("Git-Shift")
            .with_decorations(true),
        ..Default::default()
    };

    eframe::run_native(
        "Git-Shift",
        options,
        Box::new(|_cc| {
            let mut app = GitShiftApp::new();
            app.check_credentials();
            Ok(Box::new(app))
        }),
    )
}
