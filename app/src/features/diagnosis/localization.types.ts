/**
 * ANRM 神经定位诊断模型。
 * 核心临床推理链:症状分布→神经水平定位→机制→干预方向选择。
 * 所有神经定位术语从 ANRM 手册提取,待医师确认。
 */

/** 神经水平层级 */
export type NeuroLevel =
  | "皮质"
  | "基底节"
  | "小脑"
  | "脑干/中脑"
  | "脊髓"
  | "神经根"
  | "周围神经"
  | "神经肌肉接头"
  | "肌肉";

export const NEURO_LEVELS: readonly NeuroLevel[] = [
  "皮质", "基底节", "小脑", "脑干/中脑",
  "脊髓", "神经根", "周围神经", "神经肌肉接头", "肌肉",
];

/** 致病机制 */
export type Mechanism =
  | "机械压迫"
  | "神经敏化"
  | "失用/去条件化"
  | "中枢敏化"
  | "代谢/炎症"
  | "发育未整合"
  | "神经退行性";

export const MECHANISMS: readonly Mechanism[] = [
  "机械压迫", "神经敏化", "失用/去条件化",
  "中枢敏化", "代谢/炎症", "发育未整合", "神经退行性",
];

/** 脊髓节段 */
export type SpinalSegment =
  | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8"
  | "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9" | "T10" | "T11" | "T12"
  | "L1" | "L2" | "L3" | "L4" | "L5"
  | "S1" | "S2" | "S3" | "S4" | "S5";

export const SPINAL_SEGMENTS: readonly SpinalSegment[] = [
  "C1","C2","C3","C4","C5","C6","C7","C8",
  "T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12",
  "L1","L2","L3","L4","L5",
  "S1","S2","S3","S4","S5",
];

/* ---- 神经干 ---- */
export type NerveTrunk =
  | "臂丛上干(C5-C6)" | "臂丛中干(C7)" | "臂丛下干(C8-T1)"
  | "肩胛背神经(C5)" | "胸长神经(C5-C7)" | "肩胛上神经(C5-C6)"
  | "桡神经" | "正中神经" | "尺神经" | "肌皮神经" | "腋神经"
  | "坐骨神经" | "胫神经" | "腓总神经" | "腓深神经" | "腓浅神经"
  | "股神经" | "闭孔神经" | "臀上神经" | "臀下神经"
  | "副神经(XI)" | "面神经(VII)" | "三叉神经(V)" | "舌下神经(XII)" | "迷走神经(X)";

export const NERVE_TRUNKS: readonly NerveTrunk[] = [
  "臂丛上干(C5-C6)", "臂丛中干(C7)", "臂丛下干(C8-T1)",
  "肩胛背神经(C5)", "胸长神经(C5-C7)", "肩胛上神经(C5-C6)",
  "桡神经", "正中神经", "尺神经", "肌皮神经", "腋神经",
  "坐骨神经", "胫神经", "腓总神经", "腓深神经", "腓浅神经",
  "股神经", "闭孔神经", "臀上神经", "臀下神经",
  "副神经(XI)", "面神经(VII)", "三叉神经(V)", "舌下神经(XII)", "迷走神经(X)",
];

/* ---- 皮神经(按区域分组,ANRM 敏化评估核心) ---- */

export interface CutaneousNerve {
  id: string;           // 系统标识
  name: string;         // 中文名
  segment: string;      // 节段来源
  /** ANRM 敏化点位置 */
  sensitizationPoint?: string;
}

