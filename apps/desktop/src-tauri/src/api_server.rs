// HTTP API 服务器模块
// 提供 REST API 供 Node.js 核心调用

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::database::Database;
use crate::{Account, EmailConfig, LogEntry};

/// API 服务器状态
pub struct ApiState {
    pub db: Arc<Database>,
}

/// API 响应包装
#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

/// 创建 API 路由
pub fn create_router(db: Arc<Database>) -> Router {
    let state = Arc::new(ApiState { db });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // 邮箱配置 API
        .route("/api/email-configs", get(get_email_configs))
        .route("/api/email-configs/:id", get(get_email_config_by_id))
        // 账号 API
        .route("/api/accounts", get(get_accounts).post(create_account))
        .route("/api/accounts/:id", get(get_account_by_id))
        // 日志 API
        .route("/api/logs", get(get_logs).post(create_log))
        // 健康检查
        .route("/api/health", get(health_check))
        .layer(cors)
        .with_state(state)
}

/// 启动 API 服务器
pub async fn start_server(db: Arc<Database>, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = create_router(db);
    let addr = format!("127.0.0.1:{}", port);
    
    println!("🚀 API 服务器启动在 http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}

// ============ 邮箱配置 API ============

async fn get_email_configs(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<Vec<EmailConfig>>>, StatusCode> {
    match state.db.get_email_configs() {
        Ok(configs) => Ok(Json(ApiResponse::ok(configs))),
        Err(e) => Ok(Json(ApiResponse::err(format!("获取邮箱配置失败: {}", e)))),
    }
}

async fn get_email_config_by_id(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<EmailConfig>>, StatusCode> {
    match state.db.get_email_config_by_id(&id) {
        Ok(Some(config)) => Ok(Json(ApiResponse::ok(config))),
        Ok(None) => Ok(Json(ApiResponse::err(format!("配置不存在: {}", id)))),
        Err(e) => Ok(Json(ApiResponse::err(format!("获取配置失败: {}", e)))),
    }
}

// ============ 账号 API ============

async fn get_accounts(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<Vec<Account>>>, StatusCode> {
    match state.db.get_accounts() {
        Ok(accounts) => Ok(Json(ApiResponse::ok(accounts))),
        Err(e) => Ok(Json(ApiResponse::err(format!("获取账号失败: {}", e)))),
    }
}

/// 创建账号请求
#[derive(Deserialize)]
pub struct CreateAccountRequest {
    pub email: String,
    pub username: String,
    pub password: Option<String>,  // 可选，用于存储注册密码
    pub status: Option<String>,
}

async fn create_account(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<CreateAccountRequest>,
) -> Result<Json<ApiResponse<Account>>, StatusCode> {
    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        email: req.email,
        username: req.username,
        status: req.status.unwrap_or_else(|| "active".to_string()),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    match state.db.add_account(&account) {
        Ok(_) => Ok(Json(ApiResponse::ok(account))),
        Err(e) => Ok(Json(ApiResponse::err(format!("创建账号失败: {}", e)))),
    }
}

async fn get_account_by_id(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Account>>, StatusCode> {
    match state.db.get_account_by_id(&id) {
        Ok(Some(account)) => Ok(Json(ApiResponse::ok(account))),
        Ok(None) => Ok(Json(ApiResponse::err(format!("账号不存在: {}", id)))),
        Err(e) => Ok(Json(ApiResponse::err(format!("获取账号失败: {}", e)))),
    }
}

// ============ 日志 API ============

async fn get_logs(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<Vec<LogEntry>>>, StatusCode> {
    match state.db.get_logs(100) {
        Ok(logs) => Ok(Json(ApiResponse::ok(logs))),
        Err(e) => Ok(Json(ApiResponse::err(format!("获取日志失败: {}", e)))),
    }
}

/// 创建日志请求
#[derive(Deserialize)]
pub struct CreateLogRequest {
    pub level: String,
    pub message: String,
}

async fn create_log(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<CreateLogRequest>,
) -> Result<Json<ApiResponse<LogEntry>>, StatusCode> {
    let log = LogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        level: req.level,
        message: req.message,
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    match state.db.add_log(&log) {
        Ok(_) => Ok(Json(ApiResponse::ok(log))),
        Err(e) => Ok(Json(ApiResponse::err(format!("创建日志失败: {}", e)))),
    }
}

// ============ 健康检查 ============

#[derive(Serialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
}

async fn health_check() -> Json<HealthStatus> {
    Json(HealthStatus {
        status: "ok".to_string(),
        version: "1.0.0".to_string(),
    })
}
