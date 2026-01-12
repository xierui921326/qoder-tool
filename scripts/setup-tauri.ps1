# Tauri环境设置脚本 (Windows PowerShell)
# 自动安装Rust和Tauri依赖

Write-Host "🦀 设置Tauri开发环境..." -ForegroundColor Green

# 检查管理员权限
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "⚠️ 需要管理员权限来安装系统依赖" -ForegroundColor Yellow
    Write-Host "请以管理员身份运行PowerShell" -ForegroundColor Yellow
    exit 1
}

# 检查并安装Chocolatey
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安装Chocolatey包管理器..." -ForegroundColor Blue
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "✅ Chocolatey安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ Chocolatey已安装" -ForegroundColor Green
}

# 安装Microsoft C++ Build Tools
Write-Host "📦 安装Microsoft C++ Build Tools..." -ForegroundColor Blue
try {
    choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools" -y
    Write-Host "✅ Microsoft C++ Build Tools安装完成" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Microsoft C++ Build Tools安装失败，请手动安装" -ForegroundColor Yellow
}

# 安装Rust
if (!(Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安装Rust..." -ForegroundColor Blue
    $rustupUrl = "https://win.rustup.rs/x86_64"
    $rustupPath = "$env:TEMP\rustup-init.exe"
    
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupPath
    Start-Process -FilePath $rustupPath -ArgumentList "-y" -Wait
    
    # 添加Cargo到PATH
    $env:PATH += ";$env:USERPROFILE\.cargo\bin"
    [Environment]::SetEnvironmentVariable("PATH", $env:PATH, [EnvironmentVariableTarget]::User)
    
    Write-Host "✅ Rust安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ Rust已安装: $(rustc --version)" -ForegroundColor Green
}

# 更新Rust
Write-Host "🔄 更新Rust..." -ForegroundColor Blue
rustup update

# 安装Tauri CLI
Write-Host "📦 安装Tauri CLI..." -ForegroundColor Blue
if (!(Get-Command cargo-tauri -ErrorAction SilentlyContinue)) {
    cargo install tauri-cli
    Write-Host "✅ Tauri CLI安装完成" -ForegroundColor Green
} else {
    Write-Host "✅ Tauri CLI已安装" -ForegroundColor Green
    cargo install tauri-cli --force  # 强制更新到最新版本
}

# 验证安装
Write-Host "🔍 验证安装..." -ForegroundColor Blue
Write-Host "Node.js: $(node --version)" -ForegroundColor Cyan
Write-Host "npm: $(npm --version)" -ForegroundColor Cyan
Write-Host "Rust: $(rustc --version)" -ForegroundColor Cyan
Write-Host "Cargo: $(cargo --version)" -ForegroundColor Cyan
Write-Host "Tauri CLI: $(cargo tauri --version)" -ForegroundColor Cyan

Write-Host ""
Write-Host "🎉 Tauri环境设置完成！" -ForegroundColor Green
Write-Host ""
Write-Host "现在您可以运行以下命令：" -ForegroundColor Yellow
Write-Host "  make tauri-dev    # 启动开发模式" -ForegroundColor Cyan
Write-Host "  make tauri-build  # 构建应用" -ForegroundColor Cyan
Write-Host ""
Write-Host "如果遇到问题，请参考：" -ForegroundColor Yellow
Write-Host "  https://tauri.app/v1/guides/getting-started/prerequisites" -ForegroundColor Cyan