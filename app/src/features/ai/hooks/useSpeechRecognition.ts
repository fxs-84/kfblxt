/**
 * 浏览器语音识别 hook — AgentChat 与 AIAssistantPanel 共享。
 * 封装 SpeechRecognition 的初始化/状态机,调用方只关心识别结果。
 */
import { useRef, useState } from "react";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  }
}

export type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } }; length: number } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

interface Options {
  /** 识别回调:非 interim 模式传单段最终文本;interim 模式传当前累计文本 */
  onResult: (transcript: string) => void;
  lang?: string;
  /** 连续识别(默认 false,识别一段即停) */
  continuous?: boolean;
  /** 返回中间结果(默认 false) */
  interimResults?: boolean;
}

export function useSpeechRecognition({ onResult, lang = "zh-CN", continuous = false, interimResults = false }: Options) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(
    () => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
  );
  const recRef = useRef<SpeechRec | null>(null);
  // onResult 每次渲染都变,用 ref 固定,避免识别器拿到过期闭包
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const start = () => {
    if (!supported) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (interimResults) {
        // 累计全部段落(含中间结果),调用方自行做结构化解析
        let t = "";
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        if (t) onResultRef.current(t);
      } else {
        const transcript = e.results?.[0]?.[0]?.transcript ?? "";
        if (transcript) onResultRef.current(transcript);
      }
    };
    rec.onerror = (e) => {
      console.warn("[voice] Speech error:", e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const toggle = () => (listening ? stop() : start());

  return { listening, supported, start, stop, toggle, recRef };
}
