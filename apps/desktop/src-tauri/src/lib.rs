use std::sync::Arc;
use tokio::sync::Mutex;

pub mod commands;

/// 应用状态
pub struct AppState {
    pub accounts: Arc<Mutex<Vec<Account>>>,
    pub email_configs: Arc<Mutex<Vec<EmailConfig>>>,
    pub logs: Arc<Mutex<Vec<LogEntry>>>,
}

/// 账号信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Account {
    pub id: String,
    pub email: String,
    pub username: String,
    pub status: String,
    pub created_at: String,
}

/// 邮箱配置（域名 + IMAP + 密码配置合为一体）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EmailConfig {
    pub id: String,
    pub domain: String,           // 域名，如 example.com
    pub imap_host: String,        // IMAP服务器
    pub imap_port: u16,           // IMAP端口
    pub username: String,         // 用户名
    pub password: String,         // 密码/授权码
    pub password_mode: String,    // 密码模式: "random" 或 "same_as_email"
    pub created_at: String,
}

/// 日志条目
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            accounts: Arc::new(Mutex::new(Vec::new())),
            email_configs: Arc::new(Mutex::new(Vec::new())),
            logs: Arc::new(Mutex::new(Vec::new())),
        }
    }
}
