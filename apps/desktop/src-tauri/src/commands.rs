use crate::{Account, AppState, EmailConfig, LogEntry};
use tauri::State;
use uuid::Uuid;
use chrono::Local;

// ============ 仪表板相关 ============

#[derive(serde::Serialize)]
pub struct DashboardStats {
    pub total_accounts: usize,
    pub active_accounts: usize,
    pub today_registered: usize,
    pub success_rate: f64,
}

#[tauri::command]
pub async fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let accounts = state.accounts.lock().await;
    let total = accounts.len();
    let active = accounts.iter().filter(|a| a.status == "active").count();
    
    Ok(DashboardStats {
        total_accounts: total,
        active_accounts: active,
        today_registered: 0,
        success_rate: if total > 0 { (active as f64 / total as f64) * 100.0 } else { 0.0 },
    })
}

// ============ 账号管理相关 ============

#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let accounts = state.accounts.lock().await;
    Ok(accounts.clone())
}

#[tauri::command]
pub async fn add_account(
    state: State<'_, AppState>,
    email: String,
    username: String,
) -> Result<Account, String> {
    let account = Account {
        id: Uuid::new_v4().to_string(),
        email,
        username,
        status: "active".to_string(),
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    
    let mut accounts = state.accounts.lock().await;
    accounts.push(account.clone());
    
    Ok(account)
}

#[tauri::command]
pub async fn delete_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut accounts = state.accounts.lock().await;
    accounts.retain(|a| a.id != id);
    Ok(())
}

// ============ 邮箱配置相关 ============

#[tauri::command]
pub async fn get_email_configs(state: State<'_, AppState>) -> Result<Vec<EmailConfig>, String> {
    let configs = state.email_configs.lock().await;
    Ok(configs.clone())
}

#[tauri::command]
pub async fn add_email_config(
    state: State<'_, AppState>,
    domain: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
    password_mode: String,
) -> Result<EmailConfig, String> {
    let config = EmailConfig {
        id: Uuid::new_v4().to_string(),
        domain,
        imap_host,
        imap_port,
        username,
        password,
        password_mode,
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    
    let mut configs = state.email_configs.lock().await;
    configs.push(config.clone());
    
    Ok(config)
}

#[tauri::command]
pub async fn update_email_config(
    state: State<'_, AppState>,
    id: String,
    domain: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
    password_mode: String,
) -> Result<EmailConfig, String> {
    let mut configs = state.email_configs.lock().await;
    
    if let Some(config) = configs.iter_mut().find(|c| c.id == id) {
        config.domain = domain;
        config.imap_host = imap_host;
        config.imap_port = imap_port;
        config.username = username;
        config.password = password;
        config.password_mode = password_mode;
        return Ok(config.clone());
    }
    
    Err("配置不存在".to_string())
}

#[tauri::command]
pub async fn delete_email_config(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut configs = state.email_configs.lock().await;
    configs.retain(|c| c.id != id);
    Ok(())
}

// ============ 日志管理相关 ============

#[tauri::command]
pub async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    let logs = state.logs.lock().await;
    Ok(logs.clone())
}

#[tauri::command]
pub async fn add_log(
    state: State<'_, AppState>,
    level: String,
    message: String,
) -> Result<LogEntry, String> {
    let entry = LogEntry {
        id: Uuid::new_v4().to_string(),
        level,
        message,
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    
    let mut logs = state.logs.lock().await;
    logs.push(entry.clone());
    
    Ok(entry)
}

#[tauri::command]
pub async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    let mut logs = state.logs.lock().await;
    logs.clear();
    Ok(())
}

// ============ 系统管理相关 ============

#[tauri::command]
pub async fn clear_all_data(state: State<'_, AppState>) -> Result<(), String> {
    let mut accounts = state.accounts.lock().await;
    let mut email_configs = state.email_configs.lock().await;
    let mut logs = state.logs.lock().await;
    
    accounts.clear();
    email_configs.clear();
    logs.clear();
    
    Ok(())
}

#[tauri::command]
pub fn get_app_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "name": "Qoder账号管理器",
        "version": "1.0.0",
        "author": "Qoder Team"
    }))
}
