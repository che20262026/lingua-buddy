/**
 * 省份配置（纯本地，不上传、不追踪）
 *
 * 重要边界：
 * - 资源库不假定全国高考政策统一；听说机考感知卡默认关闭；
 * - 下面只列「常见已公布 / 已实施听说考试的地区」与一个「其他地区」选项；
 * - 具体题型、分值与是否计入总分，一律以当地教育考试院最新通知为准；
 * - 本配置只用于启用 / 禁用轨道 C 的题型感知卡，不用于任何分数预测或提分承诺。
 */

import type { ChinaTrackState, ProvinceId, ProvinceOption } from '../../chinaTrackTypes'

export const PROVINCE_OPTIONS: ProvinceOption[] = [
  {
    id: 'none',
    label: '暂不选择',
    autoEnable: false,
    note: '不启用听说机考感知卡。其余三个轨道与轨道 C 的微场景完全可用。',
  },
  {
    id: 'guangdong',
    label: '广东',
    autoEnable: true,
    note: '已公布 / 已实施高考英语听说考试；选择后自动显示题型感知卡，可随时手动关闭。',
  },
  {
    id: 'beijing',
    label: '北京',
    autoEnable: true,
    note: '已公布 / 已实施高考英语听说考试；选择后自动显示题型感知卡，可随时手动关闭。',
  },
  {
    id: 'shanghai',
    label: '上海',
    autoEnable: true,
    note: '已公布 / 已实施高考英语听说测试；选择后自动显示题型感知卡，可随时手动关闭。',
  },
  {
    id: 'zhejiang',
    label: '浙江',
    autoEnable: false,
    note: '若你所在地区已实施听说机考，可在下方手动开启；本应用不替你判断政策。',
  },
  {
    id: 'jiangsu',
    label: '江苏',
    autoEnable: false,
    note: '若你所在地区已实施听说机考，可在下方手动开启；本应用不替你判断政策。',
  },
  {
    id: 'shandong',
    label: '山东',
    autoEnable: false,
    note: '若你所在地区已实施听说机考，可在下方手动开启；本应用不替你判断政策。',
  },
  {
    id: 'other',
    label: '其他地区 / 不确定',
    autoEnable: false,
    note: '不确定时保持关闭即可；需要时手动开启，或查阅当地教育考试院通知。',
  },
]

export function provinceOption(id: ProvinceId): ProvinceOption {
  return PROVINCE_OPTIONS.find((p) => p.id === id) ?? PROVINCE_OPTIONS[0]
}

/** 省份选择后的纯状态计算：自动启用地区默认打开，其余保持关闭；用户手动覆盖优先 */
export function resolveProvinceChange(
  state: ChinaTrackState,
  province: ProvinceId,
): ChinaTrackState {
  const opt = provinceOption(province)
  return {
    ...state,
    province,
    listeningExamEnabled: opt.autoEnable,
    examOverride: false,
    completed: { ...state.completed },
  }
}

/** 手动开关：优先级高于省份自动判定 */
export function resolveExamToggle(state: ChinaTrackState, enabled: boolean): ChinaTrackState {
  return { ...state, listeningExamEnabled: enabled, examOverride: true, completed: { ...state.completed } }
}

/** 当前展示用文案 */
export function provinceSummary(state: ChinaTrackState): string {
  const opt = provinceOption(state.province)
  if (!state.listeningExamEnabled) return `${opt.label} · 机考感知卡已关闭`
  return state.examOverride
    ? `${opt.label} · 机考感知卡已手动开启`
    : `${opt.label} · 机考感知卡已自动开启`
}

export const PROVINCE_DISCLAIMER =
  '省份只保存在本机浏览器，用于启用 / 禁用题型感知卡，不上传、不追踪。题型与政策请以当地教育考试院最新通知为准；本应用不预测分数、不承诺提分。'
