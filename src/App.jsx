import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── Constants ───────────────────────────────────────────────────
const LEVELS = {
  BLUE: { label: "정상", color: "#2196F3", bg: "rgba(33,150,243,0.12)", border: "rgba(33,150,243,0.3)", icon: "✅" },
  YELLOW: { label: "주의", color: "#FFC107", bg: "rgba(255,193,7,0.12)", border: "rgba(255,193,7,0.3)", icon: "⚡" },
  ORANGE: { label: "경계", color: "#FF9800", bg: "rgba(255,152,0,0.15)", border: "rgba(255,152,0,0.4)", icon: "⚠️" },
  RED: { label: "심각", color: "#F44336", bg: "rgba(244,67,54,0.15)", border: "rgba(244,67,54,0.4)", icon: "🚨" },
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
    currentValue: 5200, actionItems: ["주위 관객 안전상황 점검", "출입구 통제 강화", "비상대응팀 대기", "대피경로 확보"],
    alertMessages: { BLUE: "인파 정상", YELLOW: "인파 증가, 유입 통제 검토", ORANGE: "⚠️ 인파 경계! 출입구 통제", RED: "🚨 인파 심각! 유입 차단" },
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
  { id: "dam", name: "남강댐 방류량", unit: "㎥/s", source: "manual", icon: "🌊", apiInterval: 30,
    thresholds: { BLUE: [0, 500], YELLOW: [500, 1000], ORANGE: [1000, 2000], RED: [2000, Infinity] },
    currentValue: 120, actionItems: ["하천 주변 통제", "수위 모니터링 강화", "대피 안내 방송", "긴급 대피"],
    alertMessages: { BLUE: "방류량 정상", YELLOW: "방류량 증가", ORANGE: "⚠️ 방류량 경계!", RED: "🚨 방류량 심각!" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] },
  { id: "temp", name: "기온", unit: "°C", source: "api", icon: "🌡️", apiInterval: 10,
    thresholds: { BLUE: [15, 28], YELLOW: [28, 33], ORANGE: [33, 37], RED: [37, Infinity] },
    currentValue: 0, actionItems: ["그늘막 설치", "음료수 배부", "의료진 대기 강화", "행사 중단 검토"],
    alertMessages: { BLUE: "기온 적정", YELLOW: "기온 상승, 음료수 준비", ORANGE: "⚠️ 폭염 경계!", RED: "🚨 폭염 심각! 행사 중단 검토" },
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
  festivalName: "진주논개제", festivalSubtitle: "재난안전 실시간 모니터링",
  organization: "진주시청 안전관리과", contactNumber: "055-749-8000", logoEmoji: "🏮",
  venueArea: 10000, operatingStart: "08:00", operatingEnd: "22:00", is24HourMode: false,
  solapiApiKey: "", solapiApiSecret: "", solapiSender: "", smsEnabled: false, smsIntervalMin: 30,
  smsManagers: [],  // [{name, phone}] 안전관리책임자
  smsStaff: [],     // [{name, phone}] 안전요원
  location: { lat: 35.1798, lon: 128.1076, name: "경남 진주시", mode: "auto" },
  kma: { serviceKey: "53ed52a312626ba7b1fe74c00f0c676245c88a3ab708606bbed554761786a263", enabled: true, interval: 10, lastFetch: null, nxOverride: 81, nyOverride: 75 },
  zones: [ { id: "z1", name: "A구역", range: "", assignee: "" } ],
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
function getLevel(cat) { const v = cat.currentValue; for (const [lv, [min, max]] of Object.entries(cat.thresholds)) { if (v >= min && v < max) return lv; } return "RED"; }
function fmtTime(d) { return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtDate(d) { return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }); }
function fmtHM(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function useNow(ms = 1000) { const [n, s] = useState(new Date()); useEffect(() => { const t = setInterval(() => s(new Date()), ms); return () => clearInterval(t); }, [ms]); return n; }
function isActive(s) { if (s.is24HourMode) return true; const hm = fmtHM(new Date()); return hm >= s.operatingStart && hm <= s.operatingEnd; }
function getByPath(obj, path) { try { return path.split('.').reduce((o, k) => o[k], obj); } catch { return null; } }

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
  const [val, setVal] = useState(init);
  const loaded = useRef(false);
  const lastJson = useRef("");
  const valRef = useRef(val);

  // 항상 최신 값을 ref에 반영
  useEffect(() => { valRef.current = val; }, [val]);

  // 최초 로드
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(key);
        if (r?.value) {
          lastJson.current = r.value;
          const parsed = JSON.parse(r.value);
          setVal(parsed);
          valRef.current = parsed;
        }
      } catch {}
      loaded.current = true;
    })();
  }, [key]);

  // 다른 기기 변경사항 동기화 (5초마다 폴링)
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const r = await window.storage.get(key);
        if (r?.value && r.value !== lastJson.current) {
          lastJson.current = r.value;
          const parsed = JSON.parse(r.value);
          setVal(parsed);
          valRef.current = parsed;
        }
      } catch {}
    }, 5000);

    const handler = (e) => {
      if (e.detail?.key === key && e.detail?.value) {
        const newJson = typeof e.detail.value === "string" ? e.detail.value : JSON.stringify(e.detail.value);
        if (newJson !== lastJson.current) {
          lastJson.current = newJson;
          const parsed = JSON.parse(newJson);
          setVal(parsed);
          valRef.current = parsed;
        }
      }
    };
    window.addEventListener("supabase-sync", handler);
    return () => { clearInterval(poll); window.removeEventListener("supabase-sync", handler); };
  }, [key]);

  // ★ 핵심 수정: valRef.current로 항상 최신값 참조 (stale closure 방지)
  const set = useCallback((v) => {
    const current = valRef.current;
    const next = typeof v === "function" ? v(current) : v;
    setVal(next);
    valRef.current = next;
    const json = JSON.stringify(next);
    lastJson.current = json;
    if (loaded.current) window.storage.set(key, json).catch(() => {});
    return next;
  }, [key]);
    return next;
  }, [key, val]);

  return [val, set];
}

