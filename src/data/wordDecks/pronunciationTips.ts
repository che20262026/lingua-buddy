/**
 * S2.5 跟读朗读：词库里的静态发音小提示
 *
 * 约束（详见 README 第十七章）：
 * - 这些提示只来自词库数据本身（重音位置、易混音），**不基于识别结果**做音素判断；
 * - 只有登记在这里的词才会在 S2.5 反馈里出现一行提示，其余词一律不显示；
 * - 不新增词库文件的元组结构，由 makeWord 按词查表挂载为可选字段。
 */

export const PRONUNCIATION_TIPS: Record<string, string> = {
  ability: '重音在第二个音节：a-BI-li-ty，别读成 A-bi-li-ty。',
  beyond: '重音在后半段：be-YOND，前一个音节轻轻带过。',
  consider: '重音在中间：con-SI-der，末尾 -der 弱读。',
  develop: '重音在中间：de-VE-lop，词尾 p 轻收就好。',
  pollution: '重音在中间：po-LLU-tion，注意 /ʃ/ 不是 /s/。',
  distance: '重音在首音节：DIS-tance，第二个元音弱读。',
  demonstrate: '重音在首音节：DE-mon-strate，后面别拖太长。',
  considerable: '重音在第二音节：con-SI-derable，中间几个音节要轻。',
  crucial: '重音在首音节：CRU-cial，/ʃ/ 别读成 /s/。',
  discrepancy: '重音在第二音节：dis-CRE-pan-cy，四个音节都别吞。',
  endurance: '重音在第二音节：en-DUR-ance。',
  justify: '重音在首音节：JUS-ti-fy。',
  prominent: '重音在首音节：PRO-mi-nent，后面的音节短一些。',
  impact: '作名词时重音在首音节：IM-pact（作动词常读 im-PACT）。',
  perspective: '重音在第二音节：per-SPEC-tive。',
  sustainable: '重音在第二音节：sus-TAI-na-ble，四个音节都要给到。',
  empirical: '重音在第二音节：em-PI-ri-cal。',
  quantify: '重音在首音节：QUAN-ti-fy。',
  substantiate: '重音在第二音节：sub-STAN-ti-ate，注意 /ʃ/。',
}

export function pronunciationTipFor(word: string): string | undefined {
  return PRONUNCIATION_TIPS[word.toLowerCase().trim()]
}
