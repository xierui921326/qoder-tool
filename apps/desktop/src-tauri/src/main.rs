// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use qoder_account_manager_lib::{AppState, commands::*};

fn main() {
    let app_state = AppState::default();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // 仪表板
            get_dashboard_stats,
            // 账号管理
            get_accounts,
            add_account,
            delete_account,
            // 邮箱配置
            get_email_configs,
            add_email_config,
            update_email_config,
            delete_email_config,
            // 日志管理
            get_logs,
            add_log,
            clear_logs,
            // 系统管理
            clear_all_data,
            get_app_info,
        ])
        .run(tauri::generate_context!())
        .expect("启动Tauri应用失败");
}
