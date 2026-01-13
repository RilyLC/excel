# NoCode Excel DB 
## 项目结构

- client：Vite + React 
- server：Express API + SQLite

前端构建产物会输出到 server/public（见 client/vite.config.ts），所以 server 可以直接作为Web部署的静态站点 + API 入口。



## 数据目录与持久化

server 使用环境变量 APP_DATA_DIR 来决定数据库文件存放位置：

- 未设置：默认 server/data/app.db
- 设置后：APP_DATA_DIR/app.db

示例（Linux）：

```bash
APP_DATA_DIR=/var/lib/nocode-excel-db PORT=8080 node server/index.js
```


## 生产部署

适合部署到一台 Linux/Windows 服务器，运行 Node 进程（或用 pm2/systemd）。

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



