// Tauri命令模块 - 使用SQLite持久化存储
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
pub fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let (total, active, today) = state.db.get_account_stats()
        .map_err(|e| format!("获取统计失败: {}", e))?;
    
    Ok(DashboardStats {
        total_accounts: total,
        active_accounts: active,
        today_registered: today,
        success_rate: if total > 0 { (active as f64 / total as f64) * 100.0 } else { 0.0 },
    })
}

// ============ 账号管理相关 ============

#[tauri::command]
pub fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    state.db.get_accounts()
        .map_err(|e| format!("获取账号失败: {}", e))
}

#[tauri::command]
pub fn add_account(
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
    
    state.db.add_account(&account)
        .map_err(|e| format!("添加账号失败: {}", e))?;
    
    Ok(account)
}

#[tauri::command]
pub fn delete_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_account(&id)
        .map_err(|e| format!("删除账号失败: {}", e))
}


// ============ 邮箱配置相关 ============

#[tauri::command]
pub fn get_email_configs(state: State<'_, AppState>) -> Result<Vec<EmailConfig>, String> {
    state.db.get_email_configs()
        .map_err(|e| format!("获取邮箱配置失败: {}", e))
}

#[tauri::command]
pub fn add_email_config(
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
    
    state.db.add_email_config(&config)
        .map_err(|e| format!("添加邮箱配置失败: {}", e))?;
    
    Ok(config)
}

#[tauri::command]
pub fn update_email_config(
    state: State<'_, AppState>,
    id: String,
    domain: String,
    imap_host: String,
    imap_port: u16,
    username: String,
    password: String,
    password_mode: String,
) -> Result<EmailConfig, String> {
    let config = EmailConfig {
        id: id.clone(),
        domain,
        imap_host,
        imap_port,
        username,
        password,
        password_mode,
        created_at: String::new(), // 更新时不修改创建时间
    };
    
    state.db.update_email_config(&config)
        .map_err(|e| format!("更新邮箱配置失败: {}", e))?;
    
    // 返回完整配置
    state.db.get_email_config_by_id(&id)
        .map_err(|e| format!("获取配置失败: {}", e))?
        .ok_or_else(|| "配置不存在".to_string())
}

#[tauri::command]
pub fn delete_email_config(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.delete_email_config(&id)
        .map_err(|e| format!("删除邮箱配置失败: {}", e))
}

// ============ 日志管理相关 ============

#[tauri::command]
pub fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    state.db.get_logs(500)
        .map_err(|e| format!("获取日志失败: {}", e))
}

#[tauri::command]
pub fn add_log(
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
    
    state.db.add_log(&entry)
        .map_err(|e| format!("添加日志失败: {}", e))?;
    
    Ok(entry)
}

#[tauri::command]
pub fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_logs()
        .map_err(|e| format!("清空日志失败: {}", e))
}


// ============ 系统管理相关 ============

#[tauri::command]
pub fn clear_all_data(state: State<'_, AppState>) -> Result<(), String> {
    state.db.clear_all_data()
        .map_err(|e| format!("清空数据失败: {}", e))
}

#[tauri::command]
pub fn get_app_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "name": "Qoder账号管理器",
        "version": "1.0.0",
        "author": "Qoder Team"
    }))
}

// ============ 注册相关 ============

use std::process::Command;

/// 注册结果
#[derive(serde::Serialize)]
pub struct RegisterResult {
    pub success: bool,
    pub email: String,
    pub username: Option<String>,
    pub error: Option<String>,
}

/// 单个账号注册
#[tauri::command]
pub fn register_single_account(
    state: State<'_, AppState>,
    email: String,
    config_id: String,
    headless: bool,
) -> Result<RegisterResult, String> {
    // 获取邮箱配置
    let config = state.db.get_email_config_by_id(&config_id)
        .map_err(|e| format!("获取配置失败: {}", e))?
        .ok_or("邮箱配置不存在")?;
    
    // 构建node-core CLI命令参数
    let node_core_path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("apps/node-core"))
        .ok_or("无法找到node-core路径")?;
    
    // 记录开始日志
    let start_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: "info".to_string(),
        message: format!("开始注册账号: {}", email),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&start_log);
    
    // 执行注册命令
    let result = execute_registration(&email, &config, headless, &node_core_path);
    
    // 记录结果日志
    let result_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: if result.success { "info" } else { "error" }.to_string(),
        message: format!(
            "注册 {}: {}", 
            email, 
            if result.success { "成功" } else { result.error.as_deref().unwrap_or("失败") }
        ),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&result_log);
    
    Ok(result)
}

/// 执行注册流程
fn execute_registration(
    email: &str,
    config: &EmailConfig,
    headless: bool,
    node_core_path: &std::path::Path,
) -> RegisterResult {
    // 构建命令参数
    let mut args = vec![
        "src/index.js".to_string(),
        "register".to_string(),
        "single".to_string(),
        email.to_string(),
        "--config".to_string(),
        config.domain.clone(),
    ];
    
    if headless {
        args.push("--headless".to_string());
    }
    
    // 尝试调用node-core CLI
    let output = Command::new("node")
        .current_dir(node_core_path)
        .args(&args)
        .output();
    
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            if output.status.success() || stdout.contains("成功") || stdout.contains("SUCCESS") {
                RegisterResult {
                    success: true,
                    email: email.to_string(),
                    username: Some(email.split('@').next().unwrap_or("user").to_string()),
                    error: None,
                }
            } else {
                RegisterResult {
                    success: false,
                    email: email.to_string(),
                    username: None,
                    error: Some(if stderr.is_empty() { 
                        stdout.to_string() 
                    } else { 
                        stderr.to_string() 
                    }),
                }
            }
        }
        Err(e) => {
            RegisterResult {
                success: false,
                email: email.to_string(),
                username: None,
                error: Some(format!("执行注册命令失败: {}。请确保已安装Node.js。", e)),
            }
        }
    }
}
