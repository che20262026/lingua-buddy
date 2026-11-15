import fs from 'node:fs'
import path from 'node:path'

const root = 'C:/Users/Administrator/WorkBuddy/2026-11-09-22-14-29/lingua-buddy'
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const dist = path.join(root, 'dist')

// Vercel semantics: filesystem takes precedence over rewrites.
// Headers are matched against the request pathname (source).
function serve(urlPath) {
  const rel = urlPath.replace(/^\/+/, '')
  const direct = path.join(dist, rel)
  const isStaticFile = rel !== '' && fs.existsSync(direct) && fs.statSync(direct).isFile()
  let served = urlPath
  let isFallback = false
  if (!isStaticFile) {
    // "/" -> serve index.html from filesystem; everything else hits the SPA rewrite
    const rw = cfg.rewrites.find((r) => r.source === '/(.*)')
    if (rw) { served = rw.destination; isFallback = true }
  }
  const matched = cfg.headers.find((h) => h.source === urlPath)
  const headers = Object.fromEntries((matched?.headers || []).map((h) => [h.key, h.value]))
  const servedFile = served === '/' ? path.join(dist, 'index.html') : path.join(dist, served.replace(/^\/+/, ''))
  return { urlPath, served, isStaticFile, isFallback, headers, exists: fs.existsSync(servedFile) }
}

const probes = ['/', '/sw.js', '/manifest.webmanifest', '/pwa-192.png', '/assets/index-Cs3dmhnz.js', '/some/deep/route']
let ok = 0
for (const p of probes) {
  const r = serve(p)
  const cc = r.headers['Cache-Control'] || '(none)'
  const ct = r.headers['Content-Type'] || '(auto)'
  console.log(p.padEnd(30), '->', r.served.padEnd(20), r.isStaticFile ? '[static ]' : '[rewrite]', 'exists=' + r.exists, '| CC=' + cc, '| CT=' + ct)
  if (r.exists) ok++
}
console.log('\nAll probes resolve to a real file:', ok === probes.length)

// assertions mirroring what a real Vercel deployment should do
const sw = serve('/sw.js')
const mf = serve('/manifest.webmanifest')
const rootRes = serve('/')
const deep = serve('/some/deep/route')
console.log('sw.js is a real static file (NOT rewritten):', sw.isStaticFile && !sw.isFallback)
console.log('sw.js no-cache headers present:', /no-store/.test(sw.headers['Cache-Control'] || ''), '/ CDN:', sw.headers['CDN-Cache-Control'], '/ Vercel CDN:', sw.headers['Vercel-CDN-Cache-Control'])
console.log('manifest no-cache + correct MIME:', /no-store/.test(mf.headers['Cache-Control'] || ''), mf.headers['Content-Type'])
console.log('manifest is a real static file (NOT rewritten):', mf.isStaticFile && !mf.isFallback)
console.log('root index.html no-cache:', /no-cache/.test(rootRes.headers['Cache-Control'] || ''))
console.log('deep route falls back to /index.html:', deep.isFallback && deep.served === '/index.html')
