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
    
    // 记录开始日志
    let start_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: "info".to_string(),
        message: format!("开始注册账号: {} (配置: {})", email, config.domain),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&start_log);
    
    // 记录当前工作目录
    let cwd = std::env::current_dir().unwrap_or_default();
    let cwd_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: "debug".to_string(),
        message: format!("当前工作目录: {:?}", cwd),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&cwd_log);
    
    // 获取node-core路径
    let node_core_path = get_node_core_path();
    
    // 记录路径日志
    let path_log = LogEntry {
        id: Uuid::new_v4().to_string(),
        level: "debug".to_string(),
        message: format!("node-core路径: {:?}", node_core_path),
        timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };
    let _ = state.db.add_log(&path_log);
    
    // 执行注册命令
    let result = match node_core_path {
        Some(path) => {
            // 记录即将执行的命令
            let cmd_log = LogEntry {
                id: Uuid::new_v4().to_string(),
                level: "debug".to_string(),
                message: format!("执行命令: node src/index.js register single {} --config {}", email, config.domain),
                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            };
            let _ = state.db.add_log(&cmd_log);
            
            execute_registration(&email, &config, headless, &path)
        },
        None => {
            // 记录路径查找失败的详细信息
            let err_log = LogEntry {
                id: Uuid::new_v4().to_string(),
                level: "error".to_string(),
                message: format!("无法找到node-core，当前目录: {:?}，尝试的路径: apps/node-core", cwd),
                timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            };
            let _ = state.db.add_log(&err_log);
            
            RegisterResult {
                success: false,
                email: email.clone(),
                username: None,
                error: Some(format!("无法找到node-core模块，当前目录: {:?}", cwd)),
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

/// 获取node-core路径
fn get_node_core_path() -> Option<std::path::PathBuf> {
    // 获取当前工作目录
    let cwd = std::env::current_dir().ok()?;
    
    // 尝试多种路径策略
    let possible_paths = vec![
        // 策略1：从当前目录直接查找 apps/node-core
        cwd.join("apps/node-core"),
        // 策略2：从当前目录向上一级查找 apps/node-core
        cwd.parent().map(|p| p.join("apps/node-core")).unwrap_or_default(),
        // 策略3：从当前目录向上两级查找 apps/node-core
        cwd.parent().and_then(|p| p.parent()).map(|p| p.join("apps/node-core")).unwrap_or_default(),
        // 策略4：从src-tauri目录向上查找
        cwd.join("../node-core"),
        cwd.join("../../node-core"),
        // 策略5：相对于可执行文件位置
        std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.join("../../../apps/node-core"))).unwrap_or_default(),
    ];
    
    for path in possible_paths {
        if path.as_os_str().is_empty() {
            continue;
        }
        // 先检查原始路径
        if path.join("package.json").exists() {
            return Some(path);
        }
        // 再尝试规范化路径
        if let Ok(normalized) = path.canonicalize() {
            if normalized.join("package.json").exists() {
                return Some(normalized);
            }
        }
    }
    
    None
}

/// 执行注册流程
fn execute_registration(
    email: &str,
    config: &EmailConfig,
    headless: bool,
    node_core_path: &std::path::Path,
) -> RegisterResult {
    // 检查node是否可用
    let node_check = Command::new("node")
        .arg("--version")
        .output();
    
    if node_check.is_err() {
        return RegisterResult {
            success: false,
            email: email.to_string(),
            username: None,
            error: Some("Node.js未安装或不在PATH中".to_string()),
        };
    }
    
    // 检查index.js是否存在
    let index_path = node_core_path.join("src/index.js");
    if !index_path.exists() {
        return RegisterResult {
            success: false,
            email: email.to_string(),
            username: None,
            error: Some(format!("找不到入口文件: {:?}", index_path)),
        };
    }
    
    // 构建命令参数
    // 使用 --config 指定邮箱配置名称（域名）
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
    
    // 设置环境变量，传递IMAP配置
    let imap_port_str = config.imap_port.to_string();
    let env_vars = vec![
        ("QODER_IMAP_HOST", config.imap_host.as_str()),
        ("QODER_IMAP_PORT", imap_port_str.as_str()),
        ("QODER_IMAP_USER", config.username.as_str()),
        ("QODER_IMAP_PASS", config.password.as_str()),
        ("QODER_EMAIL_DOMAIN", config.domain.as_str()),
    ];
    
    // 尝试调用node-core CLI
    let mut cmd = Command::new("node");
    cmd.current_dir(node_core_path)
        .args(&args);
    
    // 添加环境变量
    for (key, value) in &env_vars {
        cmd.env(*key, *value);
    }
    
    let output = cmd.output();
    
    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // 组合完整输出用于调试
            let _full_output = format!("stdout: {}\nstderr: {}", stdout, stderr);
            
            // 检查是否成功
            if output.status.success() || stdout.contains("成功") || stdout.contains("SUCCESS") || stdout.contains("✅") {
                RegisterResult {
                    success: true,
                    email: email.to_string(),
                    username: Some(email.split('@').next().unwrap_or("user").to_string()),
                    error: None,
                }
            } else {
                // 组合错误信息，提供更详细的调试信息
                let error_msg = if !stderr.is_empty() && !stderr.trim().is_empty() {
                    format!("错误: {}", stderr.lines().take(3).collect::<Vec<_>>().join(" "))
                } else if !stdout.is_empty() && !stdout.trim().is_empty() {
                    format!("输出: {}", stdout.lines().take(3).collect::<Vec<_>>().join(" "))
                } else {
                    format!("注册失败，退出码: {:?}，路径: {:?}", output.status.code(), node_core_path)
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
                error: Some(format!("执行命令失败: {}，路径: {:?}", e, node_core_path)),
            }
        }
    }
}