export const CUTANEOUS_NERVES: Record<string, readonly CutaneousNerve[]> = {
  "颈枕部": [
    { id: "greater-occipital",    name: "枕大神经",        segment: "C2",   sensitizationPoint: "枕下(上项线中1/3)" },
    { id: "lesser-occipital",     name: "枕小神经",        segment: "C2-C3",sensitizationPoint: "胸锁乳突肌后缘上1/3" },
    { id: "greater-auricular",    name: "耳大神经",        segment: "C2-C3",sensitizationPoint: "胸锁乳突肌后缘中点→耳垂" },
    { id: "transverse-cervical",  name: "颈横神经",        segment: "C2-C3",sensitizationPoint: "胸锁乳突肌后缘中点→前颈" },
    { id: "supraclavicular",      name: "锁骨上神经",      segment: "C3-C4",sensitizationPoint: "锁骨窝上方(C7以上敏化区)" },
    { id: "third-occipital",      name: "第三枕神经",      segment: "C3",   sensitizationPoint: "C2-C3关节突,颈后中线旁2cm" },
  ],
  "肩臂": [
    { id: "superior-lat-cut-brachial", name: "臂外侧上皮神经",   segment: "C5-C6",sensitizationPoint: "腋神经分支,三角肌后缘" },
    { id: "intercostobrachial",         name: "肋间臂神经",       segment: "T2",    sensitizationPoint: "腋窝内侧壁→上臂内侧" },
    { id: "medial-cut-brachial",        name: "臂内侧皮神经",     segment: "C8-T1",sensitizationPoint: "腋窝底→上臂内侧" },
    { id: "post-cut-brachial",          name: "臂后侧皮神经",     segment: "C5-C8",sensitizationPoint: "桡神经沟附近,三角肌止点后方" },
  ],
  "前臂": [
    { id: "lateral-antebrachial",      name: "前臂外侧皮神经",   segment: "C5-C6",sensitizationPoint: "肘窝外侧,肱二头肌腱外缘" },
    { id: "medial-antebrachial",       name: "前臂内侧皮神经",   segment: "C8-T1",sensitizationPoint: "肘窝内侧,穿深筋膜处(T3以上敏化区)" },
    { id: "posterior-antebrachial",    name: "前臂后侧皮神经",   segment: "C5-C8",sensitizationPoint: "桡神经分支,肘后外侧" },
    { id: "superficial-radial",        name: "桡神经浅支(皮支)", segment: "C6-C7",sensitizationPoint: "腕背桡侧,解剖鼻烟壶附近" },
    { id: "palmar-cutaneous-median",   name: "正中神经掌皮支",   segment: "C6-C8",sensitizationPoint: "腕横纹近端,桡侧腕屈肌与掌长肌间" },
    { id: "dorsal-ulnar",              name: "尺神经手背支",     segment: "C8-T1",sensitizationPoint: "腕背尺侧,尺骨茎突背侧" },
    { id: "palmar-ulnar",              name: "尺神经掌皮支",     segment: "C8-T1",sensitizationPoint: "腕掌尺侧,Guyon管近端" },
    { id: "digital-nerves",            name: "指神经",           segment: "C6-T1",sensitizationPoint: "各指蹼间" },
  ],
  "胸腹部": [
    { id: "intercostal-n",             name: "肋间神经前皮支",   segment: "T1-T12",sensitizationPoint: "胸骨旁→肋弓→腹直肌鞘" },
    { id: "intercostal-lat",           name: "肋间神经外侧皮支", segment: "T1-T12",sensitizationPoint: "腋中线,穿肋间肌外侧缘" },
    { id: "iliohypogastric",           name: "髂腹下神经",       segment: "L1",    sensitizationPoint: "髂嵴上方→耻骨上区(髋5神经之一)" },
    { id: "ilioinguinal",              name: "髂腹股沟神经",     segment: "L1",    sensitizationPoint: "腹股沟管→大阴唇/阴囊(髋5神经之一)" },
    { id: "genitofemoral",             name: "生殖股神经",       segment: "L1-L2",sensitizationPoint: "腹股沟韧带中点下方(髋5神经之一)" },
    { id: "lateral-femoral-cutaneous", name: "股外侧皮神经",     segment: "L2-L3",sensitizationPoint: "髂前上棘内侧2cm→大腿外侧(髋5神经之一)" },
  ],
  "背腰骶": [
    { id: "dorsal-ramus-cervical",     name: "颈神经后支皮支",   segment: "C1-C8",sensitizationPoint: "颈椎棘突旁1-2cm,关节柱外侧" },
    { id: "dorsal-ramus-thoracic",     name: "胸神经后支皮支",   segment: "T1-T12",sensitizationPoint: "胸椎棘突旁开2-3cm竖脊肌外缘" },
    { id: "dorsal-ramus-lumbar",       name: "腰神经后支皮支",   segment: "L1-L5",sensitizationPoint: "腰椎棘突旁开2-3cm,腰眼附近" },
    { id: "superior-cluneal",          name: "臀上皮神经",       segment: "L1-L3",sensitizationPoint: "髂嵴后上→臀部上半(髋5神经之一)" },
    { id: "middle-cluneal",            name: "臀中皮神经",       segment: "S1-S3",sensitizationPoint: "骶骨外侧,穿臀大肌起点" },
    { id: "inferior-cluneal",          name: "臀下皮神经",       segment: "S2-S3",sensitizationPoint: "臀大肌下缘,坐骨结节后方" },
    { id: "posterior-femoral-cutaneous", name: "股后皮神经",     segment: "S1-S3",sensitizationPoint: "臀大肌下缘→大腿后正中→腘窝" },
  ],
  "小腿": [
    { id: "anterior-femoral-cutaneous",  name: "股前皮神经",        segment: "L2-L3",sensitizationPoint: "腹股沟韧带下,股三角外侧" },
    { id: "saphenous",                   name: "隐神经(股神经皮支)", segment: "L3-L4",sensitizationPoint: "膝内侧→小腿内侧→内踝前" },
    { id: "obturator-cutaneous",         name: "闭孔神经皮支",      segment: "L2-L4",sensitizationPoint: "大腿内收肌管,大腿中下1/3内侧" },
    { id: "lateral-sural",               name: "腓肠外侧皮神经",    segment: "L5-S1",sensitizationPoint: "腘窝外侧→小腿后外侧上1/3" },
    { id: "sural",                       name: "腓肠神经",          segment: "S1-S2",sensitizationPoint: "外踝后下方,跟腱外侧→足外侧" },
    { id: "superficial-peroneal-cut",    name: "腓浅神经皮支",      segment: "L4-S1",sensitizationPoint: "小腿前外侧中下1/3,穿深筋膜→足背" },
    { id: "deep-peroneal-cut",           name: "腓深神经皮支",      segment: "L4-L5",sensitizationPoint: "第1趾蹼间,𧿹短伸肌腱外侧" },
    { id: "calcaneal-branches",          name: "跟骨支(胫神经)",   segment: "S1-S2",sensitizationPoint: "内踝后下方→跟骨内侧" },
    { id: "medial-plantar-cut",          name: "足底内侧神经",      segment: "L4-L5",sensitizationPoint: "𧿹展肌深面→足底内侧2/3" },
    { id: "lateral-plantar-cut",         name: "足底外侧神经",      segment: "L5-S2",sensitizationPoint: "足底外侧1/3,第5跖骨基底" },
  ],
  "头面部": [
    { id: "supraorbital",     name: "眶上神经(V1支)",     segment: "V1",  sensitizationPoint: "眶上切迹,眉毛中内1/3上方" },
    { id: "infraorbital",     name: "眶下神经(V2支)",     segment: "V2",  sensitizationPoint: "眶下孔,瞳孔正下方1cm" },
    { id: "mental",           name: "颏神经(V3支)",       segment: "V3",  sensitizationPoint: "颏孔,第2前磨牙下方" },
    { id: "auriculotemporal", name: "耳颞神经(V3)",       segment: "V3",  sensitizationPoint: "耳前,颞下颌关节后方→颞区(耳前敏化点)" },
    { id: "zygomaticotemporal", name: "颧颞神经(V2)",     segment: "V2",  sensitizationPoint: "颧弓上方,太阳穴后" },
  ],
};

/** 定位诊断记录 */
export interface LocalizationDiagnosis {
  id: string;
  encounterId: string;
  orgId: string;
  createdAt: Date;
  levels: NeuroLevel[];
  segments?: SpinalSegment[];
  nerves?: NerveTrunk[];
  /** 皮神经敏化 ID(http://cutaneous-nerves in CUTANEOUS_NERVES) */
  cutaneousNerveIds?: string[];
  side: "left" | "right" | "bilateral" | "midline";
  mechanisms: Mechanism[];
  reasoning: string;
  confirmed?: boolean;
  confirmedBy?: string;
  confirmedAt?: Date;
}

/** 定位关联 */
export interface LocalizationLink {
  /** 关联的症状/查体发现 */
  finding: string;
  /** 如何支持该定位 */
  rationale: string;
}
