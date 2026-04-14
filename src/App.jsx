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
  { id: "pm10", name: "미세먼지", unit: "㎍/㎥", source: "api", icon: "🌫️", apiInterval: 30,
    thresholds: { BLUE: [0, 31], YELLOW: [31, 81], ORANGE: [81, 151], RED: [151, Infinity] },
    currentValue: 0, actionItems: ["마스크 배부", "야외 활동 축소", "민감군 보호", "행사 축소 검토"],
    alertMessages: { BLUE: "미세먼지 좋음", YELLOW: "미세먼지 보통", ORANGE: "⚠️ 미세먼지 나쁨! 마스크 착용", RED: "🚨 미세먼지 매우나쁨! 야외활동 자제" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] },
  { id: "pm25", name: "초미세먼지", unit: "㎍/㎥", source: "api", icon: "😷", apiInterval: 30,
    thresholds: { BLUE: [0, 16], YELLOW: [16, 36], ORANGE: [36, 76], RED: [76, Infinity] },
    currentValue: 0, actionItems: ["마스크 배부 안내", "야외 활동 자제 안내", "민감군 보호 조치", "행사 축소 검토"],
    alertMessages: { BLUE: "초미세먼지 좋음", YELLOW: "초미세먼지 보통, 민감군 주의", ORANGE: "⚠️ 초미세먼지 나쁨! 마스크 착용 안내", RED: "🚨 초미세먼지 매우나쁨! 야외활동 자제" },
    apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] },
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
  airQuality: { serviceKey: "53ed52a312626ba7b1fe74c00f0c676245c88a3ab708606bbed554761786a263", sidoName: "경남", stationFilter: "진주", enabled: true, interval: 30, lastFetch: null },
  dam: { serviceKey: "53ed52a312626ba7b1fe74c00f0c676245c88a3ab708606bbed554761786a263", damName: "남강", enabled: true, interval: 30, lastFetch: null },
  zones: [ { id: "z1", name: "A구역", range: "", assignee: "" } ],
  gates: [ { id: "g1", name: "출입구1", assignee: "", accountId: "" } ],
  workers: [],
  actionReports: [],
  parkingLots: [],
  notices: [],
  messages: [],
  shuttleStops: [],
  shuttleBuses: [],
  festivalDates: ["2026-05-02","2026-05-03","2026-05-04","2026-05-05"],
  cumulativeVisitors: 0,
  hourlyLog: [],
  dailyRecords: [],
  orgChart: [],
  zoneCongestion: [],
  workTypes: ["일용근로", "자원봉사", "파견", "공무원"],
  workSites: [],
  zoneRequests: [],
  checklists: [
    { id: "cl_pre", title: "개장 전 점검", category: "pre", items: [
      { id: "ci1", text: "무대 구조물 안전점검", checked: false }, { id: "ci2", text: "소화기 비치 확인", checked: false },
      { id: "ci3", text: "비상방송 시스템 테스트", checked: false }, { id: "ci4", text: "대피경로 안내판 확인", checked: false },
      { id: "ci5", text: "전기시설 안전점검", checked: false }, { id: "ci6", text: "의료진 배치 확인", checked: false },
    ]},
    { id: "cl_dur", title: "운영 중 점검", category: "during", items: [
      { id: "ci7", text: "출입구 통제 인력 확인", checked: false }, { id: "ci8", text: "음향/조명 장비 상태", checked: false },
      { id: "ci9", text: "쓰레기 수거 상태", checked: false }, { id: "ci10", text: "화장실 청소 상태", checked: false },
    ]},
    { id: "cl_post", title: "폐장 후 점검", category: "post", items: [
      { id: "ci11", text: "관람객 퇴장 완료 확인", checked: false }, { id: "ci12", text: "전기/가스 차단 확인", checked: false },
      { id: "ci13", text: "시설물 파손 점검", checked: false }, { id: "ci14", text: "분실물 수거", checked: false },
    ]},
  ],
  timeline: [],
  emergencyLevel: 0,
  emergencyMessage: "",
  emergencyAt: null,
  medicalRecords: [],
  programs: [
    {id:"pg1",date:"2026-05-02",time:"17:00",endTime:"17:20",title:"헌다례",location:"임진대첩계사순의단",category:"P",memo:"고유문 봉독 및 헌다"},
    {id:"pg2",date:"2026-05-02",time:"17:20",endTime:"18:00",title:"신위순행",location:"진주성 일대",category:"P",memo:"신위순행 퍼레이드"},
    {id:"pg3",date:"2026-05-02",time:"18:00",endTime:"18:10",title:"개제선언",location:"진주성 특설무대",category:"P",memo:""},
    {id:"pg4",date:"2026-05-02",time:"18:10",endTime:"19:00",title:"의암별제",location:"진주성 특설무대",category:"P",memo:"논개 추모 제전"},
    {id:"pg5",date:"2026-05-02",time:"14:00",endTime:"14:30",title:"코미디 서커스 <멋> 231쇼",location:"야외공연장",category:"P",memo:""},
    {id:"pg6",date:"2026-05-02",time:"16:00",endTime:"16:30",title:"폴로세움 서남재",location:"야외공연장",category:"P",memo:"서커스 공연"},
    {id:"pg7",date:"2026-05-02",time:"19:00",endTime:"19:30",title:"혼둘혼둘",location:"야외공연장",category:"P",memo:""},
    {id:"pg8",date:"2026-05-02",time:"20:00",endTime:"21:00",title:"무소음 툇마루 음악회",location:"진주성 중영",category:"P",memo:"살롱드국악 선율모리"},
    {id:"pg9",date:"2026-05-02",time:"13:00",endTime:"21:00",title:"교방 플레이존",location:"진주성 내",category:"E",memo:"어린이 교방문화 체험"},
    {id:"pg10",date:"2026-05-02",time:"13:00",endTime:"21:00",title:"교방문화로놀장",location:"진주성 내",category:"E",memo:"악가무시서화 체험"},
    {id:"pg11",date:"2026-05-02",time:"13:00",endTime:"21:00",title:"교방예술촌",location:"진주성 내",category:"E",memo:"전통 공예 체험"},
    {id:"pg12",date:"2026-05-02",time:"13:00",endTime:"18:00",title:"가족이 함께하는 수상레저",location:"남강",category:"E",memo:"카약 체험"},
    {id:"pg13",date:"2026-05-02",time:"13:00",endTime:"21:00",title:"27년의 나에게",location:"진주성 내",category:"E",memo:"느린우체통"},
    {id:"pg14",date:"2026-05-02",time:"13:00",endTime:"21:00",title:"AI 교방 체험",location:"진주성 내",category:"E",memo:"전통+현대기술 콘텐츠"},
    {id:"pg15",date:"2026-05-02",time:"17:40",endTime:"18:00",title:"진주검무 플래시몹",location:"특설무대",category:"S",memo:"시민 100명 참여"},
    {id:"pg16",date:"2026-05-02",time:"13:00",endTime:"17:00",title:"교방문화 꼬리에 꼬리를 물고",location:"진주성 내",category:"S",memo:""},
    {id:"pg17",date:"2026-05-02",time:"11:00",endTime:"21:00",title:"진주교방 의상대여",location:"진주성 내",category:"S",memo:"교방 한복 대여"},
    {id:"pg18",date:"2026-05-02",time:"11:00",endTime:"21:00",title:"논개 깃발전",location:"역사공원",category:"S",memo:"시서화 깃발 전시"},
    {id:"pg19",date:"2026-05-02",time:"11:00",endTime:"21:00",title:"교방문화의 빛 유등",location:"진주성 일대",category:"S",memo:"유등 전시"},
    {id:"pg20",date:"2026-05-02",time:"11:00",endTime:"21:00",title:"진주성 옛 장터",location:"진주성 내",category:"S",memo:"플리마켓"},
    {id:"pg21",date:"2026-05-02",time:"11:00",endTime:"21:00",title:"옛다! 에나-캐시",location:"진주성 내",category:"S",memo:"상품권 증정"},
    {id:"pg22",date:"2026-05-02",time:"15:00",endTime:"15:30",title:"수성중군영 교대의식",location:"공북문 앞",category:"S",memo:"성문 교대의식 재현"},
    {id:"pg23",date:"2026-05-03",time:"14:00",endTime:"14:30",title:"코미디 서커스 <멋> 231쇼",location:"야외공연장",category:"P",memo:""},
    {id:"pg24",date:"2026-05-03",time:"16:00",endTime:"16:30",title:"폴로세움 서남재",location:"야외공연장",category:"P",memo:""},
    {id:"pg25",date:"2026-05-03",time:"19:00",endTime:"19:30",title:"혼둘혼둘",location:"야외공연장",category:"P",memo:""},
    {id:"pg26",date:"2026-05-03",time:"20:00",endTime:"21:00",title:"무소음 툇마루 음악회",location:"진주성 중영",category:"P",memo:""},
    {id:"pg27",date:"2026-05-03",time:"13:00",endTime:"21:00",title:"교방 플레이존",location:"진주성 내",category:"E",memo:""},
    {id:"pg28",date:"2026-05-03",time:"13:00",endTime:"21:00",title:"교방문화로놀장",location:"진주성 내",category:"E",memo:""},
    {id:"pg29",date:"2026-05-03",time:"13:00",endTime:"21:00",title:"교방예술촌",location:"진주성 내",category:"E",memo:""},
    {id:"pg30",date:"2026-05-03",time:"13:00",endTime:"18:00",title:"가족이 함께하는 수상레저",location:"남강",category:"E",memo:""},
    {id:"pg31",date:"2026-05-03",time:"11:00",endTime:"21:00",title:"진주교방 의상대여",location:"진주성 내",category:"S",memo:""},
    {id:"pg32",date:"2026-05-03",time:"11:00",endTime:"21:00",title:"진주성 옛 장터",location:"진주성 내",category:"S",memo:""},
    {id:"pg33",date:"2026-05-03",time:"11:00",endTime:"21:00",title:"옛다! 에나-캐시",location:"진주성 내",category:"S",memo:""},
    {id:"pg34",date:"2026-05-03",time:"15:00",endTime:"15:30",title:"수성중군영 교대의식",location:"공북문 앞",category:"S",memo:""},
    {id:"pg35",date:"2026-05-04",time:"14:00",endTime:"14:30",title:"코미디 서커스 <멋> 231쇼",location:"야외공연장",category:"P",memo:""},
    {id:"pg36",date:"2026-05-04",time:"16:00",endTime:"16:30",title:"폴로세움 서남재",location:"야외공연장",category:"P",memo:""},
    {id:"pg37",date:"2026-05-04",time:"19:00",endTime:"19:30",title:"혼둘혼둘",location:"야외공연장",category:"P",memo:""},
    {id:"pg38",date:"2026-05-04",time:"20:00",endTime:"21:00",title:"무소음 툇마루 음악회",location:"진주성 중영",category:"P",memo:""},
    {id:"pg39",date:"2026-05-04",time:"13:00",endTime:"21:00",title:"교방 플레이존",location:"진주성 내",category:"E",memo:""},
    {id:"pg40",date:"2026-05-04",time:"13:00",endTime:"21:00",title:"교방문화로놀장",location:"진주성 내",category:"E",memo:""},
    {id:"pg41",date:"2026-05-04",time:"11:00",endTime:"21:00",title:"진주교방 의상대여",location:"진주성 내",category:"S",memo:""},
    {id:"pg42",date:"2026-05-04",time:"11:00",endTime:"21:00",title:"진주성 옛 장터",location:"진주성 내",category:"S",memo:""},
    {id:"pg43",date:"2026-05-05",time:"14:00",endTime:"14:30",title:"코미디 서커스 <멋> 231쇼",location:"야외공연장",category:"P",memo:""},
    {id:"pg44",date:"2026-05-05",time:"16:00",endTime:"16:30",title:"폴로세움 서남재",location:"야외공연장",category:"P",memo:""},
    {id:"pg45",date:"2026-05-05",time:"19:00",endTime:"20:00",title:"폐제식",location:"특설무대",category:"P",memo:"폐막 공연"},
    {id:"pg46",date:"2026-05-05",time:"13:00",endTime:"21:00",title:"교방 플레이존",location:"진주성 내",category:"E",memo:""},
    {id:"pg47",date:"2026-05-05",time:"11:00",endTime:"21:00",title:"진주성 옛 장터",location:"진주성 내",category:"S",memo:""},
    {id:"pg48",date:"2026-05-05",time:"11:00",endTime:"21:00",title:"옛다! 에나-캐시",location:"진주성 내",category:"S",memo:""},
  ],  // [{id, name, zoneId, status, order, workers:[{id,name,phone,type,duty}]}]
  navOrder: ["dashboard", "counter", "congestion", "parking", "shuttle", "inbox", "message", "status", "program", "cms"],
  features: {
    crowd: true,
    parking: true,
    shuttle: true,
    weather: true,
    sms: true,
    message: true,
    customApi: true,
    congestion: true,  // 인파혼잡도
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
    try {
      const s = localStorage.getItem(key);
      if (!s) return init;
      const parsed = JSON.parse(s);
      // 타입 검증: init이 배열이면 배열만, 객체면 객체만
      if (Array.isArray(init) && !Array.isArray(parsed)) return init;
      if (typeof init === "object" && !Array.isArray(init) && (Array.isArray(parsed) || typeof parsed !== "object")) return init;
      return parsed;
    } catch { return init; }
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
          lastJson.current = r.value;
          const p = JSON.parse(r.value);
          setVal(p); valRef.current = p;
          localStorage.setItem(key, r.value);
        }
      } catch {}
    })();
  }, [key]);

  // Realtime 이벤트 (자기 저장 3초간 무시)
  useEffect(() => {
    const handler = (e) => {
      if (selfSave.current) return;
      if (e.detail?.key === key && e.detail?.value) {
        const j = typeof e.detail.value === "string" ? e.detail.value : JSON.stringify(e.detail.value);
        if (j !== lastJson.current) { lastJson.current = j; const p = JSON.parse(j); setVal(p); valRef.current = p; }
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
      const latestJson = JSON.stringify(valRef.current);
      selfSave.current = true;
      window.storage.set(key, latestJson).catch(() => {}).finally(() => {
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
const Label = ({ children }) => <label style={{ color: "#8892b0", fontSize: 14, display: "block", marginBottom: 4 }}>{children}</label>;
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
  if (data.length < 2) return <p style={{ color: "#445", fontSize: 13, textAlign: "center", padding: 12 }}>데이터 수집 중... (30분 간격 기록)</p>;
  const thr = cat.thresholds;
  const vals = data.map(d => d.value);
  const yMin = Math.min(...vals, thr.BLUE?.[0] ?? 0) * 0.9;
  const refMax = thr.ORANGE?.[1] !== Infinity ? thr.ORANGE[1] : (thr.ORANGE?.[0] || 100);
  const yMax = Math.max(...vals, refMax) * 1.1;
  const color = LEVELS[getLevel(cat)].color;
  return (<div style={{ width: "100%", height: 180 }}><ResponsiveContainer>
    <LineChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
      <XAxis dataKey="time" tick={{ fill: "#445", fontSize: 13 }} interval="preserveStartEnd" />
      <YAxis domain={[Math.floor(yMin), Math.ceil(yMax)]} tick={{ fill: "#445", fontSize: 13 }} width={45} />
      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 13 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, cat.name]} />
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

// ─── Dashboard OrgChart (읽기 전용) ─────────────────────────────
function DashboardOrgChart({ settings, show, onToggle }) {
  const orgData = settings.orgChart || [];
  const orgCount = orgData.filter(n => n.type === "org").length;
  const personCount = orgData.filter(n => n.type === "person").length;
  const orgPersons = orgData.filter(n => n.type === "person" && n.phone);

  const getChildren = (pid) => orgData.filter(n => n.parentId === pid).sort((a, b) => {
    if (a.type !== b.type) return a.type === "org" ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });
  const roots = orgData.filter(n => !n.parentId).sort((a, b) => {
    if (a.type !== b.type) return a.type === "org" ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });

  const renderNode = (node, depth) => {
    const children = getChildren(node.id);
    const childOrgs = children.filter(c => c.type === "org");
    const childPersons = children.filter(c => c.type === "person");
    const isOrg = node.type === "org";

    if (!isOrg) {
      return (<div key={node.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, marginBottom: 2 }}>
        <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700 }}>{node.name}</span>
        {node.position && <span style={{ color: "#4CAF50", fontSize: 12 }}>{node.position}</span>}
        {node.phone && <a href={`tel:${node.phone.replace(/-/g, "")}`} style={{ padding: "5px 10px", borderRadius: 6, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#4CAF50", fontSize: 13, fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>📞</a>}
      </div>);
    }

    return (<div key={node.id} style={{ marginLeft: depth * 14, marginBottom: 6 }}>
      <div style={{ borderRadius: 10, border: "1px solid rgba(33,150,243,0.15)", overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🏢</span>
          <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 800, flex: 1 }}>{node.name}</span>
          {node.position && <span style={{ color: "#2196F3", fontSize: 12 }}>{node.position}</span>}
          <span style={{ color: "#556", fontSize: 11 }}>{childPersons.length}명</span>
        </div>
        {childPersons.length > 0 && <div style={{ padding: "4px 10px 6px" }}>
          {childPersons.map(p => renderNode(p, 0))}
        </div>}
      </div>
      {childOrgs.map(c => renderNode(c, depth + 1))}
    </div>);
  };

  return (<div style={{ maxWidth: 1100, margin: "12px auto 0" }}>
    <div onClick={onToggle} style={{ padding: "14px 16px", borderRadius: show ? "12px 12px 0 0" : 12, background: "rgba(255,255,255,0.03)", border: "1px solid #222", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 22 }}>📋</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700 }}>조직도 / 비상연락망</div>
        <div style={{ color: "#556", fontSize: 13 }}>{orgCount}개 조직 · {personCount}명</div>
      </div>
      <span style={{ color: "#556", fontSize: 14 }}>{show ? "▲" : "▼"}</span>
    </div>
    {show && <div style={{ padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid #222", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
      {roots.map(r => renderNode(r, 0))}
      {orgPersons.length > 0 && <>
        <div style={{ borderTop: "1px solid #222", margin: "14px 0 10px", paddingTop: 12 }}>
          <span style={{ color: "#8892b0", fontSize: 14, fontWeight: 700 }}>📞 비상연락망</span>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {orgPersons.map(n => {
            const parentOrg = orgData.find(o => o.id === n.parentId && o.type === "org");
            return (<div key={n.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderRadius: 8, gap: 10, background: "rgba(255,255,255,0.02)", flexWrap: "wrap" }}>
              <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700, minWidth: 50 }}>{n.name}</span>
              {n.position && <span style={{ color: "#4CAF50", fontSize: 14, fontWeight: 600, minWidth: 50 }}>{n.position}</span>}
              {parentOrg && <span style={{ color: "#556", fontSize: 14, flex: 1 }}>🏢 {parentOrg.name}</span>}
              <a href={`tel:${n.phone.replace(/-/g, "")}`} style={{ padding: "8px 16px", borderRadius: 20, background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.25)", color: "#4CAF50", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>📞 {n.phone}</a>
            </div>);
          })}
        </div>
      </>}
    </div>}
  </div>);
}

// ─── Dashboard ───────────────────────────────────────────────────
function Dashboard({ categories: rawCategories, settings, onCardClick, onRefresh, alerts, onAction, onActionReport, onDeleteAlert, onDeleteNotice, userRole }) {
  const now = useNow();
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showOrgChart, setShowOrgChart] = useState(false);
  const [viewPhoto, setViewPhoto] = useState(null);

  // ★ 인파 데이터: Supabase가 진실 + localStorage 보조 + Realtime 즉시
  const [crowdLive, setCrowdLive] = useState(0);
  const [crowdCumLive, setCrowdCumLive] = useState(0);
  useEffect(() => {
    // 초기: localStorage에서 빠르게 읽기 (깜빡임 방지)
    try { const d = JSON.parse(localStorage.getItem("_crowd") || "{}"); setCrowdLive(d.total || 0); setCrowdCumLive(d.cumulative || 0); } catch {}

    // Supabase에서 정확한 값 로드 + 주기적 확인
    const fetchFromDB = () => {
      if (window.crowdDB) window.crowdDB.get().then(d => {
        if (d && d.total !== undefined) { setCrowdLive(d.total); setCrowdCumLive(d.cumulative || 0); localStorage.setItem("_crowd", JSON.stringify(d)); }
      }).catch(() => {});
    };
    fetchFromDB();
    const poll = setInterval(fetchFromDB, 5000);

    // Realtime 이벤트 (다른 기기 변경 즉시)
    const handler = (e) => {
      if (e.detail?.total !== undefined) { setCrowdLive(e.detail.total); setCrowdCumLive(e.detail.cumulative || 0); }
    };
    window.addEventListener("crowd-update", handler);
    return () => { clearInterval(poll); window.removeEventListener("crowd-update", handler); };
  }, []);

  // categories의 crowd를 live 값으로 교체
  const categories = rawCategories.map(c => c.id === "crowd" ? { ...c, currentValue: crowdLive } : c);

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

        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 24, border: `2px solid ${li.border}`, position: "relative", overflow: "hidden" }}>
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: li.color, animation: "blink 1.5s infinite" }} />}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 32 }}>{selected.icon}</span>
              <div>
                <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>{selected.name}</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                  <span style={{ color: "#556", fontSize: 13 }}>{selected.kmaCategory ? `🌤️ 기상청 ${selected.kmaCategory}` : selected.apiConfig?.enabled ? "🔌 커스텀API" : "✏️ 수동입력"}</span>
                  {selected.lastUpdated && <span style={{ color: "#445", fontSize: 14 }}>| 🕐 {selected.lastUpdated}</span>}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{selected.currentValue.toLocaleString()}<span style={{ fontSize: 16, color: "#8892b0", marginLeft: 4 }}>{selected.unit}</span></div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, alignItems: "center" }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 14, fontWeight: 700 }}>{li.icon} {li.label}</span>
                {selected.actionStatus && <span style={{ padding: "4px 10px", borderRadius: 20, background: selected.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(76,175,80,0.15)", border: `1px solid ${selected.actionStatus === "handling" ? "rgba(255,152,0,0.3)" : "rgba(76,175,80,0.3)"}`, color: selected.actionStatus === "handling" ? "#FF9800" : "#4CAF50", fontSize: 13, fontWeight: 700 }}>{selected.actionStatus === "handling" ? "🔧 조치중" : "✅ 조치완료"}</span>}
              </div>
            </div>
          </div>

          {selected.id === "crowd" && settings.venueArea > 0 && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 16 }}><span style={{ color: "#8892b0", fontSize: 14 }}>밀집도: <strong style={{ color: li.color }}>{(selected.currentValue / settings.venueArea).toFixed(2)}명/㎡</strong> (면적: {settings.venueArea.toLocaleString()}㎡)</span></div>}

          {/* ★ 인파 체류/누적 표시 */}
          {selected.id === "crowd" && (() => {
            const cd = JSON.parse(localStorage.getItem("_crowd") || "{}");
            const cumVal = crowdCumLive;
            const zoneData = (settings.gates || []).map(z => { const s = (cd.zones || []).find(sz => sz.id === z.id); return { ...z, count: s?.count || 0, cumulative: s?.cumulative || 0 }; });
            const history = selected.history || [];
            const hLog = settings.hourlyLog || [];
            return (<>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 12, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.15)" }}>
                  <div style={{ color: "#8892b0", fontSize: 13 }}>🏃 현재 체류</div>
                  <div style={{ color: "#4CAF50", fontSize: 28, fontWeight: 900, fontFamily: "monospace" }}>{selected.currentValue.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                  <div style={{ color: "#8892b0", fontSize: 13 }}>📊 누적 방문</div>
                  <div style={{ color: "#2196F3", fontSize: 28, fontWeight: 900, fontFamily: "monospace" }}>{cumVal.toLocaleString()}</div>
                </div>
              </div>

              {/* 체류 인원 실시간 추이 (history 데이터 — 30분 간격) */}
              {history.length >= 2 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📡 체류 인원 추이</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={history.slice(-24)} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 14 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 14 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()}명`, "체류"]} />
                    {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 14 }} />}
                    {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" label={{ value: "경계", fill: "#FF9800", fontSize: 14 }} />}
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
                    <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 14 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#556", fontSize: 14 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} />
                    <Line type="monotone" dataKey="체류" stroke="#4CAF50" strokeWidth={2} dot={false} name="🏃 체류" />
                    <Line type="monotone" dataKey="누적" stroke="#2196F3" strokeWidth={2} dot={false} name="📊 누적" />
                  </LineChart>
                </ResponsiveContainer>
              </div>}

              {/* 데이터 없을 때 안내 */}
              {history.length < 2 && hLog.length < 2 && <div style={{ textAlign: "center", padding: 20, marginBottom: 16, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid #222" }}>
                <p style={{ color: "#556", fontSize: 14 }}>📊 인파계수 데이터가 쌓이면 그래프가 표시됩니다</p>
                <p style={{ color: "#445", fontSize: 14 }}>체류 추이: 30분 간격 자동 기록 | 체류/누적 비교: 5분 간격 자동 기록</p>
              </div>}

              {/* 일자별 기록 */}
              {(settings.dailyRecords || []).length >= 1 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📅 일자별 방문 현황</h3>
                {(settings.dailyRecords || []).length >= 2 && <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={(settings.dailyRecords || []).map(r => ({ date: r.date, 누적방문: r.cumulative || 0, 최대체류: r.peakCurrent || 0 }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fill: "#556", fontSize: 13 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 14 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} />
                    <Line type="monotone" dataKey="누적방문" stroke="#2196F3" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="최대체류" stroke="#FF9800" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>}
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {(settings.dailyRecords || []).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                      <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{r.date}</span>
                      <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                      <span style={{ color: "#FF9800", fontSize: 13 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
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
                        <span style={{ color: "#445", fontSize: 14, margin: "0 4px" }}>/</span>
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
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 14 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "실황"]} />
                  {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 14 }} />}
                  {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FF9800" strokeDasharray="4 4" label={{ value: "경계", fill: "#FF9800", fontSize: 14 }} />}
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
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "예보"]} />
                  <Line type="monotone" dataKey="value" stroke="#FF9800" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#FF9800", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: li.color }} /><span style={{ color: "#556", fontSize: 14 }}>실황</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: "#FF9800", borderTop: "2px dashed #FF9800" }} /><span style={{ color: "#556", fontSize: 14 }}>예보</span></div>
            </div>
          </div>}

          {/* 기준값 표시 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
            {Object.entries(LEVELS).map(([lk, lvi]) => (<div key={lk} style={{ padding: "6px 8px", borderRadius: 8, background: lk === lv ? lvi.bg : "rgba(255,255,255,0.02)", border: `1px solid ${lk === lv ? lvi.border : "#1a1a2e"}`, textAlign: "center" }}>
              <div style={{ color: lvi.color, fontSize: 14, fontWeight: 700 }}>{lvi.label}</div>
              <div style={{ color: lk === lv ? "#fff" : "#556", fontSize: 13, fontFamily: "monospace", marginTop: 2 }}>{selected.thresholds[lk]?.[0]}~{selected.thresholds[lk]?.[1] === Infinity ? "∞" : selected.thresholds[lk]?.[1]}</div>
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
              <select onChange={e => {}} id={`action-assignee-${selected.id}`} defaultValue={selected.actionReport?.assigneeId || ""} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}>
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
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>최근 조치 기록:</div>
              <div style={{ color: "#ccd6f6", fontSize: 14, whiteSpace: "pre-wrap" }}>{selected.actionReport.content}</div>
              {selected.actionReport.assigneeName && <div style={{ color: "#FF9800", fontSize: 13, marginTop: 4 }}>👤 담당: {selected.actionReport.assigneeName}</div>}
              {selected.actionReport.createdAt && <div style={{ color: "#445", fontSize: 14, marginTop: 2 }}>🕐 {selected.actionReport.createdAt}</div>}
            </div>}
          </div>}

          {/* 점검사항 */}
          {isWarning && selected.actionItems?.length > 0 && <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
            <h4 style={{ color: "#8892b0", fontSize: 14, margin: "0 0 8px" }}>📋 점검사항</h4>
            {selected.actionItems.map((a, i) => <div key={i} style={{ color: "#999", fontSize: 14, padding: "3px 0" }}>• {a}</div>)}
          </div>}

          {/* CMS 설정 이동 */}
          <button onClick={() => onCardClick(selected.id)} style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#556", fontSize: 14, cursor: "pointer" }}>⚙️ CMS 설정으로 이동</button>
          <button onClick={() => setSelectedId(null)} style={{ marginTop: 8, width: "100%", padding: "14px", borderRadius: 10, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>← 전체 현황으로 돌아가기</button>
        </div>
      </div>
    </div>);
  }

  // ── Main Dashboard View ──
  return (<div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0a0a1a 0%,#0d1b2a 50%,#0a0a1a 100%)", padding: "16px 12px 80px" }}>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

    {/* 컴팩트 헤더 */}
    <div style={{ textAlign: "center", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 28 }}>{settings.logoEmoji}</span>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: 0 }}>{settings.festivalName || "축제 안전관리"}</h1>
          <p style={{ color: "#556", fontSize: 11, margin: 0 }}>{settings.festivalSubtitle}</p>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#8892b0", fontSize: 12 }}>📅 {fmtDate(now)}</span>
        <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{fmtTime(now)}</span>
        {settings.is24HourMode && <span style={{ padding: "1px 6px", borderRadius: 10, background: "rgba(76,175,80,0.15)", color: "#4CAF50", fontSize: 10, fontWeight: 700, animation: "blink 2s infinite" }}>24H</span>}
        {loc.name && <span style={{ color: "#445", fontSize: 11 }}>📍{loc.name}</span>}
        {kma.enabled && <span style={{ color: "#4CAF50", fontSize: 10 }}>🌤️LIVE</span>}
        <button onClick={handleRefresh} disabled={spinning} style={{ padding: "4px 12px", borderRadius: 16, border: "1px solid rgba(33,150,243,0.2)", background: "transparent", color: "#2196F3", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <span style={{ display: "inline-block", animation: spinning ? "spin 1s linear infinite" : "none" }}>🔄</span> {spinning ? "..." : "최신화"}
        </button>
      </div>
    </div>

    {/* 긴급상황 배너 */}
    {settings.emergencyLevel > 0 && <div style={{ maxWidth: 900, margin: "0 auto 8px", padding: "12px 16px", borderRadius: 10, background: settings.emergencyLevel >= 3 ? "rgba(244,67,54,0.15)" : "rgba(255,152,0,0.1)", border: `2px solid ${settings.emergencyLevel >= 3 ? "#F44336" : "#FF9800"}`, textAlign: "center", animation: settings.emergencyLevel >= 3 ? "blink 1.5s infinite" : "none" }}>
      <span style={{ fontSize: 20 }}>🚨</span>
      <span style={{ color: settings.emergencyLevel >= 3 ? "#F44336" : "#FF9800", fontWeight: 900, fontSize: 18, marginLeft: 8 }}>{["", "1단계: 관심", "2단계: 주의", "3단계: 경계", "4단계: 심각"][settings.emergencyLevel]}</span>
      {settings.emergencyMessage && <div style={{ color: "#ccd6f6", fontSize: 14, marginTop: 4 }}>{settings.emergencyMessage}</div>}
    </div>}

    {/* 종합 상태 */}
    <div style={{ maxWidth: 900, margin: "0 auto 8px", padding: "8px 16px", borderRadius: 10, background: olv.bg, border: `1.5px solid ${olv.border}`, textAlign: "center" }}>
      <span style={{ color: olv.color, fontWeight: 800, fontSize: 18 }}>{olv.icon} 종합: {olv.label}</span>
    </div>

    {/* 📢 공지 */}
    {(settings.notices || []).length > 0 && <div style={{ maxWidth: 1100, margin: "0 auto 6px" }}>
      {settings.notices.map(n => (
        <div key={n.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📢</span>
          <span style={{ color: "#ccd6f6", fontSize: 12, fontWeight: 600, flex: 1 }}>{n.content}</span>
          {(userRole === "admin" || userRole === "manager" || userRole === "sysadmin") && <button onClick={() => onDeleteNotice?.(n.id)} style={{ padding: "2px 6px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 12, cursor: "pointer" }}>✕</button>}
        </div>
      ))}
    </div>}

    {/* 조치중 */}
    {(() => { const handling = categories.filter(c => c.actionStatus === "handling"); return handling.length > 0 ? (
      <div style={{ maxWidth: 1100, margin: "0 auto 6px", padding: "8px 12px", borderRadius: 10, background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.2)" }}>
        <span style={{ color: "#FF9800", fontWeight: 700, fontSize: 13 }}>🔧 조치중 {handling.length}건</span>
        {handling.map(cat => <span key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ marginLeft: 8, color: "#ccd6f6", fontSize: 12, cursor: "pointer" }}>{cat.icon}{cat.name}</span>)}
      </div>
    ) : null; })()}

    {/* ═══ 👥 축제장 인원관리 ═══ */}
    <div style={{ maxWidth: 1100, margin: "0 auto 6px" }}>
      <span style={{ color: "#8892b0", fontSize: 14, fontWeight: 800 }}>👥 축제장 인원관리</span>
    </div>
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
      {categories.filter(c => c.id === "crowd" && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const fc = cat.forecast || []; const nextFc = fc[0];
        const crowdLS = (() => { try { return JSON.parse(localStorage.getItem("_crowd") || "{}"); } catch { return {}; } })();
        const cumVal = crowdLS.cumulative || 0;
        const gateData = (settings.gates || []).map(g => { const s = (crowdLS.zones || []).find(sz => sz.id === g.id); return { ...g, count: s?.count || 0, cumulative: s?.cumulative || 0 }; });
        return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "18px 20px", border: `2px solid ${li.border}`, position: "relative", overflow: "hidden", cursor: "pointer" }}>
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: li.color, animation: "blink 1.5s infinite" }} />}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 24 }}>{cat.icon}</span>
            <span style={{ color: "#ccd6f6", fontWeight: 800, fontSize: 20 }}>체류 인원</span>
            {cat.actionStatus && <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(255,152,0,0.15)", color: "#FF9800", fontSize: 12, fontWeight: 700, marginLeft: "auto" }}>🔧조치중</span>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>📡 실황 체류</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 44, fontWeight: 900, color: li.color, fontFamily: "monospace", lineHeight: 1 }}>{cat.currentValue.toLocaleString()}</span>
                <span style={{ fontSize: 18, color: "#8892b0" }}>{cat.unit}</span>
              </div>
            </div>
            <div style={{ textAlign: "right", paddingBottom: 4 }}>
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>📊 누적 방문</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: "#2196F3", lineHeight: 1 }}>{cumVal.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#556", marginTop: 2 }}>명</div>
            </div>
          </div>
          {/* 출입구별 현황 */}
          {gateData.filter(g => g.name).length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6, marginBottom: 8 }}>
            {gateData.filter(g => g.name).map(g => (
              <div key={g.id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
                <div style={{ color: "#8892b0", fontSize: 11 }}>🚪 {g.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
                  <span style={{ color: "#4CAF50", fontSize: 18, fontWeight: 800, fontFamily: "monospace" }}>{g.count}</span>
                  <span style={{ color: "#556", fontSize: 10 }}>체류</span>
                  <span style={{ color: "#556", fontSize: 10, marginLeft: "auto" }}>누적 {g.cumulative}</span>
                </div>
              </div>
            ))}
          </div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 15, fontWeight: 700 }}>{li.icon} {li.label}</span>
            {cat.lastUpdated && <span style={{ color: "#556", fontSize: 12, marginLeft: "auto" }}>🕐 {cat.lastUpdated}</span>}
          </div>
        </div>); })}
    </div>
    {/* 구역별 혼잡도 */}
    {settings.features?.congestion !== false && (settings.zones || []).filter(z => z.name && z.dashboardShow !== false).length > 0 && <div style={{ maxWidth: 1100, margin: "8px auto 0", display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
      {(settings.zones || []).filter(z => z.name && z.dashboardShow !== false).map(z => {
        const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id);
        const CL = { smooth: { label: "원활", color: "#4CAF50", icon: "🟢" }, crowded: { label: "혼잡", color: "#FF9800", icon: "🟡" }, danger: { label: "위험", color: "#F44336", icon: "🔴" } };
        const cl = c ? CL[c.level] : null;
        return (<div key={z.id} style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1.5px solid ${cl?.color || "#333"}44` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: c?.memo || c?.photos?.length ? 8 : 0 }}>
            <span style={{ fontSize: 22 }}>{cl?.icon || "⚪"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccd6f6", fontSize: 16, fontWeight: 800 }}>{z.name}</div>
              {c?.reportedAt && <div style={{ color: "#556", fontSize: 12 }}>👤 {c.reportedByName} · {c.reportedAt}</div>}
            </div>
            <span style={{ color: cl?.color || "#556", fontSize: 20, fontWeight: 900 }}>{cl?.label || "미보고"}</span>
          </div>
          {c?.memo && <div style={{ color: "#ccd6f6", fontSize: 13, lineHeight: 1.5, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 8 }}>💬 {c.memo}</div>}
          {c?.photos?.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {c.photos.map(p => <div key={p.id} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => setViewPhoto(p)}>
              <img src={p.data} alt="" style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 8, border: "1px solid #333" }} />
              <div style={{ color: "#556", fontSize: 10, textAlign: "center", marginTop: 2 }}>{p.time}</div>
            </div>)}
          </div>}
        </div>);
      })}
    </div>}

    {/* ═══ 🌍 환경관리 ═══ */}
    {categories.filter(c => c.id !== "crowd" && !EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).length > 0 && <>
      <div style={{ maxWidth: 1100, margin: "14px auto 6px" }}>
        <span style={{ color: "#8892b0", fontSize: 14, fontWeight: 800 }}>🌍 환경관리</span>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
        {categories.filter(c => c.id !== "crowd" && !EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const fc = cat.forecast || []; const nextFc = fc[0]; return (
          <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "18px 20px", border: `2px solid ${li.border}`, position: "relative", overflow: "hidden", cursor: "pointer" }}>
            {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: li.color, animation: "blink 1.5s infinite" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>{cat.icon}</span>
              <span style={{ color: "#ccd6f6", fontWeight: 800, fontSize: 20 }}>{cat.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>📡 실황</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, color: li.color, fontFamily: "monospace", lineHeight: 1 }}>{cat.currentValue.toLocaleString()}</span>
                  <span style={{ fontSize: 18, color: "#8892b0" }}>{cat.unit}</span>
                </div>
              </div>
              {nextFc && <div style={{ textAlign: "right", paddingBottom: 4 }}>
                <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>📋 예보</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: nextFc.value > cat.currentValue ? "#F44336" : nextFc.value < cat.currentValue ? "#2196F3" : "#8892b0", lineHeight: 1 }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}{nextFc.value}</div>
                <div style={{ fontSize: 11, color: "#556", marginTop: 2 }}>{nextFc.time}</div>
              </div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 15, fontWeight: 700 }}>{li.icon} {li.label}</span>
              {cat.lastUpdated && <span style={{ color: "#556", fontSize: 12, marginLeft: "auto" }}>🕐 {cat.lastUpdated}</span>}
            </div>
            {fc.length > 1 && <div style={{ marginTop: 10, display: "flex", gap: 2, height: 20, alignItems: "flex-end" }}>
              {fc.slice(0, 6).map((f, i) => { const vals = fc.slice(0,6).map(x=>x.value); const mn=Math.min(...vals); const mx=Math.max(...vals); const rng=mx-mn||1; const h=4+((f.value-mn)/rng)*16; return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex:1, height:h, borderRadius:2, background:li.color, opacity:0.3+(i===0?0.7:0) }} />; })}
            </div>}
          </div>); })}
      </div>
    </>}

    {/* 🌤️ 기상 참고 */}
    {categories.filter(c => EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).length > 0 && <div style={{ maxWidth: 1100, margin: "10px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
      {categories.filter(c => EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const tl = getTempLabel(cat); const fc = cat.forecast || []; const nextFc = fc[0]; return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "14px 16px", border: `1px solid ${li.border}`, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>{cat.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 17 }}>{cat.name}</span>
                {tl && <span style={{ color: tl.includes("저온") ? "#2196F3" : "#F44336", fontSize: 13, fontWeight: 700 }}>{tl}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{cat.currentValue.toLocaleString()}</span>
                <span style={{ fontSize: 16, color: "#8892b0" }}>{cat.unit}</span>
                {nextFc && <span style={{ fontSize: 18, fontFamily: "monospace", color: nextFc.value > cat.currentValue ? "#F44336" : nextFc.value < cat.currentValue ? "#2196F3" : "#556", marginLeft: 6 }}>{nextFc.value > cat.currentValue ? "↑" : "↓"} {nextFc.value}</span>}
              </div>
            </div>
            <span style={{ padding: "4px 10px", borderRadius: 10, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 15, fontWeight: 700 }}>{li.label}</span>
          </div>
        </div>); })}
    </div>}

    {/* 주차/셔틀 */}
    {settings.features?.parking !== false && (settings.parkingLots || []).length > 0 && settings.dashboardVisible?.parking !== false && <div style={{ maxWidth: 1100, margin: "10px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 6 }}>
      {(settings.parkingLots || []).map(lot => { const pct = lot.capacity > 0 ? ((lot.current||0)/lot.capacity*100) : 0; const color = pct>=100?"#F44336":pct>=90?"#FF9800":pct>=70?"#FFC107":"#4CAF50"; return (
        <div key={lot.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "10px 12px", border: `1px solid ${color}33` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>🅿️ {lot.name}</span>
            <span style={{ color, fontSize: 15, fontWeight: 800, fontFamily: "monospace" }}>{lot.current||0}/{lot.capacity}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}><div style={{ height: "100%", width: `${Math.min(pct,100)}%`, background: color, borderRadius: 2 }} /></div>
        </div>); })}
    </div>}
    {settings.features?.shuttle !== false && (settings.shuttleBuses || []).length > 0 && <div style={{ maxWidth: 1100, margin: "6px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 6 }}>
      {(settings.shuttleBuses || []).map(bus => { const sc = bus.status==="running"?"#4CAF50":"#FF9800"; const cap=bus.capacity||45; const pax=bus.passengers||0; return (
        <div key={bus.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: "10px 12px", border: `1px solid ${sc}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🚌</span>
            <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14, flex: 1 }}>{bus.name}</span>
            <span style={{ color: sc, fontSize: 11, fontWeight: 700 }}>●{bus.status==="running"?"운행":"대기"}</span>
            <span style={{ color: pax>=cap?"#F44336":"#4CAF50", fontSize: 12, fontWeight: 800, fontFamily: "monospace" }}>👥{pax}/{cap}</span>
          </div>
        </div>); })}
    </div>}

    {/* 범례 */}
    {/* 범례 */}
    <div style={{ maxWidth: 1100, margin: "8px auto 0", display: "flex", justifyContent: "center", gap: 10 }}>
      {Object.entries(LEVELS).map(([k, v]) => (<div key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} /><span style={{ color: "#556", fontSize: 11 }}>{v.label}</span></div>))}
    </div>
    {alerts && alerts.length > 0 && (
      <div style={{ maxWidth: 1100, margin: "20px auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, margin: 0 }}>🔔 최근 알림</h3>
          <button onClick={() => onDeleteAlert?.("all")} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>전체 삭제</button>
        </div>
        {alerts.slice(0, 5).map((a, i) => { const ali = LEVELS[a.level]; return (
          <div key={i} style={{ background: ali.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${ali.border}`, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: ali.color, fontWeight: 700, fontSize: 14 }}>{ali.icon} {a.category}</span>
            <span style={{ color: "#888", fontSize: 14, flex: 1 }}>{a.message.split("\n")[2] || ""}</span>
            <span style={{ color: "#445", fontSize: 13 }}>{a.time}</span>
            <button onClick={(e) => { e.stopPropagation(); onDeleteAlert?.(i); }} style={{ padding: "2px 6px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>); })}
      </div>)}

    {/* 📋 조직도 / 비상연락망 */}
    {(settings.orgChart || []).length > 0 && <DashboardOrgChart settings={settings} show={showOrgChart} onToggle={() => setShowOrgChart(!showOrgChart)} />}

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
              <span style={{ color: "#FF9800", fontSize: 13, fontWeight: 700 }}>항목</span>
              <span style={{ color: "#FF9800", fontSize: 13, fontWeight: 700 }}>지시사항</span>
              <span style={{ color: "#FF9800", fontSize: 13, fontWeight: 700, textAlign: "right" }}>지시일자</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#556", fontSize: 14 }}>→</div>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "6px 10px", background: "rgba(76,175,80,0.1)", borderRadius: "0 8px 0 0", border: "1px solid rgba(76,175,80,0.15)" }}>
              <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>항목</span>
              <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>조치사항</span>
              <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700, textAlign: "right" }}>완료일자</span>
            </div>
          </div>

          {/* 진행중 항목 */}
          {handling.map(cat => (
            <div key={cat.id} style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, marginBottom: 2 }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.1)", borderRadius: "4px 0 0 4px" }}>
                <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700 }}>{cat.icon}{cat.name}</span>
                <span style={{ color: "#ddd", fontSize: 14 }}>{cat.actionReport?.content || "지시 대기"}</span>
                <span style={{ color: "#888", fontSize: 13, textAlign: "right" }}>{cat.handlingStartedAt || "-"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#FF9800", fontSize: 14 }}>🔧</div>
              <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", background: "rgba(255,152,0,0.03)", border: "1px solid rgba(255,152,0,0.08)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ color: "#FF9800", fontSize: 13, fontStyle: "italic" }}>조치 진행중...</span>
              </div>
            </div>
          ))}

          {/* 완료 항목 */}
          {completed.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 16px 1fr", gap: 0, marginBottom: 2 }}>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid #1a1a2e", borderRadius: "4px 0 0 4px" }}>
                <span style={{ color: "#999", fontSize: 13 }}>{r.icon}{r.name}</span>
                <span style={{ color: "#888", fontSize: 14 }}>{r.instruction || "-"}</span>
                <span style={{ color: "#556", fontSize: 13, textAlign: "right" }}>{r.instructedAt || "-"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#4CAF50", fontSize: 14 }}>✅</div>
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 4, padding: "8px 10px", background: "rgba(76,175,80,0.03)", border: "1px solid rgba(76,175,80,0.08)", borderRadius: "0 4px 4px 0" }}>
                <span style={{ color: "#4CAF50", fontSize: 13 }}>{r.icon}{r.name}</span>
                <span style={{ color: "#aaa", fontSize: 14 }}>{r.resolution || "완료"}</span>
                <span style={{ color: "#556", fontSize: 13, textAlign: "right" }}>{r.resolvedAt}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null;
    })()}

    <div style={{ textAlign: "center", marginTop: 24, color: "#334", fontSize: 13 }}>{settings.organization} | {settings.contactNumber}</div>
    <PhotoViewer photo={viewPhoto} onClose={() => setViewPhoto(null)} />
  </div>);
}

