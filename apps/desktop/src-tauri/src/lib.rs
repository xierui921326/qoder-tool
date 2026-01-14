use std::sync::Arc;

pub mod commands;
pub mod database;

pub use database::Database;

/// 应用状态 - 使用SQLite数据库
pub struct AppState {
    pub db: Arc<Database>,
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

impl AppState {
    pub fn new() -> Result<Self, String> {
        // 初始化数据目录
        database::init_data_dirs()
            .map_err(|e| format!("创建数据目录失败: {}", e))?;
        
        let db_path = database::get_db_path();
        println!("数据目录结构:");
        println!("  - 数据库: {:?}", db_path);
        println!("  - 日志: {:?}", database::get_logs_dir());
        println!("  - 配置: {:?}", database::get_config_dir());
        println!("  - 缓存: {:?}", database::get_cache_dir());
        
        let db = Database::new(db_path)
            .map_err(|e| format!("初始化数据库失败: {}", e))?;
        
        Ok(Self {
            db: Arc::new(db),
        })
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new().expect("初始化应用状态失败")
    }
}
