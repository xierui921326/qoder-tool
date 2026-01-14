// 数据库模块 - SQLite持久化存储
use rusqlite::{Connection, Result as SqliteResult, params, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use crate::{Account, EmailConfig, LogEntry};

/// 数据库管理器
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// 创建数据库连接
    pub fn new(db_path: PathBuf) -> SqliteResult<Self> {
        // 确保目录存在
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open(&db_path)?;
        let db = Self { conn: Mutex::new(conn) };
        db.init_tables()?;
        Ok(db)
    }
    
    /// 初始化数据库表
    fn init_tables(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        
        // 账号表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 邮箱配置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS email_configs (
                id TEXT PRIMARY KEY,
                domain TEXT NOT NULL,
                imap_host TEXT NOT NULL,
                imap_port INTEGER NOT NULL DEFAULT 993,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                password_mode TEXT NOT NULL DEFAULT 'random',
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // 日志表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )",
            [],
        )?;
        
        // 创建索引
        conn.execute("CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)", [])?;
        
        Ok(())
    }
    
    // ============ 账号操作 ============
    
    /// 获取所有账号
    pub fn get_accounts(&self) -> SqliteResult<Vec<Account>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, email, username, status, created_at FROM accounts ORDER BY created_at DESC"
        )?;
        
        let accounts = stmt.query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                email: row.get(1)?,
                username: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        
        Ok(accounts)
    }
    
    /// 添加账号
    pub fn add_account(&self, account: &Account) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO accounts (id, email, username, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![account.id, account.email, account.username, account.status, account.created_at],
        )?;
        Ok(())
    }
    
    /// 删除账号
    pub fn delete_account(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    /// 获取账号统计
    pub fn get_account_stats(&self) -> SqliteResult<(usize, usize, usize)> {
        let conn = self.conn.lock().unwrap();
        
        let total: usize = conn.query_row("SELECT COUNT(*) FROM accounts", [], |row| row.get(0))?;
        let active: usize = conn.query_row(
            "SELECT COUNT(*) FROM accounts WHERE status = 'active'", [], |row| row.get(0)
        )?;
        
        // 今日注册数
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let today_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM accounts WHERE created_at LIKE ?1",
            params![format!("{}%", today)],
            |row| row.get(0)
        )?;
        
        Ok((total, active, today_count))
    }

    // ============ 邮箱配置操作 ============
    
    /// 获取所有邮箱配置
    pub fn get_email_configs(&self) -> SqliteResult<Vec<EmailConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, domain, imap_host, imap_port, username, password, password_mode, created_at 
             FROM email_configs ORDER BY created_at DESC"
        )?;
        
        let configs = stmt.query_map([], |row| {
            Ok(EmailConfig {
                id: row.get(0)?,
                domain: row.get(1)?,
                imap_host: row.get(2)?,
                imap_port: row.get(3)?,
                username: row.get(4)?,
                password: row.get(5)?,
                password_mode: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        
        Ok(configs)
    }
    
    /// 添加邮箱配置
    pub fn add_email_config(&self, config: &EmailConfig) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO email_configs (id, domain, imap_host, imap_port, username, password, password_mode, created_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                config.id, config.domain, config.imap_host, config.imap_port,
                config.username, config.password, config.password_mode, config.created_at
            ],
        )?;
        Ok(())
    }
    
    /// 更新邮箱配置
    pub fn update_email_config(&self, config: &EmailConfig) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE email_configs SET domain = ?2, imap_host = ?3, imap_port = ?4, 
             username = ?5, password = ?6, password_mode = ?7 WHERE id = ?1",
            params![
                config.id, config.domain, config.imap_host, config.imap_port,
                config.username, config.password, config.password_mode
            ],
        )?;
        Ok(())
    }
    
    /// 删除邮箱配置
    pub fn delete_email_config(&self, id: &str) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM email_configs WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    /// 根据ID获取邮箱配置
    pub fn get_email_config_by_id(&self, id: &str) -> SqliteResult<Option<EmailConfig>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, domain, imap_host, imap_port, username, password, password_mode, created_at 
             FROM email_configs WHERE id = ?1"
        )?;
        
        let config = stmt.query_row(params![id], |row| {
            Ok(EmailConfig {
                id: row.get(0)?,
                domain: row.get(1)?,
                imap_host: row.get(2)?,
                imap_port: row.get(3)?,
                username: row.get(4)?,
                password: row.get(5)?,
                password_mode: row.get(6)?,
                created_at: row.get(7)?,
            })
        }).optional()?;
        
        Ok(config)
    }

    // ============ 日志操作 ============
    
    /// 获取日志（最近500条）
    pub fn get_logs(&self, limit: usize) -> SqliteResult<Vec<LogEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, level, message, timestamp FROM logs ORDER BY timestamp DESC LIMIT ?1"
        )?;
        
        let logs = stmt.query_map(params![limit], |row| {
            Ok(LogEntry {
                id: row.get(0)?,
                level: row.get(1)?,
                message: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })?.collect::<SqliteResult<Vec<_>>>()?;
        
        Ok(logs)
    }
    
    /// 添加日志
    pub fn add_log(&self, log: &LogEntry) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO logs (id, level, message, timestamp) VALUES (?1, ?2, ?3, ?4)",
            params![log.id, log.level, log.message, log.timestamp],
        )?;
        Ok(())
    }
    
    /// 清空日志
    pub fn clear_logs(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM logs", [])?;
        Ok(())
    }
    
    // ============ 系统操作 ============
    
    /// 清空所有数据
    pub fn clear_all_data(&self) -> SqliteResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM accounts", [])?;
        conn.execute("DELETE FROM email_configs", [])?;
        conn.execute("DELETE FROM logs", [])?;
        Ok(())
    }
}

/// 获取数据库路径
pub fn get_db_path() -> PathBuf {
    get_data_dir().join("db").join("qoder.db")
}

/// 获取日志目录
pub fn get_logs_dir() -> PathBuf {
    get_data_dir().join("logs")
}

/// 获取配置目录
pub fn get_config_dir() -> PathBuf {
    get_data_dir().join("config")
}

/// 获取缓存目录
pub fn get_cache_dir() -> PathBuf {
    get_data_dir().join("cache")
}

/// 获取数据根目录
fn get_data_dir() -> PathBuf {
    // 开发环境使用项目根目录下的 .qoder-data 目录（在src-tauri外面，避免触发重编译）
    #[cfg(debug_assertions)]
    {
        let current_dir = std::env::current_dir().unwrap_or_default();
        // 检查是否在src-tauri目录下运行
        if current_dir.ends_with("src-tauri") {
            current_dir.parent().unwrap().join(".qoder-data")
        } else if current_dir.join("src-tauri").exists() {
            current_dir.join(".qoder-data")
        } else {
            current_dir.join("apps/desktop/.qoder-data")
        }
    }
    
    // 生产环境使用系统数据目录
    #[cfg(not(debug_assertions))]
    {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("qoder-account-manager")
    }
}

/// 初始化所有数据目录
pub fn init_data_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(get_db_path().parent().unwrap())?;
    std::fs::create_dir_all(get_logs_dir())?;
    std::fs::create_dir_all(get_config_dir())?;
    std::fs::create_dir_all(get_cache_dir())?;
    Ok(())
}