// ─── Counter Page ────────────────────────────────────────────────
function CounterPage({ categories, setCategories, settings, setSettings, session }) {
  const crowd = categories.find(c => c.id === "crowd");
  const lv = crowd ? getLevel(crowd) : "BLUE"; const li = LEVELS[lv]; const now = useNow();
  const [log, setLog] = useState([]);
  const [showExport, setShowExport] = useState(false);
  const gates = settings.gates || [];
  const hasGates = gates.length > 1 || (gates.length === 1 && zones[0].name);
  const myGate = session ? gates.find(z => z.accountId === session.id) : null;
  const [selZone, setSelZone] = useState(myGate?.id || null);

  // ★ 인파 데이터 상태
  const [crowdState, setCrowdState] = useState({ total: 0, cumulative: 0, zones: [] });
  const stateRef = useRef(crowdState);

  // 마운트 시 Supabase에서 최신값 로드 + 주기적 확인
  useEffect(() => {
    let mounted = true;
    const fetchDB = () => {
      if (!window.crowdDB) return;
      window.crowdDB.get().then(data => {
        if (!mounted || !data || data.total === undefined) return;
        const d = { total: data.total || 0, cumulative: data.cumulative || 0, zones: data.zones || [] };
        stateRef.current = d;
        setCrowdState(d);
        localStorage.setItem("_crowd", JSON.stringify(d));
      }).catch(() => {});
    };
    fetchDB();
    // 10초마다 Supabase 백업 확인 (Realtime 놓칠 경우 대비)
    const poll = setInterval(fetchDB, 10000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

  // Realtime: 다른 기기에서 변경 시 반영
  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        const d = { total: e.detail.total || 0, cumulative: e.detail.cumulative || 0, zones: e.detail.zones || stateRef.current.zones || [] };
        stateRef.current = d;
        setCrowdState(d);
        localStorage.setItem("_crowd", JSON.stringify(d));
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
  // ★ settings.gates가 구역 정의의 진실 → crowdState에서 카운트만 병합
  const zoneData = gates.map(z => {
    const saved = (crowdState.zones || []).find(sz => sz.id === z.id);
    return { ...z, count: saved?.count || 0, cumulative: saved?.cumulative || 0 };
  });

  // ★ 카운터: 즉시 반영 → localStorage 즉시 → Supabase 비동기
  const adjustTotal = (d) => {
    const prev = stateRef.current;
    const newCur = Math.max(0, (prev.total || 0) + d);
    const newCum = d > 0 ? (prev.cumulative || 0) + d : (prev.cumulative || 0);
    // settings.gates 기준으로 생성, 기존 카운트 병합
    let newZones = gates.map(z => {
      const saved = (prev.zones || []).find(sz => sz.id === z.id);
      return { id: z.id, name: z.name, count: saved?.count || 0, cumulative: saved?.cumulative || 0, range: z.range, assignee: z.assignee };
    });
    if (selZone) {
      newZones = newZones.map(z => z.id === selZone ? { ...z, count: Math.max(0, (z.count || 0) + d), cumulative: d > 0 ? (z.cumulative || 0) + d : (z.cumulative || 0) } : z);
    }

    // 1) ref + state 즉시
    const next = { total: newCur, cumulative: newCum, zones: newZones };
    stateRef.current = next;
    setCrowdState(next);

    // 2) localStorage 즉시 (같은 기기 Dashboard가 읽음)
    localStorage.setItem("_crowd", JSON.stringify(next));

    // 3) categories 업데이트 (경보 판단 + app_state 저장용)

    // 4) Supabase 비동기 (다른 기기 전파)
    if (window.crowdDB) window.crowdDB.set(newCur, newCum, newZones, session?.id || "counter");

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
    XLSX.writeFile(wb, `축제관리_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const showZoneFirst = hasGates && myGate;
  const Stat = ({ label, value, color }) => (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: "#556", fontSize: 14 }}>{label}</div>
      <div style={{ color: color || "#ccd6f6", fontSize: 28, fontWeight: 900, fontFamily: "monospace", lineHeight: 1.2 }}>{(value || 0).toLocaleString()}</div>
    </div>
  );

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{settings.festivalName} 인파 계수</h2>
    <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 16px" }}>{fmtTime(now)}</p>

    {showZoneFirst && (() => { const z = zoneData.find(zz => zz.id === myGate.id); return z ? (
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 12, padding: 16, borderRadius: 16, background: "rgba(76,175,80,0.06)", border: "1.5px solid rgba(76,175,80,0.2)", textAlign: "center" }}>
        <div style={{ color: "#4CAF50", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📍 내 출입구: {z.name}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 30 }}>
          <Stat label="체류" value={z.count || 0} color="#4CAF50" />
          <Stat label="누적" value={z.cumulative || 0} color="#2196F3" />
        </div>
      </div>
    ) : null; })()}

    <div style={{ width: "100%", maxWidth: 400, background: li.bg, border: `2px solid ${li.border}`, borderRadius: 20, padding: 20, textAlign: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 30, marginBottom: 8 }}>
        <div>
          <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 2 }}>🏃 체류 인원</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{curTotal.toLocaleString()}</div>
          <div style={{ color: li.color, fontSize: 14, fontWeight: 700 }}>{li.icon} {li.label}</div>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <div>
          <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 2 }}>📊 누적 방문</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#2196F3", fontFamily: "monospace" }}>{cumTotal.toLocaleString()}</div>
          <div style={{ color: "#556", fontSize: 14 }}>총 방문객</div>
        </div>
      </div>
      {settings.venueArea > 0 && <div style={{ color: "#8892b0", fontSize: 13 }}>밀집도: {(curTotal / settings.venueArea).toFixed(2)}명/㎡</div>}
    </div>

    {hasGates && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => setSelZone(null)} style={{ padding: "8px 14px", borderRadius: 8, border: !selZone ? "1.5px solid #2196F3" : "1px solid #333", background: !selZone ? "rgba(33,150,243,0.15)" : "transparent", color: !selZone ? "#2196F3" : "#667", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>전체</button>
        {zoneData.filter(z => z.name).map(z => (
          <button key={z.id} onClick={() => setSelZone(z.id)} style={{ padding: "8px 14px", borderRadius: 8, border: selZone === z.id ? "1.5px solid #4CAF50" : "1px solid #333", background: selZone === z.id ? "rgba(76,175,80,0.15)" : "transparent", color: selZone === z.id ? "#4CAF50" : "#667", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
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
      <div style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▲ 입장 (체류 + 누적 증가)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
      </div>
      <div style={{ color: "#F44336", fontSize: 13, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▼ 퇴장 (체류만 감소, 누적 유지)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(-n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input id="cc" type="number" placeholder="직접 입력" style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16 }} />
        <button onClick={() => { const e = document.getElementById("cc"); const v = parseInt(e.value); if (!isNaN(v)) { adjustTotal(v); e.value = ""; } }} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer" }}>적용</button>
      </div>
    </div>

    {hasGates && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>🗺️ 출입구별 현황</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {zoneData.filter(z => z.name).map(z => (
          <div key={z.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: selZone === z.id ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, border: selZone === z.id ? "1px solid rgba(76,175,80,0.2)" : "1px solid transparent" }}>
            <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{z.name}</span>
            <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 800, fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>{(z.count || 0).toLocaleString()}</span>
            <span style={{ color: "#445", fontSize: 14, margin: "0 2px" }}>/</span>
            <span style={{ color: "#2196F3", fontSize: 13, fontWeight: 700, fontFamily: "monospace", minWidth: 50, textAlign: "right" }}>{(z.cumulative || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>}

    <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <button onClick={() => setShowExport(!showExport)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>{showExport ? "▲ 닫기" : "📊 데이터 관리 / 엑셀 내보내기"}</button>
      {showExport && <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid #222", display: "grid", gap: 8 }}>
        <button onClick={saveDailyRecord} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4CAF50,#388E3C)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📋 금일 데이터 저장 (일일 마감)</button>
        <button onClick={() => exportExcel("hourly")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📥 시간별 현황 엑셀</button>
        <button onClick={() => exportExcel("daily")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📥 일자별 현황 엑셀</button>
        <button onClick={() => exportExcel("all")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📥 전체 데이터 엑셀</button>
      </div>}
    </div>

    <div style={{ width: "100%", maxWidth: 400 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>입력 기록</h3>
      <div style={{ maxHeight: 160, overflow: "auto" }}>
        {log.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6, color: "#aaa", fontSize: 13 }}>
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
    <p style={{ color: "#8892b0", fontSize: 14, textAlign: "center", margin: "0 0 20px" }}>{settings.festivalName} | {fmtTime(now)}</p>

    {myLots.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🅿️</div>
      <p style={{ fontSize: 14 }}>배정된 주차장이 없습니다</p>
      <p style={{ fontSize: 14, color: "#445" }}>관리자에게 주차장 배정을 요청하세요</p>
    </div>}

    {myLots.map(lot => {
      const lv = getParkingLevel(lot); const li = LEVELS[lv];
      const remain = lot.capacity - (lot.current || 0);
      const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
      return (
        <div key={lot.id} style={{ maxWidth: 400, margin: "0 auto 20px", background: "rgba(255,255,255,0.03)", borderRadius: 20, padding: 24, border: `2px solid ${li.border}` }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>🅿️ {lot.name}</h3>
            {lot.address && <p style={{ color: "#556", fontSize: 13, margin: 0 }}>📍 {lot.address}</p>}
          </div>

          {/* 현황 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ color: "#8892b0", fontSize: 14, marginBottom: 4 }}>현재 주차</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: li.color, fontFamily: "monospace" }}>{(lot.current || 0).toLocaleString()}</div>
            <div style={{ color: "#8892b0", fontSize: 13 }}>/ {lot.capacity.toLocaleString()}대</div>
            <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: li.color, borderRadius: 4, transition: "width .5s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ color: li.color, fontSize: 14, fontWeight: 700 }}>{pct.toFixed(0)}% 사용</span>
              <span style={{ color: remain <= 0 ? "#F44336" : "#4CAF50", fontSize: 14, fontWeight: 700 }}>잔여 {remain}대</span>
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
          {lot.lastUpdated && <div style={{ textAlign: "center", marginTop: 8, color: "#445", fontSize: 14 }}>🕐 {lot.lastUpdated}</div>}
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
    <p style={{ color: "#8892b0", fontSize: 14, textAlign: "center", margin: "0 0 20px" }}>{settings.festivalName} | {fmtTime(now)}</p>

    {myBuses.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🚌</div>
      <p style={{ fontSize: 14 }}>배정된 셔틀버스가 없습니다</p>
      <p style={{ fontSize: 14, color: "#445" }}>관리자에게 배정을 요청하세요</p>
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
            {bus.route && <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 4px" }}>노선: {bus.route}</p>}
            <span style={{ color: "#556", fontSize: 13 }}>{cap}인승</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ padding: "4px 14px", borderRadius: 20, background: `${sc}22`, border: `1px solid ${sc}44`, color: sc, fontSize: 14, fontWeight: 700 }}>{statusLabels[bus.status || "off"]}</span>
            </div>
          </div>

          {/* ★ 탑승인원 카운터 */}
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: isFull ? "rgba(244,67,54,0.08)" : "rgba(76,175,80,0.05)", border: `1.5px solid ${isFull ? "rgba(244,67,54,0.2)" : "rgba(76,175,80,0.12)"}` }}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>탑승인원</div>
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
              <button onClick={() => updateBus(bus.id, { passengers: 0 })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #555", background: "transparent", color: "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 초기화 (0명)</button>
              <button onClick={() => updateBus(bus.id, { passengers: cap })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${isFull ? "#a33" : "#555"}`, background: isFull ? "rgba(244,67,54,0.1)" : "transparent", color: isFull ? "#F44336" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🚫 만차 ({cap}명)</button>
            </div>
          </div>

          {/* 현재 위치 */}
          {bus.currentStopName && <div style={{ textAlign: "center", marginBottom: 16, padding: 14, borderRadius: 12, background: "rgba(0,188,212,0.08)", border: "1px solid rgba(0,188,212,0.15)" }}>
            <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>현재 위치</div>
            <div style={{ color: "#00BCD4", fontSize: 20, fontWeight: 800 }}>📍 {bus.currentStopName}</div>
            {bus.lastUpdated && <div style={{ color: "#556", fontSize: 14, marginTop: 4 }}>🕐 {bus.lastUpdated}</div>}
          </div>}

          {/* 운행 상태 버튼 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ s: "running", l: "🟢 운행", c: "#4CAF50" }, { s: "stopped", l: "🟡 대기", c: "#FF9800" }, { s: "off", l: "🔴 종료", c: "#F44336" }].map(st => (
              <button key={st.s} onClick={() => updateBus(bus.id, { status: st.s })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: bus.status === st.s ? `2px solid ${st.c}` : "1px solid #333", background: bus.status === st.s ? `${st.c}15` : "transparent", color: bus.status === st.s ? st.c : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{st.l}</button>
            ))}
          </div>

          {/* 정류장 버튼 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📍 정류장 도착</div>
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
                    {isCurrent && <span style={{ fontSize: 13, color: "#00BCD4" }}>📍 현재</span>}
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

// ─── Photo Viewer Modal ──────────────────────────────────────────
function PhotoViewer({ photo, onClose, onDelete }) {
  if (!photo) return null;
  return (<div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <img src={photo.data} alt="" style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "#8892b0", fontSize: 14 }}>🕐 {photo.time}</span>
      {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #F44336", background: "rgba(244,67,54,0.15)", color: "#F44336", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗑 사진 삭제</button>}
      <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #555", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, cursor: "pointer" }}>닫기</button>
    </div>
  </div>);
}

// ─── Festival Status Page (축제관리) ─────────────────────────────
function FestivalStatusPage({ settings, setSettings, session }) {
  const zones = settings.zones || [];
  const workSites = settings.workSites || [];
  const isAdmin = session?.role === "admin" || session?.role === "manager" || session?.role === "sysadmin" || session?.role === "zonemgr";
  const myZone = zones.find(z => z.accountId === session?.id);
  const [mode, setMode] = useState("festival");
  const [reqTarget, setReqTarget] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [zoneOpen, setZoneOpen] = useState(() => {
    const open = {};
    (settings.zones || []).forEach(z => { open[z.id] = z.accountId === session?.id; });
    return open;
  });
  const toggleZone = (zid) => setZoneOpen(p => ({ ...p, [zid]: !p[zid] }));

  const SITE_CONG = { smooth: { label: "원활", color: "#4CAF50", icon: "🟢" }, crowded: { label: "혼잡", color: "#FF9800", icon: "🟡" }, danger: { label: "위험", color: "#F44336", icon: "🔴" } };

  const STATUS_NORMAL = { standby: { label: "대기", color: "#8892b0", icon: "⏳" }, active: { label: "진행", color: "#4CAF50", icon: "🟢" }, break: { label: "휴식", color: "#FF9800", icon: "☕" }, done: { label: "종료", color: "#556", icon: "⬛" } };
  const STATUS_SAFETY = { monitoring: { label: "상황관리중", color: "#2196F3", icon: "🔍" }, fieldSupport: { label: "현장지원", color: "#FF9800", icon: "🚨" }, incident: { label: "사고대처", color: "#F44336", icon: "🆘" } };
  const STATUS_SUPPORT = { waiting: { label: "지원대기", color: "#8892b0", icon: "⏳" }, moving: { label: "현장이동중", color: "#FF9800", icon: "🚗" }, supporting: { label: "현장지원중", color: "#4CAF50", icon: "🚑" } };
  const getStatusMap = (zone) => zone?.zoneType === "safety" ? STATUS_SAFETY : zone?.zoneType === "support" ? STATUS_SUPPORT : STATUS_NORMAL;

  const setStatus = (siteId, status) => { const site = workSites.find(s => s.id === siteId); setSettings(prev => ({ ...prev, workSites: (prev.workSites || []).map(s => s.id === siteId ? { ...s, status } : s), timeline: [...(prev.timeline || []), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "status", message: `📊 ${site?.name || ""} 상태 → ${status}`, actor: session?.name }] })); };
  const sendRequest = () => {
    if (!reqTarget || !reqMsg) { alert("대상과 내용을 입력하세요."); return; }
    const tZone = zones.find(z => z.id === reqTarget);
    setSettings(prev => ({ ...prev, zoneRequests: [...(prev.zoneRequests || []), { id: "req_" + Date.now(), fromZoneId: myZone?.id, fromZoneName: myZone?.name || session?.name, targetZoneId: reqTarget, message: reqMsg, status: "pending", createdAt: new Date().toLocaleString("ko-KR") }], timeline: [...(prev.timeline || []), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "request", message: `📨 요청 전송 → ${tZone?.name}: ${reqMsg.slice(0,30)}`, actor: session?.name }] }));
    setReqMsg(""); setReqTarget(""); alert("✅ 요청 전송 완료");
  };
  const updateReqStatus = (reqId, status) => { const stLabel = { accepted: "접수완료", completed: "조치완료" }[status] || status; setSettings(prev => ({ ...prev, zoneRequests: (prev.zoneRequests || []).map(r => r.id === reqId ? { ...r, status, [status === "accepted" ? "acceptedAt" : "completedAt"]: new Date().toLocaleString("ko-KR") } : r), timeline: [...(prev.timeline || []), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "request", message: `📨 요청 ${stLabel}`, actor: session?.name }] })); };

  const now = new Date();
  const opStart = settings.operatingStart || "08:00";
  const opEnd = settings.operatingEnd || "22:00";
  const totalWorkers = workSites.reduce((n, s) => n + (s.workers || []).length, 0);
  const safetyZones = zones.filter(z => z.zoneType === "safety" && z.name);
  const supportZones = zones.filter(z => z.zoneType === "support" && z.name);
  const normalZones = zones.filter(z => (!z.zoneType || z.zoneType === "normal") && z.name);
  const myRequests = (settings.zoneRequests || []).filter(r => r.targetZoneId === myZone?.id && r.status !== "completed");
  const pendingCount = (settings.zoneRequests || []).filter(r => r.status === "pending").length;
  const congestionData = settings.zoneCongestion || [];
  const dangerCount = congestionData.filter(c => c.level === "danger").length;
  const crowdedCount = congestionData.filter(c => c.level === "crowded").length;

  const canEditZone = (zone) => {
    const r = session?.role;
    if (r === "admin" || r === "manager" || r === "sysadmin") return true;
    return zone?.accountId === session?.id;
  };

  const renderSiteBlock = (site, statusMap, zone) => {
    const st = statusMap[site.status] || Object.values(statusMap)[0];
    const canEdit = canEditZone(zone);
    const sc = SITE_CONG[site.congestion] || null;
    const setCong = (siteId, level) => setSettings(prev => ({ ...prev, workSites: (prev.workSites || []).map(s => s.id === siteId ? { ...s, congestion: level } : s) }));
    return (<div key={site.id} style={{ padding: "10px 14px", borderTop: "1px solid #1a1a2e" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12 }}>🏠</span>
        <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700, flex: 1 }}>{site.name}</span>
        {sc && <span style={{ padding: "2px 6px", borderRadius: 6, background: `${sc.color}15`, color: sc.color, fontSize: 11, fontWeight: 700 }}>{sc.icon}{sc.label}</span>}
        <span style={{ padding: "2px 8px", borderRadius: 8, background: `${st.color}22`, color: st.color, fontSize: 12, fontWeight: 700 }}>{st.icon} {st.label}</span>
      </div>
      {canEdit && <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {Object.entries(statusMap).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(site.id, k)} style={{ flex: 1, padding: "7px 2px", borderRadius: 6, border: site.status === k ? `2px solid ${v.color}` : "1px solid #333", background: site.status === k ? `${v.color}15` : "transparent", color: v.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{v.icon} {v.label}</button>
        ))}
      </div>}
      {canEdit && <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {Object.entries(SITE_CONG).map(([k, v]) => (
          <button key={k} onClick={() => setCong(site.id, site.congestion === k ? null : k)} style={{ flex: 1, padding: "5px 2px", borderRadius: 6, border: site.congestion === k ? `2px solid ${v.color}` : "1px solid #222", background: site.congestion === k ? `${v.color}10` : "transparent", color: v.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{v.icon} {v.label}</button>
        ))}
      </div>}
      {(site.workers || []).map(w => (
        <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 13 }}>
          <span style={{ color: "#ccd6f6", fontWeight: 700 }}>{w.name}</span>
          {w.type && <span style={{ color: "#CE93D8", fontSize: 11 }}>{w.type}</span>}
          {w.role && <span style={{ color: "#009688", fontSize: 11 }}>{w.role}</span>}
          {w.phone && <a href={`tel:${w.phone.replace(/-/g, "")}`} style={{ color: "#4CAF50", fontSize: 12, textDecoration: "none", marginLeft: "auto" }}>📞</a>}
        </div>
      ))}
    </div>);
  };

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", padding: "20px 16px 80px" }}>
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 2px" }}>🎪 {settings.festivalName || "축제관리"}</h2>
        <div style={{ color: "#8892b0", fontSize: 13 }}>🕐 {opStart}~{opEnd} · 현재 {now.toLocaleTimeString("ko-KR")}</div>
      </div>

      {/* 긴급상황 배너 */}
      {settings.emergencyLevel > 0 && <div style={{ padding: "14px 16px", borderRadius: 12, background: settings.emergencyLevel >= 3 ? "rgba(244,67,54,0.15)" : "rgba(255,152,0,0.1)", border: `2px solid ${settings.emergencyLevel >= 3 ? "#F44336" : "#FF9800"}`, marginBottom: 10, animation: settings.emergencyLevel >= 3 ? "blink 1.5s infinite" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{["", "🔵", "🟡", "🟠", "🔴"][settings.emergencyLevel]}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: settings.emergencyLevel >= 3 ? "#F44336" : "#FF9800", fontSize: 16, fontWeight: 900 }}>🚨 {["", "1단계: 관심", "2단계: 주의", "3단계: 경계", "4단계: 심각"][settings.emergencyLevel]}</div>
            {settings.emergencyMessage && <div style={{ color: "#ccd6f6", fontSize: 14, marginTop: 4 }}>{settings.emergencyMessage}</div>}
          </div>
          <span style={{ color: "#556", fontSize: 11 }}>{settings.emergencyAt}</span>
        </div>
      </div>}

      {/* 종합 현황 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[{ label: "구역", value: zones.filter(z=>z.name).length, color: "#2196F3", icon: "📍" },
          { label: "근무지", value: workSites.filter(s=>s.zoneId).length, color: "#009688", icon: "🏠" },
          { label: "근무자", value: totalWorkers, color: "#4CAF50", icon: "👷" },
          { label: "요청", value: pendingCount, color: pendingCount > 0 ? "#F44336" : "#556", icon: "🔔" }
        ].map(c => (
          <div key={c.label} style={{ padding: "10px 6px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${c.color}33`, textAlign: "center" }}>
            <div style={{ fontSize: 14 }}>{c.icon}</div>
            <div style={{ color: c.color, fontSize: 22, fontWeight: 900, fontFamily: "monospace" }}>{c.value}</div>
            <div style={{ color: "#556", fontSize: 11 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {congestionData.length > 0 && <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
        {[{ icon: "🟢", label: "원활", count: congestionData.filter(c => c.level === "smooth").length, color: "#4CAF50" },
          { icon: "🟡", label: "혼잡", count: crowdedCount, color: "#FF9800" },
          { icon: "🔴", label: "위험", count: dangerCount, color: "#F44336" }
        ].filter(c => c.count > 0).map(c => (
          <span key={c.label} style={{ padding: "4px 12px", borderRadius: 8, background: `${c.color}15`, color: c.color, fontSize: 13, fontWeight: 700 }}>{c.icon} {c.label} {c.count}</span>
        ))}
      </div>}

      {/* 모드 전환 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
        <button onClick={() => setMode("festival")} style={{ padding: "12px", borderRadius: 10, border: mode === "festival" ? "2px solid #2196F3" : "1px solid #333", background: mode === "festival" ? "rgba(33,150,243,0.1)" : "transparent", color: mode === "festival" ? "#2196F3" : "#556", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>🎪 축제관리</button>
        <button onClick={() => setMode("safety")} style={{ padding: "12px", borderRadius: 10, border: mode === "safety" ? "2px solid #F44336" : "1px solid #333", background: mode === "safety" ? "rgba(244,67,54,0.1)" : "transparent", color: mode === "safety" ? "#F44336" : "#556", fontSize: 15, fontWeight: 800, cursor: "pointer", position: "relative" }}>
          🛡️ 안전관리
          {(pendingCount + dangerCount) > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: 10, background: "#F44336", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{pendingCount + dangerCount}</span>}
        </button>
      </div>

      {/* 축제관리 모드 */}
      {mode === "festival" && <>
        {/* 프로그램 일정 */}
        {(settings.programs || []).length > 0 && (() => {
          const now3 = new Date(); const nowMin = now3.getHours()*60+now3.getMinutes();
          const sorted = [...(settings.programs||[])].sort((a,b) => (a.time||"").localeCompare(b.time||""));
          const current = sorted.find(p => { const [sh,sm]=(p.time||"00:00").split(":").map(Number); const [eh,em]=(p.endTime||"23:59").split(":").map(Number); return nowMin>=sh*60+sm && nowMin<=eh*60+em; });
          const next = sorted.find(p => { const [sh,sm]=(p.time||"00:00").split(":").map(Number); return sh*60+sm > nowMin; });
          return (<div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(156,39,176,0.04)", border: "1px solid rgba(156,39,176,0.15)", marginBottom: 12 }}>
            <div style={{ color: "#CE93D8", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🎭 프로그램</div>
            {current && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(76,175,80,0.06)", marginBottom: 4 }}>
              <span style={{ color: "#4CAF50", fontSize: 12, fontWeight: 700 }}>🟢 진행중</span>
              <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700 }}>{current.title}</span>
              <span style={{ color: "#556", fontSize: 12, marginLeft: "auto" }}>{current.time}~{current.endTime} {current.location}</span>
            </div>}
            {next && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px" }}>
              <span style={{ color: "#8892b0", fontSize: 12 }}>⏭ 다음</span>
              <span style={{ color: "#8892b0", fontSize: 13 }}>{next.title}</span>
              <span style={{ color: "#556", fontSize: 12, marginLeft: "auto" }}>{next.time}~ {next.location}</span>
            </div>}
            {!current && !next && <div style={{ color: "#556", fontSize: 12 }}>진행중/예정 프로그램 없음</div>}
          </div>);
        })()}
        {normalZones.map(zone => {
          const sites = workSites.filter(s => s.zoneId === zone.id);
          const cg = congestionData.find(c => c.zoneId === zone.id);
          const CL = { smooth: { icon: "🟢" }, crowded: { icon: "🟡" }, danger: { icon: "🔴" } };
          const open = zoneOpen[zone.id];
          const siteCongs = sites.filter(s => s.congestion).map(s => SITE_CONG[s.congestion]);
          return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid #222", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
            <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ color: "#2196F3", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontSize: 14 }}>📍</span>
              <span style={{ color: "#2196F3", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
              {cg && <span>{CL[cg.level]?.icon}</span>}
              {!open && siteCongs.length > 0 && siteCongs.map((sc, i) => <span key={i} style={{ fontSize: 12 }}>{sc.icon}</span>)}
              <span style={{ color: "#556", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
            </div>
            {open && sites.map(site => renderSiteBlock(site, STATUS_NORMAL, zone))}
            {open && sites.length === 0 && <div style={{ padding: 12, color: "#445", fontSize: 12, textAlign: "center" }}>근무지 없음</div>}
          </div>);
        })}
        {normalZones.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#556" }}>일반 관리구역이 없습니다.</div>}
      </>}

      {/* 안전관리 모드 */}
      {mode === "safety" && <>
        {/* 긴급상황 발령 */}
        {isAdmin && <div style={{ padding: "14px", borderRadius: 12, background: "rgba(244,67,54,0.04)", border: "1px solid rgba(244,67,54,0.15)", marginBottom: 14 }}>
          <div style={{ color: "#F44336", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>🚨 긴급상황 발령</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
            {[{ lv: 0, label: "해제", color: "#4CAF50" }, { lv: 1, label: "관심", color: "#2196F3" }, { lv: 2, label: "주의", color: "#FFC107" }, { lv: 3, label: "경계", color: "#FF9800" }, { lv: 4, label: "심각", color: "#F44336" }].map(e => (
              <button key={e.lv} onClick={() => {
                setSettings(prev => ({ ...prev, emergencyLevel: e.lv, emergencyAt: e.lv > 0 ? new Date().toLocaleString("ko-KR") : null, timeline: [...(prev.timeline||[]), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "emergency", message: e.lv > 0 ? `🚨 긴급상황 ${e.lv}단계(${e.label}) 발령` : "✅ 긴급상황 해제", actor: session?.name }] }));
              }} style={{ padding: "10px 2px", borderRadius: 8, border: settings.emergencyLevel === e.lv ? `2px solid ${e.color}` : "1px solid #333", background: settings.emergencyLevel === e.lv ? `${e.color}20` : "transparent", color: e.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{e.lv === 0 ? "✅" : e.lv+"단계"}<br/>{e.label}</button>
            ))}
          </div>
          {settings.emergencyLevel > 0 && <Input value={settings.emergencyMessage || ""} onChange={e => setSettings(prev => ({ ...prev, emergencyMessage: e.target.value }))} placeholder="긴급상황 내용 입력" style={{ marginBottom: 6 }} />}
        </div>}

        {/* 의료 현황 요약 */}
        {(settings.medicalRecords || []).length > 0 && <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,152,0,0.04)", border: "1px solid rgba(255,152,0,0.15)", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#FF9800", fontSize: 14, fontWeight: 800 }}>🏥 의료 현황</span>
            <span style={{ color: "#FF9800", fontSize: 13 }}>치료중 {(settings.medicalRecords||[]).filter(m=>m.status==="treating").length}</span>
            <span style={{ color: "#2196F3", fontSize: 13 }}>이송 {(settings.medicalRecords||[]).filter(m=>m.status==="transferred").length}</span>
            <span style={{ color: "#4CAF50", fontSize: 13 }}>귀가 {(settings.medicalRecords||[]).filter(m=>m.status==="discharged").length}</span>
          </div>
          {(settings.medicalRecords||[]).filter(m=>m.status==="treating").map((mr,i) => (
            <div key={mr.id} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 3, fontSize: 13, display: "flex", gap: 6 }}>
              <span style={{ color: "#FF9800", fontWeight: 700 }}>🆘</span>
              <span style={{ color: "#ccd6f6" }}>{mr.patient || "환자"} — {mr.symptoms}</span>
              <span style={{ color: "#556", marginLeft: "auto", fontSize: 11 }}>{mr.location}</span>
            </div>
          ))}
        </div>}

        {myRequests.length > 0 && <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#F44336", fontSize: 15, fontWeight: 800, marginBottom: 8 }}>🔔 수신 요청 ({myRequests.length}건)</div>
          {myRequests.map(req => {
            const rst = req.status === "accepted" ? { label: "접수완료", color: "#2196F3", icon: "✅" } : { label: "접수대기", color: "#FF9800", icon: "⏳" };
            return (<div key={req.id} style={{ padding: "14px", borderRadius: 12, background: "rgba(244,67,54,0.04)", border: `1.5px solid ${rst.color}44`, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: rst.color, fontSize: 14, fontWeight: 700 }}>{rst.icon} {rst.label}</span>
                <span style={{ color: "#ccd6f6", fontSize: 14 }}>← {req.fromZoneName}</span>
                <span style={{ color: "#556", fontSize: 11, marginLeft: "auto" }}>{req.createdAt}</span>
              </div>
              <div style={{ color: "#ccd6f6", fontSize: 14, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 8 }}>💬 {req.message}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {req.status === "pending" && <button onClick={() => updateReqStatus(req.id, "accepted")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 접수완료</button>}
                <button onClick={() => updateReqStatus(req.id, "completed")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#4CAF50", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🏁 조치완료</button>
              </div>
            </div>);
          })}
        </div>}

        {myZone && (safetyZones.length > 0 || supportZones.length > 0) && <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid #222", marginBottom: 14 }}>
          <div style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>📨 요청 보내기</div>
          <select value={reqTarget} onChange={e => setReqTarget(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, marginBottom: 8 }}>
            <option value="">대상 선택...</option>
            {safetyZones.map(z => <option key={z.id} value={z.id}>🛡️ {z.name}</option>)}
            {supportZones.map(z => <option key={z.id} value={z.id}>🚑 {z.name}</option>)}
          </select>
          <textarea value={reqMsg} onChange={e => setReqMsg(e.target.value)} placeholder="요청 내용" rows={3} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 8 }} />
          <button onClick={sendRequest} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: reqTarget && reqMsg ? "#F44336" : "#333", color: "#fff", fontSize: 15, fontWeight: 700, cursor: reqTarget && reqMsg ? "pointer" : "default", opacity: reqTarget && reqMsg ? 1 : 0.5 }}>🚨 요청 전송</button>
        </div>}

        {safetyZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(244,67,54,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(244,67,54,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#F44336", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🛡️</span><span style={{ color: "#F44336", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#556", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_SAFETY, zone))}
        </div>); })}

        {supportZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(255,152,0,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(255,152,0,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#FF9800", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🚑</span><span style={{ color: "#FF9800", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#556", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_SUPPORT, zone))}
        </div>); })}

        {(settings.zoneRequests || []).filter(r => r.status === "completed").length > 0 && <div>
          <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📋 조치완료 이력</div>
          {(settings.zoneRequests || []).filter(r => r.status === "completed").reverse().slice(0, 10).map(r => {
            const tZone = zones.find(z => z.id === r.targetZoneId);
            return <div key={r.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(76,175,80,0.04)", border: "1px solid rgba(76,175,80,0.1)", marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: "#4CAF50", fontWeight: 700 }}>✅</span> {r.fromZoneName} → {tZone?.name} <span style={{ color: "#556" }}>{r.completedAt}</span>
              <div style={{ color: "#556" }}>{r.message}</div>
            </div>;
          })}
        </div>}

        {safetyZones.length === 0 && supportZones.length === 0 && myRequests.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#556" }}>안전/지원 구역이 없습니다.</div>}
      </>}
    </div>
  </div>);
}


// ─── Program Page (축제 프로그램) ─────────────────────────────────
function ProgramPage({ settings }) {
  const programs = (settings.programs || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const dates = settings.festivalDates || [];
  const [selDate, setSelDate] = useState(dates[0] || new Date().toISOString().slice(0, 10));
  const [selCat, setSelCat] = useState("all");
  const CATS = { all: "전체", P: "공연", E: "체험", S: "부대" };
  const CAT_COLORS = { P: "#E91E63", E: "#4CAF50", S: "#FF9800" };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = selDate === now.toISOString().slice(0, 10);

  const filtered = programs.filter(p => {
    if (p.date && p.date !== selDate) return false;
    if (!p.date && dates.length > 0 && selDate !== dates[0]) return false;
    if (selCat !== "all" && p.category !== selCat) return false;
    return true;
  });

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", padding: "20px 16px 80px" }}>
    <div style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 4px" }}>🎭 축제 프로그램</h2>
      <p style={{ color: "#8892b0", fontSize: 13, textAlign: "center", margin: "0 0 14px" }}>{settings.festivalName || "축제"}</p>

      {/* 일자 선택 */}
      {dates.length > 0 && <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        {dates.map((d, i) => {
          const dt = new Date(d);
          const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
          const label = `${dt.getMonth() + 1}/${dt.getDate()} (${dayNames[dt.getDay()]})`;
          const active = selDate === d;
          return (<button key={d} onClick={() => setSelDate(d)} style={{ padding: "10px 16px", borderRadius: 10, border: active ? "2px solid #9C27B0" : "1px solid #333", background: active ? "rgba(156,39,176,0.15)" : "transparent", color: active ? "#CE93D8" : "#556", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {i === 0 ? "첫째 날" : i === dates.length - 1 ? "마지막 날" : `${i + 1}일차`}<br /><span style={{ fontSize: 12 }}>{label}</span>
          </button>);
        })}
      </div>}

      {/* 카테고리 필터 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(CATS).map(([k, v]) => (
          <button key={k} onClick={() => setSelCat(k)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: selCat === k ? "2px solid #9C27B0" : "1px solid #333", background: selCat === k ? "rgba(156,39,176,0.1)" : "transparent", color: selCat === k ? "#CE93D8" : "#556", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{v}</button>
        ))}
      </div>

      {/* 프로그램 목록 */}
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>등록된 프로그램이 없습니다.</div>}
      {filtered.map(pg => {
        const [sh, sm] = (pg.time || "00:00").split(":").map(Number);
        const [eh, em] = (pg.endTime || "23:59").split(":").map(Number);
        const isNow = isToday && nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
        const isPast = isToday && nowMin > eh * 60 + em;
        const catColor = CAT_COLORS[pg.category] || "#8892b0";
        const catLabel = CATS[pg.category] || pg.category || "";

        return (<div key={pg.id} style={{ padding: "14px 16px", borderRadius: 12, background: isNow ? "rgba(76,175,80,0.08)" : "rgba(255,255,255,0.03)", border: isNow ? "2px solid rgba(76,175,80,0.3)" : "1px solid #222", marginBottom: 6, opacity: isPast ? 0.5 : 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <div style={{ color: isNow ? "#4CAF50" : "#ccd6f6", fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>{pg.time || "--:--"}</div>
              <div style={{ color: "#556", fontSize: 11 }}>~{pg.endTime || "--:--"}</div>
            </div>
            <div style={{ width: 3, height: 40, background: isNow ? "#4CAF50" : catColor, borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                {isNow && <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(76,175,80,0.15)", color: "#4CAF50", fontSize: 11, fontWeight: 700 }}>진행중</span>}
                {catLabel && <span style={{ padding: "1px 6px", borderRadius: 4, background: `${catColor}15`, color: catColor, fontSize: 11, fontWeight: 700 }}>{catLabel}</span>}
              </div>
              <div style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700 }}>{pg.title}</div>
              {pg.location && <div style={{ color: "#556", fontSize: 12, marginTop: 2 }}>📍 {pg.location}</div>}
              {pg.memo && <div style={{ color: "#556", fontSize: 12 }}>{pg.memo}</div>}
            </div>
          </div>
        </div>);
      })}
    </div>
  </div>);
}

// ─── Congestion Page (인파혼잡도) ─────────────────────────────────
function CongestionPage({ settings, setSettings, session }) {
  const zones = settings.zones || [];
  const myZone = zones.find(z => z.accountId === session?.id);
  const congestion = settings.zoneCongestion || [];
  const [selLevel, setSelLevel] = useState({});
  const [memos, setMemos] = useState({});
  const [zonePhotos, setZonePhotos] = useState({});
  const [viewPhoto, setViewPhoto] = useState(null);
  const [viewPhotoZone, setViewPhotoZone] = useState(null);
  const CONG_LEVELS = { smooth: { label: "원활", color: "#4CAF50", icon: "🟢", bg: "rgba(76,175,80,0.1)" }, crowded: { label: "혼잡", color: "#FF9800", icon: "🟡", bg: "rgba(255,152,0,0.1)" }, danger: { label: "위험", color: "#F44336", icon: "🔴", bg: "rgba(244,67,54,0.1)" } };

  const handlePhoto = (zoneId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 400;
        let w = img.width, h = img.height;
        if (w > max || h > max) { if (w > h) { h = h * max / w; w = max; } else { w = w * max / h; h = max; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const thumb = canvas.toDataURL("image/jpeg", 0.6);
        setZonePhotos(p => ({ ...p, [zoneId]: [...(p[zoneId] || []), { id: "p_" + Date.now(), data: thumb, time: new Date().toLocaleTimeString("ko-KR") }] }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const submitReport = (zoneId) => {
    const level = selLevel[zoneId];
    if (!level) { alert("혼잡도 단계를 선택하세요."); return; }
    const zone = zones.find(z => z.id === zoneId);
    const photos = zonePhotos[zoneId] || [];
    const memo = memos[zoneId] || "";
    const report = { zoneId, zoneName: zone?.name || "", level, reportedBy: session.id, reportedByName: session.name, reportedAt: new Date().toLocaleString("ko-KR"), photos: photos.map(p => ({ ...p })), memo };
    setSettings(prev => ({
      ...prev,
      zoneCongestion: [...(prev.zoneCongestion || []).filter(c => c.zoneId !== zoneId), report],
      timeline: [...(prev.timeline || []), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "congestion", message: `🚦 ${zone?.name} 혼잡도 → ${CONG_LEVELS[level]?.label} ${memo ? "("+memo+")" : ""}`, actor: session?.name }]
    }));
    setZonePhotos(p => ({ ...p, [zoneId]: [] }));
    setMemos(p => ({ ...p, [zoneId]: "" }));
    setSelLevel(p => ({ ...p, [zoneId]: null }));
    alert("✅ 혼잡도 보고 완료!");
  };

  const isAdmin = session?.role === "admin" || session?.role === "manager" || session?.role === "sysadmin";
  const viewZones = isAdmin ? zones.filter(z => z.name) : myZone ? [myZone] : [];

  return (<div style={{ minHeight: "100vh", background: "#0a0a1a", padding: "24px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, textAlign: "center", margin: "0 0 6px" }}>🚦 인파혼잡도 관리</h2>
    <p style={{ color: "#8892b0", fontSize: 13, textAlign: "center", margin: "0 0 20px" }}>① 단계 선택 → ② 사진/메모 → ③ 보고 완료</p>

    {viewZones.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#556" }}>배정된 구역이 없습니다.<br/>관리자가 구역을 설정하고 계정에 배정해주세요.</div>}

    {viewZones.map(zone => {
      const cur = congestion.find(c => c.zoneId === zone.id);
      const cl = cur ? CONG_LEVELS[cur.level] : null;
      const canEdit = isAdmin || myZone?.id === zone.id;
      const selected = selLevel[zone.id];
      const curPhotos = zonePhotos[zone.id] || [];
      const curMemo = memos[zone.id] || "";

      return (<div key={zone.id} style={{ maxWidth: 500, margin: "0 auto 16px", background: "rgba(255,255,255,0.03)", borderRadius: 16, border: `2px solid ${cl?.color || "#333"}`, padding: "20px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#ccd6f6", fontSize: 18, fontWeight: 800 }}>{zone.name}</div>
            {zone.range && <div style={{ color: "#556", fontSize: 12 }}>{zone.range}</div>}
          </div>
          {cl && <div style={{ textAlign: "center", padding: "6px 14px", borderRadius: 10, background: cl.bg, border: `1px solid ${cl.color}44` }}>
            <div style={{ fontSize: 20 }}>{cl.icon}</div>
            <div style={{ color: cl.color, fontSize: 14, fontWeight: 800 }}>{cl.label}</div>
          </div>}
        </div>

        {/* 현재 보고 내역 */}
        {cur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: "#8892b0", fontSize: 12 }}>마지막 보고:</span>
            <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700 }}>{cur.reportedByName}</span>
            <span style={{ color: "#556", fontSize: 12, marginLeft: "auto" }}>{cur.reportedAt}</span>
          </div>
          {cur.memo && <div style={{ color: "#ccd6f6", fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>💬 {cur.memo}</div>}
          {cur.photos?.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {cur.photos.map(p => <div key={p.id} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => { setViewPhoto(p); setViewPhotoZone(zone.id); }}>
              <img src={p.data} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #333" }} />
              <div style={{ color: "#556", fontSize: 10, textAlign: "center", marginTop: 2 }}>{p.time}</div>
            </div>)}
          </div>}
        </div>}

        {/* 새 보고 */}
        {canEdit && <>
          {/* ① 단계 선택 */}
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>① 혼잡도 단계 선택</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {Object.entries(CONG_LEVELS).map(([k, v]) => (
              <button key={k} onClick={() => setSelLevel(p => ({ ...p, [zone.id]: k }))} style={{ padding: "16px 8px", borderRadius: 12, border: selected === k ? `3px solid ${v.color}` : "1px solid #333", background: selected === k ? v.bg : "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "center" }}>
                <div style={{ fontSize: 28 }}>{v.icon}</div>
                <div style={{ color: v.color, fontSize: 16, fontWeight: 800, marginTop: 4 }}>{v.label}</div>
              </button>
            ))}
          </div>

          {/* ② 사진/메모 */}
          <div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>② 사진/메모 (선택)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <label style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "rgba(255,255,255,0.02)", color: "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
              📷 사진 촬영 / 첨부
              <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhoto(zone.id, e)} style={{ display: "none" }} />
            </label>
            {curPhotos.length > 0 && <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 700 }}>{curPhotos.length}장</span>}
          </div>
          {curPhotos.length > 0 && <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 4 }}>
            {curPhotos.map((p, i) => <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
              <img src={p.data} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #333" }} />
              <button onClick={() => setZonePhotos(prev => ({ ...prev, [zone.id]: prev[zone.id].filter((_, idx) => idx !== i) }))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: "#F44336", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>)}
          </div>}
          <textarea value={curMemo} onChange={e => setMemos(p => ({ ...p, [zone.id]: e.target.value }))} placeholder="현장 상황 메모" rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 10 }} />

          {/* ③ 보고 완료 */}
          <button onClick={() => submitReport(zone.id)} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: selected ? (CONG_LEVELS[selected]?.color || "#2196F3") : "#333", color: "#fff", fontSize: 16, fontWeight: 800, cursor: selected ? "pointer" : "default", opacity: selected ? 1 : 0.4 }}>
            {selected ? `${CONG_LEVELS[selected].icon} ${CONG_LEVELS[selected].label} 보고 완료` : "단계를 먼저 선택하세요"}
          </button>
        </>}
      </div>);
    })}

    {/* 전체 현황 (관리자) */}
    {isAdmin && zones.filter(z => z.name).length > 0 && <div style={{ maxWidth: 500, margin: "20px auto 0" }}>
      <h3 style={{ color: "#8892b0", fontSize: 15, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>📊 전체 구역 혼잡도 현황</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {zones.filter(z => z.name).map(z => {
          const c = congestion.find(cc => cc.zoneId === z.id);
          const cl = c ? CONG_LEVELS[c.level] : { label: "미보고", color: "#556", icon: "⚪" };
          return (<div key={z.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: `1px solid ${cl.color}33`, gap: 10 }}>
            <span style={{ fontSize: 18 }}>{cl.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700 }}>{z.name}</div>
              {c?.reportedAt && <div style={{ color: "#556", fontSize: 11 }}>{c.reportedByName} · {c.reportedAt}</div>}
            </div>
            <span style={{ color: cl.color, fontSize: 16, fontWeight: 800 }}>{cl.label}</span>
            {c?.photos?.length > 0 && <span style={{ color: "#2196F3", fontSize: 12 }}>📷{c.photos.length}</span>}
          </div>);
        })}
      </div>
    </div>}

    {/* 사진 뷰어 */}
    <PhotoViewer photo={viewPhoto} onClose={() => setViewPhoto(null)} onDelete={isAdmin && viewPhoto ? () => {
      if (!confirm("이 사진을 삭제하시겠습니까?")) return;
      setSettings(prev => ({
        ...prev,
        zoneCongestion: (prev.zoneCongestion || []).map(c => c.zoneId === viewPhotoZone ? { ...c, photos: (c.photos || []).filter(p => p.id !== viewPhoto.id) } : c)
      }));
      setViewPhoto(null);
    } : null} />
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
            <button key={t.id} onClick={() => setMsgType(t.id)} style={{ padding: "14px 8px", borderRadius: 12, border: msgType === t.id ? "2px solid #2196F3" : "1px solid #333", background: msgType === t.id ? "rgba(33,150,243,0.1)" : "transparent", color: msgType === t.id ? "#2196F3" : "#8892b0", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{t.icon}</div>{t.label}<div style={{ fontSize: 13, color: "#556", marginTop: 2 }}>{t.desc}</div>
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
            <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1, whiteSpace: "pre-wrap" }}>{n.content}</span>
            <span style={{ color: "#556", fontSize: 13, flexShrink: 0 }}>{n.createdBy}<br/>{n.createdAt}</span>
            <button onClick={() => setSettings(prev => ({ ...prev, notices: prev.notices.filter(x => x.id !== n.id) }))} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer", flexShrink: 0 }}>삭제</button>
          </div>
        ))}
      </Card>}

      {/* 발송 이력 */}
      <Card>
        <h3 style={{ color: "#8892b0", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>
        {(settings.messages || []).length === 0 ? <p style={{ color: "#445", fontSize: 14 }}>이력 없음</p> : <div style={{ maxHeight: 250, overflow: "auto" }}>
          {(settings.messages || []).slice(0, 30).map(m => (
            <div key={m.id} style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <span style={{ padding: "2px 8px", borderRadius: 10, background: m.type === "notice" ? "rgba(156,39,176,0.15)" : m.type === "target" ? "rgba(255,152,0,0.15)" : "rgba(33,150,243,0.15)", color: m.type === "notice" ? "#9C27B0" : m.type === "target" ? "#FF9800" : "#2196F3", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{m.type === "notice" ? "공지" : m.type === "target" ? "지정" : "전체"}</span>
              <span style={{ color: "#999", flex: 1 }}>{m.content.slice(0, 40)}{m.content.length > 40 ? "..." : ""}</span>
              {m.to && m.type === "target" && <span style={{ color: "#FF9800", fontSize: 13 }}>→{m.to}</span>}
              <span style={{ color: "#445", fontSize: 13, flexShrink: 0 }}>{m.createdAt}</span>
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
    <p style={{ color: "#8892b0", fontSize: 14, textAlign: "center", margin: "0 0 20px" }}>{session.name} ({ROLES[session.role]?.label})</p>
    <div style={{ maxWidth: 600, margin: "0 auto" }}>

      {myMessages.length > 0 && <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={markAllRead} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>전체 읽음 처리</button>
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
              <span style={{ padding: "2px 8px", borderRadius: 10, background: m.type === "notice" ? "rgba(156,39,176,0.15)" : m.type === "target" ? "rgba(255,152,0,0.15)" : "rgba(33,150,243,0.15)", color: m.type === "notice" ? "#9C27B0" : m.type === "target" ? "#FF9800" : "#2196F3", fontSize: 13, fontWeight: 700 }}>{m.type === "notice" ? "📢 공지" : m.type === "target" ? "👤 개인" : "📣 전체"}</span>
              {!isRead && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#2196F3", flexShrink: 0 }} />}
              <span style={{ color: "#445", fontSize: 13, marginLeft: "auto" }}>{m.createdAt}</span>
            </div>
            <div style={{ color: isRead ? "#999" : "#ccd6f6", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
            {m.createdBy && <div style={{ color: "#556", fontSize: 14, marginTop: 6 }}>발신: {m.createdBy}</div>}
          </div>
        );
      })}
    </div>
  </div>);
}

// ─── CMS Page ────────────────────────────────────────────────────
// ─── OrgChart Tab ────────────────────────────────────────────────
function OrgChartTab({ settings, setSettings }) {
  const org = settings.orgChart || [];
  const [editId, setEditId] = useState(null);
  const [addMode, setAddMode] = useState("org"); // "org" or "person"
  const [form, setForm] = useState({ name: "", position: "", phone: "", memo: "" });
  const [addToParent, setAddToParent] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [dragId, setDragId] = useState(null);

  const orgs = org.filter(n => n.type === "org");
  const getChildren = (pid) => org.filter(n => n.parentId === pid).sort((a, b) => {
    if (a.type !== b.type) return a.type === "org" ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });
  const roots = org.filter(n => !n.parentId).sort((a, b) => {
    if (a.type !== b.type) return a.type === "org" ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });

  const addNode = () => {
    if (!form.name) { alert("이름을 입력하세요."); return; }
    const node = { id: (addMode === "org" ? "dept_" : "per_") + Date.now(), type: addMode, name: form.name, position: form.position || "", phone: form.phone || "", memo: form.memo || "", parentId: addToParent || null, order: org.filter(n => n.parentId === (addToParent || null)).length };
    setSettings(prev => ({ ...prev, orgChart: [...(prev.orgChart || []), node] }));
    setForm({ name: "", position: "", phone: "", memo: "" });
  };

  const updateNode = () => {
    if (!editId || !form.name) return;
    setSettings(prev => ({ ...prev, orgChart: (prev.orgChart || []).map(n => n.id === editId ? { ...n, name: form.name, position: form.position, phone: form.phone, memo: form.memo } : n) }));
    setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" });
  };

  const deleteNode = (id) => {
    const node = org.find(n => n.id === id);
    const typeLabel = node?.type === "org" ? "조직" : "인원";
    if (!confirm(`${typeLabel} "${node?.name}"을(를) 삭제하시겠습니까?\n하위 항목도 모두 삭제됩니다.`)) return;
    const toDelete = new Set();
    const collect = (pid) => { toDelete.add(pid); org.filter(n => n.parentId === pid).forEach(n => collect(n.id)); };
    collect(id);
    setSettings(prev => ({ ...prev, orgChart: (prev.orgChart || []).filter(n => !toDelete.has(n.id)) }));
  };

  const startEdit = (n) => { setEditId(n.id); setAddMode(n.type); setForm({ name: n.name, position: n.position || "", phone: n.phone || "", memo: n.memo || "" }); };

  const handleDrop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const isDesc = (pid, cid) => { const ch = org.filter(n => n.parentId === pid); return ch.some(c => c.id === cid || isDesc(c.id, cid)); };
    if (targetId && isDesc(dragId, targetId)) return;
    setSettings(prev => ({ ...prev, orgChart: (prev.orgChart || []).map(n => n.id === dragId ? { ...n, parentId: targetId || null } : n) }));
    setDragId(null);
  };

  const renderNode = (node, depth) => {
    const children = getChildren(node.id);
    const childOrgs = children.filter(c => c.type === "org");
    const childPersons = children.filter(c => c.type === "person");
    const isCol = collapsed[node.id];
    const isOrg = node.type === "org";

    if (!isOrg) {
      // 인원: 조직 내부 멤버로 표시
      return (
        <div key={node.id} draggable onDragStart={(e) => { e.stopPropagation(); setDragId(node.id); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "2px solid #4CAF50"; }}
          onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "none"; handleDrop(node.id); }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 3, cursor: "grab", border: "1px solid transparent" }}>
          <span style={{ fontSize: 12, color: "#556" }}>⠿</span>
          <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700 }}>{node.name}</span>
          {node.position && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(76,175,80,0.1)", color: "#4CAF50", fontSize: 12, fontWeight: 700 }}>{node.position}</span>}
          {node.memo && <span style={{ color: "#556", fontSize: 12 }}>{node.memo}</span>}
          {node.phone && <a href={`tel:${node.phone.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#4CAF50", fontSize: 13, fontWeight: 700, textDecoration: "none", marginLeft: "auto", whiteSpace: "nowrap" }}>📞</a>}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); startEdit(node); }} style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>✏️</button>
            <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>
        </div>
      );
    }

    // 조직: 카드 형태
    return (
      <div key={node.id} style={{ marginLeft: depth * 16, marginBottom: 8 }}>
        <div draggable onDragStart={(e) => { e.stopPropagation(); setDragId(node.id); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
          onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "none"; handleDrop(node.id); }}
          style={{ borderRadius: 12, border: "1px solid rgba(33,150,243,0.2)", overflow: "hidden", cursor: "grab" }}>
          {/* 조직 헤더 */}
          <div style={{ padding: "10px 14px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            {children.length > 0 ? <button onClick={() => setCollapsed(p => ({ ...p, [node.id]: !p[node.id] }))} style={{ background: "none", border: "none", color: "#2196F3", fontSize: 14, cursor: "pointer", padding: 0, width: 18 }}>{isCol ? "▶" : "▼"}</button> : <span style={{ width: 18 }} />}
            <span style={{ fontSize: 16 }}>🏢</span>
            <span style={{ color: "#2196F3", fontSize: 15, fontWeight: 800, flex: 1 }}>{node.name}</span>
            {node.position && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(33,150,243,0.12)", color: "#2196F3", fontSize: 12, fontWeight: 700 }}>{node.position}</span>}
            <span style={{ color: "#556", fontSize: 12 }}>{childPersons.length}명</span>
            <button onClick={(e) => { e.stopPropagation(); startEdit(node); }} style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>✏️</button>
            <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>
          {node.memo && <div style={{ padding: "4px 14px 6px", color: "#556", fontSize: 12 }}>{node.memo}</div>}

          {/* 소속 인원 */}
          {!isCol && childPersons.length > 0 && <div style={{ padding: "6px 14px 10px" }}>
            {childPersons.map(p => renderNode(p, 0))}
          </div>}
        </div>

        {/* 하위 조직 */}
        {!isCol && childOrgs.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (<div>
    <Card>
      <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📋 안전관리 조직도 / 비상연락망</h3>
      <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>조직을 먼저 만들고, 인원을 해당 조직에 배치하세요. 드래그로 이동 가능.</p>

      {/* 추가 모드 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => { setAddMode("org"); setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: addMode === "org" && !editId ? "1.5px solid #2196F3" : "1px solid #333", background: addMode === "org" && !editId ? "rgba(33,150,243,0.1)" : "transparent", color: addMode === "org" && !editId ? "#2196F3" : "#667", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🏢 조직 추가</button>
        <button onClick={() => { setAddMode("person"); setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: addMode === "person" && !editId ? "1.5px solid #4CAF50" : "1px solid #333", background: addMode === "person" && !editId ? "rgba(76,175,80,0.1)" : "transparent", color: addMode === "person" && !editId ? "#4CAF50" : "#667", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>👤 인원 추가</button>
      </div>

      {/* 입력 폼 */}
      <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${editId ? "rgba(33,150,243,0.3)" : "#222"}`, marginBottom: 16 }}>
        <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{editId ? `✏️ ${addMode === "org" ? "조직" : "인원"} 수정` : addMode === "org" ? "🏢 조직 추가" : "👤 인원 추가"}</div>
        {addMode === "person" && !editId && (() => {
          const allWorkers = (settings.workSites || []).flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name })));
          return allWorkers.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <Label>등록된 근무자에서 선택</Label>
              <select onChange={e => { const w = allWorkers.find(ww => ww.id === e.target.value); if (w) setForm({ name: w.name, position: w.role || w.duty || "", phone: w.phone || "", memo: `${w.type || ""} ${w.siteName || ""}`.trim() }); e.target.value = ""; }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                <option value="">직접 입력 또는 선택...</option>
                {allWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type || ""} {w.role || ""})</option>)}
              </select>
            </div>
          ) : null;
        })()}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><Label>{addMode === "org" ? "조직명 *" : "이름 *"}</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={addMode === "org" ? "현장운영팀" : "홍길동"} /></div>
          <div><Label>{addMode === "org" ? "역할" : "직책"}</Label><Input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder={addMode === "org" ? "현장 통제" : "팀장"} /></div>
        </div>
        {addMode === "person" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><Label>연락처</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="010-1234-5678" /></div>
          <div><Label>메모</Label><Input value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="비고" /></div>
        </div>}
        {addMode === "org" && <div style={{ marginBottom: 8 }}><Label>메모</Label><Input value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="담당 업무 등" /></div>}

        {/* 소속 조직 선택 */}
        {!editId && <div style={{ marginBottom: 10 }}>
          <Label>소속 (상위 조직)</Label>
          <select value={addToParent || ""} onChange={e => setAddToParent(e.target.value || null)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
            <option value="">최상위 (소속 없음)</option>
            {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}{o.position ? ` (${o.position})` : ""}</option>)}
          </select>
        </div>}

        <div style={{ display: "flex", gap: 8 }}>
          {editId ? (<>
            <button onClick={updateNode} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer" }}>수정 완료</button>
            <button onClick={() => { setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", cursor: "pointer" }}>취소</button>
          </>) : (
            <button onClick={addNode} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: addMode === "org" ? "#2196F3" : "#4CAF50", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{addMode === "org" ? "🏢 조직 추가" : "👤 인원 추가"}</button>
          )}
        </div>
      </div>

      {/* 트리 뷰 */}
      <div onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = "2px dashed #FF9800"; }} onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }} onDrop={(e) => { e.preventDefault(); e.currentTarget.style.outline = "none"; handleDrop(null); }} style={{ minHeight: 60, padding: 8, borderRadius: 10, border: "1px dashed #222" }}>
        {roots.length === 0 && <p style={{ color: "#445", fontSize: 14, textAlign: "center", padding: 20 }}>🏢 조직을 먼저 추가한 후, 👤 인원을 배치하세요.</p>}
        {roots.map(r => renderNode(r, 0))}
      </div>
    </Card>

    {/* 비상연락망 */}
    {org.filter(n => n.type === "person" && n.phone).length > 0 && <Card>
      <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📞 비상연락망</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {org.filter(n => n.type === "person" && n.phone).map(n => {
          const parentOrg = org.find(o => o.id === n.parentId && o.type === "org");
          return (<div key={n.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700, minWidth: 60 }}>{n.name}</span>
            {n.position && <span style={{ color: "#4CAF50", fontSize: 14, fontWeight: 600, minWidth: 50 }}>{n.position}</span>}
            {parentOrg && <span style={{ color: "#556", fontSize: 14, flex: 1 }}>🏢 {parentOrg.name}</span>}
            <a href={`tel:${n.phone.replace(/-/g, "")}`} style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#4CAF50", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>📞 {n.phone}</a>
          </div>);
        })}
      </div>
    </Card>}
  </div>);
}

