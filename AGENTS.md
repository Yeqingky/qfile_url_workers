# AGENTS.md

## 项目

`qfile_url_workers` 是 QQ 闪传分享链接解析服务的 Cloudflare Workers 实现. 无 Web UI, 所有响应为 JSON, 本地 `wrangler dev` 默认端口 8787, 可用 `--port` 指定.

## 结构

- `src/qfile.ts`: 分享页解析, 签名请求, 文件列表和直链获取.
- `src/index.ts`: Worker 入口, 路由与请求校验.
- `test/qfile.test.ts`: 分享链接校验, 文件名转义和 HMAC-SHA1 签名的单元测试.
- `wrangler.jsonc`: Worker 名称, 入口和兼容日期.
- `.gitea/workflows/mirror.yml`: 分支和标签推送时完整镜像到 GitHub.

## 接口

- `GET /qfile?url=<分享链接>`: 返回文件列表, 文件项包含 `file_id`, `name`, `size`, `sha1`.
- `GET /qfile?url=<分享链接>&link=true`: 在上述文件项中 `sha1` 之后追加 `url` 直链; 任一文件签发失败时整个请求返回 502.
- `GET /url?url=<分享链接>&file_id=<文件 id>`: 返回 `{"url":"..."}` 直链.
- 错误统一返回 `{"error":"..."}`.

## 上游协议

- 分享页 HTML 中的 `GetFileset_` 数据提供 `fileset_id`.
- `trpc.file.FileFlashTrans/GetFileList` 获取文件列表.
- `trpc.qqntv2.richmedia.InnerProxy/BatchDownload` 获取直链.
- 请求体 JSON 按字面量字段顺序序列化, `scene_type` 必须位于末尾.
- 签名算法: `HMAC-SHA1("9EB18BB9ED457684", body + nonce + timestamp)` 的 hex 值, 通过 Web Crypto 计算.
- 使用随机匿名 uin 作为 `Cookie: uin=...`, 并发签发的直链请求限制为 6 个.

## 构建与验证

```sh
npm install
npm run check
npm test
npx wrangler dev --port 8090
npx wrangler deploy
```

- 本地冒烟: 启动 `wrangler dev` 后请求 `/qfile`, `/qfile?link=true` 和 `/url`.
- 不要将真实上游响应中的临时直链写入仓库.

## 约束

- 运行时仅使用 Workers 内置 API, 不引入第三方运行时依赖.
- 解析和签名逻辑只保留在 `src/qfile.ts`, `src/index.ts` 只做 HTTP 封装.
- `url` 参数只允许 `https://qfile.qq.com/q/...`, 禁止请求其他主机.
- 修改上游请求体时, 必须同步验证字段顺序和签名.
- 修改接口或文件结构时, 必须同步更新 README 和本文件.
- 变更记录写入 `CHANGELOG.md` 顶部的 `vX.Y.Z-rc` 预发布段落.
