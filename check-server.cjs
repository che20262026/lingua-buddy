// Health check for start-app.cmd: exits 0 when the local app answers HTTP 200.
// Uses Node's built-in http module, so it bypasses system proxy settings.
//
// A just-started Vite server can be slow on its very first request. A few quick
// retries prevent that from being mistaken for "server down", which would make
// start-app.cmd launch a duplicate server on another port.
// Override the target for diagnostics: LINGUA_URL=http://127.0.0.1:5999/ node check-server.cjs
const http = require('http')

const URL = process.env.LINGUA_URL || 'http://127.0.0.1:5173/'
const ATTEMPTS = 3
const TIMEOUT_MS = 1500
const RETRY_DELAY_MS = 250

function probe(done) {
  let settled = false
  const finish = (ok) => {
    if (settled) return
    settled = true
    done(ok)
  }
  const req = http.get(URL, (res) => {
    res.resume()
    finish(res.statusCode === 200)
  })
  req.setTimeout(TIMEOUT_MS, () => {
    req.destroy()
    finish(false)
  })
  req.on('error', () => finish(false))
}

function attempt(left) {
  probe((ok) => {
    if (ok) process.exit(0)
    if (left <= 1) process.exit(1)
    setTimeout(() => attempt(left - 1), RETRY_DELAY_MS)
  })
}

attempt(ATTEMPTS)
