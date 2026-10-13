# 微信登录接入

- API 域名：`https://api.openotools.top`
- 本地登录存储键：`openotools-auth-v1`
- 用户主动点击「微信登录」后调用 `wx.login`，把一次性 code 发送到 `/api/v1/auth/wechat-login`。服务端返回随机 token 和非敏感用户信息。
- 个人中心进入时，如本机已有 token，会调用 `/api/v1/auth/me` 校验；401 自动清理失效登录。退出调用 `/api/v1/auth/logout`，无论网络结果如何都会清除本机 token。
- 当前只建立身份，不同步评分、收藏夹、MFA、凭据本或模拟方案。服务器部署完成前，登录按钮会提示无法连接，不影响其他本地工具。
- 上线前必须在公众平台把 `https://api.openotools.top` 加入 request 合法域名，并同步更新官方用户隐私保护指引。
