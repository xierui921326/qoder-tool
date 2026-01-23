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
        "author": "Qoder Team",
        "api_port": crate::API_SERVER_PORT
    }))
}

// ============ 注册相关 ============

use std::process::Command;

/// 注册结果
#[derive(serde::Serialize, serde::Deserialize)]
pub struct RegisterResult {
    pub success: bool,
    pub email: String,
    pub username: Option<String>,
    pub error: Option<String>,
}

/// 单个账号注册（异步执行，避免阻塞 UI）
#[tauri::command]
pub async fn register_single_account(
    state: State<'_, AppState>,
    email: String,
    config_id: String,
    headless: bool,
) -> Result<RegisterResult, String> {
    // 获取邮箱配置
    let config = state.db.get_email_config_by_id(&config_id)
        .map_err(|e| format!("获取配置失败: {}", e))?
        .ok_or("邮箱配置不存在")?;
    
    // 记录开始日志
    let start_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: "info".to_string(),
        message: format!("开始注册账号: {} (配置: {})", email, config.domain),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&start_log);
    
    // 获取 node-core 路径
    let node_core_path = get_node_core_path();
    
    // 在异步任务中执行注册，避免阻塞主线程
    let result = match node_core_path {
        Some(path) => {
            // 构建配置 JSON
            let config_json = serde_json::json!({
                "email": email,
                "configId": config_id,
                "headless": headless,
                "emailConfig": {
                    "domain": config.domain,
                    "imapHost": config.imap_host,
                    "imapPort": config.imap_port,
                    "username": config.username,
                    "password": config.password,
                    "passwordMode": config.password_mode
                },
                "apiPort": crate::API_SERVER_PORT
            });
            
            // 使用 tokio::task::spawn_blocking 在独立线程执行
            let path_clone = path.clone();
            let config_clone = config_json.clone();
            
            tokio::task::spawn_blocking(move || {
                execute_registration_v2(&config_clone, &path_clone)
            }).await.unwrap_or_else(|e| RegisterResult {
                success: false,
                email: email.clone(),
                username: None,
                error: Some(format!("任务执行失败: {}", e)),
            })
        },
        None => {
            let cwd = std::env::current_dir().unwrap_or_default();
            RegisterResult {
                success: false,
                email: email.clone(),
                username: None,
                error: Some(format!("无法找到 node-core 模块，当前目录: {:?}", cwd)),
            }
        }
    };
    
    // 记录结果日志
    let result_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: if result.success { "info" } else { "error" }.to_string(),
        message: format!(
            "注册 {}: {}", 
            email, 
            if result.success { "成功".to_string() } else { result.error.clone().unwrap_or("失败".to_string()) }
        ),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&result_log);
    
    Ok(result)
}

/// 获取 node-core 路径
fn get_node_core_path() -> Option<std::path::PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    
    // 从当前目录开始，向上查找包含 apps/node-core 的目录
    // 当前目录可能是：
    // - /path/to/qoder-tool (项目根目录)
    // - /path/to/qoder-tool/apps/desktop (desktop 目录)
    // - /path/to/qoder-tool/apps/desktop/src-tauri (Tauri 运行时目录)
    let possible_paths = vec![
        cwd.join("apps/node-core"),                                           // 从项目根目录
        cwd.join("../node-core"),                                             // 从 apps/desktop
        cwd.join("../../node-core"),                                          // 从 apps/desktop/src-tauri
        cwd.join("../../../apps/node-core"),                                  // 从 apps/desktop/src-tauri 向上到根目录
        cwd.parent().map(|p| p.join("node-core")).unwrap_or_default(),        // 父目录/node-core
        cwd.parent().and_then(|p| p.parent()).map(|p| p.join("node-core")).unwrap_or_default(),
        cwd.parent().and_then(|p| p.parent()).and_then(|p| p.parent()).map(|p| p.join("apps/node-core")).unwrap_or_default(),
    ];
    
    for path in possible_paths {
        if path.as_os_str().is_empty() {
            continue;
        }
        // 先尝试规范化路径
        if let Ok(normalized) = path.canonicalize() {
            if normalized.join("package.json").exists() {
                return Some(normalized);
            }
        }
        // 直接检查路径
        if path.join("package.json").exists() {
            return Some(path);
        }
    }
    
    None
}

/// 执行注册流程 V2（通过 JSON 传递配置）
fn execute_registration_v2(
    config_json: &serde_json::Value,
    node_core_path: &std::path::Path,
) -> RegisterResult {
    let email = config_json["email"].as_str().unwrap_or("");
    
    // 检查 node 是否可用
    if Command::new("node").arg("--version").output().is_err() {
        return RegisterResult {
            success: false,
            email: email.to_string(),
            username: None,
            error: Some("Node.js 未安装或不在 PATH 中".to_string()),
        };
    }
    
    // 检查入口文件
    let index_path = node_core_path.join("src/register-cli.js");
    if !index_path.exists() {
        // 如果新入口不存在，使用旧入口
        let old_index = node_core_path.join("src/index.js");
        if !old_index.exists() {
            return RegisterResult {
                success: false,
                email: email.to_string(),
                username: None,
                error: Some(format!("找不到入口文件: {:?}", index_path)),
            };
        }
    }
    
    // 将配置 JSON 转为字符串
    let config_str = serde_json::to_string(config_json).unwrap_or_default();
    
    // 执行注册命令，通过 stdin 传递配置
    let output = Command::new("node")
        .current_dir(node_core_path)
        .arg("src/register-cli.js")
        .arg("--config-json")
        .arg(&config_str)
        .env("NON_INTERACTIVE", "true")
        .output();
    
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // 尝试解析 JSON 结果（优先）
            if let Ok(result) = serde_json::from_str::<RegisterResult>(&stdout) {
                return result;
            }
            
            // 如果无法解析 JSON，检查退出码
            if output.status.success() {
                // 退出码为 0，但无法解析 JSON，尝试从输出中提取信息
                RegisterResult {
                    success: false,
                    email: email.to_string(),
                    username: None,
                    error: Some(format!("无法解析注册结果，输出: {}", stdout.lines().take(3).collect::<Vec<_>>().join(" "))),
                }
            } else {
                // 退出码非 0，注册失败
                let error_msg = if !stderr.is_empty() && !stderr.trim().is_empty() {
                    format!("错误: {}", stderr.lines().take(3).collect::<Vec<_>>().join(" "))
                } else if !stdout.is_empty() && !stdout.trim().is_empty() {
                    format!("输出: {}", stdout.lines().take(3).collect::<Vec<_>>().join(" "))
                } else {
                    format!("注册失败，退出码: {:?}", output.status.code())
                };
                
                RegisterResult {
                    success: false,
                    email: email.to_string(),
                    username: None,
                    error: Some(error_msg),
                }
            }
        }
        Err(e) => {
            RegisterResult {
                success: false,
                email: email.to_string(),
                username: None,
                error: Some(format!("执行命令失败: {}", e)),
            }
        }
    }
}
