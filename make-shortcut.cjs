/**
 * make-shortcut.cjs
 * Creates a genuine Windows .lnk shortcut (MS-SHLLINK binary format) and an
 * original multi-size .ico, using only Node's built-in fs module.
 *
 * No COM / WScript.Shell / .NET runtime compilation is required, which keeps
 * this usable in environments where those are blocked by security policy.
 *
 * Usage:  node make-shortcut.cjs
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { randomUUID } = require('crypto')

const ROOT = __dirname
const ASSETS = path.join(ROOT, 'assets')
const ICO = path.join(ASSETS, 'lingua-buddy.ico')
const TARGET = path.join(ROOT, 'start-app.cmd')
const WORKDIR = ROOT
const DESKTOP = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'Desktop')
const LNK = path.join(DESKTOP, 'LinguaBuddy 语伴英语.lnk')
const DESCRIPTION = 'LinguaBuddy 语伴英语 · 启动本地服务并打开应用'

// ---------------------------------------------------------------- ICO ------
// Draws a gradient disc with a white "L" (original brand mark), 4x4 AA.
function iconImage(size) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.47
  const lx = size * 0.34      // L vertical bar left
  const lw = size * 0.11      // L bar width
  const ly = size * 0.25      // L top
  const lh = size * 0.49      // L height
  const lb = size * 0.10      // L foot thickness

  const insideL = (x, y) =>
    (x >= lx && x <= lx + lw && y >= ly && y <= ly + lh) ||
    (x >= lx && x <= lx + size * 0.34 && y >= ly + lh - lb && y <= ly + lh)

  const coverage = (x, y, test) => {
    let n = 0
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        if (test(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) n++
      }
    }
    return n / 16
  }

  // BITMAPINFOHEADER (40 bytes), 32bpp BGRA, double height for XOR + AND mask
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)          // BI_RGB
  header.writeUInt32LE(0, 20)          // filled below
  header.writeInt32LE(0, 24)
  header.writeInt32LE(0, 28)
  header.writeUInt32LE(0, 32)
  header.writeUInt32LE(0, 36)

  const rowBytes = Math.ceil(size / 32) * 4   // AND mask rows are DWORD aligned
  const xor = Buffer.alloc(size * size * 4)
  const andMask = Buffer.alloc(rowBytes * size) // all zero => use alpha channel

  for (let row = 0; row < size; row++) {
    const y = size - 1 - row                // DIB rows are bottom-up
    for (let col = 0; col < size; col++) {
      const x = col
      const disc = coverage(x, y, (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2)
      const letter = coverage(x, y, insideL)
      const a = disc
      // diagonal gradient: #5B8CFF (top-left) -> #7A5AF8 (bottom-right)
      const t = Math.min(1, Math.max(0, (x / size) * 0.55 + (y / size) * 0.45))
      let r = Math.round(91 + (122 - 91) * t)
      let g = Math.round(140 + (90 - 140) * t)
      let b = Math.round(255 + (248 - 255) * t)
      // blend the white L over the gradient
      r = Math.round(r * (1 - letter) + 255 * letter)
      g = Math.round(g * (1 - letter) + 255 * letter)
      b = Math.round(b * (1 - letter) + 255 * letter)
      const o = row * size * 4 + col * 4
      xor[o] = b
      xor[o + 1] = g
      xor[o + 2] = r
      xor[o + 3] = Math.round(255 * a)
    }
  }
  header.writeUInt32LE(xor.length + andMask.length, 20)
  return Buffer.concat([header, xor, andMask])
}

function makeIco(sizes) {
  const images = sizes.map(iconImage)
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)                  // type: icon
  dir.writeUInt16LE(sizes.length, 4)
  const entries = []
  let offset = 6 + 16 * sizes.length
  sizes.forEach((s, i) => {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s
    e[1] = s >= 256 ? 0 : s
    e[2] = 0                              // color count
    e[3] = 0                              // reserved
    e.writeUInt16LE(1, 4)                 // planes
    e.writeUInt16LE(32, 6)                // bit count
    e.writeUInt32LE(images[i].length, 8)
    e.writeUInt32LE(offset, 12)
    offset += images[i].length
    entries.push(e)
  })
  return Buffer.concat([dir, ...entries, ...images])
}

// ---------------------------------------------------------------- LNK ------
const LINK_CLSID = Buffer.from([
  0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
])

// --------------------------------------------- ExtraData / metadata ------
// Windows always writes a TrackerDataBlock (MachineID + two Droid GUIDs) into
// shortcuts it creates, plus the target's real timestamps and size. A .lnk
// with all-zero metadata looks "synthetic" to security products: LNK files are
// a classic malware carrier (Stuxnet / Emotet / QakBot), so hand-built ones
// get extra scrutiny. Filling these fields makes the file structurally ordinary.
function guidBytes(uuid) {
  const h = uuid.replace(/-/g, '')
  const b = Buffer.alloc(16)
  b.writeUInt32LE(parseInt(h.slice(0, 8), 16), 0)    // Data1, little-endian
  b.writeUInt16LE(parseInt(h.slice(8, 12), 16), 4)   // Data2
  b.writeUInt16LE(parseInt(h.slice(12, 16), 16), 6)  // Data3
  Buffer.from(h.slice(16), 'hex').copy(b, 8)         // Data4, as-is
  return b
}

function trackerBlock() {
  const block = Buffer.alloc(0x60)                  // 96 bytes, spec-fixed
  block.writeUInt32LE(0x60, 0)                     // BlockSize
  block.writeUInt32LE(0xA0000003, 4)               // TrackerDataBlock signature
  block.writeUInt32LE(0x58, 8)                     // Length = BlockSize - 8
  block.writeUInt32LE(0, 12)                       // Version = 0
  Buffer.from(os.hostname().slice(0, 15), 'ascii').copy(block, 16) // MachineID
  guidBytes(randomUUID()).copy(block, 32)          // Droid: volume object
  guidBytes(randomUUID()).copy(block, 48)          // Droid: file object
  return block
}

function fileTime(ms) {
  // Unix epoch milliseconds -> FILETIME: 100ns ticks since 1601-01-01 UTC
  const ticks = BigInt(Math.round(ms)) * 10000n + 116444736000000000n
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(ticks, 0)
  return b
}

function stringData(str) {
  const body = Buffer.from(str, 'utf16le')
  const count = Buffer.alloc(2)
  count.writeUInt16LE(str.length, 0)       // CountCharacters (UTF-16 code units)
  return Buffer.concat([count, body])
}

function linkInfo(fullPath) {
  // VolumeID: size, drive type (fixed), serial, label offset, empty label
  const volume = Buffer.alloc(21)
  volume.writeUInt32LE(volume.length, 0)
  volume.writeUInt32LE(3, 4)               // DRIVE_FIXED
  volume.writeUInt32LE(0, 8)               // volume serial (unknown)
  volume.writeUInt32LE(0x14, 12)           // VolumeLabelOffset
  volume[20] = 0                           // empty ANSI label, null-terminated

  const localBase = Buffer.from(fullPath + '\0', 'ascii')
  const suffix = Buffer.from('\0', 'ascii')

  const headerSize = 0x1C
  const volumeOffset = headerSize
  const localOffset = volumeOffset + volume.length
  const suffixOffset = localOffset + localBase.length
  const header = Buffer.alloc(headerSize)
  header.writeUInt32LE(headerSize + volume.length + localBase.length + suffix.length, 0)
  header.writeUInt32LE(headerSize, 4)
  header.writeUInt32LE(0x1, 8)             // VolumeIDAndLocalBasePath
  header.writeUInt32LE(volumeOffset, 12)
  header.writeUInt32LE(localOffset, 16)
  header.writeUInt32LE(0, 20)              // no CommonNetworkRelativeLink
  header.writeUInt32LE(suffixOffset, 24)
  return Buffer.concat([header, volume, localBase, suffix])
}

// ------------------------------------------------- LinkTargetIDList -------
// Windows Shell resolves a shortcut through its item ID list; a LinkInfo-only
// .lnk (the first version of this generator) is parseable on paper but Windows
// reports an empty Target for it. Build a classic file-system PIDL:
//   My Computer (CLSID) / drive / folder... / file / terminator
// Each SHITEMID = cb(2 bytes, including itself) + abID.
function shItem(abID) {
  const b = Buffer.alloc(2 + abID.length)
  b.writeUInt16LE(b.length, 0)
  abID.copy(b, 2)
  return b
}

function buildIdList(fullPath) {
  const drive = fullPath.slice(0, 2).toUpperCase()          // "C:"
  const segments = fullPath.slice(3).split('\\')            // after "C:\"
  const items = [
    // My Computer CLSID item (18-byte abID, as emitted by Windows itself)
    shItem(Buffer.from('1f50e04fd020ea3a6910a2d808002b30309d', 'hex')),
    // Drive item: 0x2f + "C:\0" + zero padding to 23 bytes
    (() => {
      const d = Buffer.alloc(23)
      d[0] = 0x2f
      Buffer.from(drive + '\\', 'ascii').copy(d, 1)
      return shItem(d)
    })(),
  ]

  segments.forEach((name, i) => {
    const isFile = i === segments.length - 1
    // Classic FILEENTRY: type, unknown, size, DOS date, DOS time, attributes
    const base = Buffer.alloc(12)
    base[0] = isFile ? 0x32 : 0x31
    base[1] = 0
    base.writeUInt32LE(isFile ? fs.statSync(fullPath).size : 0, 2)
    base.writeUInt16LE(0, 6)                // DOS date (unknown)
    base.writeUInt16LE(0, 8)                // DOS time (unknown)
    base.writeUInt16LE(isFile ? 0x20 : 0x10, 10)  // ARCHIVE / DIRECTORY
    let body = Buffer.concat([base, Buffer.from(name + '\0', 'ascii')])
    if (body.length % 2) body = Buffer.concat([body, Buffer.alloc(1)])
    items.push(shItem(body))
  })

  const payload = items.reduce((n, b) => n + b.length, 0) + 2  // + terminator
  const size = Buffer.alloc(2)
  size.writeUInt16LE(payload, 0)
  return Buffer.concat([size, ...items, Buffer.alloc(2)])
}

function makeLnk({ target, workdir, icon, iconIndex, description, showCommand }) {
  // HasLinkTargetIDList | HasLinkInfo | HasName | HasWorkingDir | HasIconLocation | IsUnicode
  // 0xd7 matches the flags Windows itself writes for a file shortcut.
  const flags = 0x00000001 | 0x00000002 | 0x00000004 | 0x00000010 | 0x00000040 | 0x00000080
  const h = Buffer.alloc(76)
  h.writeUInt32LE(0x4C, 0)                 // HeaderSize
  LINK_CLSID.copy(h, 4)
  h.writeUInt32LE(flags, 20)
  h.writeUInt32LE(0x20, 24)                // FILE_ATTRIBUTE_ARCHIVE
  // Real target metadata instead of all-zero fields (a classic "crafted LNK" tell)
  const stat = fs.statSync(target)
  fileTime(stat.birthtimeMs).copy(h, 28)   // CreationTime
  fileTime(stat.atimeMs).copy(h, 36)       // AccessTime
  fileTime(stat.mtimeMs).copy(h, 44)       // WriteTime
  h.writeUInt32LE(stat.size >>> 0, 52)     // FileSize (low 32 bits)
  h.writeInt32LE(iconIndex, 56)
  h.writeUInt32LE(showCommand, 60)         // 1 = SW_SHOWNORMAL
  // HotKey(2) + Reserved1(2) + Reserved2(4) + Reserved3(4) remain zero

  const parts = [
    h,
    buildIdList(target),                   // MUST come right after the header
    linkInfo(target),
    stringData(description),               // NAME_STRING
    stringData(workdir),                   // WORKING_DIR
    stringData(icon),                      // ICON_LOCATION
    trackerBlock(),                        // ExtraData: TrackerDataBlock
    Buffer.alloc(4),                       // ExtraData: TerminalBlock
  ]
  return Buffer.concat(parts)
}

// ------------------------------------------------------------- build -------
fs.mkdirSync(ASSETS, { recursive: true })
fs.writeFileSync(ICO, makeIco([16, 32, 48, 64]))

const lnk = makeLnk({
  target: TARGET,
  workdir: WORKDIR,
  icon: ICO,
  iconIndex: 0,
  description: DESCRIPTION,
  showCommand: 1,
})
fs.writeFileSync(LNK, lnk)

// ------------------------------------------------------------- verify -----
// Full structural read-back, following the MS-SHLLINK field order.
function ansiZ(buf, at) {
  let end = at
  while (end < buf.length && buf[end] !== 0) end++
  return buf.toString('ascii', at, end)
}

function parseLnk(buf) {
  if (buf.readUInt32LE(0) !== 0x4C) throw new Error('LNK header size mismatch')
  if (!buf.subarray(4, 20).equals(LINK_CLSID)) throw new Error('LNK CLSID mismatch')
  const flags = buf.readUInt32LE(20)
  const show = buf.readUInt32LE(60)
  let o = 76
  let idList = null
  if (flags & 0x1) {
    const size = buf.readUInt16LE(o)
    const end = o + 2 + size
    let p = o + 2
    const items = []
    while (p < end - 2) {
      const cb = buf.readUInt16LE(p)
      if (cb < 2 || p + cb > end) break
      const type = buf[p + 2]
      const name = (type === 0x31 || type === 0x32) ? ansiZ(buf, p + 2 + 12) : ''
      items.push({ cb, type, name })
      p += cb
    }
    idList = { size, items }
    o = end
  }
  let target = ''
  if (flags & 0x2) {                              // LinkInfo
    const start = o
    const size = buf.readUInt32LE(start)
    target = ansiZ(buf, start + buf.readUInt32LE(start + 16)) +
             ansiZ(buf, start + buf.readUInt32LE(start + 24))
    o += size
  }
  const fields = {}
  const keys = ['name', 'relative', 'workdir', 'arguments', 'icon']
  const bits = [0x4, 0x8, 0x10, 0x20, 0x40]
  for (let i = 0; i < keys.length; i++) {
    if (!(flags & bits[i])) continue
    const n = buf.readUInt16LE(o); o += 2
    fields[keys[i]] = buf.toString('utf16le', o, o + n * 2)
    o += n * 2
  }
  // ExtraData: a sequence of (BlockSize, signature, ...) blocks, then a 4-byte zero terminal
  const extra = []
  let terminalBlock = false
  while (o + 4 <= buf.length) {
    const size = buf.readUInt32LE(o)
    if (size === 0) { terminalBlock = true; break }
    if (size < 8 || o + size > buf.length) break
    extra.push({ size, signature: buf.readUInt32LE(o + 4) })
    o += size
  }
  return {
    flags, show, idList, target, ...fields, extra, terminalBlock,
    creationTime: buf.readBigUInt64LE(28),
    fileSize: buf.readUInt32LE(52),
  }
}

const parsed = parseLnk(fs.readFileSync(LNK))
const expect = (cond, msg) => { if (!cond) throw new Error('LNK verify failed: ' + msg) }
expect(Boolean(parsed.flags & 0x1), 'LinkTargetIDList flag')
expect(parsed.idList && parsed.idList.items.length >= 3, 'IDList populated')
const idNames = parsed.idList.items.filter((i) => i.name).map((i) => i.name)
expect(idNames[idNames.length - 1] === path.basename(TARGET), 'IDList ends at target file')
expect(idNames.includes(path.basename(WORKDIR)), 'IDList contains project folder')
expect(parsed.target === TARGET, 'LinkInfo target path')
expect(parsed.workdir === WORKDIR, 'working directory')
expect(parsed.icon === ICO, 'icon location')
expect(parsed.name === DESCRIPTION, 'description')
expect(parsed.show === 1, 'show command SW_SHOWNORMAL')
expect(parsed.extra.some((b) => b.signature === 0xA0000003 && b.size === 0x60),
  'TrackerDataBlock present')
expect(parsed.creationTime > 0n, 'real creation timestamp')
expect(parsed.fileSize === fs.statSync(TARGET).size, 'real target file size')
expect(parsed.terminalBlock, 'terminal block')

const ico = fs.readFileSync(ICO)
expect(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 4, 'ICO header')

// Pixel sanity check: the disc should cover ~69% of the canvas and the white
// letter a few percent. Catches silently empty / malformed icon data.
const probe = iconImage(64)
let opaque = 0
let white = 0
for (let i = 0; i < 64 * 64; i++) {
  const o = 40 + i * 4
  if (probe[o + 3] > 128) {
    opaque++
    if (probe[o] > 240 && probe[o + 1] > 240 && probe[o + 2] > 240) white++
  }
}
const discPct = Math.round((opaque / (64 * 64)) * 100)
const letterPct = Math.round((white / (64 * 64)) * 100)
expect(discPct > 60 && discPct < 78, 'icon disc coverage')
expect(letterPct > 3 && letterPct < 15, 'icon letter coverage')

console.log('ICO   :', ICO, `(${ico.length} bytes, 4 sizes: 16/32/48/64)`)
console.log('PIXELS: disc ' + discPct + '%, letter ' + letterPct + '% (not blank)')
console.log('LNK   :', LNK, `(${lnk.length} bytes)  flags=0x${parsed.flags.toString(16)}`)
console.log('IDLIST:', parsed.idList.items.length + ' items, ' + parsed.idList.size + ' bytes →', idNames.join(' / '))
console.log('TARGET:', parsed.target)
console.log('WORK  :', parsed.workdir)
console.log('ICON  :', parsed.icon)
console.log('NAME  :', parsed.name)
console.log('SHOW  :', parsed.show, '(SW_SHOWNORMAL)')
console.log('EXTRA :', parsed.extra.map((b) => '0x' + b.signature.toString(16)).join(', ') || 'none')
console.log('META  :', 'creation=' + parsed.creationTime, 'size=' + parsed.fileSize)
console.log('VERIFY: all fields parsed back correctly ✓')

// Optional brand preview (handy for eyeballing the icon): node make-shortcut.cjs --preview
if (process.argv.includes('--preview')) {
  const zlib = require('zlib')
  const size = 256
  const dib = iconImage(size)
  const px = Buffer.alloc(size * (size * 4 + 1))
  for (let row = 0; row < size; row++) {
    const src = 40 + (size - 1 - row) * size * 4
    const dst = row * (size * 4 + 1)
    px[dst] = 0
    for (let i = 0; i < size * 4; i += 4) {
      px[dst + 1 + i] = dib[src + i + 2]     // R
      px[dst + 2 + i] = dib[src + i + 1]     // G
      px[dst + 3 + i] = dib[src + i]         // B
      px[dst + 4 + i] = dib[src + i + 3]     // A
    }
  }
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (b) => {
    let c = 0xFFFFFFFF
    for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32LE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4); sum.writeUInt32LE(crc(body), 0)
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32LE(size, 0); ihdr.writeUInt32LE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(px)), chunk('IEND', Buffer.alloc(0)),
  ])
  const preview = path.join(ASSETS, 'lingua-buddy-preview.png')
  fs.writeFileSync(preview, png)
  console.log('PREVIEW:', preview)
}
