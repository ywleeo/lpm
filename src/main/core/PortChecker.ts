import http from 'http'

/** HTTP 健康检查：只要端口能连上并返回非 5xx 响应，就认为服务可访问 */
export class PortChecker {
  checkHttp(port: number, path = '/', host = '127.0.0.1', timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
        res.destroy()
        resolve(!!res.statusCode && res.statusCode < 500)
      })
      req.once('timeout', () => req.destroy())
      req.once('error', () => resolve(false))
    })
  }
}
