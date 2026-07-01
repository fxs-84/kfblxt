# ANRM 神经科学特色病历系统

基于 [ANRM(Applied Neuroscience for Rehabilitation Medicine)肌骨神经康复](https://www.anrm.com/) 理念构建的临床病历系统,支持:

- 🧍 交互式解剖症状定位图(66 个独立可点区块,前后视图,内外侧区分)
- 🩺 45 项 ANRM 特色查体(原始反射/前庭-眼动/皮神经敏化/步态/自适应神经等)
- 🧠 神经定位诊断(9 级神经水平 + 31 个脊髓节段 + 24 条神经干 + 46 条皮神经敏化)
- 💊 57 项神经康复干预 + 39 个 SMART 目标模板 + 疗效复评
- 📤 患者分享链接(居家作业 + 治疗对比照片 + 复诊提醒)
- 🤖 AI 临床助手(规则引擎 + 可选 LLM 推理,诊断建议一键回填)
- 💰 卡次/消费记录 + 复诊提醒 + 附件上传

## 技术栈

React 19 · Vite 8 · TypeScript 6 · TanStack Query · React Router · Recharts · Zod

## 快速开始

```bash
cd app
npm install
npm run dev
```

打开 `http://localhost:5173`

## 数据持久化

所有数据保存在浏览器的 localStorage 中。首次运行自动载入演示数据(2 名患者 + 5 次就诊)。

## AI 临床助手

内置规则引擎,无需配置即可使用。配置 LLM API 可升级推理:

```bash
# .env.local(不提交到 git)
VITE_LLM_API_URL=https://api.anthropic.com/v1/messages
VITE_LLM_API_KEY=sk-ant-...
VITE_LLM_MODEL=claude-haiku-4-5-20251001
```

不配 LLM 时自动回退到规则引擎,零感知。

## 临床免责声明

本系统为临床辅助记录工具,查体量表阈值及 AI 建议待医师签字确认,不作为独立诊断依据。
