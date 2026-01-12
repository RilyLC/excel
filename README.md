# NoCode Excel DB (Electron)

## 项目结构

- client：Vite + React 前端
- server：Express API + SQLite（better-sqlite3），同时提供静态页面（server/public）
- electron：Electron 主进程，启动 server 并打开窗口

前端构建产物会输出到 server/public（见 client/vite.config.ts），所以 server 可以直接作为“Web 部署形态”的静态站点 + API 入口。

## 本地开发（桌面端）

### 1) 安装依赖

```bash
npm ci
npm ci --prefix client
```

### 2) 构建前端到 server/public

```bash
npm run build:client
```

### 3) 启动 Electron

```bash
npm start
```

## 本地运行（Web 形态）

### 1) 安装依赖

```bash
npm ci
npm run build:client
```

### 2) 启动服务

```bash
node server/index.js
```

默认监听 3001；也可以设置端口：

```bash
PORT=8080 node server/index.js
```

## 数据目录与持久化

server 使用环境变量 APP_DATA_DIR 来决定数据库文件存放位置：

- 未设置：默认 server/data/app.db
- 设置后：APP_DATA_DIR/app.db

示例（Linux）：

```bash
APP_DATA_DIR=/var/lib/nocode-excel-db PORT=8080 node server/index.js
```

桌面端打包后会把 APP_DATA_DIR 指向“可执行文件同级目录下的 data/”，便于携带与备份。

## 生产部署（Web 形态）

适合部署到一台 Linux/Windows 服务器，直接跑 Node 进程（或用 pm2/systemd 之类守护）。

### 1) 构建与准备

```bash
npm ci
npm run build:client
```

### 2) 启动（建议指定数据目录）

```bash
APP_DATA_DIR=/var/lib/nocode-excel-db PORT=8080 node server/index.js
```

### 3) 反向代理（可选）

用 Nginx/Caddy 反代到 Node 端口即可；静态资源与 API 都由同一个进程提供。

## 打包发布（桌面端）

Windows（仓库当前配置为 portable）：

```bash
npm ci
npm ci --prefix client
npm run dist
```

产物在 release/ 目录。首次启动会在可执行文件同级生成 data/app.db。

## GitHub Actions

仓库自带 CI（.github/workflows/node.js.yml）：

- 安装 root 与 client 依赖
- 对 client 执行 lint + build
- 对 server 做最小化 smoke 检查（加载 db 模块）