async function sendSolapi(s, text, contacts) {
  const list = contacts || [...(s.smsManagers || []), ...(s.smsStaff || [])];
  if (!s.solapiApiKey || !s.solapiSender || !list.length) return { success: false };
  try { const res = await fetch("https://api.solapi.com/messages/v4/send-many", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `HMAC-SHA256 apiKey=${s.solapiApiKey}, date=${new Date().toISOString()}, salt=${Math.random().toString(36).slice(2)}, signature=${s.solapiApiSecret}` }, body: JSON.stringify({ messages: list.map(c => ({ to: c.phone, from: s.solapiSender, text, type: "SMS" })) }) }); return { success: res.ok }; } catch { return { success: false }; }
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
function Dashboard({ categories, settings, onCardClick, onRefresh, alerts, onAction }) {
  const now = useNow();
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const worst = categories.reduce((w, c) => { const cl = getLevel(c); return LV_ORDER.indexOf(cl) > LV_ORDER.indexOf(w) ? cl : w; }, "BLUE");
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

          {/* 구역별 통계 (인파관리) */}
          {selected.id === "crowd" && settings.zones?.filter(z => z.name).length > 0 && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
              <h4 style={{ color: "#8892b0", fontSize: 13, margin: "0 0 10px", fontWeight: 500 }}>🗺️ 구역별 현황</h4>
              <div style={{ display: "grid", gap: 6 }}>
                {settings.zones.filter(z => z.name).map(z => {
                  const pct = selected.currentValue > 0 ? ((z.count || 0) / selected.currentValue * 100) : 0;
                  return (
                    <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700 }}>{z.name}</span>
                          {z.range && <span style={{ color: "#445", fontSize: 10 }}>({z.range})</span>}
                          {z.assignee && <span style={{ color: "#556", fontSize: 10 }}>👤 {z.assignee}</span>}
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: li.color, borderRadius: 2, transition: "width .5s" }} />
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 70 }}>
                        <div style={{ color: li.color, fontSize: 18, fontWeight: 800, fontFamily: "monospace" }}>{(z.count || 0).toLocaleString()}</div>
                        <div style={{ color: "#556", fontSize: 10 }}>{pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderTop: "1px solid #222", marginTop: 4 }}>
                  <span style={{ color: "#8892b0", fontSize: 12, fontWeight: 700 }}>합계</span>
                  <span style={{ color: li.color, fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{settings.zones.filter(z => z.name).reduce((s, z) => s + (z.count || 0), 0).toLocaleString()}명</span>
                </div>
              </div>
            </div>
          )}

          {/* 확대 그래프 */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📈 30분 간격 추이 (최근 12시간)</h3>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={(selected.history || []).slice(-24)} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 11 }} width={50} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, selected.name]} />
                  {selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 10 }} />}
                  {selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" label={{ value: "경계", fill: "#FF9800", fontSize: 10 }} />}
                  {selected.thresholds.RED?.[0] > 0 && selected.thresholds.RED[0] !== Infinity && <ReferenceLine y={selected.thresholds.RED[0]} stroke="#F44336" strokeDasharray="4 4" label={{ value: "심각", fill: "#F44336", fontSize: 10 }} />}
                  <Line type="monotone" dataKey="value" stroke={li.color} strokeWidth={3} dot={{ fill: li.color, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 기준값 표시 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
            {Object.entries(LEVELS).map(([lk, lvi]) => (<div key={lk} style={{ padding: "6px 8px", borderRadius: 8, background: lk === lv ? lvi.bg : "rgba(255,255,255,0.02)", border: `1px solid ${lk === lv ? lvi.border : "#1a1a2e"}`, textAlign: "center" }}>
              <div style={{ color: lvi.color, fontSize: 10, fontWeight: 700 }}>{lvi.label}</div>
              <div style={{ color: lk === lv ? "#fff" : "#556", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{selected.thresholds[lk]?.[0]}~{selected.thresholds[lk]?.[1] === Infinity ? "∞" : selected.thresholds[lk]?.[1]}</div>
            </div>))}
          </div>

          {/* 조치 버튼 — 주의 이상일 때만 */}
          {isWarning && <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
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
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
      {categories.map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const isW = lv !== "BLUE"; return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 16, border: `1.5px solid ${li.border}`, position: "relative", overflow: "hidden", cursor: "pointer", transition: "transform .2s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.02)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: li.color, animation: "blink 1.5s infinite" }} />}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{cat.icon}</span>
            <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 13, flex: 1 }}>{cat.name}</span>
            {cat.actionStatus && <span style={{ padding: "1px 6px", borderRadius: 10, background: cat.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(76,175,80,0.15)", color: cat.actionStatus === "handling" ? "#FF9800" : "#4CAF50", fontSize: 8, fontWeight: 700 }}>{cat.actionStatus === "handling" ? "🔧조치중" : "✅완료"}</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: li.color, fontFamily: "monospace", marginBottom: 4 }}>
            {cat.currentValue.toLocaleString()}<span style={{ fontSize: 11, color: "#8892b0", marginLeft: 3 }}>{cat.unit}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ padding: "2px 8px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 9, fontWeight: 700 }}>{li.icon} {li.label}</span>
            {cat.lastUpdated && <span style={{ color: "#445", fontSize: 9 }}>🕐 {cat.lastUpdated}</span>}
          </div>
        </div>); })}
    </div>
    <div style={{ maxWidth: 1100, margin: "16px auto 0", display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
      {Object.entries(LEVELS).map(([k, v]) => (<div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: v.color }} /><span style={{ color: "#8892b0", fontSize: 11 }}>{v.label}</span></div>))}
    </div>
    {alerts && alerts.length > 0 && (
      <div style={{ maxWidth: 1100, margin: "20px auto 0" }}>
        <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔔 최근 알림</h3>
        {alerts.slice(0, 5).map((a, i) => { const ali = LEVELS[a.level]; return (
          <div key={i} style={{ background: ali.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${ali.border}`, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: ali.color, fontWeight: 700, fontSize: 12 }}>{ali.icon} {a.category}</span>
            <span style={{ color: "#888", fontSize: 10, flex: 1 }}>{a.message.split("\n")[2] || ""}</span>
            <span style={{ color: "#445", fontSize: 9 }}>{a.time}</span>
          </div>); })}
      </div>)}
    <div style={{ textAlign: "center", marginTop: 24, color: "#334", fontSize: 11 }}>{settings.organization} | {settings.contactNumber}</div>
  </div>);
}

// ─── Counter Page ────────────────────────────────────────────────
function CounterPage({ categories, setCategories, settings, setSettings }) {
  const crowd = categories.find(c => c.id === "crowd");
  const lv = crowd ? getLevel(crowd) : "BLUE"; const li = LEVELS[lv]; const now = useNow();
  const [log, setLog] = useState([]);
  const [selZone, setSelZone] = useState(null);
  const zones = settings.zones || [];
  const hasZones = zones.length > 1 || (zones.length === 1 && zones[0].name);

  const adjustTotal = (d) => {
    const ts = fmtTime(new Date());
    const zoneName = selZone ? (zones.find(z => z.id === selZone)?.name || "") : "";
    const newTotal = Math.max(0, (crowd?.currentValue || 0) + d);
    setLog(p => [{ delta: d, time: ts, total: newTotal, zone: zoneName }, ...p].slice(0, 50));
    setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: newTotal, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));

    // 구역 업데이트
    let newZones = settings.zones || [];
    if (selZone) {
      newZones = newZones.map(z => z.id === selZone ? { ...z, count: Math.max(0, (z.count || 0) + d) } : z);
      setSettings(prev => ({ ...prev, zones: newZones }));
    }

    // ★ 인파 전용 테이블에 직접 저장 (다른 데이터와 충돌 없음)
    if (window.crowdDB) {
      window.crowdDB.set(newTotal, newZones, "counter").catch(() => {});
    }
  };

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{settings.festivalName} 인파 계수</h2>
    <p style={{ color: "#8892b0", fontSize: 12, margin: "0 0 16px" }}>{fmtTime(now)}</p>

    {/* 전체 현황 */}
    <div style={{ width: "100%", maxWidth: 400, background: li.bg, border: `2px solid ${li.border}`, borderRadius: 20, padding: 24, textAlign: "center", marginBottom: 16 }}>
      <div style={{ color: "#8892b0", fontSize: 12, marginBottom: 4 }}>전체 축제장 인원</div>
      <div style={{ fontSize: 44, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{crowd?.currentValue?.toLocaleString() || 0}</div>
      <div style={{ color: li.color, fontSize: 13, fontWeight: 700, marginTop: 2 }}>{li.icon} {li.label}</div>
      {settings.venueArea > 0 && <div style={{ color: "#8892b0", fontSize: 11, marginTop: 2 }}>밀집도: {((crowd?.currentValue || 0) / settings.venueArea).toFixed(2)}명/㎡</div>}
    </div>

    {/* 구역 선택 */}
    {hasZones && <div style={{ width: "100%", maxWidth: 400, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => setSelZone(null)} style={{ padding: "8px 14px", borderRadius: 8, border: !selZone ? "1.5px solid #2196F3" : "1px solid #333", background: !selZone ? "rgba(33,150,243,0.15)" : "transparent", color: !selZone ? "#2196F3" : "#667", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>전체</button>
        {zones.filter(z => z.name).map(z => (
          <button key={z.id} onClick={() => setSelZone(z.id)} style={{ padding: "8px 14px", borderRadius: 8, border: selZone === z.id ? "1.5px solid #4CAF50" : "1px solid #333", background: selZone === z.id ? "rgba(76,175,80,0.15)" : "transparent", color: selZone === z.id ? "#4CAF50" : "#667", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {z.name}{z.count ? ` (${z.count})` : ""}
          </button>
        ))}
      </div>
      {selZone && (() => { const z = zones.find(zz => zz.id === selZone); return z ? (
        <div style={{ textAlign: "center", marginTop: 8, padding: "8px 12px", background: "rgba(76,175,80,0.06)", borderRadius: 8, border: "1px solid rgba(76,175,80,0.15)" }}>
          <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>📍 {z.name}</span>
          {z.range && <span style={{ color: "#556", fontSize: 11, marginLeft: 8 }}>({z.range})</span>}
          {z.assignee && <span style={{ color: "#8892b0", fontSize: 11, marginLeft: 8 }}>👤 {z.assignee}</span>}
          <div style={{ color: "#4CAF50", fontSize: 22, fontWeight: 900, fontFamily: "monospace", marginTop: 4 }}>{(z.count || 0).toLocaleString()}명</div>
        </div>
      ) : null; })()}
    </div>}

    {/* 카운터 버튼 */}
    <div style={{ display: "flex", gap: 10, marginBottom: 10, width: "100%", maxWidth: 400 }}>
      {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
    </div>
    <div style={{ display: "flex", gap: 10, marginBottom: 16, width: "100%", maxWidth: 400 }}>
      {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(-n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
    </div>
    <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 400, marginBottom: 16 }}>
      <input id="cc" type="number" placeholder="직접 입력" style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16 }} />
      <button onClick={() => { const e = document.getElementById("cc"); const v = parseInt(e.value); if (!isNaN(v)) { adjustTotal(v); e.value = ""; } }} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer" }}>적용</button>
    </div>

    {/* 구역별 현황 */}
    {hasZones && <div style={{ width: "100%", maxWidth: 400, marginBottom: 16 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>🗺️ 구역별 현황</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {zones.filter(z => z.name).map(z => (
          <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: selZone === z.id ? "1px solid rgba(76,175,80,0.3)" : "1px solid transparent" }}>
            <div><span style={{ color: "#ccd6f6", fontSize: 12 }}>{z.name}</span>{z.assignee && <span style={{ color: "#445", fontSize: 10, marginLeft: 6 }}>({z.assignee})</span>}</div>
            <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{(z.count || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>}

    {/* 입력 기록 */}
    <div style={{ width: "100%", maxWidth: 400 }}><h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>입력 기록</h3><div style={{ maxHeight: 160, overflow: "auto" }}>
      {log.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6, color: "#aaa", fontSize: 11 }}>
        <span style={{ color: l.delta > 0 ? "#4CAF50" : "#F44336", fontWeight: 700 }}>{l.delta > 0 ? "+" : ""}{l.delta}</span>
        {l.zone && <span style={{ color: "#556" }}>{l.zone}</span>}
        <span>→ {l.total.toLocaleString()}</span><span>{l.time}</span></div>)}</div></div>
  </div>);
}

// ─── CMS Page ────────────────────────────────────────────────────
function CMSPage({ categories, setCategories, settings, setSettings, alerts, setAlerts, smsLog, initialTab, initialCatId, extraTabs, onExtraTab, userRole }) {
  const [tab, setTab] = useState(initialTab || "monitor");
  const [focusCat, setFocusCat] = useState(initialCatId || null);
  const [nc, setNc] = useState({ name: "", phone: "" });
  const [locLoading, setLocLoading] = useState(false);
  const [apiTestResult, setApiTestResult] = useState({});
  const [kmaTestResult, setKmaTestResult] = useState(null);
  const [newCat, setNewCat] = useState({ name: "", unit: "", source: "manual", icon: "📊", apiInterval: 10, thresholds: { BLUE: [0, 100], YELLOW: [100, 200], ORANGE: [200, 300], RED: [300, Infinity] }, currentValue: 0, actionItems: ["점검"], alertMessages: { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }, apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] });

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

  const baseTabs = [
    { id: "monitor", label: "📊 현황" }, { id: "manual", label: "✏️ 데이터입력" },
    { id: "kma", label: "🌤️ 기상청" }, { id: "apiconfig", label: "🔌 커스텀API" },
    { id: "thresholds", label: "⚙️ 기준값" }, { id: "alertmsg", label: "💬 알림메시지" },
    { id: "sms", label: "📱 SMS" }, { id: "zones", label: "🗺️ 구역" }, { id: "custom", label: "➕ 항목" },
    { id: "settings", label: "🔧 설정" }, { id: "alerts", label: `🔔 이력(${alerts.length})` },
  ];
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
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 12px" }}>📱 Solapi SMS 설정</h3><div style={{ display: "grid", gap: 10 }}><div><Label>API Key</Label><Input value={settings.solapiApiKey} onChange={e => setSettings({ ...settings, solapiApiKey: e.target.value })} /></div><div><Label>Secret</Label><Input type="password" value={settings.solapiApiSecret} onChange={e => setSettings({ ...settings, solapiApiSecret: e.target.value })} /></div><div><Label>발신번호</Label><Input type="tel" value={settings.solapiSender} onChange={e => setSettings({ ...settings, solapiSender: e.target.value })} /></div><div><Label>경계이상 반복 발송 간격(분)</Label><Input type="number" value={settings.smsIntervalMin} onChange={e => setSettings({ ...settings, smsIntervalMin: parseInt(e.target.value) || 30 })} style={{ width: 100 }} /></div><Toggle on={settings.smsEnabled} onToggle={() => setSettings({ ...settings, smsEnabled: !settings.smsEnabled })} labelOn="SMS 활성" labelOff="비활성" /></div></Card>

      {/* 안전관리책임자 */}
      <Card>
        <h3 style={{ color: "#F44336", fontSize: 15, margin: "0 0 4px" }}>🔴 안전관리책임자</h3>
        <p style={{ color: "#556", fontSize: 10, margin: "0 0 10px" }}>경계/심각 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsManagers || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(244,67,54,0.05)", borderRadius: 6, border: "1px solid rgba(244,67,54,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 11, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsManagers: settings.smsManagers.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsManagers: [...(settings.smsManagers || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#F44336", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      {/* 안전요원 */}
      <Card>
        <h3 style={{ color: "#FF9800", fontSize: 15, margin: "0 0 4px" }}>🟠 안전요원</h3>
        <p style={{ color: "#556", fontSize: 10, margin: "0 0 10px" }}>경계/심각 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsStaff || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(255,152,0,0.05)", borderRadius: 6, border: "1px solid rgba(255,152,0,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 12, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 11, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsStaff: settings.smsStaff.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsStaff: [...(settings.smsStaff || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#FF9800", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>{(!smsLog || !smsLog.length) ? <p style={{ color: "#445", fontSize: 12 }}>없음</p> : <div style={{ maxHeight: 200, overflow: "auto" }}>{smsLog.map((l, i) => (<div key={i} style={{ padding: "5px 8px", borderBottom: "1px solid #1a1a2e", fontSize: 11 }}><span style={{ color: l.success ? "#4CAF50" : "#F44336" }}>{l.success ? "✅" : "❌"}</span> <span style={{ color: "#555" }}>{l.time}</span><div style={{ color: "#777", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.preview}</div></div>))}</div>}</Card>
    </div>}

    {/* Zone Management - inside settings tab area but rendered as separate section */}
    {tab === "zones" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🗺️ 구역 설정</h3>
        <p style={{ color: "#556", fontSize: 11, margin: "0 0 14px" }}>구역을 추가하면 인파계수 페이지에 구역별 카운터가 자동 생성됩니다.</p>
        {(settings.zones || []).map((z, i) => (
          <div key={z.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid #222" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#2196F3", fontWeight: 700, fontSize: 14 }}>📍 {z.name || `구역 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 10, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><Label>구역명</Label><Input value={z.name} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, name: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="A구역" /></div>
              <div><Label>구역범위</Label><Input value={z.range} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, range: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="동문~남문" /></div>
              <div><Label>담당자</Label><Input value={z.assignee} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, assignee: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="계수원1" /></div>
            </div>
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, zones: [...(settings.zones || []), { id: "z" + Date.now(), name: "", range: "", assignee: "", count: 0 }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 구역 추가</button>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#2196F3", fontSize: 11, margin: 0, lineHeight: 1.7 }}>ℹ️ 구역별 인파 집계가 인파계수 탭에 자동 반영됩니다. 각 구역의 인원 합계가 전체 인파관리 수치로 집계됩니다.</p>
      </Card>
    </div>}

    {/* Custom Category */}
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
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>🔧 축제 기본정보</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "축제명", k: "festivalName" }, { l: "부제목", k: "festivalSubtitle" }, { l: "관리기관", k: "organization" }, { l: "연락처", k: "contactNumber" }, { l: "로고", k: "logoEmoji" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={settings[f.k]} onChange={e => setSettings({ ...settings, [f.k]: e.target.value })} /></div>))}</div></Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📍 위치</h3><div style={{ display: "flex", gap: 8, marginBottom: 14 }}><button onClick={autoLocate} disabled={locLoading} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: loc.mode === "auto" ? "#4CAF50" : "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: locLoading ? .6 : 1 }}>{locLoading ? "📡 확인 중..." : "📡 자동 위치"}</button><button onClick={() => setSettings({ ...settings, location: { ...loc, mode: "manual" } })} style={{ flex: 1, padding: "12px", borderRadius: 8, border: loc.mode === "manual" ? "1px solid #FF9800" : "1px solid #333", background: loc.mode === "manual" ? "rgba(255,152,0,0.1)" : "transparent", color: loc.mode === "manual" ? "#FF9800" : "#8892b0", fontWeight: 700, cursor: "pointer" }}>✏️ 수동</button></div><div style={{ display: "grid", gap: 10 }}><div><Label>위치명</Label><Input value={loc.name || ""} onChange={e => setSettings({ ...settings, location: { ...loc, name: e.target.value, mode: "manual" } })} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div><Label>위도</Label><Input type="number" step="0.0001" value={loc.lat || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lat: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div><div><Label>경도</Label><Input type="number" step="0.0001" value={loc.lon || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lon: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div></div></div><div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}><p style={{ color: "#445", fontSize: 10, margin: 0 }}>📍{loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)}) — {loc.mode === "auto" ? "자동" : "수동"} | 격자: nx={grid.nx}, ny={grid.ny}</p></div></Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 6px" }}>📐 순면적</h3><div style={{ marginBottom: 12 }}><Label>면적 (㎡)</Label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input type="number" value={settings.venueArea} onChange={e => setSettings({ ...settings, venueArea: parseFloat(e.target.value) || 0 })} style={{ width: 150, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>㎡</span><span style={{ color: "#445", fontSize: 10 }}>({(settings.venueArea * .3025).toFixed(0)}평)</span></div></div><button onClick={() => { const t = calcCrowdThr(settings.venueArea); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, thresholds: t } : c)); alert("✅ 인파 기준 적용"); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 인파 기준 자동 적용</button></Card>
    </div>}

    {/* Alerts */}
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
      let mode = "sim";

      // 1) 실제 API 호출 시도
      if (kma.serviceKey) {
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
        } catch { /* API 호출 실패 → 시뮬레이션 fallback */ }
      }

      // 2) 실패 시 시뮬레이션
      if (!dataMap) { dataMap = generateSimKmaData(); mode = "sim"; }

      setCategories(p => p.map(c => {
        if (c.kmaCategory && dataMap[c.kmaCategory] !== undefined && !c.apiConfig?.enabled) {
          return { ...c, currentValue: Math.round(dataMap[c.kmaCategory] * 10) / 10, lastUpdated: new Date().toLocaleTimeString("ko-KR") };
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
function useHistoryRecorder(categories, setCategories, active) {
  const lastRecord = useRef(0);
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
  }, [active]);
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
];

const ROLES = {
  admin: { label: "관리자", color: "#F44336", pages: ["dashboard", "counter", "cms"], desc: "모든 기능 접근" },
  manager: { label: "운영자", color: "#FF9800", pages: ["dashboard", "counter", "cms"], desc: "설정 변경 가능 (계정관리 제외)" },
  counter: { label: "계수원", color: "#4CAF50", pages: ["counter", "dashboard"], desc: "인파 계수 + 대시보드 조회" },
  viewer: { label: "뷰어", color: "#2196F3", pages: ["dashboard"], desc: "대시보드 조회만 가능" },
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
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 4px", letterSpacing: 2 }}>축제 안전관리 시스템</h1>
          <p style={{ color: "#556", fontSize: 13 }}>재난안전 실시간 모니터링</p>
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
  const [accounts, setAccounts] = usePersist("fest_accounts_v1", DEFAULT_ACCOUNTS);
  const [session, setSession] = useState(null); // { id, name, role, festivalId }
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
    setPage(acc.role === "counter" ? "counter" : "dashboard");
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
    setCategories(p => p.map(c => c.id === catId ? { ...c, actionStatus: newStatus } : c));
    // SMS 발송 (조치중/조치완료 시 책임자에게, 전체에게도)
    if (newStatus && settings.smsEnabled && cat) {
      const lv = getLevel(cat); const li = LEVELS[lv];
      const statusLabel = newStatus === "handling" ? "🔧 조치중" : "✅ 조치완료";
      const sms = `[${settings.festivalName}] ${statusLabel}\n\n${cat.icon}${cat.name}: ${cat.currentValue}${cat.unit} (${li.label})\n상태: ${statusLabel}\n담당: ${session.name}\n시간: ${new Date().toLocaleString("ko-KR")}\n\n발신: ${settings.organization}`;
      const allContacts = [...(settings.smsManagers || []), ...(settings.smsStaff || [])];
      sendSolapi(settings, sms, allContacts).then(r => setSmsLog(p => [{ time: new Date().toLocaleString("ko-KR"), success: r.success, preview: `[${statusLabel}] ${cat.name} — ${sms.slice(0, 80)}...` }, ...p].slice(0, 50)));
    }
  };

  // Auto-clear action status when back to BLUE
  useEffect(() => {
    categories.forEach(cat => {
      if (getLevel(cat) === "BLUE" && cat.actionStatus) {
        setCategories(p => p.map(c => c.id === cat.id ? { ...c, actionStatus: null } : c));
      }
    });
  }, [categories.map(c => getLevel(c)).join(",")]);


  useKmaFetcher(categories, setCategories, settings, setSettings, active, refreshKey);
  useCustomApiFetcher(categories, setCategories, settings, active, refreshKey);
  useHistoryRecorder(categories, setCategories, active);

  // ★ 인파관리 실시간 동기화 (전용 테이블 사용 — 충돌 불가)
  useEffect(() => {
    if (!active || !window.crowdDB) return;
    let lastTotal = null;

    const syncCrowd = async () => {
      try {
        const data = await window.crowdDB.get();
        if (data && data.total !== undefined && data.total !== lastTotal) {
          lastTotal = data.total;
          setCategories(prev => prev.map(c => c.id === "crowd" ? { ...c, currentValue: data.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
          if (data.zones) setSettings(prev => ({ ...prev, zones: data.zones }));
        }
      } catch {}
    };

    // 즉시 1회 + 3초마다 폴링
    syncCrowd();
    const poll = setInterval(syncCrowd, 3000);

    // Supabase Realtime 이벤트로 즉시 반영
    const handler = (e) => {
      if (e.detail?.total !== undefined && e.detail.total !== lastTotal) {
        lastTotal = e.detail.total;
        setCategories(prev => prev.map(c => c.id === "crowd" ? { ...c, currentValue: e.detail.total, lastUpdated: new Date().toLocaleTimeString("ko-KR") } : c));
        if (e.detail.zones) setSettings(prev => ({ ...prev, zones: e.detail.zones }));
      }
    };
    window.addEventListener("crowd-update", handler);

    return () => { clearInterval(poll); window.removeEventListener("crowd-update", handler); };
  }, [active]);

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
  const allNavs = [
    { id: "dashboard", icon: "📊", label: "대시보드" },
    { id: "counter", icon: "👥", label: "인파계수" },
    { id: "cms", icon: "⚙️", label: "관리" },
  ];
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
      {navs.map(n => <button key={n.id} onClick={() => { setPage(n.id); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ flex: 1, maxWidth: 160, padding: "12px 0 10px", border: "none", background: "none", color: page === n.id ? "#2196F3" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 20 }}>{n.icon}</span><span style={{ fontSize: 11, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span></button>)}
    </nav>

    {/* Content */}
    <div style={{ paddingTop: 36, paddingBottom: 70 }}>
      {page === "dashboard" && (active ? <Dashboard categories={categories} settings={settings} onCardClick={onCardClick} onRefresh={handleRefresh} alerts={alerts} onAction={handleAction} /> : <InactiveOverlay settings={settings} />)}
      {page === "counter" && <CounterPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} />}
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
        <CMSPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} alerts={alerts} setAlerts={setAlerts} smsLog={smsLog} initialTab={cmsTab} initialCatId={cmsCatId} extraTabs={cmsExtraTabs} onExtraTab={(id) => setCmsTab(id)} userRole={session.role} />
      )}
    </div>
  </div>);
}