// ─── CMS Page ────────────────────────────────────────────────────
function CMSPage({ categories, setCategories, settings, setSettings, alerts, setAlerts, smsLog, initialTab, initialCatId, extraTabs, onExtraTab, userRole, accounts, setAccounts, onDataReset }) {
  const [tab, setTab] = useState(initialTab || "monitor");
  const [focusCat, setFocusCat] = useState(initialCatId || null);
  const [editWorker, setEditWorker] = useState(null); // {siteId, workerId}
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
  const tabGroups = [
    { label: "🔧 시스템", tabs: [
      { id: "settings", label: "기본설정" },
      { id: "navmgmt", label: "대시보드관리" },
      { id: "alerts", label: `이력(${alerts.length})` },
      ...(extraTabs || []),
    ] },
    { label: "⚙️ 기능관리", tabs: [
      { id: "zonesetup", label: "구역설정" },
      { id: "staffmgmt", label: "인력관리" },
      { id: "orgchart", label: "조직도" },
      { id: "checklist", label: "체크리스트" },
      { id: "programs", label: "프로그램" },
      ft.crowd !== false && { id: "gates", label: "출입구" },
      ft.parking !== false && { id: "parking", label: "주차장" },
      ft.shuttle !== false && { id: "shuttlecms", label: "셔틀버스" },
      { id: "alertmsg", label: "알림메시지" },
      ft.sms !== false && { id: "sms", label: "SMS" },
    ].filter(Boolean) },
    { label: "📊 데이터관리", tabs: [
      { id: "monitor", label: "현황" },
      { id: "manual", label: "수동입력" },
      ft.weather !== false && { id: "kma", label: "자동데이터" },
      ft.customApi !== false && { id: "apiconfig", label: "커스텀API" },
      { id: "thresholds", label: "안전관리기준" },
      ft.crowd !== false && { id: "crowdcms", label: "인파데이터" },
      { id: "medical", label: "의료기록" },
      { id: "timeline", label: "상황일지" },
      { id: "custom", label: "항목추가" },
    ].filter(Boolean) },
  ];
  const allTabs = tabGroups.flatMap(g => g.tabs);

  return (<div style={{ minHeight: "100vh", background: "#0d1117", padding: "20px 16px" }}>
    <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, textAlign: "center", margin: "0 0 16px" }}>🛡️ {settings.festivalName} 관리</h2>
    
    {/* 그룹별 탭 네비게이션 */}
    <div style={{ maxWidth: 800, margin: "0 auto 20px" }}>
      {tabGroups.map(g => (
        <div key={g.label} style={{ marginBottom: 8 }}>
          <div style={{ color: "#556", fontSize: 12, fontWeight: 700, marginBottom: 6, paddingLeft: 4 }}>{g.label}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {g.tabs.map(t => <button key={t.id} onClick={() => { if ((extraTabs||[]).find(et => et.id === t.id)) { onExtraTab?.(t.id); return; } setTab(t.id); if (t.id !== "apiconfig") setFocusCat(null); }} style={{ padding: "8px 14px", borderRadius: 8, border: tab === t.id ? "1.5px solid #2196F3" : "1px solid #252525", background: tab === t.id ? "rgba(33,150,243,0.15)" : "rgba(255,255,255,0.02)", color: tab === t.id ? "#2196F3" : "#8892b0", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", transition: "all .2s" }}>{t.label}</button>)}
          </div>
        </div>
      ))}
    </div>
    <div style={{ maxWidth: 800, margin: "0 auto" }}>

    {/* Monitor */}
    {tab === "monitor" && <div>{categories.map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id} style={{ border: `1px solid ${li.border}`, cursor: "pointer" }} onClick={() => { setTab(cat.kmaCategory ? "kma" : "apiconfig"); setFocusCat(cat.id); }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div><span style={{ fontSize: 18, marginRight: 6 }}>{cat.icon}</span><span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{cat.name}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: li.color, fontWeight: 800, fontSize: 22, fontFamily: "monospace" }}>{cat.currentValue.toLocaleString()}{cat.unit}</span><span style={{ padding: "3px 8px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 14, fontWeight: 700 }}>{li.label}</span></div>
      </div>
      <div style={{ marginTop: 4, color: "#445", fontSize: 14 }}>{cat.kmaCategory ? `🌤️기상청 ${cat.kmaCategory}` : cat.apiConfig?.enabled ? "🔌커스텀API" : "✏️수동"} | 클릭하여 설정 ›</div>
      <HistoryChart cat={cat} />
    </Card>); })}</div>}

    {/* ── KMA API Settings ── */}
    {tab === "kma" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🌤️ 기상청 초단기실황조회 API</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 16px" }}>공공데이터포털 VilageFcstInfoService_2.0 / getUltraSrtNcst</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>공공데이터포털 인증키 (ServiceKey)</Label><Input value={kma.serviceKey || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, serviceKey: e.target.value } })} placeholder="인증키를 입력하세요 (Decoding 키)" style={{ fontFamily: "monospace", fontSize: 14 }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label>수집 간격 (분)</Label><Input type="number" value={kma.interval || 10} onChange={e => setSettings({ ...settings, kma: { ...kma, interval: parseInt(e.target.value) || 10 } })} /></div>
            <div><Label>데이터 형식</Label><Input value="JSON" disabled style={{ color: "#556" }} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>📍 격자 좌표 (nx, ny)</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 12px" }}>축제 위치 좌표에서 자동 변환됩니다. 필요시 수동 입력도 가능합니다.</p>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 12 }}>
          <p style={{ color: "#8892b0", fontSize: 14, margin: 0 }}>📍 현재 위치: {loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)})<br />🔄 자동 변환 격자: <strong style={{ color: "#4CAF50" }}>nx={grid.nx}, ny={grid.ny}</strong></p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><Label>nx 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nxOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nxOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.nx}`} /></div>
          <div><Label>ny 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nyOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nyOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.ny}`} /></div>
        </div>
        <p style={{ color: "#445", fontSize: 14, margin: 0 }}>적용 격자: nx={kma.nxOverride || grid.nx}, ny={kma.nyOverride || grid.ny}</p>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🔗 항목별 기상청 카테고리 매핑</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 12px" }}>각 모니터링 항목에 기상청 응답 카테고리를 연결합니다.</p>
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
          {kmaTestResult.simulated && <span style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.3)", color: "#FF9800", fontSize: 14, fontWeight: 700 }}>시뮬레이션</span>}
        </div>
        <pre style={{ color: "#aaa", fontSize: 13, margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>{kmaTestResult.msg}</pre>
        {kmaTestResult.items && <div style={{ marginTop: 12, borderTop: "1px solid #222", paddingTop: 10 }}>
          <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 6px", fontWeight: 700 }}>수신 데이터:</p>
          {kmaTestResult.items.map((item, i) => (<div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ color: "#4CAF50", fontSize: 14, fontWeight: 700, minWidth: 40 }}>{item.category}</span>
            <span style={{ color: "#ccd6f6", fontSize: 14, fontFamily: "monospace" }}>{item.obsrValue}</span>
            <span style={{ color: "#556", fontSize: 13 }}>{KMA_CODES[item.category]?.name || ""} ({KMA_CODES[item.category]?.unit || ""})</span>
          </div>))}
        </div>}
      </Card>}

      <Card style={{ background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.15)" }}>
        <p style={{ color: "#FFC107", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API 파라미터 안내</strong><br />
          • <strong>EndPoint:</strong> apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst<br />
          • <strong>base_date:</strong> 자동 (오늘 날짜 YYYYMMDD)<br />
          • <strong>base_time:</strong> 자동 (매시 정각 발표, 10분 이후 호출 가능)<br />
          • <strong>nx, ny:</strong> 위치 좌표에서 자동 변환 (또는 수동 지정)<br />
          • <strong>응답 카테고리:</strong> T1H(기온), RN1(강수량), WSD(풍속), REH(습도), PTY(강수형태), VEC(풍향)
        </p>
      </Card>

      {/* 에어코리아 미세먼지 API */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>😷 에어코리아 미세먼지 API</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 16px" }}>공공데이터포털 → 한국환경공단 에어코리아 대기오염정보</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Label style={{ minWidth: 60 }}>활성화</Label>
            <div onClick={() => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, enabled: !(prev.airQuality?.enabled) } }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.airQuality?.enabled ? "#4CAF50" : "#333", position: "relative", cursor: "pointer" }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: settings.airQuality?.enabled ? 22 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ color: settings.airQuality?.enabled ? "#4CAF50" : "#F44336", fontSize: 13, fontWeight: 700 }}>{settings.airQuality?.enabled ? "ON" : "OFF"}</span>
          </div>
          <div><Label>API 인증키 (공공데이터포털)</Label><Input value={settings.airQuality?.serviceKey || ""} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, serviceKey: e.target.value } }))} placeholder="공공데이터포털에서 발급받은 인증키" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>시도명</Label><select value={settings.airQuality?.sidoName || "경남"} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, sidoName: e.target.value } }))} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}>
              {["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"].map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
            <div><Label>지역 필터</Label><Input value={settings.airQuality?.stationFilter || ""} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, stationFilter: e.target.value } }))} placeholder="진주, 종로 등" /></div>
          </div>
          <div><Label>갱신 주기 (분)</Label><Input type="number" value={settings.airQuality?.interval || 30} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, interval: parseInt(e.target.value) || 30 } }))} /></div>
          {settings.airQuality?.lastFetch && <p style={{ color: "#4CAF50", fontSize: 13 }}>✅ 마지막 수신: {settings.airQuality.lastFetch}</p>}
          <button onClick={async () => {
            const aq = settings.airQuality || {};
            const key = aq.serviceKey; const sido = aq.sidoName || "경남"; const filter = aq.stationFilter || "";
            if (!key) { alert("인증키를 입력하세요."); return; }
            try {
              const url = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(key)}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodeURIComponent(sido)}&ver=1.0`;
              const res = await fetch(url);
              const json = await res.json();
              const rawItems = json?.response?.body?.items; 
              const allItems = Array.isArray(rawItems) ? rawItems : rawItems?.item || [];
              const item = filter ? allItems.find(i => i.stationName?.includes(filter)) || allItems[0] : allItems[0];
              if (item) {
                const pm10 = item.pm10Value || "-"; const pm25 = item.pm25Value || "-";
                const gradeMap = { "1": "좋음", "2": "보통", "3": "나쁨", "4": "매우나쁨" };
                setCategories(p => p.map(c => {
                  if (c.id === "pm10") return { ...c, currentValue: parseFloat(pm10) || 0, lastUpdated: new Date().toLocaleTimeString("ko-KR"), dataType: "실황" };
                  if (c.id === "pm25") return { ...c, currentValue: parseFloat(pm25) || 0, lastUpdated: new Date().toLocaleTimeString("ko-KR"), dataType: "실황" };
                  return c;
                }));
                setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, lastFetch: new Date().toLocaleString("ko-KR") } }));
                const stations = allItems.filter(i => !filter || i.stationName?.includes(filter)).map(i => i.stationName).join(", ");
                alert(`✅ ${sido} ${filter ? `(${filter} 필터)` : ""}\n📍 측정소: ${item.stationName}\n📅 ${item.dataTime || ""}\n\n🌫️ 미세먼지(PM10): ${pm10} ㎍/㎥ (${gradeMap[item.pm10Grade] || ""})\n😷 초미세먼지(PM2.5): ${pm25} ㎍/㎥ (${gradeMap[item.pm25Grade] || ""})\n\n${filter ? `해당 지역 측정소: ${stations}` : ""}\n\n대시보드에 반영되었습니다.`);
              } else {
                alert(`❌ 데이터 없음\n\n시도명: ${sido}\n총 ${allItems.length}개 측정소 중 "${filter}" 포함 없음\n\n시도명을 확인하세요: 서울,부산,대구,인천,광주,대전,울산,경기,강원,충북,충남,전북,전남,경북,경남,제주,세종`);
              }
            } catch (e) {
              alert(`❌ API 호출 실패: ${e.message}`);
            }
          }} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#FF9800", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🧪 미세먼지 API 테스트</button>
        </div>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#2196F3", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API:</strong> getCtprvnRltmMesureDnsty (시도별 실시간 측정정보)<br />
          • <strong>시도명:</strong> 경남, 서울, 부산 등 선택<br />
          • <strong>지역 필터:</strong> 측정소명에 포함된 텍스트 (예: 진주, 종로)<br />
          • <strong>수집항목:</strong> PM10(미세먼지), PM2.5(초미세먼지)
        </p>
      </Card>

      {/* 🌊 댐 방류현황 (K-water) */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🌊 댐 방류현황 (K-water)</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 16px" }}>한국수자원공사 다목적댐 운영 정보 API</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Label style={{ minWidth: 60 }}>활성화</Label>
            <div onClick={() => setSettings(prev => ({ ...prev, dam: { ...prev.dam, enabled: !(prev.dam?.enabled) } }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.dam?.enabled ? "#4CAF50" : "#333", position: "relative", cursor: "pointer" }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: settings.dam?.enabled ? 22 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ color: settings.dam?.enabled ? "#4CAF50" : "#F44336", fontSize: 13, fontWeight: 700 }}>{settings.dam?.enabled ? "ON" : "OFF"}</span>
          </div>
          <div><Label>API 인증키</Label><Input value={settings.dam?.serviceKey || ""} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, serviceKey: e.target.value } }))} placeholder="공공데이터포털 인증키" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>댐 이름</Label><select value={settings.dam?.damName || "남강"} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, damName: e.target.value } }))} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}>
              {["소양강","충주","횡성","안동","임하","합천","남강","밀양","운문","대청","용담","섬진강","주암","장흥"].map(d => <option key={d} value={d}>{d}댐</option>)}
            </select></div>
            <div><Label>갱신 주기 (분)</Label><Input type="number" value={settings.dam?.interval || 30} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, interval: parseInt(e.target.value) || 30 } }))} /></div>
          </div>
          {settings.dam?.lastFetch && <p style={{ color: "#4CAF50", fontSize: 13 }}>✅ 마지막 수신: {settings.dam.lastFetch}</p>}
          <button onClick={async () => {
            try {
              const d = settings.dam || {};
              if (!d.serviceKey) { alert("인증키를 입력하세요."); return; }
              const now = new Date();
              const vdate = now.toISOString().slice(0, 10);
              const tdate = new Date(now - 86400000).toISOString().slice(0, 10);
              const ldate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
              const vtime = String(now.getHours()).padStart(2, "0");
              const url = `https://apis.data.go.kr/B500001/dam/multipurPoseDam/multipurPoseDamlist?serviceKey=${encodeURIComponent(d.serviceKey)}&pageNo=1&numOfRows=30&_type=json&vdate=${vdate}&tdate=${tdate}&ldate=${ldate}&vtime=${vtime}`;
              const res = await fetch(url);
              const json = await res.json();
              const items = json?.response?.body?.items?.item || [];
              const allItems = Array.isArray(items) ? items : [items];
              const filter = d.damName || "";
              const target = filter ? allItems.find(i => (i.damnm || i.damNm || "").includes(filter)) : allItems[0];
              if (target) {
                const nm = target.damnm || target.damnm || "";
                setCategories(p => p.map(c => c.id === "dam" ? { ...c, currentValue: parseFloat(target.inflowqy) || 0, lastUpdated: new Date().toLocaleTimeString("ko-KR"), dataType: "실황" } : c));
                setSettings(prev => ({ ...prev, dam: { ...prev.dam, lastFetch: new Date().toLocaleString("ko-KR") } }));
                const allDams = allItems.map(i => i.damnm || i.damNm).filter(Boolean).join(", ");
                alert(`✅ ${nm}댐\n📅 ${vdate} ${vtime}시\n\n💧 유입량: ${target.inflowqy || "-"} ㎥/s\n📏 현재수위: ${target.nowlowlevel || "-"} EL.m\n📦 현재저수량: ${target.nowrsvwtqy || "-"} 백만㎥\n📏 전일수위: ${target.lastlowlevel || "-"} EL.m\n📦 전일저수량: ${target.lastrsvwtqy || "-"} 백만㎥\n\n🏗️ 전체 댐 목록:\n${allDams}\n\n대시보드에 반영되었습니다.`);
              } else {
                const allDams = allItems.map(i => i.damnm || i.damNm).filter(Boolean).join(", ");
                alert(`❌ "${filter}" 댐을 찾을 수 없습니다.\n\n전체 댐 목록:\n${allDams}\n\n위 이름 중 하나를 입력하세요.`);
              }
            } catch (e) { alert(`❌ API 호출 실패: ${e.message}`); }
          }} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🌊 댐 방류량 테스트</button>
        </div>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#2196F3", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API:</strong> 한국수자원공사_다목적댐 운영 정보 (/multipurPoseDamlist)<br />
          • <strong>수집항목:</strong> 유입량(inflowqy), 수위(nowlowlevel), 저수량(nowrsvwtqy)<br />
          • <strong>인증키:</strong> 공공데이터포털 → 한국수자원공사_다목적댐 운영 정보 활용신청
        </p>
      </Card>
    </div>}

    {/* ── Custom API Config ── */}
    {tab === "apiconfig" && <div>
      <div style={{ padding: 10, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 14 }}>
        <p style={{ color: "#8892b0", fontSize: 13, margin: 0 }}>🔌 기상청 외 커스텀 API를 설정합니다. URL에 <code style={{ color: "#4CAF50" }}>{"{lat}"}</code>, <code style={{ color: "#4CAF50" }}>{"{lon}"}</code> 사용 가능.</p>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
        {categories.map(cat => <button key={cat.id} onClick={() => setFocusCat(cat.id)} style={{ padding: "6px 12px", borderRadius: 8, border: focusCat === cat.id ? "1px solid #2196F3" : "1px solid #252525", background: focusCat === cat.id ? "rgba(33,150,243,0.15)" : "transparent", color: focusCat === cat.id ? "#2196F3" : "#667", fontSize: 13, cursor: "pointer" }}>{cat.icon}{cat.name}</button>)}
      </div>
      {catForFocus && <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 14px" }}>{catForFocus.icon} {catForFocus.name} 커스텀 API</h3>
        {catForFocus.kmaCategory && <div style={{ padding: 8, borderRadius: 8, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)", marginBottom: 12 }}><p style={{ color: "#4CAF50", fontSize: 13, margin: 0 }}>🌤️ 이 항목은 기상청 API ({catForFocus.kmaCategory})에 매핑되어 있습니다. 커스텀 API를 활성화하면 기상청 대신 커스텀 API가 사용됩니다.</p></div>}
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
          {apiTestResult[catForFocus.id] && <div style={{ padding: 10, borderRadius: 8, background: apiTestResult[catForFocus.id].ok ? "rgba(76,175,80,0.08)" : "rgba(244,67,54,0.08)", border: `1px solid ${apiTestResult[catForFocus.id].ok ? "#4CAF5044" : "#F4433644"}` }}><span style={{ color: apiTestResult[catForFocus.id].ok ? "#4CAF50" : "#F44336", fontSize: 14 }}>{apiTestResult[catForFocus.id].ok ? "✅" : "❌"} {apiTestResult[catForFocus.id].msg}</span></div>}
        </div></Card>}
    </div>}

    {/* Operating */}
    {/* Thresholds */}
    {tab === "thresholds" && <div>{categories.map(cat => (<Card key={cat.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: 0 }}>{cat.icon} {cat.name} ({cat.unit})</h3><button onClick={() => { if (confirm("삭제?")) setCategories(p => p.filter(c => c.id !== cat.id)); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 6 }}>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ padding: 8, borderRadius: 8, background: lv.bg, border: `1px solid ${lv.border}` }}><div style={{ color: lv.color, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{lv.label}</div><div style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="number" value={cat.thresholds[lk]?.[0] ?? 0} onChange={e => upThr(cat.id, lk, 0, e.target.value)} style={{ width: 55, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={cat.thresholds[lk]?.[1] === Infinity ? "∞" : cat.thresholds[lk]?.[1] ?? 0} onChange={e => upThr(cat.id, lk, 1, e.target.value)} style={{ width: 55, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }} /></div></div>))}</div></Card>))}</div>}

    {/* Manual */}
    {tab === "manual" && <div>
      {categories.filter(c => c.source === "manual" || !c.kmaCategory).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 140, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>{cat.unit}</span><span style={{ padding: "4px 10px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 13, fontWeight: 700 }}>{li.icon} {li.label}</span></div></Card>); })}
      <Card style={{ background: "rgba(33,150,243,0.03)", border: "1px solid rgba(33,150,243,0.12)" }}><p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 10px" }}>🔄 API 항목 비상 수동 입력</p>
        {categories.filter(c => c.kmaCategory || c.apiConfig?.enabled).map(cat => (<div key={cat.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}><span style={{ color: "#ccd6f6", fontSize: 14, minWidth: 70 }}>{cat.icon}{cat.name}</span><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 100, fontSize: 13 }} /><span style={{ color: "#555", fontSize: 13 }}>{cat.unit}</span></div>))}</Card></div>}

    {/* Alert messages */}
    {tab === "alertmsg" && <div>{categories.map(cat => (<Card key={cat.id}><h3 style={{ color: "#ccd6f6", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ marginBottom: 8 }}><Label><span style={{ color: lv.color }}>{lv.icon}{lv.label}</span></Label><textarea value={cat.alertMessages?.[lk] || ""} onChange={e => upMsg(cat.id, lk, e.target.value)} rows={2} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${lv.border}`, background: "#111", color: "#ddd", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>))}</Card>))}</div>}

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
        <p style={{ color: "#556", fontSize: 14, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsManagers || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(244,67,54,0.05)", borderRadius: 6, border: "1px solid rgba(244,67,54,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 13, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsManagers: settings.smsManagers.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsManagers: [...(settings.smsManagers || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#F44336", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      {/* 안전요원 */}
      <Card>
        <h3 style={{ color: "#FF9800", fontSize: 15, margin: "0 0 4px" }}>🟠 안전요원</h3>
        <p style={{ color: "#556", fontSize: 14, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsStaff || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(255,152,0,0.05)", borderRadius: 6, border: "1px solid rgba(255,152,0,0.1)" }}><span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 13, fontFamily: "monospace" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsStaff: settings.smsStaff.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#F44336", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsStaff: [...(settings.smsStaff || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#FF9800", color: "#fff", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>{(!smsLog || !smsLog.length) ? <p style={{ color: "#445", fontSize: 14 }}>없음</p> : <div style={{ maxHeight: 200, overflow: "auto" }}>{smsLog.map((l, i) => (<div key={i} style={{ padding: "5px 8px", borderBottom: "1px solid #1a1a2e", fontSize: 13 }}><span style={{ color: l.success ? "#4CAF50" : "#F44336" }}>{l.success ? "✅" : "❌"}</span> <span style={{ color: "#555" }}>{l.time}</span><div style={{ color: "#777", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.preview}</div></div>))}</div>}</Card>
    </div>}

    {/* Zone Management */}
    {/* 출입구 관리 (계수용) */}
    {/* 구역설정 (구역 + 근무지 통합) */}
    {tab === "zonesetup" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🗺️ 관리구역 등록</h3>
        {(settings.zones || []).map((z, i) => {
          const ZTYPES = { normal: { label: "일반관리", color: "#2196F3", icon: "📍" }, safety: { label: "안전관리", color: "#F44336", icon: "🛡️" }, support: { label: "지원관리", color: "#FF9800", icon: "🚑" } };
          const zt = ZTYPES[z.zoneType] || ZTYPES.normal;
          return (
          <div key={z.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 8, border: `1px solid ${zt.color}33` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: zt.color, fontWeight: 700, fontSize: 14 }}>{zt.icon} {z.name || `구역 ${i+1}`}</span>
              <span style={{ padding: "2px 8px", borderRadius: 4, background: `${zt.color}15`, color: zt.color, fontSize: 11, fontWeight: 700 }}>{zt.label}</span>
              <span style={{ color: "#445", fontSize: 12, flex: 1 }}>{(settings.workSites || []).filter(s => s.zoneId === z.id).length}개 근무지</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div><Label>구역명</Label><Input value={z.name} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, name: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="A구역" /></div>
              <div><Label>범위</Label><Input value={z.range || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, range: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="동문~남문" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div><Label>구역 속성</Label><select value={z.zoneType || "normal"} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, zoneType: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                <option value="normal">📍 일반관리</option>
                <option value="safety">🛡️ 안전관리</option>
                <option value="support">🚑 지원관리</option>
              </select></div>
              <div><Label>대시보드 표시</Label>
                <div onClick={() => { const zs = [...settings.zones]; zs[i] = { ...z, dashboardShow: !(z.dashboardShow !== false) }; setSettings({ ...settings, zones: zs }); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: z.dashboardShow !== false ? "#4CAF50" : "#333", position: "relative" }}><div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: z.dashboardShow !== false ? 18 : 2, transition: "all .3s" }} /></div>
                  <span style={{ color: z.dashboardShow !== false ? "#4CAF50" : "#F44336", fontSize: 13 }}>{z.dashboardShow !== false ? "ON" : "OFF"}</span>
                </div>
              </div>
            </div>
            <div><Label>담당 계정 (구역관리자)</Label>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={z.accountId || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, accountId: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                  <option value="">미지정</option>
                  {(accounts || []).filter(a => ["admin","manager","zonemgr","counter"].includes(a.role)).map(a => <option key={a.id} value={a.id}>{a.name} ({ROLES[a.role]?.label})</option>)}
                </select>
                {z.name && !z.accountId && <button onClick={() => {
                  const accId = "zm_" + z.id;
                  if (accounts.find(a => a.id === accId)) { alert("이미 생성된 계정입니다."); const zs = [...settings.zones]; zs[i] = { ...z, accountId: accId }; setSettings({ ...settings, zones: zs }); return; }
                  const pw = "1234";
                  setAccounts(prev => [...prev, { id: accId, password: simpleHash(pw), name: z.name + " 관리자", role: "zonemgr", festivalId: settings.festivalId || "default", festivals: [settings.festivalId || "default"] }]);
                  const zs = [...settings.zones]; zs[i] = { ...z, accountId: accId }; setSettings({ ...settings, zones: zs });
                  alert(`✅ 구역관리자 계정 생성\n\n아이디: ${accId}\n비밀번호: ${pw}\n역할: 구역관리자\n\n로그인 후 비밀번호를 변경하세요.`);
                }} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#009688", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>자동생성</button>}
              </div>
            </div>
          </div>);
        })}
        <button onClick={() => setSettings({ ...settings, zones: [...(settings.zones || []), { id: "z" + Date.now(), name: "", range: "", assignee: "", accountId: "", zoneType: "normal", dashboardShow: true }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 구역 추가</button>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🏠 근무지 관리</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>근무지를 만들고 구역에 배치합니다.</p>
        {(settings.workSites || []).map((site, si) => (
          <div key={site.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 8, border: "1px solid #222" }}
            draggable onDragStart={e => e.dataTransfer.setData("siteId", site.id)}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
            onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = "none"; const d = e.dataTransfer.getData("siteId"); if (d && d !== site.id) { const ws = [...(settings.workSites || [])]; const di = ws.findIndex(s => s.id === d); const ti = ws.findIndex(s => s.id === site.id); if (di >= 0 && ti >= 0) { const [item] = ws.splice(di, 1); ws.splice(ti, 0, item); setSettings(prev => ({ ...prev, workSites: ws })); } } }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ cursor: "grab", fontSize: 14 }}>⠿</span>
              <Input value={site.name} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, name: e.target.value }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="근무지명" style={{ flex: 1 }} />
              <select value={site.zoneId || ""} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, zoneId: e.target.value || null }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "8px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12, maxWidth: 110 }}>
                <option value="">미지정</option>
                {(settings.zones || []).filter(z => z.name).map(z => <option key={z.id} value={z.id}>📍{z.name}</option>)}
              </select>
              <button onClick={() => setSettings(prev => ({ ...prev, workSites: prev.workSites.filter(s => s.id !== site.id) }))} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>
            </div>
          </div>
        ))}
        <button onClick={() => setSettings(prev => ({ ...prev, workSites: [...(prev.workSites || []), { id: "site_" + Date.now(), name: "", zoneId: null, status: "standby", workers: [] }] }))} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 근무지 추가</button>
      </Card>
    </div>}

    {/* 인력관리 (근무자 + 조직도 + 배치) */}
    {tab === "staffmgmt" && <div>
      {/* 근무유형 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 8px" }}>📋 근무유형</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(settings.workTypes || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, background: "rgba(156,39,176,0.08)", border: "1px solid rgba(156,39,176,0.15)" }}>
              <span style={{ color: "#CE93D8", fontSize: 13 }}>{t}</span>
              <button onClick={() => setSettings(prev => ({ ...prev, workTypes: prev.workTypes.filter((_, j) => j !== i) }))} style={{ padding: 0, border: "none", background: "none", color: "#F44336", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4 }}>
            <Input id="new-wt2" placeholder="새 유형" style={{ width: 100 }} />
            <button onClick={() => { const inp = document.getElementById("new-wt2"); if (inp?.value) { setSettings(prev => ({ ...prev, workTypes: [...(prev.workTypes || []), inp.value] })); inp.value = ""; } }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#9C27B0", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
        </div>
      </Card>

      {/* ① 근무자 등록 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>👤 근무자 등록</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>먼저 근무자를 등록하면 아래 '미배치' 목록에 추가됩니다.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><Label>이름 *</Label><Input id="sw-name" placeholder="홍길동" /></div>
          <div><Label>연락처</Label><Input id="sw-phone" placeholder="010-1234-5678" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><Label>근무유형</Label><select id="sw-type" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
            {(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
          <div><Label>역할</Label><select id="sw-role" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
            {["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
          </select></div>
        </div>
        <button onClick={() => {
          const name = document.getElementById("sw-name")?.value;
          if (!name) { alert("이름을 입력하세요."); return; }
          const phone = document.getElementById("sw-phone")?.value || "";
          const type = document.getElementById("sw-type")?.value || "";
          const role = document.getElementById("sw-role")?.value || "";
          const worker = { id: "w_" + Date.now(), name, phone, type, role, duty: "" };
          // _unassigned 가상 근무지에 추가
          const ws = [...(settings.workSites || [])];
          let pool = ws.find(s => s.id === "_pool");
          if (!pool) { pool = { id: "_pool", name: "미배치", zoneId: null, status: "standby", workers: [] }; ws.push(pool); }
          const pi = ws.indexOf(pool);
          ws[pi] = { ...pool, workers: [...(pool.workers || []), worker] };
          setSettings(prev => ({ ...prev, workSites: ws }));
          document.getElementById("sw-name").value = "";
          document.getElementById("sw-phone").value = "";
          alert("✅ " + name + " 등록 완료 (미배치)");
        }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#4CAF50", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>👤 근무자 등록</button>
      </Card>

      {/* ② 배치 관리 (드래그) */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📋 근무자 배치</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>근무자를 드래그하여 근무지에 배치합니다.</p>

        {/* 미배치 근무자 */}
        {(() => {
          const pool = (settings.workSites || []).find(s => s.id === "_pool");
          const poolWorkers = pool?.workers || [];
          if (poolWorkers.length === 0) return null;
          return (<div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(255,152,0,0.06)", border: "1.5px dashed rgba(255,152,0,0.3)" }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#FF9800"; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,152,0,0.3)"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,152,0,0.3)"; const wid = e.dataTransfer.getData("workerId"); const from = e.dataTransfer.getData("fromSite"); if (wid && from && from !== "_pool") { const ws = [...(settings.workSites || [])]; const fi = ws.findIndex(s => s.id === from); const pi = ws.findIndex(s => s.id === "_pool"); if (fi >= 0 && pi >= 0) { const w = ws[fi].workers.find(ww => ww.id === wid); if (w) { ws[fi] = { ...ws[fi], workers: ws[fi].workers.filter(ww => ww.id !== wid) }; ws[pi] = { ...ws[pi], workers: [...ws[pi].workers, w] }; setSettings(prev => ({ ...prev, workSites: ws })); } } } }}>
            <div style={{ color: "#FF9800", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠️ 미배치 근무자 ({poolWorkers.length}명)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {poolWorkers.map(w => {
                const isEditing = editWorker?.siteId === "_pool" && editWorker?.workerId === w.id;
                const updateW = (field, val) => { const ws = [...(settings.workSites || [])]; const pi = ws.findIndex(s => s.id === "_pool"); if (pi >= 0) { ws[pi] = { ...ws[pi], workers: ws[pi].workers.map(ww => ww.id === w.id ? { ...ww, [field]: val } : ww) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                return isEditing ? (
                  <div key={w.id} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.2)", marginBottom: 4 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div><Label>이름</Label><Input value={w.name} onChange={e => updateW("name", e.target.value)} /></div>
                      <div><Label>연락처</Label><Input value={w.phone || ""} onChange={e => updateW("phone", e.target.value)} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div><Label>근무유형</Label><select value={w.type || ""} onChange={e => updateW("type", e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                        <option value="">선택</option>{(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                      <div><Label>역할</Label><select value={w.role || ""} onChange={e => updateW("role", e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                        <option value="">선택</option>{["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
                      </select></div>
                    </div>
                    <button onClick={() => setEditWorker(null)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "none", background: "#2196F3", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✅ 수정 완료</button>
                  </div>
                ) : (
                  <div key={w.id} draggable onDragStart={e => { e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", "_pool"); }}
                    style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid #333", cursor: "grab", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#ccd6f6", fontSize: 13, fontWeight: 700 }}>{w.name}</span>
                    {w.type && <span style={{ color: "#CE93D8", fontSize: 10 }}>{w.type}</span>}
                    {w.role && <span style={{ color: "#009688", fontSize: 10 }}>{w.role}</span>}
                    <button onClick={(e) => { e.stopPropagation(); setEditWorker({ siteId: "_pool", workerId: w.id }); }} style={{ padding: "1px 6px", border: "1px solid #333", background: "none", color: "#8892b0", fontSize: 11, cursor: "pointer", borderRadius: 4 }}>✏️</button>
                    <button onClick={() => { const ws = [...(settings.workSites || [])]; const pi = ws.findIndex(s => s.id === "_pool"); if (pi >= 0) { ws[pi] = { ...ws[pi], workers: ws[pi].workers.filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "1px 4px", border: "none", background: "none", color: "#F44336", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>);
        })()}

        {/* 구역 아코디언 */}
        {(settings.zones || []).filter(z => z.name).map(zone => {
          const sites = (settings.workSites || []).filter(s => s.zoneId === zone.id && s.id !== "_pool");
          return (<div key={zone.id} style={{ marginBottom: 10, border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#2196F3", fontSize: 15, fontWeight: 800, flex: 1 }}>📍 {zone.name}</span>
              <span style={{ color: "#556", fontSize: 12 }}>{sites.reduce((n, s) => n + (s.workers || []).length, 0)}명</span>
            </div>
            {sites.map(site => {
              const sIdx = (settings.workSites || []).findIndex(s => s.id === site.id);
              return (<div key={site.id} style={{ padding: "10px 14px", borderTop: "1px solid #1a1a2e" }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(76,175,80,0.06)"; }}
                onDragLeave={e => { e.currentTarget.style.background = "transparent"; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.background = "transparent"; const wid = e.dataTransfer.getData("workerId"); const from = e.dataTransfer.getData("fromSite"); if (wid && from && from !== site.id) { const ws = [...(settings.workSites || [])]; const fi = ws.findIndex(s => s.id === from); const ti = ws.findIndex(s => s.id === site.id); if (fi >= 0 && ti >= 0) { const w = (ws[fi].workers || []).find(ww => ww.id === wid); if (w) { ws[fi] = { ...ws[fi], workers: ws[fi].workers.filter(ww => ww.id !== wid) }; ws[ti] = { ...ws[ti], workers: [...(ws[ti].workers || []), w] }; setSettings(prev => ({ ...prev, workSites: ws })); } } } }}>
                <div style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🏠 {site.name} <span style={{ color: "#556", fontWeight: 400 }}>({(site.workers || []).length}명)</span></div>
                {(site.workers || []).map(w => {
                  const isEditing = editWorker?.siteId === site.id && editWorker?.workerId === w.id;
                  const updateW = (field, val) => { const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 >= 0) { ws[si2] = { ...ws[si2], workers: ws[si2].workers.map(ww => ww.id === w.id ? { ...ww, [field]: val } : ww) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                  const deleteW = () => { if (!confirm(`${w.name} 근무자를 삭제하시겠습니까?`)) return; const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 >= 0) { ws[si2] = { ...ws[si2], workers: ws[si2].workers.filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                  return isEditing ? (
                    <div key={w.id} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.2)", marginBottom: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><Label>이름</Label><Input value={w.name} onChange={e => updateW("name", e.target.value)} /></div>
                        <div><Label>연락처</Label><Input value={w.phone || ""} onChange={e => updateW("phone", e.target.value)} /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><Label>근무유형</Label><select value={w.type || ""} onChange={e => updateW("type", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}>
                          <option value="">선택</option>{(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                        </select></div>
                        <div><Label>역할</Label><select value={w.role || ""} onChange={e => updateW("role", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }}>
                          <option value="">선택</option>{["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
                        </select></div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditWorker(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 완료</button>
                        <button onClick={deleteW} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗑 삭제</button>
                      </div>
                    </div>
                  ) : (
                    <div key={w.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", site.id); }}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 4, cursor: "grab", border: "1px solid #1a1a2e" }}>
                      <span style={{ fontSize: 14, color: "#556" }}>⠿</span>
                      <span style={{ color: "#ccd6f6", fontSize: 15, fontWeight: 700 }}>{w.name}</span>
                      {w.type && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(156,39,176,0.1)", color: "#CE93D8", fontSize: 12 }}>{w.type}</span>}
                      {w.role && <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(0,150,136,0.1)", color: "#009688", fontSize: 12 }}>{w.role}</span>}
                      {w.phone && <span style={{ color: "#556", fontSize: 12 }}>{w.phone}</span>}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                        <button onClick={(e) => { e.stopPropagation(); const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 < 0) return; const wks = [...(ws[si2].workers || [])]; const wi2 = wks.findIndex(ww => ww.id === w.id); if (wi2 > 0) { [wks[wi2-1], wks[wi2]] = [wks[wi2], wks[wi2-1]]; ws[si2] = { ...ws[si2], workers: wks }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>▲</button>
                        <button onClick={(e) => { e.stopPropagation(); const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 < 0) return; const wks = [...(ws[si2].workers || [])]; const wi2 = wks.findIndex(ww => ww.id === w.id); if (wi2 < wks.length - 1) { [wks[wi2], wks[wi2+1]] = [wks[wi2+1], wks[wi2]]; ws[si2] = { ...ws[si2], workers: wks }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>▼</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditWorker({ siteId: site.id, workerId: w.id }); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteW(); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 13, cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
                {(site.workers || []).length === 0 && <div style={{ color: "#445", fontSize: 14, padding: "16px", textAlign: "center", border: "1px dashed #444", borderRadius: 10 }}>여기에 근무자를 드래그하세요</div>}
              </div>);
            })}
            {sites.length === 0 && <div style={{ padding: "12px 14px", color: "#445", fontSize: 12 }}>이 구역에 근무지가 없습니다. 구역설정에서 추가하세요.</div>}
          </div>);
        })}
      </Card>
    </div>}


    {tab === "gates" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🚪 출입구 설정 (인파계수)</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>인파 계수를 위한 출입구를 등록합니다. 담당 계정을 지정하면 해당 계수원이 로그인 시 자동으로 배정됩니다.</p>
        {(settings.gates || []).map((g, i) => (
          <div key={g.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid #222" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#4CAF50", fontWeight: 700, fontSize: 14 }}>🚪 {g.name || `출입구 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, gates: settings.gates.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>출입구명</Label><Input value={g.name} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, name: e.target.value }; setSettings({ ...settings, gates: gs }); }} placeholder="정문, 동문 등" /></div>
              <div><Label>담당자 이름</Label><Input value={g.assignee || ""} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, assignee: e.target.value }; setSettings({ ...settings, gates: gs }); }} placeholder="홍길동" /></div>
            </div>
            <div><Label>담당 계정</Label>
              <select value={g.accountId || ""} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, accountId: e.target.value }; setSettings({ ...settings, gates: gs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                <option value="">미지정</option>
                {(accounts || []).filter(a => a.role === "counter" || a.role === "admin" || a.role === "manager").map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
              </select>
            </div>
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, gates: [...(settings.gates || []), { id: "g" + Date.now(), name: "", assignee: "", accountId: "" }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 출입구 추가</button>
      </Card>
    </div>}

    {/* 관리구역 (혼잡도 관리용) */}
    {tab === "zones" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 12px" }}>🗺️ 관리구역 설정 (혼잡도)</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>혼잡도 보고를 위한 관리구역을 설정합니다. 담당자가 구역별 혼잡 상태를 보고합니다.</p>
        {(settings.zones || []).map((z, i) => (
          <div key={z.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid #222" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#2196F3", fontWeight: 700, fontSize: 14 }}>📍 {z.name || `구역 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>
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
              <span style={{ color: "#4CAF50", fontSize: 14 }}>✅ {z.accountId} 계정이 로그인하면 이 구역이 자동 선택됩니다</span>
            </div>}
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, zones: [...(settings.zones || []), { id: "z" + Date.now(), name: "", range: "", assignee: "", accountId: "", count: 0 }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 구역 추가</button>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#2196F3", fontSize: 13, margin: 0, lineHeight: 1.7 }}>ℹ️ 담당 계정을 지정하면 해당 계수원이 로그인 시 자동으로 배정 구역이 선택됩니다. 구역별 인원 합계가 전체 인파관리 수치로 집계됩니다.</p>
      </Card>
    </div>}

    {/* Workers Management */}
    {tab === "workers" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>👷 안전관리 근무자 명단</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>등록된 근무자는 조치사항 작성 시 담당자로 지정할 수 있습니다.</p>
        {(settings.workers || []).map((w, i) => (
          <div key={w.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: `1px solid ${w.role === "manager" ? "rgba(244,67,54,0.2)" : "rgba(255,152,0,0.15)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "2px 8px", borderRadius: 10, background: w.role === "manager" ? "rgba(244,67,54,0.15)" : "rgba(255,152,0,0.15)", color: w.role === "manager" ? "#F44336" : "#FF9800", fontSize: 14, fontWeight: 700 }}>{w.role === "manager" ? "🔴 책임자" : "🟠 요원"}</span>
                <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{w.name || "이름 미입력"}</span>
              </div>
              <button onClick={() => setSettings({ ...settings, workers: settings.workers.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>
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
            <span style={{ color: "#556", fontSize: 14, fontWeight: 700 }}>역할</span>
            <span style={{ color: "#556", fontSize: 14, fontWeight: 700 }}>이름</span>
            <span style={{ color: "#556", fontSize: 14, fontWeight: 700 }}>연락처</span>
            <span style={{ color: "#556", fontSize: 14, fontWeight: 700 }}>근무위치</span>
            <span style={{ color: "#556", fontSize: 14, fontWeight: 700 }}>임무</span>
          </div>
          {(settings.workers || []).map(w => (
            <div key={w.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 1fr 1fr", gap: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
              <span style={{ color: w.role === "manager" ? "#F44336" : "#FF9800", fontSize: 14, fontWeight: 700 }}>{w.role === "manager" ? "책임자" : "요원"}</span>
              <span style={{ color: "#ccd6f6", fontSize: 13 }}>{w.name}</span>
              <span style={{ color: "#8892b0", fontSize: 14, fontFamily: "monospace" }}>{w.phone}</span>
              <span style={{ color: "#8892b0", fontSize: 14 }}>{w.position || "-"}</span>
              <span style={{ color: "#8892b0", fontSize: 14 }}>{w.duty || "-"}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
          <span style={{ color: "#556", fontSize: 13 }}>책임자 {(settings.workers||[]).filter(w=>w.role==="manager").length}명 | 요원 {(settings.workers||[]).filter(w=>w.role==="staff").length}명 | 총 {(settings.workers||[]).length}명</span>
        </div>
      </Card>}
    </div>}

    {/* Parking Lot Management */}
    {tab === "parking" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🅿️ 주차장 관리</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>주차장을 등록하고, 계정관리에서 주차요원 계정을 생성한 뒤 주차장을 배정하세요.</p>
        {(settings.parkingLots || []).map((lot, i) => (
          <div key={lot.id} style={{ padding: 14, background: "rgba(156,39,176,0.04)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(156,39,176,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#9C27B0", fontWeight: 700, fontSize: 14 }}>🅿️ {lot.name || `주차장 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, parkingLots: settings.parkingLots.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>
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
            <span style={{ color: "#8892b0", fontSize: 13, fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>{lot.current || 0}/{lot.capacity}</span>
            <span style={{ color: remain <= 0 ? "#F44336" : "#4CAF50", fontSize: 14, fontWeight: 700, minWidth: 45 }}>{remain <= 0 ? "만차" : `잔여${remain}`}</span>
          </div>;
        })}
      </Card>}
      <Card style={{ background: "rgba(156,39,176,0.04)", border: "1px solid rgba(156,39,176,0.12)" }}>
        <p style={{ color: "#9C27B0", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
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
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>정류장을 순서대로 등록하세요. 셔틀요원이 정류장 도착 시 버튼을 눌러 위치를 업데이트합니다.</p>
        {(settings.shuttleStops || []).sort((a,b) => (a.order||0)-(b.order||0)).map((stop, i) => (
          <div key={stop.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,188,212,0.04)", borderRadius: 8, marginBottom: 4, border: "1px solid rgba(0,188,212,0.1)" }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: "#00BCD4", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i+1}</span>
            <Input value={stop.name} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, name: e.target.value}; setSettings({...settings, shuttleStops: ss}); }} placeholder="정류장명" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }} />
            <Input type="number" value={stop.order||i+1} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, order: parseInt(e.target.value)||0}; setSettings({...settings, shuttleStops: ss}); }} style={{ width: 50, padding: "8px", fontSize: 14, textAlign: "center" }} />
            <button onClick={() => setSettings({...settings, shuttleStops: (settings.shuttleStops||[]).filter(s=>s.id!==stop.id)})} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>
        ))}
        <button onClick={() => { const ord = (settings.shuttleStops||[]).length + 1; setSettings({...settings, shuttleStops: [...(settings.shuttleStops||[]), {id: "st"+Date.now(), name: "", order: ord}]}); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #00BCD4", background: "transparent", color: "#00BCD4", fontSize: 13, cursor: "pointer", marginTop: 8 }}>+ 정류장 추가</button>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🚌 셔틀버스 배차</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>버스를 등록하고, 계정관리에서 셔틀요원 계정을 만든 뒤 담당자를 배정하세요.</p>
        {(settings.shuttleBuses || []).map((bus, i) => (
          <div key={bus.id} style={{ padding: 14, background: "rgba(0,188,212,0.03)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(0,188,212,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#00BCD4", fontWeight: 700, fontSize: 14 }}>🚌 {bus.name || `버스 ${i+1}`}</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {bus.status && <span style={{ padding: "2px 8px", borderRadius: 10, background: bus.status==="running"?"rgba(76,175,80,0.15)":bus.status==="stopped"?"rgba(255,152,0,0.15)":"rgba(244,67,54,0.15)", color: bus.status==="running"?"#4CAF50":bus.status==="stopped"?"#FF9800":"#F44336", fontSize: 13, fontWeight: 700 }}>{bus.status==="running"?"운행중":bus.status==="stopped"?"대기":"종료"}</span>}
                <button onClick={() => setSettings({...settings, shuttleBuses: settings.shuttleBuses.filter((_,j)=>j!==i)})} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>
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
              <span style={{ color: "#00BCD4", fontSize: 13 }}>📍 {bus.currentStopName} ({bus.lastUpdated||""})</span>
              <span style={{ color: (bus.passengers||0)>=(bus.capacity||45)?"#F44336":"#4CAF50", fontSize: 13, fontWeight: 700 }}>👥 {bus.passengers||0}/{bus.capacity||45}</span>
            </div>}
          </div>
        ))}
        <button onClick={() => setSettings({...settings, shuttleBuses: [...(settings.shuttleBuses||[]), {id: "bus"+Date.now(), name: "", route: "", capacity: 45, passengers: 0, assigneeId: "", currentStopId: "", currentStopName: "", status: "off", lastUpdated: ""}]})} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #00BCD4", background: "transparent", color: "#00BCD4", fontSize: 13, cursor: "pointer" }}>+ 버스 추가</button>
      </Card>

      <Card style={{ background: "rgba(0,188,212,0.04)", border: "1px solid rgba(0,188,212,0.12)" }}>
        <p style={{ color: "#00BCD4", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
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
          const zoneData = (settings.gates || []).map(z => { const s = (crowdData.zones || []).find(sz => sz.id === z.id); return { ...z, count: s?.count || 0, cumulative: s?.cumulative || 0 }; });
          return (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.15)" }}>
                <div style={{ color: "#8892b0", fontSize: 13 }}>🏃 체류 인원</div>
                <div style={{ color: "#4CAF50", fontSize: 32, fontWeight: 900, fontFamily: "monospace" }}>{curVal.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                <div style={{ color: "#8892b0", fontSize: 13 }}>📊 누적 방문</div>
                <div style={{ color: "#2196F3", fontSize: 32, fontWeight: 900, fontFamily: "monospace" }}>{cumVal.toLocaleString()}</div>
              </div>
            </div>

            {/* 누적 수동 조정 */}
            <h4 style={{ color: "#ccd6f6", fontSize: 13, margin: "0 0 8px" }}>🔧 누적 방문객 수동 조정</h4>
            <p style={{ color: "#556", fontSize: 13, margin: "0 0 10px" }}>오차 보정이나 초기값 설정 시 사용합니다.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Input id="cum-adj" type="number" placeholder="숫자 입력 (예: 5000)" style={{ flex: 1 }} />
              <button onClick={() => { const v = parseInt(document.getElementById("cum-adj")?.value); if (!isNaN(v) && v >= 0) { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = v; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, v, cd.zones || [], "admin"); document.getElementById("cum-adj").value = ""; alert(`✅ 누적 방문객이 ${v.toLocaleString()}명으로 설정되었습니다.`); } else { alert("0 이상의 숫자를 입력하세요."); } }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>설정</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button onClick={() => { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = 0; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, 0, cd.zones || [], "admin"); alert("✅ 누적 초기화 완료"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>누적만 초기화 (0명)</button>
              <button onClick={() => { const cd = { total: 0, cumulative: 0, zones: (crowdData.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })) }; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(0, 0, cd.zones, "admin"); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0 } : c)); alert("✅ 전체 초기화 완료 (체류 + 누적)"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>전체 초기화</button>
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
                    <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{z.name}</span>
                    <span style={{ color: "#4CAF50", fontSize: 13, fontWeight: 800, fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>체류 {(z.count || 0).toLocaleString()}</span>
                    <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 700, fontFamily: "monospace", minWidth: 70, textAlign: "right", marginLeft: 8 }}>누적 {(z.cumulative || 0).toLocaleString()}</span>
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
          if (hLog.length < 2) return <p style={{ color: "#556", fontSize: 14, textAlign: "center", padding: 20 }}>데이터가 2건 이상 기록되면 그래프가 표시됩니다.<br/>(5분 간격 자동 기록)</p>;
          const chartData = hLog.slice(-60).map(h => ({ time: h.time, 체류: h.current || 0, 누적: h.cumulative || 0 }));
          return (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 14 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} />
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
        {(settings.dailyRecords || []).length === 0 ? <p style={{ color: "#556", fontSize: 14, textAlign: "center", padding: 20 }}>인파계수 → 📊 데이터 관리 → 📋 금일 데이터 저장으로 기록합니다.</p> : <>
          {(() => {
            const dRecs = settings.dailyRecords || [];
            const chartData = dRecs.map(r => ({ date: r.date, 누적방문: r.cumulative || 0, 최대체류: r.peakCurrent || 0 }));
            return chartData.length >= 2 ? (
              <div style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fill: "#556", fontSize: 13 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 14 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 14 }} />
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
                <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{r.date}</span>
                <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                <span style={{ color: "#FF9800", fontSize: 13 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>}
      </Card>
    </div>}

    {/* 📋 조직도 / 비상연락망 */}
    {tab === "orgchart" && <OrgChartTab settings={settings} setSettings={setSettings} />}

    {/* 근무관리 */}
    {tab === "workmgmt" && <div>
      {/* 근무유형 설정 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 10px" }}>📋 근무유형 설정</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {(settings.workTypes || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "rgba(156,39,176,0.08)", border: "1px solid rgba(156,39,176,0.15)" }}>
              <span style={{ color: "#CE93D8", fontSize: 13 }}>{t}</span>
              <button onClick={() => setSettings(prev => ({ ...prev, workTypes: prev.workTypes.filter((_, j) => j !== i) }))} style={{ padding: 0, border: "none", background: "none", color: "#F44336", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input id="new-worktype" placeholder="새 유형 (예: 파견직)" style={{ flex: 1 }} />
          <button onClick={() => { const inp = document.getElementById("new-worktype"); if (inp?.value) { setSettings(prev => ({ ...prev, workTypes: [...(prev.workTypes || []), inp.value] })); inp.value = ""; } }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#9C27B0", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
      </Card>

      {/* 근무지 관리 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🏠 근무지 관리</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>근무지를 만들고 구역에 배치합니다. 드래그로 이동 가능.</p>
        {(settings.workSites || []).map((site, si) => (
          <div key={site.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid #222", marginBottom: 10 }}
            draggable onDragStart={e => e.dataTransfer.setData("siteId", site.id)}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
            onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = "none"; const dragId = e.dataTransfer.getData("siteId"); if (dragId && dragId !== site.id) { const ws = [...(settings.workSites || [])]; const di = ws.findIndex(s => s.id === dragId); const ti = ws.findIndex(s => s.id === site.id); if (di >= 0 && ti >= 0) { const [item] = ws.splice(di, 1); ws.splice(ti, 0, item); setSettings(prev => ({ ...prev, workSites: ws })); } } }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ cursor: "grab", fontSize: 16 }}>⠿</span>
              <Input value={site.name} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, name: e.target.value }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="근무지명 (예: A구역 안내소)" style={{ flex: 1 }} />
              <select value={site.zoneId || ""} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, zoneId: e.target.value || null }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "8px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13, maxWidth: 120 }}>
                <option value="">구역 미지정</option>
                {(settings.zones || []).filter(z => z.name).map(z => <option key={z.id} value={z.id}>📍{z.name}</option>)}
              </select>
              <button onClick={() => setSettings(prev => ({ ...prev, workSites: prev.workSites.filter(s => s.id !== site.id) }))} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>
            </div>

            {/* 근무자 목록 */}
            <div style={{ marginLeft: 20 }}>
              {(site.workers || []).map((w, wi) => (
                <div key={w.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}
                  draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", site.id); }}>
                  <span style={{ cursor: "grab", fontSize: 12, color: "#556" }}>⠿</span>
                  <Input value={w.name} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, name: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="이름" style={{ width: 70 }} />
                  <Input value={w.phone || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, phone: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="연락처" style={{ width: 100 }} />
                  <select value={w.type || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, type: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 12 }}>
                    <option value="">유형</option>
                    {(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input value={w.duty || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, duty: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="담당업무" style={{ flex: 1 }} />
                  <button onClick={() => { const ws = [...(settings.workSites || [])]; ws[si] = { ...ws[si], workers: (ws[si].workers || []).filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "2px 6px", borderRadius: 4, border: "none", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              ))}
              <button onClick={() => { const ws = [...(settings.workSites || [])]; ws[si] = { ...ws[si], workers: [...(ws[si].workers || []), { id: "w_" + Date.now(), name: "", phone: "", type: "", duty: "" }] }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "8px", borderRadius: 8, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer", width: "100%" }}>+ 근무자 추가</button>
            </div>
          </div>
        ))}
        <button onClick={() => setSettings(prev => ({ ...prev, workSites: [...(prev.workSites || []), { id: "site_" + Date.now(), name: "", zoneId: null, status: "standby", workers: [] }] }))} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 근무지 추가</button>
      </Card>
    </div>}


    {/* 체크리스트 */}
    {tab === "checklist" && <div>
      {(settings.checklists || []).map((cl, ci) => {
        const done = cl.items.filter(i => i.checked).length;
        const total = cl.items.length;
        const pct = total > 0 ? Math.round(done / total * 100) : 0;
        const catColor = cl.category === "pre" ? "#2196F3" : cl.category === "during" ? "#4CAF50" : "#FF9800";
        const catLabel = cl.category === "pre" ? "개장 전" : cl.category === "during" ? "운영 중" : "폐장 후";
        return (<Card key={cl.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ padding: "2px 8px", borderRadius: 4, background: `${catColor}15`, color: catColor, fontSize: 12, fontWeight: 700 }}>{catLabel}</span>
            <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: 0, flex: 1 }}>{cl.title}</h3>
            <span style={{ color: pct === 100 ? "#4CAF50" : "#FF9800", fontSize: 14, fontWeight: 700 }}>{done}/{total}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginBottom: 10 }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#4CAF50" : catColor, borderRadius: 2, transition: "width .3s" }} /></div>
          {cl.items.map((item, ii) => (
            <div key={item.id} onClick={() => { const cls = [...(settings.checklists || [])]; const its = [...cls[ci].items]; its[ii] = { ...item, checked: !item.checked, checkedBy: !item.checked ? (session?.name || "") : "", checkedAt: !item.checked ? new Date().toLocaleString("ko-KR") : "" }; cls[ci] = { ...cls[ci], items: its }; setSettings(prev => ({ ...prev, checklists: cls })); if (!item.checked) { setSettings(prev => ({ ...prev, timeline: [...(prev.timeline || []), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "check", message: `✅ ${cl.title} - "${item.text}" 점검완료`, actor: session?.name }] })); } }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: item.checked ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${item.checked ? "rgba(76,175,80,0.12)" : "#222"}`, marginBottom: 4, cursor: "pointer" }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: item.checked ? "2px solid #4CAF50" : "2px solid #444", background: item.checked ? "#4CAF50" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.checked && <span style={{ color: "#fff", fontSize: 14 }}>✓</span>}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: item.checked ? "#4CAF50" : "#ccd6f6", fontSize: 14, textDecoration: item.checked ? "line-through" : "none" }}>{item.text}</div>
                {item.checkedBy && <div style={{ color: "#556", fontSize: 11 }}>{item.checkedBy} · {item.checkedAt}</div>}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Input id={`nci_${cl.id}`} placeholder="새 점검항목 추가" style={{ flex: 1 }} />
            <button onClick={() => { const inp = document.getElementById(`nci_${cl.id}`); if (!inp?.value) return; const cls = [...(settings.checklists || [])]; cls[ci] = { ...cls[ci], items: [...cls[ci].items, { id: "ci_"+Date.now(), text: inp.value, checked: false }] }; setSettings(prev => ({ ...prev, checklists: cls })); inp.value = ""; }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: catColor, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
        </Card>);
      })}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 10px" }}>➕ 체크리스트 추가</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <Input id="new_cl_title" placeholder="체크리스트 제목" style={{ flex: 1 }} />
          <select id="new_cl_cat" style={{ padding: "8px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
            <option value="pre">개장 전</option><option value="during">운영 중</option><option value="post">폐장 후</option>
          </select>
          <button onClick={() => { const t = document.getElementById("new_cl_title"); const c = document.getElementById("new_cl_cat"); if (!t?.value) return; setSettings(prev => ({ ...prev, checklists: [...(prev.checklists || []), { id: "cl_"+Date.now(), title: t.value, category: c.value, items: [] }] })); t.value = ""; }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
      </Card>
      <button onClick={() => { if (confirm("모든 체크리스트 체크를 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, checklists: (prev.checklists || []).map(cl => ({ ...cl, items: cl.items.map(i => ({ ...i, checked: false, checkedBy: "", checkedAt: "" })) })) })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 13, cursor: "pointer" }}>🔄 체크리스트 전체 초기화</button>
    </div>}

    {/* 프로그램/일정 */}
    {tab === "programs" && <div>
      {/* 엑셀 양식 다운로드 / 업로드 */}
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📥 엑셀로 일괄 등록</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>양식을 다운로드 → 작성 → 업로드하면 자동 적용됩니다.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <button onClick={() => {
            const sample = [
              { 날짜: "2026-05-02", 시작시간: "09:00", 종료시간: "10:00", 프로그램명: "개막식", 장소: "주무대", 구분: "공연", 비고: "" },
              { 날짜: "2026-05-02", 시작시간: "10:30", 종료시간: "11:30", 프로그램명: "풍물놀이", 장소: "주무대", 구분: "공연", 비고: "" },
              { 날짜: "2026-05-02", 시작시간: "13:00", 종료시간: "21:00", 프로그램명: "전통체험", 장소: "진주성", 구분: "체험", 비고: "" },
              { 날짜: "2026-05-03", 시작시간: "14:00", 종료시간: "15:30", 프로그램명: "가수 공연", 장소: "주무대", 구분: "공연", 비고: "" },
            ];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sample);
            ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 8 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, ws, "프로그램");
            XLSX.writeFile(wb, "축제프로그램_양식.xlsx");
          }} style={{ padding: "14px", borderRadius: 10, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#2196F3", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📥 양식 다운로드</button>
          <label style={{ padding: "14px", borderRadius: 10, border: "1px solid #4CAF50", background: "rgba(76,175,80,0.08)", color: "#4CAF50", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
            📤 엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (evt) => {
                try {
                  const wb = XLSX.read(evt.target.result, { type: "binary" });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const rows = XLSX.utils.sheet_to_json(ws);
                  const programs = rows.filter(r => r["프로그램명"] || r["시작시간"]).map((r, i) => ({
                    id: "pg_" + Date.now() + "_" + i,
                    title: r["프로그램명"] || r["프로그램"] || r["제목"] || r["title"] || "",
                    date: r["날짜"] || r["date"] || "",
                    time: String(r["시작시간"] || r["시작"] || r["start"] || "").replace(/\./g, ":").slice(0, 5),
                    endTime: String(r["종료시간"] || r["종료"] || r["end"] || "").replace(/\./g, ":").slice(0, 5),
                    location: r["장소"] || r["location"] || "",
                    category: ({"공연":"P","체험":"E","부대":"S","부대행사":"S"})[r["구분"]] || r["구분"] || "",
                    memo: r["비고"] || r["memo"] || "",
                  }));
                  if (programs.length === 0) { alert("프로그램 데이터를 찾을 수 없습니다.\n'프로그램명', '시작시간', '종료시간', '장소' 열이 필요합니다."); return; }
                  setSettings(prev => ({ ...prev, programs }));
                  alert(`✅ ${programs.length}개 프로그램이 등록되었습니다.`);
                } catch (err) { alert("❌ 파일 읽기 실패: " + err.message); }
              };
              reader.readAsBinaryString(file);
              e.target.value = "";
            }} style={{ display: "none" }} />
          </label>
        </div>
        <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)", margin: 0 }}>
          <p style={{ color: "#2196F3", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
            ℹ️ 엑셀 열: <strong>날짜</strong>(2026-05-02) · <strong>시작시간</strong> · <strong>종료시간</strong> · <strong>프로그램명</strong> · <strong>장소</strong> · <strong>구분</strong>(공연/체험/부대) · 비고<br />
            • 시간 형식: 09:00, 14:30 (24시간)<br />
            • 업로드 시 기존 프로그램은 교체됩니다
          </p>
        </Card>
      </Card>

      {/* 프로그램 목록 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: 0, flex: 1 }}>🎭 프로그램 목록 ({(settings.programs||[]).length}개)</h3>
          <button onClick={() => {
            if ((settings.programs||[]).length === 0) return;
            const wb = XLSX.utils.book_new();
            const data = (settings.programs||[]).map(p => ({ 날짜: p.date || "", 시작시간: p.time, 종료시간: p.endTime, 프로그램명: p.title, 장소: p.location, 구분: ({"P":"공연","E":"체험","S":"부대"})[p.category] || "", 비고: p.memo || "" }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "프로그램");
            XLSX.writeFile(wb, `프로그램_${settings.festivalName||"축제"}.xlsx`);
          }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>📥 현재 목록 내보내기</button>
        </div>
        {(settings.programs || []).sort((a,b) => (a.time||"").localeCompare(b.time||"")).map((pg, pi) => {
          const now2 = new Date(); const [sh,sm] = (pg.time||"00:00").split(":").map(Number); const [eh,em] = (pg.endTime||"23:59").split(":").map(Number);
          const isNow = now2.getHours()*60+now2.getMinutes() >= sh*60+sm && now2.getHours()*60+now2.getMinutes() <= eh*60+em;
          const idx = (settings.programs||[]).indexOf(pg);
          return (<div key={pg.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: isNow ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", border: isNow ? "1px solid rgba(76,175,80,0.2)" : "1px solid #222", marginBottom: 4 }}>
            {isNow && <span style={{ color: "#4CAF50", fontSize: 12, fontWeight: 700 }}>🟢</span>}
            <span style={{ color: "#8892b0", fontSize: 14, fontFamily: "monospace", minWidth: 100 }}>{pg.time||"--:--"}~{pg.endTime||"--:--"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700 }}>{pg.title || "프로그램명 없음"}</div>
              {pg.location && <div style={{ color: "#556", fontSize: 12 }}>📍 {pg.location}</div>}
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, programs: prev.programs.filter((_,i) => i !== idx) }))} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>);
        })}
        {(settings.programs||[]).length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#556" }}>프로그램이 없습니다. 엑셀을 업로드하거나 수동으로 추가하세요.</div>}
        <button onClick={() => setSettings(prev => ({ ...prev, programs: [...(prev.programs||[]), { id: "pg_"+Date.now(), title: "", time: "", endTime: "", location: "", memo: "" }] }))} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer", marginTop: 6 }}>+ 수동 추가</button>
      </Card>
      <button onClick={() => { if (confirm("프로그램 목록을 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, programs: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 13, cursor: "pointer" }}>🔄 프로그램 초기화</button>
    </div>}

    {/* 의료/응급 기록 */}
    {tab === "medical" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 10px" }}>🏥 응급환자 기록</h3>
        <button onClick={() => setSettings(prev => ({ ...prev, medicalRecords: [{ id: "med_"+Date.now(), time: new Date().toLocaleString("ko-KR"), location: "", symptoms: "", action: "", status: "treating", patient: "", responder: session?.name || "" }, ...(prev.medicalRecords||[])] }))} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "#F44336", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>🆘 응급환자 발생 등록</button>
        {(settings.medicalRecords || []).map((mr, mi) => {
          const stMap = { treating: { label: "치료중", color: "#FF9800" }, transferred: { label: "이송완료", color: "#2196F3" }, discharged: { label: "귀가", color: "#4CAF50" } };
          const mst = stMap[mr.status] || stMap.treating;
          const upMed = (field, val) => { const m = [...(settings.medicalRecords||[])]; m[mi] = { ...mr, [field]: val }; setSettings(prev => ({ ...prev, medicalRecords: m })); };
          return (<div key={mr.id} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${mst.color}33`, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#F44336", fontSize: 14, fontWeight: 700 }}>🏥 #{mi+1}</span>
              <span style={{ color: "#556", fontSize: 12, flex: 1 }}>{mr.time}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(stMap).map(([k, v]) => (
                  <button key={k} onClick={() => { upMed("status", k); if (k !== mr.status) setSettings(prev => ({ ...prev, timeline: [...(prev.timeline||[]), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "medical", message: `🏥 응급환자 #${mi+1} → ${v.label}`, actor: session?.name }] })); }} style={{ padding: "4px 8px", borderRadius: 6, border: mr.status === k ? `2px solid ${v.color}` : "1px solid #333", background: mr.status === k ? `${v.color}15` : "transparent", color: v.color, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{v.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Label>환자명</Label><Input value={mr.patient} onChange={e => upMed("patient", e.target.value)} placeholder="이름/인상착의" /></div>
              <div><Label>발생장소</Label><Input value={mr.location} onChange={e => upMed("location", e.target.value)} placeholder="B구역 무대 앞" /></div>
            </div>
            <div style={{ marginTop: 6 }}><Label>증상</Label><Input value={mr.symptoms} onChange={e => upMed("symptoms", e.target.value)} placeholder="탈수, 열사병, 골절 등" /></div>
            <div style={{ marginTop: 6 }}><Label>조치사항</Label><Input value={mr.action} onChange={e => upMed("action", e.target.value)} placeholder="응급처치 후 119 이송" /></div>
            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
              <span style={{ color: "#556", fontSize: 12 }}>담당: {mr.responder}</span>
              <button onClick={() => { if (confirm("이 기록을 삭제하시겠습니까?")) setSettings(prev => ({ ...prev, medicalRecords: prev.medicalRecords.filter((_,i)=>i!==mi) })); }} style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 11, cursor: "pointer" }}>삭제</button>
            </div>
          </div>);
        })}
        {(settings.medicalRecords||[]).length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#556" }}>응급환자 기록이 없습니다.</div>}
      </Card>
      <button onClick={() => { if (confirm("모든 의료기록을 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, medicalRecords: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 13, cursor: "pointer" }}>🔄 의료기록 초기화</button>
    </div>}

    {/* 상황일지 */}
    {tab === "timeline" && <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: 0, flex: 1 }}>📋 상황일지</h3>
          <span style={{ color: "#556", fontSize: 13 }}>{(settings.timeline||[]).length}건</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Input id="tl_manual" placeholder="수동 기록 입력" style={{ flex: 1 }} />
          <button onClick={() => { const inp = document.getElementById("tl_manual"); if (!inp?.value) return; setSettings(prev => ({ ...prev, timeline: [...(prev.timeline||[]), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "manual", message: inp.value, actor: session?.name }] })); inp.value = ""; }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>기록</button>
        </div>
        {(settings.timeline || []).slice().reverse().map(tl => {
          const typeIcon = { check: "✅", emergency: "🚨", medical: "🏥", request: "📨", manual: "📝", congestion: "🚦", status: "📊" }[tl.type] || "📌";
          const typeColor = { emergency: "#F44336", medical: "#FF9800", manual: "#2196F3" }[tl.type] || "#8892b0";
          return (<div key={tl.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a2e" }}>
            <div style={{ width: 70, flexShrink: 0, textAlign: "right" }}><div style={{ color: "#556", fontSize: 11 }}>{tl.time?.split(" ")[0]}</div><div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700 }}>{tl.time?.split(" ")[1]}</div></div>
            <div style={{ width: 3, background: typeColor, borderRadius: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ccd6f6", fontSize: 13 }}>{typeIcon} {tl.message}</div>
              {tl.actor && <div style={{ color: "#556", fontSize: 11 }}>👤 {tl.actor}</div>}
            </div>
          </div>);
        })}
        {(settings.timeline||[]).length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#556" }}>기록이 없습니다.</div>}
      </Card>
      <button onClick={() => { if (confirm("상황일지를 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, timeline: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 13, cursor: "pointer" }}>🔄 상황일지 초기화</button>
    </div>}

    {tab === "custom" && <Card><h3 style={{ color: "#ccd6f6", fontSize: 15, margin: "0 0 14px" }}>➕ 항목 추가</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "항목명", k: "name" }, { l: "단위", k: "unit" }, { l: "아이콘", k: "icon" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={newCat[f.k]} onChange={e => setNewCat({ ...newCat, [f.k]: e.target.value })} /></div>))}<div><Label>기상청 카테고리</Label><select value={newCat.kmaCategory || ""} onChange={e => setNewCat({ ...newCat, kmaCategory: e.target.value })} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff" }}><option value="">없음</option>{Object.entries(KMA_CODES).map(([code, info]) => <option key={code} value={code}>{code} — {info.name}</option>)}</select></div>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: lv.color, fontSize: 13, fontWeight: 700, minWidth: 36 }}>{lv.label}</span><input type="number" value={newCat.thresholds[lk][0]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [parseFloat(e.target.value) || 0, t[lk][1]]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={newCat.thresholds[lk][1] === Infinity ? "∞" : newCat.thresholds[lk][1]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [t[lk][0], e.target.value === "∞" ? Infinity : parseFloat(e.target.value) || 0]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "3px 6px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }} /></div>))}<button onClick={() => { if (!newCat.name) return; setCategories(p => [...p, { ...newCat, id: "c_" + Date.now(), source: newCat.kmaCategory ? "api" : "manual" }]); }} style={{ padding: "12px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>추가</button></div></Card>}

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
          {settings.is24HourMode && <button onClick={() => setSettings({ ...settings, is24HourMode: false })} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>끄기</button>}
        </div>
      </Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>🔧 축제 기본정보</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "축제명", k: "festivalName" }, { l: "부제목", k: "festivalSubtitle" }, { l: "관리기관", k: "organization" }, { l: "연락처", k: "contactNumber" }, { l: "로고", k: "logoEmoji" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={settings[f.k]} onChange={e => setSettings({ ...settings, [f.k]: e.target.value })} /></div>))}</div></Card>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📅 축제 일자</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 12px" }}>축제 운영 일자를 등록하세요. 일일 마감 시 일자별 데이터가 저장됩니다.</p>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <Input type="date" id="fest-date-add" style={{ flex: 1 }} />
          <button onClick={() => { const d = document.getElementById("fest-date-add")?.value; if (d && !(settings.festivalDates || []).includes(d)) setSettings({ ...settings, festivalDates: [...(settings.festivalDates || []), d].sort() }); }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(settings.festivalDates || []).map(d => {
            const dt = new Date(d); const label = `${dt.getMonth()+1}/${dt.getDate()}`;
            const isToday = d === new Date().toISOString().slice(0, 10);
            return <span key={d} onClick={() => setSettings({ ...settings, festivalDates: (settings.festivalDates || []).filter(x => x !== d) })} style={{ padding: "6px 12px", borderRadius: 8, background: isToday ? "rgba(76,175,80,0.12)" : "rgba(33,150,243,0.1)", border: isToday ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(33,150,243,0.15)", color: isToday ? "#4CAF50" : "#2196F3", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{label}{isToday ? " (오늘)" : ""} ✕</span>;
          })}
        </div>
        {(settings.dailyRecords || []).length > 0 && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid #222" }}>
          <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📋 저장된 일자별 데이터</div>
          {(settings.dailyRecords || []).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
              <span style={{ color: "#ccd6f6", fontSize: 14 }}>{r.date}</span>
              <span style={{ color: "#2196F3", fontSize: 14, fontWeight: 700 }}>누적 {(r.cumulative || 0).toLocaleString()}명</span>
              <span style={{ color: "#4CAF50", fontSize: 13 }}>최대체류 {(r.peakCurrent || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>}
      </Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>📍 위치</h3><div style={{ display: "flex", gap: 8, marginBottom: 14 }}><button onClick={autoLocate} disabled={locLoading} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: loc.mode === "auto" ? "#4CAF50" : "#2196F3", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: locLoading ? .6 : 1 }}>{locLoading ? "📡 확인 중..." : "📡 자동 위치"}</button><button onClick={() => setSettings({ ...settings, location: { ...loc, mode: "manual" } })} style={{ flex: 1, padding: "12px", borderRadius: 8, border: loc.mode === "manual" ? "1px solid #FF9800" : "1px solid #333", background: loc.mode === "manual" ? "rgba(255,152,0,0.1)" : "transparent", color: loc.mode === "manual" ? "#FF9800" : "#8892b0", fontWeight: 700, cursor: "pointer" }}>✏️ 수동</button></div><div style={{ display: "grid", gap: 10 }}><div><Label>위치명</Label><Input value={loc.name || ""} onChange={e => setSettings({ ...settings, location: { ...loc, name: e.target.value, mode: "manual" } })} /></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><div><Label>위도</Label><Input type="number" step="0.0001" value={loc.lat || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lat: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div><div><Label>경도</Label><Input type="number" step="0.0001" value={loc.lon || ""} onChange={e => setSettings({ ...settings, location: { ...loc, lon: parseFloat(e.target.value) || 0, mode: "manual" } })} /></div></div></div><div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}><p style={{ color: "#445", fontSize: 14, margin: 0 }}>📍{loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)}) — {loc.mode === "auto" ? "자동" : "수동"} | 격자: nx={grid.nx}, ny={grid.ny}</p></div></Card>
      <Card><h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 6px" }}>📐 순면적</h3><div style={{ marginBottom: 12 }}><Label>면적 (㎡)</Label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Input type="number" value={settings.venueArea} onChange={e => setSettings({ ...settings, venueArea: parseFloat(e.target.value) || 0 })} style={{ width: 150, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>㎡</span><span style={{ color: "#445", fontSize: 14 }}>({(settings.venueArea * .3025).toFixed(0)}평)</span></div></div><button onClick={() => { const t = calcCrowdThr(settings.venueArea); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, thresholds: t } : c)); alert("✅ 인파 기준 적용"); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 인파 기준 자동 적용</button></Card>



      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>💾 설정 저장 / 불러오기</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>축제 설정 전체를 파일로 저장하고 다시 불러올 수 있습니다.</p>
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
          <span style={{ color: "#556", fontSize: 14, lineHeight: 1.7 }}>저장 항목: 축제명, 운영시간, 위치, 순면적, 기상청API, SMS, 구역, 근무자, 주차장, 계정정보, 모니터링항목, 대시보드 표시설정</span>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#F44336", fontSize: 16, margin: "0 0 4px" }}>🔄 데이터 초기화</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>운영 중 수동 입력된 데이터를 항목별로 초기화합니다. 설정은 유지됩니다.</p>
        <div style={{ display: "grid", gap: 8 }}>

          <button onClick={() => { if (confirm("인파관리 데이터를 초기화하시겠습니까?\n현재 인원수가 0으로 리셋됩니다.")) { setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null } : c)); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })) })); if (window.crowdDB) window.crowdDB.set(0, 0, (settings.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })), "reset"); onDataReset?.(); alert("✅ 인파관리 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            👥 인파관리 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>전체 인원 + 구역별 인원 → 0</span>
          </button>

          <button onClick={() => { if (confirm("주차장 현황을 초기화하시겠습니까?\n모든 주차장의 현재 대수가 0으로 리셋됩니다.")) { setSettings(prev => ({ ...prev, parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })) })); onDataReset?.(); alert("✅ 주차장 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🅿️ 주차장 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>모든 주차장 현재 대수 → 0</span>
          </button>

          <button onClick={() => { if (confirm("메시지 및 공지를 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, messages: [], notices: [] })); alert("✅ 메시지/공지 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            💬 메시지/공지 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>발송이력 + 대시보드 공지 삭제</span>
          </button>

          <button onClick={() => { if (confirm("알림 이력을 모두 삭제하시겠습니까?")) { setAlerts([]); alert("✅ 알림 이력 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🔔 알림 이력 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>경보 알림 이력 전체 삭제</span>
          </button>

          <button onClick={() => { if (confirm("조치사항 이력을 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, resolvedHistory: [] })); setCategories(p => p.map(c => ({ ...c, actionStatus: null, actionReport: null }))); alert("✅ 조치사항 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#F44336", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            📋 조치사항 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>지시/조치 이력 + 진행상태 삭제</span>
          </button>

          <div style={{ borderTop: "1px solid #222", paddingTop: 10, marginTop: 4 }}>
            <button onClick={() => { if (confirm("⚠️ 모든 운영 데이터를 초기화하시겠습니까?\n\n인파, 주차장, 메시지, 알림, 조치사항이 모두 리셋됩니다.\n(설정/계정/구역/근무자/기상데이터는 유지)")) { setCategories(p => p.map(c => { if (c.id === "crowd") return { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null }; return { ...c, actionStatus: null, actionReport: null }; })); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })), parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })), messages: [], notices: [], resolvedHistory: [] })); setAlerts([]); if (window.crowdDB) window.crowdDB.set(0, 0, [], "reset"); onDataReset?.(); alert("✅ 전체 운영 데이터 초기화 완료\n(기상 실황/예보 데이터는 유지됩니다)"); }}} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "2px solid #F44336", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ⚠️ 전체 초기화 (운영 데이터 일괄 리셋)
            </button>
          </div>
        </div>
      </Card>
    </div>}
    {/* 대시보드 관리 */}
    {tab === "navmgmt" && <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🔌 기능 ON/OFF</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>사용하지 않는 기능을 끄면 메뉴와 대시보드에서 숨겨집니다.</p>
        {[
          { k: "crowd", icon: "👥", label: "인파관리" },
          { k: "congestion", icon: "🚦", label: "인파혼잡도" },
          { k: "parking", icon: "🅿️", label: "주차관리" },
          { k: "shuttle", icon: "🚌", label: "셔틀버스" },
          { k: "weather", icon: "🌤️", label: "기상청 연동" },
          { k: "sms", icon: "📱", label: "SMS 알림" },
          { k: "message", icon: "💬", label: "메시지/공지" },
          { k: "customApi", icon: "🔌", label: "커스텀 API" },
        ].map(f => {
          const on = settings.features?.[f.k] !== false;
          return (<div key={f.k} onClick={() => setSettings({ ...settings, features: { ...(settings.features || {}), [f.k]: !on } })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: on ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.01)", borderRadius: 10, marginBottom: 5, cursor: "pointer", border: `1px solid ${on ? "rgba(76,175,80,0.12)" : "#1a1a2e"}` }}>
            <div style={{ width: 40, height: 22, borderRadius: 11, background: on ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: on ? 20 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ fontSize: 18 }}>{f.icon}</span>
            <span style={{ color: on ? "#ccd6f6" : "#556", fontSize: 14, fontWeight: 700, flex: 1 }}>{f.label}</span>
            <span style={{ color: on ? "#4CAF50" : "#F44336", fontSize: 13, fontWeight: 700 }}>{on ? "ON" : "OFF"}</span>
          </div>);
        })}
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>🔄 데이터 개별 초기화</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>각 기능의 데이터를 개별적으로 초기화합니다.</p>
        <div style={{ display: "grid", gap: 4 }}>
          {[
            { label: "혼잡도 보고", icon: "🚦", action: () => setSettings(prev => ({ ...prev, zoneCongestion: [] })) },
            { label: "요청 기록", icon: "📨", action: () => setSettings(prev => ({ ...prev, zoneRequests: [] })) },
            { label: "상황일지", icon: "📋", action: () => setSettings(prev => ({ ...prev, timeline: [] })) },
            { label: "의료기록", icon: "🏥", action: () => setSettings(prev => ({ ...prev, medicalRecords: [] })) },
            { label: "체크리스트 체크", icon: "✅", action: () => setSettings(prev => ({ ...prev, checklists: (prev.checklists||[]).map(cl => ({ ...cl, items: cl.items.map(i => ({ ...i, checked: false, checkedBy: "", checkedAt: "" })) })) })) },
            { label: "긴급상황 발령", icon: "🚨", action: () => setSettings(prev => ({ ...prev, emergencyLevel: 0, emergencyMessage: "", emergencyAt: null })) },
            { label: "근무지 상태", icon: "🏠", action: () => setSettings(prev => ({ ...prev, workSites: (prev.workSites||[]).map(s => ({ ...s, status: "standby", congestion: null })) })) },
            { label: "알림 이력", icon: "🔔", action: () => setAlerts([]) },
            { label: "메시지", icon: "💬", action: () => setSettings(prev => ({ ...prev, messages: [], notices: [] })) },
          ].map(r => (
            <button key={r.label} onClick={() => { if (confirm(`${r.label} 데이터를 초기화하시겠습니까?`)) r.action(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid #222", background: "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{r.icon}</span>
              <span style={{ color: "#ccd6f6", fontSize: 14, flex: 1 }}>{r.label}</span>
              <span style={{ color: "#F44336", fontSize: 12, fontWeight: 700 }}>초기화</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📱 하단 메뉴 순서</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>드래그 또는 ▲▼ 버튼으로 순서를 변경하세요.</p>
        {(() => {
          const allItems = [
            { id: "dashboard", icon: "📊", label: "대시보드" },
            { id: "counter", icon: "👥", label: "인파계수", feat: "crowd" },
            { id: "congestion", icon: "🚦", label: "혼잡도", feat: "congestion" },
            { id: "parking", icon: "🅿️", label: "주차관리", feat: "parking" },
            { id: "shuttle", icon: "🚌", label: "셔틀버스", feat: "shuttle" },
            { id: "inbox", icon: "💬", label: "수신함", feat: "message" },
            { id: "message", icon: "📢", label: "발송", feat: "message" },
            { id: "status", icon: "🎪", label: "축제관리" },
    { id: "program", icon: "🎭", label: "프로그램" },
            { id: "program", icon: "🎭", label: "프로그램" },
            { id: "cms", icon: "⚙️", label: "관리" },
          ];
          const order = settings.navOrder || allItems.map(i => i.id);
          const sorted = [...allItems].sort((a, b) => {
            const ai = order.indexOf(a.id); const bi = order.indexOf(b.id);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          });
          const moveNav = (id, dir) => {
            let cur = [...(settings.navOrder || allItems.map(i => i.id))];
            allItems.forEach(it => { if (!cur.includes(it.id)) cur.push(it.id); });
            const idx = cur.indexOf(id);
            const ni = idx + dir;
            if (ni < 0 || ni >= cur.length) return;
            [cur[idx], cur[ni]] = [cur[ni], cur[idx]];
            setSettings({ ...settings, navOrder: cur });
          };
          return (<div style={{ display: "grid", gap: 4 }}>
            {sorted.map((item) => {
              const enabled = !item.feat || settings.features?.[item.feat] !== false;
              return (<div key={item.id} draggable
                onDragStart={e => e.dataTransfer.setData("navId", item.id)}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
                onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = "none"; const dragId = e.dataTransfer.getData("navId"); if (dragId && dragId !== item.id) { let cur = [...(settings.navOrder || allItems.map(i => i.id))]; allItems.forEach(it => { if (!cur.includes(it.id)) cur.push(it.id); }); const di = cur.indexOf(dragId); const ti = cur.indexOf(item.id); if (di >= 0 && ti >= 0) { const [moved] = cur.splice(di, 1); cur.splice(ti, 0, moved); setSettings({ ...settings, navOrder: cur }); } } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px", background: enabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", borderRadius: 10, border: "1px solid #222", opacity: enabled ? 1 : 0.4, cursor: "grab" }}>
                <span style={{ fontSize: 14, color: "#556" }}>⠿</span>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ color: "#ccd6f6", fontSize: 16, fontWeight: 700, flex: 1 }}>{item.label}</span>
                {!enabled && <span style={{ color: "#F44336", fontSize: 12 }}>OFF</span>}
                <button onClick={(e) => { e.stopPropagation(); moveNav(item.id, -1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 16, cursor: "pointer" }}>▲</button>
                <button onClick={(e) => { e.stopPropagation(); moveNav(item.id, 1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 16, cursor: "pointer" }}>▼</button>
              </div>);
            })}
          </div>);
        })()}
      </Card>

      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 4px" }}>📊 대시보드 표시 항목</h3>
        <p style={{ color: "#556", fontSize: 13, margin: "0 0 14px" }}>대시보드에 표시할 모니터링 항목을 선택합니다.</p>
        {categories.map(cat => {
          const vis = settings.dashboardVisible?.[cat.id] !== false;
          return <div key={cat.id} onClick={() => setSettings({ ...settings, dashboardVisible: { ...(settings.dashboardVisible || {}), [cat.id]: !vis } })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: vis ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.01)", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: `1px solid ${vis ? "rgba(76,175,80,0.12)" : "#1a1a2e"}` }}>
            <div style={{ width: 36, height: 20, borderRadius: 10, background: vis ? "#4CAF50" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: vis ? 18 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ color: vis ? "#ccd6f6" : "#556", fontSize: 14, fontWeight: 600 }}>{cat.name}</span>
            <span style={{ color: "#445", fontSize: 12, marginLeft: "auto" }}>{cat.unit}</span>
          </div>;
        })}
      </Card>
    </div>}

    {tab === "alerts" && <div>{alerts.length === 0 && <p style={{ color: "#445", textAlign: "center", padding: 20 }}>이력 없음</p>}{alerts.map((a, i) => { const li = LEVELS[a.level]; return (<div key={i} style={{ background: li.bg, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${li.border}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: li.color, fontWeight: 700, fontSize: 14 }}>{li.icon}{a.category}</span><span style={{ color: "#445", fontSize: 14 }}>{a.time}</span></div><pre style={{ color: "#bbb", fontSize: 13, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>{a.message}</pre></div>); })}{alerts.length > 0 && <button onClick={() => setAlerts([])} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>전체 삭제</button>}</div>}

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

// ─── Air Quality Fetcher (에어코리아) ────────────────────────────
function useAirQualityFetcher(categories, setCategories, settings, setSettings, active, refreshKey) {
  const timer = useRef(null);
  const aq = settings.airQuality || {};
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!active || !aq.enabled || !aq.serviceKey) return;

    const doFetch = async () => {
      try {
        const sido = aq.sidoName || "경남";
        const filter = aq.stationFilter || "";
        const url = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodeURIComponent(aq.serviceKey)}&returnType=json&numOfRows=100&pageNo=1&sidoName=${encodeURIComponent(sido)}&ver=1.0`;
        const res = await fetch(url);
        const json = await res.json();
        const rawItems = json?.response?.body?.items;
        const allItems = Array.isArray(rawItems) ? rawItems : rawItems?.item || [];
        const item = filter ? allItems.find(i => i.stationName?.includes(filter)) || allItems[0] : allItems[0];
        if (item) {
          const pm10 = parseFloat(item.pm10Value) || 0;
          const pm25 = parseFloat(item.pm25Value) || 0;
          const time = new Date().toLocaleTimeString("ko-KR");
          setCategories(p => p.map(c => {
            if (c.id === "pm10") return { ...c, currentValue: pm10, lastUpdated: time, dataType: "실황" };
            if (c.id === "pm25") return { ...c, currentValue: pm25, lastUpdated: time, dataType: "실황" };
            return c;
          }));
          setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, lastFetch: new Date().toLocaleString("ko-KR") } }));
        }
      } catch (e) { console.warn("에어코리아 API 오류:", e); }
    };
    doFetch();
    timer.current = setInterval(doFetch, (aq.interval || 30) * 60000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active, aq.enabled, aq.serviceKey, aq.sidoName, aq.stationFilter, aq.interval, refreshKey]);
}

// ─── Dam Discharge Fetcher (K-water 다목적댐) ───────────────────
function useDamFetcher(categories, setCategories, settings, setSettings, active, refreshKey) {
  const timer = useRef(null);
  const dam = settings.dam || {};
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!active || !dam.enabled || !dam.serviceKey) return;

    const doFetch = async () => {
      try {
        const now = new Date();
        const vdate = now.toISOString().slice(0, 10);
        const tdate = new Date(now - 86400000).toISOString().slice(0, 10);
        const ldate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
        const vtime = String(now.getHours()).padStart(2, "0");
        const url = `https://apis.data.go.kr/B500001/dam/multipurPoseDam/multipurPoseDamlist?serviceKey=${encodeURIComponent(dam.serviceKey)}&pageNo=1&numOfRows=30&_type=json&vdate=${vdate}&tdate=${tdate}&ldate=${ldate}&vtime=${vtime}`;
        const res = await fetch(url);
        const json = await res.json();
        const items = json?.response?.body?.items?.item || [];
        const allItems = Array.isArray(items) ? items : [items];
        const filter = dam.damName || "";
        const target = filter ? allItems.find(i => (i.damnm || i.damNm || "").includes(filter)) : allItems[0];
        if (target) {
          const discharge = parseFloat(target.inflowqy) || 0;
          setCategories(p => p.map(c => c.id === "dam" ? { ...c, currentValue: discharge, lastUpdated: new Date().toLocaleTimeString("ko-KR"), dataType: "실황" } : c));
          setSettings(prev => ({ ...prev, dam: { ...prev.dam, lastFetch: new Date().toLocaleString("ko-KR"), lastData: target } }));
        }
      } catch (e) { console.warn("댐 API 오류:", e); }
    };
    doFetch();
    timer.current = setInterval(doFetch, (dam.interval || 30) * 60000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active, dam.enabled, dam.serviceKey, dam.damName, dam.interval, refreshKey]);
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
  useEffect(() => { lastRecord.current = 0; }, [refreshKey]);
  useEffect(() => {
    if (!active) return;
    const record = () => {
      const now = Date.now();
      if (now - lastRecord.current < 29 * 60000) return;
      lastRecord.current = now;
      // ★ crowd는 _crowd에서 실제값 읽기 (categories에 있는 값은 stale할 수 있음)
      let crowdVal = 0;
      try { crowdVal = JSON.parse(localStorage.getItem("_crowd") || "{}").total || 0; } catch {}
      setCategories(p => p.map(c => ({
        ...c,
        history: [...(c.history || []).slice(-48), { time: fmtHM(new Date()), value: c.id === "crowd" ? crowdVal : c.currentValue }]
      })));
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
  { id: "sysadmin", password: simpleHash("sysadmin"), name: "시스템관리자", role: "sysadmin", festivals: ["all"] },
  { id: "admin", password: simpleHash("admin1234"), name: "관리자", role: "admin", festivalId: "default", festivals: ["default"] },
  { id: "counter1", password: simpleHash("1234"), name: "계수원1", role: "counter", festivalId: "default", festivals: ["default"] },
  { id: "viewer", password: simpleHash("view"), name: "상황실", role: "viewer", festivalId: "default", festivals: ["default"] },
  { id: "parking1", password: simpleHash("1234"), name: "주차요원1", role: "parking", festivalId: "default", festivals: ["default"], parkingLotId: "" },
  { id: "shuttle1", password: simpleHash("1234"), name: "셔틀요원1", role: "shuttle", festivalId: "default", festivals: ["default"] },
];

const DEFAULT_FESTIVALS = [
  { id: "default", name: "기본 축제", subtitle: "안전관리시스템", createdAt: new Date().toISOString() },
];

const ROLES = {
  sysadmin: { label: "시스템관리자", color: "#E91E63", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "message", "inbox", "status", "program", "cms"], desc: "축제 생성/관리 + 모든 기능" },
  admin: { label: "관리자", color: "#F44336", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "message", "inbox", "status", "program", "cms"], desc: "모든 기능 접근" },
  manager: { label: "운영자", color: "#FF9800", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "message", "inbox", "status", "program", "cms"], desc: "설정 변경 가능 (계정관리 제외)" },
  zonemgr: { label: "구역관리자", color: "#009688", pages: ["dashboard", "congestion", "status", "program", "inbox"], desc: "담당 구역 혼잡도/근무자/상태 관리" },
  counter: { label: "계수원", color: "#4CAF50", pages: ["counter", "congestion", "dashboard", "inbox", "status", "program"], desc: "인파 계수 + 대시보드 조회" },
  parking: { label: "주차요원", color: "#9C27B0", pages: ["parking", "dashboard", "inbox", "status", "program", "program"], desc: "주차장 관리 + 대시보드 조회" },
  shuttle: { label: "셔틀요원", color: "#00BCD4", pages: ["shuttle", "dashboard", "inbox", "status", "program", "program"], desc: "셔틀버스 위치 관리" },
  viewer: { label: "뷰어", color: "#2196F3", pages: ["dashboard", "inbox", "status", "program"], desc: "대시보드 조회만 가능" },
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
            <label style={{ color: "#8892b0", fontSize: 14, display: "block", marginBottom: 6 }}>아이디</label>
            <input value={uid} onChange={e => { setUid(e.target.value); setError(""); }} placeholder="아이디 입력"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 16, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: "#8892b0", fontSize: 14, display: "block", marginBottom: 6 }}>비밀번호</label>
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
          <p style={{ color: "#334", fontSize: 13, lineHeight: 1.8 }}>
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
    setAccounts([...accounts, { id: newAcc.id, password: simpleHash(newAcc.pw), name: newAcc.name, role: newAcc.role, festivalId: currentUser.festivalId, festivals: [currentUser.festivalId] }]);
    setNewAcc({ id: "", pw: "", name: "", role: "counter" });
  };

  const ROLE_RANK = { sysadmin: 100, admin: 80, manager: 60, zonemgr: 50, counter: 40, parking: 40, shuttle: 40, viewer: 20 };
  const myRank = ROLE_RANK[currentUser.role] || 0;
  const canManage = (acc) => {
    if (acc.id === currentUser.id) return false; // 자기 자신 수정 불가
    const targetRank = ROLE_RANK[acc.role] || 0;
    return myRank > targetRank; // 자기보다 낮은 등급만 관리 가능
  };

  const deleteAcc = (id) => {
    const target = accounts.find(a => a.id === id);
    if (!target || !canManage(target)) { alert("상위 또는 동급 관리자 계정은 수정할 수 없습니다."); return; }
    if (confirm(`"${id}" 계정을 삭제하시겠습니까?`)) setAccounts(accounts.filter(a => a.id !== id));
  };

  const changePw = (id) => {
    const target = accounts.find(a => a.id === id);
    // 자기 자신 비밀번호는 변경 가능
    if (id !== currentUser.id && (!target || !canManage(target))) { alert("상위 또는 동급 관리자 계정의 비밀번호는 변경할 수 없습니다."); return; }
    const np = editPw[id];
    if (!np || np.length < 4) { alert("비밀번호는 4자 이상이어야 합니다."); return; }
    setAccounts(accounts.map(a => a.id === id ? { ...a, password: simpleHash(np) } : a));
    setEditPw({ ...editPw, [id]: "" });
    alert("비밀번호가 변경되었습니다.");
  };

  const changeRole = (id, role) => {
    const target = accounts.find(a => a.id === id);
    if (!target || !canManage(target)) return;
    const newRank = ROLE_RANK[role] || 0;
    if (newRank >= myRank) { alert("자신보다 높거나 같은 등급으로 변경할 수 없습니다."); return; }
    setAccounts(accounts.map(a => a.id === id ? { ...a, role } : a));
  };

  return (
    <div>
      <Card>
        <h3 style={{ color: "#ccd6f6", fontSize: 16, margin: "0 0 14px" }}>👤 계정 목록</h3>
        {accounts.map(acc => {
          const rl = ROLES[acc.role] || ROLES.viewer;
          const editable = canManage(acc);
          const isSelf = acc.id === currentUser.id;
          return (
            <div key={acc.id} style={{ padding: "12px 14px", background: editable ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", borderRadius: 10, marginBottom: 8, border: isSelf ? "1px solid rgba(33,150,243,0.3)" : "1px solid transparent", opacity: editable || isSelf ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#ccd6f6", fontWeight: 700, fontSize: 14 }}>{acc.name}</span>
                  <span style={{ color: "#556", fontSize: 14 }}>({acc.id})</span>
                  <span style={{ padding: "2px 8px", borderRadius: 10, background: `${rl.color}22`, border: `1px solid ${rl.color}44`, color: rl.color, fontSize: 14, fontWeight: 700 }}>{rl.label}</span>
                  {isSelf && <span style={{ color: "#2196F3", fontSize: 14 }}>← 현재</span>}
                </div>
                {editable && <button onClick={() => deleteAcc(acc.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#F44336", fontSize: 14, cursor: "pointer" }}>삭제</button>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {editable && (
                  <select value={acc.role} onChange={e => changeRole(acc.id, e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }}>
                    {Object.entries(ROLES).filter(([k]) => (ROLE_RANK[k] || 0) < myRank).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                )}
                {(editable || isSelf) && <>
                  <input type="password" placeholder="새 비밀번호" value={editPw[acc.id] || ""} onChange={e => setEditPw({ ...editPw, [acc.id]: e.target.value })}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14, width: 120 }} />
                  <button onClick={() => changePw(acc.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#FF9800", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>변경</button>
                </>}
                {!editable && !isSelf && <span style={{ color: "#556", fontSize: 12 }}>🔒 상위 관리자</span>}
              </div>
            </div>
          );
        })}
      </Card>
      {(currentUser.role === "admin" || currentUser.role === "sysadmin") && <Card>
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
                {Object.entries(ROLES).filter(([k]) => (ROLE_RANK[k] || 0) < myRank).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addAccount} style={{ padding: "12px", borderRadius: 10, border: "none", background: "#2196F3", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>계정 생성</button>
        </div>
      </Card>}
      <Card style={{ background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.15)" }}>
        <p style={{ color: "#FFC107", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
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
        <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 16px" }}>{String(fatalError)}</p>
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
        <p style={{ color: "#888", fontSize: 13 }}>{String(e)}</p>
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 10, border: "none", background: "#F44336", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 초기화</button>
      </div>
    </div>);
  }
}

function AppMain({ onError }) {
  const [accounts, setAccounts] = usePersist("fest_accounts_v2", DEFAULT_ACCOUNTS);
  const [festivals, setFestivals] = usePersist("fest_festivals_v1", DEFAULT_FESTIVALS);
  const [session, setSession] = useState(null);
  const [selectedFestival, setSelectedFestival] = useState(null);
  const [page, setPage] = useState("dashboard");

  // Restore session
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("fest_session_v2");
      if (s) {
        const parsed = JSON.parse(s);
        const acc = accounts.find(a => a.id === parsed.id);
        if (acc) {
          setSession(acc);
          if (parsed.festivalId) {
            const fest = festivals.find(f => f.id === parsed.festivalId);
            if (fest) setSelectedFestival(fest);
          }
        }
      }
    } catch {}
  }, []);

  const handleLogin = (acc) => {
    setSession(acc);
    // 축제 1개만 배정된 경우 자동 선택
    const myFests = acc.festivals?.includes("all") ? festivals : festivals.filter(f => (acc.festivals || [acc.festivalId || "default"]).includes(f.id));
    if (myFests.length === 1) {
      setSelectedFestival(myFests[0]);
      sessionStorage.setItem("fest_session_v2", JSON.stringify({ id: acc.id, festivalId: myFests[0].id }));
      setPage(acc.role === "counter" ? "counter" : acc.role === "parking" ? "parking" : acc.role === "shuttle" ? "shuttle" : "dashboard");
    } else {
      sessionStorage.setItem("fest_session_v2", JSON.stringify({ id: acc.id }));
    }
  };

  const handleSelectFestival = (fest) => {
    setSelectedFestival(fest);
    sessionStorage.setItem("fest_session_v2", JSON.stringify({ id: session.id, festivalId: fest.id }));
    setPage(session.role === "counter" ? "counter" : session.role === "parking" ? "parking" : session.role === "shuttle" ? "shuttle" : "dashboard");
  };

  const handleLogout = () => {
    setSession(null);
    setSelectedFestival(null);
    sessionStorage.removeItem("fest_session_v2");
  };

  const handleBackToFestivalSelect = () => {
    setSelectedFestival(null);
    sessionStorage.setItem("fest_session_v2", JSON.stringify({ id: session.id }));
  };

  if (!session) return <LoginPage onLogin={handleLogin} accounts={accounts} />;

  // 축제 선택 안 된 상태
  if (!selectedFestival) {
    const isSysAdmin = session.role === "sysadmin";
    const myFests = isSysAdmin ? festivals : festivals.filter(f => (session.festivals || [session.festivalId || "default"]).includes(f.id));

    return (<div style={{ minHeight: "100vh", background: "#0a0a1a", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", fontFamily: "'Noto Sans KR',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
      <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>🎪 축제 선택</h1>
      <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 24px" }}>{session.name}님, 관리할 축제를 선택하세요</p>

      <div style={{ width: "100%", maxWidth: 500, display: "grid", gap: 12 }}>
        {myFests.map(f => (
          <div key={f.id} onClick={() => handleSelectFestival(f)} style={{ padding: "20px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid #222", cursor: "pointer", transition: "all .2s" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#ccd6f6", marginBottom: 4 }}>🏮 {f.name}</div>
            {f.subtitle && <div style={{ color: "#556", fontSize: 13 }}>{f.subtitle}</div>}
            {f.dates && <div style={{ color: "#445", fontSize: 12, marginTop: 4 }}>📅 {f.dates}</div>}
          </div>
        ))}
      </div>

      {/* 시스템 관리자: 축제 생성 */}
      {isSysAdmin && <FestivalManager festivals={festivals} setFestivals={setFestivals} accounts={accounts} setAccounts={setAccounts} />}

      <button onClick={handleLogout} style={{ marginTop: 24, padding: "10px 24px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#556", fontSize: 14, cursor: "pointer" }}>로그아웃</button>
    </div>);
  }

  return <AuthenticatedApp session={{ ...session, festivalId: selectedFestival.id }} accounts={accounts} setAccounts={setAccounts} festivals={festivals} onLogout={handleLogout} onBackToFestivalSelect={handleBackToFestivalSelect} initialPage={page} setPage={setPage} />;
}

// ─── Festival Manager (시스템관리자 전용) ────────────────────────
function FestivalManager({ festivals, setFestivals, accounts, setAccounts }) {
  const [newFest, setNewFest] = useState({ name: "", subtitle: "", dates: "" });
  const [showAccounts, setShowAccounts] = useState(false);

  const addFestival = () => {
    if (!newFest.name) { alert("축제명을 입력하세요."); return; }
    const id = "fest_" + Date.now();
    setFestivals(p => [...p, { id, ...newFest, createdAt: new Date().toISOString() }]);
    setNewFest({ name: "", subtitle: "", dates: "" });
    alert("✅ 축제가 생성되었습니다. 계정에 배정해주세요.");
  };

  const deleteFestival = (id) => {
    if (id === "default") { alert("기본 축제는 삭제할 수 없습니다."); return; }
    if (!confirm("축제를 삭제하시겠습니까?")) return;
    setFestivals(p => p.filter(f => f.id !== id));
  };

  return (<div style={{ width: "100%", maxWidth: 500, marginTop: 24 }}>
    <div style={{ padding: 20, borderRadius: 16, background: "rgba(233,30,99,0.06)", border: "1px solid rgba(233,30,99,0.15)" }}>
      <h3 style={{ color: "#E91E63", fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>🎪 축제 관리 (시스템관리자)</h3>

      {/* 축제 생성 */}
      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        <input value={newFest.name} onChange={e => setNewFest(p => ({ ...p, name: e.target.value }))} placeholder="축제명 *" style={{ padding: "12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={newFest.subtitle} onChange={e => setNewFest(p => ({ ...p, subtitle: e.target.value }))} placeholder="부제목" style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }} />
          <input value={newFest.dates} onChange={e => setNewFest(p => ({ ...p, dates: e.target.value }))} placeholder="기간 (예: 4/15~4/20)" style={{ padding: "10px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontSize: 13 }} />
        </div>
        <button onClick={addFestival} style={{ padding: "12px", borderRadius: 8, border: "none", background: "#E91E63", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🎪 축제 생성</button>
      </div>

      {/* 축제 목록 */}
      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        {festivals.map(f => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, gap: 10 }}>
            <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700, flex: 1 }}>🏮 {f.name}</span>
            <span style={{ color: "#445", fontSize: 12 }}>{f.dates || ""}</span>
            {f.id !== "default" && <button onClick={() => deleteFestival(f.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#F44336", fontSize: 12, cursor: "pointer" }}>🗑</button>}
          </div>
        ))}
      </div>

      {/* 계정 관리 */}
      <button onClick={() => setShowAccounts(!showAccounts)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>{showAccounts ? "▲ 계정 관리 닫기" : "👤 계정 축제 배정 관리"}</button>
      {showAccounts && <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {accounts.filter(a => a.role !== "sysadmin").map(acc => (
          <div key={acc.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: ROLES[acc.role]?.color || "#888", fontSize: 12, fontWeight: 700 }}>{ROLES[acc.role]?.label}</span>
              <span style={{ color: "#ccd6f6", fontSize: 14, fontWeight: 700 }}>{acc.name}</span>
              <span style={{ color: "#445", fontSize: 12 }}>({acc.id})</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {festivals.map(f => {
                const assigned = (acc.festivals || [acc.festivalId]).includes(f.id);
                return <button key={f.id} onClick={() => {
                  const curFests = acc.festivals || [acc.festivalId || "default"];
                  const newFests = assigned ? curFests.filter(x => x !== f.id) : [...curFests, f.id];
                  if (newFests.length === 0) { alert("최소 1개 축제에 배정해야 합니다."); return; }
                  setAccounts(p => p.map(a => a.id === acc.id ? { ...a, festivals: newFests, festivalId: newFests[0] } : a));
                }} style={{ padding: "4px 10px", borderRadius: 6, border: assigned ? "1px solid #4CAF50" : "1px solid #333", background: assigned ? "rgba(76,175,80,0.1)" : "transparent", color: assigned ? "#4CAF50" : "#556", fontSize: 12, cursor: "pointer" }}>{assigned ? "✅" : "⬜"} {f.name}</button>;
              })}
            </div>
          </div>
        ))}
      </div>}
    </div>
  </div>);
}

function AuthenticatedApp({ session, accounts, setAccounts, festivals, onLogout, onBackToFestivalSelect, initialPage, setPage: setPageExt }) {
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
  useAirQualityFetcher(categories, setCategories, settings, setSettings, active, refreshKey);
  useDamFetcher(categories, setCategories, settings, setSettings, active, refreshKey);
  useCustomApiFetcher(categories, setCategories, settings, active, refreshKey);
  useHistoryRecorder(categories, setCategories, active, refreshKey);

  // ★ 인파관리 — Supabase 주기적 확인 + Realtime
  useEffect(() => {
    const syncCrowd = () => {
      if (window.crowdDB) window.crowdDB.get().then(d => {
        if (d && d.total !== undefined) {
          setCategories(p => {
            const cur = p.find(c => c.id === "crowd");
            if (!cur || cur.currentValue === d.total) return p;
            return p.map(c => c.id === "crowd" ? { ...c, currentValue: d.total } : c);
          });
          localStorage.setItem("_crowd", JSON.stringify(d));
        }
      }).catch(() => {});
    };
    syncCrowd();
    const poll = setInterval(syncCrowd, 10000);

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
  const navOrderRaw = settings.navOrder || ["dashboard", "counter", "congestion", "parking", "shuttle", "inbox", "message", "status", "program", "cms"]; const navOrder = [...navOrderRaw]; ["dashboard","counter","congestion","parking","shuttle","inbox","message","status","cms"].forEach(id => { if (!navOrder.includes(id)) navOrder.push(id); });
  const allNavs = [
    { id: "dashboard", icon: "📊", label: "대시보드" },
    ft.crowd !== false && { id: "counter", icon: "👥", label: "인파계수" },
    ft.congestion !== false && { id: "congestion", icon: "🚦", label: "혼잡도" },
    { id: "status", icon: "🎪", label: "축제관리" },
    { id: "program", icon: "🎭", label: "프로그램" },
    ft.parking !== false && { id: "parking", icon: "🅿️", label: "주차관리" },
    ft.shuttle !== false && { id: "shuttle", icon: "🚌", label: "셔틀버스" },
    ft.message !== false && { id: "inbox", icon: "💬", label: unreadCount > 0 ? `수신함(${unreadCount})` : "수신함" },
    ft.message !== false && { id: "message", icon: "📢", label: "발송" },
    { id: "cms", icon: "⚙️", label: "관리" },
  ].filter(Boolean);
  const navs = allNavs
    .filter(n => allowedPages.includes(n.id))
    .sort((a, b) => { const ai = navOrder.indexOf(a.id); const bi = navOrder.indexOf(b.id); return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi); });

  // Inject account tab into CMS if admin
  const cmsExtraTabs = (session.role === "admin" || session.role === "manager")
    ? [{ id: "accounts", label: "👤 계정관리" }] : [];

  return (<div style={{ fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
    <style>{`@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    <AlertToast alert={activeAlert} onClose={() => setActiveAlert(null)} />

    {/* Top bar - user info */}
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1001, background: "rgba(10,10,26,0.95)", borderBottom: "1px solid #1a1a2e", padding: "6px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(10px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ padding: "2px 8px", borderRadius: 10, background: `${role.color}22`, border: `1px solid ${role.color}44`, color: role.color, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{role.label}</span>
        <span style={{ color: "#8892b0", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {(session.festivals?.length > 1 || session.role === "sysadmin") && onBackToFestivalSelect && <button onClick={onBackToFestivalSelect} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#FF9800", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>🎪 축제변경</button>}
        <button onClick={onLogout} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#556", fontSize: 13, cursor: "pointer" }}>로그아웃</button>
      </div>
    </div>

    {/* Bottom nav */}
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000, background: "rgba(10,10,26,0.95)", borderTop: "1px solid #222", display: "flex", justifyContent: "center", backdropFilter: "blur(10px)" }}>
      {navs.map(n => <button key={n.id} onClick={() => { setPage(n.id); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ flex: 1, maxWidth: 130, padding: "12px 0 10px", border: "none", background: "none", color: page === n.id ? "#2196F3" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
        <span style={{ fontSize: 20 }}>{n.icon}</span><span style={{ fontSize: 14, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span>
        {n.id === "inbox" && unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: "calc(50% - 18px)", width: 16, height: 16, borderRadius: 8, background: "#F44336", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
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
      {page === "congestion" && <CongestionPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "program" && <ProgramPage settings={settings} />}
      {page === "status" && <FestivalStatusPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "cms" && cmsTab === "accounts" ? (
        <div style={{ minHeight: "100vh", background: "#0d1117", padding: "20px 16px" }}>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 14px" }}>👤 계정 관리</h2>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <button onClick={() => setCmsTab(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #333", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>← CMS로 돌아가기</button>
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
