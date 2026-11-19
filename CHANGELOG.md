# Changelog

## v0.1.0-rc.1

- 新增 Cloudflare Workers 实现, 提供 `GET /qfile` 和 `GET /url` 接口.
- 新增 `link=true` 参数, 在文件列表的 `sha1` 之后返回每个文件的直链.
- 使用 Web Crypto 计算 HMAC-SHA1 请求签名, 以随机匿名 uin 调用上游接口.
- 支持分享链接白名单校验, 统一 JSON 错误响应.
- 直链批量签发按 6 个并发执行, 避免瞬时连接过多.
