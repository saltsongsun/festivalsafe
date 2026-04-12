import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import * as XLSX from "xlsx";

console.log("🚀 App.jsx loaded", new Date().toISOString());

// ─── URL 파라미터로 긴급 초기화 (?reset=1) ──────────────────────
try {
  if (window.location.search.includes("reset=1")) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = window.location.pathname;
  }
} catch (e) { console.error("Reset error:", e); }

// ─── Constants ───────────────────────────────────────────────────
const LEVELS = {
  BLUE: { label: "정상", color: "#2196F3", bg: "rgba(33,150,243,0.12)", border: "rgba(33,150,243,0.3)", icon: "✅" },
  YELLOW: { label: "주의", color: "#FFC107", bg: "rgba(255,193,7,0.12)", border: "rgba(255,193,7,0.3)", icon: "⚡" },
  ORANGE: { label: "경계", color: "#FF9800", bg: "rgba(255,152,0,0.15)", border: "rgba(255,152,0,0.4)", icon: "⚠️" },
  RED: { label: "경보", color: "#F44336", bg: "rgba(244,67,54,0.15)", border: "rgba(244,67,54,0.4)", icon: "🚨" },
};
const LV_ORDER = ["BLUE", "YELLOW", "ORANGE", "RED"];

// ─── KMA Grid Conversion (위경도→격자) ────────────────────────────
function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

const DEFAULT_CATEGORIES = [
  { id: "crowd", name: "인파관리", unit: "명", source: "manual", icon: "👥", apiInterval: 10,
    thresholds: { BLUE: [0, 10000], YELLOW: [10000, 20000], ORANGE: [20000, 30000], RED: [30000, Infinity] },
    currentValue: 0, actionItems: ["주위 관객 안전상황 점검", "출입구 통제 강화", "비상대응팀 대기", "대피경로 확보"],
    alertMessages: { BLUE: "인파 정상", YELLOW: "인파 증가, 유입 통제 검토", ORANGE: "⚠️ 인파 경계! 출입구 통제", RED: "🚨 인파 경보! 유입 차단" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] },
  { id: "rain", name: "강우량", unit: "mm", source: "api", icon: "🌧️", apiInterval: 10,
    thresholds: { BLUE: [0, 5], YELLOW: [5, 7], ORANGE: [7, 10], RED: [10, Infinity] },
    currentValue: 0, actionItems: ["우비 배부", "전기시설 점검", "미끄럼 방지", "비상대응팀 대기"],
    alertMessages: { BLUE: "강우량 정상", YELLOW: "약한 비, 우비 준비", ORANGE: "⚠️ 강우 경계! 전기시설 점검", RED: "🚨 폭우! 행사 중단 검토" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "RN1", history: [] },
  { id: "wind", name: "풍속", unit: "m/s", source: "api", icon: "💨", apiInterval: 10,
    thresholds: { BLUE: [0, 5], YELLOW: [5, 9], ORANGE: [9, 11], RED: [11, Infinity] },
    currentValue: 0, actionItems: ["무대 구조물 점검", "현수막 고정", "공연 중지 검토", "관객 대피 준비"],
    alertMessages: { BLUE: "풍속 정상", YELLOW: "바람 강해짐, 구조물 점검", ORANGE: "⚠️ 강풍 경계! 공연 중지 검토", RED: "🚨 강풍! 즉시 공연 중지" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "WSD", history: [] },
  { id: "dam", name: "댐 방류량", unit: "㎥/s", source: "manual", icon: "🌊", apiInterval: 30,
    thresholds: { BLUE: [0, 500], YELLOW: [500, 1000], ORANGE: [1000, 2000], RED: [2000, Infinity] },
    currentValue: 0, actionItems: ["하천 주변 통제", "수위 모니터링 강화", "대피 안내 방송", "긴급 대피"],
    alertMessages: { BLUE: "방류량 정상", YELLOW: "방류량 증가", ORANGE: "⚠️ 방류량 경계!", RED: "🚨 방류량 경보!" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] },
  { id: "temp", name: "기온", unit: "°C", source: "api", icon: "🌡️", apiInterval: 10,
    thresholds: { BLUE: [-50, 50], YELLOW: [0, 0], ORANGE: [0, 0], RED: [0, 0] },
    isTempDual: true,
    currentValue: 0, actionItems: ["그늘막/방한용품 설치", "음료수/핫팩 배부", "의료진 대기 강화", "행사 중단 검토"],
    alertMessages: { BLUE: "기온 적정", YELLOW: "기온 변동 주의", ORANGE: "⚠️ 폭염/저온 경계!", RED: "🚨 폭염/저온 경보! 행사 중단 검토" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "T1H", history: [] },
  { id: "humidity", name: "습도", unit: "%", source: "api", icon: "💧", apiInterval: 10,
    thresholds: { BLUE: [30, 70], YELLOW: [70, 80], ORANGE: [80, 90], RED: [90, Infinity] },
    currentValue: 0, actionItems: ["미끄럼 주의 안내", "전기시설 점검", "불쾌지수 안내", "의료진 대기"],
    alertMessages: { BLUE: "습도 적정", YELLOW: "습도 높음, 불쾌지수 상승", ORANGE: "⚠️ 고습 경계! 미끄럼·전기 주의", RED: "🚨 극습! 안전 점검 강화" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "REH", history: [] },
  { id: "pm25", name: "초미세먼지", unit: "㎍/㎥", source: "api", icon: "😷", apiInterval: 30,
    thresholds: { BLUE: [0, 15], YELLOW: [15, 35], ORANGE: [35, 75], RED: [75, Infinity] },
    currentValue: 0, actionItems: ["마스크 배부 안내", "야외 활동 자제 안내", "민감군 보호 조치", "행사 축소 검토"],
    alertMessages: { BLUE: "초미세먼지 좋음", YELLOW: "초미세먼지 보통, 민감군 주의", ORANGE: "⚠️ 초미세먼지 나쁨! 마스크 착용 안내", RED: "🚨 초미세먼지 매우나쁨! 야외활동 자제" },
    apiConfig: { url: "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey={serviceKey}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.0", method: "GET", headers: "", responsePath: "response.body.items.0.pm25Value", enabled: false }, kmaCategory: "", history: [] },
];

const DEFAULT_SETTINGS = {
  festivalName: "", festivalSubtitle: "축제 안전관리시스템",
  organization: "", contactNumber: "", logoEmoji: "🏮",
  venueArea: 10000, operatingStart: "08:00", operatingEnd: "22:00", is24HourMode: false,
  solapiApiKey: "", solapiApiSecret: "", solapiSender: "", smsEnabled: false, smsIntervalMin: 30,
  smsManagers: [],  // [{name, phone}] 안전관리책임자
  smsStaff: [],     // [{name, phone}] 안전요원
  location: { lat: 0, lon: 0, name: "", mode: "auto" },
  kma: { serviceKey: "53ed52a312626ba7b1fe74c00f0c676245c88a3ab708606bbed554761786a263", enabled: true, interval: 10, lastFetch: null, nxOverride: null, nyOverride: null },
  zones: [ { id: "z1", name: "A구역", range: "", assignee: "" } ],
  workers: [],  // [{id, name, role:"manager"|"staff", phone, position, duty}]
  actionReports: [],
  parkingLots: [],
  notices: [],
  messages: [],
  shuttleStops: [],
  shuttleBuses: [],
  festivalDates: [],
  cumulativeVisitors: 0,
  hourlyLog: [],
  dailyRecords: [],
  features: {
    crowd: true,      // 인파관리
    parking: true,     // 주차관리
    shuttle: true,     // 셔틀버스
    weather: true,     // 기상청 연동
    sms: true,         // SMS 알림
    message: true,     // 메시지/공지
    customApi: true,   // 커스텀 API
  },
};

// KMA 카테고리 코드 매핑
const KMA_CODES = {
  T1H: { name: "기온", unit: "°C" }, RN1: { name: "1시간 강수량", unit: "mm" },
  UUU: { name: "동서바람성분", unit: "m/s" }, VVV: { name: "남북바람성분", unit: "m/s" },
  REH: { name: "습도", unit: "%" }, PTY: { name: "강수형태", unit: "코드" },
  VEC: { name: "풍향", unit: "deg" }, WSD: { name: "풍속", unit: "m/s" },
};
const PTY_DESC = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "5": "빗방울", "6": "빗방울눈날림", "7": "눈날림" };

const CROWD_DENSITY = {
  BLUE: { density: 1, label: "≤1명/㎡", desc: "여유" }, YELLOW: { density: 2, label: "1~2명/㎡", desc: "유입 제한" },
  ORANGE: { density: 3, label: "2~3명/㎡", desc: "전면 차단" }, RED: { density: 5, label: "≥3명/㎡", desc: "압사 위험" },
};
function calcCrowdThr(a) { a = Math.max(1, a); return { BLUE: [0, Math.round(a)], YELLOW: [Math.round(a), Math.round(a * 2)], ORANGE: [Math.round(a * 2), Math.round(a * 3)], RED: [Math.round(a * 3), Infinity] }; }

// ─── Helpers ─────────────────────────────────────────────────────
function getLevel(cat) {
  const v = cat.currentValue;
  // 기온: id로 판단 (저장된 데이터에 isTempDual이 없을 수 있음)
  if (cat.id === "temp" || cat.isTempDual) {
    if (v <= -5) return "RED";         // -5 이하 → 경보 (한파)
    if (v <= 0) return "ORANGE";       // -5~0 → 경계
    if (v <= 5) return "YELLOW";       // 0~5 → 주의 (저온)
    if (v >= 38) return "RED";         // 38+ → 경보 (폭염)
    if (v >= 35) return "ORANGE";      // 35~38 → 경계
    if (v >= 33) return "YELLOW";      // 33~35 → 주의 (고온)
    return "BLUE";                     // 5~33 → 정상
  }
  for (const [lv, [min, max]] of Object.entries(cat.thresholds)) { if (v >= min && v < max) return lv; }
  return "RED";
}
function getTempLabel(cat) {
  if (cat.id !== "temp" && !cat.isTempDual) return null;
  const v = cat.currentValue;
  if (v <= 5) return "🥶 저온주의";
  if (v >= 33) return "🔥 폭염주의";
  return null;
}
// 종합경보에서 제외할 항목 (기온, 습도는 참고용)
const EXCLUDE_FROM_OVERALL = ["temp", "humidity"];
function fmtTime(d) { return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtDate(d) { return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }); }
function fmtHM(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function useNow(ms = 1000) { const [n, s] = useState(new Date()); useEffect(() => { const t = setInterval(() => s(new Date()), ms); return () => clearInterval(t); }, [ms]); return n; }
function isActive(s) { if (s.is24HourMode) return true; const hm = fmtHM(new Date()); return hm >= s.operatingStart && hm <= s.operatingEnd; }
function getByPath(obj, path) { try { return path.split('.').reduce((o, k) => o[k], obj); } catch { return null; } }

// 초단기예보 base_time: 매시 30분 발표 (0030,0130,...2330)
function getFcstParams(settings) {
  const loc = settings.location || {};
  const kma = settings.kma || {};
  const grid = latLonToGrid(loc.lat || 35.18, loc.lon || 128.11);
  const nx = kma.nxOverride || grid.nx;
  const ny = kma.nyOverride || grid.ny;
  const now = new Date();
  let h = now.getHours();
  if (now.getMinutes() < 45) h = h - 1; // 45분 이후 호출 가능
  let dateObj = new Date(now);
  if (h < 0) { h = 23; dateObj.setDate(dateObj.getDate() - 1); }
  const bd = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getDate()).padStart(2, '0')}`;
  const bt = `${String(h).padStart(2, '0')}30`;
  return { nx, ny, bd, bt };
}

function getKmaParams(settings) {
  const loc = settings.location || {};
  const kma = settings.kma || {};
  const grid = latLonToGrid(loc.lat || 35.18, loc.lon || 128.11);
  const nx = kma.nxOverride || grid.nx;
  const ny = kma.nyOverride || grid.ny;
  const now = new Date();
  // base_time: 매시 정각 발표, 매시각 10분 이후 호출 가능 (기상청 가이드)
  let h = now.getHours();
  if (now.getMinutes() < 10) h = h - 1;
  let dateObj = new Date(now);
  if (h < 0) { h = 23; dateObj.setDate(dateObj.getDate() - 1); }
  const bd = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getDate()).padStart(2, '0')}`;
  const bt = `${String(h).padStart(2, '0')}00`;
  return { nx, ny, bd, bt };
}

// ─── Persistent State (with realtime sync) ──────────────────────
function usePersist(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const valRef = useRef(val);
  const lastJson = useRef(localStorage.getItem(key) || "");
  const saveTimer = useRef(null);
  const selfSave = useRef(false);

  useEffect(() => { valRef.current = val; }, [val]);

  // 최초 Supabase 로드 (1회)
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(key);
        if (r?.value && r.value !== lastJson.current) {
          let incoming = JSON.parse(r.value);
          // ★ categories 로드 시 crowd.currentValue 보존
          if (key.includes("_cat_") && Array.isArray(incoming) && Array.isArray(valRef.current)) {
            const curCrowd = valRef.current.find(c => c.id === "crowd");
            if (curCrowd) {
              incoming = incoming.map(c => c.id === "crowd" ? { ...c, currentValue: curCrowd.currentValue } : c);
            }
          }
          const j = JSON.stringify(incoming);
          lastJson.current = j;
          setVal(incoming); valRef.current = incoming;
          localStorage.setItem(key, j);
        }
      } catch {}
    })();
  }, [key]);

  // Realtime 이벤트 (자기 저장 3초간 무시)
  useEffect(() => {
    const handler = (e) => {
      if (selfSave.current) return;
      if (e.detail?.key === key && e.detail?.value) {
        let incoming = typeof e.detail.value === "string" ? JSON.parse(e.detail.value) : e.detail.value;
        // ★ categories 수신 시 crowd.currentValue 보존 (crowd_realtime이 진실)
        if (key.includes("_cat_") && Array.isArray(incoming) && Array.isArray(valRef.current)) {
          const curCrowd = valRef.current.find(c => c.id === "crowd");
          if (curCrowd) {
            incoming = incoming.map(c => c.id === "crowd" ? { ...c, currentValue: curCrowd.currentValue } : c);
          }
        }
        const j = JSON.stringify(incoming);
        if (j !== lastJson.current) { lastJson.current = j; setVal(incoming); valRef.current = incoming; }
      }
    };
    window.addEventListener("supabase-sync", handler);
    return () => window.removeEventListener("supabase-sync", handler);
  }, [key]);

  // set: 로컬 즉시 + Supabase 2초 디바운스
  const set = useCallback((v) => {
    const next = typeof v === "function" ? v(valRef.current) : v;
    setVal(next); valRef.current = next;
    const json = JSON.stringify(next);
    lastJson.current = json;
    localStorage.setItem(key, json);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      let latest = valRef.current;
      // ★ categories → Supabase 저장 시 crowd.currentValue 제거
      // (crowd_realtime 테이블이 유일한 진실이므로 충돌 방지)
      if (key.includes("_cat_") && Array.isArray(latest)) {
        latest = latest.map(c => c.id === "crowd" ? { ...c, currentValue: 0 } : c);
      }
      const saveJson = JSON.stringify(latest);
      selfSave.current = true;
      window.storage.set(key, saveJson).catch(() => {}).finally(() => {
        setTimeout(() => { selfSave.current = false; }, 3000);
      });
    }, 2000);
    return next;
  }, [key]);

  return [val, set];
}

// ─── 저장 버튼 컴포넌트 (인라인) ─────────────────────────────────

async function sendSolapi(s, text, contacts) {
  const list = contacts || [...(s.smsManagers || []), ...(s.smsStaff || [])];
  if (!s.solapiApiKey || !s.solapiSender || !list.length) return { success: false };
  try {
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: s.solapiApiKey,
        apiSecret: s.solapiApiSecret,
        sender: s.solapiSender,
        messages: list.map(c => ({ to: c.phone, from: s.solapiSender, text, type: "SMS" }))
      })
    });
    const data = await res.json();
    return { success: data.success };
  } catch { return { success: false }; }
}


// ─── UI Components ───────────────────────────────────────────────
const Card = ({ children, style, onClick }) => <div onClick={onClick} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 20, border: "1px solid #222", marginBottom: 16, ...style }}>{children}</div>;
const Label = ({ children }) => <label style={{ color: "#8892b0", fontSize: 12, display: "block", marginBottom: 4 }}>{children}</label>;
const Input = ({ style, ...p }) => <input {...p} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, boxSizing: "border-box", ...style }} />;
const Toggle = ({ on, onToggle, labelOn, labelOff }) => (<div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ width: 56, height: 30, borderRadius: 15, background: on ? "#4CAF50" : "#333", cursor: "pointer", position: "relative", transition: "all .3s" }} onClick={onToggle}><div style={{ width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3, left: on ? 29 : 3, transition: "all .3s", boxShadow: "0 2px 4px rgba(0,0,0,.3)" }} /></div><span style={{ color: on ? "#4CAF50" : "#666", fontWeight: 700, fontSize: 14 }}>{on ? labelOn : labelOff}</span></div>);

function AlertToast({ alert, onClose }) {
  if (!alert) return null; const lv = LEVELS[alert.level];
  return (<div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, maxWidth: 420, width: "90vw", background: "#1a1a2e", border: `2px solid ${lv.color}`, borderRadius: 12, padding: "20px 24px", boxShadow: `0 8px 32px ${lv.color}44`, animation: "slideIn .4s ease" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ color: lv.color, fontWeight: 800, fontSize: 15 }}>⚠️ 긴급알림 ⚠️</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>✕</button></div>
    <div style={{ color: "#e0e0e0", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{alert.message}</div></div>);
}

function HistoryChart({ cat }) {
  const data = (cat.history || []).slice(-24);
  if (data.length < 2) return <p style={{ color: "#445", fontSize: 11, textAlign: "center", padding: 12 }}>데이터 수집 중... (30분 간격 기록)</p>;
  const thr = cat.thresholds;
  const vals = data.map(d => d.value);
  const yMin = Math.min(...vals, thr.BLUE?.[0] ?? 0) * 0.9;
  const refMax = thr.ORANGE?.[1] !== Infinity ? thr.ORANGE[1] : (thr.ORANGE?.[0] || 100);
  const yMax = Math.max(...vals, refMax) * 1.1;
  const color = LEVELS[getLevel(cat)].color;
  return (<div style={{ width: "100%", height: 180 }}><ResponsiveContainer>
    <LineChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
      <XAxis dataKey="time" tick={{ fill: "#445", fontSize: 9 }} interval="preserveStartEnd" />
      <YAxis domain={[Math.floor(yMin), Math.ceil(yMax)]} tick={{ fill: "#445", fontSize: 9 }} width={45} />
      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, cat.name]} />
      {thr.YELLOW?.[0] > 0 && <ReferenceLine y={thr.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" strokeWidth={1} />}
      {thr.ORANGE?.[0] > 0 && <ReferenceLine y={thr.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" strokeWidth={1} />}
      {thr.RED?.[0] > 0 && thr.RED[0] !== Infinity && <ReferenceLine y={thr.RED[0]} stroke="#F44336" strokeDasharray="4 4" strokeWidth={1} />}
      <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 2.5 }} activeDot={{ r: 5 }} />
    </LineChart></ResponsiveContainer></div>);
}

