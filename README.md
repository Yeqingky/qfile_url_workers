# qfile_url_workers

QQ 闪传分享链接的直链解析服务, 运行在 Cloudflare Workers 上. 无 Web UI, 所有响应为 JSON.

## 本地运行

```sh
npm install
npx wrangler dev --port 8090
```

## 部署

```sh
npx wrangler deploy
```

## 接口

### 文件列表

```text
GET /qfile?url=<分享链接>
```

```sh
curl --get 'http://127.0.0.1:8090/qfile' \
  --data-urlencode 'url=https://qfile.qq.com/q/tlTMa1XknC'
```

```json
{
  "files": [
    {
      "file_id": "9b68b830-0141-5c3d-b2b5-f7ca20e8b326",
      "name": "152190936_p1.png",
      "size": 10608029,
      "sha1": "f88ea6e2e499e0861ae90b86e78d371d72f9059a"
    }
  ]
}
```

### 文件列表附带全部直链

```text
GET /qfile?url=<分享链接>&link=true
```

`link=true` 时为每个文件签发直链, 并在 `sha1` 之后追加 `url` 字段. 任一文件的直链签发失败, 整个请求返回 502.

```sh
curl --get 'http://127.0.0.1:8090/qfile' \
  --data-urlencode 'url=https://qfile.qq.com/q/tlTMa1XknC' \
  --data-urlencode 'link=true'
```

```json
{
  "files": [
    {
      "file_id": "9b68b830-0141-5c3d-b2b5-f7ca20e8b326",
      "name": "152190936_p1.png",
      "size": 10608029,
      "sha1": "f88ea6e2e499e0861ae90b86e78d371d72f9059a",
      "url": "https://multimedia.qfile.qq.com/download?appid=14901&...&filename=152190936_p1.png"
    }
  ]
}
```

### 单文件直链

```text
GET /url?url=<分享链接>&file_id=<文件 id>
```

`file_id` 使用文件列表返回的值.

```sh
curl --get 'http://127.0.0.1:8090/url' \
  --data-urlencode 'url=https://qfile.qq.com/q/tlTMa1XknC' \
  --data-urlencode 'file_id=9b68b830-0141-5c3d-b2b5-f7ca20e8b326'
```

```json
{"url":"https://multimedia.qfile.qq.com/download?appid=14901&client_type=web&client_ver=8.9.25&fileid=...&fldc=...&rkey=...&filename=..."}
```

## 行为

- `url` 仅接受 `https://qfile.qq.com/q/...` 形式的分享链接.
- 服务使用随机匿名 uin 调用上游接口, 不需要登录.
- 上游直链按需签发, 有效期有限, 下载前重新请求.
- 与网页端一致, 文件列表只取分享根目录的前 20 个文件, 不展开文件夹.
- `link=true` 时按 6 个并发为每个文件签发直链.
- 上游为非公开网页接口, 接口结构和签名算法可能变化.

## 错误响应

```json
{"error":"missing file_id parameter"}
```

状态码: 400 参数错误, 404 文件不存在, 405 非 GET 请求, 502 上游失败.

## 验证

```sh
npm run check
npm test
```
