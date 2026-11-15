// src/lib/speech.ts
var speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;
var recognitionSupported = () => {
  if (typeof window === "undefined") return false;
  const w = window;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};
var recordingSupported = () => {
  if (typeof window === "undefined") return false;
  const w = window;
  return Boolean(w.MediaRecorder && w.navigator?.mediaDevices?.getUserMedia);
};
var isInIframe = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
function openInNewTab() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.open(window.location.href, "_blank", "noopener,noreferrer"));
  } catch {
    return false;
  }
}
async function copyPageLink() {
  if (typeof window === "undefined") return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      return true;
    }
  } catch {
  }
  return false;
}
var pageLink = () => typeof window === "undefined" ? "" : window.location.href;
function describeSpeechSupport() {
  const recognition = recognitionSupported();
  const recording = recordingSupported();
  const inIframe = isInIframe();
  const secureContext = typeof window === "undefined" ? false : window.isSecureContext ?? (/^https:$/.test(window.location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname));
  const canDoSomething = recognition || recording;
  let hint = "";
  if (!secureContext) {
    hint = "\u5F53\u524D\u9875\u9762\u4E0D\u662F\u5B89\u5168\u4E0A\u4E0B\u6587\uFF08\u9700\u8981 HTTPS \u6216 localhost\uFF09\uFF0C\u6D4F\u89C8\u5668\u4F1A\u7981\u7528\u9EA6\u514B\u98CE\u3002";
  } else if (!canDoSomething) {
    hint = "\u5F53\u524D\u73AF\u5883\u65E2\u6CA1\u6709\u8BED\u97F3\u8BC6\u522B\u3001\u4E5F\u4E0D\u652F\u6301\u672C\u5730\u5F55\u97F3\uFF1B\u6587\u672C\u8F93\u5165\u5B8C\u5168\u53EF\u7528\uFF0C\u7EC3\u4E60\u4E0D\u4F1A\u4E2D\u65AD\u3002";
  } else if (inIframe) {
    hint = "\u9875\u9762\u5D4C\u5728\u9884\u89C8\u9762\u677F\u4E2D\uFF0C\u9EA6\u514B\u98CE\u6743\u9650\u5E38\u88AB\u5916\u5C42\u62E6\u622A\u3002\u70B9\u300C\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u300D\u5E76\u5141\u8BB8\u9EA6\u514B\u98CE\uFF0C\u8BC6\u522B\u4E0E\u5F55\u97F3\u5373\u53EF\u6B63\u5E38\u4F7F\u7528\u3002";
  } else if (!recognition) {
    hint = "\u6D4F\u89C8\u5668\u6CA1\u6709\u81EA\u5E26\u8BED\u97F3\u8BC6\u522B\u670D\u52A1\uFF1B\u53EF\u7528\u300C\u5F55\u4E00\u6BB5\u5E76\u8F6C\u5199\u300D\u5F55\u4E0B\u53D1\u97F3\uFF0C\u518D\u8865\u5199\u6587\u5B57\u6216\u914D\u7F6E\u8F6C\u5199\u670D\u52A1\u3002";
  }
  return { recognition, recording, secureContext, inIframe, canDoSomething, hint };
}
var micActive = false;
function isMicActive() {
  return micActive;
}
function setMicActive(active) {
  micActive = active;
}
function canSpeakNow() {
  return !micActive;
}
function speak(text, settings) {
  if (!speechSupported() || !text) return;
  if (!canSpeakNow()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.accent;
    u.rate = settings.rate;
    u.pitch = 1.02;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang?.replace("_", "-") === settings.accent);
    if (match) u.voice = match;
    window.speechSynthesis.speak(u);
  } catch (err) {
    console.warn("[LinguaBuddy] \u6717\u8BFB\u5931\u8D25\uFF1A", err);
  }
}
function stopSpeaking() {
  if (speechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
    }
  }
}
var speakSeq = 0;
function speakWithVoice(text, opts = {}) {
  const id = ++speakSeq;
  const sentences = (text || "").trim() ? (text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"'“])/).map((s) => s.trim()).filter(Boolean) : [];
  if (!sentences.length) {
    opts.onEnd?.();
    return { cancel: () => {
    }, mock: false };
  }
  if (!canSpeakNow()) {
    opts.onEnd?.();
    return { cancel: () => {
    }, mock: false };
  }
  if (!speechSupported()) {
    opts.onEnd?.();
    return { cancel: () => {
    }, mock: false };
  }
  let cancelled = false;
  let timers = [];
  const clearTimers = () => {
    for (const t of timers) {
      try {
        window.clearTimeout(t);
      } catch {
      }
    }
    timers = [];
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    clearTimers();
    try {
      window.speechSynthesis.cancel();
    } catch {
    }
  };
  let voices = [];
  try {
    voices = window.speechSynthesis.getVoices();
  } catch {
  }
  if (!voices.length) {
    opts.onSentence?.(0, sentences.length);
    const t = window.setTimeout(() => {
      if (cancelled) return;
      opts.onEnd?.();
    }, 1e3);
    timers.push(t);
    return { cancel, mock: true };
  }
  const target = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : void 0;
  const speakAt = (index) => {
    if (cancelled) return;
    if (index >= sentences.length) {
      opts.onEnd?.();
      return;
    }
    opts.onSentence?.(index, sentences.length);
    let u;
    try {
      u = new SpeechSynthesisUtterance(sentences[index]);
    } catch (err) {
      opts.onError?.(err);
      opts.onEnd?.();
      return;
    }
    if (target) {
      u.voice = target;
      if (target.lang) u.lang = target.lang;
    }
    if (opts.lang) u.lang = opts.lang;
    if (typeof opts.rate === "number") u.rate = opts.rate;
    if (typeof opts.pitch === "number") u.pitch = opts.pitch;
    u.onend = () => {
      if (cancelled) return;
      const t = window.setTimeout(() => speakAt(index + 1), 220);
      timers.push(t);
    };
    u.onerror = (err) => {
      if (cancelled) return;
      opts.onError?.(err);
      const t = window.setTimeout(() => speakAt(index + 1), 60);
      timers.push(t);
    };
    try {
      window.speechSynthesis.speak(u);
    } catch (err) {
      opts.onError?.(err);
      opts.onEnd?.();
    }
  };
  try {
    window.speechSynthesis.cancel();
  } catch {
  }
  speakAt(0);
  return { cancel, mock: false };
}
function friendlySpeechError(code) {
  const c = (code || "").toLowerCase();
  if (c.includes("abort")) {
    return { message: "\u5DF2\u505C\u6B62\u542C\u5199\u3002", action: "text" };
  }
  if (c.includes("no-speech")) {
    return { message: "\u6CA1\u542C\u5230\u58F0\u97F3\u3002\u9760\u8FD1\u9EA6\u514B\u98CE\u3001\u628A\u4E00\u6574\u53E5\u8BDD\u8BF4\u5B8C\u518D\u8BD5\u4E00\u6B21\uFF1B\u6587\u5B57\u4F1A\u5728\u4F60\u8BF4\u5B8C\u540E\u81EA\u52A8\u51FA\u73B0\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u7528\u6587\u672C\u8F93\u5165\u3002", action: "retry" };
  }
  if (c.includes("audio-capture")) {
    return { message: "\u6CA1\u627E\u5230\u53EF\u7528\u7684\u9EA6\u514B\u98CE\u3002\u8BF7\u68C0\u67E5\u8BBE\u5907\u662F\u5426\u8FDE\u63A5\u3001\u662F\u5426\u88AB\u5176\u5B83\u7A0B\u5E8F\u5360\u7528\u3002", action: "retry" };
  }
  if (c.includes("language-not-supported") || c.includes("bad-grammar")) {
    return { message: "\u5F53\u524D\u53E3\u97F3\u4E0D\u88AB\u8BC6\u522B\u670D\u52A1\u652F\u6301\uFF0C\u53EF\u5728\u8BBE\u7F6E\u91CC\u5207\u56DE English (US) \u518D\u8BD5\u3002", action: "retry" };
  }
  if (c.includes("network") || c.includes("service-not-allowed")) {
    return {
      message: "\u6D4F\u89C8\u5668\u81EA\u5E26\u7684\u8BED\u97F3\u8BC6\u522B\u670D\u52A1\u8FDE\u63A5\u5931\u8D25\uFF08\u5185\u5D4C\u6D4F\u89C8\u5668\u6216\u7F51\u7EDC\u53D7\u9650\u65F6\u5F88\u5E38\u89C1\uFF09\u3002\u53EF\u4EE5\u70B9\u300C\u91CD\u8BD5\u542C\u5199\u300D\uFF0C\u6216\u7528\u300C\u5F55\u4E00\u6BB5\u5E76\u8F6C\u5199\u300D\u628A\u5F55\u97F3\u53D8\u6210\u6587\u5B57\u3002",
      action: "record"
    };
  }
  if (c.includes("not-allowed") || c.includes("permission") || c.includes("denied")) {
    return {
      message: "\u9EA6\u514B\u98CE\u6743\u9650\u88AB\u62D2\u7EDD\u3002\u8BF7\u5728\u6D4F\u89C8\u5668\u5730\u5740\u680F\u7684\u7AD9\u70B9\u8BBE\u7F6E\u91CC\u5141\u8BB8\u9EA6\u514B\u98CE\uFF1B\u82E5\u6B63\u5728\u9884\u89C8\u9762\u677F\u4E2D\uFF0C\u8BF7\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u540E\u91CD\u8BD5\u3002",
      action: "new-tab"
    };
  }
  return {
    message: `\u8BED\u97F3\u8BC6\u522B\u6682\u65F6\u4E0D\u53EF\u7528\uFF08${code || "\u672A\u77E5\u539F\u56E0"}\uFF09\u3002\u53EF\u4EE5\u91CD\u8BD5\u3001\u5F55\u4E00\u6BB5\u518D\u8F6C\u5199\uFF0C\u6216\u5148\u7528\u6587\u672C\u8F93\u5165\u7EE7\u7EED\u3002`,
    action: "text"
  };
}
function friendlyMicError(name, fallback) {
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "\u9EA6\u514B\u98CE\u6743\u9650\u88AB\u62D2\u7EDD\u3002\u8BF7\u5728\u5730\u5740\u680F\u7684\u7AD9\u70B9\u8BBE\u7F6E\u91CC\u6539\u4E3A\u300C\u5141\u8BB8\u300D\uFF1B\u9884\u89C8\u9762\u677F\u4E2D\u8BF7\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u3002";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "\u6CA1\u6709\u68C0\u6D4B\u5230\u9EA6\u514B\u98CE\u8BBE\u5907\u3002";
  if (name === "NotReadableError" || name === "TrackStartError") return "\u9EA6\u514B\u98CE\u88AB\u5176\u5B83\u7A0B\u5E8F\u5360\u7528\uFF0C\u5173\u95ED\u540E\u91CD\u8BD5\u3002";
  if (name === "OverconstrainedError") return "\u5F53\u524D\u9EA6\u514B\u98CE\u4E0D\u6EE1\u8DB3\u5F55\u97F3\u53C2\u6570\uFF0C\u6362\u4E00\u4E2A\u8F93\u5165\u8BBE\u5907\u8BD5\u8BD5\u3002";
  return `\u9EA6\u514B\u98CE\u6253\u5F00\u5931\u8D25\uFF1A${name || String(fallback ?? "\u672A\u77E5\u9519\u8BEF")}`;
}
async function checkMicrophone() {
  if (typeof window === "undefined") return { ok: false, reason: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u6D4F\u89C8\u5668\u97F3\u9891\u63A5\u53E3\u3002" };
  const md = window.navigator?.mediaDevices;
  if (!md?.getUserMedia) {
    return {
      ok: false,
      reason: isInIframe() ? "\u9EA6\u514B\u98CE\u63A5\u53E3\u88AB\u9884\u89C8\u9762\u677F\u7684\u6743\u9650\u7B56\u7565\u5C4F\u853D\u4E86\u3002\u8BF7\u70B9\u300C\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00\u300D\u540E\u91CD\u8BD5\u3002" : "\u5F53\u524D\u9875\u9762\u65E0\u6CD5\u8BBF\u95EE\u9EA6\u514B\u98CE\u63A5\u53E3\uFF08\u9700\u8981 HTTPS / localhost\uFF0C\u4E14\u6D4F\u89C8\u5668\u9700\u652F\u6301\uFF09\u3002"
    };
  }
  let stream = null;
  try {
    stream = await md.getUserMedia({ audio: true });
    return { ok: true, reason: "\u9EA6\u514B\u98CE\u53EF\u7528\uFF0C\u6743\u9650\u5DF2\u6388\u4E88 \u2705" };
  } catch (err) {
    return { ok: false, reason: friendlyMicError(err?.name || "", err) };
  } finally {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
    }
  }
}
function composeTranscript(finals, interims, includeInterim = true) {
  const interimMap = interims instanceof Map ? interims : new Map(Object.entries(interims).map(([k, v]) => [Number(k), String(v)]));
  let maxIndex = finals.length - 1;
  for (const k of interimMap.keys()) if (k > maxIndex) maxIndex = k;
  const parts = [];
  for (let i = 0; i <= maxIndex; i++) {
    const final = (finals[i] || "").trim();
    const interim = includeInterim ? (interimMap.get(i) || "").trim() : "";
    const text = final || interim;
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function startListening(opts) {
  if (!recognitionSupported()) return null;
  const w = window;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  stopSpeaking();
  const startedAt = Date.now();
  const maxRetries = Math.max(0, Math.min(3, opts.retries ?? 1));
  const timeoutMs = opts.timeoutMs ?? 15e3;
  const silenceMs = opts.silenceMs ?? 1800;
  const graceMs = 900;
  const finals = [];
  const interims = /* @__PURE__ */ new Map();
  let confidenceSum = 0;
  let confidenceCount = 0;
  let settled = false;
  let cancelled = false;
  let manual = false;
  let stoppedByUs = false;
  let retries = 0;
  let lastErrorCode = "";
  let reason = "final";
  let current = null;
  let timer;
  let graceTimer;
  let silenceTimer;
  const clearTimers = () => {
    for (const t of [timer, graceTimer, silenceTimer]) {
      if (t !== void 0) {
        try {
          window.clearTimeout(t);
        } catch {
        }
      }
    }
    timer = void 0;
    graceTimer = void 0;
    silenceTimer = void 0;
  };
  const detach = (r) => {
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
  };
  const fullText = () => composeTranscript(finals, interims, true);
  const confirmedText = () => composeTranscript(finals, interims, false);
  const releaseCurrent = (abort = true) => {
    const r = current;
    current = null;
    if (!r) return;
    detach(r);
    if (!abort) return;
    try {
      if (typeof r.abort === "function") r.abort();
      else r.stop();
    } catch {
    }
  };
  const finish = (mode, code = "") => {
    if (settled) return;
    settled = true;
    clearTimers();
    setMicActive(false);
    const text = fullText();
    releaseCurrent(!stoppedByUs);
    if (mode === "silent") {
      opts.onEnd?.();
      return;
    }
    if (mode === "emit" && text) {
      opts.onResult(text, {
        confidence: confidenceCount ? confidenceSum / confidenceCount : 0,
        durationMs: Date.now() - startedAt,
        partial: confirmedText() !== text,
        retries,
        reason
      });
    } else if (mode === "error" || mode === "emit" && !text && !manual) {
      const errCode = code || lastErrorCode || "no-speech";
      opts.onError?.(errCode, friendlySpeechError(errCode));
    }
    opts.onEnd?.();
  };
  const gracefulStop = (why) => {
    if (settled || cancelled) return;
    manual = true;
    stoppedByUs = true;
    reason = why;
    clearTimers();
    const r = current;
    if (!r) {
      finish("emit");
      return;
    }
    try {
      r.stop();
    } catch {
      finish("emit");
      return;
    }
    graceTimer = window.setTimeout(() => finish("emit"), graceMs);
  };
  const armSilenceTimer = () => {
    if (silenceTimer !== void 0) {
      try {
        window.clearTimeout(silenceTimer);
      } catch {
      }
    }
    silenceTimer = void 0;
    if (silenceMs <= 0 || settled || cancelled || manual) return;
    if (!fullText()) return;
    silenceTimer = window.setTimeout(() => {
      if (!settled && !manual) {
        opts.onStatus?.("\u8BF4\u5B8C\u4E86\uFF1F\u6B63\u5728\u6574\u7406\u8FD9\u6BB5\u6587\u5B57\u2026");
        gracefulStop("silence");
      }
    }, silenceMs);
  };
  const onResult = (e) => {
    const from = Math.max(0, Math.min(e.resultIndex ?? 0, e.results.length));
    for (let i = from; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r?.[0]?.transcript?.trim();
      if (!t) continue;
      if (r.isFinal) {
        finals[i] = t;
        interims.delete(i);
        const c = r[0]?.confidence;
        if (typeof c === "number" && c > 0) {
          confidenceSum += c;
          confidenceCount++;
        }
      } else {
        interims.set(i, t);
      }
    }
    for (const key of [...interims.keys()]) if (key < from) interims.delete(key);
    const text = fullText();
    if (text) opts.onInterim?.(text);
    armSilenceTimer();
  };
  const onError = (e) => {
    if (settled) return;
    const code = e?.error || "unknown";
    lastErrorCode = code;
    if (manual) {
      finish("emit");
      return;
    }
    const text = fullText();
    const retryable = ["network", "service-not-allowed", "aborted", "no-speech"].includes(code);
    if (!text && retryable && retries < maxRetries) {
      retries++;
      restart(code === "no-speech" ? "\u8FD8\u6CA1\u542C\u5230\u58F0\u97F3\uFF0C\u6B63\u5728\u7EE7\u7EED\u542C\u2026" : "\u8BC6\u522B\u670D\u52A1\u4E2D\u65AD\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8BD5\u4E00\u6B21\u2026");
      return;
    }
    if (text) {
      reason = "error";
      opts.onStatus?.(`\u8BC6\u522B\u670D\u52A1\u4E2D\u65AD\uFF08${code}\uFF09\uFF0C\u5DF2\u4FDD\u7559\u542C\u5230\u7684\u6587\u5B57\uFF0C\u8BF7\u6838\u5BF9\u540E\u518D\u53D1\u9001\u3002`);
      finish("emit");
      return;
    }
    reason = "error";
    finish("error", code);
  };
  const onEnd = () => {
    if (settled) return;
    const text = fullText();
    if (manual || text) {
      reason = manual ? reason : "service-end";
      finish("emit");
      return;
    }
    if (retries < maxRetries && !lastErrorCode) {
      retries++;
      restart("\u8FD8\u6CA1\u542C\u5230\u58F0\u97F3\uFF0C\u6B63\u5728\u7EE7\u7EED\u542C\u2026");
      return;
    }
    reason = "error";
    finish("error", lastErrorCode || "no-speech");
  };
  const createRecognizer = () => {
    if (settled || cancelled) return;
    let r;
    try {
      r = new Ctor();
    } catch (err) {
      lastErrorCode = "init";
      finish("error", `init: ${String(err)}`);
      return;
    }
    current = r;
    setMicActive(true);
    r.lang = opts.accent;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = onResult;
    r.onerror = onError;
    r.onend = onEnd;
    try {
      r.start();
    } catch (err) {
      lastErrorCode = "start";
      finish("error", `start: ${String(err)}`);
    }
  };
  const restart = (statusMessage) => {
    if (settled || cancelled) return;
    opts.onStatus?.(statusMessage);
    releaseCurrent();
    createRecognizer();
  };
  createRecognizer();
  if (settled) return { stop: () => {
  }, cancel: () => {
  } };
  timer = window.setTimeout(() => {
    if (settled || cancelled) return;
    opts.onStatus?.("\u65F6\u95F4\u5230\uFF0C\u6B63\u5728\u6574\u7406\u542C\u5230\u7684\u6587\u5B57\u2026");
    gracefulStop("timeout");
  }, timeoutMs);
  return {
    stop: () => {
      if (settled || cancelled) return;
      opts.onStatus?.("\u6B63\u5728\u6574\u7406\u542C\u5230\u7684\u6587\u5B57\u2026");
      gracefulStop("manual");
    },
    cancel: () => {
      if (settled) return;
      cancelled = true;
      settled = true;
      clearTimers();
      setMicActive(false);
      releaseCurrent();
    }
  };
}
function pickMimeType() {
  const MR = window.MediaRecorder;
  if (!MR?.isTypeSupported) return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
    }
  }
  return "";
}
async function startRecording(opts) {
  if (!recordingSupported()) {
    opts.onError("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u672C\u5730\u5F55\u97F3\uFF08\u9700\u8981 getUserMedia + MediaRecorder\uFF09\uFF0C\u8BF7\u6539\u7528\u6587\u672C\u8F93\u5165\u3002");
    return null;
  }
  stopSpeaking();
  let stream;
  try {
    stream = await window.navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    opts.onError(friendlyMicError(err?.name || "", err));
    return null;
  }
  const MR = window.MediaRecorder;
  const mime = pickMimeType();
  let recorder;
  try {
    recorder = mime ? new MR(stream, { mimeType: mime }) : new MR(stream);
  } catch (err) {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
    }
    opts.onError(`\u5F55\u97F3\u5668\u521D\u59CB\u5316\u5931\u8D25\uFF1A${String(err)}`);
    return null;
  }
  const chunks = [];
  const startedAt = Date.now();
  let done = false;
  let timer;
  const release = () => {
    if (timer !== void 0) {
      window.clearTimeout(timer);
      timer = void 0;
    }
    setMicActive(false);
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
    }
  };
  const finish = (emit) => {
    if (done) return;
    done = true;
    release();
    if (!emit) return;
    try {
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" });
      if (!blob.size) {
        opts.onError("\u6CA1\u6709\u5F55\u5230\u58F0\u97F3\uFF0C\u8BF7\u68C0\u67E5\u9EA6\u514B\u98CE\u540E\u91CD\u8BD5\u3002");
        return;
      }
      opts.onDone({ url: URL.createObjectURL(blob), blob, durationMs: Date.now() - startedAt });
    } catch (err) {
      opts.onError(`\u5F55\u97F3\u4FDD\u5B58\u5931\u8D25\uFF1A${String(err)}`);
    }
  };
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onerror = () => {
    if (!done) {
      done = true;
      release();
      opts.onError("\u5F55\u97F3\u8FC7\u7A0B\u4E2D\u51FA\u9519\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  };
  recorder.onstop = () => finish(true);
  try {
    recorder.start(250);
  } catch (err) {
    release();
    opts.onError(`\u5F55\u97F3\u542F\u52A8\u5931\u8D25\uFF1A${String(err)}`);
    return null;
  }
  setMicActive(true);
  timer = window.setTimeout(() => {
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      finish(true);
    }
  }, opts.maxMs ?? 3e4);
  return {
    stop: () => {
      if (done) return;
      try {
        if (recorder.state !== "inactive") recorder.stop();
        else finish(true);
      } catch {
        finish(true);
      }
    },
    cancel: () => {
      if (done) return;
      done = true;
      release();
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
      }
    }
  };
}
async function startRecordingWithTranscript(opts) {
  let transcript = "";
  let transcriptPartial = false;
  let transcriptNote = "";
  let listening = null;
  let recording = null;
  let transcriptSettled = false;
  let resolveTranscript = null;
  const transcriptDone = new Promise((resolve) => {
    resolveTranscript = resolve;
  });
  const markTranscriptSettled = () => {
    if (transcriptSettled) return;
    transcriptSettled = true;
    resolveTranscript?.();
  };
  const handle = await startRecording({
    maxMs: opts.maxMs,
    onDone: async (result) => {
      if (listening && !transcriptSettled) {
        await Promise.race([
          transcriptDone,
          new Promise((resolve) => {
            window.setTimeout(resolve, 1e3);
          })
        ]);
      }
      if (!transcript.trim() && opts.transcribe) {
        opts.onStatus?.("\u6B63\u5728\u7528\u8F6C\u5199\u670D\u52A1\u628A\u5F55\u97F3\u53D8\u6210\u6587\u5B57\u2026");
        try {
          const asr = await opts.transcribe(result.blob);
          if (asr?.text?.trim()) {
            transcript = asr.text.trim();
            transcriptPartial = false;
            transcriptNote = "\u7531\u81EA\u5B9A\u4E49\u8F6C\u5199\u670D\u52A1\u751F\u6210";
          } else {
            transcriptNote = asr?.error || "\u8F6C\u5199\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u6587\u5B57";
          }
        } catch (err) {
          transcriptNote = `\u8F6C\u5199\u670D\u52A1\u8C03\u7528\u5931\u8D25\uFF1A${String(err)}`;
        }
      }
      if (!transcriptNote) {
        transcriptNote = transcript ? transcriptPartial ? "\u6D4F\u89C8\u5668\u5B9E\u65F6\u542C\u5199\uFF08\u542B\u672A\u786E\u8BA4\u7247\u6BB5\uFF0C\u8BF7\u6838\u5BF9\uFF09" : "\u6D4F\u89C8\u5668\u5B9E\u65F6\u542C\u5199" : "\u672C\u6B21\u6CA1\u6709\u62FF\u5230\u6587\u5B57\uFF0C\u53EF\u8865\u5199\u540E\u7EE7\u7EED";
      }
      markTranscriptSettled();
      opts.onDone({ ...result, transcript: transcript.trim(), transcriptPartial, transcriptNote });
    },
    onError: (message) => {
      listening?.cancel();
      markTranscriptSettled();
      opts.onError(message);
    }
  });
  if (!handle) return null;
  recording = handle;
  if (opts.useBrowserRecognition !== false && recognitionSupported()) {
    listening = startListening({
      accent: opts.accent,
      retries: 0,
      // 已在录音，避免重建识别器时抢麦克风
      timeoutMs: opts.maxMs ?? 3e4,
      silenceMs: 0,
      // 由录音的停止动作统一收尾
      onInterim: (t) => opts.onInterim?.(t),
      onResult: (t, meta) => {
        transcript = t;
        transcriptPartial = meta.partial;
        markTranscriptSettled();
      },
      onError: () => markTranscriptSettled(),
      onEnd: () => markTranscriptSettled(),
      onStatus: (m) => opts.onStatus?.(m)
    });
  }
  if (!listening) markTranscriptSettled();
  return {
    stop: () => {
      listening?.stop();
      recording?.stop();
      listening = null;
      recording = null;
    },
    cancel: () => {
      listening?.cancel();
      recording?.cancel();
      markTranscriptSettled();
    }
  };
}
export {
  canSpeakNow,
  checkMicrophone,
  composeTranscript,
  copyPageLink,
  describeSpeechSupport,
  friendlySpeechError,
  isInIframe,
  isMicActive,
  openInNewTab,
  pageLink,
  recognitionSupported,
  recordingSupported,
  setMicActive,
  speak,
  speakWithVoice,
  speechSupported,
  startListening,
  startRecording,
  startRecordingWithTranscript,
  stopSpeaking
};
