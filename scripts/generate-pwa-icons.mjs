/**
 * [PWA] 占位位图生成器 —— 零第三方依赖，直接用 Node 内置 zlib 写 PNG。
 *
 * 为什么还要 PNG：Chrome 的安装提示要求 192 / 512 位图图标，
 * iOS 的 apple-touch-icon 也不认 SVG。public/*.svg 是「可编辑的占位源文件」，
 * 发布前请替换成品牌图标，并同步更新本脚本里的绘制逻辑或直接放同名 PNG。
 *
 * 用法：npm run generate-icons
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
fs.mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** 占位画面：品牌蓝渐变 + 白色 L + 对话气泡；内容全部落在 maskable 中央安全区内 */
function paint(u, v) {
  const t = Math.min(1, (u + v) / 2)
  let r = Math.round(92 + (42 - 92) * t)
  let g = Math.round(139 + (81 - 139) * t)
  let b = Math.round(250 + (216 - 250) * t)
  const white = () => { r = 255; g = 255; b = 255 }
  const pale = () => { r = 220; g = 232; b = 255 }
  const ink = () => { r = 42; g = 81; b = 216 }

  // 字母 L
  if ((u >= 0.34 && u <= 0.44 && v >= 0.25 && v <= 0.75)
    || (u >= 0.34 && u <= 0.68 && v >= 0.65 && v <= 0.75)) white()
  // 气泡圆 + 小尾巴
  if (Math.hypot(u - 0.70, v - 0.32) <= 0.09
    || (u >= 0.62 && u <= 0.68 && v >= 0.38 && v <= 0.42 && v - 0.38 <= (u - 0.62) * 0.9)) pale()
  // 三个省略点
  if ([0.66, 0.70, 0.74].some((cx) => Math.hypot(u - cx, v - 0.32) <= 0.013)) ink()
  return [r, g, b, 255]
}

function writePng(file, size) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    const row = y * stride
    raw[row] = 0 // PNG filter: none
    for (let x = 0; x < size; x++) {
      const c = paint((x + 0.5) / size, (y + 0.5) / size)
      const o = row + 1 + x * 4
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(path.join(outDir, file), png)
  console.log(`✓ ${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} KB`)
}

writePng('pwa-192.png', 192)
writePng('pwa-512.png', 512)
writePng('apple-touch-icon.png', 180)
console.log('占位图标已生成。⚠️ 发布前请替换为自己的品牌图标。')
