use std::sync::Arc;

pub mod commands;
pub mod database;
pub mod api_server;

pub use database::Database;

/// API 服务器端口
pub const API_SERVER_PORT: u16 = 9527;

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
        println!("数据目录: {:?}", db_path);
        
        let db = Database::new(db_path)
            .map_err(|e| format!("初始化数据库失败: {}", e))?;
        
        let db_arc = Arc::new(db);
        
        // 启动 API 服务器（在后台线程）
        let db_for_api = db_arc.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("创建 Tokio 运行时失败");
            rt.block_on(async {
                if let Err(e) = api_server::start_server(db_for_api, API_SERVER_PORT).await {
                    eprintln!("API 服务器启动失败: {}", e);
                }
            });
        });
        
        println!("🚀 API 服务器已启动在 http://127.0.0.1:{}", API_SERVER_PORT);
        
        Ok(Self {
            db: db_arc,
        })
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new().expect("初始化应用状态失败")
    }
}