function InactiveOverlay({ settings }) {
  const now = useNow();
  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
    <div style={{ fontSize: 64, marginBottom: 16 }}>🌙</div>
    <h2 style={{ color: "#556", fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>시스템 비활성</h2>
    <p style={{ color: "#445", fontSize: 14 }}>운영: {settings.operatingStart} ~ {settings.operatingEnd}</p>
    <p style={{ color: "#334", fontSize: 13, marginTop: 12 }}>현재: {fmtTime(now)}</p></div>);
}

// ─── Dashboard ───────────────────────────────────────────────────
function Dashboard({ categories, settings, onCardClick, onRefresh, alerts, onAction, onActionReport, onDeleteAlert, onDeleteNotice, userRole }) {
  const now = useNow();
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const worst = categories.filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id)).reduce((w, c) => { const cl = getLevel(c); return LV_ORDER.indexOf(cl) > LV_ORDER.indexOf(w) ? cl : w; }, "BLUE");
  const olv = LEVELS[worst]; const loc = settings.location || {};
  const kma = settings.kma || {};
  const grid = latLonToGrid(loc.lat || 35.18, loc.lon || 128.11);
  const selected = selectedId ? categories.find(c => c.id === selectedId) : null;

  const handleRefresh = () => { setSpinning(true); onRefresh?.(); setTimeout(() => setSpinning(false), 2000); };

  // ── Detail Panel ──
  if (selected) {
    const lv = getLevel(selected); const li = LEVELS[lv];
    const isWarning = lv !== "BLUE";
    return (<div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0a0a1a 0%,#0d1b2a 50%,#0a0a1a 100%)", padding: "24px 20px" }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <button onClick={() => setSelectedId(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #333", background: "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}>← 전체 현황으로 돌아가기</button>

        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 24, border: `2px solid ${li.border}`, position: "relative", overflow: "hidden" }}>
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: li.color, animation: "blink 1.5s infinite" }} />}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 32 }}>{selected.icon}</span>
              <div>
                <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>{selected.name}</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                  <span style={{ color: "#556", fontSize: 11 }}>{selected.kmaCategory ? `🌤️ 기상청 ${selected.kmaCategory}` : selected.apiConfig?.enabled ? "🔌 커스텀API" : "✏️ 수동입력"}</span>
                  {selected.lastUpdated && <span style={{ color: "#445", fontSize: 10 }}>| 🕐 {selected.lastUpdated}</span>}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{selected.currentValue.toLocaleString()}<span style={{ fontSize: 16, color: "#8892b0", marginLeft: 4 }}>{selected.unit}</span></div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, alignItems: "center" }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 12, fontWeight: 700 }}>{li.icon} {li.label}</span>
                {selected.actionStatus && <span style={{ padding: "4px 10px", borderRadius: 20, background: selected.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(76,175,80,0.15)", border: `1px solid ${selected.actionStatus === "handling" ? "rgba(255,152,0,0.3)" : "rgba(76,175,80,0.3)"}`, color: selected.actionStatus === "handling" ? "#FF9800" : "#4CAF50", fontSize: 11, fontWeight: 700 }}>{selected.actionStatus === "handling" ? "🔧 조치중" : "✅ 조치완료"}</span>}
              </div>
            </div>
          </div>

          {selected.id === "crowd" && settings.venueArea > 0 && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 16 }}><span style={{ color: "#8892b0", fontSize: 12 }}>밀집도: <strong style={{ color: li.color }}>{(selected.currentValue / settings.venueArea).toFixed(2)}명/㎡</strong> (면적: {settings.venueArea.toLocaleString()}㎡)</span></div>}

          {/* ★ 인파 체류/누적 표시 */}
          {selected.id === "crowd" && (() => {
            const cd = JSON.parse(localStorage.getItem("_crowd") || "{}");
            const cumVal = cd.cumulative || 0;
            const zoneData = cd.zones || [];
            const history = selected.history || [];
            const hLog = settings.hourlyLog || [];
            return (<>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 12, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.15)" }}>
                  <div style={{ color: "#8892b0", fontSize: 11 }}>🏃 현재 체류</div>
                  <div style={{ color: "#4CAF50", fontSize: 28, fontWeight: 900, fontFamily: "monospace" }}>{selected.currentValue.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                  <div style={{ color: "#8892b0", fontSize: 11 }}>📊 누적 방문</div>
                  <div style={{ color: "#2196F3", fontSize: 28, fontWeight: 900, fontFamily: "monospace" }}>{cumVal.toLocaleString()}</div>
                </div>
              </div>

              {/* 체류 인원 실시간 추이 (history 데이터 — 30분 간격) */}
              {history.length >= 2 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📡 체류 인원 추이</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={history.slice(-24)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 10 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()}명`, "체류"]} />
                    {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 10 }} />}
                    {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" label={{ value: "경계", fill: "#FF9800", fontSize: 10 }} />}
                    <Line type="monotone" dataKey="value" stroke="#4CAF50" strokeWidth={3} dot={{ fill: "#4CAF50", r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>}

              {/* 체류 + 누적 비교 추이 (hourlyLog — 5분 간격) */}
              {hLog.length >= 2 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📈 체류 / 누적 추이 (5분 간격)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hLog.slice(-60).map(h => ({ time: h.time, 체류: h.current || 0, 누적: h.cumulative || 0 }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#556", fontSize: 10 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="체류" stroke="#4CAF50" strokeWidth={2} dot={false} name="🏃 체류" />
                    <Line type="monotone" dataKey="누적" stroke="#2196F3" strokeWidth={2} dot={false} name="📊 누적" />
                  </LineChart>
                </ResponsiveContainer>
              </div>}

              {/* 데이터 없을 때 안내 */}
              {history.length < 2 && hLog.length < 2 && <div style={{ textAlign: "center", padding: 20, marginBottom: 16, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid #222" }}>
                <p style={{ color: "#556", fontSize: 12 }}>📊 인파계수 데이터가 쌓이면 그래프가 표시됩니다</p>
                <p style={{ color: "#445", fontSize: 10 }}>체류 추이: 30분 간격 자동 기록 | 체류/누적 비교: 5분 간격 자동 기록</p>
              </div>}

              {/* 일자별 기록 */}
              {(settings.dailyRecords || []).length >= 1 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📅 일자별 방문 현황</h3>
                {(settings.dailyRecords || []).length >= 2 && <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={(settings.dailyRecords || []).map(r => ({ date: r.date, 누적방문: r.cumulative || 0, 최대체류: r.peakCurrent || 0 }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fill: "#556", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 10 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="누적방문" stroke="#2196F3" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="최대체류" stroke="#FF9800" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>}
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {(settings.dailyRecords || []).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                      <span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{r.date}</span>
                      <span style={{ color: "#2196F3", fontSize: 12, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                      <span style={{ color: "#FF9800", fontSize: 11 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>}

              {/* 구역별 체류/누적 */}
              {zoneData.filter(z => z.name).length > 0 && <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
                <h4 style={{ color: "#8892b0", fontSize: 13, margin: "0 0 10px" }}>🗺️ 구역별 현황</h4>
                <div style={{ display: "grid", gap: 6 }}>
                  {zoneData.filter(z => z.name).map(z => (
                    <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                      <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700, flex: 1 }}>{z.name}</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: "#4CAF50", fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>{(z.count || 0).toLocaleString()}</span>
                        <span style={{ color: "#445", fontSize: 10, margin: "0 4px" }}>/</span>
                        <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{(z.cumulative || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>}
            </>);
          })()}

          {/* 실황 추이 그래프 (인파 외 항목용) */}
          {selected.id !== "crowd" && <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📡 실황 추이 (30분 간격)</h3>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={(selected.history || []).slice(-24)} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 10 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "실황"]} />
                  {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 10 }} />}
                  {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" label={{ value: "경계", fill: "#FF9800", fontSize: 10 }} />}
                  <Line type="monotone" dataKey="value" stroke={li.color} strokeWidth={3} dot={{ fill: li.color, r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>}

          {/* 초단기 예보 그래프 */}
          {(selected.forecast || []).length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#FF9800", fontSize: 13, marginBottom: 8 }}>📋 초단기 예보 (향후 6시간)</h3>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={selected.forecast} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 10 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "예보"]} />
                  <Line type="monotone" dataKey="value" stroke="#FF9800" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#FF9800", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: li.color }} /><span style={{ color: "#556", fontSize: 10 }}>실황</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: "#FF9800", borderTop: "2px dashed #FF9800" }} /><span style={{ color: "#556", fontSize: 10 }}>예보</span></div>
            </div>
          </div>}

          {/* 기준값 표시 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
            {Object.entries(LEVELS).map(([lk, lvi]) => (<div key={lk} style={{ padding: "6px 8px", borderRadius: 8, background: lk === lv ? lvi.bg : "rgba(255,255,255,0.02)", border: `1px solid ${lk === lv ? lvi.border : "#1a1a2e"}`, textAlign: "center" }}>
              <div style={{ color: lvi.color, fontSize: 10, fontWeight: 700 }}>{lvi.label}</div>
              <div style={{ color: lk === lv ? "#fff" : "#556", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{selected.thresholds[lk]?.[0]}~{selected.thresholds[lk]?.[1] === Infinity ? "∞" : selected.thresholds[lk]?.[1]}</div>
            </div>))}
          </div>

          {/* 조치 버튼 — 주의 이상일 때만 */}
          {isWarning && <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button onClick={() => onAction?.(selected.id, "handling")} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: selected.actionStatus === "handling" ? "2px solid #FF9800" : "1px solid #444",
              background: selected.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.03)",
              color: selected.actionStatus === "handling" ? "#FF9800" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>🔧 조치중</button>
            <button onClick={() => onAction?.(selected.id, "resolved")} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: selected.actionStatus === "resolved" ? "2px solid #4CAF50" : "1px solid #444",
              background: selected.actionStatus === "resolved" ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.03)",
              color: selected.actionStatus === "resolved" ? "#4CAF50" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>✅ 조치완료</button>
          </div>}

          {/* 조치사항 작성 */}
          {isWarning && <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.15)", marginBottom: 12 }}>
            <h4 style={{ color: "#FF9800", fontSize: 13, margin: "0 0 10px", fontWeight: 700 }}>📝 조치사항 작성</h4>
            <textarea id={`action-text-${selected.id}`} placeholder="조치 내용을 입력하세요..." defaultValue={selected.actionReport?.content || ""} style={{ width: "100%", minHeight: 70, padding: 10, borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Label style={{ margin: 0, flex: "0 0 auto" }}>담당자</Label>
              <select onChange={e => {}} id={`action-assignee-${selected.id}`} defaultValue={selected.actionReport?.assigneeId || ""} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12 }}>
                <option value="">선택</option>
                {(settings.workers || []).map(w => <option key={w.id} value={w.id}>{w.name} ({w.role === "manager" ? "책임자" : "요원"}) — {w.position || "미배치"}</option>)}
              </select>
            </div>
            <button onClick={() => {
              const txt = document.getElementById(`action-text-${selected.id}`)?.value || "";
              const assigneeId = document.getElementById(`action-assignee-${selected.id}`)?.value || "";
              const worker = (settings.workers || []).find(w => w.id === assigneeId);
              onActionReport?.(selected.id, { content: txt, assigneeId, assigneeName: worker?.name || "" });
            }} style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#FF9800", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 조치사항 저장</button>
            {selected.actionReport?.content && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
              <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 4 }}>최근 조치 기록:</div>
              <div style={{ color: "#ccd6f6", fontSize: 12, whiteSpace: "pre-wrap" }}>{selected.actionReport.content}</div>
              {selected.actionReport.assigneeName && <div style={{ color: "#FF9800", fontSize: 11, marginTop: 4 }}>👤 담당: {selected.actionReport.assigneeName}</div>}
              {selected.actionReport.createdAt && <div style={{ color: "#445", fontSize: 10, marginTop: 2 }}>🕐 {selected.actionReport.createdAt}</div>}
            </div>}
          </div>}

          {/* 점검사항 */}
          {isWarning && selected.actionItems?.length > 0 && <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
            <h4 style={{ color: "#8892b0", fontSize: 12, margin: "0 0 8px" }}>📋 점검사항</h4>
            {selected.actionItems.map((a, i) => <div key={i} style={{ color: "#999", fontSize: 12, padding: "3px 0" }}>• {a}</div>)}
          </div>}

          {/* CMS 설정 이동 */}
          <button onClick={() => onCardClick(selected.id)} style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#556", fontSize: 12, cursor: "pointer" }}>⚙️ CMS 설정으로 이동</button>
        </div>
      </div>
    </div>);
  }

  // ── Main Dashboard View ──
  return (<div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0a0a1a 0%,#0d1b2a 50%,#0a0a1a 100%)", padding: "24px 20px" }}>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{settings.logoEmoji}</div>
      <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: 2 }}>{settings.festivalName}</h1>
      <p style={{ color: "#8892b0", fontSize: 14, margin: "4px 0 0" }}>{settings.festivalSubtitle}</p>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#8892b0", fontSize: 12 }}>📅 {fmtDate(now)}</span>
        <span style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700, fontFamily: "monospace" }}>🕐 {fmtTime(now)}</span>
        {settings.is24HourMode && <span style={{ padding: "2px 8px", borderRadius: 20, background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.3)", color: "#4CAF50", fontSize: 10, fontWeight: 700, animation: "blink 2s infinite" }}>24H</span>}
      </div>
      <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#445", fontSize: 11 }}>📍 {loc.name || "미설정"}</span>
        {kma.enabled && <span style={{ padding: "1px 6px", borderRadius: 10, background: kma.mode === "live" ? "rgba(76,175,80,0.1)" : "rgba(255,152,0,0.1)", border: `1px solid ${kma.mode === "live" ? "rgba(76,175,80,0.2)" : "rgba(255,152,0,0.2)"}`, color: kma.mode === "live" ? "#4CAF50" : "#FF9800", fontSize: 9 }}>{kma.mode === "live" ? "🌤️ LIVE" : "🔄 SIM"} {kma.lastFetch ? kma.lastFetch.split(" ").pop() : ""}</span>}
      </div>
      <div style={{ marginTop: 14 }}>
        <button onClick={handleRefresh} disabled={spinning} style={{ padding: "10px 28px", borderRadius: 24, border: "1px solid rgba(33,150,243,0.3)", background: spinning ? "rgba(33,150,243,0.2)" : "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 13, fontWeight: 700, cursor: spinning ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, transition: "all .3s" }}>
          <span style={{ display: "inline-block", animation: spinning ? "spin 1s linear infinite" : "none", fontSize: 16 }}>🔄</span>
          {spinning ? "수집 중..." : "최신화"}
        </button>
      </div>
    </div>
    <div style={{ maxWidth: 900, margin: "0 auto 20px", padding: "12px 20px", borderRadius: 12, background: olv.bg, border: `1.5px solid ${olv.border}`, textAlign: "center" }}>
      <span style={{ color: olv.color, fontWeight: 800, fontSize: 18 }}>{olv.icon} 종합: {olv.label}</span>
    </div>

    {/* 📢 공지사항 */}
    {(settings.notices || []).length > 0 && (
      <div style={{ maxWidth: 1100, margin: "0 auto 12px" }}>
        {settings.notices.map(n => (
          <div key={n.id} style={{ padding: "12px 16px", borderRadius: 10, background: "linear-gradient(135deg,rgba(33,150,243,0.08),rgba(156,39,176,0.06))", border: "1.5px solid rgba(33,150,243,0.2)", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>📢</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.content}</div>
              <div style={{ color: "#556", fontSize: 9, marginTop: 4 }}>{n.createdBy} · {n.createdAt}</div>
            </div>
            {(userRole === "admin" || userRole === "manager") && <button onClick={() => onDeleteNotice?.(n.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>✕</button>}
          </div>
        ))}
      </div>
    )}

    {/* ★ 조치중 항목 패널 */}
    {(() => { const handling = categories.filter(c => c.actionStatus === "handling"); return handling.length > 0 ? (
      <div style={{ maxWidth: 1100, margin: "0 auto 16px" }}>
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(255,152,0,0.08)", border: "1.5px solid rgba(255,152,0,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>🔧</span>
            <span style={{ color: "#FF9800", fontWeight: 700, fontSize: 14 }}>조치 진행중 ({handling.length}건)</span>
          </div>
          {handling.map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (
            <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 4, cursor: "pointer", flexWrap: "wrap" }}>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 13 }}>{cat.name}</span>
              <span style={{ color: li.color, fontWeight: 800, fontFamily: "monospace", fontSize: 15 }}>{cat.currentValue.toLocaleString()}{cat.unit}</span>
              <span style={{ padding: "2px 8px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 9, fontWeight: 700 }}>{li.icon} {li.label}</span>
              {cat.actionReport?.assigneeName && <span style={{ color: "#FF9800", fontSize: 11 }}>👤 {cat.actionReport.assigneeName}</span>}
              {cat.actionReport?.content && <span style={{ color: "#888", fontSize: 11, flex: 1 }}>{cat.actionReport.content.slice(0, 40)}{cat.actionReport.content.length > 40 ? "..." : ""}</span>}
            </div>
          ); })}
        </div>
      </div>
    ) : null; })()}

    {/* 주요 모니터링 항목 */}
    <div style={{ maxWidth: 1100, margin: "0 auto 8px" }}>
      <span style={{ color: "#556", fontSize: 11, fontWeight: 700 }}>🔴 주요 모니터링 (종합경보 반영)</span>
    </div>
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
      {categories.filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const tl = getTempLabel(cat); const fc = cat.forecast || []; const nextFc = fc[0]; return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "16px 16px 12px", border: `1.5px solid ${li.border}`, position: "relative", overflow: "hidden", cursor: "pointer", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.02)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: li.color, animation: "blink 1.5s infinite" }} />}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{cat.icon}</span>
            <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14, flex: 1 }}>{cat.name}</span>
            {cat.actionStatus && <span style={{ padding: "1px 6px", borderRadius: 10, background: cat.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(76,175,80,0.15)", color: cat.actionStatus === "handling" ? "#FF9800" : "#4CAF50", fontSize: 8, fontWeight: 700 }}>{cat.actionStatus === "handling" ? "🔧조치중" : "✅완료"}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 6 }}>
            <div>
              {cat.dataType && <div style={{ fontSize: 9, color: "#445", marginBottom: 2 }}>{cat.dataType === "실황" ? "📡 실황" : "📊 관측"}</div>}
              <span style={{ fontSize: 30, fontWeight: 800, color: li.color, fontFamily: "monospace", lineHeight: 1 }}>{cat.currentValue.toLocaleString()}</span>
              <span style={{ fontSize: 11, color: "#8892b0", marginLeft: 3 }}>{cat.unit}</span>
            </div>
            {nextFc && <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#556" }}>📋 예보</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: nextFc.value > cat.currentValue ? "#F44336" : nextFc.value < cat.currentValue ? "#2196F3" : "#8892b0" }}>
                {nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}{nextFc.value}
              </div>
              <div style={{ fontSize: 8, color: "#445" }}>{nextFc.time}</div>
            </div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ padding: "2px 8px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 9, fontWeight: 700 }}>{li.icon} {li.label}</span>
            {cat.lastUpdated && <span style={{ color: "#445", fontSize: 8, marginLeft: "auto" }}>🕐 {cat.lastUpdated}</span>}
          </div>
          {fc.length > 1 && <div style={{ marginTop: 8, display: "flex", gap: 1, height: 18, alignItems: "flex-end" }}>
            {fc.slice(0, 6).map((f, i) => { const vals = fc.slice(0,6).map(x=>x.value); const mn=Math.min(...vals); const mx=Math.max(...vals); const rng=mx-mn||1; const h=4+((f.value-mn)/rng)*14; return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex:1, height:h, borderRadius:2, background:li.color, opacity:0.4+(i===0?0.6:0) }} />; })}
          </div>}
        </div>); })}
    </div>

    {/* 기상 참고정보 (기온, 습도) — 종합경보 미반영 */}
    <div style={{ maxWidth: 1100, margin: "16px auto 8px" }}>
      <span style={{ color: "#556", fontSize: 11, fontWeight: 700 }}>🌤️ 기상 참고정보 (종합경보 미반영)</span>
    </div>
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
      {categories.filter(c => EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const tl = getTempLabel(cat); const fc = cat.forecast || []; const nextFc = fc[0]; return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "12px 14px", border: `1px solid ${li.border}`, cursor: "pointer", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.02)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{cat.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 13 }}>{cat.name}</span>
                {tl && <span style={{ padding: "1px 6px", borderRadius: 10, background: tl.includes("저온") ? "rgba(33,150,243,0.12)" : "rgba(244,67,54,0.12)", color: tl.includes("저온") ? "#2196F3" : "#F44336", fontSize: 8, fontWeight: 700 }}>{tl}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: li.color, fontFamily: "monospace" }}>{cat.currentValue.toLocaleString()}</span>
                <span style={{ fontSize: 10, color: "#8892b0" }}>{cat.unit}</span>
                {nextFc && <span style={{ fontSize: 12, fontFamily: "monospace", color: nextFc.value > cat.currentValue ? "#F44336" : nextFc.value < cat.currentValue ? "#2196F3" : "#556", marginLeft: 4 }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}{nextFc.value}</span>}
              </div>
            </div>
            <span style={{ padding: "2px 6px", borderRadius: 10, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 9, fontWeight: 700 }}>{li.label}</span>
          </div>
        </div>); })}
    </div>

    {/* 🅿️ 주차장 현황 */}
    {settings.features?.parking !== false && (settings.parkingLots || []).length > 0 && settings.dashboardVisible?.parking !== false && <>
      <div style={{ maxWidth: 1100, margin: "16px auto 8px" }}>
        <span style={{ color: "#556", fontSize: 11, fontWeight: 700 }}>🅿️ 주차장 현황 (종합경보 미반영)</span>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {(settings.parkingLots || []).map(lot => {
          const remain = lot.capacity - (lot.current || 0);
          const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
          const color = remain <= 0 ? "#F44336" : pct >= 90 ? "#FF9800" : pct >= 70 ? "#FFC107" : "#4CAF50";
          return (
            <div key={lot.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "12px 14px", border: `1px solid ${color}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>🅿️</span>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 13, flex: 1 }}>{lot.name}</span>
                <span style={{ padding: "2px 8px", borderRadius: 10, background: `${color}22`, color, fontSize: 9, fontWeight: 700 }}>
                  {remain <= 0 ? "🚫 만차" : pct >= 90 ? "⚠️ 거의만차" : pct >= 70 ? "⚡ 혼잡" : "✅ 여유"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{(lot.current || 0)}</span>
                <span style={{ color: "#556", fontSize: 11 }}>/ {lot.capacity}대</span>
                <span style={{ color: remain <= 0 ? "#F44336" : "#4CAF50", fontSize: 12, fontWeight: 700, marginLeft: "auto" }}>잔여 {Math.max(0, remain)}대</span>
              </div>
              <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: "width .5s" }} />
              </div>
            </div>
          );
        })}
      </div>
    </>}

    {/* 🚌 셔틀버스 현황 */}
    {settings.features?.shuttle !== false && (settings.shuttleBuses || []).length > 0 && <>
      <div style={{ maxWidth: 1100, margin: "16px auto 8px" }}>
        <span style={{ color: "#556", fontSize: 11, fontWeight: 700 }}>🚌 셔틀버스 현황</span>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}>
        {(settings.shuttleBuses || []).map(bus => {
          const sc = bus.status === "running" ? "#4CAF50" : bus.status === "stopped" ? "#FF9800" : "#F44336";
          const sl = bus.status === "running" ? "운행중" : bus.status === "stopped" ? "대기" : "종료";
          const stops = (settings.shuttleStops || []).sort((a,b)=>(a.order||0)-(b.order||0));
          const currentIdx = stops.findIndex(s => s.id === bus.currentStopId);
          return (
            <div key={bus.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "12px 14px", border: `1px solid ${sc}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>🚌</span>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 13, flex: 1 }}>{bus.name}</span>
                <span style={{ padding: "2px 8px", borderRadius: 10, background: `${sc}22`, color: sc, fontSize: 9, fontWeight: 700 }}>● {sl}</span>
              </div>
              {/* 탑승인원 */}
              {(() => { const cap = bus.capacity || 45; const pax = bus.passengers || 0; const full = pax >= cap; const pc = full ? "#F44336" : pax >= cap * 0.8 ? "#FF9800" : "#4CAF50"; return (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 10px", borderRadius: 8, background: full ? "rgba(244,67,54,0.08)" : "rgba(255,255,255,0.02)" }}>
                  <span style={{ color: "#556", fontSize: 10 }}>👥</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min((pax/cap)*100, 100)}%`, background: pc, borderRadius: 3, transition: "width .3s" }} />
                  </div>
                  <span style={{ color: pc, fontSize: 12, fontWeight: 800, fontFamily: "monospace", minWidth: 55, textAlign: "right" }}>{pax}/{cap}</span>
                  {full && <span style={{ padding: "1px 6px", borderRadius: 10, background: "#F44336", color: "#fff", fontSize: 8, fontWeight: 700 }}>만차</span>}
                </div>
              ); })()}
              {bus.route && <div style={{ color: "#556", fontSize: 10, marginBottom: 4 }}>🛤️ {bus.route} · {bus.capacity||45}인승</div>}
              {/* 정류장 진행 표시 */}
              {stops.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
                {stops.map((stop, i) => (
                  <div key={stop.id} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <div title={stop.name} style={{ width: 14, height: 14, borderRadius: 7, background: i === currentIdx ? "#00BCD4" : i < currentIdx ? `${sc}66` : "#333", border: i === currentIdx ? "2px solid #00BCD4" : "1px solid #444", transition: "all .3s", flexShrink: 0 }} />
                    {i < stops.length - 1 && <div style={{ flex: 1, height: 2, background: i < currentIdx ? `${sc}44` : "#333" }} />}
                  </div>
                ))}
              </div>}
              {/* 정류장 이름 */}
              {stops.length > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#556", fontSize: 8 }}>{stops[0]?.name}</span>
                <span style={{ color: "#556", fontSize: 8 }}>{stops[stops.length-1]?.name}</span>
              </div>}
              {/* 현재 위치 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ color: bus.currentStopName ? "#00BCD4" : "#556", fontSize: 12, fontWeight: 700 }}>📍 {bus.currentStopName || "위치 미확인"}</span>
                {bus.lastUpdated && <span style={{ color: "#445", fontSize: 9 }}>🕐 {bus.lastUpdated}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>}

    <div style={{ maxWidth: 1100, margin: "16px auto 0", display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
      {Object.entries(LEVELS).map(([k, v]) => (<div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: v.color }} /><span style={{ color: "#8892b0", fontSize: 11 }}>{v.label}</span></div>))}
    </div>
    {alerts && alerts.length > 0 && (
      <div style={{ maxWidth: 1100, margin: "20px auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, margin: 0 }}>🔔 최근 알림</h3>
          <button onClick={() => onDeleteAlert?.("all")} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>전체 삭제</button>
        </div>
        {alerts.slice(0, 5).map((a, i) => { const ali = LEVELS[a.level]; return (
          <div key={i} style={{ background: ali.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${ali.border}`, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: ali.color, fontWeight: 700, fontSize: 12 }}>{ali.icon} {a.category}</span>
            <span style={{ color: "#888", fontSize: 10, flex: 1 }}>{a.message.split("\n")[2] || ""}</span>
            <span style={{ color: "#445", fontSize: 9 }}>{a.time}</span>
            <button onClick={(e) => { e.stopPropagation(); onDeleteAlert?.(i); }} style={{ padding: "2px 6px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 10, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>); })}
      </div>)}

    {/* 금일 주요 조치사항 */}
    {(() => {
      const today = new Date().toLocaleDateString("ko-KR");
      // 진행중 항목
      const handling = categories.filter(c => c.actionStatus === "handling");
      // 완료 이력 (금일)
      const completed = (settings.resolvedHistory || []).filter(r => r.resolvedAt?.includes(today));
      return (handling.length > 0 || completed.length > 0) ? (
        <div style={{ maxWidth: 1100, margin: "20px auto 0" }}>
          <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📋 금일 주요 조치사항</h3>

          {/* 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, marginBottom: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "6px 10px", background: "rgba(255,152,0,0.1)", borderRadius: "8px 0 0 0", border: "1px solid rgba(255,152,0,0.15)" }}>
              <span style={{ color: "#FF9800", fontSize: 9, fontWeight: 700 }}>항목</span>
              <span style={{ color: "#FF9800", fontSize: 9, fontWeight: 700 }}>지시사항</span>
              <span style={{ color: "#FF9800", fontSize: 9, fontWeight: 700, textAlign: "right" }}>지시일자</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#556", fontSize: 12 }}>→</div>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "6px 10px", background: "rgba(76,175,80,0.1)", borderRadius: "0 8px 0 0", border: "1px solid rgba(76,175,80,0.15)" }}>
              <span style={{ color: "#4CAF50", fontSize: 9, fontWeight: 700 }}>항목</span>
              <span style={{ color: "#4CAF50", fontSize: 9, fontWeight: 700 }}>조치사항</span>
              <span style={{ color: "#4CAF50", fontSize: 9, fontWeight: 700, textAlign: "right" }}>완료일자</span>
            </div>
          </div>

          {/* 진행중 항목 */}
          {handling.map(cat => (
            <div key={cat.id} style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, marginBottom: 2 }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.1)", borderRadius: "4px 0 0 4px" }}>
                <span style={{ color: "#ccd6f6", fontSize: 11, fontWeight: 700 }}>{cat.icon}{cat.name}</span>
                <span style={{ color: "#ddd", fontSize: 10 }}>{cat.actionReport?.content || "지시 대기"}</span>
                <span style={{ color: "#888", fontSize: 9, textAlign: "right" }}>{cat.handlingStartedAt || "-"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#FF9800", fontSize: 10 }}>🔧</div>
              <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: "rgba(255,152,0,0.03)", border: "1px solid rgba(255,152,0,0.08)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ color: "#FF9800", fontSize: 11, fontStyle: "italic" }}>조치 진행중...</span>
              </div>
            </div>
          ))}

          {/* 완료 항목 */}
          {completed.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, marginBottom: 2 }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a2e", borderRadius: "4px 0 0 4px" }}>
                <span style={{ color: "#999", fontSize: 11 }}>{r.icon}{r.name}</span>
                <span style={{ color: "#888", fontSize: 10 }}>{r.instruction || "-"}</span>
                <span style={{ color: "#556", fontSize: 9, textAlign: "right" }}>{r.instructedAt || "-"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#4CAF50", fontSize: 10 }}>✅</div>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(76,175,80,0.03)", border: "1px solid rgba(76,175,80,0.08)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ color: "#4CAF50", fontSize: 11 }}>{r.icon}{r.name}</span>
                <span style={{ color: "#aaa", fontSize: 10 }}>{r.resolution || "완료"}</span>
                <span style={{ color: "#556", fontSize: 9, textAlign: "right" }}>{r.resolvedAt}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null;
    })()}

    <div style={{ textAlign: "center", marginTop: 24, color: "#334", fontSize: 11 }}>{settings.organization} | {settings.contactNumber}</div>
  </div>);
}

