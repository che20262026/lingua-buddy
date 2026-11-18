/**
 * 移动端语音环境检测 · 统一真源
 * ------------------------------------------------------------------
 * 为什么要单独一层：
 *   桌面 Chrome 的 SpeechRecognition 走云端引擎，点一下就能听；
 *   iOS Safari / Android WebView / 微信内置浏览器完全不是一回事——
 *   构造器可能「存在但一 start 就失败」，而且麦克风 / AudioContext
 *   必须在用户点击的同步上下文里初始化。
 *
 * 本模块只做**判断**，不碰 React 状态、不启动录音：
 *   - 非安全上下文（http 局域网 IP）直接判不可用；
 *   - 移动端（iOS / Android / 微信 / TWA）优先「本地录音 + 服务端转写」，
 *     绕开浏览器自带识别的云端依赖；
 *   - 桌面继续用识别器（实时字幕体验更好），失败再降级。
 *
 * 不新增 localStorage 键、不依赖任何第三方库。
 */

export type VoiceDevice = 'ios' | 'android' | 'wechat' | 'desktop'

export interface VoiceEnvironment {
  device: VoiceDevice
  /** HTTPS / localhost 才是安全上下文，移动端 getUserMedia 的硬门槛 */
  secureContext: boolean
  inIframe: boolean
  recognition: boolean
  recording: boolean
  /** 麦克风是否真能启动（安全上下文 + mediaDevices + MediaRecorder） */
  canUseMicrophone: boolean
  /** 移动端：点击时直接开 MediaRecorder，不等识别失败 */
  preferDirectRecording: boolean
  /** 给用户的中文原因（无问题时为空串） */
  reason: string
  /** 更详细的一句说明，可显示在设置页 / 自检卡 */
  hint: string
}

function readUserAgent(): string {
  if (typeof navigator === 'undefined') return ''
  try { return String(navigator.userAgent || '') } catch { return '' }
}

function isSecureContextNow(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const loc = window.location
    /* localhost / 127.0.0.1 在真实浏览器里必为安全上下文；
       jsdom 会把它误报成 false，这里显式兜底，避免测试环境假阴性。 */
    if (loc.protocol === 'https:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return true
    if (typeof window.isSecureContext === 'boolean') return window.isSecureContext
    return false
  } catch { return false }
}

function isInIframeNow(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.self !== window.top } catch { return true }
}

/** iPadOS 会伪装成 macOS，用触控点数把它认出来 */
function detectDevice(ua: string): VoiceDevice {
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua)
    && typeof navigator !== 'undefined'
    && ((navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1) {
    return 'ios'
  }
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * 每次点击时调用一次：环境可能被用户改权限、切网络、iframe 策略改变，
 * 绝不能在模块加载时缓存。
 */
export function detectVoiceEnvironment(): VoiceEnvironment {
  const ua = readUserAgent()
  const device = detectDevice(ua)
  const secureContext = isSecureContextNow()
  const inIframe = isInIframeNow()

  const w = typeof window === 'undefined'
    ? ({} as Record<string, unknown>)
    : (window as unknown as Record<string, unknown>)
  const nav = typeof navigator === 'undefined'
    ? ({} as Record<string, unknown>)
    : (navigator as unknown as Record<string, unknown>)
  const md = nav.mediaDevices as { getUserMedia?: unknown } | undefined

  const recognition = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
  const recording = Boolean(w.MediaRecorder && typeof md?.getUserMedia === 'function')
  const canUseMicrophone = secureContext && recording
  const preferDirectRecording = device !== 'desktop' && canUseMicrophone

  let reason = ''
  let hint = ''
  if (!secureContext) {
    reason = '当前页面不是安全上下文，麦克风被浏览器禁用。'
    hint = '手机端必须用 https:// 打开（localhost 仅限电脑）。请改用 HTTPS 域名，或在 APK 的 TWA 配置里绑定已验证的 HTTPS 站点。'
  } else if (device === 'wechat') {
    reason = '当前浏览器不支持语音，请使用文字输入'
    hint = '微信内置浏览器限制了 getUserMedia 与 SpeechRecognition。请点右上角「…」→ 在浏览器中打开，或直接用文字输入。'
  } else if (!recording) {
    reason = '当前浏览器不支持语音，请使用文字输入'
    hint = inIframe
      ? '页面嵌在预览面板里，麦克风权限常被外层拦截。请在新标签页打开，或直接用文字输入。'
      : '缺少 MediaRecorder / getUserMedia。请升级浏览器，或改用文字输入。'
  } else if (device === 'ios') {
    hint = 'iOS Safari 的系统识别引擎与桌面 Chrome 不同；这里已改为本地录音 + 服务端转写。'
  } else if (device === 'android') {
    hint = 'Android 已改为本地录音 + 服务端转写；若打包成 APK，请确认原生层已授予 RECORD_AUDIO。'
  }

  return {
    device, secureContext, inIframe, recognition, recording,
    canUseMicrophone, preferDirectRecording, reason, hint,
  }
}

/** 用户可见的兜底文案：必须明确告诉ta还能打字 */
export function unsupportedVoiceMessage(env: VoiceEnvironment): string {
  const base = env.reason || '当前浏览器不支持语音，请使用文字输入'
  return env.hint ? `${base} ${env.hint} 文字输入完全正常。` : `${base} 文字输入完全正常。`
}