// ─── Counter Page ────────────────────────────────────────────────
function CounterPage({ categories, setCategories, settings, setSettings, session }) {
  const crowd = categories.find(c => c.id === "crowd");
  const lv = crowd ? getLevel(crowd) : "BLUE"; const li = LEVELS[lv]; const now = useNow();
  const [log, setLog] = useState([]);
  const [showExport, setShowExport] = useState(false);
  const zones = settings.zones || [];
  const hasZones = zones.length > 1 || (zones.length === 1 && zones[0].name);
  const myZone = session ? zones.find(z => z.accountId === session.id) : null;
  const [selZone, setSelZone] = useState(myZone?.id || null);

  // ★ Supabase 단일 소스 — localStorage 캐시 없음
  const [crowdState, setCrowdState] = useState({ total: crowd?.currentValue || 0, cumulative: 0, zones: [] });
  const stateRef = useRef(crowdState);

  // 마운트 시 Supabase에서 최신값 로드
  useEffect(() => {
    let mounted = true;
    window.crowdDB.get().then(data => {
      if (!mounted || !data) return;
      const d = { total: data.total || 0, cumulative: data.cumulative || 0, zones: data.zones || [] };
      stateRef.current = d;
      setCrowdState(d);
      setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: d.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
    });
    return () => { mounted = false; };
  }, []);

  // Realtime: 다른 기기에서 변경 시 즉시 반영
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        const d = { total: e.detail.total || 0, cumulative: e.detail.cumulative || 0, zones: e.detail.zones || stateRef.current.zones || [] };
        stateRef.current = d;
        setCrowdState(d);
        setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: d.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
      }
    };
    window.addEventListener("crowd-update", handler);
    return () => window.removeEventListener("crowd-update", handler);
  }, []);

  // 5분마다 시간별 기록
  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() - lastHourlyRef.current < 300000) return;
      lastHourlyRef.current = Date.now();
      const s = stateRef.current;
      const entry = { time: fmtHM(new Date()), date: new Date().toLocaleDateString("ko-KR"), current: s.total || 0, cumulative: s.cumulative || 0, zones: (s.zones || []).filter(z => z.name).map(z => ({ name: z.name, current: z.count || 0, cumulative: z.cumulative || 0 })) };
      setSettings(prev => ({ ...prev, hourlyLog: [...(prev.hourlyLog || []).slice(-288), entry] }));
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  const curTotal = crowdState.total || 0;
  const cumTotal = crowdState.cumulative || 0;
  const zoneData = (crowdState.zones || []).length > 0 ? crowdState.zones : zones;

  // ★ 카운터: ref → React state → Supabase 순서
  const adjustTotal = (d) => {
    const prev = stateRef.current;
    const newCur = Math.max(0, (prev.total || 0) + d);
    const newCum = d > 0 ? (prev.cumulative || 0) + d : (prev.cumulative || 0);
    let newZones = prev.zones?.length ? [...prev.zones] : zones.map(z => ({ id: z.id, name: z.name, count: 0, cumulative: 0, range: z.range, assignee: z.assignee }));
    if (selZone) {
      newZones = newZones.map(z => z.id === selZone ? { ...z, count: Math.max(0, (z.count || 0) + d), cumulative: d > 0 ? (z.cumulative || 0) + d : (z.cumulative || 0) } : z);
    }

    // 1) ref 즉시 업데이트 (연타 대응)
    const next = { total: newCur, cumulative: newCum, zones: newZones };
    stateRef.current = next;

    // 2) React state (화면 반영)
    setCrowdState(next);
    setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: newCur, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));

    // 3) Supabase 저장 (비동기 — 다른 기기에 전파)
    window.crowdDB.set(newCur, newCum, newZones, session?.id || "counter");

    // 4) 로그
    const zoneName = selZone ? (newZones.find(z => z.id === selZone)?.name || "") : "";
    setLog(p => [{ delta: d, time: fmtTime(new Date()), total: newCur, cum: newCum, zone: zoneName }, ...p].slice(0, 50));
  };

  const saveDailyRecord = () => {
    const today = new Date().toLocaleDateString("ko-KR");
    const record = { date: today, cumulative: cumTotal, peakCurrent: curTotal, currentAtClose: curTotal, categories: categories.map(c => ({ name: c.name, icon: c.icon, value: c.currentValue, unit: c.unit })), zones: zoneData.filter(z => z.name).map(z => ({ name: z.name, cumulative: z.cumulative || 0, peak: z.count || 0 })) };
    setSettings(prev => ({ ...prev, dailyRecords: [...(prev.dailyRecords || []).filter(r => r.date !== today), record], cumulativeVisitors: cumTotal }));
    alert("✅ 금일 데이터가 저장되었습니다.");
  };

  const exportExcel = (type) => {
    const wb = XLSX.utils.book_new();
    if (type === "hourly" || type === "all") {
      const hLog = settings.hourlyLog || [];
      const zNames = zoneData.filter(z => z.name).map(z => z.name);
      const hRows = hLog.map(h => {
        const row = { "날짜": h.date, "시간": h.time, "체류인원": h.current, "누적방문객": h.cumulative };
        zNames.forEach(n => { const zd = (h.zones || []).find(z => z.name === n); row[`${n}_체류`] = zd?.current || 0; row[`${n}_누적`] = zd?.cumulative || 0; });
        return row;
      });
      if (hRows.length) { const ws = XLSX.utils.json_to_sheet(hRows); XLSX.utils.book_append_sheet(wb, ws, "시간별현황"); }
    }
    if (type === "daily" || type === "all") {
      const dRecs = settings.dailyRecords || [];
      const dRows = dRecs.map(r => ({ "날짜": r.date, "누적방문객": r.cumulative, "최대체류": r.peakCurrent, "마감체류": r.currentAtClose || 0 }));
      if (dRows.length) { const ws2 = XLSX.utils.json_to_sheet(dRows); XLSX.utils.book_append_sheet(wb, ws2, "일자별방문객"); }
      const catRows = [];
      dRecs.forEach(r => { (r.categories || []).forEach(c => { catRows.push({ "날짜": r.date, "항목": `${c.icon}${c.name}`, "값": c.value, "단위": c.unit }); }); });
      if (catRows.length) { const ws3 = XLSX.utils.json_to_sheet(catRows); XLSX.utils.book_append_sheet(wb, ws3, "일자별항목데이터"); }
      const zRows = [];
      dRecs.forEach(r => { (r.zones || []).forEach(z => { zRows.push({ "날짜": r.date, "구역": z.name, "누적방문": z.cumulative, "최대체류": z.peak }); }); });
      if (zRows.length) { const ws4 = XLSX.utils.json_to_sheet(zRows); XLSX.utils.book_append_sheet(wb, ws4, "일자별구역데이터"); }
    }
    if (wb.SheetNames.length === 0) { alert("내보낼 데이터가 없습니다."); return; }
    XLSX.writeFile(wb, `축제현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const showZoneFirst = hasZones && myZone;
  const Stat = ({ label, value, color }) => (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#556", fontSize: 10 }}>{label}</div>
      <div style={{ color: color || "#ccd6f6", fontSize: 28, fontWeight: 900, fontFamily: "monospace", lineHeight: 1.2 }}>{(value || 0).toLocaleString()}</div>
    </div>
  );

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{settings.festivalName} 인파 계수</h2>
    <p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 16px" }}>{fmtTime(now)}</p>

    {showZoneFirst && (() => { const z = zoneData.find(zz => zz.id === myZone.id); return z ? (
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 12, padding: 16, borderRadius: 16, background: "rgba(76,175,80,0.06)", border: "1.5px solid rgba(76,175,80,0.2)", textAlign: "center" }}>
        <div style={{ color: "#4CAF50", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📍 내 구역: {z.name}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 30 }}>
          <Stat label="체류" value={z.count || 0} color="#4CAF50" />
          <Stat label="누적" value={z.cumulative || 0} color="#2196F3" />
        </div>
      </div>
    ) : null; })()}

    <div style={{ width: "100%", maxWidth: 400, background: li.bg, border: `2px solid ${li.border}`, borderRadius: 20, padding: 20, textAlign: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 30, marginBottom: 8 }}>
        <div>
          <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 2 }}>🏃 체류 인원</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{curTotal.toLocaleString()}</div>
          <div style={{ color: li.color, fontSize: 12, fontWeight: 700 }}>{li.icon} {li.label}</div>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <div>
          <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 2 }}>📊 누적 방문</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#2196F3", fontFamily: "monospace" }}>{cumTotal.toLocaleString()}</div>
          <div style={{ color: "#556", fontSize: 12 }}>총 방문객</div>
        </div>
      </div>
      {settings.venueArea > 0 && <div style={{ color: "#8892b0", fontSize: 11 }}>밀집도: {(curTotal / settings.venueArea).toFixed(2)}명/㎡</div>}
    </div>

    {hasZones && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => setSelZone(null)} style={{ padding: "8px 14px", borderRadius: 8, border: !selZone ? "1.5px solid #2196F3" : "1px solid #333", background: !selZone ? "rgba(33,150,243,0.15)" : "transparent", color: !selZone ? "#2196F3" : "#667", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>전체</button>
        {zoneData.filter(z => z.name).map(z => (
          <button key={z.id} onClick={() => setSelZone(z.id)} style={{ padding: "8px 14px", borderRadius: 8, border: selZone === z.id ? "1.5px solid #4CAF50" : "1px solid #333", background: selZone === z.id ? "rgba(76,175,80,0.15)" : "transparent", color: selZone === z.id ? "#4CAF50" : "#667", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {z.name} ({z.count || 0})
          </button>
        ))}
      </div>
      {selZone && !showZoneFirst && (() => { const z = zoneData.find(zz => zz.id === selZone); return z ? (
        <div style={{ textAlign: "center", marginTop: 8, padding: 10, background: "rgba(76,175,80,0.06)", borderRadius: 8, border: "1px solid rgba(76,175,80,0.15)" }}>
          <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>📍 {z.name}</span>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 6 }}>
            <Stat label="체류" value={z.count || 0} color="#4CAF50" />
            <Stat label="누적" value={z.cumulative || 0} color="#2196F3" />
          </div>
        </div>
      ) : null; })()}
    </div>}

    <div style={{ width: "100%", maxWidth: 400 }}>
      <div style={{ color: "#4CAF50", fontSize: 11, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▲ 입장 (체류 + 누적 증가)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
      </div>
      <div style={{ color: "#F44336", fontSize: 11, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▼ 퇴장 (체류만 감소, 누적 유지)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(-n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input id="cc" type="number" placeholder="직접 입력" style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16 }} />
        <button onClick={() => { const e = document.getElementById("cc"); const v = parseInt(e.value); if (!isNaN(v)) { adjustTotal(v); e.value = ""; } }} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer" }}>적용</button>
      </div>
    </div>

    {hasZones && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>🗺️ 구역별 현황</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {zoneData.filter(z => z.name).map(z => (
          <div key={z.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: selZone === z.id ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, border: selZone === z.id ? "1px solid rgba(76,175,80,0.2)" : "1px solid transparent" }}>
            <span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{z.name}</span>
            <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 800, fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>{(z.count || 0).toLocaleString()}</span>
            <span style={{ color: "#445", fontSize: 10, margin: "0 2px" }}>/</span>
            <span style={{ color: "#2196F3", fontSize: 11, fontWeight: 700, fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>{(z.cumulative || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>}

    <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <button onClick={() => setShowExport(!showExport)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>{showExport ? "▲ 닫기" : "📊 데이터 관리 / 엑셀 내보내기"}</button>
      {showExport && <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid #222", display: "grid", gap: 8 }}>
        <button onClick={saveDailyRecord} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4CAF50,#388E3C)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📋 금일 데이터 저장 (일일 마감)</button>
        <button onClick={() => exportExcel("hourly")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>📥 시간별 현황 엑셀</button>
        <button onClick={() => exportExcel("daily")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>📥 일자별 현황 엑셀</button>
        <button onClick={() => exportExcel("all")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📥 전체 데이터 엑셀</button>
      </div>}
    </div>

    <div style={{ width: "100%", maxWidth: 400 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>입력 기록</h3>
      <div style={{ maxHeight: 160, overflow: "auto" }}>
        {log.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6, color: "#aaa", fontSize: 11 }}>
          <span style={{ color: l.delta > 0 ? "#4CAF50" : "#F44336", fontWeight: 700 }}>{l.delta > 0 ? "+" : ""}{l.delta}</span>
          {l.zone && <span style={{ color: "#556" }}>{l.zone}</span>}
          <span>체류 {l.total.toLocaleString()}</span>
          <span style={{ color: "#2196F3" }}>누적 {(l.cum || 0).toLocaleString()}</span>
          <span>{l.time}</span>
        </div>)}
      </div>
    </div>
  </div>);
}

// ─── Parking Page ───────────────────────────────────────────────
function ParkingPage({ settings, setSettings, session }) {
  const now = useNow();
  const lots = settings.parkingLots || [];
  // 주차요원은 배정된 주차장만, 관리자는 전체
  const myLots = session.role === "parking" ? lots.filter(l => l.assigneeId === session.id) : lots;

  const adjustParking = (lotId, delta) => {
    setSettings(prev => ({
      ...prev,
      parkingLots: (prev.parkingLots || []).map(l =>
        l.id === lotId ? { ...l, current: Math.max(0, Math.min(l.capacity, (l.current || 0) + delta)), lastUpdated: new Date().toLocaleTimeString("ko-KR") } : l
      )
    }));
    
  };

  const getParkingLevel = (lot) => {
    if (!lot.capacity) return "BLUE";
    const remain = lot.capacity - (lot.current || 0);
    const pct = remain / lot.capacity;
    if (pct < 0.1) return "ORANGE";
    if (pct < 0.3) return "YELLOW";
    return "BLUE";
  };

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>🅿️ 주차장 관리</h2>
    <p style={{ color: "#8892b0", fontSize: 12, textAlign: "center", margin: "0 0 20px" }}>{settings.festivalName} | {fmtTime(now)}</p>

    {myLots.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🅿️</div>
      <p style={{ fontSize: 14 }}>배정된 주차장이 없습니다</p>
      <p style={{ fontSize: 12, color: "#445" }}>관리자에게 주차장 배정을 요청하세요</p>
    </div>}

    {myLots.map(lot => {
      const lv = getParkingLevel(lot); const li = LEVELS[lv];
      const remain = lot.capacity - (lot.current || 0);
      const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
      return (
        <div key={lot.id} style={{ maxWidth: 400, margin: "0 auto 20px", background: "rgba(255,255,255,0.03)", borderRadius: 20, padding: 24, border: `2px solid ${li.border}` }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>🅿️ {lot.name}</h3>
            {lot.address && <p style={{ color: "#556", fontSize: 11, margin: 0 }}>📍 {lot.address}</p>}
          </div>

          {/* 현황 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>현재 주차</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{(lot.current || 0).toLocaleString()}</div>
            <div style={{ color: "#8892b0", fontSize: 13 }}>/ {lot.capacity.toLocaleString()}대</div>
            <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: li.color, borderRadius: 4, transition: "width .5s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ color: li.color, fontSize: 12, fontWeight: 700 }}>{pct.toFixed(0)}% 사용</span>
              <span style={{ color: remain <= 0 ? "#F44336" : "#4CAF50", fontSize: 12, fontWeight: 700 }}>잔여 {remain}대</span>
            </div>
          </div>

          {/* 상태 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span style={{ padding: "4px 14px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 13, fontWeight: 700 }}>
              {remain <= 0 ? "🚫 만차" : lv === "ORANGE" ? "⚠️ 거의 만차" : lv === "YELLOW" ? "⚡ 주차 혼잡" : "✅ 여유"}
            </span>
          </div>

          {/* +/- 버튼 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            {[1, 5, 10].map(n => <button key={n} onClick={() => adjustParking(lot.id, n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {[1, 5, 10].map(n => <button key={n} onClick={() => adjustParking(lot.id, -n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input id={`pk-${lot.id}`} type="number" placeholder="직접 입력" style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }} />
            <button onClick={() => { const e = document.getElementById(`pk-${lot.id}`); const v = parseInt(e.value); if (!isNaN(v)) { adjustParking(lot.id, v); e.value = ""; } }} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#9C27B0", color: "#fff", fontWeight: 700, cursor: "pointer" }}>적용</button>
          </div>
          {lot.lastUpdated && <div style={{ textAlign: "center", marginTop: 8, color: "#445", fontSize: 10 }}>🕐 {lot.lastUpdated}</div>}
        </div>
      );
    })}
  </div>);
}

// ─── Shuttle Bus Page (셔틀요원용) ──────────────────────────────
function ShuttlePage({ settings, setSettings, session }) {
  const now = useNow();
  const buses = settings.shuttleBuses || [];
  const stops = settings.shuttleStops || [];
  const myBuses = session.role === "shuttle" ? buses.filter(b => b.assigneeId === session.id) : buses;

  const updateBus = (busId, fields) => {
    setSettings(prev => ({
      ...prev,
      shuttleBuses: (prev.shuttleBuses || []).map(b =>
        b.id === busId ? { ...b, ...fields, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : b
      )
    }));
    
  };

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>🚌 셔틀버스 관리</h2>
    <p style={{ color: "#8892b0", fontSize: 12, textAlign: "center", margin: "0 0 20px" }}>{settings.festivalName} | {fmtTime(now)}</p>

    {myBuses.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🚌</div>
      <p style={{ fontSize: 14 }}>배정된 셔틀버스가 없습니다</p>
      <p style={{ fontSize: 12, color: "#445" }}>관리자에게 배정을 요청하세요</p>
    </div>}

    {myBuses.map(bus => {
      const statusColors = { running: "#4CAF50", stopped: "#FF9800", off: "#F44336" };
      const statusLabels = { running: "🟢 운행중", stopped: "🟡 대기중", off: "🔴 운행종료" };
      const sc = statusColors[bus.status || "off"];
      const cap = bus.capacity || 45;
      const pax = bus.passengers || 0;
      const isFull = pax >= cap;
      const paxPct = Math.min((pax / cap) * 100, 100);
      const paxColor = isFull ? "#F44336" : pax >= cap * 0.8 ? "#FF9800" : "#4CAF50";
      return (
        <div key={bus.id} style={{ maxWidth: 500, margin: "0 auto 20px", background: "rgba(255,255,255,0.03)", borderRadius: 20, padding: 24, border: `2px solid ${sc}33` }}>
          {/* 버스 정보 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 36 }}>🚌</div>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "4px 0" }}>{bus.name}</h3>
            {bus.route && <p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 4px" }}>노선: {bus.route}</p>}
            <span style={{ color: "#556", fontSize: 11 }}>{cap}인승</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ padding: "4px 14px", borderRadius: 20, background: `${sc}22`, border: `1px solid ${sc}44`, color: sc, fontSize: 12, fontWeight: 700 }}>{statusLabels[bus.status || "off"]}</span>
            </div>
          </div>

          {/* ★ 탑승인원 카운터 */}
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: isFull ? "rgba(244,67,54,0.08)" : "rgba(76,175,80,0.05)", border: `1.5px solid ${isFull ? "rgba(244,67,54,0.2)" : "rgba(76,175,80,0.12)"}` }}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 4 }}>탑승인원</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: paxColor, fontFamily: "monospace" }}>{pax}</div>
              <div style={{ color: "#8892b0", fontSize: 13 }}>/ {cap}명</div>
              {isFull && <div style={{ marginTop: 6, padding: "6px 20px", borderRadius: 20, background: "#F44336", color: "#fff", fontSize: 14, fontWeight: 800, display: "inline-block", animation: "blink 1.5s infinite" }}>🚫 만차</div>}
            </div>
            {/* 프로그레스 바 */}
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${paxPct}%`, background: paxColor, borderRadius: 5, transition: "width .3s" }} />
            </div>
            {/* +/- 버튼 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[1, 5, 10].map(n => <button key={n} onClick={() => updateBus(bus.id, { passengers: Math.min(cap, pax + n) })} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 18, fontWeight: 800, cursor: isFull ? "not-allowed" : "pointer", opacity: isFull ? 0.4 : 1 }} disabled={isFull}>+{n}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[1, 5, 10].map(n => <button key={n} onClick={() => updateBus(bus.id, { passengers: Math.max(0, pax - n) })} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => updateBus(bus.id, { passengers: 0 })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #555", background: "transparent", color: "#8892b0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔄 초기화 (0명)</button>
              <button onClick={() => updateBus(bus.id, { passengers: cap })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${isFull ? "#a33" : "#555"}`, background: isFull ? "rgba(244,67,54,0.1)" : "transparent", color: isFull ? "#F44336" : "#8892b0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🚫 만차 ({cap}명)</button>
            </div>
          </div>

          {/* 현재 위치 */}
          {bus.currentStopName && <div style={{ textAlign: "center", marginBottom: 16, padding: 14, borderRadius: 12, background: "rgba(0,188,212,0.08)", border: "1px solid rgba(0,188,212,0.15)" }}>
            <div style={{ color: "#8892b0", fontSize: 11, marginBottom: 4 }}>현재 위치</div>
            <div style={{ color: "#00BCD4", fontSize: 20, fontWeight: 800 }}>📍 {bus.currentStopName}</div>
            {bus.lastUpdated && <div style={{ color: "#556", fontSize: 10, marginTop: 4 }}>🕐 {bus.lastUpdated}</div>}
          </div>}

          {/* 운행 상태 버튼 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ s: "running", l: "🟢 운행", c: "#4CAF50" }, { s: "stopped", l: "🟡 대기", c: "#FF9800" }, { s: "off", l: "🔴 종료", c: "#F44336" }].map(st => (
              <button key={st.s} onClick={() => updateBus(bus.id, { status: st.s })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: bus.status === st.s ? `2px solid ${st.c}` : "1px solid #333", background: bus.status === st.s ? `${st.c}15` : "transparent", color: bus.status === st.s ? st.c : "#8892b0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{st.l}</button>
            ))}
          </div>

          {/* 정류장 버튼 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📍 정류장 도착</div>
            <div style={{ display: "grid", gap: 6 }}>
              {stops.sort((a, b) => (a.order || 0) - (b.order || 0)).map((stop, i) => {
                const isCurrent = bus.currentStopId === stop.id;
                return (
                  <button key={stop.id} onClick={() => updateBus(bus.id, { currentStopId: stop.id, currentStopName: stop.name, status: "running" })} style={{
                    padding: "16px 20px", borderRadius: 14,
                    border: isCurrent ? "2.5px solid #00BCD4" : "1.5px solid #333",
                    background: isCurrent ? "rgba(0,188,212,0.12)" : "rgba(255,255,255,0.02)",
                    color: isCurrent ? "#00BCD4" : "#ccd6f6",
                    fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 12, transition: "all .2s"
                  }}>
                    <span style={{ width: 28, height: 28, borderRadius: 14, background: isCurrent ? "#00BCD4" : "#333", color: isCurrent ? "#fff" : "#888", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1 }}>{stop.name}</span>
                    {isCurrent && <span style={{ fontSize: 11, color: "#00BCD4" }}>📍 현재</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    })}
  </div>);
}

// ─── Message Page ───────────────────────────────────────────────
function MessagePage({ settings, setSettings, accounts, session }) {
  const [msgType, setMsgType] = useState("all");

  const doSend = () => {
    const content = document.getElementById("mp-content")?.value;
    if (!content) { alert("내용을 입력하세요."); return; }
    const time = new Date().toLocaleString("ko-KR");

    if (msgType === "notice") {
      setSettings(prev => ({ ...prev, notices: [{ id: "n" + Date.now(), content, createdAt: time, createdBy: session.name }, ...(prev.notices || [])], messages: [{ id: "m" + Date.now(), type: "notice", content, createdAt: time, createdBy: session.name }, ...(prev.messages || [])].slice(0, 100) }));
      document.getElementById("mp-content").value = "";
      alert("✅ 공지가 등록되었습니다.");
    } else {
      const target = msgType === "target" ? document.getElementById("mp-target")?.value : "전체";
      setSettings(prev => ({ ...prev, messages: [{ id: "m" + Date.now(), type: msgType, content, to: target, createdAt: time, createdBy: session.name }, ...(prev.messages || [])].slice(0, 100) }));
      if (settings.smsEnabled) {
        let contacts = [...(settings.smsManagers || []), ...(settings.smsStaff || [])];
        if (msgType === "target") {
          const acc = (accounts || []).find(a => a.id === target);
          const worker = (settings.workers || []).find(w => w.name === acc?.name);
          if (worker?.phone) contacts = [{ name: worker.name, phone: worker.phone }];
        }
        sendSolapi(settings, `[${settings.festivalName}] 📢\n\n${content}\n\n${time}`, contacts);
      }
      document.getElementById("mp-content").value = "";
      alert(`✅ ${msgType === "all" ? "전체" : target}에게 발송 완료`);
    }
  };

  return (<div style={{ minHeight: "100vh", background: "#0d1117", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 20px" }}>📢 메시지 / 공지</h2>
    <div style={{ maxWidth: 600, margin: "0 auto" }}>

      {/* 발송 유형 */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[{ id: "all", icon: "📣", label: "전체 메시지", desc: "전 요원 SMS" }, { id: "target", icon: "👤", label: "계정별 지정", desc: "특정 대상" }, { id: "notice", icon: "📢", label: "공지 등록", desc: "대시보드 고정" }].map(t => (
            <button key={t.id} onClick={() => setMsgType(t.id)} style={{ padding: "14px 8px", borderRadius: 12, border: msgType === t.id ? "2px solid #2196F3" : "1px solid #333", background: msgType === t.id ? "rgba(33,150,243,0.1)" : "transparent", color: msgType === t.id ? "#2196F3" : "#8892b0", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>{t.label}<div style={{ fontSize: 9, color: "#556", marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>

        {msgType === "target" && <div style={{ marginBottom: 12 }}>
          <Label>수신 대상</Label>
          <select id="mp-target" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
            {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name} ({a.id}) — {ROLES[a.role]?.label}</option>)}
          </select>
        </div>}

        <div style={{ marginBottom: 12 }}>
          <Label>{msgType === "notice" ? "공지 내용" : "메시지 내용"}</Label>
          <textarea id="mp-content" rows={4} placeholder={msgType === "notice" ? "대시보드 상단에 표시될 공지사항..." : "전송할 메시지 내용..."} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>

        <button onClick={doSend} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: msgType === "notice" ? "linear-gradient(135deg,#9C27B0,#7B1FA2)" : msgType === "target" ? "linear-gradient(135deg,#FF9800,#E65100)" : "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {msgType === "notice" ? "📢 공지 등록" : msgType === "target" ? "👤 지정 발송" : "📣 전체 발송"}
        </button>
      </Card>

      {/* 현재 공지 */}
      {(settings.notices || []).length > 0 && <Card>
        <h3 style={{ color: "#9C27B0", fontSize: 15, margin: "0 0 10px" }}>📢 현재 공지 ({settings.notices.length}건)</h3>
        {settings.notices.map(n => (
          <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "rgba(156,39,176,0.05)", borderRadius: 8, marginBottom: 4, border: "1px solid rgba(156,39,176,0.1)" }}>
            <span style={{ color: "#ccd6f6", fontSize: 12, flex: 1, whiteSpace: "pre-wrap" }}>{n.content}</span>
            <span style={{ color: "#556", fontSize: 9, flexShrink: 0 }}>{n.createdBy}<br/>{n.createdAt}</span>
            <button onClick={() => setSettings(prev => ({ ...prev, notices: prev.notices.filter(x => x.id !== n.id) }))} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>삭제</button>
          </div>
        ))}
      </Card>}

      {/* 발송 이력 */}
      <Card>
        <h3 style={{ color: "#8892b0", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>
        {(settings.messages || []).length === 0 ? <p style={{ color: "#445", fontSize: 12 }}>이력 없음</p> : <div style={{ maxHeight: 250, overflow: "auto" }}>
          {(settings.messages || []).slice(0, 30).map(m => (
            <div key={m.id} style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}>
              <span style={{ padding: "2px 8px", borderRadius: 10, background: m.type === "notice" ? "rgba(156,39,176,0.15)" : m.type === "target" ? "rgba(255,152,0,0.15)" : "rgba(33,150,243,0.15)", color: m.type === "notice" ? "#9C27B0" : m.type === "target" ? "#FF9800" : "#2196F3", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{m.type === "notice" ? "공지" : m.type === "target" ? "지정" : "전체"}</span>
              <span style={{ color: "#999", flex: 1 }}>{m.content.slice(0, 40)}{m.content.length > 40 ? "..." : ""}</span>
              {m.to && m.type === "target" && <span style={{ color: "#FF9800", fontSize: 9 }}>→{m.to}</span>}
              <span style={{ color: "#445", fontSize: 9, flexShrink: 0 }}>{m.createdAt}</span>
            </div>
          ))}
        </div>}
      </Card>
    </div>
  </div>);
}

// ─── Inbox Page (받은 메시지) ────────────────────────────────────
function InboxPage({ settings, session }) {
  const myMessages = (settings.messages || []).filter(m => m.type === "all" || m.type === "notice" || (m.type === "target" && m.to === session.id));
  const [readIds, setReadIds] = useState(() => JSON.parse(sessionStorage.getItem("read_msgs") || "[]"));

  const markRead = (id) => {
    if (!readIds.includes(id)) {
      const next = [...readIds, id];
      setReadIds(next);
      sessionStorage.setItem("read_msgs", JSON.stringify(next));
    }
  };
  const markAllRead = () => {
    const next = myMessages.map(m => m.id);
    setReadIds(next);
    sessionStorage.setItem("read_msgs", JSON.stringify(next));
  };

  return (<div style={{ minHeight: "100vh", background: "#0d1117", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>💬 받은 메시지</h2>
    <p style={{ color: "#8892b0", fontSize: 12, textAlign: "center", margin: "0 0 20px" }}>{session.name} ({ROLES[session.role]?.label})</p>
    <div style={{ maxWidth: 600, margin: "0 auto" }}>

      {myMessages.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={markAllRead} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 11, cursor: "pointer" }}>전체 읽음 처리</button>
      </div>}

      {myMessages.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
        <p style={{ fontSize: 14 }}>받은 메시지가 없습니다</p>
      </div>}

      {myMessages.map(m => {
        const isRead = readIds.includes(m.id);
        return (
          <div key={m.id} onClick={() => markRead(m.id)} style={{ padding: "14px 16px", borderRadius: 12, background: isRead ? "rgba(255,255,255,0.02)" : "rgba(33,150,243,0.06)", border: isRead ? "1px solid #1a1a2e" : "1.5px solid rgba(33,150,243,0.2)", marginBottom: 8, cursor: "pointer", transition: "all .2s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ padding: "2px 8px", borderRadius: 10, background: m.type === "notice" ? "rgba(156,39,176,0.15)" : m.type === "target" ? "rgba(255,152,0,0.15)" : "rgba(33,150,243,0.15)", color: m.type === "notice" ? "#9C27B0" : m.type === "target" ? "#FF9800" : "#2196F3", fontSize: 9, fontWeight: 700 }}>{m.type === "notice" ? "📢 공지" : m.type === "target" ? "👤 개인" : "📣 전체"}</span>
              {!isRead && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#2196F3", flexShrink: 0 }} />}
              <span style={{ color: "#445", fontSize: 9, marginLeft: "auto" }}>{m.createdAt}</span>
            </div>
            <div style={{ color: isRead ? "#999" : "#ccd6f6", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
            {m.createdBy && <div style={{ color: "#556", fontSize: 10, marginTop: 6 }}>발신: {m.createdBy}</div>}
          </div>
        );
      })}
    </div>
  </div>);
}

// ─── CMS Page ────────────────────────────────────────────────────
function CMSPage({ categories, setCategories, settings, setSettings, alerts, setAlerts, smsLog, initialTab, initialCatId, extraTabs, onExtraTab, userRole, accounts, setAccounts, onDataReset }) {
  const [tab, setTab] = useState(initialTab || "monitor");
  const [focusCat, setFocusCat] = useState(initialCatId || null);
  const [nc, setNc] = useState({ name: "", phone: "" });
  const [locLoading, setLocLoading] = useState(false);
  const [apiTestResult, setApiTestResult] = useState({});
  const [kmaTestResult, setKmaTestResult] = useState(null);
  const [newCat, setNewCat] = useState({ name: "", unit: "", source: "manual", icon: "📊", apiInterval: 10, thresholds: { BLUE: [0, 100], YELLOW: [100, 200], ORANGE: [200, 300], RED: [300, Infinity] }, currentValue: 0, actionItems: ["점검"], alertMessages: { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "경보" }, apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] });

  useEffect(() => { if (initialTab) setTab(initialTab); if (initialCatId) setFocusCat(initialCatId); }, [initialTab, initialCatId]);

  const upVal = (id, v) => setCategories(p => p.map(c => c.id === id ? { ...c, currentValue: parseFloat(v) || 0, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
  const upThr = (id, lk, i, v) => setCategories(p => p.map(c => { if (c.id !== id) return c; const t = { ...c.thresholds }; t[lk] = [...t[lk]]; t[lk][i] = v === "∞" || v === "Infinity" ? Infinity : parseFloat(v) || 0; return { ...c, thresholds: t }; }));
  const upMsg = (id, lk, m) => setCategories(p => p.map(c => c.id === id ? { ...c, alertMessages: { ...(c.alertMessages || {}), [lk]: m } } : c));
  const upApiCfg = (id, key, val) => setCategories(p => p.map(c => c.id === id ? { ...c, apiConfig: { ...(c.apiConfig || {}), [key]: val } } : c));

  const testCustomApi = async (cat) => {
    const cfg = cat.apiConfig; if (!cfg?.url) { setApiTestResult(p => ({ ...p, [cat.id]: { ok: false, msg: "URL 미입력" } })); return; }
    const loc = settings.location || {};
    const url = cfg.url.replace(/{lat}/g, loc.lat).replace(/{lon}/g, loc.lon);
    try {
      const hdrs = { "Content-Type": "application/json" }; if (cfg.headers) { try { Object.assign(hdrs, JSON.parse(cfg.headers)); } catch { } }
      const res = await fetch(url, { method: cfg.method || "GET", headers: hdrs });
      const json = await res.json();
      const val = cfg.responsePath ? getByPath(json, cfg.responsePath) : json;
      setApiTestResult(p => ({ ...p, [cat.id]: { ok: true, msg: `응답: ${JSON.stringify(val).slice(0, 150)}` } }));
    } catch (e) { setApiTestResult(p => ({ ...p, [cat.id]: { ok: false, msg: e.message } })); }
  };

  const testKmaApi = async () => {
    const kma = settings.kma || {};
    if (!kma.serviceKey) { setKmaTestResult({ ok: false, msg: "인증키 미입력" }); return; }
    const { nx, ny, bd, bt } = getKmaParams(settings);
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(kma.serviceKey)}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${bd}&base_time=${bt}&nx=${nx}&ny=${ny}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      const items = json?.response?.body?.items?.item;
      if (items && items.length > 0) {
        const summary = items.map(i => `${i.category}: ${i.obsrValue}`).join(", ");
        setKmaTestResult({ ok: true, msg: `✅ ${items.length}개 항목 수신\n${summary}\n\nbase_date=${bd}, base_time=${bt}, nx=${nx}, ny=${ny}`, items });
      } else {
        const errMsg = json?.response?.header?.resultMsg || JSON.stringify(json).slice(0, 200);
        setKmaTestResult({ ok: false, msg: `응답 오류: ${errMsg}` });
      }
    } catch (e) {
      // 네트워크 차단 시 시뮬레이션 데이터로 테스트 결과 표시
      const simData = generateSimKmaData();
      const { nx, ny, bd, bt } = getKmaParams(settings);
      const simItems = Object.entries(simData).map(([k, v]) => ({ category: k, obsrValue: String(v) }));
      setKmaTestResult({
        ok: true, simulated: true,
        msg: `⚠️ API 직접 호출 불가 (${e.message})\n→ 시뮬레이션 데이터로 대체합니다.\n\n실제 배포 환경에서는 아래 URL로 호출됩니다:\napis.data.go.kr/.../getUltraSrtNcst\nbase_date=${bd}, base_time=${bt}, nx=${nx}, ny=${ny}`,
        items: simItems
      });
    }
  };

  const autoLocate = () => {
    setLocLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        let name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`); const j = await r.json(); name = j.address?.city || j.address?.town || j.address?.county || name; } catch { }
        setSettings({ ...settings, location: { lat, lon, name, mode: "auto" } }); setLocLoading(false);
      }, () => { setLocLoading(false); alert("위치 권한 거부됨"); });
    } else { setLocLoading(false); }
  };

  const catForFocus = focusCat ? categories.find(c => c.id === focusCat) : null;
  const loc = settings.location || {};
  const grid = latLonToGrid(loc.lat || 35.18, loc.lon || 128.11);
  const kma = settings.kma || {};

  const ft = settings.features || {};
  const baseTabs = [
    { id: "monitor", label: "📊 현황" }, { id: "manual", label: "✏️ 데이터입력" },
    ft.weather !== false && { id: "kma", label: "🌤️ 기상청" },
    ft.customApi !== false && { id: "apiconfig", label: "🔌 커스텀API" },
    { id: "thresholds", label: "⚙️ 기준값" }, { id: "alertmsg", label: "💬 알림메시지" },
    ft.sms !== false && { id: "sms", label: "📱 SMS" },
    { id: "zones", label: "🗺️ 구역" }, { id: "workers", label: "👷 근무자" },
    ft.parking !== false && { id: "parking", label: "🅿️ 주차장" },
    ft.shuttle !== false && { id: "shuttlecms", label: "🚌 셔틀" },
    ft.crowd !== false && { id: "crowdcms", label: "👥 인파관리" },
    { id: "custom", label: "➕ 항목" },
    { id: "settings", label: "🔧 설정" }, { id: "alerts", label: `🔔 이력(${alerts.length})` },
  ].filter(Boolean);
  const tabs = [...baseTabs, ...(extraTabs || [])];

  return (<div style={{ minHeight: "100vh", background: "#0d1117", padding: "20px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 14px" }}>🛡️ {settings.festivalName} 관리</h2>
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", marginBottom: 18 }}>
      {tabs.map(t => <button key={t.id} onClick={() => { if ((extraTabs||[]).find(et => et.id === t.id)) { onExtraTab?.(t.id); return; } setTab(t.id); if (t.id !== "apiconfig") setFocusCat(null); }} style={{ padding: "6px 10px", borderRadius: 8, border: tab === t.id ? "1px solid #2196F3" : "1px solid #252525", background: tab === t.id ? "rgba(33,150,243,0.15)" : "transparent", color: tab === t.id ? "#2196F3" : "#556", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t.label}</button>)}
    </div>
    <div style={{ maxWidth: 800, margin: "0 auto" }}>

    {/* Monitor */}
    {tab === "monitor" && <div>{categories.map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id} style={{ border: `1px solid ${li.border}`, cursor: "pointer" }} onClick={() => { setTab(cat.kmaCategory ? "kma" : "apiconfig"); setFocusCat(cat.id); }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div><span style={{ fontSize: 18, marginRight: 6 }}>{cat.icon}</span><span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{cat.name}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: li.color, fontWeight: 800, fontSize: 22, fontFamily: "monospace" }}>{cat.currentValue.toLocaleString()}{cat.unit}</span><span style={{ padding: "3px 8px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 10, fontWeight: 700 }}>{li.label}</span></div>
      </div>
      <div style={{ marginTop: 4, color: "#445", fontSize: 10 }}>{cat.kmaCategory ? `🌤️기상청 ${cat.kmaCategory}` : cat.apiConfig?.enabled ? "🔌커스텀API" : "✏️수동"} | 클릭하여 설정 ›</div>
      <HistoryChart cat={cat} />
    </Card>); })}</div>}

    {/* ── KMA API Settings ── */}
    {tab === "kma" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🌤️ 기상청 초단기실황조회 API</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 16px" }}>공공데이터포털 VilageFcstInfoService_2.0 / getUltraSrtNcst</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>공공데이터포털 인증키 (ServiceKey)</Label><Input value={kma.serviceKey || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, serviceKey: e.target.value } })} placeholder="인증키를 입력하세요 (Decoding 키)" style={{ fontFamily: "monospace", fontSize: 12 }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label>수집 간격 (분)</Label><Input type="number" value={kma.interval || 10} onChange={e => setSettings({ ...settings, kma: { ...kma, interval: parseInt(e.target.value) || 10 } })} /></div>
            <div><Label>데이터 형식</Label><Input value="JSON" disabled style={{ color: "#556" }} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>📍 격자 좌표 (nx, ny)</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 12px" }}>축제 위치 좌표에서 자동 변환됩니다. 필요시 수동 입력도 가능합니다.</p>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 12 }}>
          <p style={{ color: "#8892b0", fontSize: 12, margin: 0 }}>📍 현재 위치: {loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)})<br />🔄 자동 변환 격자: <strong style={{ color: "#4CAF50" }}>nx={grid.nx}, ny={grid.ny}</strong></p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><Label>nx 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nxOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nxOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.nx}`} /></div>
          <div><Label>ny 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nyOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nyOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.ny}`} /></div>
        </div>
        <p style={{ color: "#445", fontSize: 10, margin: 0 }}>적용 격자: nx={kma.nxOverride || grid.nx}, ny={kma.nyOverride || grid.ny}</p>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🔗 항목별 기상청 카테고리 매핑</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 12px" }}>각 모니터링 항목에 기상청 응답 카테고리를 연결합니다.</p>
        {categories.map(cat => (
          <div key={cat.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            <span style={{ color: "#ccd6f6", fontSize: 13, minWidth: 100 }}>{cat.icon} {cat.name}</span>
            <select value={cat.kmaCategory || ""} onChange={e => setCategories(p => p.map(c => c.id === cat.id ? { ...c, kmaCategory: e.target.value } : c))} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
              <option value="">매핑 안함 (수동/커스텀API)</option>
              {Object.entries(KMA_CODES).map(([code, info]) => <option key={code} value={code}>{code} — {info.name} ({info.unit})</option>)}
            </select>
          </div>))}
      </Card>

      <Card>
        <Toggle on={kma.enabled || false} onToggle={() => setSettings({ ...settings, kma: { ...kma, enabled: !kma.enabled } })} labelOn="기상청 API 연동 활성" labelOff="기상청 API 비활성" />
      </Card>

      <button onClick={testKmaApi} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#FF9800,#F57C00)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, boxShadow: "0 4px 16px rgba(255,152,0,0.3)" }}>🧪 기상청 API 테스트 호출</button>
      {kmaTestResult && <Card style={{ border: `1px solid ${kmaTestResult.ok ? "rgba(76,175,80,0.3)" : "rgba(244,67,54,0.3)"}`, background: kmaTestResult.ok ? "rgba(76,175,80,0.06)" : "rgba(244,67,54,0.06)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: kmaTestResult.ok ? "#4CAF50" : "#F44336", fontSize: 14, fontWeight: 700 }}>{kmaTestResult.ok ? "✅ 성공" : "❌ 실패"}</span>
          {kmaTestResult.simulated && <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.3)", color: "#FF9800", fontSize: 10, fontWeight: 700 }}>시뮬레이션</span>}
        </div>
        <pre style={{ color: "#aaa", fontSize: 11, margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>{kmaTestResult.msg}</pre>
        {kmaTestResult.items && <div style={{ marginTop: 12, borderTop: "1px solid #222", paddingTop: 10 }}>
          <p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 6px", fontWeight: 700 }}>수신 데이터:</p>
          {kmaTestResult.items.map((item, i) => (<div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ color: "#4CAF50", fontSize: 12, fontWeight: 700, minWidth: 40 }}>{item.category}</span>
            <span style={{ color: "#ccd6f6", fontSize: 12, fontFamily: "monospace" }}>{item.obsrValue}</span>
            <span style={{ color: "#556", fontSize: 11 }}>{KMA_CODES[item.category]?.name || ""} ({KMA_CODES[item.category]?.unit || ""})</span>
          </div>))}
        </div>}
      </Card>}

      <Card style={{ background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.15)" }}>
        <p style={{ color: "#FFC107", fontSize: 11, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API 파라미터 안내</strong><br />
          • <strong>EndPoint:</strong> apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst<br />
          • <strong>base_date:</strong> 자동 (오늘 날짜 YYYYMMDD)<br />
          • <strong>base_time:</strong> 자동 (매시 정각 발표, 10분 이후 호출 가능)<br />
          • <strong>nx, ny:</strong> 위치 좌표에서 자동 변환 (또는 수동 지정)<br />
          • <strong>응답 카테고리:</strong> T1H(기온), RN1(강수량), WSD(풍속), REH(습도), PTY(강수형태), VEC(풍향)
        </p>
      </Card>
    </div>}

    {/* ── Custom API Config ── */}
    {tab === "apiconfig" && <div>
      <div style={{ padding: 10, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 14 }}>
        <p style={{ color: "#8892b0", fontSize: 11, margin: 0 }}>🔌 기상청 외 커스텀 API를 설정합니다. URL에 <code style={{ color: "#4CAF50" }}>{"{lat}"}</code>, <code style={{ color: "#4CAF50" }}>{"{lon}"}</code> 사용 가능.</p>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
        {categories.map(cat => <button key={cat.id} onClick={() => setFocusCat(cat.id)} style={{ padding: "6px 12px", borderRadius: 8, border: focusCat === cat.id ? "1px solid #2196F3" : "1px solid #252525", background: focusCat === cat.id ? "rgba(33,150,243,0.15)" : "transparent", color: focusCat === cat.id ? "#2196F3" : "#667", fontSize: 11, cursor: "pointer" }}>{cat.icon}{cat.name}</button>)}
      </div>
      {catForFocus && <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 14px" }}>{catForFocus.icon} {catForFocus.name} 커스텀 API</h3>
        {catForFocus.kmaCategory && <div style={{ padding: 8, borderRadius: 8, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)", marginBottom: 12 }}><p style={{ color: "#4CAF50", fontSize: 11, margin: 0 }}>🌤️ 이 항목은 기상청 API ({catForFocus.kmaCategory})에 매핑되어 있습니다. 커스텀 API를 활성화하면 기상청 대신 커스텀 API가 사용됩니다.</p></div>}
        <div style={{ display: "grid", gap: 10 }}>
          <div><Label>API URL</Label><Input value={catForFocus.apiConfig?.url || ""} onChange={e => upApiCfg(catForFocus.id, "url", e.target.value)} placeholder="https://api.example.com/data?lat={lat}" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>Method</Label><select value={catForFocus.apiConfig?.method || "GET"} onChange={e => upApiCfg(catForFocus.id, "method", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}><option value="GET">GET</option><option value="POST">POST</option></select></div>
            <div><Label>간격(분)</Label><Input type="number" value={catForFocus.apiInterval || 10} onChange={e => setCategories(p => p.map(c => c.id === catForFocus.id ? { ...c, apiInterval: parseInt(e.target.value) || 10 } : c))} /></div>
          </div>
          <div><Label>Headers (JSON)</Label><Input value={catForFocus.apiConfig?.headers || ""} onChange={e => upApiCfg(catForFocus.id, "headers", e.target.value)} placeholder='{"Authorization":"Bearer xxx"}' /></div>
          <div><Label>응답 경로 (JSON Path)</Label><Input value={catForFocus.apiConfig?.responsePath || ""} onChange={e => upApiCfg(catForFocus.id, "responsePath", e.target.value)} placeholder="data.value" /></div>
          <Toggle on={catForFocus.apiConfig?.enabled || false} onToggle={() => upApiCfg(catForFocus.id, "enabled", !catForFocus.apiConfig?.enabled)} labelOn="커스텀 API 활성" labelOff="비활성" />
          <button onClick={() => testCustomApi(catForFocus)} style={{ padding: "10px", borderRadius: 8, border: "none", background: "#FF9800", color: "#fff", fontWeight: 700, cursor: "pointer" }}>🧪 테스트</button>
          {apiTestResult[catForFocus.id] && <div style={{ padding: 10, borderRadius: 8, background: apiTestResult[catForFocus.id].ok ? "rgba(76,175,80,0.08)" : "rgba(244,67,54,0.08)", border: `1px solid ${apiTestResult[catForFocus.id].ok ? "#4CAF5044" : "#F4433644"}` }}><span style={{ color: apiTestResult[catForFocus.id].ok ? "#4CAF50" : "#F44336", fontSize: 12 }}>{apiTestResult[catForFocus.id].ok ? "✅" : "❌"} {apiTestResult[catForFocus.id].msg}</span></div>}
        </div></Card>}
    </div>}

    {/* Operating */}
    {/* Thresholds */}
    {tab === "thresholds" && <div>{categories.map(cat => (<Card key={cat.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: 0 }}>{cat.icon} {cat.name} ({cat.unit})</h3><button onClick={() => { if (confirm("삭제?")) setCategories(p => p.filter(c => c.id !== cat.id)); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 6 }}>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ padding: 8, borderRadius: 8, background: lv.bg, border: `1px solid ${lv.border}` }}><div style={{ color: lv.color, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{lv.label}</div><div style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="number" value={cat.thresholds[lk]?.[0] ?? 0} onChange={e => upThr(cat.id, lk, 0, e.target.value)} style={{ width: 55, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 11 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={cat.thresholds[lk]?.[1] === Infinity ? "∞" : cat.thresholds[lk]?.[1] ?? 0} onChange={e => upThr(cat.id, lk, 1, e.target.value)} style={{ width: 55, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 11 }} /></div></div>))}</div></Card>))}</div>}

    {/* Manual */}
    {tab === "manual" && <div>
      {categories.filter(c => c.source === "manual" || !c.kmaCategory).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 140, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>{cat.unit}</span><span style={{ padding: "4px 10px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 11, fontWeight: 700 }}>{li.icon} {li.label}</span></div></Card>); })}
      <Card style={{ background: "rgba(33,150,243,0.03)", border: "1px solid rgba(33,150,243,0.12)" }}><p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 10px" }}>🔄 API 항목 비상 수동 입력</p>
        {categories.filter(c => c.kmaCategory || c.apiConfig?.enabled).map(cat => (<div key={cat.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}><span style={{ color: "#ccd6f6", fontSize: 12, minWidth: 70 }}>{cat.icon}{cat.name}</span><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 100, fontSize: 13 }} /><span style={{ color: "#555", fontSize: 11 }}>{cat.unit}</span></div>))}</Card></div>}

    {/* Alert messages */}
    {tab === "alertmsg" && <div>{categories.map(cat => (<Card key={cat.id}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ marginBottom: 8 }}><Label><span style={{ color: lv.color }}>{lv.icon}{lv.label}</span></Label><textarea value={cat.alertMessages?.[lk] || ""} onChange={e => upMsg(cat.id, lk, e.target.value)} rows={2} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${lv.border}`, background: "#111", color: "#ddd", fontSize: 12, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>))}</Card>))}</div>}

    {/* SMS */}
    {tab === "sms" && <div>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 12px" }}>📱 Solapi SMS 설정</h3><div style={{ display: "grid", gap: 10 }}>
        <div><Label>API Key</Label><Input value={settings.solapiApiKey} onChange={e => setSettings({ ...settings, solapiApiKey: e.target.value })} placeholder="NCSA..." /></div>
        <div><Label>API Secret</Label><Input value={settings.solapiApiSecret} onChange={e => setSettings({ ...settings, solapiApiSecret: e.target.value })} placeholder="API Secret 입력" /></div>
        <div><Label>발신번호 (사전 등록 필요)</Label><Input type="tel" value={settings.solapiSender} onChange={e => setSettings({ ...settings, solapiSender: e.target.value })} placeholder="01012345678" /></div>
        <div><Label>경계이상 반복 발송 간격(분)</Label><Input type="number" value={settings.smsIntervalMin} onChange={e => setSettings({ ...settings, smsIntervalMin: parseInt(e.target.value) || 30 })} style={{ width: 100 }} /></div>
        <Toggle on={settings.smsEnabled} onToggle={() => setSettings({ ...settings, smsEnabled: !settings.smsEnabled })} labelOn="SMS 활성" labelOff="비활성" />

        {/* 테스트 발송 */}
        <div style={{ borderTop: "1px solid #222", paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Input id="sms-test-phone" placeholder="테스트 수신번호" style={{ flex: 1 }} />
            <button onClick={async () => {
              const phone = document.getElementById("sms-test-phone")?.value;
              if (!phone) { alert("수신번호를 입력하세요."); return; }
              if (!settings.solapiApiKey || !settings.solapiApiSecret || !settings.solapiSender) { alert("API Key, Secret, 발신번호를 먼저 입력하세요."); return; }
              const result = await sendSolapi(settings, `[축제 안전관리시스템] 테스트 메시지입니다.\n발송시간: ${new Date().toLocaleString("ko-KR")}`, [{ name: "테스트", phone }]);
              alert(result.success ? "✅ 테스트 발송 성공!" : "❌ 발송 실패. API Key/Secret/발신번호를 확인하세요.");
            }} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#4CAF50", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📩 테스트 발송</button>
          </div>
        </div>
      </div></Card>

      {/* 안전관리책임자 */}
      <Card>
        <h3 style={{ color: "#F44336", fontSize: 15, margin: "0 0 4px" }}>🔴 안전관리책임자</h3>
        <p style={{ color: "#556", fontSize: 10, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsManagers || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(244,67,54,0.05)", borderRadius: 6, border: "1px solid rgba(244,67,54,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 11, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsManagers: settings.smsManagers.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsManagers: [...(settings.smsManagers || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#F44336", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      {/* 안전요원 */}
      <Card>
        <h3 style={{ color: "#FF9800", fontSize: 15, margin: "0 0 4px" }}>🟠 안전요원</h3>
        <p style={{ color: "#556", fontSize: 10, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsStaff || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(255,152,0,0.05)", borderRadius: 6, border: "1px solid rgba(255,152,0,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 11, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsStaff: settings.smsStaff.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsStaff: [...(settings.smsStaff || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#FF9800", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>{(!smsLog || !smsLog.length) ? <p style={{ color: "#445", fontSize: 12 }}>없음</p> : <div style={{ maxHeight: 200, overflow: "auto" }}>{smsLog.map((l, i) => (<div key={i} style={{ padding: "5px 8px", borderBottom: "1px solid #1a1a2e", fontSize: 11 }}><span style={{ color: l.success ? "#4CAF50" : "#F44336" }}>{l.success ? "✅" : "❌"}</span> <span style={{ color: "#555" }}>{l.time}</span><div style={{ color: "#777", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.preview}</div></div>))}</div>}</Card>
    </div>}

    {/* Zone Management */}
    {tab === "zones" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🗺️ 구역 설정</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>구역을 추가하고 담당 계정을 지정하면, 해당 계수원이 로그인 시 자동으로 배정된 구역이 선택됩니다.</p>
        {(settings.zones || []).map((z, i) => (
          <div key={z.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid #222" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#2196F3", fontWeight: 700, fontSize: 14 }}>📍 {z.name || `구역 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>구역명</Label><Input value={z.name} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, name: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="A구역" /></div>
              <div><Label>구역범위</Label><Input value={z.range} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, range: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="동문~남문" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Label>담당자 이름</Label><Input value={z.assignee} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, assignee: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="홍길동" /></div>
              <div><Label>담당 계정</Label>
                <select value={z.accountId || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, accountId: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                  <option value="">미지정</option>
                  {(accounts || []).filter(a => a.role === "counter" || a.role === "admin" || a.role === "manager").map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select>
              </div>
            </div>
            {z.accountId && <div style={{ marginTop: 6, padding: "4px 8px", borderRadius: 6, background: "rgba(76,175,80,0.06)" }}>
              <span style={{ color: "#4CAF50", fontSize: 10 }}>✅ {z.accountId} 계정이 로그인하면 이 구역이 자동 선택됩니다</span>
            </div>}
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, zones: [...(settings.zones || []), { id: "z" + Date.now(), name: "", range: "", assignee: "", accountId: "", count: 0 }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 구역 추가</button>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#2196F3", fontSize: 11, margin: 0, lineHeight: 1.7 }}>ℹ️ 담당 계정을 지정하면 해당 계수원이 로그인 시 자동으로 배정 구역이 선택됩니다. 구역별 인원 합계가 전체 인파관리 수치로 집계됩니다.</p>
      </Card>
    </div>}

    {/* Workers Management */}
    {tab === "workers" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>👷 안전관리 근무자 명단</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>등록된 근무자는 조치사항 작성 시 담당자로 지정할 수 있습니다.</p>
        {(settings.workers || []).map((w, i) => (
          <div key={w.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: `1px solid ${w.role === "manager" ? "rgba(244,67,54,0.2)" : "rgba(255,152,0,0.15)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 10, background: w.role === "manager" ? "rgba(244,67,54,0.15)" : "rgba(255,152,0,0.15)", color: w.role === "manager" ? "#F44336" : "#FF9800", fontSize: 10, fontWeight: 700 }}>{w.role === "manager" ? "🔴 책임자" : "🟠 요원"}</span>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{w.name || "이름 미입력"}</span>
              </div>
              <button onClick={() => setSettings({ ...settings, workers: settings.workers.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>이름</Label><Input value={w.name} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, name: e.target.value }; setSettings({ ...settings, workers: ws }); }} placeholder="홍길동" /></div>
              <div><Label>역할</Label><select value={w.role} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, role: e.target.value }; setSettings({ ...settings, workers: ws }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                <option value="manager">안전관리 책임자</option>
                <option value="staff">안전요원</option>
              </select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>연락처</Label><Input type="tel" value={w.phone || ""} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, phone: e.target.value }; setSettings({ ...settings, workers: ws }); }} placeholder="01012345678" /></div>
              <div><Label>근무위치</Label><Input value={w.position || ""} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, position: e.target.value }; setSettings({ ...settings, workers: ws }); }} placeholder="A구역 동문 입구" /></div>
            </div>
            <div><Label>임무</Label><Input value={w.duty || ""} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, duty: e.target.value }; setSettings({ ...settings, workers: ws }); }} placeholder="동문 출입 통제 및 인파 계수" /></div>
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, workers: [...(settings.workers || []), { id: "w" + Date.now(), name: "", role: "staff", phone: "", position: "", duty: "" }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 근무자 추가</button>
      </Card>
      {(settings.workers || []).length > 0 && <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>📋 근무자 현황</h3>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 1fr 1fr", gap: 6, padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6 }}>
            <span style={{ color: "#556", fontSize: 10, fontWeight: 700 }}>역할</span>
            <span style={{ color: "#556", fontSize: 10, fontWeight: 700 }}>이름</span>
            <span style={{ color: "#556", fontSize: 10, fontWeight: 700 }}>연락처</span>
            <span style={{ color: "#556", fontSize: 10, fontWeight: 700 }}>근무위치</span>
            <span style={{ color: "#556", fontSize: 10, fontWeight: 700 }}>임무</span>
          </div>
          {(settings.workers || []).map(w => (
            <div key={w.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 1fr 1fr", gap: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
              <span style={{ color: w.role === "manager" ? "#F44336" : "#FF9800", fontSize: 10, fontWeight: 700 }}>{w.role === "manager" ? "책임자" : "요원"}</span>
              <span style={{ color: "#ccd6f6", fontSize: 11 }}>{w.name}</span>
              <span style={{ color: "#8892b0", fontSize: 10, fontFamily: "monospace" }}>{w.phone}</span>
              <span style={{ color: "#8892b0", fontSize: 10 }}>{w.position || "-"}</span>
              <span style={{ color: "#8892b0", fontSize: 10 }}>{w.duty || "-"}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
          <span style={{ color: "#556", fontSize: 11 }}>책임자 {(settings.workers||[]).filter(w=>w.role==="manager").length}명 | 요원 {(settings.workers||[]).filter(w=>w.role==="staff").length}명 | 총 {(settings.workers||[]).length}명</span>
        </div>
      </Card>}
    </div>}

    {/* Parking Lot Management */}
    {tab === "parking" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🅿️ 주차장 관리</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>주차장을 등록하고, 계정관리에서 주차요원 계정을 생성한 뒤 주차장을 배정하세요.</p>
        {(settings.parkingLots || []).map((lot, i) => (
          <div key={lot.id} style={{ padding: 14, background: "rgba(156,39,176,0.04)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(156,39,176,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#9C27B0", fontWeight: 700, fontSize: 14 }}>🅿️ {lot.name || `주차장 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, parkingLots: settings.parkingLots.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>주차장 이름</Label><Input value={lot.name} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, name: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="제1주차장" /></div>
              <div><Label>가능 대수</Label><Input type="number" value={lot.capacity || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, capacity: parseInt(e.target.value) || 0 }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="200" /></div>
            </div>
            <div style={{ marginBottom: 8 }}><Label>주차장 주소</Label><Input value={lot.address || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, address: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="주소 입력" /></div>
            <div><Label>담당 주차요원 (계정 ID)</Label><Input value={lot.assigneeId || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, assigneeId: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="parking1" /></div>
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, parkingLots: [...(settings.parkingLots || []), { id: "pk" + Date.now(), name: "", address: "", capacity: 100, current: 0, assigneeId: "" }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #9C27B0", background: "transparent", color: "#9C27B0", fontSize: 13, cursor: "pointer" }}>+ 주차장 추가</button>
      </Card>
      {(settings.parkingLots || []).length > 0 && <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>📋 주차장 현황</h3>
        {(settings.parkingLots || []).map(lot => {
          const remain = lot.capacity - (lot.current || 0);
          const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
          return <div key={lot.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 4 }}>
            <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700, minWidth: 80 }}>{lot.name}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? "#F44336" : pct >= 70 ? "#FF9800" : "#4CAF50", borderRadius: 3, transition: "width .5s" }} />
            </div>
            <span style={{ color: "#8892b0", fontSize: 11, fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>{lot.current || 0}/{lot.capacity}</span>
            <span style={{ color: remain <= 0 ? "#F44336" : "#4CAF50", fontSize: 10, fontWeight: 700, minWidth: 45 }}>{remain <= 0 ? "만차" : `잔여${remain}`}</span>
          </div>;
        })}
      </Card>}
      <Card style={{ background: "rgba(156,39,176,0.04)", border: "1px solid rgba(156,39,176,0.12)" }}>
        <p style={{ color: "#9C27B0", fontSize: 11, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>주차요원 계정 만들기</strong><br/>
          1. 👤 계정관리 탭에서 계정 추가 (권한: 주차요원)<br/>
          2. 여기서 주차장의 "담당 주차요원" 칸에 해당 계정 ID 입력<br/>
          3. 주차요원이 로그인하면 배정된 주차장 관리 화면이 표시됩니다
        </p>
      </Card>
    </div>}

    {/* Shuttle Bus Management */}
    {tab === "shuttlecms" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📍 셔틀버스 정류장</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>정류장을 순서대로 등록하세요. 셔틀요원이 정류장 도착 시 버튼을 눌러 위치를 업데이트합니다.</p>
        {(settings.shuttleStops || []).sort((a,b) => (a.order||0)-(b.order||0)).map((stop, i) => (
          <div key={stop.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,188,212,0.04)", borderRadius: 8, marginBottom: 4, border: "1px solid rgba(0,188,212,0.1)" }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: "#00BCD4", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i+1}</span>
            <Input value={stop.name} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, name: e.target.value}; setSettings({...settings, shuttleStops: ss}); }} placeholder="정류장명" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }} />
            <Input type="number" value={stop.order||i+1} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, order: parseInt(e.target.value)||0}; setSettings({...settings, shuttleStops: ss}); }} style={{ width: 50, padding: "8px", fontSize: 12, textAlign: "center" }} />
            <button onClick={() => setSettings({...settings, shuttleStops: (settings.shuttleStops||[]).filter(s=>s.id!==stop.id)})} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>✕</button>
          </div>
        ))}
        <button onClick={() => { const ord = (settings.shuttleStops||[]).length + 1; setSettings({...settings, shuttleStops: [...(settings.shuttleStops||[]), {id: "st"+Date.now(), name: "", order: ord}]}); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #00BCD4", background: "transparent", color: "#00BCD4", fontSize: 13, cursor: "pointer", marginTop: 8 }}>+ 정류장 추가</button>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🚌 셔틀버스 배차</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>버스를 등록하고, 계정관리에서 셔틀요원 계정을 만든 뒤 담당자를 배정하세요.</p>
        {(settings.shuttleBuses || []).map((bus, i) => (
          <div key={bus.id} style={{ padding: 14, background: "rgba(0,188,212,0.03)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(0,188,212,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#00BCD4", fontWeight: 700, fontSize: 14 }}>🚌 {bus.name || `버스 ${i+1}`}</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {bus.status && <span style={{ padding: "2px 8px", borderRadius: 10, background: bus.status==="running"?"rgba(76,175,80,0.15)":bus.status==="stopped"?"rgba(255,152,0,0.15)":"rgba(244,67,54,0.15)", color: bus.status==="running"?"#4CAF50":bus.status==="stopped"?"#FF9800":"#F44336", fontSize: 9, fontWeight: 700 }}>{bus.status==="running"?"운행중":bus.status==="stopped"?"대기":"종료"}</span>}
                <button onClick={() => setSettings({...settings, shuttleBuses: settings.shuttleBuses.filter((_,j)=>j!==i)})} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>버스명</Label><Input value={bus.name||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,name:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="1호차" /></div>
              <div><Label>노선명</Label><Input value={bus.route||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,route:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="축제장↔주차장" /></div>
              <div><Label>정원 (인승)</Label><select value={bus.capacity||45} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,capacity:parseInt(e.target.value)}; setSettings({...settings,shuttleBuses:bs}); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                <option value={25}>25인승</option>
                <option value={45}>45인승</option>
              </select></div>
            </div>
            <div><Label>담당 셔틀요원 (계정 ID)</Label><Input value={bus.assigneeId||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,assigneeId:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="shuttle1" /></div>
            {bus.currentStopName && <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(0,188,212,0.06)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#00BCD4", fontSize: 11 }}>📍 {bus.currentStopName} ({bus.lastUpdated||""})</span>
              <span style={{ color: (bus.passengers||0)>=(bus.capacity||45)?"#F44336":"#4CAF50", fontSize: 11, fontWeight: 700 }}>👥 {bus.passengers||0}/{bus.capacity||45}</span>
            </div>}
          </div>
        ))}
        <button onClick={() => setSettings({...settings, shuttleBuses: [...(settings.shuttleBuses||[]), {id: "bus"+Date.now(), name: "", route: "", capacity: 45, passengers: 0, assigneeId: "", currentStopId: "", currentStopName: "", status: "off", lastUpdated: ""}]})} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #00BCD4", background: "transparent", color: "#00BCD4", fontSize: 13, cursor: "pointer" }}>+ 버스 추가</button>
      </Card>

      <Card style={{ background: "rgba(0,188,212,0.04)", border: "1px solid rgba(0,188,212,0.12)" }}>
        <p style={{ color: "#00BCD4", fontSize: 11, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>셔틀요원 계정 만들기</strong><br/>
          1. 👤 계정관리에서 계정 추가 (권한: 셔틀요원)<br/>
          2. 여기서 버스의 "담당 셔틀요원" 칸에 해당 계정 ID 입력<br/>
          3. 셔틀요원이 로그인하면 배정된 버스 관리 화면이 표시됩니다<br/>
          4. 정류장 도착 시 해당 정류장 버튼을 누르면 위치가 실시간 업데이트됩니다
        </p>
      </Card>
    </div>}

    {/* Custom Category */}
    {/* 인파관리 CMS */}
    {tab === "crowdcms" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>👥 인파 현황</h3>
        {(() => {
          const crowd = categories.find(c => c.id === "crowd");
          const crowdData = JSON.parse(localStorage.getItem("_crowd") || "{}");
          const curVal = crowd?.currentValue || 0;
          const cumVal = crowdData.cumulative || 0;
          const zoneData = crowdData.zones || [];
          return (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.15)" }}>
                <div style={{ color: "#8892b0", fontSize: 11 }}>🏃 체류 인원</div>
                <div style={{ color: "#4CAF50", fontSize: 32, fontWeight: 900, fontFamily: "monospace" }}>{curVal.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                <div style={{ color: "#8892b0", fontSize: 11 }}>📊 누적 방문</div>
                <div style={{ color: "#2196F3", fontSize: 32, fontWeight: 900, fontFamily: "monospace" }}>{cumVal.toLocaleString()}</div>
              </div>
            </div>

            {/* 누적 수동 조정 */}
            <h4 style={{ color: "#ccd6f6", fontSize: 13, margin: "0 0 8px" }}>🔧 누적 방문객 수동 조정</h4>
            <p style={{ color: "#556", fontSize: 11, margin: "0 0 10px" }}>오차 보정이나 초기값 설정 시 사용합니다.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Input id="cum-adj" type="number" placeholder="숫자 입력 (예: 5000)" style={{ flex: 1 }} />
              <button onClick={() => { const v = parseInt(document.getElementById("cum-adj")?.value); if (!isNaN(v) && v >= 0) { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = v; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, v, cd.zones || [], "admin"); document.getElementById("cum-adj").value = ""; alert(`✅ 누적 방문객이 ${v.toLocaleString()}명으로 설정되었습니다.`); } else { alert("0 이상의 숫자를 입력하세요."); } }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>설정</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button onClick={() => { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = 0; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, 0, cd.zones || [], "admin"); alert("✅ 누적 초기화 완료"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 12, cursor: "pointer" }}>누적만 초기화 (0명)</button>
              <button onClick={() => { const cd = { total: 0, cumulative: 0, zones: (crowdData.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })) }; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(0, 0, cd.zones, "admin"); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0 } : c)); alert("✅ 전체 초기화 완료 (체류 + 누적)"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 12, cursor: "pointer" }}>전체 초기화</button>
            </div>

            {/* 체류 수동 조정 */}
            <h4 style={{ color: "#ccd6f6", fontSize: 13, margin: "0 0 8px" }}>🔧 체류 인원 수동 조정</h4>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Input id="cur-adj" type="number" placeholder="현재 체류 인원 직접 설정" style={{ flex: 1 }} />
              <button onClick={() => { const v = parseInt(document.getElementById("cur-adj")?.value); if (!isNaN(v) && v >= 0) { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.total = v; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(v, cd.cumulative || 0, cd.zones || [], "admin"); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: v } : c)); document.getElementById("cur-adj").value = ""; alert(`✅ 체류 인원이 ${v.toLocaleString()}명으로 설정되었습니다.`); } }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#4CAF50", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>설정</button>
            </div>

            {/* 구역별 누적 현황 */}
            {zoneData.filter(z => z.name).length > 0 && <>
              <h4 style={{ color: "#ccd6f6", fontSize: 13, margin: "0 0 8px" }}>🗺️ 구역별 현황</h4>
              <div style={{ display: "grid", gap: 4, marginBottom: 16 }}>
                {zoneData.filter(z => z.name).map(z => (
                  <div key={z.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                    <span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{z.name}</span>
                    <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 800, fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>체류 {(z.count || 0).toLocaleString()}</span>
                    <span style={{ color: "#2196F3", fontSize: 12, fontWeight: 700, fontFamily: "monospace", minWidth: 70, textAlign: "right", marginLeft: 8 }}>누적 {(z.cumulative || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>}
          </>);
        })()}
      </Card>

      {/* 시간별 추이 그래프 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📈 시간별 추이</h3>
        {(() => {
          const hLog = settings.hourlyLog || [];
          if (hLog.length < 2) return <p style={{ color: "#556", fontSize: 12, textAlign: "center", padding: 20 }}>데이터가 2건 이상 기록되면 그래프가 표시됩니다.<br/>(5분 간격 자동 기록)</p>;
          const chartData = hLog.slice(-60).map(h => ({ time: h.time, 체류: h.current || 0, 누적: h.cumulative || 0 }));
          return (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#556", fontSize: 10 }} width={45} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="체류" stroke="#4CAF50" strokeWidth={2} dot={false} name="🏃 체류" />
                <Line type="monotone" dataKey="누적" stroke="#2196F3" strokeWidth={2} dot={false} name="📊 누적" />
              </LineChart>
            </ResponsiveContainer>
          );
        })()}
      </Card>

      {/* 일자별 기록 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📅 일자별 기록</h3>
        {(settings.dailyRecords || []).length === 0 ? <p style={{ color: "#556", fontSize: 12, textAlign: "center", padding: 20 }}>인파계수 → 📊 데이터 관리 → 📋 금일 데이터 저장으로 기록합니다.</p> : <>
          {(() => {
            const dRecs = settings.dailyRecords || [];
            const chartData = dRecs.map(r => ({ date: r.date, 누적방문: r.cumulative || 0, 최대체류: r.peakCurrent || 0 }));
            return chartData.length >= 2 ? (
              <div style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fill: "#556", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 10 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="누적방문" stroke="#2196F3" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="최대체류" stroke="#FF9800" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null;
          })()}
          <div style={{ display: "grid", gap: 4 }}>
            {(settings.dailyRecords || []).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{r.date}</span>
                <span style={{ color: "#2196F3", fontSize: 12, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                <span style={{ color: "#FF9800", fontSize: 11 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>}
      </Card>
    </div>}

    {tab === "custom" && <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 14px" }}>➕ 항목 추가</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "항목명", k: "name" }, { l: "단위", k: "unit" }, { l: "아이콘", k: "icon" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={newCat[f.k]} onChange={e => setNewCat({ ...newCat, [f.k]: e.target.value })} /></div>))}<div><Label>기상청 카테고리</Label><select value={newCat.kmaCategory || ""} onChange={e => setNewCat({ ...newCat, kmaCategory: e.target.value })} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff" }}><option value="">없음</option>{Object.entries(KMA_CODES).map(([code, info]) => <option key={code} value={code}>{code} — {info.name}</option>)}</select></div>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: lv.color, fontSize: 11, fontWeight: 700, minWidth: 36 }}>{lv.label}</span><input type="number" value={newCat.thresholds[lk][0]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [parseFloat(e.target.value) || 0, t[lk][1]]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={newCat.thresholds[lk][1] === Infinity ? "∞" : newCat.thresholds[lk][1]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [t[lk][0], e.target.value === "∞" ? Infinity : parseFloat(e.target.value) || 0]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12 }} /></div>))}<button onClick={() => { if (!newCat.name) return; setCategories(p => [...p, { ...newCat, id: "c_" + Date.now(), source: newCat.kmaCategory ? "api" : "manual" }]); }} style={{ padding: "12px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>추가</button></div></Card>}

    {/* Settings */}
    {tab === "settings" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>🕐 운영 시간 및 모드</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><Label>시작 시간</Label><Input type="time" value={settings.operatingStart} onChange={e => setSettings({ ...settings, operatingStart: e.target.value })} /></div>
          <div><Label>종료 시간</Label><Input type="time" value={settings.operatingEnd} onChange={e => setSettings({ ...settings, operatingEnd: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <Toggle on={settings.is24HourMode} onToggle={() => setSettings({ ...settings, is24HourMode: !settings.is24HourMode })} labelOn="🔒 24시간 감시 활성" labelOff="설정 시간 운영" />
          {settings.is24HourMode && <button onClick={() => setSettings({ ...settings, is24HourMode: false })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>끄기</button>}
        </div>
      </Card>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🔌 기능 관리</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>사용하지 않는 기능을 끄면 해당 메뉴와 대시보드 영역이 숨겨집니다.</p>
        {[
          { k: "crowd", icon: "👥", label: "인파관리", desc: "인파 계수, 구역별 카운트, 누적 방문객" },
          { k: "parking", icon: "🅿️", label: "주차관리", desc: "주차장 입출차 현황, 주차요원 배정" },
          { k: "shuttle", icon: "🚌", label: "셔틀버스", desc: "셔틀 위치, 탑승인원, 정류장 관리" },
          { k: "weather", icon: "🌤️", label: "기상청 연동", desc: "실시간 기상 데이터 자동 수집" },
          { k: "sms", icon: "📱", label: "SMS 알림", desc: "경보 발생 시 문자 자동 발송" },
          { k: "message", icon: "💬", label: "메시지/공지", desc: "내부 메시지 발송 및 공지 등록" },
          { k: "customApi", icon: "🔌", label: "커스텀 API", desc: "외부 API 데이터 연동" },
        ].map(f => {
          const on = settings.features?.[f.k] !== false;
          return (<div key={f.k} onClick={() => setSettings({ ...settings, features: { ...(settings.features || {}), [f.k]: !on } })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: on ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.01)", borderRadius: 10, marginBottom: 6, cursor: "pointer", border: `1px solid ${on ? "rgba(76,175,80,0.12)" : "#1a1a2e"}`, transition: "all .2s" }}>
            <div style={{ width: 40, height: 22, borderRadius: 11, background: on ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: on ? 20 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ fontSize: 18 }}>{f.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: on ? "#ccd6f6" : "#556", fontSize: 13, fontWeight: 700 }}>{f.label}</div>
              <div style={{ color: "#445", fontSize: 10 }}>{f.desc}</div>
            </div>
            <span style={{ color: on ? "#4CAF50" : "#F44336", fontSize: 10, fontWeight: 700 }}>{on ? "ON" : "OFF"}</span>
          </div>);
        })}
      </Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>🔧 축제 기본정보</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "축제명", k: "festivalName" }, { l: "부제목", k: "festivalSubtitle" }, { l: "관리기관", k: "organization" }, { l: "연락처", k: "contactNumber" }, { l: "로고", k: "logoEmoji" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={settings[f.k]} onChange={e => setSettings({ ...settings, [f.k]: e.target.value })} /></div>))}</div></Card>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📅 축제 일자</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 12px" }}>축제 운영 일자를 등록하세요. 일일 마감 시 일자별 데이터가 저장됩니다.</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <Input type="date" id="fest-date-add" style={{ flex: 1 }} />
          <button onClick={() => { const d = document.getElementById("fest-date-add")?.value; if (d && !(settings.festivalDates || []).includes(d)) setSettings({ ...settings, festivalDates: [...(settings.festivalDates || []), d].sort() }); }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(settings.festivalDates || []).map(d => {
            const dt = new Date(d); const label = `${dt.getMonth()+1}/${dt.getDate()}`;
            const isToday = d === new Date().toISOString().slice(0, 10);
            return <span key={d} onClick={() => setSettings({ ...settings, festivalDates: (settings.festivalDates || []).filter(x => x !== d) })} style={{ padding: "6px 12px", borderRadius: 8, background: isToday ? "rgba(76,175,80,0.12)" : "rgba(33,150,243,0.1)", border: isToday ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(33,150,243,0.15)", color: isToday ? "#4CAF50" : "#2196F3", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{label}{isToday ? " (오늘)" : ""} ✕</span>;
          })}
        </div>
        {(settings.dailyRecords || []).length > 0 && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📋 저장된 일자별 데이터</div>
          {(settings.dailyRecords || []).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
              <span style={{ color: "#ccd6f6", fontSize: 12 }}>{r.date}</span>
              <span style={{ color: "#2196F3", fontSize: 12, fontWeight: 700 }}>누적 {(r.cumulative || 0).toLocaleString()}명</span>
              <span style={{ color: "#4CAF50", fontSize: 11 }}>최대체류 {(r.peakCurrent || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>}
      </Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📍 위치</h3><div style={{ display: "flex", gap: 8, marginBottom: 14 }}><button onClick={autoLocate} disabled={locLoading} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: loc.mode === "auto" ? "#4CAF50" : "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: locLoading ? .6 : 1 }}>{locLoading ? "📡 확인 중..." : "📡 자동 위치"}</button><button onClick={() => setSettings({ ...settings, location: { ...loc, mode: "manual" } })} style={{ flex: 1, padding: "12px", borderRadius: 8, border: loc.mode === "manual" ? "1px solid #FF9800" : "1px solid #333", background: loc.mode === "manual" ? "rgba(255,152,0,0.1)" : "transparent", color: loc.mode === "manual" ? "#FF9800" : "#8892b0", fontWeight: 700, cursor: "pointer" }}>✏️ 수동</button></div><div style={{ display: "grid", gap: 10 }}><div><Label>위치명</Label><Input value={loc.name || ""} onChange={e => setSettings({ ...settings, location: { ...loc, name: e.target.value, mode: "manual" } })} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div><Label>위도</Label><Input type="number" step="0.0001" value={loc.lat || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lat: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div><div><Label>경도</Label><Input type="number" step="0.0001" value={loc.lon || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lon: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div></div></div><div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}><p style={{ color: "#445", fontSize: 10, margin: 0 }}>📍{loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)}) — {loc.mode === "auto" ? "자동" : "수동"} | 격자: nx={grid.nx}, ny={grid.ny}</p></div></Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 6px" }}>📐 순면적</h3><div style={{ marginBottom: 12 }}><Label>면적 (㎡)</Label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input type="number" value={settings.venueArea} onChange={e => setSettings({ ...settings, venueArea: parseFloat(e.target.value) || 0 })} style={{ width: 150, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>㎡</span><span style={{ color: "#445", fontSize: 10 }}>({(settings.venueArea * .3025).toFixed(0)}평)</span></div></div><button onClick={() => { const t = calcCrowdThr(settings.venueArea); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, thresholds: t } : c)); alert("✅ 인파 기준 적용"); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 인파 기준 자동 적용</button></Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📊 대시보드 표시 항목</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>대시보드에 표시할 모니터링 항목을 선택합니다.</p>

        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔴 주요 모니터링 항목</div>
          {categories.filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id)).map(cat => {
            const vis = settings.dashboardVisible?.[cat.id] !== false;
            return <div key={cat.id} onClick={() => setSettings({ ...settings, dashboardVisible: { ...(settings.dashboardVisible || {}), [cat.id]: !vis } })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: vis ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: `1px solid ${vis ? "rgba(76,175,80,0.15)" : "#1a1a2e"}` }}>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: vis ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: vis ? 18 : 2, transition: "all .3s" }} />
              </div>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <span style={{ color: vis ? "#ccd6f6" : "#556", fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
              <span style={{ color: "#445", fontSize: 10, marginLeft: "auto" }}>{cat.unit}</span>
            </div>;
          })}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🌤️ 기상 참고정보</div>
          {categories.filter(c => EXCLUDE_FROM_OVERALL.includes(c.id)).map(cat => {
            const vis = settings.dashboardVisible?.[cat.id] !== false;
            return <div key={cat.id} onClick={() => setSettings({ ...settings, dashboardVisible: { ...(settings.dashboardVisible || {}), [cat.id]: !vis } })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: vis ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: `1px solid ${vis ? "rgba(76,175,80,0.15)" : "#1a1a2e"}` }}>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: vis ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: vis ? 18 : 2, transition: "all .3s" }} />
              </div>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <span style={{ color: vis ? "#ccd6f6" : "#556", fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
              <span style={{ color: "#445", fontSize: 10, marginLeft: "auto" }}>{cat.unit}</span>
            </div>;
          })}
        </div>

        <div>
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🅿️ 주차장</div>
          {(() => {
            const vis = settings.dashboardVisible?.parking !== false;
            return <div onClick={() => setSettings({ ...settings, dashboardVisible: { ...(settings.dashboardVisible || {}), parking: !vis } })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: vis ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, cursor: "pointer", border: `1px solid ${vis ? "rgba(76,175,80,0.15)" : "#1a1a2e"}` }}>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: vis ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: vis ? 18 : 2, transition: "all .3s" }} />
              </div>
              <span style={{ fontSize: 16 }}>🅿️</span>
              <span style={{ color: vis ? "#ccd6f6" : "#556", fontSize: 13, fontWeight: 600 }}>주차장 현황</span>
              <span style={{ color: "#445", fontSize: 10, marginLeft: "auto" }}>{(settings.parkingLots || []).length}개소</span>
            </div>;
          })()}
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>💾 설정 저장 / 불러오기</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>축제 설정 전체를 파일로 저장하고 다시 불러올 수 있습니다.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <button onClick={() => {
            const data = { version: 2, exportedAt: new Date().toISOString(), festivalName: settings.festivalName, settings, categories, accounts: accounts || [] };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url;
            a.download = `${settings.festivalName || "festival"}_설정_${new Date().toISOString().slice(0,10)}.json`;
            a.click(); URL.revokeObjectURL(url);
          }} style={{ padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            📥 설정 다운로드
          </button>
          <button onClick={() => document.getElementById("settings-upload").click()} style={{ padding: "14px", borderRadius: 10, border: "1.5px solid #FF9800", background: "rgba(255,152,0,0.08)", color: "#FF9800", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            📤 설정 불러오기
          </button>
        </div>
        <input id="settings-upload" type="file" accept=".json" style={{ display: "none" }} onChange={(e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target.result);
              if (!data.settings) { alert("❌ 올바른 설정 파일이 아닙니다."); return; }
              if (confirm(`"${data.festivalName || data.settings.festivalName}" 설정을 불러오시겠습니까?\n현재 설정이 덮어씌워집니다.`)) {
                setSettings(data.settings);
                if (data.categories) setCategories(data.categories);
                if (data.accounts && setAccounts) setAccounts(data.accounts);
                alert("✅ 설정을 불러왔습니다!");
              }
            } catch { alert("❌ 파일을 읽을 수 없습니다."); }
          };
          reader.readAsText(file); e.target.value = "";
        }} />
        <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a2e" }}>
          <span style={{ color: "#556", fontSize: 10, lineHeight: 1.7 }}>저장 항목: 축제명, 운영시간, 위치, 순면적, 기상청API, SMS, 구역, 근무자, 주차장, 계정정보, 모니터링항목, 대시보드 표시설정</span>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#F44336", fontSize: 16, margin: "0 0 4px" }}>🔄 데이터 초기화</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>운영 중 수동 입력된 데이터를 항목별로 초기화합니다. 설정은 유지됩니다.</p>
        <div style={{ display: "grid", gap: 8 }}>

          <button onClick={() => { if (confirm("인파관리 데이터를 초기화하시겠습니까?\n현재 인원수가 0으로 리셋됩니다.")) { setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null } : c)); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })) })); if (window.crowdDB) window.crowdDB.set(0, 0, (settings.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })), "reset"); onDataReset?.(); alert("✅ 인파관리 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            👥 인파관리 초기화 <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>전체 인원 + 구역별 인원 → 0</span>
          </button>

          <button onClick={() => { if (confirm("주차장 현황을 초기화하시겠습니까?\n모든 주차장의 현재 대수가 0으로 리셋됩니다.")) { setSettings(prev => ({ ...prev, parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })) })); onDataReset?.(); alert("✅ 주차장 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🅿️ 주차장 초기화 <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>모든 주차장 현재 대수 → 0</span>
          </button>

          <button onClick={() => { if (confirm("메시지 및 공지를 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, messages: [], notices: [] })); alert("✅ 메시지/공지 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            💬 메시지/공지 초기화 <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>발송이력 + 대시보드 공지 삭제</span>
          </button>

          <button onClick={() => { if (confirm("알림 이력을 모두 삭제하시겠습니까?")) { setAlerts([]); alert("✅ 알림 이력 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🔔 알림 이력 초기화 <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>경보 알림 이력 전체 삭제</span>
          </button>

          <button onClick={() => { if (confirm("조치사항 이력을 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, resolvedHistory: [] })); setCategories(p => p.map(c => ({ ...c, actionStatus: null, actionReport: null }))); alert("✅ 조치사항 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            📋 조치사항 초기화 <span style={{ color: "#888", fontSize: 10, marginLeft: 8 }}>지시/조치 이력 + 진행상태 삭제</span>
          </button>

          <div style={{ borderTop: "1px solid #222", paddingTop: 10, marginTop: 4 }}>
            <button onClick={() => { if (confirm("⚠️ 모든 운영 데이터를 초기화하시겠습니까?\n\n인파, 주차장, 메시지, 알림, 조치사항이 모두 리셋됩니다.\n(설정/계정/구역/근무자/기상데이터는 유지)")) { setCategories(p => p.map(c => { if (c.id === "crowd") return { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null }; return { ...c, actionStatus: null, actionReport: null }; })); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })), parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })), messages: [], notices: [], resolvedHistory: [] })); setAlerts([]); if (window.crowdDB) window.crowdDB.set(0, 0, [], "reset"); onDataReset?.(); alert("✅ 전체 운영 데이터 초기화 완료\n(기상 실황/예보 데이터는 유지됩니다)"); }}} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "2px solid #F44336", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ⚠️ 전체 초기화 (운영 데이터 일괄 리셋)
            </button>
          </div>
        </div>
      </Card>
    </div>}
    {tab === "alerts" && <div>{alerts.length === 0 && <p style={{ color: "#445", textAlign: "center", padding: 20 }}>이력 없음</p>}{alerts.map((a, i) => { const li = LEVELS[a.level]; return (<div key={i} style={{ background: li.bg, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${li.border}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: li.color, fontWeight: 700, fontSize: 12 }}>{li.icon}{a.category}</span><span style={{ color: "#445", fontSize: 10 }}>{a.time}</span></div><pre style={{ color: "#bbb", fontSize: 11, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>{a.message}</pre></div>); })}{alerts.length > 0 && <button onClick={() => setAlerts([])} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 12, cursor: "pointer" }}>전체 삭제</button>}</div>}

    </div></div>);
}

// ─── KMA Simulation Fallback ─────────────────────────────────────
function generateSimKmaData() {
  const h = new Date().getHours();
  const baseTemp = h < 6 ? 18 : h < 12 ? 22 : h < 18 ? 28 : 23;
  return {
    T1H: Math.round((baseTemp + (Math.random() * 4 - 2)) * 10) / 10,
    RN1: Math.random() < 0.7 ? 0 : Math.round(Math.random() * 8 * 10) / 10,
    WSD: Math.round((1.5 + Math.random() * 6) * 10) / 10,
    REH: Math.round(45 + Math.random() * 40),
    UUU: Math.round((Math.random() * 4 - 2) * 10) / 10,
    VVV: Math.round((Math.random() * 4 - 2) * 10) / 10,
    VEC: Math.round(Math.random() * 360),
    PTY: 0,
  };
}

// ─── KMA API Fetcher ─────────────────────────────────────────────
function useKmaFetcher(categories, setCategories, settings, setSettings, active, refreshKey) {
  const timer = useRef(null);
  const kma = settings.kma || {};
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!active || !kma.enabled) return;
    const hasMapped = categories.some(c => c.kmaCategory && !c.apiConfig?.enabled);
    if (!hasMapped) return;

    const doFetch = async () => {
      let dataMap = null;
      let fcstData = null;
      let mode = "sim";

      if (kma.serviceKey) {
        // 1) 초단기실황 (getUltraSrtNcst)
        try {
          const { nx, ny, bd, bt } = getKmaParams(settings);
          const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${encodeURIComponent(kma.serviceKey)}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${bd}&base_time=${bt}&nx=${nx}&ny=${ny}`;
          const res = await fetch(url);
          const json = await res.json();
          const items = json?.response?.body?.items?.item;
          if (items && items.length > 0) {
            dataMap = {};
            items.forEach(i => { dataMap[i.category] = parseFloat(i.obsrValue) || 0; });
            mode = "live";
          }
        } catch {}

        // 2) 초단기예보 (getUltraSrtFcst) — 향후 6시간 예보
        try {
          const fp = getFcstParams(settings);
          const url2 = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${encodeURIComponent(kma.serviceKey)}&pageNo=1&numOfRows=60&dataType=JSON&base_date=${fp.bd}&base_time=${fp.bt}&nx=${fp.nx}&ny=${fp.ny}`;
          const res2 = await fetch(url2);
          const json2 = await res2.json();
          const items2 = json2?.response?.body?.items?.item;
          if (items2 && items2.length > 0) {
            fcstData = {};
            items2.forEach(i => {
              if (!fcstData[i.category]) fcstData[i.category] = [];
              fcstData[i.category].push({ time: `${i.fcstDate.slice(4,6)}/${i.fcstDate.slice(6)}  ${i.fcstTime.slice(0,2)}:${i.fcstTime.slice(2)}`, value: parseFloat(i.fcstValue) || 0 });
            });
          }
        } catch {}
      }

      // 실패 시 시뮬레이션
      if (!dataMap) { dataMap = generateSimKmaData(); mode = "sim"; }
      if (!fcstData) {
        fcstData = {};
        const simCats = ["T1H", "RN1", "WSD", "REH"];
        const now = new Date();
        simCats.forEach(cat => {
          fcstData[cat] = [];
          for (let i = 1; i <= 6; i++) {
            const t = new Date(now.getTime() + i * 3600000);
            const base = dataMap[cat] || 0;
            const v = cat === "T1H" ? base + (Math.random() * 3 - 1) : cat === "RN1" ? Math.max(0, base + (Math.random() * 2 - 1)) : base + (Math.random() * 2 - 1);
            fcstData[cat].push({ time: `${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:00`, value: Math.round(v * 10) / 10 });
          }
        });
      }

      setCategories(p => p.map(c => {
        if (c.kmaCategory && dataMap[c.kmaCategory] !== undefined && !c.apiConfig?.enabled) {
          return { ...c, currentValue: Math.round(dataMap[c.kmaCategory] * 10) / 10, lastUpdated: new Date().toLocaleTimeString("ko-KR"), forecast: fcstData[c.kmaCategory] || [], dataType: "실황" };
        }
        return c;
      }));
      setSettings(prev => ({ ...prev, kma: { ...prev.kma, lastFetch: new Date().toLocaleString("ko-KR"), mode } }));
      
    };
    doFetch();
    timer.current = setInterval(doFetch, (kma.interval || 10) * 60000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active, kma.enabled, kma.serviceKey, kma.interval, categories.map(c => c.kmaCategory).join(","), refreshKey]);
}

// ─── Custom API Fetcher ──────────────────────────────────────────
function useCustomApiFetcher(categories, setCategories, settings, active, refreshKey) {
  const timers = useRef({});
  const loc = settings.location || {};
  const key = categories.filter(c => c.apiConfig?.enabled).map(c => `${c.id}:${c.apiInterval}:${c.apiConfig?.url}`).join("|");
  useEffect(() => {
    Object.values(timers.current).forEach(clearInterval); timers.current = {};
    if (!active) return;
    categories.filter(c => c.apiConfig?.enabled && c.apiConfig?.url).forEach(cat => {
      const doFetch = async () => {
        try {
          const cfg = cat.apiConfig;
          const url = cfg.url.replace(/{lat}/g, loc.lat).replace(/{lon}/g, loc.lon);
          const hdrs = { "Content-Type": "application/json" }; if (cfg.headers) try { Object.assign(hdrs, JSON.parse(cfg.headers)); } catch { }
          const res = await fetch(url, { method: cfg.method || "GET", headers: hdrs });
          const json = await res.json();
          const val = cfg.responsePath ? getByPath(json, cfg.responsePath) : null;
          if (val !== null && typeof val === "number") setCategories(p => p.map(c => c.id === cat.id ? { ...c, currentValue: Math.round(val * 10) / 10, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
        } catch { }
      };
      doFetch();
      timers.current[cat.id] = setInterval(doFetch, (cat.apiInterval || 10) * 60000);
    });
    return () => Object.values(timers.current).forEach(clearInterval);
  }, [active, key, loc.lat, loc.lon, refreshKey]);
}

// ─── History Recorder (30min) ────────────────────────────────────
function useHistoryRecorder(categories, setCategories, active, refreshKey) {
  const lastRecord = useRef(0);
  // refreshKey 변경 시 (초기화 등) 즉시 기록 가능하도록 리셋
  useEffect(() => { lastRecord.current = 0; }, [refreshKey]);
  useEffect(() => {
    if (!active) return;
    const record = () => {
      const now = Date.now();
      if (now - lastRecord.current < 29 * 60000) return;
      lastRecord.current = now;
      setCategories(p => p.map(c => ({ ...c, history: [...(c.history || []).slice(-48), { time: fmtHM(new Date()), value: c.currentValue }] })));
    };
    record();
    const iv = setInterval(record, 60000);
    return () => clearInterval(iv);
  }, [active, refreshKey]);
}

// ─── Auth System ─────────────────────────────────────────────────
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return 'h' + Math.abs(h).toString(36);
}

const DEFAULT_ACCOUNTS = [
  { id: "admin", password: simpleHash("admin1234"), name: "관리자", role: "admin", festivalId: "default" },
  { id: "counter1", password: simpleHash("1234"), name: "계수원1", role: "counter", festivalId: "default" },
  { id: "viewer", password: simpleHash("view"), name: "상황실", role: "viewer", festivalId: "default" },
  { id: "parking1", password: simpleHash("1234"), name: "주차요원1", role: "parking", festivalId: "default", parkingLotId: "" },
  { id: "shuttle1", password: simpleHash("1234"), name: "셔틀요원1", role: "shuttle", festivalId: "default" },
];

const ROLES = {
  admin: { label: "관리자", color: "#F44336", pages: ["dashboard", "counter", "parking", "shuttle", "message", "inbox", "cms"], desc: "모든 기능 접근" },
  manager: { label: "운영자", color: "#FF9800", pages: ["dashboard", "counter", "parking", "shuttle", "message", "inbox", "cms"], desc: "설정 변경 가능 (계정관리 제외)" },
  counter: { label: "계수원", color: "#4CAF50", pages: ["counter", "dashboard", "inbox"], desc: "인파 계수 + 대시보드 조회" },
  parking: { label: "주차요원", color: "#9C27B0", pages: ["parking", "dashboard", "inbox"], desc: "주차장 관리 + 대시보드 조회" },
  shuttle: { label: "셔틀요원", color: "#00BCD4", pages: ["shuttle", "dashboard", "inbox"], desc: "셔틀버스 위치 관리" },
  viewer: { label: "뷰어", color: "#2196F3", pages: ["dashboard", "inbox"], desc: "대시보드 조회만 가능" },
};

// ─── Login Page ──────────────────────────────────────────────────
function LoginPage({ onLogin, accounts }) {
  const [uid, setUid] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const handleLogin = () => {
    if (!uid || !pw) { setError("아이디와 비밀번호를 입력하세요."); return; }
    const acc = accounts.find(a => a.id === uid);
    if (!acc) { setError("존재하지 않는 아이디입니다."); return; }
    if (acc.password !== simpleHash(pw)) { setError("비밀번호가 일치하지 않습니다."); return; }
    onLogin(acc);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0a0a1a 0%,#0d1b2a 50%,#0a0a1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏮</div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 4px", letterSpacing: 2 }}>축제 안전관리시스템</h1>
          <p style={{ color: "#556", fontSize: 13 }}>축제 안전관리시스템</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 32, border: "1px solid #222" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "#8892b0", fontSize: 12, display: "block", marginBottom: 6 }}>아이디</label>
            <input value={uid} onChange={e => { setUid(e.target.value); setError(""); }} placeholder="아이디 입력"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: "#8892b0", fontSize: 12, display: "block", marginBottom: 6 }}>비밀번호</label>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setError(""); }}
                placeholder="비밀번호 입력" onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{ width: "100%", padding: "14px 48px 14px 16px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16, boxSizing: "border-box" }} />
              <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#556", fontSize: 18, cursor: "pointer" }}>
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.2)", marginBottom: 16 }}>
            <span style={{ color: "#F44336", fontSize: 13 }}>❌ {error}</span>
          </div>}
          <button onClick={handleLogin} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(33,150,243,0.3)" }}>
            로그인
          </button>
        </div>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ color: "#334", fontSize: 11, lineHeight: 1.8 }}>
            기본 계정 안내<br />
            <span style={{ color: "#556" }}>관리자: admin / admin1234</span><br />
            <span style={{ color: "#556" }}>계수원: counter1 / 1234</span><br />
            <span style={{ color: "#556" }}>상황실: viewer / view</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Account Manager (CMS sub-page) ─────────────────────────────
function AccountManager({ accounts, setAccounts, currentUser }) {
  const [newAcc, setNewAcc] = useState({ id: "", pw: "", name: "", role: "counter" });
  const [editPw, setEditPw] = useState({});

  const addAccount = () => {
    if (!newAcc.id || !newAcc.pw || !newAcc.name) return;
    if (accounts.find(a => a.id === newAcc.id)) { alert("이미 존재하는 아이디입니다."); return; }
    setAccounts([...accounts, { id: newAcc.id, password: simpleHash(newAcc.pw), name: newAcc.name, role: newAcc.role, festivalId: currentUser.festivalId }]);
    setNewAcc({ id: "", pw: "", name: "", role: "counter" });
  };

  const deleteAcc = (id) => {
    if (id === "admin") { alert("기본 관리자는 삭제할 수 없습니다."); return; }
    if (id === currentUser.id) { alert("현재 로그인된 계정은 삭제할 수 없습니다."); return; }
    if (confirm(`"${id}" 계정을 삭제하시겠습니까?`)) setAccounts(accounts.filter(a => a.id !== id));
  };

  const changePw = (id) => {
    const np = editPw[id];
    if (!np || np.length < 4) { alert("비밀번호는 4자 이상이어야 합니다."); return; }
    setAccounts(accounts.map(a => a.id === id ? { ...a, password: simpleHash(np) } : a));
    setEditPw({ ...editPw, [id]: "" });
    alert("비밀번호가 변경되었습니다.");
  };

  const changeRole = (id, role) => {
    if (id === "admin") return;
    setAccounts(accounts.map(a => a.id === id ? { ...a, role } : a));
  };

  return (
    <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>👤 계정 목록</h3>
        {accounts.map(acc => {
          const rl = ROLES[acc.role] || ROLES.viewer;
          return (
            <div key={acc.id} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 8, border: acc.id === currentUser.id ? "1px solid rgba(33,150,243,0.3)" : "1px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{acc.name}</span>
                  <span style={{ color: "#556", fontSize: 12 }}>({acc.id})</span>
                  <span style={{ padding: "2px 8px", borderRadius: 10, background: `${rl.color}22`, border: `1px solid ${rl.color}44`, color: rl.color, fontSize: 10, fontWeight: 700 }}>{rl.label}</span>
                  {acc.id === currentUser.id && <span style={{ color: "#2196F3", fontSize: 10 }}>← 현재</span>}
                </div>
                {acc.id !== "admin" && currentUser.role === "admin" && (
                  <button onClick={() => deleteAcc(acc.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {currentUser.role === "admin" && acc.id !== "admin" && (
                  <select value={acc.role} onChange={e => changeRole(acc.id, e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 11 }}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.desc}</option>)}
                  </select>
                )}
                <input type="password" placeholder="새 비밀번호" value={editPw[acc.id] || ""} onChange={e => setEditPw({ ...editPw, [acc.id]: e.target.value })}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12, width: 120 }} />
                <button onClick={() => changePw(acc.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#FF9800", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>변경</button>
              </div>
            </div>
          );
        })}
      </Card>
      {currentUser.role === "admin" && <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>➕ 계정 추가</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>아이디</Label><Input value={newAcc.id} onChange={e => setNewAcc({ ...newAcc, id: e.target.value })} placeholder="영문/숫자" /></div>
            <div><Label>이름</Label><Input value={newAcc.name} onChange={e => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="계수원2" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>비밀번호</Label><Input type="password" value={newAcc.pw} onChange={e => setNewAcc({ ...newAcc, pw: e.target.value })} placeholder="4자 이상" /></div>
            <div><Label>권한</Label>
              <select value={newAcc.role} onChange={e => setNewAcc({ ...newAcc, role: e.target.value })} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addAccount} style={{ padding: "12px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>계정 생성</button>
        </div>
      </Card>}
      <Card style={{ background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.15)" }}>
        <p style={{ color: "#FFC107", fontSize: 11, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>권한 안내</strong><br />
          • <strong style={{ color: ROLES.admin.color }}>관리자</strong>: 모든 기능 + 계정 관리<br />
          • <strong style={{ color: ROLES.manager.color }}>운영자</strong>: 대시보드 + CMS + 인파계수 (계정관리 제외)<br />
          • <strong style={{ color: ROLES.counter.color }}>계수원</strong>: 인파계수 + 대시보드 조회<br />
          • <strong style={{ color: ROLES.viewer.color }}>뷰어</strong>: 대시보드 조회만 가능
        </p>
      </Card>
    </div>
  );
}

// ─── Main App with Auth ──────────────────────────────────────────
export default function App() {
  const [fatalError, setFatalError] = useState(null);
  
  if (fatalError) {
    return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: "#F44336", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>앱 오류 발생</h2>
        <p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 16px" }}>{String(fatalError)}</p>
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "#F44336", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>🔄 초기화 후 재시작</button>
        <button onClick={() => setFatalError(null)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #333", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer" }}>다시 시도</button>
      </div>
    </div>);
  }

  try {
    return <AppMain onError={setFatalError} />;
  } catch (e) {
    return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>💥</div>
        <h2 style={{ color: "#F44336", fontSize: 18, margin: "8px 0" }}>렌더링 오류</h2>
        <p style={{ color: "#888", fontSize: 11 }}>{String(e)}</p>
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 10, border: "none", background: "#F44336", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 초기화</button>
      </div>
    </div>);
  }
}

function AppMain({ onError }) {
  const [accounts, setAccounts] = usePersist("fest_accounts_v1", DEFAULT_ACCOUNTS);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");

  // Restore session
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("fest_session");
      if (s) {
        const parsed = JSON.parse(s);
        const acc = accounts.find(a => a.id === parsed.id);
        if (acc) setSession(acc);
      }
    } catch {}
  }, []);

  const handleLogin = (acc) => {
    setSession(acc);
    sessionStorage.setItem("fest_session", JSON.stringify(acc));
    setPage(acc.role === "counter" ? "counter" : acc.role === "parking" ? "parking" : acc.role === "shuttle" ? "shuttle" : "dashboard");
  };

  const handleLogout = () => {
    setSession(null);
    sessionStorage.removeItem("fest_session");
  };

  if (!session) return <LoginPage onLogin={handleLogin} accounts={accounts} />;

  return <AuthenticatedApp session={session} accounts={accounts} setAccounts={setAccounts} onLogout={handleLogout} initialPage={page} setPage={setPage} />;
}

function AuthenticatedApp({ session, accounts, setAccounts, onLogout, initialPage, setPage: setPageExt }) {
  const [page, setPageInternal] = useState(initialPage);
  const setPage = (p) => { setPageInternal(p); setPageExt(p); };

  const fid = session.festivalId || "default";
  const [categories, setCategories] = usePersist(`${fid}_cat_v10`, DEFAULT_CATEGORIES);
  const [settings, setSettings] = usePersist(`${fid}_set_v10`, DEFAULT_SETTINGS);
  const [alerts, setAlerts] = usePersist(`${fid}_alr_v10`, []);
  const [smsLog, setSmsLog] = usePersist(`${fid}_sms_v10`, []);
  const [activeAlert, setActiveAlert] = useState(null);
  const [cmsTab, setCmsTab] = useState(null);
  const [cmsCatId, setCmsCatId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevLevels = useRef({}); const lastSms = useRef(0);

  const active = isActive(settings);
  const role = ROLES[session.role] || ROLES.viewer;
  const allowedPages = role.pages;

  const handleRefresh = () => setRefreshKey(k => k + 1);
  const handleAction = (catId, status) => {
    const cat = categories.find(c => c.id === catId);
    const newStatus = cat?.actionStatus === status ? null : status;
    // 조치중 시작 → 지시 시각 기록
    if (newStatus === "handling") {
      setCategories(p => p.map(c => c.id === catId ? { ...c, actionStatus: "handling", handlingStartedAt: new Date().toLocaleString("ko-KR"), handlingBy: session.name } : c));
    } else {
      setCategories(p => p.map(c => c.id === catId ? { ...c, actionStatus: newStatus } : c));
    }
    // 조치완료 시 알림 제거 + 이력 저장
    if (newStatus === "resolved" && cat) {
      setAlerts(p => p.filter(a => a.category !== cat.name));
      const record = {
        name: cat.name, icon: cat.icon,
        instruction: cat.actionReport?.content || "",
        instructedAt: cat.handlingStartedAt || "",
        instructedBy: cat.handlingBy || "",
        resolution: cat.actionReport?.content || "조치완료",
        assignee: cat.actionReport?.assigneeName || session.name,
        resolvedAt: new Date().toLocaleString("ko-KR")
      };
      setSettings(prev => ({ ...prev, resolvedHistory: [record, ...(prev.resolvedHistory || [])].slice(0, 50) }));
    }
    // SMS 발송
    if (newStatus && settings.smsEnabled && cat) {
      const lv = getLevel(cat); const li = LEVELS[lv];
      const statusLabel = newStatus === "handling" ? "🔧 조치중" : "✅ 조치완료";
      const sms = `[${settings.festivalName}] ${statusLabel}\n\n${cat.icon}${cat.name}: ${cat.currentValue}${cat.unit} (${li.label})\n상태: ${statusLabel}\n담당: ${session.name}\n시간: ${new Date().toLocaleString("ko-KR")}\n\n발신: ${settings.organization}`;
      const allContacts = [...(settings.smsManagers || []), ...(settings.smsStaff || [])];
      sendSolapi(settings, sms, allContacts).then(r => setSmsLog(p => [{ time: new Date().toLocaleString("ko-KR"), success: r.success, preview: `[${statusLabel}] ${cat.name} — ${sms.slice(0, 80)}...` }, ...p].slice(0, 50)));
    }
    
  };

  // 조치사항 저장
  const handleActionReport = (catId, report) => {
    setCategories(p => p.map(c => c.id === catId ? { ...c, actionReport: { ...report, createdAt: new Date().toLocaleString("ko-KR") } } : c));
    
  };

  // 정상(BLUE) 복귀 시 조치상태 + 알림 + 조치사항 자동 제거
  useEffect(() => {
    let changed = false;
    const newCats = categories.map(cat => {
      if (getLevel(cat) === "BLUE" && (cat.actionStatus || cat.actionReport)) { changed = true; return { ...cat, actionStatus: null, actionReport: null }; }
      return cat;
    });
    if (changed) {
      setCategories(newCats);
      const blueNames = categories.filter(c => getLevel(c) === "BLUE").map(c => c.name);
      setAlerts(p => p.filter(a => !blueNames.includes(a.category)));
    }
  }, [categories.map(c => getLevel(c)).join(",")]);


  useKmaFetcher(categories, setCategories, settings, setSettings, active, refreshKey);
  useCustomApiFetcher(categories, setCategories, settings, active, refreshKey);
  useHistoryRecorder(categories, setCategories, active, refreshKey);

  // ★ 인파관리 실시간 동기화 — Supabase 직접 읽기
  useEffect(() => {
    if (!window.crowdDB) return;

    const syncCrowd = async () => {
      try {
        const data = await window.crowdDB.get();
        if (data && data.total !== undefined) {
          setCategories(prev => {
            const cur = prev.find(c => c.id === "crowd");
            if (!cur || cur.currentValue === data.total) return prev;
            return prev.map(c => c.id === "crowd" ? { ...c, currentValue: data.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c);
          });
        }
      } catch {}
    };

    syncCrowd();
    const poll = setInterval(syncCrowd, 5000);

    const handler = (e) => {
      if (e.detail?.total !== undefined) {
        setCategories(prev => prev.map(c => c.id === "crowd" ? { ...c, currentValue: e.detail.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
      }
    };
    window.addEventListener("crowd-update", handler);

    return () => { clearInterval(poll); window.removeEventListener("crowd-update", handler); };
  }, []);

  // Alert + SMS (same as before)
  useEffect(() => {
    if (!active) return;
    const warnings = [];
    categories.forEach(cat => {
      const lv = getLevel(cat); const prev = prevLevels.current[cat.id];
      if ((lv === "ORANGE" || lv === "RED") && prev && prev !== lv) {
        const li = LEVELS[lv]; const time = new Date().toLocaleString("ko-KR");
        const msg = `⚠️ [${settings.festivalName} 긴급알림] ⚠️\n\n${cat.alertMessages?.[lv] || ""}\n\n${cat.name}: ${cat.currentValue.toLocaleString()}${cat.unit} (${li.label})\n\n점검:\n${(cat.actionItems || []).map(a => `• ${a}`).join("\n")}\n\n발신: ${settings.festivalName} 종합상황실\n시간: ${time}`;
        setAlerts(p => [{ category: cat.name, level: lv, message: msg, time }, ...p].slice(0, 100));
        setActiveAlert({ category: cat.name, level: lv, message: msg, time });
      }
      if (lv === "ORANGE" || lv === "RED") warnings.push(cat);
      prevLevels.current[cat.id] = lv;
    });
    if (settings.smsEnabled && warnings.length > 0) {
      const now = Date.now(); const gap = (settings.smsIntervalMin || 30) * 60000;
      if (now - lastSms.current >= gap) {
        lastSms.current = now;
        const lines = warnings.map(c => { const lv = getLevel(c); return `${LEVELS[lv].icon}${c.name}: ${c.currentValue}${c.unit} [${LEVELS[lv].label}]\n${c.alertMessages?.[lv] || ""}`; }).join("\n\n");
        const sms = `⚠️[${settings.festivalName}]⚠️\n\n${lines}\n\n📍${settings.location?.name}\n${new Date().toLocaleString("ko-KR")}\n${settings.organization}`;
        sendSolapi(settings, sms).then(r => setSmsLog(p => [{ time: new Date().toLocaleString("ko-KR"), success: r.success, preview: sms.slice(0, 120) + "..." }, ...p].slice(0, 50)));
      }
    }
  }, [categories, active]);

  useEffect(() => {
    if (!active || !settings.smsEnabled) return;
    const iv = setInterval(() => {
      const w = categories.filter(c => { const l = getLevel(c); return l === "ORANGE" || l === "RED"; });
      if (!w.length) return;
      if (Date.now() - lastSms.current < (settings.smsIntervalMin || 30) * 60000) return;
      lastSms.current = Date.now();
      const sms = `⚠️[${settings.festivalName}]⚠️\n${w.map(c => `${LEVELS[getLevel(c)].icon}${c.name}:${c.currentValue}${c.unit}`).join("\n")}\n${new Date().toLocaleString("ko-KR")}`;
      sendSolapi(settings, sms).then(r => setSmsLog(p => [{ time: new Date().toLocaleString("ko-KR"), success: r.success, preview: sms.slice(0, 100) + "..." }, ...p].slice(0, 50)));
    }, 60000);
    return () => clearInterval(iv);
  }, [active, settings.smsEnabled]);

  const onCardClick = (catId) => {
    if (!allowedPages.includes("cms")) return;
    const cat = categories.find(c => c.id === catId);
    setCmsTab(cat?.kmaCategory ? "kma" : "apiconfig");
    setCmsCatId(catId);
    setPage("cms");
  };

  // Build nav based on role
  // 내 메시지 (전체 + 나에게 지정된 메시지 + 공지)
  const myMessages = (settings.messages || []).filter(m => m.type === "all" || m.type === "notice" || (m.type === "target" && m.to === session.id));
  const readIds = JSON.parse(sessionStorage.getItem("read_msgs") || "[]");
  const unreadCount = myMessages.filter(m => !readIds.includes(m.id)).length;

  const ft = settings.features || {};
  const allNavs = [
    { id: "dashboard", icon: "📊", label: "대시보드" },
    ft.crowd !== false && { id: "counter", icon: "👥", label: "인파계수" },
    ft.parking !== false && { id: "parking", icon: "🅿️", label: "주차관리" },
    ft.shuttle !== false && { id: "shuttle", icon: "🚌", label: "셔틀버스" },
    ft.message !== false && { id: "inbox", icon: "💬", label: unreadCount > 0 ? `수신함(${unreadCount})` : "수신함" },
    ft.message !== false && { id: "message", icon: "📢", label: "발송" },
    { id: "cms", icon: "⚙️", label: "관리" },
  ].filter(Boolean);
  const navs = allNavs.filter(n => allowedPages.includes(n.id));

  // Inject account tab into CMS if admin
  const cmsExtraTabs = (session.role === "admin" || session.role === "manager")
    ? [{ id: "accounts", label: "👤 계정관리" }] : [];

  return (<div style={{ fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
    <style>{`@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    <AlertToast alert={activeAlert} onClose={() => setActiveAlert(null)} />

    {/* Top bar - user info */}
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1001, background: "rgba(10,10,26,0.95)", borderBottom: "1px solid #1a1a2e", padding: "6px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(10px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ padding: "2px 8px", borderRadius: 10, background: `${role.color}22`, border: `1px solid ${role.color}44`, color: role.color, fontSize: 10, fontWeight: 700 }}>{role.label}</span>
        <span style={{ color: "#8892b0", fontSize: 12 }}>{session.name}</span>
      </div>
      <button onClick={onLogout} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#556", fontSize: 11, cursor: "pointer" }}>로그아웃</button>
    </div>

    {/* Bottom nav */}
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000, background: "rgba(10,10,26,0.95)", borderTop: "1px solid #222", display: "flex", justifyContent: "center", backdropFilter: "blur(10px)" }}>
      {navs.map(n => <button key={n.id} onClick={() => { setPage(n.id); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ flex: 1, maxWidth: 130, padding: "12px 0 10px", border: "none", background: "none", color: page === n.id ? "#2196F3" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
        <span style={{ fontSize: 20 }}>{n.icon}</span><span style={{ fontSize: 10, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span>
        {n.id === "inbox" && unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: "calc(50% - 18px)", width: 16, height: 16, borderRadius: 8, background: "#F44336", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>)}
    </nav>

    {/* Content */}
    <div style={{ paddingTop: 36, paddingBottom: 70 }}>
      {page === "dashboard" && (active ? <Dashboard categories={categories} settings={settings} onCardClick={onCardClick} onRefresh={handleRefresh} alerts={alerts} onAction={handleAction} onActionReport={handleActionReport} onDeleteAlert={(idx) => { if (idx === "all") setAlerts([]); else setAlerts(p => p.filter((_, i) => i !== idx)); }} onDeleteNotice={(nid) => setSettings(prev => ({ ...prev, notices: (prev.notices || []).filter(n => n.id !== nid) }))} userRole={session.role} /> : <InactiveOverlay settings={settings} />)}
      {page === "counter" && <CounterPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} session={session} />}
      {page === "parking" && <ParkingPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "shuttle" && <ShuttlePage settings={settings} setSettings={setSettings} session={session} />}
      {page === "message" && <MessagePage settings={settings} setSettings={setSettings} accounts={accounts} session={session} />}
      {page === "inbox" && <InboxPage settings={settings} session={session} />}
      {page === "cms" && cmsTab === "accounts" ? (
        <div style={{ minHeight: "100vh", background: "#0d1117", padding: "20px 16px" }}>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 14px" }}>👤 계정 관리</h2>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <button onClick={() => setCmsTab(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>← CMS로 돌아가기</button>
          </div>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <AccountManager accounts={accounts} setAccounts={setAccounts} currentUser={session} />
          </div>
        </div>
      ) : page === "cms" && (
        <CMSPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} alerts={alerts} setAlerts={setAlerts} smsLog={smsLog} initialTab={cmsTab} initialCatId={cmsCatId} extraTabs={cmsExtraTabs} onExtraTab={(id) => setCmsTab(id)} userRole={session.role} accounts={accounts} setAccounts={setAccounts} onDataReset={() => setRefreshKey(k => k + 1)} />
      )}
    </div>
  </div>);
}
