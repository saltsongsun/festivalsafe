import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  BLUE: { label: "정상", color: "#42A5F5", bg: "rgba(66,165,245,0.18)", border: "rgba(66,165,245,0.45)", icon: "✅" },
  YELLOW: { label: "주의", color: "#FFD54F", bg: "rgba(255,213,79,0.18)", border: "rgba(255,213,79,0.45)", icon: "⚡" },
  ORANGE: { label: "경계", color: "#FFB74D", bg: "rgba(255,183,77,0.2)", border: "rgba(255,183,77,0.5)", icon: "⚠️" },
  RED: { label: "경보", color: "#FF5252", bg: "rgba(255,82,82,0.2)", border: "rgba(255,82,82,0.5)", icon: "🚨" },
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
    alertMessages: { BLUE: "기온 적정", YELLOW: "고온/저온 경고", ORANGE: "⚠️ 폭염/한파 경계!", RED: "🚨 폭염/한파 경보! 행사 중단 검토" },
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
  incidents: [],
  emergencyContacts: [],  // 비상연락망: { id, group, name, role, phone, priority, note }
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
    { id: "cl_plan", title: "축제 계획 단계", category: "plan", items: [
      { id: "p1", text: "안전관리계획 수립 및 심의 완료", checked: false, enabled: true },
      { id: "p2", text: "행사장 위치 위험요인 검토", checked: false, enabled: true },
      { id: "p3", text: "비상 대피경로 및 대피장소 확보", checked: false, enabled: true },
      { id: "p4", text: "안전관리 조직 구성 (총괄/부문별)", checked: false, enabled: true },
      { id: "p5", text: "유관기관 비상연락체계 구축", checked: false, enabled: true },
      { id: "p6", text: "안전관리비 확보 (전체비용 1% 이상)", checked: false, enabled: true },
      { id: "p7", text: "보험가입 (참가자/관람객/진행자)", checked: false, enabled: true },
      { id: "p8", text: "안전관리인력 배치계획 수립", checked: false, enabled: true },
      { id: "p9", text: "의료지원 계획 수립", checked: false, enabled: true },
      { id: "p10", text: "교통 및 주차 대책 수립", checked: false, enabled: true },
    ]},
    { id: "cl_pre", title: "축제 시작 전 (개장 전)", category: "pre", items: [
      { id: "b1", text: "무대/구조물 안전점검 완료", checked: false, enabled: true },
      { id: "b2", text: "전기시설 안전점검 (누전차단기 등)", checked: false, enabled: true },
      { id: "b3", text: "가스시설 안전점검", checked: false, enabled: true },
      { id: "b4", text: "소화기/소방시설 비치 확인", checked: false, enabled: true },
      { id: "b5", text: "비상방송 시스템 테스트", checked: false, enabled: true },
      { id: "b6", text: "대피경로 안내판 설치 확인", checked: false, enabled: true },
      { id: "b7", text: "안전요원 배치 확인", checked: false, enabled: true },
      { id: "b8", text: "의료진/구급장비 배치 확인", checked: false, enabled: true },
      { id: "b9", text: "출입구 통제 시설 확인", checked: false, enabled: true },
      { id: "b10", text: "CCTV/통신장비 작동 확인", checked: false, enabled: true },
      { id: "b11", text: "기상상황 확인 (폭우/강풍/폭염)", checked: false, enabled: true },
      { id: "b12", text: "화장실/편의시설 점검", checked: false, enabled: true },
      { id: "b13", text: "비상차량 진입로 확보", checked: false, enabled: true },
      { id: "b14", text: "안전관리요원 무전기/확성기 지급", checked: false, enabled: true },
    ]},
    { id: "cl_dur", title: "축제 진행 중", category: "during", items: [
      { id: "d1", text: "출입구 통제 인력 배치 확인", checked: false, enabled: true },
      { id: "d2", text: "관람객 밀집도 수시 확인", checked: false, enabled: true },
      { id: "d3", text: "안전관리요원 순찰 실시", checked: false, enabled: true },
      { id: "d4", text: "기상변화 모니터링", checked: false, enabled: true },
      { id: "d5", text: "음향/조명 장비 상태 확인", checked: false, enabled: true },
      { id: "d6", text: "비상대피 안내방송 준비", checked: false, enabled: true },
      { id: "d7", text: "화기취급 구역 안전관리", checked: false, enabled: true },
      { id: "d8", text: "응급환자 발생 대비 의료진 대기", checked: false, enabled: true },
      { id: "d9", text: "쓰레기 수거/위생 상태", checked: false, enabled: true },
      { id: "d10", text: "주차장/교통 상황 점검", checked: false, enabled: true },
    ]},
    { id: "cl_post", title: "축제 종료 시", category: "post", items: [
      { id: "e1", text: "관람객 안전 퇴장 유도 완료", checked: false, enabled: true },
      { id: "e2", text: "전기/가스 차단 확인", checked: false, enabled: true },
      { id: "e3", text: "시설물 파손 여부 점검", checked: false, enabled: true },
      { id: "e4", text: "분실물 수거", checked: false, enabled: true },
      { id: "e5", text: "안전관리 문제점 분석 기록", checked: false, enabled: true },
      { id: "e6", text: "주차장 차량 소통 안전 관리", checked: false, enabled: true },
    ]},
    { id: "cl_emer", title: "사고 발생 시 대응", category: "emergency", items: [
      { id: "em1", text: "119/112 신고", checked: false, enabled: true },
      { id: "em2", text: "관람객 대피 유도", checked: false, enabled: true },
      { id: "em3", text: "사고현장 통제", checked: false, enabled: true },
      { id: "em4", text: "응급처치 실시", checked: false, enabled: true },
      { id: "em5", text: "상급기관 보고", checked: false, enabled: true },
      { id: "em6", text: "사고 수습 및 복구", checked: false, enabled: true },
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
  performances: [],
  navOrder: ["dashboard", "counter", "congestion", "parking", "shuttle", "chat", "status", "program", "stage", "cms"],
  features: {
    crowd: true,
    parking: true,
    shuttle: true,
    weather: true,
    sms: true,
    message: true,
    customApi: true,
    congestion: true,  // 인파혼잡도
    stage: true,       // 공연관리
    heatmap: true,     // 2.0: 히트맵 지도
    location: true,    // 2.0: 위치 워키토키
    assets: true,      // 2.0: 장비/물품 관리
    workdiary: true,   // 2.1: 근무일지/교대관리
    shifts: true,      // 2.1: 근무일지 (alias)
    workers: true,     // 2.1: 근무자 통합 관리
    search: true,      // 2.0: 통합 검색
    smartAlert: true,  // 2.0: 스마트 알림
    report: true,      // 2.1: 보고서 자동생성
    reports: true,     // 2.1: 보고서 (alias)
    qrcode: true,      // 2.0: QR코드 관리
  },
  // 2.0 신규 데이터
  mapImage: null,
  mapZones: [],
  mapAreas: [],
  workerLocations: {},
  assets: [],
  assetCategories: ["무전기", "생수", "리플렛", "멀티탭", "응급키트", "조끼", "안전모", "안전장비", "의자", "테이블", "조명", "음향", "기타"],
  workDiaries: [],          // [{id, workerId, workerName, date, shift, startTs, endTs, content, status}]
  shifts: [],               // [{id, name, startTime, endTime, color}]
  // 실시간 협업
  presence: {},             // {userId: {name, page, ts, color}}
  liveCursors: {},          // 실시간 커서 위치
  notifyRules: {            // 스마트 알림 규칙
    cooldownMin: 10,
    autoResolve: true,
    silentHours: { enabled: false, start: "23:00", end: "07:00" },
    quietMode: false,
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
    if (v <= 10) return "YELLOW";      // 0~10 → 저온경고
    if (v >= 38) return "RED";         // 38+ → 경보 (폭염)
    if (v >= 35) return "ORANGE";      // 35~38 → 경계
    if (v >= 30) return "YELLOW";      // 30~35 → 고온경고
    return "BLUE";                     // 10~30 → 정상
  }
  for (const [lv, [min, max]] of Object.entries(cat.thresholds)) { if (v >= min && v < max) return lv; }
  return "RED";
}
function getTempLabel(cat) {
  if (cat.id !== "temp" && !cat.isTempDual) return null;
  const v = cat.currentValue;
  if (v <= 0) return "🥶 한파경보";
  if (v <= 10) return "❄️ 저온경고";
  if (v >= 35) return "🔥 폭염경보";
  if (v >= 30) return "☀️ 고온경고";
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

// 단기예보 base_time: 02,05,08,11,14,17,20,23시 발표 (해당 시각 10분 이후 호출 가능)
function getShortFcstParams(settings) {
  const loc = settings.location || {};
  const kma = settings.kma || {};
  const grid = latLonToGrid(loc.lat || 35.18, loc.lon || 128.11);
  const nx = kma.nxOverride || grid.nx;
  const ny = kma.nyOverride || grid.ny;
  const now = new Date();
  const baseTimes = [2, 5, 8, 11, 14, 17, 20, 23];
  let h = now.getHours();
  let m = now.getMinutes();
  // 가장 최근 발표시각 찾기 (10분 이후 발표 완료)
  let baseHour = null;
  for (let i = baseTimes.length - 1; i >= 0; i--) {
    const bt = baseTimes[i];
    if (h > bt || (h === bt && m >= 10)) { baseHour = bt; break; }
  }
  let dateObj = new Date(now);
  if (baseHour === null) {
    // 오늘 02시 이전 → 어제 23시
    baseHour = 23;
    dateObj.setDate(dateObj.getDate() - 1);
  }
  const bd = `${dateObj.getFullYear()}${String(dateObj.getMonth() + 1).padStart(2, '0')}${String(dateObj.getDate()).padStart(2, '0')}`;
  const bt = `${String(baseHour).padStart(2, '0')}00`;
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
      if (Array.isArray(init) && !Array.isArray(parsed)) return init;
      if (typeof init === "object" && !Array.isArray(init) && (Array.isArray(parsed) || typeof parsed !== "object")) return init;
      // 객체면 새 기본값 병합 (기존 데이터 우선, 신규 필드 추가)
      if (typeof init === "object" && !Array.isArray(init)) {
        const merged = { ...init };
        for (const k in parsed) { merged[k] = parsed[k]; }
        return merged;
      }
      return parsed;
    } catch { return init; }
  });
  const valRef = useRef(val);
  const lastJson = useRef(localStorage.getItem(key) || "");
  const saveTimer = useRef(null);
  const selfSave = useRef(false);
  const pendingSave = useRef(null);
  // 🔒 Supabase 로드 완료 전엔 절대 저장 안 함 (옛날 로컬 데이터로 클라우드 덮어쓰기 방지)
  const supabaseLoaded = useRef(false);
  const userInteracted = useRef(false); // 사용자가 직접 변경한 경우만 true

  useEffect(() => { valRef.current = val; }, [val]);

  // 최초 Supabase 로드 (1회 + window.storage 준비될 때까지 재시도)
  useEffect(() => {
    let cancelled = false;
    const tryLoad = async (attempt = 0) => {
      if (cancelled) return;
      if (!window.storage) {
        if (attempt < 60) setTimeout(() => tryLoad(attempt + 1), 500); // 30초까지 재시도
        else {
          // Supabase 미연결 확정 - 로컬 저장 허용
          console.warn("[usePersist] Supabase 연결 실패, 로컬 모드로 전환:", key);
          supabaseLoaded.current = true;
        }
        return;
      }
      try {
        const r = await window.storage.get(key);
        if (cancelled) return;
        if (r?.value) {
          // 🔄 Supabase 데이터가 있으면 항상 그것을 우선 (로컬은 무시)
          if (r.value !== lastJson.current) {
            lastJson.current = r.value;
            const p = JSON.parse(r.value);
            setVal(p); valRef.current = p;
            localStorage.setItem(key, r.value);
            console.log("[usePersist] ☁️ Supabase에서 최신 로드:", key.slice(0, 50));
          } else {
            console.log("[usePersist] ☁️ Supabase=로컬 일치:", key.slice(0, 50));
          }
        } else {
          console.log("[usePersist] ☁️ Supabase에 데이터 없음 (로컬 사용):", key.slice(0, 50));
        }
        // 이제부터 저장 허용
        supabaseLoaded.current = true;

        // 보류 중인 저장이 있으면 (사용자가 변경했으면) 실행
        if (pendingSave.current !== null && userInteracted.current) {
          const json = pendingSave.current;
          pendingSave.current = null;
          selfSave.current = true;
          window.storage.set(key, json).catch(() => {}).finally(() => {
            setTimeout(() => { selfSave.current = false; }, 3000);
          });
        }
      } catch (e) {
        console.error("[usePersist] 로드 실패:", key, e);
        supabaseLoaded.current = true; // 실패 시에도 로컬 모드로 전환
      }
    };
    tryLoad();
    return () => { cancelled = true; };
  }, [key]);

  // Realtime 이벤트 (자기 저장 3초간 무시)
  useEffect(() => {
    const handler = (e) => {
      if (selfSave.current) return;
      if (e.detail?.key === key && e.detail?.value) {
        const j = typeof e.detail.value === "string" ? e.detail.value : JSON.stringify(e.detail.value);
        if (j !== lastJson.current) {
          try {
            const p = JSON.parse(j);
            
            // 🛡️ Realtime 보호: settings의 workSites가 갑자기 50% 이상 줄면 무시 (다른 기기의 옛 데이터)
            if (key.endsWith("_set_v10") && typeof p === "object" && !Array.isArray(p) && valRef.current && typeof valRef.current === "object") {
              const myWorkers = (valRef.current.workSites || []).reduce((s, x) => s + (x.workers || []).length, 0);
              const incomingWorkers = (p.workSites || []).reduce((s, x) => s + (x.workers || []).length, 0);
              
              if (myWorkers > 5 && incomingWorkers < myWorkers * 0.5) {
                console.warn(`[usePersist] 🛡️ Realtime 보호: 근무자 급감 거부 (${myWorkers} → ${incomingWorkers}). 다른 기기의 옛 데이터로 추정`);
                // 무시하고 내 데이터를 다시 저장 (자기 보정)
                if (window.storage && supabaseLoaded.current) {
                  const myJson = JSON.stringify(valRef.current);
                  selfSave.current = true;
                  window.storage.set(key, myJson).finally(() => {
                    setTimeout(() => { selfSave.current = false; }, 3000);
                  });
                }
                return;
              }
            }
            
            lastJson.current = j;
            setVal(p);
            valRef.current = p;
            localStorage.setItem(key, j);
            console.log("[usePersist] 📡 Realtime 수신:", key.slice(0, 50));
          } catch {}
        }
      }
    };
    window.addEventListener("supabase-sync", handler);
    return () => window.removeEventListener("supabase-sync", handler);
  }, [key]);

  // set: 로컬 즉시 + Supabase 2초 디바운스 (단, Supabase 로드 후에만)
  const set = useCallback((v) => {
    const next = typeof v === "function" ? v(valRef.current) : v;
    setVal(next); valRef.current = next;
    const json = JSON.stringify(next);
    lastJson.current = json;
    userInteracted.current = true; // 사용자 직접 변경 표시
    try { localStorage.setItem(key, json); } catch (e) { console.warn("[usePersist] localStorage 실패:", key); }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      let latestVal = valRef.current;
      // 🚫 Supabase 로드 전이면 저장 보류 (옛 로컬 데이터로 클라우드 덮어쓰기 방지)
      if (!supabaseLoaded.current) {
        pendingSave.current = JSON.stringify(latestVal);
        console.log("[usePersist] ⏸️ Supabase 로드 대기 중 - 저장 보류:", key.slice(0, 50));
        return;
      }
      if (!window.storage) {
        console.warn("[usePersist] window.storage 없음, 저장 스킵:", key);
        return;
      }
      
      // 🔒 데이터 손실 방지: settings 키일 때 클라우드 최신값 비교
      // workSites/zones 같은 중요 데이터가 줄어들면 머지 시도
      if (key.endsWith("_set_v10") && typeof latestVal === "object" && !Array.isArray(latestVal)) {
        try {
          const cloudRes = await window.storage.get(key);
          if (cloudRes?.value) {
            const cloud = JSON.parse(cloudRes.value);
            // workSites: 클라우드가 더 많으면 머지 (내 변경분 + 클라우드 최신)
            const myWorkers = (latestVal.workSites || []).reduce((s, x) => s + (x.workers || []).length, 0);
            const cloudWorkers = (cloud.workSites || []).reduce((s, x) => s + (x.workers || []).length, 0);
            
            if (cloudWorkers > myWorkers && cloudWorkers - myWorkers >= 3) {
              // 클라우드가 3명 이상 더 많음 → 클라우드 우선 (내가 옛날 데이터 들고 있음)
              console.warn(`[usePersist] 🛡️ 데이터 보호: 클라우드 근무자 ${cloudWorkers}명 > 내 ${myWorkers}명. 클라우드 데이터로 머지`);
              // 내가 변경한 다른 필드는 살리고 workSites/zones만 클라우드 사용
              latestVal = { 
                ...latestVal, 
                workSites: cloud.workSites,
                zones: cloud.zones || latestVal.zones,
                emergencyContacts: cloud.emergencyContacts && cloud.emergencyContacts.length > (latestVal.emergencyContacts || []).length ? cloud.emergencyContacts : latestVal.emergencyContacts
              };
              setVal(latestVal); valRef.current = latestVal;
              try { localStorage.setItem(key, JSON.stringify(latestVal)); } catch {}
            }
          }
        } catch (e) { console.warn("[usePersist] 클라우드 머지 체크 실패:", e); }
      }
      
      const latestJson = JSON.stringify(latestVal);
      lastJson.current = latestJson;
      selfSave.current = true;
      window.storage.set(key, latestJson).then(r => {
        if (r) console.log("[usePersist] ✅ 저장 완료:", key.slice(0, 50));
        else console.error("[usePersist] ❌ 저장 실패:", key);
      }).catch((e) => {
        console.error("[usePersist] 저장 예외:", key, e);
      }).finally(() => {
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
const Card = ({ children, style, onClick }) => <div onClick={onClick} style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", borderRadius: 16, padding: 20, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.2)", backdropFilter: "blur(10px)", ...style }}>{children}</div>;

// ─── Supabase 동기화 상태/설정 카드 ─────────────────────────
function SupabaseSyncCard() {
  const [status, setStatus] = useState(window._sbStatus || { ok: null });
  const [showConfig, setShowConfig] = useState(false);
  const [url, setUrl] = useState(localStorage.getItem('_sb_url') || '');
  const [key, setKey] = useState(localStorage.getItem('_sb_key') || '');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const h = () => setStatus(window._sbStatus || { ok: null });
    window.addEventListener('sb-status', h);
    h();
    return () => window.removeEventListener('sb-status', h);
  }, []);

  const save = async () => {
    if (!url || !key) { alert('URL과 Key를 모두 입력하세요'); return; }
    if (!url.startsWith('http')) { alert('URL은 https://로 시작해야 합니다'); return; }
    setTesting(true);
    // REST API로 직접 테스트 (vite 빌드 호환)
    try {
      const cleanUrl = url.replace(/\/$/, '');
      const res = await fetch(`${cleanUrl}/rest/v1/app_state?select=key&limit=1`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`❌ 연결 실패 (HTTP ${res.status})\n\n${text.slice(0, 200)}\n\n확인 사항:\n• URL/Key가 정확한가\n• app_state 테이블이 생성되어 있는가\n• RLS 정책이 SELECT 허용하는가`);
        setTesting(false);
        return;
      }
      localStorage.setItem('_sb_url', url);
      localStorage.setItem('_sb_key', key);
      alert('✅ 연결 성공!\n\n페이지를 새로고침합니다.');
      location.reload();
    } catch (e) {
      alert(`❌ 오류: ${e.message}\n\nURL이 정확한지, 네트워크가 연결되어 있는지 확인하세요.`);
      setTesting(false);
    }
  };

  const clearConfig = () => {
    if (!confirm('Supabase 설정을 삭제하고 동기화를 끌까요?')) return;
    localStorage.removeItem('_sb_url');
    localStorage.removeItem('_sb_key');
    location.reload();
  };

  const checkNow = async () => {
    if (window._safeflow?.checkConnection) {
      const ok = await window._safeflow.checkConnection();
      alert(ok ? '✅ Supabase 정상 작동 중' : '❌ DB 접근 실패 - 콘솔 확인');
    } else {
      alert('Supabase가 로드되지 않았습니다. 새로고침 후 다시 시도하세요.');
    }
  };

  // 🔄 강제 동기화 - 모든 데이터 다시 가져오기
  const [forceSyncing, setForceSyncing] = useState(false);
  const [lastForceSync, setLastForceSync] = useState(null);
  const forceSync = async () => {
    if (!window.storage) { alert('Supabase 미연결'); return; }
    setForceSyncing(true);
    try {
      // 모든 키 목록
      const list = await window.storage.list();
      if (!list?.keys) { alert('동기화 실패'); setForceSyncing(false); return; }
      let count = 0;
      for (const k of list.keys) {
        try {
          const r = await window.storage.get(k);
          if (r?.value) {
            // localStorage 업데이트 + 이벤트 발생
            localStorage.setItem(k, r.value);
            window.dispatchEvent(new CustomEvent('supabase-sync', { detail: { key: k, value: r.value } }));
            count++;
          }
        } catch {}
      }
      setLastForceSync(new Date());
      alert(`✅ ${count}개 키 동기화 완료\n페이지를 새로고침하면 즉시 반영됩니다.`);
    } catch (e) {
      alert('오류: ' + e.message);
    } finally {
      setForceSyncing(false);
    }
  };

  // 상태 컬러
  const statusInfo = status.ok === true ? { color: "#66BB6A", bg: "rgba(76,175,80,0.08)", border: "rgba(76,175,80,0.3)", icon: "✅", label: "동기화 작동중" }
                  : status.ok === false ? { color: "#EF5350", bg: "rgba(244,67,54,0.06)", border: "rgba(244,67,54,0.25)", icon: "❌", label: status.reason === 'no_config' ? "설정 필요" : "연결 실패" }
                  : { color: "#FFA726", bg: "rgba(255,167,38,0.06)", border: "rgba(255,167,38,0.25)", icon: "⏳", label: "확인 중" };

  return (<Card style={{ background: `linear-gradient(135deg, ${statusInfo.bg}, rgba(255,255,255,0.01))`, border: `1px solid ${statusInfo.border}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: showConfig ? 14 : 0 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: statusInfo.bg, border: `1px solid ${statusInfo.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{statusInfo.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>🔄 기기간 동기화</div>
        <div style={{ color: statusInfo.color, fontSize: 12, marginTop: 2, fontWeight: 600 }}>{statusInfo.label}{status.error && ` · ${status.error.slice(0, 50)}`}</div>
      </div>
      <button onClick={() => setShowConfig(!showConfig)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#94A3B8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{showConfig ? "닫기" : "설정"}</button>
    </div>

    {showConfig && <div style={{ display: "grid", gap: 10, padding: "12px", borderRadius: 10, background: "rgba(0,0,0,0.2)" }}>
      <div style={{ color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>
        🔐 Supabase URL/Key를 입력하면 모든 기기에서 데이터가 실시간 동기화됩니다.<br/>
        Supabase 대시보드 → Project Settings → API에서 복사하세요.
      </div>
      <div>
        <Label>Supabase URL</Label>
        <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxx.supabase.co" style={{ fontFamily: "monospace", fontSize: 12 }} />
      </div>
      <div>
        <Label>anon public Key</Label>
        <Input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJh..." style={{ fontFamily: "monospace", fontSize: 12 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={testing} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: testing ? "#444" : "linear-gradient(135deg, #66BB6A, #43A047)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: testing ? "wait" : "pointer" }}>{testing ? "⏳ 테스트 중..." : "✅ 저장 + 연결 테스트"}</button>
        {status.ok && <button onClick={checkNow} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(33,150,243,0.3)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔍 진단</button>}
        {(localStorage.getItem('_sb_url') || localStorage.getItem('_sb_key')) && <button onClick={clearConfig} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(244,67,54,0.25)", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑 삭제</button>}
      </div>
      {status.ok && <button onClick={forceSync} disabled={forceSyncing} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,167,38,0.3)", background: forceSyncing ? "rgba(255,167,38,0.05)" : "rgba(255,167,38,0.08)", color: "#FFA726", fontSize: 13, fontWeight: 700, cursor: forceSyncing ? "wait" : "pointer" }}>{forceSyncing ? "⏳ 동기화 중..." : "🔄 지금 강제 동기화"}</button>}
      {lastForceSync && <div style={{ color: "#94A3B8", fontSize: 11, textAlign: "center" }}>마지막 동기화: {lastForceSync.toLocaleTimeString("ko-KR")}</div>}
      <div style={{ padding: "10px", borderRadius: 8, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.15)", color: "#94A3B8", fontSize: 11, lineHeight: 1.6 }}>
        <strong style={{ color: "#42A5F5" }}>💡 동기화가 안 될 때:</strong><br/>
        1. Supabase → Database → Replication에서 <code style={{ color: "#FFA726" }}>app_state</code> 토글 ON<br/>
        2. SQL Editor에서 RLS 정책: <code style={{ color: "#FFA726" }}>CREATE POLICY "Public all" ON app_state FOR ALL USING (true);</code><br/>
        3. 콘솔(F12)에서 <code style={{ color: "#FFA726" }}>window._safeflow.checkConnection()</code>
      </div>
    </div>}
  </Card>);
}

// ─── 공통 페이지 컴포넌트 (전체 일관성) ─────────────────────────────
const PageContainer = ({ children, maxWidth = 800, accent = "#42A5F5" }) => (
  <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth, margin: "0 auto" }}>{children}</div>
  </div>
);

const PageHeader = ({ icon, title, subtitle, accent = "#42A5F5", action }) => (
  <div style={{ padding: "16px 18px", borderRadius: 18, background: `linear-gradient(135deg, ${accent}14, ${accent}03)`, border: `1px solid ${accent}33`, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${accent}33, ${accent}0A)`, border: `1px solid ${accent}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{icon}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: -0.4, margin: 0, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
      {subtitle && <p style={{ color: "#94A3B8", fontSize: 12, margin: "2px 0 0", fontWeight: 500 }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

const SectionTitle = ({ icon, children, action, accent = "#42A5F5" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px" }}>
    {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
    <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{children}</span>
    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent}30, transparent)` }} />
    {action}
  </div>
);

const EmptyState = ({ icon = "📭", title = "데이터가 없습니다", description }) => (
  <div style={{ padding: "40px 20px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", textAlign: "center" }}>
    <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>{icon}</div>
    <div style={{ color: "#CBD5E1", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
    {description && <div style={{ color: "#94A3B8", fontSize: 12 }}>{description}</div>}
  </div>
);

// 통일된 액션 버튼
const Btn = ({ variant = "primary", icon, children, onClick, disabled, style, color }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg, ${color || "#42A5F5"}, ${color ? color : "#1976D2"})`, color: "#fff", border: "none" },
    secondary: { background: "rgba(255,255,255,0.04)", color: "#CBD5E1", border: "1px solid rgba(255,255,255,0.1)" },
    outline: { background: "transparent", color: color || "#42A5F5", border: `1.5px solid ${color || "#42A5F5"}50` },
    ghost: { background: "transparent", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.06)" },
    danger: { background: "transparent", color: "#EF5350", border: "1px solid rgba(244,67,54,0.25)" },
  };
  return (<button onClick={onClick} disabled={disabled} style={{ padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 6, ...variants[variant], ...style }}>
    {icon && <span>{icon}</span>}{children}
  </button>);
};

const Label = ({ children }) => <label style={{ color: "#8892b0", fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6, letterSpacing: 0.2 }}>{children}</label>;
const Input = ({ style, ...p }) => <input {...p} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, boxSizing: "border-box", transition: "all 0.2s", ...style }} />;
const Toggle = ({ on, onToggle, labelOn, labelOff }) => (<div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ width: 56, height: 30, borderRadius: 15, background: on ? "#66BB6A" : "#333", cursor: "pointer", position: "relative", transition: "all .3s" }} onClick={onToggle}><div style={{ width: 24, height: 24, borderRadius: 12, background: "#fff", position: "absolute", top: 3, left: on ? 29 : 3, transition: "all .3s", boxShadow: "0 2px 4px rgba(0,0,0,.3)" }} /></div><span style={{ color: on ? "#66BB6A" : "#666", fontWeight: 700, fontSize: 14 }}>{on ? labelOn : labelOff}</span></div>);

function AlertToast({ alert, onClose }) {
  if (!alert) return null; const lv = LEVELS[alert.level];
  return (<div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, maxWidth: 420, width: "90vw", background: "#1a1a2e", border: `2px solid ${lv.color}`, borderRadius: 12, padding: "20px 24px", boxShadow: `0 8px 32px ${lv.color}44`, animation: "slideIn .4s ease" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ color: lv.color, fontWeight: 800, fontSize: 15 }}>⚠️ 긴급알림 ⚠️</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>✕</button></div>
    <div style={{ color: "#e0e0e0", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{alert.message}</div></div>);
}

function HistoryChart({ cat }) {
  const data = (cat.history || []).slice(-24);
  if (data.length < 2) return <p style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: 12 }}>데이터 수집 중... (30분 간격 기록)</p>;
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
      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 13 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, cat.name]} />
      {thr.YELLOW?.[0] > 0 && <ReferenceLine y={thr.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" strokeWidth={1} />}
      {thr.ORANGE?.[0] > 0 && <ReferenceLine y={thr.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" strokeWidth={1} />}
      {thr.RED?.[0] > 0 && thr.RED[0] !== Infinity && <ReferenceLine y={thr.RED[0]} stroke="#EF5350" strokeDasharray="4 4" strokeWidth={1} />}
      <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 2.5 }} activeDot={{ r: 5 }} />
    </LineChart></ResponsiveContainer></div>);
}

function InactiveOverlay({ settings }) {
  const now = useNow();
  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
    <div style={{ fontSize: 64, marginBottom: 16 }}>🌙</div>
    <h2 style={{ color: "#94A3B8", fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>시스템 비활성</h2>
    <p style={{ color: "#94A3B8", fontSize: 14 }}>운영: {settings.operatingStart} ~ {settings.operatingEnd}</p>
    <p style={{ color: "#334", fontSize: 13, marginTop: 12 }}>현재: {fmtTime(now)}</p></div>);
}

// ─── Dashboard OrgChart (읽기 전용) ─────────────────────────────
// ─── PC 관제센터 대시보드 (클로드디자인 v2 통합) ─────────────────────
const CC_STYLES = `
  .cc-root { font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif; background: #07070d; color: #f4f5fa; min-height: 100vh; padding: 24px 32px 80px; }
  .cc-root .mono { font-family: 'JetBrains Mono', monospace; }
  .cc-topbar { display: flex; align-items: center; gap: 20px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 24px; }
  .cc-brand { display: flex; align-items: center; gap: 12px; }
  .cc-brand-logo { width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg, #6b8aff 0%, #a980ff 50%, #ff5e7e 100%); display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 4px 12px rgba(107,138,255,0.4), inset 0 1px 0 rgba(255,255,255,0.2); color: #fff; font-weight: 800; }
  .cc-brand-name { font-weight: 700; font-size: 15px; letter-spacing: -0.015em; color: #f4f5fa; }
  .cc-brand-sub { font-size: 11px; color: #6c6e7d; margin-top: 1px; }
  .cc-crumbs { color: #6c6e7d; font-size: 12px; margin-left: auto; display: flex; gap: 16px; align-items: center; }
  .cc-crumbs span { color: #b0b3c4; display: flex; align-items: center; gap: 6px; }
  .cc-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #4cd99a; box-shadow: 0 0 8px #4cd99a; animation: cc-livepulse 2s ease-in-out infinite; }
  @keyframes cc-livepulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .cc-layout { display: flex; gap: 20px; max-width: 1600px; margin: 0 auto; }
  .cc-sidebar { width: 232px; flex-shrink: 0; padding: 16px 12px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; align-self: flex-start; position: sticky; top: 24px; }
  .cc-sb-section { font-size: 10px; color: #6c6e7d; text-transform: uppercase; letter-spacing: 0.1em; padding: 10px 12px 6px; font-weight: 600; }
  .cc-sb-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 9px; color: #b0b3c4; font-size: 13px; cursor: pointer; transition: all .15s; position: relative; }
  .cc-sb-item:hover { background: #14151f; color: #f4f5fa; }
  .cc-sb-item.active { background: linear-gradient(90deg, rgba(107,138,255,0.12), rgba(107,138,255,0.04)); color: #f4f5fa; font-weight: 600; }
  .cc-sb-item.active::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background: #6b8aff; border-radius: 2px; box-shadow: 0 0 8px #6b8aff; }
  .cc-sb-item .cc-badge { margin-left: auto; font-size: 10px; padding: 2px 6px; background: #ff5e7e; color: white; border-radius: 999px; font-family: 'JetBrains Mono', monospace; box-shadow: 0 0 8px rgba(255,94,126,0.5); }

  .cc-main-col { flex: 1; min-width: 0; }
  .cc-card { background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.6); position: relative; }
  .cc-card.tinted { background: linear-gradient(180deg, #14151f, #0e0f17); }
  .cc-card-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .cc-card-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; color: #f4f5fa; }
  .cc-card-sub { font-size: 12px; color: #6c6e7d; }

  .cc-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1; white-space: nowrap; border: 1px solid transparent; }
  .cc-chip .cc-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
  .cc-chip.blue { background: rgba(107,138,255,0.12); color: #6b8aff; border-color: rgba(107,138,255,0.2); }
  .cc-chip.yellow { background: rgba(245,196,81,0.12); color: #f5c451; border-color: rgba(245,196,81,0.2); }
  .cc-chip.orange { background: rgba(255,154,60,0.14); color: #ff9a3c; border-color: rgba(255,154,60,0.25); }
  .cc-chip.red { background: rgba(255,94,126,0.14); color: #ff5e7e; border-color: rgba(255,94,126,0.25); }
  .cc-chip.green { background: rgba(76,217,154,0.12); color: #4cd99a; border-color: rgba(76,217,154,0.2); }
  .cc-chip .cc-dot.pulse { animation: cc-pulse 1.6s ease-in-out infinite; }
  @keyframes cc-pulse { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 4px transparent; } }

  .cc-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 10px; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), #1d1f2c; color: #f4f5fa; border: 1px solid rgba(255,255,255,0.14); font-size: 13px; font-weight: 500; cursor: pointer; box-shadow: 0 1px 0 rgba(255,255,255,0.05) inset; transition: all .15s; }
  .cc-btn:hover { transform: translateY(-1px); }
  .cc-btn.primary { background: linear-gradient(180deg, #7c98ff, #5a7aff); border-color: rgba(255,255,255,0.18); color: white; box-shadow: 0 4px 16px -4px rgba(107,138,255,0.5); }
  .cc-btn.danger { background: linear-gradient(180deg, #ff738e, #ff4f72); border-color: rgba(255,255,255,0.15); color: white; }
  .cc-btn.warn { background: linear-gradient(180deg, #ffaf5c, #ff8a2a); border-color: rgba(255,255,255,0.15); color: white; }
  .cc-btn.ghost { background: transparent; border-color: transparent; box-shadow: none; }
  .cc-btn.ghost:hover { background: #14151f; }
  .cc-btn.sm { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
  .cc-btn.lg { padding: 12px 18px; font-size: 14px; }

  .cc-metric { padding: 18px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; position: relative; overflow: hidden; transition: transform .2s; cursor: pointer; }
  .cc-metric:hover { transform: translateY(-2px); }
  .cc-metric-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .cc-metric-name { font-size: 11px; color: #6c6e7d; display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .cc-metric-icon { width: 26px; height: 26px; border-radius: 8px; background: #1d1f2c; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #b0b3c4; border: 1px solid rgba(255,255,255,0.08); }
  .cc-metric-val { font-size: 30px; font-weight: 700; line-height: 1.1; letter-spacing: -0.03em; font-family: 'JetBrains Mono', monospace; }
  .cc-metric-unit { font-size: 13px; color: #6c6e7d; margin-left: 6px; font-weight: 400; font-family: 'Pretendard Variable', sans-serif; }
  .cc-metric-trend { font-size: 11px; color: #6c6e7d; margin-top: 6px; }
  .cc-metric.alert { border-color: rgba(245,196,81,0.3); background: linear-gradient(180deg, rgba(245,196,81,0.08), rgba(245,196,81,0.02)), #0e0f17; }
  .cc-metric.alert .cc-metric-icon { background: rgba(245,196,81,0.12); color: #f5c451; border-color: rgba(245,196,81,0.25); }
  .cc-metric.danger { border-color: rgba(255,154,60,0.4); background: linear-gradient(180deg, rgba(255,154,60,0.1), rgba(255,154,60,0.02)), #0e0f17; }
  .cc-metric.danger .cc-metric-icon { background: rgba(255,154,60,0.15); color: #ff9a3c; border-color: rgba(255,154,60,0.3); }
  .cc-metric.danger .cc-metric-val { color: #ff9a3c; }
  .cc-metric.red-alert { border-color: rgba(255,94,126,0.4); background: linear-gradient(180deg, rgba(255,94,126,0.1), rgba(255,94,126,0.02)), #0e0f17; }
  .cc-metric.red-alert .cc-metric-icon { background: rgba(255,94,126,0.15); color: #ff5e7e; }
  .cc-metric.red-alert .cc-metric-val { color: #ff5e7e; }

  .cc-g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .cc-list-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .cc-list-row:last-child { border-bottom: 0; }

  /* ═══════════════════════════════════════════════════════════ */
  /* 햄버거 메뉴 + 모바일 사이드바 드로어                         */
  /* ═══════════════════════════════════════════════════════════ */
  .cc-mobile-menu-btn { display: none; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; width: 40px; height: 40px; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; color: #f4f5fa; flex-shrink: 0; }
  .cc-sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 999; animation: cc-fade-in 0.2s ease; }
  @keyframes cc-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cc-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }

  /* ═══════════════════════════════════════════════════════════ */
  /* 태블릿 (1024px 미만, 768px 이상) — 좁은 사이드바             */
  /* ═══════════════════════════════════════════════════════════ */
  @media (max-width: 1023px) {
    .cc-root { padding: 16px 20px 80px; }
    .cc-layout { gap: 14px; }
    .cc-sidebar { width: 200px; padding: 14px 10px; }
    .cc-g4 { grid-template-columns: repeat(2, 1fr); }
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* 모바일 (768px 미만) — 사이드바 드로어 + 단일 컬럼            */
  /* ═══════════════════════════════════════════════════════════ */
  @media (max-width: 767px) {
    .cc-root { padding: 12px 12px 90px; }
    .cc-topbar { padding: 8px 0; margin-bottom: 16px; gap: 10px; flex-wrap: wrap; }
    .cc-brand-logo { width: 28px; height: 28px; font-size: 12px; border-radius: 8px; }
    .cc-brand-name { font-size: 14px; }
    .cc-brand-sub { font-size: 10px; }
    .cc-crumbs { gap: 8px; font-size: 11px; flex-wrap: wrap; }
    .cc-crumbs span { font-size: 11px; }

    .cc-mobile-menu-btn { display: flex; }

    .cc-layout { display: block; }
    .cc-sidebar {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      width: 260px;
      max-width: 80vw;
      border-radius: 0 16px 16px 0;
      z-index: 1000;
      transform: translateX(-100%);
      transition: transform 0.25s ease-out;
      overflow-y: auto;
      padding-top: max(20px, env(safe-area-inset-top));
    }
    .cc-sidebar.open { transform: translateX(0); animation: cc-slide-in 0.25s ease-out; }
    .cc-sidebar-overlay.open { display: block; }

    .cc-main-col { width: 100%; }

    .cc-g4 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .cc-card { padding: 14px; }
    .cc-card-h { margin-bottom: 10px; }
    .cc-card-title { font-size: 13px; }
    .cc-metric { padding: 14px; }
    .cc-metric-val { font-size: 22px; }
    .cc-metric-icon { width: 22px; height: 22px; }

    /* 그리팅 영역 */
    .cc-greeting-box { flex-direction: column; align-items: flex-start !important; gap: 10px; }
    .cc-greeting-text { font-size: 20px !important; }

    /* 2열 그리드 → 1열로 (대시보드 활성경보+구역혼잡도) */
    .cc-grid-2col { grid-template-columns: 1fr !important; }

    /* 테이블: 가로 스크롤 가능하게 */
    table { font-size: 12px; }
    table th, table td { padding: 8px 6px !important; white-space: nowrap; }

    /* 알림 발령 5단계 - 작은 패딩 */
    .cc-step-bar { gap: 4px !important; }
    .cc-step-bar > div { padding: 8px 6px !important; font-size: 10px !important; }

    /* 통계 카드 4개 → 2열로 */
    .cc-stats-4 { grid-template-columns: repeat(2, 1fr) !important; }

    /* 인풋 폰트 16px (iOS zoom 방지) */
    input, select, textarea { font-size: 16px !important; }
  }

  /* 작은 모바일 (480px 미만) — 메트릭 1열 */
  @media (max-width: 479px) {
    .cc-g4 { grid-template-columns: 1fr; }
  }
`;

const CC_LEVEL_MAP = { BLUE: "blue", YELLOW: "yellow", ORANGE: "orange", RED: "red" };
const CC_LEVEL_LABEL = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" };

// ─── Mobile Design System (클로드디자인 v2 모바일) ─────────────────
const MD_GLOBAL_V2 = `
  /* ═══════════════════════════════════════════════════════════ */
  /* v2 활성: 모든 페이지에 클로드디자인 톤 입히기                */
  /* ═══════════════════════════════════════════════════════════ */
  body.md-v2-active { font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif !important; }
  body.md-v2-active * { font-family: inherit; }
  body.md-v2-active .mono, body.md-v2-active [style*="JetBrains Mono"] { font-family: 'JetBrains Mono', monospace !important; }

  /* 메인 배경: 더 깊은 검정으로 */
  body.md-v2-active div[style*="linear-gradient(180deg, #0a0d1a"] { 
    background: linear-gradient(180deg, #07070d 0%, #0e0f17 100%) !important; 
  }
  body.md-v2-active { background: #07070d; }
  
  /* 상단바 v2 톤 */
  body.md-v2-active div[style*="rgba(10,10,26,0.95)"] { 
    background: rgba(7,7,13,0.85) !important; 
    backdrop-filter: blur(20px) saturate(140%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(140%) !important;
  }
  
  /* 카드 v2 그라데이션 */
  body.md-v2-active div[style*="linear-gradient(145deg, rgba(255,255,255,0.04)"],
  body.md-v2-active div[style*="background: \\"rgba(255,255,255,0.02)\\""],
  body.md-v2-active div[style*="background: rgba(255,255,255,0.02)"], 
  body.md-v2-active div[style*="background: rgba(255,255,255,0.03)"] { 
    background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17 !important;
  }
  
  /* 보더 톤 통일 */
  body.md-v2-active [style*="rgba(255,255,255,0.04)"]:not([style*="background"]),
  body.md-v2-active [style*="rgba(255,255,255,0.05)"]:not([style*="background"]),
  body.md-v2-active [style*="rgba(255,255,255,0.06)"]:not([style*="background"]) { 
    border-color: rgba(255,255,255,0.08) !important; 
  }
  
  /* 색상 팔레트 매핑: SAFEFLOW → 클로드디자인 v2 */
  /* 파랑 #42A5F5 → #6b8aff (accent) */
  body.md-v2-active [style*="color: \\"#42A5F5\\""] { color: #8fa6ff !important; }
  body.md-v2-active [style*="color:#42A5F5"] { color: #8fa6ff !important; }
  body.md-v2-active [style*="background: \\"#42A5F5\\""] { background: linear-gradient(180deg, #7c98ff, #5a7aff) !important; }
  
  /* 타이틀 letter-spacing 더 빡빡하게 */
  body.md-v2-active h1, body.md-v2-active h2, body.md-v2-active h3 { 
    letter-spacing: -0.02em !important; 
  }
  
  /* 인풋/셀렉트/텍스트에어리어 v2 톤 */
  body.md-v2-active input:not([type="checkbox"]):not([type="radio"]), 
  body.md-v2-active select, 
  body.md-v2-active textarea { 
    font-family: inherit !important;
    border-radius: 10px !important;
    background: #0e0f17 !important;
    border-color: rgba(255,255,255,0.08) !important;
  }
  body.md-v2-active input:focus, body.md-v2-active select:focus, body.md-v2-active textarea:focus {
    border-color: rgba(107,138,255,0.4) !important;
    outline: none !important;
  }
  
  /* 버튼 글로벌 톤 */
  body.md-v2-active button[style*="background: \\"rgba(33,150,243"],
  body.md-v2-active button[style*="background:rgba(33,150,243"] { 
    background: linear-gradient(180deg, rgba(107,138,255,0.15), rgba(107,138,255,0.05)) !important; 
    color: #8fa6ff !important; 
    border-color: rgba(107,138,255,0.25) !important;
  }
  
  /* 둥글기 통일 */
  body.md-v2-active div[style*="borderRadius: 12"] { border-radius: 14px !important; }
  body.md-v2-active div[style*="borderRadius: 16"] { border-radius: 16px !important; }
  
  /* PageHeader 액센트 라인 */
  body.md-v2-active div[style*="borderLeft"][style*="solid"] { border-left-width: 3px !important; }
  
  /* 하단 네비게이션 v2 톤 */
  body.md-v2-active nav[style*="position"][style*="fixed"][style*="bottom"] {
    background: rgba(7,7,13,0.92) !important;
    backdrop-filter: blur(20px) !important;
    border-top-color: rgba(255,255,255,0.06) !important;
  }
  
  /* 그림자 더 깊게 */
  body.md-v2-active div[style*="boxShadow: \\"0 4px 24px rgba(0,0,0,0.2)\\""] {
    box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.6) !important;
  }
`;

const MD_STYLES = `
  .md-root { font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif; background: #07070d; color: #f4f5fa; min-height: 100vh; padding-bottom: 80px; }
  .md-root .mono { font-family: 'JetBrains Mono', monospace; }
  .md-root * { -webkit-tap-highlight-color: transparent; }

  .md-topbar { padding: calc(env(safe-area-inset-top) + 14px) 18px 14px; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(180deg, #0e0f17 0%, rgba(14,15,23,0.85) 100%); position: sticky; top: 0; z-index: 50; backdrop-filter: blur(16px); }
  .md-topbar .greet { display: flex; flex-direction: column; }
  .md-topbar .greet-sub { font-size: 11px; color: #6c6e7d; }
  .md-topbar .greet-fest { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; color: #f4f5fa; }
  .md-topbar .actions { display: flex; gap: 6px; }
  .md-topbar .icon-btn { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; color: #b0b3c4; font-size: 16px; }
  .md-topbar .icon-btn .dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; background: #ff5e7e; border-radius: 50%; box-shadow: 0 0 8px #ff5e7e; }

  .md-banner { margin: 12px 16px; padding: 16px; border-radius: 16px; box-shadow: 0 12px 32px -16px rgba(0,0,0,0.6); }
  .md-banner.orange { background: linear-gradient(180deg, rgba(255,154,60,0.18), rgba(255,154,60,0.04)); border: 1px solid rgba(255,154,60,0.3); }
  .md-banner.yellow { background: linear-gradient(180deg, rgba(245,196,81,0.15), rgba(245,196,81,0.03)); border: 1px solid rgba(245,196,81,0.25); }
  .md-banner.red { background: linear-gradient(180deg, rgba(255,94,126,0.18), rgba(255,94,126,0.04)); border: 1px solid rgba(255,94,126,0.3); }
  .md-banner.blue { background: linear-gradient(180deg, rgba(76,217,154,0.12), rgba(76,217,154,0.03)); border: 1px solid rgba(76,217,154,0.2); }

  .md-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1; }
  .md-chip .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
  .md-chip.blue { background: rgba(76,217,154,0.12); color: #4cd99a; }
  .md-chip.yellow { background: rgba(245,196,81,0.14); color: #f5c451; }
  .md-chip.orange { background: rgba(255,154,60,0.16); color: #ff9a3c; }
  .md-chip.red { background: rgba(255,94,126,0.16); color: #ff5e7e; }
  .md-chip.green { background: rgba(76,217,154,0.12); color: #4cd99a; }
  .md-chip .dot.pulse { animation: cc-pulse 1.6s ease-in-out infinite; }

  .md-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 16px; margin-bottom: 12px; }
  .md-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 0 16px; margin-bottom: 12px; }

  .md-metric { padding: 14px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; box-shadow: 0 8px 24px -12px rgba(0,0,0,0.5); cursor: pointer; transition: transform 0.15s; }
  .md-metric:active { transform: scale(0.97); }
  .md-metric.alert { border-color: rgba(245,196,81,0.3); background: linear-gradient(180deg, rgba(245,196,81,0.08), rgba(245,196,81,0.02)), #0e0f17; }
  .md-metric.danger { border-color: rgba(255,154,60,0.4); background: linear-gradient(180deg, rgba(255,154,60,0.1), rgba(255,154,60,0.02)), #0e0f17; }
  .md-metric.red-alert { border-color: rgba(255,94,126,0.4); background: linear-gradient(180deg, rgba(255,94,126,0.1), rgba(255,94,126,0.02)), #0e0f17; }
  .md-metric-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .md-metric-name { font-size: 10px; color: #6c6e7d; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .md-metric-icon { width: 22px; height: 22px; border-radius: 6px; background: #1d1f2c; display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .md-metric.alert .md-metric-icon { background: rgba(245,196,81,0.15); }
  .md-metric.danger .md-metric-icon { background: rgba(255,154,60,0.18); }
  .md-metric.red-alert .md-metric-icon { background: rgba(255,94,126,0.18); }
  .md-metric-val { font-size: 22px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; font-family: 'JetBrains Mono', monospace; color: #f4f5fa; }
  .md-metric.danger .md-metric-val { color: #ff9a3c; }
  .md-metric.red-alert .md-metric-val { color: #ff5e7e; }
  .md-metric-unit { font-size: 11px; color: #6c6e7d; margin-left: 4px; font-weight: 400; font-family: inherit; }
  .md-metric-trend { font-size: 10px; color: #6c6e7d; margin-top: 4px; }

  .md-card { margin: 0 16px 12px; padding: 14px 16px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; box-shadow: 0 8px 24px -12px rgba(0,0,0,0.5); }
  .md-card-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .md-card-title { font-size: 13px; font-weight: 700; color: #f4f5fa; letter-spacing: -0.01em; }
  .md-card-sub { font-size: 11px; color: #6c6e7d; margin-top: 2px; }

  .md-list-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .md-list-row:last-child { border-bottom: 0; }

  .md-bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; padding: 8px 0 calc(env(safe-area-inset-bottom) + 8px); background: rgba(7,7,13,0.92); backdrop-filter: blur(20px); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-around; z-index: 100; }
  .md-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 12px; cursor: pointer; color: #6c6e7d; min-width: 56px; }
  .md-nav-item.active { color: #6b8aff; }
  .md-nav-item.active .md-nav-icon { transform: translateY(-2px); }
  .md-nav-icon { font-size: 22px; transition: transform 0.15s; position: relative; }
  .md-nav-label { font-size: 10px; font-weight: 600; }
  .md-nav-badge { position: absolute; top: -4px; right: -8px; min-width: 16px; height: 16px; border-radius: 8px; background: #ff5e7e; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; box-shadow: 0 0 8px rgba(255,94,126,0.5); }

  .md-overall-hero { margin: 12px 16px 16px; padding: 18px 20px; border-radius: 18px; background: linear-gradient(135deg, rgba(107,138,255,0.08), rgba(169,128,255,0.04)); border: 1px solid rgba(107,138,255,0.18); }
  .md-overall-label { font-size: 11px; color: #6c6e7d; letter-spacing: 0.04em; }
  .md-overall-status { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; color: #f4f5fa; }
  .md-overall-time { font-size: 11px; color: #6c6e7d; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
`;

const MD_LEVEL_COLORS = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" };

const MD_Chip = ({ level, children, pulse }) => (<span className={`md-chip ${level || "blue"}`}><span className={`dot ${pulse ? "pulse" : ""}`} />{children}</span>);

const MD_Metric = ({ cat, onClick }) => {
  const lv = getLevel(cat);
  const isAlert = lv === "YELLOW";
  const isDanger = lv === "ORANGE";
  const isRed = lv === "RED";
  const lvColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv];
  
  // 현황 24h 추이 데이터
  const history = (cat.history || []).slice(-24);
  // 예보 데이터 (초단기 6시간)
  const forecast = (cat.forecast || []).slice(0, 6);
  // 단기예보 (3일) — 있으면 우선 사용 안하고 초단기만
  const nextFc = forecast[0];
  
  // sparkline 그리기
  const sparkData = history.length > 2 ? history.map(h => h.value || 0) : [];
  let sparklinePath = "";
  if (sparkData.length > 1) {
    const min = Math.min(...sparkData);
    const max = Math.max(...sparkData);
    const range = max - min || 1;
    sparklinePath = sparkData.map((v, i) => {
      const x = (i / (sparkData.length - 1)) * 100;
      const y = 24 - ((v - min) / range) * 20;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  }
  
  return (<div className={`md-metric ${isAlert ? "alert" : ""} ${isDanger ? "danger" : ""} ${isRed ? "red-alert" : ""}`} onClick={onClick}>
    <div className="md-metric-h">
      <span className="md-metric-name"><span className="md-metric-icon">{cat.icon || "📊"}</span>{cat.name}</span>
      <MD_Chip level={CC_LEVEL_MAP[lv]}>{CC_LEVEL_LABEL[lv]}</MD_Chip>
    </div>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
      <div className="md-metric-val">{(cat.currentValue || 0).toLocaleString()}<span className="md-metric-unit">{cat.unit}</span></div>
      {nextFc && <div style={{ textAlign: "right", lineHeight: 1.2 }}>
        <div style={{ fontSize: 9, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>예보</div>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: nextFc.value > cat.currentValue ? "#ff5e7e" : nextFc.value < cat.currentValue ? "#6b8aff" : "#6c6e7d" }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#b0b3c4", fontFamily: "JetBrains Mono, monospace" }}>{nextFc.value}</span>
        </div>
      </div>}
    </div>
    {/* 24h 스파크라인 */}
    {sparklinePath && <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: "100%", height: 22, marginBottom: 4, display: "block" }}>
      <defs>
        <linearGradient id={`md-grad-${cat.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lvColor} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={lvColor} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${sparklinePath} L 100 26 L 0 26 Z`} fill={`url(#md-grad-${cat.id})`} stroke="none"/>
      <path d={sparklinePath} fill="none" stroke={lvColor} strokeWidth="1.2"/>
    </svg>}
    {/* 6h 예보 미니 막대 */}
    {forecast.length > 1 && <div style={{ display: "flex", gap: 2, height: 12, alignItems: "flex-end", marginBottom: 4 }}>
      {forecast.slice(0, 6).map((f, i) => {
        const vals = forecast.slice(0, 6).map(x => x.value);
        const mn = Math.min(...vals); const mx = Math.max(...vals); const rng = mx - mn || 1;
        const h = 2 + ((f.value - mn) / rng) * 10;
        return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex: 1, height: h, borderRadius: 1.5, background: lvColor, opacity: 0.2 + (i === 0 ? 0.5 : 0.08 * (6 - i)) }} />;
      })}
    </div>}
    <div className="md-metric-trend">임계: {cat.thresholds?.yellow || "-"} / {cat.thresholds?.orange || "-"}</div>
  </div>);
};

// ─── Mobile 클로드디자인 대시보드 ──────────────────────────────────
// ─── 카테고리 상세 모달 (v2 디자인용) ─────────────────────────
function CategoryDetailModal({ cat, settings, onClose, onAction, session }) {
  if (!cat) return null;
  const lv = getLevel(cat); const li = LEVELS[lv];
  const isWarning = lv !== "BLUE";
  const history = (cat.history || []).slice(-24);
  const forecast = cat.forecast || [];
  const shortForecast = cat.shortForecast || [];
  
  return (<div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", overflow: "auto", WebkitOverflowScrolling: "touch" }} onClick={onClose}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div onClick={e => e.stopPropagation()} style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "calc(env(safe-area-inset-top) + 12px) max(14px, env(safe-area-inset-right)) calc(env(safe-area-inset-bottom) + 80px) max(14px, env(safe-area-inset-left))", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* 닫기 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "sticky", top: 0, zIndex: 10, background: "linear-gradient(180deg, #07070d 80%, transparent)", padding: "8px 0" }}>
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← 닫기</button>
          <span style={{ color: "#6c6e7d", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{cat.lastUpdated || "-"}</span>
        </div>

        {/* 메인 카드 */}
        <div style={{ padding: "20px 18px", marginBottom: 14, background: `linear-gradient(135deg, ${li.color}10, rgba(255,255,255,0.02))`, border: `1.5px solid ${li.color}40`, borderRadius: 18, boxShadow: `0 0 0 1px ${li.color}10, 0 12px 40px ${li.color}20` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 50, height: 50, borderRadius: 14, background: `${li.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>{cat.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ color: "#f4f5fa", fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{cat.name}</h2>
              <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>
                {cat.kmaCategory ? `🌤️ 기상청 ${cat.kmaCategory}` : cat.apiConfig?.enabled ? "🔌 커스텀 API" : "✏️ 수동 입력"}
              </div>
            </div>
            <span style={{ padding: "5px 12px", borderRadius: 999, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{li.icon} {li.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 48, fontWeight: 700, color: li.color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.03em", lineHeight: 1 }}>{cat.currentValue.toLocaleString()}</span>
            <span style={{ fontSize: 16, color: "#94A3B8" }}>{cat.unit}</span>
          </div>
          {cat.actionStatus && <div style={{ marginTop: 10 }}>
            <span style={{ padding: "5px 12px", borderRadius: 999, background: cat.actionStatus === "handling" ? "rgba(255,154,60,0.15)" : "rgba(76,217,154,0.15)", border: `1px solid ${cat.actionStatus === "handling" ? "rgba(255,154,60,0.3)" : "rgba(76,217,154,0.3)"}`, color: cat.actionStatus === "handling" ? "#ff9a3c" : "#4cd99a", fontSize: 12, fontWeight: 700 }}>{cat.actionStatus === "handling" ? "🔧 조치중" : "✅ 조치완료"}</span>
          </div>}
        </div>

        {/* 📊 실황 추이 그래프 */}
        {history.length >= 2 && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: li.color, boxShadow: `0 0 6px ${li.color}` }}/>
            <span style={{ color: li.color, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>📊 실황 추이 (최근 24시간)</span>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                <XAxis dataKey="time" tick={{ fill: "#6c6e7d", fontSize: 10 }} />
                <YAxis tick={{ fill: "#6c6e7d", fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ background: "#0e0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, "실황"]} />
                {cat.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={cat.thresholds.YELLOW[0]} stroke="#f5c451" strokeDasharray="4 4" label={{ value: "주의", fill: "#f5c451", fontSize: 10 }} />}
                {cat.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={cat.thresholds.ORANGE[0]} stroke="#ff9a3c" strokeDasharray="4 4" label={{ value: "경계", fill: "#ff9a3c", fontSize: 10 }} />}
                {cat.thresholds?.RED?.[0] > 0 && <ReferenceLine y={cat.thresholds.RED[0]} stroke="#ff5e7e" strokeDasharray="4 4" label={{ value: "심각", fill: "#ff5e7e", fontSize: 10 }} />}
                <Line type="monotone" dataKey="value" stroke={li.color} strokeWidth={2.5} dot={{ fill: li.color, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>}

        {/* 📊 데이터 부족 안내 */}
        {history.length < 2 && cat.kmaCategory && <div style={{ padding: 20, marginBottom: 12, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
          <div style={{ color: "#b0b3c4", fontSize: 13, marginBottom: 4 }}>실황 데이터 수집 중</div>
          <div style={{ color: "#6c6e7d", fontSize: 11 }}>10분마다 자동 갱신됩니다 (현재값: {cat.currentValue}{cat.unit})</div>
        </div>}

        {/* 📋 초단기 예보 */}
        {forecast.length > 0 && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "#ff9a3c" }}/>
            <span style={{ color: "#ff9a3c", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>📋 초단기 예보 (향후 6시간)</span>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={forecast} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                <XAxis dataKey="time" tick={{ fill: "#6c6e7d", fontSize: 10 }} />
                <YAxis tick={{ fill: "#6c6e7d", fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ background: "#0e0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, "예보"]} />
                {cat.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={cat.thresholds.YELLOW[0]} stroke="#f5c451" strokeDasharray="4 4" />}
                {cat.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={cat.thresholds.ORANGE[0]} stroke="#ff9a3c" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="value" stroke="#ff9a3c" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#ff9a3c", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>}

        {/* 📅 단기 예보 */}
        {shortForecast.length > 0 && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: "#6b8aff" }}/>
            <span style={{ color: "#6b8aff", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>📅 단기 예보 (3일, 3시간 간격)</span>
          </div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={shortForecast} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                <XAxis dataKey="time" tick={{ fill: "#6c6e7d", fontSize: 9 }} interval={Math.floor(shortForecast.length / 8)} />
                <YAxis tick={{ fill: "#6c6e7d", fontSize: 11 }} width={40} />
                <Tooltip contentStyle={{ background: "#0e0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${Number(v).toLocaleString()} ${cat.unit}`, "단기예보"]} />
                {cat.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={cat.thresholds.YELLOW[0]} stroke="#f5c451" strokeDasharray="4 4" />}
                {cat.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={cat.thresholds.ORANGE[0]} stroke="#ff9a3c" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="value" stroke="#6b8aff" strokeWidth={2} dot={{ fill: "#6b8aff", r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>}

        {/* 임계값 표 */}
        <div style={{ padding: 14, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#b0b3c4", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>임계값</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {Object.entries(LEVELS).map(([lk, lvi]) => (<div key={lk} style={{ padding: "10px 6px", borderRadius: 10, background: lk === lv ? lvi.bg : "rgba(255,255,255,0.02)", border: `1px solid ${lk === lv ? lvi.border : "rgba(255,255,255,0.05)"}`, textAlign: "center" }}>
              <div style={{ color: lvi.color, fontSize: 12, fontWeight: 700 }}>{lvi.label}</div>
              <div style={{ color: lk === lv ? "#fff" : "#6c6e7d", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{cat.thresholds[lk]?.[0]}~{cat.thresholds[lk]?.[1] === Infinity ? "∞" : cat.thresholds[lk]?.[1]}</div>
            </div>))}
          </div>
        </div>

        {/* 조치 버튼 */}
        {isWarning && onAction && <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={() => onAction(cat.id, "handling")} style={{
            flex: 1, padding: "14px", borderRadius: 12,
            border: cat.actionStatus === "handling" ? "2px solid #ff9a3c" : "1px solid rgba(255,255,255,0.08)",
            background: cat.actionStatus === "handling" ? "rgba(255,154,60,0.15)" : "rgba(255,255,255,0.02)",
            color: cat.actionStatus === "handling" ? "#ff9a3c" : "#b0b3c4", fontSize: 14, fontWeight: 700, cursor: "pointer"
          }}>🔧 조치중</button>
          <button onClick={() => onAction(cat.id, "resolved")} style={{
            flex: 1, padding: "14px", borderRadius: 12,
            border: cat.actionStatus === "resolved" ? "2px solid #4cd99a" : "1px solid rgba(255,255,255,0.08)",
            background: cat.actionStatus === "resolved" ? "rgba(76,217,154,0.15)" : "rgba(255,255,255,0.02)",
            color: cat.actionStatus === "resolved" ? "#4cd99a" : "#b0b3c4", fontSize: 14, fontWeight: 700, cursor: "pointer"
          }}>✅ 조치완료</button>
        </div>}

        {/* 대응 체크리스트 */}
        {(cat.actionItems || []).length > 0 && <div style={{ padding: 14, marginBottom: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#b0b3c4", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>대응 체크리스트</div>
          {cat.actionItems.map((item, i) => (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < cat.actionItems.length - 1 ? "1px dashed rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: "#b0b3c4", fontSize: 13, lineHeight: 1.5 }}>{item}</span>
          </div>))}
        </div>}

        <button onClick={onClose} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1px solid rgba(107,138,255,0.3)", background: "linear-gradient(180deg, rgba(107,138,255,0.12), rgba(107,138,255,0.04))", color: "#8fa6ff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>← 닫기</button>
      </div>
    </div>
  </div>);
}

function MobileNewDashboard({ session, settings, categories, alerts, onCardClick, onSearch, onAlertClick, onPageChange, onLogout, isManager, onSwitchToOldDesign, onAction, setActiveAlert, onDeleteAlert }) {
  const overall = useMemo(() => {
    // 🚫 temp/humidity는 종합 위험도 계산에서 제외 (개별 카드 단계만 유지)
    const lvs = (categories || []).filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id)).map(c => getLevel(c));
    if (lvs.includes("RED")) return "RED";
    if (lvs.includes("ORANGE")) return "ORANGE";
    if (lvs.includes("YELLOW")) return "YELLOW";
    return "BLUE";
  }, [categories]);
  const overallColor = MD_LEVEL_COLORS[overall];
  const overallLabel = CC_LEVEL_LABEL[overall];

  const sortedCats = [...(categories || [])].sort((a, b) => {
    const ord = { RED: 0, ORANGE: 1, YELLOW: 2, BLUE: 3 };
    return ord[getLevel(a)] - ord[getLevel(b)];
  });

  const topAlert = alerts && alerts[0];
  const unreadAlerts = (alerts || []).filter(a => a.level === "ORANGE" || a.level === "RED").length;

  return (<>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>{MD_STYLES}</style>
    <div className="md-root">
      {/* 상단바 */}
      <div className="md-topbar">
        <div className="greet">
          <div className="greet-sub">관제센터 · {session?.name}</div>
          <div className="greet-fest">{settings?.festivalName || "축제 미설정"}</div>
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={onSearch}>🔍</button>
          <button className="icon-btn" onClick={() => onPageChange && onPageChange("chat")}>
            🔔
            {unreadAlerts > 0 && <span className="dot" />}
          </button>
          <button className="icon-btn" onClick={onSwitchToOldDesign} title="기존 디자인으로">⚙️</button>
        </div>
      </div>

      {/* 종합 상태 히어로 */}
      <div className="md-overall-hero">
        <div className="md-overall-label">현재 종합 위험도</div>
        <div className="md-overall-status">
          지금 <span style={{ color: overallColor }}>{overallLabel}</span> 단계예요
        </div>
        <div className="md-overall-time">{new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      {/* 최우선 알림 배너 */}
      {topAlert && (() => {
        const isManualAlert = topAlert.category === "수동 발령" || !topAlert.catId;
        const linkedCat = !isManualAlert ? (categories || []).find(c => c.name === topAlert.category || c.id === topAlert.catId) : null;
        return (<div className={`md-banner ${CC_LEVEL_MAP[topAlert.level]}`} style={{ position: "relative" }}>
          {/* X 닫기 버튼 (우상단) */}
          <button onClick={(e) => { e.stopPropagation(); if (onDeleteAlert) onDeleteAlert(0); }} style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.3)", color: "#b0b3c4", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, zIndex: 2 }} title="알림 닫기">✕</button>
          <div style={{ paddingRight: 36 }}>
            <MD_Chip level={CC_LEVEL_MAP[topAlert.level]} pulse>● {topAlert.level} · {CC_LEVEL_LABEL[topAlert.level]}</MD_Chip>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, lineHeight: 1.3, color: "#f4f5fa" }}>{topAlert.category}</div>
            <div style={{ fontSize: 12, color: "#b0b3c4", marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{(topAlert.message || "").split("\n").slice(0, 3).join(" · ") || "임계값 도달 - 확인 필요"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => {
              if (linkedCat) {
                // 카테고리 알림 → handling 시작 + 카테고리 모달 열기
                if (linkedCat.actionStatus !== "handling" && onAction) onAction(linkedCat.id, "handling");
                if (onCardClick) onCardClick(linkedCat.id);
              } else {
                // 수동 발령 → 메시지 전체 모달 표시
                if (setActiveAlert) setActiveAlert(topAlert);
                else if (onAlertClick) onAlertClick(topAlert);
              }
            }} style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "none", background: `linear-gradient(180deg, ${overallColor}, ${overallColor}dd)`, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{isManualAlert ? "📨 메시지 보기" : "대응 시작 →"}</button>
            {onDeleteAlert && <button onClick={(e) => { e.stopPropagation(); if (confirm(`${isManualAlert ? "이 발령을" : "이 알림을"} 삭제하시겠습니까?`)) onDeleteAlert(0); }} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,94,126,0.25)", background: "rgba(255,94,126,0.08)", color: "#ff5e7e", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>🗑 삭제</button>}
          </div>
        </div>);
      })()}

      {/* 메트릭 그리드 (2열) */}
      <div className="md-grid2">
        {sortedCats.slice(0, 4).map(cat => (<MD_Metric key={cat.id} cat={cat} onClick={() => onCardClick && onCardClick(cat.id)} />))}
      </div>
      {sortedCats.length > 4 && <div className="md-grid2">
        {sortedCats.slice(4).map(cat => (<MD_Metric key={cat.id} cat={cat} onClick={() => onCardClick && onCardClick(cat.id)} />))}
      </div>}

      {/* 활성 경보 카드 */}
      <div className="md-card">
        <div className="md-card-h">
          <div>
            <div className="md-card-title">활성 경보 {(alerts || []).length}건</div>
            <div className="md-card-sub">실시간 갱신</div>
          </div>
          {(alerts || []).length > 0 && <button onClick={() => onPageChange && onPageChange("chat")} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#b0b3c4", fontSize: 11, cursor: "pointer" }}>전체 →</button>}
        </div>
        {(alerts || []).slice(0, 4).map((a, i) => (<div key={i} className="md-list-row" onClick={() => onAlertClick && onAlertClick(a)}>
          <MD_Chip level={CC_LEVEL_MAP[a.level]} pulse={a.level === "ORANGE" || a.level === "RED"}>●</MD_Chip>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.category}</div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>{(a.message || "").split("\n")[2] || "임계값 도달"}</div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "#6c6e7d" }}>{a.time?.split(" ")[1] || a.time}</span>
        </div>))}
        {(!alerts || alerts.length === 0) && <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>현재 활성 경보 없음 ✓</div>}
      </div>

      {/* 구역 혼잡도 카드 */}
      {(settings.zones || []).length > 0 && <div className="md-card">
        <div className="md-card-h">
          <div className="md-card-title">구역별 혼잡도</div>
          <div className="md-card-sub">{(settings.zones || []).length}개 구역</div>
        </div>
        {(settings.zones || []).slice(0, 5).map(z => {
          const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id);
          const cl = c?.level || "smooth";
          const lv = cl === "danger" ? "red" : cl === "crowded" ? "yellow" : "green";
          const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활";
          return (<div key={z.id} className="md-list-row">
            <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1 }}>📍 {z.name}</span>
            <MD_Chip level={lv}>{lbl}</MD_Chip>
          </div>);
        })}
      </div>}

      {/* 빠른 액션 */}
      <div className="md-card">
        <div className="md-card-title" style={{ marginBottom: 10 }}>빠른 액션</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {isManager && <button onClick={() => onPageChange && onPageChange("chat")} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(107,138,255,0.2)", background: "linear-gradient(180deg, rgba(107,138,255,0.1), rgba(107,138,255,0.02))", color: "#6b8aff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔔 경보 발령</button>}
          <button onClick={() => onPageChange && onPageChange("heatmap")} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🗺️ 지도 상황</button>
          <button onClick={() => onPageChange && onPageChange("congestion")} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🚦 혼잡도</button>
          <button onClick={() => onPageChange && onPageChange("counter")} style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>👥 인파계수</button>
        </div>
      </div>
    </div>
  </>);
}

// ─── Mobile 새 하단 네비게이션 ─────────────────────────────────────
function MobileNewBottomNav({ active, onChange, alertCount, onMore }) {
  const items = [
    { id: "dashboard", emoji: "🏠", label: "홈" },
    { id: "counter", emoji: "📡", label: "모니터" },
    { id: "heatmap", emoji: "🗺️", label: "지도" },
    { id: "chat", emoji: "🔔", label: "알림", badge: alertCount > 0 ? alertCount : null },
    { id: "_more", emoji: "⋯", label: "더보기" },
  ];
  return (<div className="md-bottom-nav">
    {items.map(it => (<div key={it.id} className={`md-nav-item ${active === it.id ? "active" : ""}`} onClick={() => it.id === "_more" ? onMore && onMore() : onChange && onChange(it.id)}>
      <div className="md-nav-icon">
        {it.emoji}
        {it.badge && <span className="md-nav-badge">{it.badge > 9 ? "9+" : it.badge}</span>}
      </div>
      <span className="md-nav-label">{it.label}</span>
    </div>))}
  </div>);
}

const CC_Chip = ({ level, children, pulse }) => (<span className={`cc-chip ${level || "blue"}`}><span className={`cc-dot ${pulse ? "pulse" : ""}`} />{children}</span>);
const CC_Btn = ({ children, variant = "", size = "", onClick, style }) => (<button className={`cc-btn ${variant} ${size}`} onClick={onClick} style={style}>{children}</button>);
const CC_Card = ({ children, title, sub, action, tinted, style }) => (<div className={`cc-card ${tinted ? "tinted" : ""}`} style={style}>{(title || action) && <div className="cc-card-h"><div>{title && <div className="cc-card-title">{title}</div>}{sub && <div className="cc-card-sub">{sub}</div>}</div>{action}</div>}{children}</div>);

const CC_Metric = ({ cat, onClick }) => {
  const lv = getLevel(cat);
  const lvLower = CC_LEVEL_MAP[lv];
  const isDanger = lv === "ORANGE";
  const isRed = lv === "RED";
  const isAlert = lv === "YELLOW";
  const lvColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv];
  
  const history = (cat.history || []).slice(-24);
  const forecast = (cat.forecast || []).slice(0, 6);
  const nextFc = forecast[0];
  const sparkData = history.length > 2 ? history.map(h => h.value || 0) : [];
  let sparkPath = "";
  if (sparkData.length > 1) {
    const min = Math.min(...sparkData); const max = Math.max(...sparkData); const rng = max - min || 1;
    sparkPath = sparkData.map((v, i) => {
      const x = (i / (sparkData.length - 1)) * 100;
      const y = 28 - ((v - min) / rng) * 22;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  }
  
  return (<div className={`cc-metric ${isAlert ? "alert" : ""} ${isDanger ? "danger" : ""} ${isRed ? "red-alert" : ""}`} onClick={onClick}>
    <div className="cc-metric-h">
      <span className="cc-metric-name"><span className="cc-metric-icon">{cat.icon || "📊"}</span>{cat.name}</span>
      <CC_Chip level={lvLower}>{CC_LEVEL_LABEL[lv]}</CC_Chip>
    </div>
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
      <div className="cc-metric-val">{(cat.currentValue || 0).toLocaleString()}<span className="cc-metric-unit">{cat.unit}</span></div>
      {nextFc && <div style={{ textAlign: "right", lineHeight: 1.2 }}>
        <div style={{ fontSize: 9, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>예보</div>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: nextFc.value > cat.currentValue ? "#ff5e7e" : nextFc.value < cat.currentValue ? "#6b8aff" : "#6c6e7d" }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}</span>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#b0b3c4", fontFamily: "JetBrains Mono, monospace" }}>{nextFc.value}</span>
        </div>
      </div>}
    </div>
    {sparkPath && <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 28, marginBottom: 4, display: "block" }}>
      <defs>
        <linearGradient id={`cc-grad-${cat.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={lvColor} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={lvColor} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${sparkPath} L 100 30 L 0 30 Z`} fill={`url(#cc-grad-${cat.id})`} stroke="none"/>
      <path d={sparkPath} fill="none" stroke={lvColor} strokeWidth="1.4"/>
    </svg>}
    {forecast.length > 1 && <div style={{ display: "flex", gap: 2, height: 14, alignItems: "flex-end", marginBottom: 4 }}>
      {forecast.slice(0, 6).map((f, i) => {
        const vals = forecast.slice(0, 6).map(x => x.value);
        const mn = Math.min(...vals); const mx = Math.max(...vals); const rng = mx - mn || 1;
        const h = 3 + ((f.value - mn) / rng) * 11;
        return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex: 1, height: h, borderRadius: 1.5, background: lvColor, opacity: 0.2 + (i === 0 ? 0.5 : 0.08 * (6 - i)) }} />;
      })}
    </div>}
    <div className="cc-metric-trend">임계: {cat.thresholds?.yellow || "-"} / {cat.thresholds?.orange || "-"} {cat.unit}</div>
  </div>);
};

const CC_Sidebar = ({ active, alerts, settings, onNav, onLogout, festivalName }) => {
  return (<div className="cc-sidebar"><CC_SidebarContent active={active} alerts={alerts} settings={settings} onNav={onNav} onLogout={onLogout} festivalName={festivalName} /></div>);
};

const CC_SidebarContent = ({ active, alerts, settings, onNav, onLogout, festivalName }) => {
  const items = [
    { id: "dashboard", name: "대시보드", emoji: "🏠" },
    { id: "monitor", name: "실시간 모니터링", emoji: "📡" },
    { id: "alert", name: "알림 / 경보", emoji: "🔔", badge: (alerts || []).length || null },
    { id: "incident", name: "사건 / 신고", emoji: "📁" },
    { id: "map", name: "지도 상황도", emoji: "🗺️" },
  ];
  const operationsItems = [
    { id: "festival", name: "축제 관리", emoji: "🎪" },
    { id: "program", name: "프로그램 관리", emoji: "🎭" },
    { id: "stage", name: "공연 관리", emoji: "🎤" },
    { id: "workforce", name: "인력 관리", emoji: "👷" },
  ];
  const adminItems = [
    { id: "resource", name: "물자 관리", emoji: "📦" },
    { id: "report", name: "리포트", emoji: "📊" },
    { id: "user", name: "사용자 관리", emoji: "👥" },
    { id: "settings", name: "설정", emoji: "⚙️" },
  ];
  return (<>
    <div className="cc-sb-section">메인</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map(it => (<div key={it.id} className={`cc-sb-item ${active === it.id ? "active" : ""}`} onClick={() => onNav(it.id)}>
        <span style={{ fontSize: 16 }}>{it.emoji}</span><span>{it.name}</span>{it.badge && <span className="cc-badge">{it.badge}</span>}
      </div>))}
    </div>
    <div className="cc-sb-section" style={{ marginTop: 14 }}>운영</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {operationsItems.map(it => (<div key={it.id} className={`cc-sb-item ${active === it.id ? "active" : ""}`} onClick={() => onNav(it.id)}>
        <span style={{ fontSize: 16 }}>{it.emoji}</span><span>{it.name}</span>
      </div>))}
    </div>
    <div className="cc-sb-section" style={{ marginTop: 14 }}>관리</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {adminItems.map(it => (<div key={it.id} className={`cc-sb-item ${active === it.id ? "active" : ""}`} onClick={() => onNav(it.id)}>
        <span style={{ fontSize: 16 }}>{it.emoji}</span><span>{it.name}</span>
      </div>))}
    </div>
    <div style={{ marginTop: 16, padding: 14, background: "linear-gradient(180deg, rgba(107,138,255,0.08), rgba(107,138,255,0.02))", borderRadius: 12, border: "1px solid rgba(107,138,255,0.18)" }}>
      <div style={{ fontSize: 10, color: "#6c6e7d", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>현재 운영중</div>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{festivalName || "축제 미설정"}</div>
      <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 4, fontFamily: "JetBrains Mono" }}>{new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={onLogout} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,94,126,0.2)", background: "rgba(255,94,126,0.05)", color: "#ff5e7e", fontSize: 12, cursor: "pointer" }}>🚪 로그아웃</button>
    </div>
  </>);
};

// ─── ErrorBoundary - PC 관제센터 에러 시 모바일 모드로 fallback ─────
class CCErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("[CCErrorBoundary] PC 관제센터 에러:", error);
    console.error("[CCErrorBoundary] Info:", info);
  }
  render() {
    if (this.state.hasError) {
      return (<div style={{ minHeight: "100vh", background: "#0a0d1a", color: "#fff", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: "Pretendard" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️⚠️</div>
        <h2 style={{ color: "#FF5E7E", marginBottom: 12 }}>PC 관제센터 화면 오류</h2>
        <p style={{ color: "#94A3B8", maxWidth: 500, marginBottom: 20 }}>새로 추가된 PC 관제센터 디자인에 일시적 오류가 발생했습니다.<br/>모바일 화면으로 전환하면 모든 기능을 사용하실 수 있습니다.</p>
        <pre style={{ background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", padding: 12, borderRadius: 8, fontSize: 11, maxWidth: 600, overflow: "auto", textAlign: "left", color: "#FF8A95", marginBottom: 20 }}>{String(this.state.error?.message || this.state.error)}</pre>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { localStorage.setItem("_force_mobile", "1"); location.reload(); }} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "#42A5F5", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📱 모바일 화면으로 전환</button>
          <button onClick={() => location.reload()} style={{ padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>🔄 새로고침</button>
        </div>
      </div>);
    }
    return this.props.children;
  }
}

// ─── 모바일 관제센터 CSS (하단 네비 + 세로 카드) ─────────────────────
const MCC_STYLES = `
  .mcc-root { font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif; background: #07070d; color: #f4f5fa; min-height: 100vh; padding: 0 0 calc(env(safe-area-inset-bottom) + 80px); -webkit-font-smoothing: antialiased; }
  .mcc-root .mono { font-family: 'JetBrains Mono', monospace; }

  /* 상단바 */
  .mcc-topbar { padding: calc(env(safe-area-inset-top) + 12px) 16px 12px; background: linear-gradient(180deg, #0e0f17 0%, rgba(14,15,23,0.85) 100%); position: sticky; top: 0; z-index: 50; backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 12px; }
  .mcc-brand-logo { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #6b8aff 0%, #a980ff 50%, #ff5e7e 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(107,138,255,0.4); color: #fff; font-weight: 800; font-size: 14px; flex-shrink: 0; }
  .mcc-brand-info { flex: 1; min-width: 0; }
  .mcc-brand-name { font-size: 14px; font-weight: 700; color: #f4f5fa; letter-spacing: -0.01em; }
  .mcc-brand-sub { font-size: 11px; color: #6c6e7d; margin-top: 1px; display: flex; align-items: center; gap: 6px; }
  .mcc-live-dot { width: 6px; height: 6px; border-radius: 50%; background: #4cd99a; box-shadow: 0 0 6px #4cd99a; animation: cc-livepulse 2s ease-in-out infinite; }
  .mcc-icon-btn { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; color: #b0b3c4; font-size: 16px; cursor: pointer; flex-shrink: 0; position: relative; }

  /* 페이지 헤더 */
  .mcc-page-header { padding: 14px 16px 8px; }
  .mcc-page-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #f4f5fa; }
  .mcc-page-sub { font-size: 12px; color: #6c6e7d; margin-top: 4px; }

  /* 종합 위험도 hero */
  .mcc-hero { margin: 4px 16px 14px; padding: 18px 20px; border-radius: 18px; background: linear-gradient(135deg, rgba(107,138,255,0.12), rgba(169,128,255,0.04)); border: 1px solid rgba(107,138,255,0.2); }
  .mcc-hero-label { font-size: 11px; color: #b0b3c4; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600; }
  .mcc-hero-status { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; color: #f4f5fa; line-height: 1.2; }
  .mcc-hero-time { font-size: 11px; color: #6c6e7d; margin-top: 8px; font-family: 'JetBrains Mono', monospace; }

  /* 카드 */
  .mcc-card { margin: 0 16px 12px; padding: 16px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; box-shadow: 0 8px 24px -12px rgba(0,0,0,0.5); }
  .mcc-card-h { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
  .mcc-card-title { font-size: 14px; font-weight: 700; color: #f4f5fa; letter-spacing: -0.01em; }
  .mcc-card-sub { font-size: 11px; color: #6c6e7d; margin-top: 2px; }

  /* 메트릭 그리드 (2열) */
  .mcc-metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 16px 12px; }
  .mcc-metric { padding: 14px; background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; box-shadow: 0 4px 12px -6px rgba(0,0,0,0.4); transition: transform 0.15s; cursor: pointer; }
  .mcc-metric:active { transform: scale(0.97); }
  .mcc-metric.alert { border-color: rgba(245,196,81,0.3); background: linear-gradient(180deg, rgba(245,196,81,0.08), rgba(245,196,81,0.02)), #0e0f17; }
  .mcc-metric.danger { border-color: rgba(255,154,60,0.4); background: linear-gradient(180deg, rgba(255,154,60,0.1), rgba(255,154,60,0.02)), #0e0f17; }
  .mcc-metric.red-alert { border-color: rgba(255,94,126,0.4); background: linear-gradient(180deg, rgba(255,94,126,0.1), rgba(255,94,126,0.02)), #0e0f17; }
  .mcc-metric-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .mcc-metric-name { font-size: 10px; color: #6c6e7d; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .mcc-metric-icon { width: 22px; height: 22px; border-radius: 6px; background: #1d1f2c; display: flex; align-items: center; justify-content: center; font-size: 11px; }
  .mcc-metric.alert .mcc-metric-icon { background: rgba(245,196,81,0.15); }
  .mcc-metric.danger .mcc-metric-icon { background: rgba(255,154,60,0.18); }
  .mcc-metric.red-alert .mcc-metric-icon { background: rgba(255,94,126,0.18); }
  .mcc-metric-val { font-size: 22px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; font-family: 'JetBrains Mono', monospace; color: #f4f5fa; }
  .mcc-metric.danger .mcc-metric-val { color: #ff9a3c; }
  .mcc-metric.red-alert .mcc-metric-val { color: #ff5e7e; }
  .mcc-metric-unit { font-size: 11px; color: #6c6e7d; margin-left: 4px; font-weight: 400; font-family: inherit; }
  .mcc-metric-trend { font-size: 10px; color: #6c6e7d; margin-top: 4px; }

  /* 하단 네비 */
  .mcc-bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; padding: 8px 0 calc(env(safe-area-inset-bottom) + 8px); background: rgba(7,7,13,0.92); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-around; z-index: 100; }
  .mcc-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 10px; cursor: pointer; color: #6c6e7d; min-width: 56px; transition: color 0.15s; }
  .mcc-nav-item.active { color: #6b8aff; }
  .mcc-nav-item.active .mcc-nav-icon { transform: translateY(-2px); }
  .mcc-nav-icon { font-size: 22px; transition: transform 0.15s; position: relative; }
  .mcc-nav-label { font-size: 10px; font-weight: 600; }
  .mcc-nav-badge { position: absolute; top: -4px; right: -8px; min-width: 16px; height: 16px; border-radius: 8px; background: #ff5e7e; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; box-shadow: 0 0 8px rgba(255,94,126,0.5); }

  /* 더보기 시트 */
  .mcc-sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 200; animation: cc-fade-in 0.2s ease; }
  .mcc-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, #14151f 0%, #0e0f17 100%); border-radius: 20px 20px 0 0; padding: 12px 16px calc(env(safe-area-inset-bottom) + 24px); border-top: 1px solid rgba(255,255,255,0.08); z-index: 201; animation: mcc-sheet-up 0.25s cubic-bezier(0.4, 0, 0.2, 1); max-height: 80vh; overflow-y: auto; }
  @keyframes mcc-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .mcc-sheet-handle { width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 16px; }
  .mcc-sheet-title { font-size: 16px; font-weight: 700; color: #f4f5fa; margin-bottom: 14px; }
  .mcc-sheet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mcc-sheet-item { padding: 14px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; color: #b0b3c4; transition: all 0.15s; }
  .mcc-sheet-item:active { background: rgba(107,138,255,0.1); border-color: rgba(107,138,255,0.3); }
  .mcc-sheet-item-icon { font-size: 22px; }
  .mcc-sheet-item-label { font-size: 12px; font-weight: 600; text-align: center; }
  .mcc-sheet-item-badge { position: absolute; top: 8px; right: 8px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #ff5e7e; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

  /* 칩 */
  .mcc-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1; }
  .mcc-chip .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
  .mcc-chip.blue { background: rgba(76,217,154,0.12); color: #4cd99a; }
  .mcc-chip.yellow { background: rgba(245,196,81,0.14); color: #f5c451; }
  .mcc-chip.orange { background: rgba(255,154,60,0.16); color: #ff9a3c; }
  .mcc-chip.red { background: rgba(255,94,126,0.16); color: #ff5e7e; }
  .mcc-chip.green { background: rgba(76,217,154,0.12); color: #4cd99a; }
  .mcc-chip .dot.pulse { animation: cc-pulse 1.6s ease-in-out infinite; }

  /* 리스트 */
  .mcc-list-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .mcc-list-row:last-child { border-bottom: 0; }
  .mcc-list-row:active { background: rgba(255,255,255,0.02); }

  /* 알림 배너 */
  .mcc-banner { margin: 12px 16px; padding: 16px; border-radius: 16px; }
  .mcc-banner.orange { background: linear-gradient(180deg, rgba(255,154,60,0.18), rgba(255,154,60,0.04)); border: 1px solid rgba(255,154,60,0.3); }
  .mcc-banner.yellow { background: linear-gradient(180deg, rgba(245,196,81,0.15), rgba(245,196,81,0.03)); border: 1px solid rgba(245,196,81,0.25); }
  .mcc-banner.red { background: linear-gradient(180deg, rgba(255,94,126,0.18), rgba(255,94,126,0.04)); border: 1px solid rgba(255,94,126,0.3); }

  /* 빠른 액션 */
  .mcc-quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mcc-quick-btn { padding: 14px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: #b0b3c4; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .mcc-quick-btn.primary { background: linear-gradient(180deg, rgba(107,138,255,0.12), rgba(107,138,255,0.03)); border-color: rgba(107,138,255,0.25); color: #8fa6ff; }

  /* 인풋 */
  .mcc-input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: #0e0f17; color: #f4f5fa; font-size: 16px; font-family: inherit; box-sizing: border-box; }
  .mcc-textarea { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: #0e0f17; color: #f4f5fa; font-size: 14px; font-family: inherit; box-sizing: border-box; resize: vertical; }

  /* 버튼 */
  .mcc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 11px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)); color: #f4f5fa; font-size: 13px; font-weight: 600; cursor: pointer; }
  .mcc-btn.primary { background: linear-gradient(180deg, #7c98ff, #5a7aff); border-color: rgba(255,255,255,0.18); color: #fff; }
  .mcc-btn.danger { background: linear-gradient(180deg, #ff738e, #ff4f72); border-color: rgba(255,255,255,0.15); color: #fff; }
  .mcc-btn.lg { padding: 14px 20px; font-size: 14px; }
  .mcc-btn.full { width: 100%; }

  /* 단계 진행바 */
  .mcc-step-bar { display: flex; gap: 4px; padding: 12px 16px; }
  .mcc-step { flex: 1; padding: 8px 4px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); color: #6c6e7d; font-size: 10px; font-weight: 600; text-align: center; }
  .mcc-step.active { background: rgba(107,138,255,0.15); border-color: rgba(107,138,255,0.4); color: #8fa6ff; }
  .mcc-step.done { background: rgba(76,217,154,0.08); border-color: rgba(76,217,154,0.25); color: #4cd99a; }

  /* 통계 4-카드 (모바일은 2열) */
  .mcc-stats-4 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 16px 12px; }
  .mcc-stat { padding: 14px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
  .mcc-stat-name { font-size: 10px; color: #6c6e7d; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .mcc-stat-val { font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
`;

// ─── 모바일 관제센터 (B안: 하단네비 + 세로카드) ─────────────────────
function MobileControlCenter({ session, accounts, setAccounts, settings, setSettings, categories, setCategories, alerts, setAlerts, smsLog, setSmsLog, onLogout, onMobileSwitch, setActiveAlert, onAction }) {
  const [page, setPage] = useState("dashboard");
  const [showMore, setShowMore] = useState(false);

  const overall = useMemo(() => {
    // 🚫 temp/humidity는 종합 위험도 계산에서 제외
    const lvs = (categories || []).filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id)).map(c => getLevel(c));
    if (lvs.includes("RED")) return "RED";
    if (lvs.includes("ORANGE")) return "ORANGE";
    if (lvs.includes("YELLOW")) return "YELLOW";
    return "BLUE";
  }, [categories]);
  const overallColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[overall];
  const overallLabel = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[overall];

  const sortedCats = [...(categories || [])].sort((a, b) => {
    const ord = { RED: 0, ORANGE: 1, YELLOW: 2, BLUE: 3 };
    return ord[getLevel(a)] - ord[getLevel(b)];
  });
  const topAlert = alerts && alerts[0];
  const unreadAlerts = (alerts || []).filter(a => a.level === "ORANGE" || a.level === "RED").length;
  const incidents = settings.incidents || [];
  const openIncidents = incidents.filter(i => i.status !== "closed").length;

  // 페이지별 타이틀
  const titles = {
    dashboard: { title: "대시보드", sub: "실시간 모니터링" },
    monitor: { title: "실시간 모니터링", sub: "환경 카테고리 상세" },
    alert: { title: "알림 / 경보", sub: "단계별 메시지 발송" },
    incident: { title: "사건 / 신고", sub: "현장 신고 접수 및 추적" },
    map: { title: "지도 상황도", sub: "구역・핀・히트맵" },
    resource: { title: "물자 관리", sub: "자산 및 인력" },
    report: { title: "리포트", sub: "일일 종합" },
    user: { title: "사용자 관리", sub: "계정 목록" },
    settings: { title: "설정", sub: "축제 정보" },
  };
  const curTitle = titles[page] || titles.dashboard;

  return (<>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>{MCC_STYLES}</style>
    <div className="mcc-root">
      {/* 상단바 */}
      <div className="mcc-topbar">
        <div className="mcc-brand-logo">S</div>
        <div className="mcc-brand-info">
          <div className="mcc-brand-name">SAFEFLOW</div>
          <div className="mcc-brand-sub">
            <span className="mcc-live-dot"/>
            <span>{session?.name}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{settings?.festivalName || "축제"}</span>
          </div>
        </div>
        <button className="mcc-icon-btn" onClick={onMobileSwitch} title="모바일 보기">📱</button>
      </div>

      {/* 페이지별 컨텐츠 */}
      {page === "dashboard" && <MCC_Dashboard session={session} settings={settings} categories={sortedCats} alerts={alerts} overall={overall} overallColor={overallColor} overallLabel={overallLabel} topAlert={topAlert} setPage={setPage} setActiveAlert={setActiveAlert} onAction={onAction} />}
      {page === "monitor" && <MCC_Monitor categories={categories} />}
      {page === "alert" && <MCC_Alert settings={settings} setSettings={setSettings} alerts={alerts} setAlerts={setAlerts} smsLog={smsLog} setSmsLog={setSmsLog} session={session} />}
      {page === "incident" && <MCC_Incident settings={settings} setSettings={setSettings} session={session} />}
      {page === "map" && <MCC_Map settings={settings} session={session} />}
      {page === "resource" && <CC_ResourcePage settings={settings} setSettings={setSettings} session={session} accounts={accounts} />}
      {page === "report" && <CC_ReportPage settings={settings} alerts={alerts} categories={categories} session={session} />}
      {page === "user" && <CC_UserPage settings={settings} setSettings={setSettings} accounts={accounts} session={session} onMobileSwitch={onMobileSwitch} />}
      {page === "settings" && <CC_SettingsPage settings={settings} setSettings={setSettings} session={session} onMobileSwitch={onMobileSwitch} />}
      {page === "festival" && <FestivalStatusPage settings={settings} setSettings={setSettings} session={session} accounts={accounts} setAccounts={setAccounts} />}
      {page === "program" && <ProgramPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "stage" && <StageMgmtPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "workforce" && <WorkersPage settings={settings} setSettings={setSettings} session={session} accounts={accounts} setAccounts={setAccounts} />}

      {/* 하단 네비 (5탭) */}
      <div className="mcc-bottom-nav">
        {[
          { id: "dashboard", icon: "🏠", label: "홈" },
          { id: "monitor", icon: "📡", label: "모니터" },
          { id: "alert", icon: "🔔", label: "경보", badge: unreadAlerts > 0 ? unreadAlerts : null },
          { id: "incident", icon: "📁", label: "사건", badge: openIncidents > 0 ? openIncidents : null },
          { id: "_more", icon: "⋯", label: "더보기" },
        ].map(it => (<div key={it.id} className={`mcc-nav-item ${page === it.id ? "active" : ""}`} onClick={() => it.id === "_more" ? setShowMore(true) : setPage(it.id)}>
          <div className="mcc-nav-icon">
            {it.icon}
            {it.badge && <span className="mcc-nav-badge">{it.badge > 9 ? "9+" : it.badge}</span>}
          </div>
          <span className="mcc-nav-label">{it.label}</span>
        </div>))}
      </div>

      {/* 더보기 시트 */}
      {showMore && <>
        <div className="mcc-sheet-overlay" onClick={() => setShowMore(false)} />
        <div className="mcc-sheet">
          <div className="mcc-sheet-handle" />
          <div className="mcc-sheet-title">더보기</div>
          <div className="mcc-sheet-grid">
            {[
              { id: "festival", icon: "🎪", label: "축제 관리" },
              { id: "program", icon: "🎭", label: "프로그램" },
              { id: "stage", icon: "🎤", label: "공연 관리" },
              { id: "workforce", icon: "👷", label: "인력 관리" },
              { id: "map", icon: "🗺️", label: "지도 상황도" },
              { id: "resource", icon: "📦", label: "물자 관리" },
              { id: "report", icon: "📊", label: "리포트" },
              { id: "user", icon: "👥", label: "사용자 관리" },
              { id: "settings", icon: "⚙️", label: "설정" },
            ].map(it => (<div key={it.id} className="mcc-sheet-item" onClick={() => { setPage(it.id); setShowMore(false); }}>
              <div className="mcc-sheet-item-icon">{it.icon}</div>
              <div className="mcc-sheet-item-label">{it.label}</div>
            </div>))}
            <div className="mcc-sheet-item" onClick={onLogout} style={{ color: "#ff5e7e", borderColor: "rgba(255,94,126,0.2)" }}>
              <div className="mcc-sheet-item-icon">🚪</div>
              <div className="mcc-sheet-item-label">로그아웃</div>
            </div>
          </div>
        </div>
      </>}
    </div>
  </>);
}

// ─── 모바일 대시보드 ───────────────────────────────────────────
function MCC_Dashboard({ session, settings, categories, alerts, overall, overallColor, overallLabel, topAlert, setPage, setActiveAlert, onAction }) {
  const incidents = settings.incidents || [];
  return (<>
    {/* 종합 위험도 hero */}
    <div className="mcc-hero">
      <div className="mcc-hero-label">현재 종합 위험도</div>
      <div className="mcc-hero-status">지금 <span style={{ color: overallColor }}>{overallLabel}</span> 단계예요</div>
      <div className="mcc-hero-time">{new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
    </div>

    {/* 최우선 알림 배너 */}
    {topAlert && <div className={`mcc-banner ${CC_LEVEL_MAP[topAlert.level]}`}>
      <span className={`mcc-chip ${CC_LEVEL_MAP[topAlert.level]}`}><span className="dot pulse" />● {topAlert.level} · {CC_LEVEL_LABEL[topAlert.level]}</span>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: "#f4f5fa" }}>{topAlert.category}</div>
      <div style={{ fontSize: 12, color: "#b0b3c4", marginTop: 4, lineHeight: 1.4 }}>{(topAlert.message || "").split("\n")[2] || "임계값 도달 - 확인 필요"}</div>
      <button className="mcc-btn primary full" style={{ marginTop: 10 }} onClick={() => {
        // 1) 해당 카테고리 찾기 → 모달 열기 + handling 시작
        const cat = (categories || []).find(c => c.name === topAlert.category);
        if (cat) {
          if (cat.actionStatus !== "handling" && onAction) onAction(cat.id, "handling");
          if (setActiveAlert) setActiveAlert(cat);
        } else {
          // 카테고리를 못 찾으면 알림 모달
          if (setActiveAlert) setActiveAlert(topAlert);
        }
      }}>대응 시작 →</button>
    </div>}

    {/* 메트릭 그리드 */}
    <div className="mcc-metric-grid">
      {categories.map(cat => {
        const lv = getLevel(cat);
        const cls = lv === "YELLOW" ? "alert" : lv === "ORANGE" ? "danger" : lv === "RED" ? "red-alert" : "";
        const lvColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv];
        const history = (cat.history || []).slice(-24);
        const forecast = (cat.forecast || []).slice(0, 6);
        const nextFc = forecast[0];
        const sparkData = history.length > 2 ? history.map(h => h.value || 0) : [];
        let sparkPath = "";
        if (sparkData.length > 1) {
          const min = Math.min(...sparkData); const max = Math.max(...sparkData); const rng = max - min || 1;
          sparkPath = sparkData.map((v, i) => {
            const x = (i / (sparkData.length - 1)) * 100;
            const y = 24 - ((v - min) / rng) * 20;
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          }).join(" ");
        }
        return (<div key={cat.id} className={`mcc-metric ${cls}`} onClick={() => setPage("monitor")}>
          <div className="mcc-metric-h">
            <span className="mcc-metric-name"><span className="mcc-metric-icon">{cat.icon || "📊"}</span>{cat.name}</span>
            <span className={`mcc-chip ${CC_LEVEL_MAP[lv]}`}><span className="dot" />{CC_LEVEL_LABEL[lv]}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div className="mcc-metric-val">{(cat.currentValue || 0).toLocaleString()}<span className="mcc-metric-unit">{cat.unit}</span></div>
            {nextFc && <div style={{ textAlign: "right", lineHeight: 1.2 }}>
              <div style={{ fontSize: 9, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>예보</div>
              <div style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginTop: 2 }}>
                <span style={{ fontSize: 11, color: nextFc.value > cat.currentValue ? "#ff5e7e" : nextFc.value < cat.currentValue ? "#6b8aff" : "#6c6e7d" }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#b0b3c4", fontFamily: "JetBrains Mono, monospace" }}>{nextFc.value}</span>
              </div>
            </div>}
          </div>
          {sparkPath && <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: "100%", height: 22, marginBottom: 4, display: "block" }}>
            <defs>
              <linearGradient id={`mcc-grad-${cat.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={lvColor} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={lvColor} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={`${sparkPath} L 100 26 L 0 26 Z`} fill={`url(#mcc-grad-${cat.id})`} stroke="none"/>
            <path d={sparkPath} fill="none" stroke={lvColor} strokeWidth="1.2"/>
          </svg>}
          {forecast.length > 1 && <div style={{ display: "flex", gap: 2, height: 12, alignItems: "flex-end", marginBottom: 4 }}>
            {forecast.slice(0, 6).map((f, i) => {
              const vals = forecast.slice(0, 6).map(x => x.value);
              const mn = Math.min(...vals); const mx = Math.max(...vals); const rng = mx - mn || 1;
              const h = 2 + ((f.value - mn) / rng) * 10;
              return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex: 1, height: h, borderRadius: 1.5, background: lvColor, opacity: 0.2 + (i === 0 ? 0.5 : 0.08 * (6 - i)) }} />;
            })}
          </div>}
          <div className="mcc-metric-trend">임계: {cat.thresholds?.yellow || "-"} / {cat.thresholds?.orange || "-"}</div>
        </div>);
      })}
    </div>

    {/* 활성 경보 */}
    <div className="mcc-card">
      <div className="mcc-card-h">
        <div>
          <div className="mcc-card-title">활성 경보 {(alerts || []).length}건</div>
          <div className="mcc-card-sub">실시간 갱신</div>
        </div>
        {(alerts || []).length > 0 && <button className="mcc-btn" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setPage("alert")}>전체 →</button>}
      </div>
      {(alerts || []).slice(0, 4).map((a, i) => (<div key={i} className="mcc-list-row" onClick={() => {
        const cat = (categories || []).find(c => c.name === a.category);
        if (cat && setActiveAlert) setActiveAlert(cat);
        else if (setActiveAlert) setActiveAlert(a);
      }} style={{ cursor: "pointer" }}>
        <span className={`mcc-chip ${CC_LEVEL_MAP[a.level]}`}><span className={`dot ${a.level === "ORANGE" || a.level === "RED" ? "pulse" : ""}`} />●</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.category}</div>
          <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>{(a.message || "").split("\n")[2] || "임계값 도달"}</div>
        </div>
        <span className="mono" style={{ fontSize: 11, color: "#6c6e7d" }}>{a.time?.split(" ")[1] || a.time}</span>
      </div>))}
      {(!alerts || alerts.length === 0) && <div style={{ padding: 16, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>현재 활성 경보 없음 ✓</div>}
    </div>

    {/* 구역별 혼잡도 */}
    {(settings.zones || []).length > 0 && <div className="mcc-card">
      <div className="mcc-card-h">
        <div>
          <div className="mcc-card-title">구역별 혼잡도</div>
          <div className="mcc-card-sub">{(settings.zones || []).length}개 구역</div>
        </div>
      </div>
      {(settings.zones || []).slice(0, 5).map(z => {
        const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id);
        const cl = c?.level || "smooth";
        const lv = cl === "danger" ? "red" : cl === "crowded" ? "yellow" : "green";
        const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활";
        return (<div key={z.id} className="mcc-list-row">
          <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1 }}>📍 {z.name}</span>
          <span className={`mcc-chip ${lv}`}>{lbl}</span>
        </div>);
      })}
    </div>}

    {/* 빠른 액션 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>빠른 액션</div>
      <div className="mcc-quick-grid">
        <button className="mcc-quick-btn primary" onClick={() => setPage("alert")}>🔔 경보 발령</button>
        <button className="mcc-quick-btn" onClick={() => setPage("incident")}>📁 사건 등록</button>
        <button className="mcc-quick-btn" onClick={() => setPage("map")}>🗺️ 지도 상황</button>
        <button className="mcc-quick-btn" onClick={() => setPage("monitor")}>📡 모니터링</button>
      </div>
    </div>
  </>);
}

// ─── 모바일 모니터링 ───────────────────────────────────────────
function MCC_Monitor({ categories }) {
  const [selId, setSelId] = useState(categories?.[0]?.id);
  const cat = (categories || []).find(c => c.id === selId) || categories?.[0];
  if (!cat) return <div className="mcc-page-header"><div className="mcc-page-title">실시간 모니터링</div><div className="mcc-page-sub">데이터가 없습니다</div></div>;
  const lv = getLevel(cat);
  const lvColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv];
  const history = (cat.history || []).slice(-24);
  const trendPoints = history.length > 5 ? history.map((h, i) => ({ x: i * (100 / Math.max(1, history.length - 1)), y: h.value || 0 })) : [];
  const minV = Math.min(...trendPoints.map(p => p.y), cat.currentValue || 0);
  const maxV = Math.max(...trendPoints.map(p => p.y), cat.currentValue || 0);
  const range = maxV - minV || 1;
  const pathD = trendPoints.length > 0 ? trendPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${36 - ((p.y - minV) / range) * 30}`).join(" ") : "";

  return (<>
    <div className="mcc-page-header">
      <div className="mcc-page-title">실시간 모니터링</div>
      <div className="mcc-page-sub">환경 카테고리 상세</div>
    </div>

    {/* 카테고리 칩 가로 스크롤 */}
    <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      {(categories || []).map(c => {
        const cv = getLevel(c);
        const cvColor = { BLUE: "#6b8aff", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[cv];
        return (<button key={c.id} onClick={() => setSelId(c.id)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 999, border: selId === c.id ? `1.5px solid ${cvColor}` : "1px solid rgba(255,255,255,0.1)", background: selId === c.id ? `${cvColor}20` : "rgba(255,255,255,0.03)", color: selId === c.id ? cvColor : "#b0b3c4", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {c.icon || "📊"} {c.name}
        </button>);
      })}
    </div>

    {/* 큰 수치 카드 */}
    <div className="mcc-card">
      <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>현재 수치</div>
      <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, fontFamily: "JetBrains Mono", color: lvColor, letterSpacing: "-0.03em" }}>{(cat.currentValue || 0).toLocaleString()}</div>
      <div style={{ fontSize: 14, color: "#6c6e7d", marginTop: 4 }}>{cat.unit}</div>
      <div style={{ marginTop: 14, display: "flex", gap: 6, alignItems: "center" }}>
        <span className={`mcc-chip ${CC_LEVEL_MAP[lv]}`}><span className={`dot ${lv !== "BLUE" ? "pulse" : ""}`} />{CC_LEVEL_LABEL[lv]}</span>
        <span style={{ fontSize: 11, color: "#6c6e7d" }}>{new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>

    {/* 24h 차트 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>24시간 추이</div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: "100%", height: 100 }}>
        <defs>
          <linearGradient id={`mcc-grad-${cat.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lvColor} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={lvColor} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {pathD && <>
          <path d={`${pathD} L 100 36 L 0 36 Z`} fill={`url(#mcc-grad-${cat.id})`} stroke="none"/>
          <path d={pathD} fill="none" stroke={lvColor} strokeWidth="1.5"/>
        </>}
        {!pathD && <text x="50" y="20" textAnchor="middle" fill="#6c6e7d" fontSize="3">데이터 부족</text>}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6c6e7d", marginTop: 6, fontFamily: "JetBrains Mono" }}>
        <span>min {minV.toFixed(1)}</span>
        <span>max {maxV.toFixed(1)}</span>
      </div>
    </div>

    {/* 임계값 표 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>임계값</div>
      {[{ k: "yellow", lbl: "주의 (YELLOW)", c: "#f5c451" }, { k: "orange", lbl: "경계 (ORANGE)", c: "#ff9a3c" }, { k: "red", lbl: "심각 (RED)", c: "#ff5e7e" }].map(t => (<div key={t.k} className="mcc-list-row">
        <span style={{ width: 8, height: 8, borderRadius: 4, background: t.c }} />
        <span style={{ flex: 1, color: "#b0b3c4", fontSize: 13 }}>{t.lbl}</span>
        <span className="mono" style={{ color: t.c, fontWeight: 700, fontSize: 14 }}>{cat.thresholds?.[t.k] || "-"} {cat.unit}</span>
      </div>))}
    </div>

    {/* 체크리스트 */}
    {(cat.actionItems || []).length > 0 && <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>대응 체크리스트</div>
      {cat.actionItems.map((item, i) => (<div key={i} className="mcc-list-row" style={{ alignItems: "flex-start" }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0, marginTop: 2 }} />
        <span style={{ color: "#b0b3c4", fontSize: 13, lineHeight: 1.5 }}>{item}</span>
      </div>))}
    </div>}
  </>);
}

// ─── 모바일 알림/경보 발령 (5단계) ───────────────────────────────
function MCC_Alert({ settings, setSettings, alerts, setAlerts, smsLog, setSmsLog, session }) {
  const [step, setStep] = useState(1);
  const [level, setLevel] = useState("YELLOW");
  const [msg, setMsg] = useState("");
  const [channels, setChannels] = useState({ sms: true, app: true, sound: false });
  const [targets, setTargets] = useState("all");

  const targetCount = targets === "managers" ? (settings.smsManagers || []).length : targets === "staff" ? (settings.smsStaff || []).length : (settings.smsManagers || []).length + (settings.smsStaff || []).length;
  const lvLabel = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[level];

  const issueAlert = async () => {
    if (!msg.trim()) { alert("메시지를 입력하세요."); return; }
    if (!confirm(`${lvLabel} 단계 경보를 ${targetCount}명에게 발송합니다.\n발송 후 취소가 불가능합니다.\n진행하시겠습니까?`)) return;
    const time = new Date().toLocaleString("ko-KR");
    const newAlert = { category: "수동 발령", level, message: `[${settings.festivalName || "축제"} ${lvLabel}경보]\n\n${msg}\n\n발신: ${session?.name || "관리자"}\n시간: ${time}`, time };
    if (setAlerts) setAlerts(p => [newAlert, ...p].slice(0, 100));
    if (channels.sms) {
      try {
        const contacts = targets === "managers" ? settings.smsManagers : targets === "staff" ? settings.smsStaff : [...(settings.smsManagers || []), ...(settings.smsStaff || [])];
        const r = await sendSolapi(settings, newAlert.message, contacts);
        if (setSmsLog) setSmsLog(p => [{ time, level, message: msg, sentTo: contacts.length, success: r.ok ? r.success : 0, fail: r.ok ? r.fail : contacts.length }, ...p].slice(0, 100));
      } catch {}
    }
    alert(`✅ 경보 발령 완료\n수신자: ${targetCount}명`);
    setStep(1); setMsg(""); setLevel("YELLOW");
  };

  return (<>
    <div className="mcc-page-header">
      <div className="mcc-page-title">알림 / 경보 발령</div>
      <div className="mcc-page-sub">단계별 메시지 발송</div>
    </div>

    {/* 진행 단계 */}
    <div className="mcc-step-bar">
      {[1, 2, 3, 4, 5].map(s => (<div key={s} className={`mcc-step ${step === s ? "active" : ""} ${step > s ? "done" : ""}`} onClick={() => s < step && setStep(s)}>
        {step > s ? "✓" : s}
      </div>))}
    </div>

    {step === 1 && <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 12 }}>① 경보 단계 선택</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {["BLUE", "YELLOW", "ORANGE", "RED"].map(l => {
          const c = { BLUE: "#6b8aff", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[l];
          const lbl = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[l];
          return (<div key={l} onClick={() => setLevel(l)} style={{ padding: 16, borderRadius: 12, background: level === l ? `${c}20` : "rgba(255,255,255,0.02)", border: `2px solid ${level === l ? c : "rgba(255,255,255,0.06)"}`, cursor: "pointer", textAlign: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: c, margin: "0 auto 6px", boxShadow: `0 0 12px ${c}80` }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: level === l ? c : "#f4f5fa" }}>{l}</div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>{lbl}</div>
          </div>);
        })}
      </div>
      <button className="mcc-btn primary full lg" style={{ marginTop: 14 }} onClick={() => setStep(2)}>다음 →</button>
    </div>}

    {step === 2 && <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 8 }}>② 메시지 작성</div>
      <div className="mcc-card-sub" style={{ marginBottom: 12 }}>{lvLabel} 단계로 발송됩니다</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {[`${settings.festivalName || "축제"} 안전관리상황실`, "구역 통제 강화", "안전한 곳으로 이동", "상황 종료"].map((t, i) => (<button key={i} onClick={() => setMsg(m => m + (m ? "\n" : "") + t)} style={{ padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 11, cursor: "pointer" }}>+ {t.slice(0, 14)}{t.length > 14 ? "..." : ""}</button>))}
      </div>
      <textarea className="mcc-textarea" value={msg} onChange={e => setMsg(e.target.value)} placeholder="알림 메시지..." rows={5} />
      <div style={{ marginTop: 6, fontSize: 11, color: "#6c6e7d", textAlign: "right" }}>{msg.length}자</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="mcc-btn" onClick={() => setStep(1)}>← 이전</button>
        <button className="mcc-btn primary" style={{ flex: 1 }} onClick={() => msg.trim() && setStep(3)}>다음 →</button>
      </div>
    </div>}

    {step === 3 && <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 12 }}>③ 발송 채널</div>
      {[{ k: "sms", n: "SMS 문자", icon: "📱" }, { k: "app", n: "앱 푸시", icon: "🔔" }, { k: "sound", n: "방송 알림음", icon: "📢" }].map(c => (<div key={c.k} onClick={() => setChannels(p => ({ ...p, [c.k]: !p[c.k] }))} style={{ padding: 14, marginBottom: 8, borderRadius: 12, background: channels[c.k] ? "rgba(107,138,255,0.1)" : "rgba(255,255,255,0.02)", border: channels[c.k] ? "2px solid #6b8aff" : "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>{c.icon}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#f4f5fa" }}>{c.n}</span>
        {channels[c.k] && <span style={{ color: "#6b8aff", fontSize: 16 }}>✓</span>}
      </div>))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="mcc-btn" onClick={() => setStep(2)}>← 이전</button>
        <button className="mcc-btn primary" style={{ flex: 1 }} onClick={() => setStep(4)}>다음 →</button>
      </div>
    </div>}

    {step === 4 && <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 8 }}>④ 발송 대상</div>
      <div className="mcc-card-sub" style={{ marginBottom: 12 }}>{targetCount}명에게 발송</div>
      {[{ k: "all", n: "전체", count: (settings.smsManagers || []).length + (settings.smsStaff || []).length }, { k: "managers", n: "관리자만", count: (settings.smsManagers || []).length }, { k: "staff", n: "안전요원만", count: (settings.smsStaff || []).length }].map(t => (<div key={t.k} onClick={() => setTargets(t.k)} style={{ padding: 14, marginBottom: 8, borderRadius: 12, background: targets === t.k ? "rgba(107,138,255,0.1)" : "rgba(255,255,255,0.02)", border: targets === t.k ? "1.5px solid #6b8aff" : "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, border: targets === t.k ? "5px solid #6b8aff" : "2px solid rgba(255,255,255,0.2)" }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#f4f5fa" }}>{t.n}</span>
        <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: targets === t.k ? "#6b8aff" : "#b0b3c4" }}>{t.count}<span style={{ fontSize: 11, marginLeft: 2, color: "#6c6e7d" }}>명</span></span>
      </div>))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="mcc-btn" onClick={() => setStep(3)}>← 이전</button>
        <button className="mcc-btn primary" style={{ flex: 1 }} onClick={() => setStep(5)}>다음 →</button>
      </div>
    </div>}

    {step === 5 && <div className="mcc-card" style={{ borderColor: "rgba(255,94,126,0.3)" }}>
      <div className="mcc-card-title" style={{ marginBottom: 12 }}>⑤ 발령 확인</div>
      <div style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 12 }}>
        <span className={`mcc-chip ${CC_LEVEL_MAP[level]}`}><span className="dot pulse" />● {level} · {lvLabel}</span>
        <div style={{ fontSize: 13, color: "#f4f5fa", lineHeight: 1.5, whiteSpace: "pre-wrap", marginTop: 8 }}>{msg}</div>
      </div>
      <div style={{ fontSize: 12, color: "#6c6e7d", lineHeight: 1.6, marginBottom: 12 }}>
        📡 채널: {Object.keys(channels).filter(k => channels[k]).map(k => ({ sms: "SMS", app: "앱", sound: "방송" }[k])).join(" · ")}<br/>
        👥 대상: {targetCount}명 ({targets === "all" ? "전체" : targets === "managers" ? "관리자" : "안전요원"})
      </div>
      <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,94,126,0.08)", border: "1px solid rgba(255,94,126,0.2)", color: "#ff5e7e", fontSize: 11, marginBottom: 12 }}>
        ⚠️ 발송 후 취소 불가
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="mcc-btn" onClick={() => setStep(4)}>← 이전</button>
        <button className="mcc-btn danger lg" style={{ flex: 1 }} onClick={issueAlert}>🚨 발령 실행</button>
      </div>
    </div>}

    {/* 최근 이력 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>최근 발령 이력 ({(smsLog || []).length}건)</div>
      {(smsLog || []).slice(0, 4).map((s, i) => (<div key={i} className="mcc-list-row">
        <span className={`mcc-chip ${CC_LEVEL_MAP[s.level || "BLUE"]}`}>{s.level || "정보"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#f4f5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.message}</div>
          <div style={{ fontSize: 10, color: "#6c6e7d", marginTop: 2 }}>{s.time} · {s.sentTo || 0}건</div>
        </div>
      </div>))}
      {(!smsLog || smsLog.length === 0) && <div style={{ padding: 16, textAlign: "center", color: "#6c6e7d", fontSize: 12 }}>발령 이력 없음</div>}
    </div>
  </>);
}

// ─── 모바일 사건/신고 ───────────────────────────────────────
function MCC_Incident({ settings, setSettings, session }) {
  const incidents = settings.incidents || [];
  const today = new Date().toDateString();
  const todayIncidents = incidents.filter(i => new Date(i.ts).toDateString() === today);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");
  const [newInc, setNewInc] = useState({ type: "", location: "", desc: "", priority: "low" });
  const types = ["응급환자", "분실아동", "폭력/싸움", "시설고장", "민원/항의", "교통사고", "기타"];

  const submit = () => {
    if (!newInc.type || !newInc.location) { alert("종류와 위치를 입력하세요."); return; }
    const inc = { id: "inc_" + Date.now(), ...newInc, ts: Date.now(), status: "open", reporter: session?.name || "?", time: new Date().toLocaleString("ko-KR") };
    setSettings(p => ({ ...p, incidents: [inc, ...(p.incidents || [])] }));
    setNewInc({ type: "", location: "", desc: "", priority: "low" });
    setShowAdd(false);
  };
  const updateStatus = (id, status) => setSettings(p => ({ ...p, incidents: (p.incidents || []).map(i => i.id === id ? { ...i, status } : i) }));
  const remove = (id) => { if (confirm("삭제하시겠습니까?")) setSettings(p => ({ ...p, incidents: (p.incidents || []).filter(i => i.id !== id) })); };
  const filtered = filter === "all" ? incidents : filter === "today" ? todayIncidents : incidents.filter(i => i.status === filter);

  return (<>
    <div className="mcc-page-header">
      <div className="mcc-page-title">사건 / 신고</div>
      <div className="mcc-page-sub">현장 신고 접수 · 추적</div>
    </div>

    {/* 통계 4-카드 */}
    <div className="mcc-stats-4">
      {[{ k: "today", n: "오늘", c: todayIncidents.length, color: "#6b8aff" }, { k: "open", n: "처리중", c: incidents.filter(i => i.status === "open").length, color: "#ff9a3c" }, { k: "in_progress", n: "조치중", c: incidents.filter(i => i.status === "in_progress").length, color: "#f5c451" }, { k: "closed", n: "완료", c: incidents.filter(i => i.status === "closed").length, color: "#4cd99a" }].map(s => (<div key={s.k} className="mcc-stat" onClick={() => setFilter(s.k)} style={{ cursor: "pointer", border: filter === s.k ? `1.5px solid ${s.color}40` : undefined, background: filter === s.k ? `${s.color}15` : undefined }}>
        <div className="mcc-stat-name">{s.n}</div>
        <div className="mcc-stat-val" style={{ color: s.color }}>{s.c}</div>
      </div>))}
    </div>

    {/* 신규 등록 / 필터 */}
    <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
      <button className="mcc-btn" style={{ flex: 1 }} onClick={() => setFilter("all")}>전체 보기</button>
      <button className="mcc-btn primary" style={{ flex: 1 }} onClick={() => setShowAdd(!showAdd)}>+ 신규 등록</button>
    </div>

    {showAdd && <div className="mcc-card" style={{ borderColor: "rgba(107,138,255,0.3)" }}>
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>새 사건 등록</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>종류</div>
        <select className="mcc-input" value={newInc.type} onChange={e => setNewInc({ ...newInc, type: e.target.value })}>
          <option value="">선택...</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>위치</div>
        <input className="mcc-input" value={newInc.location} onChange={e => setNewInc({ ...newInc, location: e.target.value })} placeholder="A구역 / 정문 등" />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>긴급도</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
          {[{ k: "low", n: "낮음", c: "#4cd99a" }, { k: "mid", n: "보통", c: "#f5c451" }, { k: "high", n: "긴급", c: "#ff9a3c" }, { k: "critical", n: "치명", c: "#ff5e7e" }].map(p => (<button key={p.k} onClick={() => setNewInc({ ...newInc, priority: p.k })} style={{ padding: "8px", borderRadius: 8, border: newInc.priority === p.k ? `1.5px solid ${p.c}` : "1px solid rgba(255,255,255,0.1)", background: newInc.priority === p.k ? `${p.c}15` : "rgba(255,255,255,0.02)", color: newInc.priority === p.k ? p.c : "#b0b3c4", fontSize: 11, fontWeight: 600 }}>{p.n}</button>))}
        </div>
      </div>
      <textarea className="mcc-textarea" value={newInc.desc} onChange={e => setNewInc({ ...newInc, desc: e.target.value })} placeholder="상세 내용 (선택)" rows={2} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="mcc-btn" onClick={() => setShowAdd(false)}>취소</button>
        <button className="mcc-btn primary" style={{ flex: 1 }} onClick={submit}>등록</button>
      </div>
    </div>}

    {/* 사건 카드 리스트 */}
    {filtered.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>사건이 없습니다</div> :
      filtered.map(i => {
        const sLabel = i.status === "open" ? "처리중" : i.status === "in_progress" ? "조치중" : "완료";
        const pColor = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
        const pLabel = { critical: "치명", high: "긴급", mid: "보통", low: "낮음" }[i.priority];
        return (<div key={i.id} className="mcc-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span className={`mcc-chip ${i.status === "open" ? "orange" : i.status === "in_progress" ? "yellow" : "green"}`}><span className="dot" />{sLabel}</span>
            <span style={{ color: pColor, fontSize: 12, fontWeight: 700 }}>● {pLabel}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f4f5fa", marginBottom: 4 }}>{i.type}</div>
          <div style={{ fontSize: 13, color: "#b0b3c4", marginBottom: 8 }}>📍 {i.location}</div>
          {i.desc && <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5, marginBottom: 8, padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>{i.desc}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#6c6e7d", marginBottom: 10 }}>
            <span>👤 {i.reporter}</span>
            <span className="mono">{i.time?.split(" ")[1] || i.time}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {i.status !== "closed" && <button className="mcc-btn" style={{ flex: 1, fontSize: 12 }} onClick={() => updateStatus(i.id, i.status === "open" ? "in_progress" : "closed")}>{i.status === "open" ? "조치 시작" : "✓ 완료 처리"}</button>}
            <button className="mcc-btn" style={{ color: "#ff5e7e" }} onClick={() => remove(i.id)}>🗑</button>
          </div>
        </div>);
      })
    }
  </>);
}

// ─── 모바일 지도 상황도 ─────────────────────────────────────
function MCC_Map({ settings, session }) {
  const fid = session?.festivalId || "default";
  const [mapImage] = usePersist(`${fid}_map_img_v1`, null);
  const [mapAreas] = usePersist(`${fid}_map_areas_v1`, []);
  const zones = settings.zones || [];
  const congestion = settings.zoneCongestion || [];
  const incidents = settings.incidents || [];

  const getAreaColor = (zoneId) => {
    const c = congestion.find(cc => cc.zoneId === zoneId);
    if (!c) return "#6b8aff";
    return c.level === "danger" ? "#ff5e7e" : c.level === "crowded" ? "#f5c451" : "#4cd99a";
  };

  return (<>
    <div className="mcc-page-header">
      <div className="mcc-page-title">지도 상황도</div>
      <div className="mcc-page-sub">{zones.length}개 구역 · {incidents.filter(i => i.status !== "closed").length}건 진행</div>
    </div>

    <div className="mcc-card" style={{ padding: 0, overflow: "hidden" }}>
      {!mapImage ? <div style={{ aspectRatio: "16/10", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#6c6e7d", gap: 10, padding: 20 }}>
        <span style={{ fontSize: 48 }}>🗺️</span>
        <span style={{ fontSize: 13 }}>도면이 등록되지 않았습니다</span>
        <span style={{ fontSize: 11, textAlign: "center" }}>모바일 보기 → 🗺️ 히트맵에서 업로드하세요</span>
      </div> :
        <div style={{ position: "relative", width: "100%" }}>
          <img src={mapImage} alt="map" style={{ width: "100%", display: "block" }} />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {mapAreas.map(a => {
              const z = zones.find(zz => zz.id === a.zoneId);
              const color = getAreaColor(a.zoneId);
              const points = (a.points || []).map(p => `${p.x},${p.y}`).join(" ");
              return (<g key={a.id}>
                <polygon points={points} fill={color} fillOpacity={0.3} stroke={color} strokeWidth="0.3" />
                {z && (a.points || []).length > 0 && (() => { const cx = a.points.reduce((s, p) => s + p.x, 0) / a.points.length; const cy = a.points.reduce((s, p) => s + p.y, 0) / a.points.length; return <text x={cx} y={cy} textAnchor="middle" fill="#fff" fontSize="2.5" fontWeight="700" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: "0.5" }}>{z.name}</text>; })()}
              </g>);
            })}
          </svg>
          {incidents.filter(i => i.status !== "closed").map((i, idx) => {
            const x = 10 + (idx % 6) * 14; const y = 15 + Math.floor(idx / 6) * 18;
            const c = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
            return (<div key={i.id} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 14, height: 14, borderRadius: 7, background: c, boxShadow: `0 0 10px ${c}, 0 0 0 2px rgba(0,0,0,0.4)`, animation: "cc-pulse 2s ease-in-out infinite", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", fontWeight: 700 }}>!</div>);
          })}
        </div>
      }
    </div>

    {/* 구역 상태 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>구역 상태</div>
      {zones.map(z => {
        const c = congestion.find(cc => cc.zoneId === z.id);
        const cl = c?.level || "smooth";
        const lv = cl === "danger" ? "red" : cl === "crowded" ? "yellow" : "green";
        const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활";
        return (<div key={z.id} className="mcc-list-row">
          <span style={{ flex: 1, fontSize: 13, color: "#f4f5fa" }}>📍 {z.name}</span>
          <span className={`mcc-chip ${lv}`}>{lbl}</span>
        </div>);
      })}
      {zones.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#6c6e7d", fontSize: 12 }}>구역 미등록</div>}
    </div>

    {/* 활성 사건 */}
    <div className="mcc-card">
      <div className="mcc-card-title" style={{ marginBottom: 10 }}>활성 사건 ({incidents.filter(i => i.status !== "closed").length}건)</div>
      {incidents.filter(i => i.status !== "closed").slice(0, 5).map(i => {
        const c = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
        return (<div key={i.id} className="mcc-list-row">
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f5fa" }}>{i.type}</div>
            <div style={{ fontSize: 11, color: "#6c6e7d" }}>{i.location}</div>
          </div>
        </div>);
      })}
      {incidents.filter(i => i.status !== "closed").length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#6c6e7d", fontSize: 12 }}>활성 사건 없음 ✓</div>}
    </div>
  </>);
}

// ─── PC 관제센터 운영 페이지 (정보-밀집형) ─────────────────────

// 1) 축제 관리 - 종합 현황
function CC_FestivalPage({ settings, setSettings, accounts, setAccounts, session, categories, alerts, setCcPage }) {
  const allWorkers = (settings.workSites || []).flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name, zoneId: s.zoneId })));
  const onDuty = allWorkers.filter(w => w.onDuty).length;
  const totalMeals = allWorkers.reduce((s, w) => s + (w.meals || 0), 0);
  const allRadios = (settings.assets || []).flatMap(a => a.units || []);
  const radiosUsed = allRadios.filter(u => u.assignedTo).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const todayPgs = (settings.programs || []).filter(p => p.date === "always" || p.date === todayStr);
  const activePgs = todayPgs.filter(p => {
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
    return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
  });
  const upcomingPgs = todayPgs.filter(p => {
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    return sh*60+sm > nowMin;
  }).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const openIncidents = (settings.incidents || []).filter(i => i.status !== "closed");
  const startD = settings.startDate ? new Date(settings.startDate) : null;
  const endD = settings.endDate ? new Date(settings.endDate) : null;
  const today = new Date();
  let dayStatus = "준비중", dayInfo = "";
  if (startD && endD) {
    const ds = today < startD ? Math.ceil((startD - today) / 86400000) : 0;
    const de = today > endD ? -1 : Math.ceil((endD - today) / 86400000);
    const totalDays = Math.ceil((endD - startD) / 86400000) + 1;
    const dayN = Math.floor((today - startD) / 86400000) + 1;
    if (today < startD) { dayStatus = `D-${ds}`; dayInfo = "개막 준비"; }
    else if (today > endD) { dayStatus = "종료"; dayInfo = `${totalDays}일간 운영 완료`; }
    else { dayStatus = `D+${dayN-1}`; dayInfo = `${dayN}/${totalDays}일차`; }
  }

  return (<div>
    {/* KPI 8개 라인 */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "축제 일정", value: dayStatus, sub: dayInfo, color: "#6b8aff", icon: "📅" },
        { label: "구역", value: (settings.zones || []).length, sub: "운영중", color: "#a980ff", icon: "📍" },
        { label: "근무지", value: (settings.workSites || []).filter(s => s.id !== "_pool").length, sub: "배치된", color: "#42A5F5", icon: "🏠" },
        { label: "총 인력", value: allWorkers.length, sub: `근무 ${onDuty}`, color: "#4cd99a", icon: "👥" },
        { label: "프로그램", value: todayPgs.length, sub: `진행 ${activePgs.length}`, color: "#FF7043", icon: "🎭" },
        { label: "활성 경보", value: (alerts || []).length, sub: `심각 ${(alerts||[]).filter(a=>a.level==="RED").length}`, color: (alerts||[]).length>0?"#ff5e7e":"#4cd99a", icon: "🔔" },
        { label: "사건 처리", value: openIncidents.length, sub: "진행중", color: openIncidents.length>0?"#ff9a3c":"#4cd99a", icon: "📁" },
        { label: "무전기", value: `${radiosUsed}/${allRadios.length}`, sub: "사용중", color: "#f5c451", icon: "📻" },
      ].map(k => (<div key={k.label} style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{k.icon}</span><span style={{ fontSize: 10, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span></div>
        <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", lineHeight: 1, letterSpacing: "-0.02em" }}>{k.value}</div>
        <div style={{ fontSize: 10, color: "#6c6e7d", marginTop: 4 }}>{k.sub}</div>
      </div>))}
    </div>

    {/* 축제 정보 + 운영 시간 + 빠른 액션 */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
      <CC_Card title="축제 정보" sub="기본 설정">
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "10px 12px", fontSize: 13 }}>
          <span style={{ color: "#6c6e7d" }}>축제명</span>
          <span style={{ color: "#f4f5fa", fontWeight: 600 }}>{settings.festivalName || "-"}</span>
          <span style={{ color: "#6c6e7d" }}>장소</span>
          <span style={{ color: "#f4f5fa" }}>{settings.location?.name || "-"}</span>
          <span style={{ color: "#6c6e7d" }}>좌표</span>
          <span style={{ color: "#f4f5fa", fontFamily: "JetBrains Mono", fontSize: 11 }}>{settings.location?.lat ? `${settings.location.lat.toFixed(4)}, ${settings.location.lon.toFixed(4)}` : "-"}</span>
          <span style={{ color: "#6c6e7d" }}>면적</span>
          <span style={{ color: "#f4f5fa", fontFamily: "JetBrains Mono" }}>{(settings.venueArea || 0).toLocaleString()} ㎡</span>
          <span style={{ color: "#6c6e7d" }}>시작</span>
          <span style={{ color: "#f4f5fa", fontFamily: "JetBrains Mono" }}>{settings.startDate || "-"}</span>
          <span style={{ color: "#6c6e7d" }}>종료</span>
          <span style={{ color: "#f4f5fa", fontFamily: "JetBrains Mono" }}>{settings.endDate || "-"}</span>
          <span style={{ color: "#6c6e7d" }}>운영시간</span>
          <span style={{ color: "#f4f5fa", fontFamily: "JetBrains Mono" }}>{settings.operatingStart || "-"} ~ {settings.operatingEnd || "-"}</span>
        </div>
      </CC_Card>

      <CC_Card title="구역 / 근무지" sub={`${(settings.zones || []).length}개 구역, ${(settings.workSites || []).filter(s=>s.id!=="_pool").length}개 근무지`}>
        {(settings.zones || []).slice(0, 6).map(z => {
          const sites = (settings.workSites || []).filter(s => s.zoneId === z.id);
          const wkrs = sites.reduce((n, s) => n + (s.workers || []).length, 0);
          const cong = (settings.zoneCongestion || []).find(c => c.zoneId === z.id);
          const lv = cong?.level === "danger" ? "red" : cong?.level === "crowded" ? "yellow" : "green";
          const lbl = cong?.level === "danger" ? "위험" : cong?.level === "crowded" ? "혼잡" : "원활";
          return (<div key={z.id} className="cc-list-row" style={{ padding: "8px 0" }}>
            <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {z.name}</span>
            <span className="mono" style={{ fontSize: 11, color: "#6c6e7d" }}>{sites.length} 지점</span>
            <span className="mono" style={{ fontSize: 11, color: "#6b8aff" }}>{wkrs}명</span>
            <CC_Chip level={lv}>{lbl}</CC_Chip>
          </div>);
        })}
      </CC_Card>

      <CC_Card title="현재 상황" sub="실시간">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activePgs.length > 0 && <div style={{ padding: 10, borderRadius: 8, background: "rgba(76,217,154,0.08)", border: "1px solid rgba(76,217,154,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "#4cd99a", animation: "blink 1.5s infinite" }} />
              <span style={{ fontSize: 11, color: "#4cd99a", fontWeight: 700 }}>● 진행중 {activePgs.length}개</span>
            </div>
            {activePgs.slice(0, 2).map(p => (<div key={p.id} style={{ fontSize: 12, color: "#f4f5fa", marginTop: 4 }}>· {p.title}</div>))}
          </div>}
          {upcomingPgs.length > 0 && <div style={{ padding: 10, borderRadius: 8, background: "rgba(107,138,255,0.08)", border: "1px solid rgba(107,138,255,0.2)" }}>
            <div style={{ fontSize: 11, color: "#6b8aff", fontWeight: 700, marginBottom: 4 }}>다음 예정</div>
            {upcomingPgs.slice(0, 2).map(p => (<div key={p.id} style={{ fontSize: 12, color: "#f4f5fa", marginTop: 4, display: "flex", gap: 8 }}>
              <span className="mono" style={{ color: "#6b8aff" }}>{p.time}</span>
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
            </div>))}
          </div>}
          {openIncidents.length > 0 && <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,154,60,0.08)", border: "1px solid rgba(255,154,60,0.2)" }}>
            <div style={{ fontSize: 11, color: "#ff9a3c", fontWeight: 700, marginBottom: 4 }}>🚨 사건 처리중 {openIncidents.length}건</div>
            {openIncidents.slice(0, 2).map(i => (<div key={i.id} style={{ fontSize: 12, color: "#f4f5fa", marginTop: 4 }}>· {i.type} ({i.location})</div>))}
          </div>}
          <CC_Btn variant="primary" onClick={() => setCcPage("incident")}>🚨 사건 등록</CC_Btn>
        </div>
      </CC_Card>
    </div>

    {/* 안내: 상세 설정 */}
    <CC_Card title="설정 / 관리" sub="모바일 화면에서 더 자세히 설정 가능">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <CC_Btn variant="ghost" onClick={() => setCcPage("program")}>🎭 프로그램 설정 →</CC_Btn>
        <CC_Btn variant="ghost" onClick={() => setCcPage("stage")}>🎤 공연 설정 →</CC_Btn>
        <CC_Btn variant="ghost" onClick={() => setCcPage("workforce")}>👷 인력 관리 →</CC_Btn>
        <CC_Btn variant="ghost" onClick={() => setCcPage("settings")}>⚙️ 시스템 설정 →</CC_Btn>
      </div>
    </CC_Card>
  </div>);
}

// 2) 프로그램 관리 - 타임라인 + 일정표
function CC_ProgramPage({ settings, setSettings, session, setCcPage }) {
  const programs = settings.programs || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const [filterDate, setFilterDate] = useState("today");
  const [filterCategory, setFilterCategory] = useState("all");

  const dates = [...new Set(programs.map(p => p.date).filter(d => d && d !== "always"))].sort();
  const categoryList = [...new Set(programs.map(p => p.category).filter(Boolean))];

  let filtered = programs;
  if (filterDate === "today") filtered = filtered.filter(p => p.date === "always" || p.date === todayStr);
  else if (filterDate !== "all") filtered = filtered.filter(p => p.date === filterDate);
  if (filterCategory !== "all") filtered = filtered.filter(p => p.category === filterCategory);
  filtered = filtered.sort((a, b) => (a.date + " " + (a.time || "")).localeCompare(b.date + " " + (b.time || "")));

  // KPI
  const todayPgs = programs.filter(p => p.date === "always" || p.date === todayStr);
  const activePgs = todayPgs.filter(p => {
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
    return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
  });
  const upcomingPgs = todayPgs.filter(p => {
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    return sh*60+sm > nowMin;
  });
  const endedPgs = todayPgs.filter(p => {
    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
    return nowMin > eh*60+em || p.pgStatus === "ended";
  });

  return (<div>
    {/* KPI 5개 */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "전체 프로그램", value: programs.length, color: "#6b8aff", icon: "🎭" },
        { label: "오늘 일정", value: todayPgs.length, color: "#a980ff", icon: "📅" },
        { label: "진행중", value: activePgs.length, color: "#4cd99a", icon: "▶" },
        { label: "예정", value: upcomingPgs.length, color: "#f5c451", icon: "⏰" },
        { label: "종료", value: endedPgs.length, color: "#6c6e7d", icon: "✓" },
      ].map(k => (<div key={k.label} style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{k.icon}</span><span style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span></div>
        <div style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", lineHeight: 1 }}>{k.value}</div>
      </div>))}
    </div>

    {/* 필터 */}
    <CC_Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6c6e7d", fontWeight: 600 }}>날짜:</span>
        {[{ k: "today", l: "오늘" }, { k: "all", l: "전체" }, ...dates.map(d => ({ k: d, l: d.slice(5) }))].map(d => (
          <button key={d.k} onClick={() => setFilterDate(d.k)} style={{ padding: "6px 12px", borderRadius: 999, border: filterDate === d.k ? "1px solid #6b8aff" : "1px solid rgba(255,255,255,0.08)", background: filterDate === d.k ? "rgba(107,138,255,0.15)" : "rgba(255,255,255,0.02)", color: filterDate === d.k ? "#6b8aff" : "#b0b3c4", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{d.l}</button>
        ))}
        {categoryList.length > 0 && <>
          <span style={{ fontSize: 12, color: "#6c6e7d", fontWeight: 600, marginLeft: 12 }}>카테고리:</span>
          {[{ k: "all", l: "전체" }, ...categoryList.map(c => ({ k: c, l: c }))].map(c => (
            <button key={c.k} onClick={() => setFilterCategory(c.k)} style={{ padding: "6px 12px", borderRadius: 999, border: filterCategory === c.k ? "1px solid #a980ff" : "1px solid rgba(255,255,255,0.08)", background: filterCategory === c.k ? "rgba(169,128,255,0.15)" : "rgba(255,255,255,0.02)", color: filterCategory === c.k ? "#a980ff" : "#b0b3c4", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>{c.l}</button>
          ))}
        </>}
        <CC_Btn size="sm" variant="primary" style={{ marginLeft: "auto" }} onClick={() => setCcPage("settings")}>+ 새 프로그램</CC_Btn>
      </div>
    </CC_Card>

    {/* 메인: 타임라인 + 상세 (2 컬럼) */}
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginBottom: 16 }}>
      <CC_Card title="📅 프로그램 일정" sub={`${filtered.length}개 일정`}>
        <div style={{ maxHeight: 600, overflowY: "auto" }}>
          {filtered.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>해당 조건의 프로그램이 없습니다</div> : 
          filtered.map(p => {
            let status = "scheduled", color = "#6b8aff", label = "예정";
            if (p.pgStatus === "ended") { status = "ended"; color = "#6c6e7d"; label = "종료"; }
            else if (p.date === todayStr || p.date === "always") {
              const [sh, sm] = (p.time || "00:00").split(":").map(Number);
              const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
              if (nowMin >= sh*60+sm && nowMin <= eh*60+em) { status = "active"; color = "#4cd99a"; label = "진행중"; }
              else if (nowMin > eh*60+em) { status = "ended"; color = "#6c6e7d"; label = "종료"; }
            }
            return (<div key={p.id} style={{ padding: 12, marginBottom: 6, borderRadius: 10, background: status === "active" ? "rgba(76,217,154,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 13, color: color, fontWeight: 700, minWidth: 90 }}>{p.time}~{p.endTime}</span>
                <span style={{ padding: "2px 8px", borderRadius: 999, background: `${color}15`, color, fontSize: 10, fontWeight: 700 }}>{status === "active" ? "● " : ""}{label}</span>
                {p.category && <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(169,128,255,0.1)", color: "#a980ff", fontSize: 10, fontWeight: 600 }}>{p.category}</span>}
                {p.date && p.date !== "always" && <span style={{ fontSize: 11, color: "#6c6e7d", marginLeft: "auto", fontFamily: "JetBrains Mono" }}>{p.date}</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f4f5fa", marginBottom: 4 }}>{p.title}</div>
              {(p.location || p.zoneId) && <div style={{ fontSize: 12, color: "#6c6e7d", marginBottom: 4 }}>📍 {p.location || (settings.zones || []).find(z => z.id === p.zoneId)?.name}</div>}
              {p.description && <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5 }}>{p.description}</div>}
            </div>);
          })}
        </div>
      </CC_Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 카테고리별 통계 */}
        <CC_Card title="📊 카테고리별" sub="프로그램 분포">
          {categoryList.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>카테고리 미분류</div> :
          categoryList.map(c => {
            const cnt = programs.filter(p => p.category === c).length;
            const ratio = programs.length > 0 ? Math.round((cnt / programs.length) * 100) : 0;
            return (<div key={c} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#f4f5fa" }}>{c}</span>
                <span className="mono" style={{ fontSize: 12, color: "#a980ff" }}>{cnt}건 ({ratio}%)</span>
              </div>
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                <div style={{ width: `${ratio}%`, height: "100%", background: "#a980ff", borderRadius: 2 }} />
              </div>
            </div>);
          })}
        </CC_Card>

        {/* 시간대 분포 */}
        <CC_Card title="🕐 시간대별 일정" sub="오늘 기준">
          {(() => {
            const slots = ["09-12", "12-15", "15-18", "18-21", "21-24"];
            const counts = slots.map(s => {
              const [start, end] = s.split("-").map(Number);
              return todayPgs.filter(p => {
                const h = parseInt((p.time || "00:00").split(":")[0]);
                return h >= start && h < end;
              }).length;
            });
            const maxCnt = Math.max(...counts, 1);
            return slots.map((s, i) => (<div key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span className="mono" style={{ fontSize: 11, color: "#6c6e7d", minWidth: 50 }}>{s}시</span>
              <div style={{ flex: 1, height: 16, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <div style={{ width: `${(counts[i] / maxCnt) * 100}%`, height: "100%", background: "linear-gradient(90deg, #6b8aff, #a980ff)", borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  {counts[i] > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{counts[i]}</span>}
                </div>
              </div>
            </div>));
          })()}
        </CC_Card>
      </div>
    </div>
  </div>);
}

// 3) 공연 관리 - 무대/아티스트
function CC_StagePage({ settings, setSettings, session, setCcPage }) {
  const stages = settings.stages || [];
  const artists = settings.artists || [];
  const setlists = settings.setlists || [];
  const programs = settings.programs || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const stagePrograms = programs.filter(p => p.stageId);
  const todayStagePgs = stagePrograms.filter(p => p.date === "always" || p.date === todayStr);
  const activeStagePgs = todayStagePgs.filter(p => {
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
    return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
  });

  return (<div>
    {/* KPI */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "무대", value: stages.length, color: "#a980ff", icon: "🎤" },
        { label: "아티스트", value: artists.length, color: "#FF7043", icon: "🎙️" },
        { label: "셋리스트", value: setlists.length, color: "#42A5F5", icon: "🎵" },
        { label: "오늘 공연", value: todayStagePgs.length, color: "#a980ff", icon: "🎭" },
        { label: "진행중 공연", value: activeStagePgs.length, color: "#4cd99a", icon: "▶" },
      ].map(k => (<div key={k.label} style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{k.icon}</span><span style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span></div>
        <div style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", lineHeight: 1 }}>{k.value}</div>
      </div>))}
    </div>

    {/* 무대별 현황 + 아티스트 목록 */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <CC_Card title="🎤 무대별 운영 현황" sub={`${stages.length}개 무대`}>
        {stages.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>등록된 무대가 없습니다</div> :
        stages.map(s => {
          const sPgs = stagePrograms.filter(p => p.stageId === s.id);
          const sToday = sPgs.filter(p => p.date === "always" || p.date === todayStr);
          const sActive = sToday.find(p => {
            const [sh, sm] = (p.time || "00:00").split(":").map(Number);
            const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
            return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
          });
          return (<div key={s.id} style={{ padding: 14, marginBottom: 8, borderRadius: 10, background: sActive ? "rgba(76,217,154,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${sActive ? "rgba(76,217,154,0.25)" : "rgba(255,255,255,0.06)"}`, borderLeft: `3px solid ${sActive ? "#4cd99a" : "#6b8aff"}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f4f5fa" }}>🎤 {s.name}</span>
              {sActive ? <span style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(76,217,154,0.15)", color: "#4cd99a", fontSize: 11, fontWeight: 700 }}>● 공연중</span> : <span style={{ fontSize: 11, color: "#6c6e7d" }}>대기</span>}
            </div>
            {sActive && <div style={{ fontSize: 12, color: "#4cd99a", marginBottom: 6 }}>♪ {sActive.title} ({sActive.time}~{sActive.endTime})</div>}
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6c6e7d" }}>
              <span>오늘 {sToday.length}회</span>
              <span>전체 {sPgs.length}회</span>
              {s.capacity && <span>수용 {s.capacity}명</span>}
            </div>
          </div>);
        })}
      </CC_Card>

      <CC_Card title="🎙️ 아티스트 / 셋리스트" sub={`${artists.length}팀`}>
        {artists.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>등록된 아티스트가 없습니다</div> :
        artists.slice(0, 8).map(a => {
          const sl = setlists.find(s => s.artistId === a.id);
          return (<div key={a.id} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#f4f5fa", flex: 1 }}>{a.name}</span>
              {a.genre && <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(255,112,67,0.1)", color: "#FF7043", fontSize: 10, fontWeight: 600 }}>{a.genre}</span>}
              {sl && <span className="mono" style={{ fontSize: 11, color: "#42A5F5" }}>{(sl.songs || []).length}곡</span>}
            </div>
            {a.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{a.note}</div>}
          </div>);
        })}
      </CC_Card>
    </div>

    {/* 오늘의 공연 타임라인 */}
    <CC_Card title="🎵 오늘의 공연 타임라인" sub={`${todayStagePgs.length}개 공연`}>
      {todayStagePgs.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>오늘 예정된 공연이 없습니다</div> :
      todayStagePgs.sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(p => {
        const stage = stages.find(s => s.id === p.stageId);
        const artist = artists.find(a => a.id === p.artistId);
        let status = "scheduled", color = "#6b8aff", label = "예정";
        const [sh, sm] = (p.time || "00:00").split(":").map(Number);
        const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
        if (p.pgStatus === "ended") { status = "ended"; color = "#6c6e7d"; label = "종료"; }
        else if (nowMin >= sh*60+sm && nowMin <= eh*60+em) { status = "active"; color = "#4cd99a"; label = "공연중"; }
        else if (nowMin > eh*60+em) { status = "ended"; color = "#6c6e7d"; label = "종료"; }
        return (<div key={p.id} style={{ padding: 12, marginBottom: 6, borderRadius: 10, background: status === "active" ? "rgba(76,217,154,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr auto auto", gap: 12, alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 13, color, fontWeight: 700 }}>{p.time}~{p.endTime}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f4f5fa" }}>{p.title}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 11, color: "#6c6e7d" }}>
                {stage && <span>🎤 {stage.name}</span>}
                {artist && <span>🎙️ {artist.name}</span>}
              </div>
            </div>
            <span style={{ padding: "3px 10px", borderRadius: 999, background: `${color}15`, color, fontSize: 11, fontWeight: 700 }}>{status === "active" ? "● " : ""}{label}</span>
          </div>
        </div>);
      })}
    </CC_Card>
  </div>);
}

// 4) 인력 관리 - 근무자 종합
function CC_WorkforcePage({ settings, setSettings, session, accounts, setAccounts, setCcPage }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const allWorkers = (settings.workSites || []).flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name, siteId: s.id, zoneId: s.zoneId })));
  const onDuty = allWorkers.filter(w => w.onDuty);
  const totalMeals = allWorkers.reduce((s, w) => s + (w.meals || 0), 0);
  const allRadios = (settings.assets || []).find(a => a.id === "radio")?.units || [];
  const radiosUsed = allRadios.filter(u => u.assignedTo).length;
  const noAccount = allWorkers.filter(w => !w.accountId).length;

  // 역할별 분류
  const byRole = {};
  allWorkers.forEach(w => { const r = w.role || "기타"; if (!byRole[r]) byRole[r] = []; byRole[r].push(w); });

  // 필터링
  let filtered = allWorkers;
  if (filter === "onduty") filtered = filtered.filter(w => w.onDuty);
  else if (filter === "noacc") filtered = filtered.filter(w => !w.accountId);
  else if (filter === "noradio") filtered = filtered.filter(w => !(w.radios || []).length);
  else if (filter !== "all" && filter.startsWith("site:")) filtered = filtered.filter(w => w.siteId === filter.slice(5));
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(w => (w.name || "").toLowerCase().includes(q) || (w.phone || "").includes(q) || (w.role || "").includes(q));
  }

  const exportCSV = () => {
    const rows = [["이름", "연락처", "역할", "근무지", "식수", "메모", "근무상태"]];
    allWorkers.forEach(w => rows.push([w.name, w.phone || "", w.role || "", w.siteName, w.meals || 0, w.mealNote || "", w.onDuty ? "근무중" : "-"]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `근무자_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  return (<div>
    {/* KPI 6개 */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "총 인력", value: allWorkers.length, color: "#6b8aff", icon: "👥" },
        { label: "근무중", value: onDuty.length, sub: `${allWorkers.length > 0 ? Math.round(onDuty.length/allWorkers.length*100) : 0}%`, color: "#4cd99a", icon: "🟢" },
        { label: "근무지", value: (settings.workSites || []).filter(s=>s.id!=="_pool" && (s.workers||[]).length>0).length, color: "#a980ff", icon: "🏠" },
        { label: "무전기 분배", value: `${radiosUsed}/${allRadios.length}`, color: "#f5c451", icon: "📻" },
        { label: "총 식수", value: totalMeals, sub: "식", color: "#FF7043", icon: "🍱" },
        { label: "계정 미발급", value: noAccount, color: noAccount > 0 ? "#ff5e7e" : "#4cd99a", icon: "🔑" },
      ].map(k => (<div key={k.label} style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{k.icon}</span><span style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", lineHeight: 1 }}>{k.value}</span>
          {k.sub && <span style={{ fontSize: 11, color: "#6c6e7d" }}>{k.sub}</span>}
        </div>
      </div>))}
    </div>

    {/* 필터 + 검색 */}
    <CC_Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 이름·연락처·역할" style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 13 }} />
        {[
          { k: "all", l: `전체 (${allWorkers.length})` },
          { k: "onduty", l: `근무중 (${onDuty.length})` },
          { k: "noacc", l: `계정없음 (${noAccount})` },
          { k: "noradio", l: `무전기없음` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{ padding: "6px 12px", borderRadius: 999, border: filter === f.k ? "1px solid #6b8aff" : "1px solid rgba(255,255,255,0.08)", background: filter === f.k ? "rgba(107,138,255,0.15)" : "rgba(255,255,255,0.02)", color: filter === f.k ? "#6b8aff" : "#b0b3c4", fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>{f.l}</button>
        ))}
        <CC_Btn size="sm" variant="ghost" onClick={exportCSV}>📥 CSV</CC_Btn>
      </div>
    </CC_Card>

    {/* 메인: 좌측 인력 풀 + 우측 근무지 그리드 (드래그앤드롭) */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16, marginBottom: 16 }}>
      {/* 좌측: 인력 목록 (드래그 소스) */}
      <CC_Card title="👥 인력 목록" sub={`${filtered.length}명 · 드래그하여 근무지에 배치`}>
        <div style={{ maxHeight: 720, overflowY: "auto", paddingRight: 4 }}>
          {filtered.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>해당 인력이 없습니다</div> :
          filtered.map(w => (<div key={w.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", w.siteId); e.currentTarget.style.opacity = "0.4"; }}
            onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
            style={{ padding: 10, marginBottom: 4, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: 10, alignItems: "center", cursor: "grab", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(107,138,255,0.06)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
            <span style={{ fontSize: 13, color: "#6c6e7d", cursor: "grab" }} title="드래그하여 이동">⠿</span>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: w.onDuty ? "#4cd99a" : "#556" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f4f5fa" }}>{w.name}</span>
                {w.role && <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(0,150,136,0.1)", color: "#009688", fontSize: 10, fontWeight: 600 }}>{w.role}</span>}
                {w.accountId && <span style={{ fontSize: 10, color: "#42A5F5" }}>🔑</span>}
              </div>
              <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {w.siteName} {w.phone && `· ${w.phone}`}</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "#FF7043" }}>🍱 {w.meals || 0}</span>
            {(w.radios || []).length > 0 && <span className="mono" style={{ fontSize: 11, color: "#a980ff" }}>📻 {w.radios.length}</span>}
          </div>))}
        </div>
      </CC_Card>

      {/* 우측: 근무지 그리드 (드롭 영역) */}
      <CC_Card title="🏠 근무지별 배치" sub={`${(settings.workSites || []).filter(s=>s.id!=="_pool").length}개 근무지 · 여기에 드롭`}>
        <div style={{ maxHeight: 720, overflowY: "auto", paddingRight: 4 }}>
          {/* 미배치 풀 - 상단에 강조 */}
          {(() => {
            const pool = (settings.workSites || []).find(s => s.id === "_pool");
            const poolCount = (pool?.workers || []).length;
            return (<div
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(255,154,60,0.18)"; e.currentTarget.style.borderColor = "rgba(255,154,60,0.5)"; }}
              onDragLeave={e => { e.currentTarget.style.background = "rgba(255,154,60,0.06)"; e.currentTarget.style.borderColor = "rgba(255,154,60,0.2)"; }}
              onDrop={e => { 
                e.preventDefault(); 
                e.currentTarget.style.background = "rgba(255,154,60,0.06)"; 
                e.currentTarget.style.borderColor = "rgba(255,154,60,0.2)";
                const wid = e.dataTransfer.getData("workerId"); 
                const from = e.dataTransfer.getData("fromSite"); 
                if (!wid || from === "_pool") return;
                setSettings(prev => {
                  const ws = JSON.parse(JSON.stringify(prev.workSites || []));
                  const fi = ws.findIndex(s => s.id === from);
                  let pi = ws.findIndex(s => s.id === "_pool");
                  if (pi < 0) { ws.push({ id: "_pool", name: "미배치", zoneId: null, status: "standby", workers: [] }); pi = ws.length - 1; }
                  if (fi >= 0) {
                    const w = (ws[fi].workers || []).find(ww => ww.id === wid);
                    if (w) {
                      ws[fi] = { ...ws[fi], workers: ws[fi].workers.filter(ww => ww.id !== wid) };
                      ws[pi] = { ...ws[pi], workers: [...(ws[pi].workers || []), w] };
                    }
                  }
                  return { ...prev, workSites: ws };
                });
              }}
              style={{ padding: 12, marginBottom: 10, borderRadius: 10, background: "rgba(255,154,60,0.06)", border: "1.5px dashed rgba(255,154,60,0.2)", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: poolCount > 0 ? 8 : 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#ff9a3c" }}>⚠️ 미배치 풀</span>
                <span className="mono" style={{ fontSize: 12, color: "#ff9a3c", fontWeight: 700 }}>{poolCount}명</span>
              </div>
              {poolCount > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(pool.workers || []).slice(0, 12).map(w => (<span key={w.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", "_pool"); }}
                  style={{ padding: "3px 8px", borderRadius: 999, background: "rgba(255,154,60,0.12)", border: "1px solid rgba(255,154,60,0.25)", color: "#ff9a3c", fontSize: 11, fontWeight: 600, cursor: "grab" }}>{w.name}</span>))}
                {poolCount > 12 && <span style={{ padding: "3px 8px", color: "#6c6e7d", fontSize: 11 }}>+{poolCount - 12}</span>}
              </div>}
              {poolCount === 0 && <div style={{ fontSize: 11, color: "#6c6e7d", textAlign: "center", padding: "4px 0" }}>여기로 드래그하면 배치 해제됩니다</div>}
            </div>);
          })()}

          {/* 근무지 그리드 (2열) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(settings.workSites || []).filter(s => s.id !== "_pool").map(s => {
              const ws = s.workers || [];
              const onD = ws.filter(w => w.onDuty).length;
              const meals = ws.reduce((sum, w) => sum + (w.meals || 0), 0);
              const zone = (settings.zones || []).find(z => z.id === s.zoneId);
              return (<div key={s.id}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(76,217,154,0.1)"; e.currentTarget.style.borderColor = "rgba(76,217,154,0.5)"; }}
                onDragLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
                onDrop={e => { 
                  e.preventDefault(); 
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)"; 
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  const wid = e.dataTransfer.getData("workerId"); 
                  const from = e.dataTransfer.getData("fromSite"); 
                  if (!wid || from === s.id) return;
                  setSettings(prev => {
                    const wss = JSON.parse(JSON.stringify(prev.workSites || []));
                    const fi = wss.findIndex(x => x.id === from);
                    const ti = wss.findIndex(x => x.id === s.id);
                    if (fi >= 0 && ti >= 0) {
                      const w = (wss[fi].workers || []).find(ww => ww.id === wid);
                      if (w) {
                        wss[fi] = { ...wss[fi], workers: wss[fi].workers.filter(ww => ww.id !== wid) };
                        wss[ti] = { ...wss[ti], workers: [...(wss[ti].workers || []), w] };
                      }
                    }
                    return { ...prev, workSites: wss };
                  });
                }}
                style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1.5px dashed rgba(255,255,255,0.06)", minHeight: 100, transition: "all 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f4f5fa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🏠 {s.name}</span>
                  <span className="mono" style={{ fontSize: 12, color: "#6b8aff", fontWeight: 700, flexShrink: 0 }}>{onD}/{ws.length}</span>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 10, color: "#6c6e7d", marginBottom: 6 }}>
                  {zone && <span>📍 {zone.name}</span>}
                  {meals > 0 && <span>🍱 {meals}식</span>}
                </div>
                {ws.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#6c6e7d", textAlign: "center", padding: "12px 0", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: 6 }}>여기에 드래그</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {ws.map(w => (<span key={w.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", s.id); }}
                      title={`${w.name} ${w.role || ""} ${w.phone || ""} (드래그하여 이동)`}
                      style={{ padding: "3px 8px", borderRadius: 999, background: w.onDuty ? "rgba(76,217,154,0.12)" : "rgba(107,138,255,0.1)", border: `1px solid ${w.onDuty ? "rgba(76,217,154,0.3)" : "rgba(107,138,255,0.2)"}`, color: w.onDuty ? "#4cd99a" : "#8fa6ff", fontSize: 11, fontWeight: 600, cursor: "grab", whiteSpace: "nowrap" }}>
                      {w.onDuty && "● "}{w.name}
                      {w.role && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 10 }}>({w.role})</span>}
                    </span>))}
                  </div>
                )}
              </div>);
            })}
          </div>
        </div>
      </CC_Card>
    </div>

    {/* 보조: 역할별 분포 */}
    <CC_Card title="📊 역할별 분포" sub={`${Object.keys(byRole).length}개 역할`} style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {Object.keys(byRole).length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>역할 미지정</div> :
        Object.entries(byRole).sort((a,b)=>b[1].length-a[1].length).map(([role, ws]) => {
          const ratio = allWorkers.length > 0 ? Math.round((ws.length / allWorkers.length) * 100) : 0;
          return (<div key={role}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#f4f5fa" }}>{role}</span>
              <span className="mono" style={{ fontSize: 12, color: "#a980ff" }}>{ws.length}명 ({ratio}%)</span>
            </div>
            <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>
              <div style={{ width: `${ratio}%`, height: "100%", background: "linear-gradient(90deg, #6b8aff, #a980ff)", borderRadius: 3 }} />
            </div>
          </div>);
        })}
      </div>
    </CC_Card>

    {/* 안내 */}
    <CC_Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ fontSize: 13, color: "#94A3B8" }}>인력을 근무지로 드래그하여 즉시 배치할 수 있습니다. 상세 정보 편집(이름·연락처·계정)은 모바일에서 사용 가능</span>
        </div>
        <CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("settings")}>⚙️ 설정으로 →</CC_Btn>
      </div>
    </CC_Card>
  </div>);
}

function ControlCenterDashboard({ session, accounts, setAccounts, settings, setSettings, categories, setCategories, alerts, setAlerts, smsLog, setSmsLog, onLogout, onMobileSwitch, onNav, setActiveAlert, onAction }) {
  const [ccPage, setCcPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일 사이드바 토글
  // 페이지 변경 시 사이드바 닫기
  useEffect(() => { setSidebarOpen(false); }, [ccPage]);
  const overall = useMemo(() => {
    // 🚫 temp/humidity는 종합 위험도 계산에서 제외
    const lvs = (categories || []).filter(c => !EXCLUDE_FROM_OVERALL.includes(c.id)).map(c => getLevel(c));
    if (lvs.includes("RED")) return "RED";
    if (lvs.includes("ORANGE")) return "ORANGE";
    if (lvs.includes("YELLOW")) return "YELLOW";
    return "BLUE";
  }, [categories]);

  const overallColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[overall];
  const overallLabel = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[overall];

  const topAlert = alerts && alerts[0];
  const sortedCats = [...(categories || [])].sort((a, b) => {
    const ord = { RED: 0, ORANGE: 1, YELLOW: 2, BLUE: 3 };
    return ord[getLevel(a)] - ord[getLevel(b)];
  });

  return (<>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>{CC_STYLES}</style>
    <div className="cc-root">
      {/* TOP BAR */}
      <div className="cc-topbar">
        <button className="cc-mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="메뉴">☰</button>
        <div className="cc-brand">
          <div className="cc-brand-logo">S</div>
          <div>
            <div className="cc-brand-name">SAFEFLOW</div>
            <div className="cc-brand-sub">관제센터 v2 · {session?.name}</div>
          </div>
        </div>
        <div className="cc-crumbs">
          <span><span className="cc-live-dot"/>실시간</span>
          <span>{new Date().toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
          <button onClick={onMobileSwitch} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 12, cursor: "pointer" }}>📱 모바일 보기</button>
        </div>
      </div>

      <div className={`cc-sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <div className="cc-layout">
        <div className={`cc-sidebar ${sidebarOpen ? "open" : ""}`}>
          <CC_SidebarContent active={ccPage} alerts={alerts} settings={settings} onNav={(id) => { setCcPage(id); if (onNav) onNav(id); }} onLogout={onLogout} festivalName={settings?.festivalName} />
        </div>

        <div className="cc-main-col">
          {/* 상단 그리팅 */}
          <div className="cc-greeting-box" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13, color: "#6c6e7d" }}>{new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4, color: "#f4f5fa" }}>
                지금 <span style={{ color: overallColor }}>{overallLabel}</span> 단계예요
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <CC_Btn size="sm" onClick={() => location.reload()}>🔄 새로고침</CC_Btn>
              <CC_Btn size="sm" variant="primary" onClick={() => setCcPage("alert")}>🔔 경보 발령</CC_Btn>
            </div>
          </div>

          {/* DASHBOARD 탭 */}
          {ccPage === "dashboard" && <>
            {/* 상단 알림 배너 */}
            {topAlert && <CC_Card tinted style={{ marginBottom: 16, border: `1px solid ${overall === "RED" ? "rgba(255,94,126,0.3)" : "rgba(255,154,60,0.3)"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${overallColor}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <CC_Chip level={CC_LEVEL_MAP[topAlert.level]} pulse>● {topAlert.level} · {CC_LEVEL_LABEL[topAlert.level]}</CC_Chip>
                    <span style={{ fontSize: 12, color: "#6c6e7d" }}>{topAlert.time}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "#f4f5fa" }}>{topAlert.category} - {(topAlert.message || "").split("\n")[2] || "확인 필요"}</div>
                </div>
                <CC_Btn variant="primary" onClick={() => {
                  const cat = (categories || []).find(c => c.name === topAlert.category);
                  if (cat) {
                    if (cat.actionStatus !== "handling" && onAction) onAction(cat.id, "handling");
                    if (setActiveAlert) setActiveAlert(cat);
                  } else if (setActiveAlert) setActiveAlert(topAlert);
                }}>대응 시작 →</CC_Btn>
                <CC_Btn variant="ghost" onClick={() => setAlerts(p => p.filter((_, i) => i !== 0))}>🗑 삭제</CC_Btn>
              </div>
            </CC_Card>}

            {/* KPI 요약 - 6열로 한눈에 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
              {(() => {
                const allWorkers = (settings.workSites || []).flatMap(s => s.workers || []);
                const onDuty = allWorkers.filter(w => w.onDuty).length;
                const totalMeals = allWorkers.reduce((s, w) => s + (w.meals || 0), 0);
                const allRadios = (settings.assets || []).flatMap(a => a.units || []).filter(u => u.assignedTo);
                const openIncidents = (settings.incidents || []).filter(i => i.status !== "closed").length;
                const totalPrograms = (settings.programs || []).length;
                const todayStr = new Date().toISOString().slice(0, 10);
                const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                const activePrograms = (settings.programs || []).filter(p => {
                  if (p.date !== "always" && p.date !== todayStr) return false;
                  const [sh, sm] = (p.time || "00:00").split(":").map(Number);
                  const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
                  return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
                }).length;
                const crowd = categories.find(c => c.id === "crowd");
                
                const kpis = [
                  { label: "총 근무자", value: allWorkers.length, sub: `근무중 ${onDuty}`, color: "#6b8aff", icon: "👥" },
                  { label: "활성 경보", value: (alerts || []).length, sub: `${(alerts || []).filter(a => a.level === "RED").length} 심각`, color: (alerts || []).length > 0 ? "#ff5e7e" : "#4cd99a", icon: "🔔" },
                  { label: "진행중 사건", value: openIncidents, sub: "처리 대기", color: openIncidents > 0 ? "#ff9a3c" : "#4cd99a", icon: "📁" },
                  { label: "진행 프로그램", value: activePrograms, sub: `총 ${totalPrograms}건`, color: "#a980ff", icon: "🎭" },
                  { label: "현재 인파", value: (crowd?.currentValue || 0).toLocaleString(), sub: crowd?.unit || "명", color: "#4cd99a", icon: "🏃" },
                  { label: "무전기 사용", value: allRadios.length, sub: "분배중", color: "#f5c451", icon: "📻" },
                ];
                return kpis.map(k => (<div key={k.label} style={{ padding: "14px 16px", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{k.icon}</span>
                    <span style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", letterSpacing: "-0.02em", lineHeight: 1 }}>{k.value}</span>
                    <span style={{ fontSize: 11, color: "#6c6e7d" }}>{k.sub}</span>
                  </div>
                </div>));
              })()}
            </div>

            {/* 카테고리 메트릭 - 6열로 더 컴팩트 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {sortedCats.map(cat => (<CC_Metric key={cat.id} cat={cat} onClick={() => setCcPage("monitor")} />))}
            </div>

            {/* 메인 그리드: 활성경보 + 사건 + 구역 + 프로그램 + 자산 (5열) */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* 활성 경보 */}
              <CC_Card title="활성 경보" sub={`${(alerts || []).length}건 · 실시간`} action={(alerts || []).length > 0 ? <CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("alert")}>전체 →</CC_Btn> : null}>
                {(alerts || []).slice(0, 5).map((a, i) => (<div key={i} className="cc-list-row">
                  <CC_Chip level={CC_LEVEL_MAP[a.level]} pulse={a.level === "ORANGE" || a.level === "RED"}>●</CC_Chip>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#f4f5fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.category}</div>
                    <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(a.message || "").split("\n")[2] || "임계값 도달"}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "#6c6e7d", flexShrink: 0 }}>{a.time?.split(" ")[1] || a.time}</span>
                  <CC_Btn size="sm" variant={a.level === "ORANGE" || a.level === "RED" ? "primary" : "ghost"} onClick={() => {
                    const cat = (categories || []).find(c => c.name === a.category);
                    if (cat) {
                      if (cat.actionStatus !== "handling" && onAction) onAction(cat.id, "handling");
                      if (setActiveAlert) setActiveAlert(cat);
                    } else if (setActiveAlert) setActiveAlert(a);
                  }}>대응</CC_Btn>
                </div>))}
                {(!alerts || alerts.length === 0) && <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>✅ 현재 활성 경보가 없습니다</div>}
              </CC_Card>

              {/* 진행중 사건 */}
              <CC_Card title="사건 / 신고" sub={`${(settings.incidents || []).filter(i => i.status !== "closed").length}건 진행중`} action={<CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("incident")}>전체 →</CC_Btn>}>
                {(settings.incidents || []).filter(i => i.status !== "closed").slice(0, 5).map(i => (<div key={i.id} className="cc-list-row">
                  <span style={{ fontSize: 16 }}>{i.priority === "high" ? "🔴" : i.priority === "medium" ? "🟠" : "🔵"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#f4f5fa" }}>{i.type}</div>
                    <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {i.location} · {i.desc}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "#6c6e7d", flexShrink: 0 }}>{i.time?.split(" ")[1] || i.time}</span>
                </div>))}
                {(settings.incidents || []).filter(i => i.status !== "closed").length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>✅ 진행중 사건 없음</div>}
              </CC_Card>

              {/* 구역별 혼잡도 */}
              <CC_Card title="구역별 혼잡도" sub={`${(settings.zones || []).length}개 구역`}>
                {(settings.zones || []).slice(0, 7).map(z => {
                  const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id);
                  const cl = c?.level || "smooth";
                  const lv = cl === "danger" ? "red" : cl === "crowded" ? "yellow" : "green";
                  const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활";
                  return (<div key={z.id} className="cc-list-row" style={{ padding: "8px 0" }}>
                    <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {z.name}</span>
                    <CC_Chip level={lv}>{lbl}</CC_Chip>
                  </div>);
                })}
                {(settings.zones || []).length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>구역 미등록</div>}
              </CC_Card>
            </div>

            {/* 보조 그리드: 프로그램 + 인력 + 자산 + SMS (4열) */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1.5fr", gap: 16, marginBottom: 16 }}>
              {/* 진행 프로그램 */}
              <CC_Card title="진행 / 다음 프로그램" sub={`총 ${(settings.programs || []).length}건`} action={<CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("program")}>관리 →</CC_Btn>}>
                {(() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                  const todays = (settings.programs || []).filter(p => p.date === "always" || p.date === todayStr);
                  const active = todays.filter(p => {
                    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
                    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
                    return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
                  });
                  const upcoming = todays.filter(p => {
                    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
                    return sh*60+sm > nowMin;
                  }).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
                  if (active.length === 0 && upcoming.length === 0) return <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>오늘 예정된 프로그램이 없습니다</div>;
                  return (<>
                    {active.slice(0, 2).map(p => (<div key={p.id} style={{ padding: 10, marginBottom: 6, borderRadius: 8, background: "rgba(76,217,154,0.08)", border: "1px solid rgba(76,217,154,0.2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: "#4cd99a", animation: "blink 1.5s infinite" }} />
                        <span style={{ fontSize: 11, color: "#4cd99a", fontWeight: 700 }}>● 진행중</span>
                        <span className="mono" style={{ fontSize: 11, color: "#6c6e7d", marginLeft: "auto" }}>{p.time}~{p.endTime}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#f4f5fa" }}>{p.title}</div>
                      {p.location && <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>📍 {p.location}</div>}
                    </div>))}
                    {upcoming.slice(0, 3).map(p => (<div key={p.id} className="cc-list-row" style={{ padding: "8px 0" }}>
                      <span className="mono" style={{ fontSize: 12, color: "#6b8aff", minWidth: 44 }}>{p.time}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#f4f5fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                        {p.location && <div style={{ fontSize: 10, color: "#6c6e7d" }}>📍 {p.location}</div>}
                      </div>
                    </div>))}
                  </>);
                })()}
              </CC_Card>

              {/* 인력 현황 */}
              <CC_Card title="인력 현황" sub="근무지별" action={<CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("workforce")}>관리 →</CC_Btn>}>
                {(() => {
                  const sites = (settings.workSites || []).filter(s => s.id !== "_pool" && (s.workers || []).length > 0);
                  if (sites.length === 0) return <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>근무자 미배치</div>;
                  return sites.slice(0, 5).map(s => {
                    const ws = s.workers || [];
                    const onDuty = ws.filter(w => w.onDuty).length;
                    return (<div key={s.id} className="cc-list-row" style={{ padding: "8px 0" }}>
                      <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🏠 {s.name}</span>
                      <span className="mono" style={{ fontSize: 12, color: "#6b8aff", flexShrink: 0 }}>{onDuty}/{ws.length}</span>
                    </div>);
                  });
                })()}
              </CC_Card>

              {/* 자산 현황 */}
              <CC_Card title="자산 현황" sub="분배 / 보유" action={<CC_Btn size="sm" variant="ghost" onClick={() => setCcPage("resource")}>관리 →</CC_Btn>}>
                {(() => {
                  const assets = settings.assets || [];
                  if (assets.length === 0) return <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>자산 미등록</div>;
                  return assets.slice(0, 5).map(a => {
                    const total = (a.units || []).length;
                    const assigned = (a.units || []).filter(u => u.assignedTo).length;
                    const ratio = total > 0 ? Math.round((assigned / total) * 100) : 0;
                    const color = ratio > 80 ? "#ff5e7e" : ratio > 50 ? "#ff9a3c" : "#4cd99a";
                    return (<div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: "#f4f5fa", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.icon || "📦"} {a.name}</span>
                        <span className="mono" style={{ fontSize: 11, color: color, flexShrink: 0 }}>{assigned}/{total}</span>
                      </div>
                      <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div style={{ width: `${ratio}%`, height: "100%", background: color, borderRadius: 2 }} />
                      </div>
                    </div>);
                  });
                })()}
              </CC_Card>

              {/* 최근 SMS 발송 */}
              <CC_Card title="최근 SMS" sub={`${(smsLog || []).length}건 누적`}>
                {(() => {
                  const recent = (smsLog || []).slice(0, 5);
                  if (recent.length === 0) return <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>발송 내역 없음</div>;
                  return recent.map((s, i) => (<div key={i} className="cc-list-row" style={{ padding: "8px 0" }}>
                    <span style={{ fontSize: 14 }}>📨</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#f4f5fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.message || s.text || "(메시지)"}</div>
                      <div style={{ fontSize: 10, color: "#6c6e7d", marginTop: 2 }}>{s.recipients?.length || s.targets?.length || 0}명 · {s.time}</div>
                    </div>
                  </div>));
                })()}
              </CC_Card>
            </div>

            {/* 시간대별 인파 추이 그래프 */}
            {(() => {
              const crowd = categories.find(c => c.id === "crowd");
              const history = (crowd?.history || []).slice(-24);
              if (history.length < 2) return null;
              return (<CC_Card title="시간대별 인파 추이" sub={`최근 ${history.length}회 측정 · 30분 간격`} style={{ marginBottom: 16 }}>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                      <XAxis dataKey="time" tick={{ fill: "#6c6e7d", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#6c6e7d", fontSize: 11 }} width={50} />
                      <Tooltip contentStyle={{ background: "#0e0f17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 13 }} formatter={(v) => [`${Number(v).toLocaleString()}명`, "체류"]} />
                      {crowd.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={crowd.thresholds.YELLOW[0]} stroke="#f5c451" strokeDasharray="4 4" label={{ value: "주의", fill: "#f5c451", fontSize: 11 }} />}
                      {crowd.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={crowd.thresholds.ORANGE[0]} stroke="#ff9a3c" strokeDasharray="4 4" label={{ value: "경계", fill: "#ff9a3c", fontSize: 11 }} />}
                      <Line type="monotone" dataKey="value" stroke="#6b8aff" strokeWidth={2.5} dot={{ fill: "#6b8aff", r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CC_Card>);
            })()}
          </>}

          {/* MONITOR 탭 */}
          {ccPage === "monitor" && <CC_MonitorPage categories={categories} settings={settings} setSettings={setSettings} session={session} />}
          {ccPage === "alert" && <CC_AlertPage settings={settings} setSettings={setSettings} alerts={alerts} setAlerts={setAlerts} smsLog={smsLog} setSmsLog={setSmsLog} session={session} />}
          {ccPage === "incident" && <CC_IncidentPage settings={settings} setSettings={setSettings} session={session} />}
          {ccPage === "map" && <CC_MapPage settings={settings} setSettings={setSettings} session={session} />}
          {ccPage === "festival" && <CC_FestivalPage settings={settings} setSettings={setSettings} accounts={accounts} setAccounts={setAccounts} session={session} categories={categories} alerts={alerts} setCcPage={setCcPage} />}
          {ccPage === "program" && <CC_ProgramPage settings={settings} setSettings={setSettings} session={session} setCcPage={setCcPage} />}
          {ccPage === "stage" && <CC_StagePage settings={settings} setSettings={setSettings} session={session} setCcPage={setCcPage} />}
          {ccPage === "workforce" && <CC_WorkforcePage settings={settings} setSettings={setSettings} session={session} accounts={accounts} setAccounts={setAccounts} setCcPage={setCcPage} />}
          {ccPage === "resource" && <CC_ResourcePage settings={settings} setSettings={setSettings} session={session} accounts={accounts} />}
          {ccPage === "report" && <CC_ReportPage settings={settings} alerts={alerts} categories={categories} session={session} />}
          {ccPage === "user" && <CC_UserPage settings={settings} setSettings={setSettings} accounts={accounts} session={session} onMobileSwitch={onMobileSwitch} />}
          {ccPage === "settings" && <CC_SettingsPage settings={settings} setSettings={setSettings} session={session} onMobileSwitch={onMobileSwitch} />}
        </div>
      </div>
    </div>
  </>);
}

// ─── PC: 02. 실시간 모니터링 ───────────────────────────────────
function CC_MonitorPage({ categories, settings, setSettings, session }) {
  const [selCatId, setSelCatId] = useState(categories?.[0]?.id);
  const cat = (categories || []).find(c => c.id === selCatId) || categories?.[0];
  if (!cat) return <CC_Card title="실시간 모니터링">데이터가 없습니다</CC_Card>;
  const lv = getLevel(cat);
  const lvColor = { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv];

  const history = (cat.history || []).slice(-24);
  const trendPoints = history.length > 5 ? history.map((h, i) => ({ x: i * (100 / Math.max(1, history.length - 1)), y: h.value || 0 })) : [];
  const minV = Math.min(...trendPoints.map(p => p.y), cat.currentValue || 0);
  const maxV = Math.max(...trendPoints.map(p => p.y), cat.currentValue || 0);
  const range = maxV - minV || 1;
  const pathD = trendPoints.length > 0 ? trendPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${36 - ((p.y - minV) / range) * 30}`).join(" ") : "";

  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {(categories || []).map(c => {
        const cv = getLevel(c);
        const cvColor = { BLUE: "#6b8aff", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[cv];
        return (<button key={c.id} onClick={() => setSelCatId(c.id)} style={{ padding: "10px 16px", borderRadius: 999, border: selCatId === c.id ? `1.5px solid ${cvColor}` : "1px solid rgba(255,255,255,0.1)", background: selCatId === c.id ? `${cvColor}20` : "rgba(255,255,255,0.03)", color: selCatId === c.id ? cvColor : "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {c.icon || "📊"} {c.name}
          {(cv === "ORANGE" || cv === "RED") && <span style={{ width: 6, height: 6, borderRadius: 3, background: cvColor }} />}
        </button>);
      })}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <CC_Card>
        <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>현재 수치</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, fontFamily: "JetBrains Mono", color: lvColor, letterSpacing: "-0.03em" }}>{(cat.currentValue || 0).toLocaleString()}</div>
        <div style={{ fontSize: 16, color: "#6c6e7d", marginTop: 4 }}>{cat.unit}</div>
        <div style={{ marginTop: 16, display: "flex", gap: 6, alignItems: "center" }}>
          <CC_Chip level={CC_LEVEL_MAP[lv]} pulse={lv !== "BLUE"}>{CC_LEVEL_LABEL[lv]}</CC_Chip>
          <span style={{ fontSize: 12, color: "#6c6e7d" }}>업데이트: {new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </CC_Card>

      <CC_Card title="24시간 추이" sub={`${history.length || 0}개 데이터`}>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
          <defs>
            <linearGradient id={`cc-grad-${cat.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={lvColor} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={lvColor} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {pathD && <>
            <path d={`${pathD} L 100 36 L 0 36 Z`} fill={`url(#cc-grad-${cat.id})`} stroke="none"/>
            <path d={pathD} fill="none" stroke={lvColor} strokeWidth="1.5"/>
          </>}
          {!pathD && <text x="50" y="20" textAnchor="middle" fill="#6c6e7d" fontSize="3">데이터 부족 (수집 중)</text>}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6c6e7d", marginTop: 6, fontFamily: "JetBrains Mono" }}>
          <span>min {minV.toFixed(1)}</span>
          <span>max {maxV.toFixed(1)}</span>
        </div>
      </CC_Card>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <CC_Card title="임계값 표">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[{ k: "yellow", lbl: "주의 (YELLOW)", c: "#f5c451" }, { k: "orange", lbl: "경계 (ORANGE)", c: "#ff9a3c" }, { k: "red", lbl: "심각 (RED)", c: "#ff5e7e" }].map(t => (<div key={t.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#b0b3c4", fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: t.c }} />{t.lbl}</span>
            <span className="mono" style={{ color: t.c, fontWeight: 700, fontSize: 14 }}>{cat.thresholds?.[t.k] || "-"} {cat.unit}</span>
          </div>))}
        </div>
      </CC_Card>

      <CC_Card title="대응 체크리스트" sub={`${(cat.actionItems || []).length}개`}>
        {(cat.actionItems || []).length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>등록된 체크리스트가 없습니다</div> :
          (cat.actionItems || []).map((item, i) => (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < cat.actionItems.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0, marginTop: 2 }} />
            <span style={{ color: "#b0b3c4", fontSize: 13, lineHeight: 1.5 }}>{item}</span>
          </div>))}
      </CC_Card>
    </div>
  </>);
}

// ─── PC: 03. 알림 / 경보 발령 ───────────────────────────────────
function CC_AlertPage({ settings, setSettings, alerts, setAlerts, smsLog, setSmsLog, session }) {
  const [step, setStep] = useState(1);
  const [level, setLevel] = useState("YELLOW");
  const [msg, setMsg] = useState("");
  const [channels, setChannels] = useState({ sms: true, app: true, sound: false });
  const [targets, setTargets] = useState("all");

  const targetCount = useMemo(() => {
    if (targets === "managers") return (settings.smsManagers || []).length;
    if (targets === "staff") return (settings.smsStaff || []).length;
    return (settings.smsManagers || []).length + (settings.smsStaff || []).length;
  }, [targets, settings]);

  const lvColor = { BLUE: "#6b8aff", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[level];
  const lvLabel = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[level];

  const issueAlert = async () => {
    if (!msg.trim()) { alert("메시지를 입력하세요."); return; }
    if (!confirm(`${lvLabel} 단계 경보를 ${targetCount}명에게 발송합니다.\n\n발송 후 취소가 불가능합니다.\n진행하시겠습니까?`)) return;
    const time = new Date().toLocaleString("ko-KR");
    const newAlert = { category: "수동 발령", level, message: `[${settings.festivalName || "축제"} ${lvLabel}경보]\n\n${msg}\n\n발신: ${session?.name || "관리자"}\n시간: ${time}`, time };
    if (setAlerts) setAlerts(p => [newAlert, ...p].slice(0, 100));
    if (channels.sms) {
      try {
        const contacts = targets === "managers" ? settings.smsManagers : targets === "staff" ? settings.smsStaff : [...(settings.smsManagers || []), ...(settings.smsStaff || [])];
        const r = await sendSolapi(settings, newAlert.message, contacts);
        if (setSmsLog) setSmsLog(p => [{ time, level, message: msg, sentTo: contacts.length, success: r.ok ? r.success : 0, fail: r.ok ? r.fail : contacts.length }, ...p].slice(0, 100));
      } catch {}
    }
    alert(`✅ 경보 발령 완료\n\n수신자: ${targetCount}명\n채널: ${Object.keys(channels).filter(k => channels[k]).join(", ")}`);
    setStep(1); setMsg(""); setLevel("YELLOW");
  };

  return (<div>
    <div className="cc-step-bar" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      {[1, 2, 3, 4, 5].map(s => (<div key={s} onClick={() => s < step && setStep(s)} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: step === s ? `${lvColor}20` : step > s ? "rgba(76,217,154,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${step === s ? lvColor + "60" : step > s ? "rgba(76,217,154,0.2)" : "rgba(255,255,255,0.05)"}`, color: step === s ? lvColor : step > s ? "#4cd99a" : "#6c6e7d", fontSize: 12, fontWeight: 600, cursor: s < step ? "pointer" : "default", textAlign: "center" }}>
        {step > s ? "✓ " : ""}{s}. {["", "단계", "메시지", "채널", "대상", "발령"][s]}
      </div>))}
    </div>

    {step === 1 && <CC_Card title="① 경보 단계 선택">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {["BLUE", "YELLOW", "ORANGE", "RED"].map(l => {
          const c = { BLUE: "#6b8aff", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[l];
          const lbl = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[l];
          const desc = { BLUE: "정보 안내", YELLOW: "주의 환기", ORANGE: "긴급 대응", RED: "최고 위험" }[l];
          return (<div key={l} onClick={() => setLevel(l)} style={{ padding: "20px 16px", borderRadius: 14, background: level === l ? `linear-gradient(180deg, ${c}25, ${c}08)` : "rgba(255,255,255,0.02)", border: `2px solid ${level === l ? c : "rgba(255,255,255,0.06)"}`, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: c, margin: "0 auto 10px", boxShadow: `0 0 20px ${c}80` }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: level === l ? c : "#f4f5fa", marginBottom: 4 }}>{l} · {lbl}</div>
            <div style={{ fontSize: 11, color: "#6c6e7d" }}>{desc}</div>
          </div>);
        })}
      </div>
      <div style={{ marginTop: 16, textAlign: "right" }}>
        <CC_Btn variant="primary" onClick={() => setStep(2)}>다음 →</CC_Btn>
      </div>
    </CC_Card>}

    {step === 2 && <CC_Card title="② 메시지 작성" sub={`${lvLabel} 단계로 발송됩니다`}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 6, fontWeight: 600 }}>빠른 템플릿</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[`${settings.festivalName || "축제"} 안전관리상황실에서 알려드립니다.`, "구역별 인원 통제를 강화해주세요.", "현재 위치를 안전한 곳으로 이동해주세요.", "상황 종료. 정상 운영 재개합니다."].map((t, i) => (<button key={i} onClick={() => setMsg(m => m + (m ? "\n" : "") + t)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 12, cursor: "pointer" }}>+ {t.slice(0, 18)}{t.length > 18 ? "..." : ""}</button>))}
        </div>
      </div>
      <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="알림 메시지를 입력하세요..." style={{ width: "100%", minHeight: 140, padding: 14, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6c6e7d" }}>{msg.length}자 (SMS 90자 권장)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <CC_Btn variant="ghost" onClick={() => setStep(1)}>← 이전</CC_Btn>
          <CC_Btn variant="primary" onClick={() => msg.trim() && setStep(3)}>다음 →</CC_Btn>
        </div>
      </div>
    </CC_Card>}

    {step === 3 && <CC_Card title="③ 발송 채널" sub="여러 채널 동시 발송 가능">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[{ k: "sms", n: "SMS 문자", icon: "📱", desc: "운영진 휴대폰" }, { k: "app", n: "앱 푸시", icon: "🔔", desc: "SAFEFLOW 앱" }, { k: "sound", n: "방송 알림음", icon: "📢", desc: "현장 스피커" }].map(c => (<div key={c.k} onClick={() => setChannels(p => ({ ...p, [c.k]: !p[c.k] }))} style={{ padding: 16, borderRadius: 12, background: channels[c.k] ? "rgba(107,138,255,0.08)" : "rgba(255,255,255,0.02)", border: channels[c.k] ? "2px solid #6b8aff" : "2px solid rgba(255,255,255,0.05)", cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f5fa", marginBottom: 4 }}>{c.n}</div>
          <div style={{ fontSize: 11, color: "#6c6e7d" }}>{c.desc}</div>
          {channels[c.k] && <div style={{ marginTop: 8, color: "#6b8aff", fontSize: 11, fontWeight: 700 }}>✓ 선택됨</div>}
        </div>))}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
        <CC_Btn variant="ghost" onClick={() => setStep(2)}>← 이전</CC_Btn>
        <CC_Btn variant="primary" onClick={() => setStep(4)}>다음 →</CC_Btn>
      </div>
    </CC_Card>}

    {step === 4 && <CC_Card title="④ 발송 대상" sub={`총 ${targetCount}명에게 발송됩니다`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[{ k: "all", n: "전체", desc: "관리자 + 안전요원 모두", count: (settings.smsManagers || []).length + (settings.smsStaff || []).length }, { k: "managers", n: "관리자만", desc: "운영진/관제센터", count: (settings.smsManagers || []).length }, { k: "staff", n: "안전요원만", desc: "현장 인력", count: (settings.smsStaff || []).length }].map(t => (<div key={t.k} onClick={() => setTargets(t.k)} style={{ padding: "14px 16px", borderRadius: 10, background: targets === t.k ? "rgba(107,138,255,0.08)" : "rgba(255,255,255,0.02)", border: targets === t.k ? "1.5px solid #6b8aff" : "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, border: targets === t.k ? "6px solid #6b8aff" : "2px solid rgba(255,255,255,0.2)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#f4f5fa" }}>{t.n}</div>
            <div style={{ fontSize: 12, color: "#6c6e7d" }}>{t.desc}</div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono", color: targets === t.k ? "#6b8aff" : "#b0b3c4" }}>{t.count}<span style={{ fontSize: 12, marginLeft: 4, color: "#6c6e7d" }}>명</span></div>
        </div>))}
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
        <CC_Btn variant="ghost" onClick={() => setStep(3)}>← 이전</CC_Btn>
        <CC_Btn variant="primary" onClick={() => setStep(5)}>다음 →</CC_Btn>
      </div>
    </CC_Card>}

    {step === 5 && <CC_Card title="⑤ 발령 확인" tinted style={{ border: `2px solid ${lvColor}40` }}>
      <div style={{ background: `${lvColor}10`, padding: 16, borderRadius: 12, border: `1px solid ${lvColor}30`, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <CC_Chip level={CC_LEVEL_MAP[level]} pulse>● {level} · {lvLabel}</CC_Chip>
          <span style={{ fontSize: 12, color: "#6c6e7d" }}>발신자: {session?.name}</span>
        </div>
        <div style={{ fontSize: 14, color: "#f4f5fa", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 11, color: "#6c6e7d" }}>채널</div>
          <div style={{ fontSize: 14, color: "#f4f5fa", marginTop: 4 }}>{Object.keys(channels).filter(k => channels[k]).map(k => ({ sms: "📱SMS", app: "🔔앱", sound: "📢방송" }[k])).join(" · ") || "선택 안함"}</div>
        </div>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 11, color: "#6c6e7d" }}>대상</div>
          <div style={{ fontSize: 14, color: "#f4f5fa", marginTop: 4 }}>{targetCount}명 ({targets === "all" ? "전체" : targets === "managers" ? "관리자" : "안전요원"})</div>
        </div>
      </div>
      <div style={{ padding: 12, borderRadius: 10, background: "rgba(255,94,126,0.08)", border: "1px solid rgba(255,94,126,0.2)", color: "#ff5e7e", fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
        ⚠️ 발송 후 취소 불가능합니다. 메시지 내용과 대상을 다시 한번 확인하세요.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <CC_Btn variant="ghost" onClick={() => setStep(4)}>← 이전</CC_Btn>
        <CC_Btn variant="danger" size="lg" onClick={issueAlert}>🚨 발령 실행</CC_Btn>
      </div>
    </CC_Card>}

    <CC_Card title="최근 발령 이력" sub={`${(smsLog || []).length}건`} style={{ marginTop: 16 }}>
      {(smsLog || []).slice(0, 5).map((s, i) => (<div key={i} className="cc-list-row">
        <CC_Chip level={CC_LEVEL_MAP[s.level || "BLUE"]}>{s.level || "정보"}</CC_Chip>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "#f4f5fa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.message}</div>
          <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>{s.time} · 발송 {s.sentTo || 0}건 · 성공 {s.success || 0}</div>
        </div>
      </div>))}
      {(!smsLog || smsLog.length === 0) && <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>발령 이력이 없습니다</div>}
    </CC_Card>
  </div>);
}

// ─── PC: 04. 사건 / 신고 ───────────────────────────────────
function CC_IncidentPage({ settings, setSettings, session }) {
  const incidents = settings.incidents || [];
  const today = new Date().toDateString();
  const todayIncidents = incidents.filter(i => new Date(i.ts).toDateString() === today);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");
  const [newInc, setNewInc] = useState({ type: "", location: "", desc: "", priority: "low" });
  const types = ["응급환자", "분실아동", "폭력/싸움", "시설고장", "민원/항의", "교통사고", "기타"];

  const submit = () => {
    if (!newInc.type || !newInc.location) { alert("종류와 위치를 입력하세요."); return; }
    const inc = { id: "inc_" + Date.now(), ...newInc, ts: Date.now(), status: "open", reporter: session?.name || "?", time: new Date().toLocaleString("ko-KR") };
    setSettings(p => ({ ...p, incidents: [inc, ...(p.incidents || [])] }));
    setNewInc({ type: "", location: "", desc: "", priority: "low" });
    setShowAdd(false);
  };

  const updateStatus = (id, status) => setSettings(p => ({ ...p, incidents: (p.incidents || []).map(i => i.id === id ? { ...i, status, closedTs: status === "closed" ? Date.now() : null } : i) }));
  const remove = (id) => { if (confirm("삭제하시겠습니까?")) setSettings(p => ({ ...p, incidents: (p.incidents || []).filter(i => i.id !== id) })); };

  const filtered = filter === "all" ? incidents : filter === "today" ? todayIncidents : incidents.filter(i => i.status === filter);

  return (<div>
    <div className="cc-stats-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
      {[{ k: "today", n: "오늘", c: todayIncidents.length, color: "#6b8aff" }, { k: "open", n: "처리중", c: incidents.filter(i => i.status === "open").length, color: "#ff9a3c" }, { k: "in_progress", n: "조치중", c: incidents.filter(i => i.status === "in_progress").length, color: "#f5c451" }, { k: "closed", n: "완료", c: incidents.filter(i => i.status === "closed").length, color: "#4cd99a" }].map(s => (<div key={s.k} onClick={() => setFilter(s.k)} style={{ padding: 16, borderRadius: 14, background: filter === s.k ? `${s.color}15` : "rgba(255,255,255,0.02)", border: `1px solid ${filter === s.k ? s.color + "40" : "rgba(255,255,255,0.06)"}`, cursor: "pointer" }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.n}</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono", color: s.color, marginTop: 4 }}>{s.c}</div>
      </div>))}
    </div>

    <CC_Card title="사건 / 신고 목록" sub={`총 ${filtered.length}건`} action={<>
      <CC_Btn size="sm" variant="ghost" onClick={() => setFilter("all")}>전체</CC_Btn>
      <CC_Btn size="sm" variant="primary" onClick={() => setShowAdd(!showAdd)}>+ 신규 등록</CC_Btn>
    </>}>
      {showAdd && <div style={{ padding: 14, borderRadius: 10, background: "rgba(107,138,255,0.06)", border: "1px solid rgba(107,138,255,0.2)", marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>종류</div>
            <select value={newInc.type} onChange={e => setNewInc({ ...newInc, type: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 13 }}>
              <option value="">선택...</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>위치/구역</div>
            <input value={newInc.location} onChange={e => setNewInc({ ...newInc, location: e.target.value })} placeholder="A구역 / 정문 등" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4 }}>긴급도</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ k: "low", n: "낮음", c: "#4cd99a" }, { k: "mid", n: "보통", c: "#f5c451" }, { k: "high", n: "긴급", c: "#ff9a3c" }, { k: "critical", n: "치명", c: "#ff5e7e" }].map(p => (<button key={p.k} onClick={() => setNewInc({ ...newInc, priority: p.k })} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: newInc.priority === p.k ? `1.5px solid ${p.c}` : "1px solid rgba(255,255,255,0.1)", background: newInc.priority === p.k ? `${p.c}15` : "rgba(255,255,255,0.02)", color: newInc.priority === p.k ? p.c : "#b0b3c4", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{p.n}</button>))}
          </div>
        </div>
        <textarea value={newInc.desc} onChange={e => setNewInc({ ...newInc, desc: e.target.value })} placeholder="상세 내용 (선택)" style={{ width: "100%", minHeight: 70, marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <CC_Btn variant="primary" onClick={submit}>등록</CC_Btn>
          <CC_Btn variant="ghost" onClick={() => setShowAdd(false)}>취소</CC_Btn>
        </div>
      </div>}

      {filtered.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>사건이 없습니다</div> :
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>상태</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>종류</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>위치</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>긴급도</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>접수자</th>
                <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>시간</th>
                <th style={{ padding: "10px 8px", textAlign: "right", color: "#6c6e7d", fontWeight: 600, fontSize: 11 }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const sLabel = i.status === "open" ? "처리중" : i.status === "in_progress" ? "조치중" : "완료";
                const pColor = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
                return (<tr key={i.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 8px" }}><CC_Chip level={i.status === "open" ? "orange" : i.status === "in_progress" ? "yellow" : "green"}>●{sLabel}</CC_Chip></td>
                  <td style={{ padding: "12px 8px", color: "#f4f5fa", fontWeight: 600 }}>{i.type}</td>
                  <td style={{ padding: "12px 8px", color: "#b0b3c4" }}>📍 {i.location}</td>
                  <td style={{ padding: "12px 8px" }}><span style={{ color: pColor, fontWeight: 600, fontSize: 12 }}>● {{ critical: "치명", high: "긴급", mid: "보통", low: "낮음" }[i.priority]}</span></td>
                  <td style={{ padding: "12px 8px", color: "#b0b3c4" }}>{i.reporter}</td>
                  <td style={{ padding: "12px 8px", color: "#6c6e7d", fontFamily: "JetBrains Mono", fontSize: 12 }}>{i.time?.split(" ")[1] || i.time}</td>
                  <td style={{ padding: "12px 8px", textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 4 }}>
                      {i.status !== "closed" && <CC_Btn size="sm" variant="ghost" onClick={() => updateStatus(i.id, i.status === "open" ? "in_progress" : "closed")}>{i.status === "open" ? "조치 시작" : "완료"}</CC_Btn>}
                      <CC_Btn size="sm" variant="ghost" onClick={() => remove(i.id)} style={{ color: "#ff5e7e" }}>🗑</CC_Btn>
                    </div>
                  </td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      }
    </CC_Card>
  </div>);
}

// ─── PC: 05. 지도 상황도 ───────────────────────────────────
function CC_MapPage({ settings, setSettings, session }) {
  const fid = session?.festivalId || "default";
  const [mapImage] = usePersist(`${fid}_map_img_v1`, null);
  const [mapAreas] = usePersist(`${fid}_map_areas_v1`, []);
  const zones = settings.zones || [];
  const congestion = settings.zoneCongestion || [];
  const incidents = settings.incidents || [];
  const [layers, setLayers] = useState({ areas: true, incidents: true, workers: false });
  const [hoveredArea, setHoveredArea] = useState(null);

  const getAreaColor = (zoneId) => {
    const c = congestion.find(cc => cc.zoneId === zoneId);
    if (!c) return "#6b8aff";
    return c.level === "danger" ? "#ff5e7e" : c.level === "crowded" ? "#f5c451" : "#4cd99a";
  };

  return (<div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
    <CC_Card title="실시간 상황도" sub={`${zones.length}개 구역 · ${mapAreas.length}개 영역 · ${incidents.filter(i => i.status !== "closed").length}건 진행`}>
      {!mapImage ? <div style={{ aspectRatio: "16/10", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "2px dashed rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#6c6e7d", gap: 12 }}>
        <span style={{ fontSize: 48 }}>🗺️</span>
        <span>도면이 등록되지 않았습니다</span>
        <span style={{ fontSize: 12 }}>모바일 → 🗺️ 히트맵 메뉴에서 업로드하세요</span>
      </div> :
        <div style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
          <img src={mapImage} alt="map" style={{ width: "100%", display: "block" }} />
          {layers.areas && <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {mapAreas.map(a => {
              const z = zones.find(zz => zz.id === a.zoneId);
              const color = getAreaColor(a.zoneId);
              const points = (a.points || []).map(p => `${p.x},${p.y}`).join(" ");
              return (<g key={a.id} style={{ pointerEvents: "all" }} onMouseEnter={() => setHoveredArea(a.id)} onMouseLeave={() => setHoveredArea(null)}>
                <polygon points={points} fill={color} fillOpacity={hoveredArea === a.id ? 0.5 : 0.3} stroke={color} strokeWidth="0.3" />
                {z && (a.points || []).length > 0 && (() => { const cx = a.points.reduce((s, p) => s + p.x, 0) / a.points.length; const cy = a.points.reduce((s, p) => s + p.y, 0) / a.points.length; return <text x={cx} y={cy} textAnchor="middle" fill="#fff" fontSize="2" fontWeight="700" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: "0.5" }}>{z.name}</text>; })()}
              </g>);
            })}
          </svg>}
          {layers.incidents && incidents.filter(i => i.status !== "closed").map((i, idx) => {
            const x = 10 + (idx % 6) * 14; const y = 15 + Math.floor(idx / 6) * 18;
            const c = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
            return (<div key={i.id} title={`${i.type} - ${i.location}`} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 16, height: 16, borderRadius: 8, background: c, boxShadow: `0 0 12px ${c}, 0 0 0 3px rgba(0,0,0,0.4)`, animation: "cc-pulse 2s ease-in-out infinite", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>!</div>);
          })}
        </div>
      }
    </CC_Card>

    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CC_Card title="레이어">
        {[{ k: "areas", n: "구역 (영역)", icon: "🗺️" }, { k: "incidents", n: "사건 핀", icon: "📍" }, { k: "workers", n: "근무자 위치", icon: "👤" }].map(l => (<div key={l.k} onClick={() => setLayers(p => ({ ...p, [l.k]: !p[l.k] }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: "pointer" }}>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: layers[l.k] ? "#6b8aff" : "rgba(255,255,255,0.1)", position: "relative", transition: "all 0.2s" }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: layers[l.k] ? 18 : 2, transition: "all 0.2s" }} />
          </div>
          <span style={{ fontSize: 13, color: "#f4f5fa" }}>{l.icon} {l.n}</span>
        </div>))}
      </CC_Card>

      <CC_Card title="구역 상태" sub={`${zones.length}개`}>
        {zones.map(z => {
          const c = congestion.find(cc => cc.zoneId === z.id);
          const cl = c?.level || "smooth";
          const lv = cl === "danger" ? "red" : cl === "crowded" ? "yellow" : "green";
          const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활";
          return (<div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 12, color: "#f4f5fa" }}>📍 {z.name}</span>
            <CC_Chip level={lv}>{lbl}</CC_Chip>
          </div>);
        })}
        {zones.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 12 }}>구역 미등록</div>}
      </CC_Card>

      <CC_Card title="활성 사건" sub={`${incidents.filter(i => i.status !== "closed").length}건`}>
        {incidents.filter(i => i.status !== "closed").slice(0, 4).map(i => {
          const c = { critical: "#ff5e7e", high: "#ff9a3c", mid: "#f5c451", low: "#4cd99a" }[i.priority];
          return (<div key={i.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#f4f5fa" }}>{i.type}</span>
            </div>
            <div style={{ fontSize: 11, color: "#6c6e7d", paddingLeft: 14 }}>{i.location}</div>
          </div>);
        })}
        {incidents.filter(i => i.status !== "closed").length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#6c6e7d", fontSize: 12 }}>활성 사건 없음</div>}
      </CC_Card>
    </div>
  </div>);
}

// ─── PC: 06. 물자 관리 ───────────────────────────────────
function CC_ResourcePage({ settings, setSettings, session, accounts }) {
  const assets = settings.assets || [];
  const cats = settings.assetCategories || ["무전기", "생수", "리플렛", "멀티탭", "응급키트", "조끼", "안전모", "안전장비", "의자", "테이블", "조명", "음향", "기타"];
  const workSites = settings.workSites || [];
  const allWorkers = workSites.flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name })));
  const totalAssets = assets.reduce((s, a) => s + (a.total || 0), 0);
  const availAssets = assets.reduce((s, a) => s + (a.qty || 0), 0);
  const assignedAssets = assets.reduce((s, a) => s + (a.units || []).filter(u => u.status === "assigned").length, 0);
  const broken = assets.reduce((s, a) => s + (a.units || []).filter(u => u.status === "broken").length, 0);
  const lost = assets.reduce((s, a) => s + (a.units || []).filter(u => u.status === "lost").length, 0);
  const lowStock = assets.filter(a => a.total > 0 && (a.qty || 0) / a.total < 0.3).length;
  const canEdit = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);

  // 카테고리별 통계
  const byCategory = {};
  cats.forEach(c => { byCategory[c] = { count: 0, total: 0, qty: 0 }; });
  assets.forEach(a => {
    const c = a.category || "기타";
    if (!byCategory[c]) byCategory[c] = { count: 0, total: 0, qty: 0 };
    byCategory[c].count += 1;
    byCategory[c].total += (a.total || 0);
    byCategory[c].qty += (a.qty || 0);
  });

  // 빠른 추가 폼
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "무전기", total: 1, qty: 1, location: "" });
  const [filter, setFilter] = useState("all");

  const addQuick = () => {
    if (!newItem.name.trim()) { alert("물자명을 입력하세요"); return; }
    const id = "asset_" + Date.now();
    setSettings(prev => ({ ...prev, assets: [...(prev.assets || []), { ...newItem, id, status: "available", trackUnits: false, units: [] }] }));
    setNewItem({ name: "", category: newItem.category, total: 1, qty: 1, location: "" });
    setAddOpen(false);
  };

  const deleteAsset = (id) => {
    if (!confirm("이 물자를 삭제하시겠습니까?")) return;
    setSettings(prev => ({ ...prev, assets: (prev.assets || []).filter(a => a.id !== id) }));
  };

  const updateAsset = (id, field, val) => {
    setSettings(prev => ({ ...prev, assets: (prev.assets || []).map(a => a.id === id ? { ...a, [field]: val } : a) }));
  };

  const filtered = filter === "all" ? assets : assets.filter(a => a.category === filter);

  // 카테고리 아이콘 매핑
  const catIcon = { "무전기": "📻", "생수": "💧", "리플렛": "📄", "멀티탭": "🔌", "응급키트": "🩹", "조끼": "🦺", "안전모": "⛑️", "안전장비": "🦺", "의자": "🪑", "테이블": "🪟", "조명": "💡", "음향": "🔊", "기타": "📦" };

  return (<div>
    {/* KPI 6개 */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { label: "전체 물자", value: assets.length, sub: "품목", color: "#6b8aff", icon: "📦" },
        { label: "총 수량", value: totalAssets, sub: "개", color: "#42A5F5", icon: "🔢" },
        { label: "사용 가능", value: availAssets, sub: `${totalAssets > 0 ? Math.round(availAssets/totalAssets*100) : 0}%`, color: "#4cd99a", icon: "✅" },
        { label: "사용중", value: assignedAssets, sub: "할당됨", color: "#a980ff", icon: "🔄" },
        { label: "고장/분실", value: broken + lost, sub: `${broken}/${lost}`, color: (broken+lost)>0?"#ff5e7e":"#4cd99a", icon: "⚠️" },
        { label: "재고 부족", value: lowStock, sub: "30% 미만", color: lowStock>0?"#ff9a3c":"#4cd99a", icon: "📉" },
      ].map(k => (<div key={k.label} style={{ padding: "14px", borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${k.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><span style={{ fontSize: 14 }}>{k.icon}</span><span style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</span></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: "JetBrains Mono", lineHeight: 1 }}>{k.value}</span>
          <span style={{ fontSize: 11, color: "#6c6e7d" }}>{k.sub}</span>
        </div>
      </div>))}
    </div>

    {/* 빠른 추가 폼 */}
    {canEdit && <CC_Card style={{ marginBottom: 16 }}>
      {!addOpen ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📦</span>
            <span style={{ fontSize: 14, color: "#94A3B8" }}>새 물자를 빠르게 추가하거나 카테고리별로 일괄 추가할 수 있습니다</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* 빠른 추가 (카테고리별 프리셋) */}
            {[
              { cat: "무전기", icon: "📻", name: "무전기", default: 10 },
              { cat: "생수", icon: "💧", name: "생수 500ml", default: 100 },
              { cat: "리플렛", icon: "📄", name: "안내 리플렛", default: 500 },
              { cat: "멀티탭", icon: "🔌", name: "멀티탭", default: 5 },
              { cat: "응급키트", icon: "🩹", name: "응급키트", default: 3 },
              { cat: "조끼", icon: "🦺", name: "안전조끼", default: 20 },
            ].map(p => (
              <CC_Btn key={p.cat} size="sm" variant="ghost" onClick={() => {
                setNewItem({ name: p.name, category: p.cat, total: p.default, qty: p.default, location: "" });
                setAddOpen(true);
              }}>{p.icon} {p.cat}</CC_Btn>
            ))}
            <CC_Btn size="sm" variant="primary" onClick={() => setAddOpen(true)}>+ 직접 추가</CC_Btn>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 0.7fr 1.2fr auto auto", gap: 8, alignItems: "center" }}>
            <input value={newItem.name} onChange={e=>setNewItem({...newItem, name: e.target.value})} placeholder="물자명 (예: 무전기 LTE)" autoFocus style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 13 }} />
            <select value={newItem.category} onChange={e=>setNewItem({...newItem, category: e.target.value})} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "#14151f", color: "#f4f5fa", fontSize: 13 }}>
              {cats.map(c => <option key={c} value={c}>{catIcon[c] || "📦"} {c}</option>)}
            </select>
            <input type="number" min="1" value={newItem.total} onChange={e=>{ const v = parseInt(e.target.value || "1"); setNewItem({...newItem, total: v, qty: v}); }} placeholder="총수량" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 13, fontFamily: "JetBrains Mono" }} />
            <input type="number" min="0" value={newItem.qty} onChange={e=>setNewItem({...newItem, qty: parseInt(e.target.value || "0")})} placeholder="가용" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 13, fontFamily: "JetBrains Mono" }} />
            <input value={newItem.location} onChange={e=>setNewItem({...newItem, location: e.target.value})} placeholder="보관 위치 (선택)" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 13 }} />
            <CC_Btn size="sm" variant="primary" onClick={addQuick}>✓ 추가</CC_Btn>
            <CC_Btn size="sm" variant="ghost" onClick={() => { setAddOpen(false); setNewItem({ name: "", category: cats[0], total: 1, qty: 1, location: "" }); }}>✕</CC_Btn>
          </div>
        </div>
      )}
    </CC_Card>}

    {/* 카테고리 필터 칩 (가로 스크롤) */}
    <CC_Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#6c6e7d", fontWeight: 600, marginRight: 4 }}>카테고리:</span>
        <button onClick={() => setFilter("all")} style={{ padding: "8px 14px", borderRadius: 999, border: filter === "all" ? "1.5px solid #6b8aff" : "1px solid rgba(255,255,255,0.08)", background: filter === "all" ? "rgba(107,138,255,0.15)" : "rgba(255,255,255,0.02)", color: filter === "all" ? "#6b8aff" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📦 전체 ({assets.length})</button>
        {Object.entries(byCategory).filter(([_, v]) => v.count > 0).sort((a,b)=>b[1].count-a[1].count).map(([cat, v]) => {
          const ratio = v.total > 0 ? Math.round((v.qty / v.total) * 100) : 0;
          const color = ratio < 30 ? "#ff5e7e" : ratio < 60 ? "#ff9a3c" : "#4cd99a";
          return (<button key={cat} onClick={() => setFilter(cat)} style={{ padding: "8px 14px", borderRadius: 999, border: filter === cat ? `1.5px solid ${color}` : "1px solid rgba(255,255,255,0.08)", background: filter === cat ? `${color}15` : "rgba(255,255,255,0.02)", color: filter === cat ? color : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {catIcon[cat] || "📦"} {cat} ({v.count})
          </button>);
        })}
      </div>
    </CC_Card>

    {/* 메인: 타일 그리드 (카드 형태) */}
    <CC_Card title={`📦 물자 목록 ${filter !== "all" ? `(${filter})` : ""}`} sub={`${filtered.length}개 품목 · ${filtered.reduce((s,a)=>s+(a.total||0),0)}개 총수량`} style={{ marginBottom: 16 }}>
      {filtered.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", border: "2px dashed rgba(255,255,255,0.06)", borderRadius: 14, background: "rgba(255,255,255,0.01)" }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>📦</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#b0b3c4", marginBottom: 6 }}>{filter === "all" ? "등록된 물자가 없습니다" : `${filter} 카테고리에 등록된 물자가 없습니다`}</div>
          <div style={{ fontSize: 12, color: "#6c6e7d" }}>위의 빠른 추가 버튼이나 [+ 직접 추가]로 등록하세요</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map(a => {
            const ratio = a.total ? a.qty / a.total : 0;
            const pct = Math.round(ratio * 100);
            const color = ratio < 0.3 ? "#ff5e7e" : ratio < 0.6 ? "#ff9a3c" : "#4cd99a";
            const icon = catIcon[a.category] || "📦";
            return (<div key={a.id} style={{ padding: 16, borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #14151f", border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, position: "relative", transition: "transform 0.15s, border-color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = `${color}50`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = `${color}25`; }}>
              {/* 헤더 */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f5fa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#6c6e7d", marginTop: 2 }}>{a.category}</div>
                </div>
                {canEdit && <button onClick={() => deleteAsset(a.id)} title="삭제" style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,94,126,0.2)", background: "rgba(255,94,126,0.05)", color: "#ff5e7e", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>🗑</button>}
              </div>

              {/* 큰 숫자 + 게이지 */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 30, fontWeight: 700, color, fontFamily: "JetBrains Mono", letterSpacing: "-0.02em", lineHeight: 1 }}>{a.qty || 0}</span>
                    <span style={{ fontSize: 14, color: "#6c6e7d", fontFamily: "JetBrains Mono" }}>/ {a.total || 0}</span>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 999, background: `${color}15`, border: `1px solid ${color}30`, color, fontSize: 11, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 3, transition: "width 0.3s" }} />
                </div>
              </div>

              {/* 인라인 편집 (관리자만) */}
              {canEdit ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#6c6e7d", marginBottom: 3, fontWeight: 600 }}>가용</div>
                    <input type="number" min="0" max={a.total} value={a.qty || 0} onChange={e => updateAsset(a.id, "qty", parseInt(e.target.value || "0"))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontFamily: "JetBrains Mono", fontSize: 12, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#6c6e7d", marginBottom: 3, fontWeight: 600 }}>총수량</div>
                    <input type="number" min="1" value={a.total || 0} onChange={e => updateAsset(a.id, "total", parseInt(e.target.value || "1"))} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#b0b3c4", fontFamily: "JetBrains Mono", fontSize: 12, boxSizing: "border-box" }} />
                  </div>
                </div>
              ) : null}

              {/* 위치 */}
              {canEdit ? (
                <div>
                  <div style={{ fontSize: 10, color: "#6c6e7d", marginBottom: 3, fontWeight: 600 }}>📍 보관 위치</div>
                  <input value={a.location || ""} onChange={e => updateAsset(a.id, "location", e.target.value)} placeholder="위치 입력 (예: 본부, 창고 A)" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#f4f5fa", fontSize: 12, boxSizing: "border-box" }} />
                </div>
              ) : (a.location && <div style={{ fontSize: 11, color: "#94A3B8" }}>📍 {a.location}</div>)}

              {/* 빠른 ± 버튼 (관리자) */}
              {canEdit && <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                <button onClick={() => updateAsset(a.id, "qty", Math.max(0, (a.qty || 0) - 1))} disabled={(a.qty || 0) === 0} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid rgba(255,94,126,0.2)", background: "rgba(255,94,126,0.05)", color: (a.qty || 0) === 0 ? "#444" : "#ff8a99", fontSize: 12, fontWeight: 700, cursor: (a.qty || 0) === 0 ? "default" : "pointer" }}>-1</button>
                <button onClick={() => updateAsset(a.id, "qty", Math.min(a.total, (a.qty || 0) + 1))} disabled={(a.qty || 0) >= (a.total || 0)} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "1px solid rgba(76,217,154,0.2)", background: "rgba(76,217,154,0.05)", color: (a.qty || 0) >= (a.total || 0) ? "#444" : "#7ee5b3", fontSize: 12, fontWeight: 700, cursor: (a.qty || 0) >= (a.total || 0) ? "default" : "pointer" }}>+1</button>
                <button onClick={() => { if (confirm(`${a.name} 전체 반납 처리?`)) updateAsset(a.id, "qty", a.total || 0); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(107,138,255,0.2)", background: "rgba(107,138,255,0.05)", color: "#8fa6ff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>↺ 전체</button>
              </div>}
            </div>);
          })}
        </div>
      )}
    </CC_Card>

    {/* 카테고리별 요약 (작은 카드) */}
    {Object.values(byCategory).filter(v=>v.count>0).length > 0 && <CC_Card title="📊 카테고리별 요약" sub="가용률 한눈에" style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {Object.entries(byCategory).filter(([_, v]) => v.count > 0).sort((a,b)=>b[1].total-a[1].total).map(([cat, v]) => {
          const ratio = v.total > 0 ? Math.round((v.qty / v.total) * 100) : 0;
          const color = ratio < 30 ? "#ff5e7e" : ratio < 60 ? "#ff9a3c" : "#4cd99a";
          return (<div key={cat} onClick={() => setFilter(cat)} style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${filter === cat ? color : "rgba(255,255,255,0.05)"}`, cursor: "pointer", transition: "border-color 0.15s" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f4f5fa" }}>{catIcon[cat] || "📦"} {cat}</span>
              <span className="mono" style={{ fontSize: 11, color, fontWeight: 700 }}>{ratio}%</span>
            </div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 6 }}>{v.qty}/{v.total} · {v.count} 품목</div>
            <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
              <div style={{ width: `${ratio}%`, height: "100%", background: color, borderRadius: 2 }} />
            </div>
          </div>);
        })}
      </div>
    </CC_Card>}

    {/* 근무지별 분배 현황 */}
    <CC_Card title="🏠 근무지별 분배 현황" sub={`${workSites.filter(s=>s.id!=="_pool").length}개 근무지`} style={{ marginBottom: 16 }}>
      {workSites.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>등록된 근무지가 없습니다</div> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {workSites.filter(s => s.id !== "_pool").map(s => {
            const ws = s.workers || [];
            const radiosHere = assets.filter(a => a.category === "무전기").reduce((sum, a) => sum + (a.units || []).filter(u => ws.find(w => w.id === u.assignedTo)).length, 0);
            return (<div key={s.id} style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f4f5fa", marginBottom: 8 }}>🏠 {s.name}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94A3B8" }}>
                <span>👥 {ws.length}명</span>
                {radiosHere > 0 && <span>📻 {radiosHere}</span>}
              </div>
            </div>);
          })}
        </div>
      }
    </CC_Card>
  </div>);
}

// ─── PC: 07. 리포트 ───────────────────────────────────
function CC_ReportPage({ settings, alerts, categories, session }) {
  const today = new Date().toLocaleDateString("ko-KR");
  const totalAlerts = (alerts || []).length;
  const incidents = settings.incidents || [];
  const closedIncidents = incidents.filter(i => i.status === "closed").length;
  const dangerCats = (categories || []).filter(c => { const lv = getLevel(c); return lv === "ORANGE" || lv === "RED"; }).length;

  return (<div>
    <div className="cc-stats-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
      {[{ n: "오늘 알림", v: totalAlerts, c: "#6b8aff" }, { n: "사건 처리", v: closedIncidents + "/" + incidents.length, c: "#4cd99a" }, { n: "위험 카테고리", v: dangerCats, c: "#ff9a3c" }, { n: "운영 시간", v: "5h 32m", c: "#a980ff" }].map(s => (<div key={s.n} style={{ padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{s.n}</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "JetBrains Mono", color: s.c, marginTop: 4 }}>{s.v}</div>
      </div>))}
    </div>

    <CC_Card title="일일 종합 리포트" sub={today} action={<CC_Btn size="sm" variant="primary" onClick={() => window.print()}>📄 PDF 인쇄</CC_Btn>}>
      <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", borderRadius: 12, lineHeight: 1.7, color: "#b0b3c4", fontSize: 13 }}>
        <h3 style={{ color: "#f4f5fa", margin: "0 0 12px" }}>① 환경 모니터링</h3>
        <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
          {(categories || []).map(c => { const lv = getLevel(c); const lvL = { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "심각" }[lv]; return <li key={c.id}>{c.name}: {(c.currentValue || 0).toLocaleString()}{c.unit} <span style={{ color: { BLUE: "#4cd99a", YELLOW: "#f5c451", ORANGE: "#ff9a3c", RED: "#ff5e7e" }[lv] }}>({lvL})</span></li>; })}
        </ul>

        <h3 style={{ color: "#f4f5fa", margin: "16px 0 12px" }}>② 알림 현황</h3>
        <p>총 {totalAlerts}건의 알림이 발생했습니다.</p>
        {(alerts || []).slice(0, 5).map((a, i) => <div key={i} style={{ paddingLeft: 14, fontSize: 12 }}>• [{a.level}] {a.category} - {a.time}</div>)}

        <h3 style={{ color: "#f4f5fa", margin: "16px 0 12px" }}>③ 사건 현황</h3>
        <p>접수 {incidents.length}건, 처리 완료 {closedIncidents}건</p>

        <h3 style={{ color: "#f4f5fa", margin: "16px 0 12px" }}>④ 구역별 혼잡도</h3>
        {(settings.zones || []).map(z => { const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id); const cl = c?.level || "smooth"; const lbl = cl === "danger" ? "위험" : cl === "crowded" ? "혼잡" : "원활"; return <div key={z.id} style={{ paddingLeft: 14 }}>• {z.name}: {lbl}</div>; })}
      </div>
    </CC_Card>
  </div>);
}

// ─── PC: 08. 사용자 관리 ───────────────────────────────────
function CC_UserPage({ settings, setSettings, accounts, session, onMobileSwitch }) {
  const [search, setSearch] = useState("");
  const filtered = (accounts || []).filter(a => !search || (a.name || "").includes(search) || (a.id || "").includes(search));
  const roles = { sysadmin: { lbl: "시스템관리자", c: "#ff5e7e" }, admin: { lbl: "관리자", c: "#ff9a3c" }, manager: { lbl: "운영자", c: "#f5c451" }, zonemgr: { lbl: "구역관리", c: "#6b8aff" }, stagemgr: { lbl: "무대관리", c: "#a980ff" }, counter: { lbl: "계수원", c: "#4cd99a" }, parking: { lbl: "주차요원", c: "#4cd99a" }, shuttle: { lbl: "셔틀요원", c: "#4cd99a" } };

  return (<div>
    <CC_Card title="사용자 / 계정" sub={`${(accounts || []).length}명`} action={<>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 이름/ID 검색" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 13, width: 200 }} />
      <CC_Btn size="sm" variant="primary" onClick={onMobileSwitch}>+ 신규 계정 (모바일)</CC_Btn>
    </>}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>이름</th>
            <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>로그인 ID</th>
            <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>역할</th>
            <th style={{ padding: "10px 8px", textAlign: "left", color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>축제</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(a => { const r = roles[a.role] || { lbl: a.role, c: "#6c6e7d" }; return (<tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <td style={{ padding: "12px 8px", color: "#f4f5fa", fontWeight: 600 }}>{a.name}</td>
            <td style={{ padding: "12px 8px", color: "#b0b3c4", fontFamily: "JetBrains Mono" }}>{a.id}</td>
            <td style={{ padding: "12px 8px" }}><span style={{ padding: "3px 10px", borderRadius: 6, background: `${r.c}15`, color: r.c, fontSize: 11, fontWeight: 700 }}>{r.lbl}</span></td>
            <td style={{ padding: "12px 8px", color: "#b0b3c4", fontSize: 12 }}>{(a.festivals || [a.festivalId]).filter(Boolean).join(", ") || "-"}</td>
          </tr>); })}
        </tbody>
      </table>
      {filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#6c6e7d", fontSize: 13 }}>{search ? "검색 결과 없음" : "계정 없음"}</div>}
    </CC_Card>
  </div>);
}

// ─── PC: 09. 설정 ───────────────────────────────────
function CC_SettingsPage({ settings, setSettings, session, onMobileSwitch }) {
  const [name, setName] = useState(settings.festivalName || "");
  const features = settings.features || {};

  return (<div>
    <CC_Card title="축제 정보">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>축제 이름</div>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => setSettings(p => ({ ...p, festivalName: name }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>운영 상태</div>
          <div style={{ padding: "10px 12px", borderRadius: 8, background: settings.active ? "rgba(76,217,154,0.08)" : "rgba(255,154,60,0.08)", border: settings.active ? "1px solid rgba(76,217,154,0.3)" : "1px solid rgba(255,154,60,0.3)", color: settings.active ? "#4cd99a" : "#ff9a3c", fontSize: 14, fontWeight: 700 }}>{settings.active ? "● 운영 중" : "● 미운영"}</div>
        </div>
      </div>
    </CC_Card>

    <CC_Card title="기능 사용" sub="모바일에서 자세히 설정 가능" style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {Object.entries({ crowd: "👥 인파", parking: "🚗 주차", shuttle: "🚌 셔틀", weather: "🌦️ 기상", congestion: "🚦 혼잡도", stage: "🎤 공연", heatmap: "🗺️ 히트맵", workers: "👤 근무자", reports: "📊 리포트" }).map(([k, n]) => (<div key={k} style={{ padding: "10px 12px", borderRadius: 8, background: features[k] !== false ? "rgba(76,217,154,0.06)" : "rgba(255,255,255,0.02)", border: features[k] !== false ? "1px solid rgba(76,217,154,0.2)" : "1px solid rgba(255,255,255,0.05)", color: features[k] !== false ? "#4cd99a" : "#6c6e7d", fontSize: 13, fontWeight: 600 }}>{features[k] !== false ? "✓" : "○"} {n}</div>))}
      </div>
    </CC_Card>

    <CC_Card title="고급 설정" sub="모바일 화면에서 변경 가능" style={{ marginTop: 16 }}>
      <div style={{ padding: 16, color: "#6c6e7d", textAlign: "center" }}>
        <p style={{ marginBottom: 12 }}>API 키, 대상 연락처, 인력 관리 등 상세 설정은 모바일에서 가능합니다</p>
        <CC_Btn variant="primary" onClick={onMobileSwitch}>📱 모바일 보기로 전환</CC_Btn>
      </div>
    </CC_Card>
  </div>);
}

// ─── 운영인력 전용: 내 지정 구역 ─────────────────────────────────
function MyZonePage({ settings, setSettings, session, accounts }) {
  // 내 계정 찾기
  const myAccount = accounts?.find(a => a.id === session?.id);
  const mySiteId = myAccount?.siteId;
  
  const sites = settings.workSites || [];
  const zones = settings.zones || [];
  const programs = settings.programs || [];
  const incidents = settings.incidents || [];
  const congestion = settings.zoneCongestion || [];
  
  const mySite = sites.find(s => s.id === mySiteId);
  const myZone = mySite ? zones.find(z => z.id === mySite.zoneId) : null;
  
  // 내 근무지 동료
  const colleagues = mySite ? (mySite.workers || []).filter(w => w.accountId !== session?.id) : [];
  
  // 내 구역 혼잡도
  const myCong = myZone ? congestion.find(c => c.zoneId === myZone.id) : null;
  const congLevel = myCong?.level || "smooth";
  const congColor = congLevel === "danger" ? "#ff5e7e" : congLevel === "crowded" ? "#f5c451" : "#4cd99a";
  const congLabel = congLevel === "danger" ? "위험 (밀집)" : congLevel === "crowded" ? "혼잡" : "원활";
  
  // 내 구역의 사건
  const myIncidents = incidents.filter(i => i.location?.includes(myZone?.name || "")).filter(i => i.status !== "closed");
  
  // 진행중 프로그램 + 다음 프로그램
  const now = useNow(30000);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStr = now.toISOString().slice(0, 10);
  
  const myZonePrograms = programs.filter(p => p.zoneId === myZone?.id || !p.zoneId);
  const activePg = myZonePrograms.find(p => {
    if (p.date !== "always" && p.date !== todayStr) return false;
    const [sh, sm] = (p.time || "00:00").split(":").map(Number);
    const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
    return nowMin >= sh*60+sm && nowMin <= eh*60+em && p.pgStatus !== "ended";
  });

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* v2 페이지 헤더 */}
      <div style={{ padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, rgba(255,112,67,0.12), rgba(255,112,67,0.04))", border: "1px solid rgba(255,112,67,0.25)", borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #FF7043, #E64A19)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 12px rgba(255,112,67,0.4)" }}>📍</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f5fa", letterSpacing: "-0.01em" }}>내 지정 구역</div>
            <div style={{ fontSize: 11, color: "#b0b3c4", marginTop: 2 }}>운영인력 · {session?.name}</div>
          </div>
        </div>
      </div>

      {!mySite && <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,167,38,0.08), rgba(255,167,38,0.02))", border: "1px solid rgba(255,167,38,0.2)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📍</div>
        <div style={{ color: "#ff9a3c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>지정 근무지가 없습니다</div>
        <div style={{ color: "#b0b3c4", fontSize: 13 }}>관리자에게 근무지 배정을 요청하세요</div>
      </div>}

      {mySite && <>
        {/* 내 구역 정보 카드 */}
        <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>현재 근무지</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f4f5fa", marginTop: 4, letterSpacing: "-0.01em" }}>📍 {mySite.name || myZone?.name || "미배치"}</div>
              {myZone && mySite.name !== myZone.name && <div style={{ fontSize: 13, color: "#b0b3c4", marginTop: 2 }}>구역: {myZone.name}</div>}
            </div>
            <span style={{ padding: "5px 12px", borderRadius: 999, background: `${congColor}15`, border: `1px solid ${congColor}30`, color: congColor, fontSize: 12, fontWeight: 700 }}>● {congLabel}</span>
          </div>
          {myCong?.memo && <div style={{ padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 10, fontSize: 13, color: "#b0b3c4", marginBottom: 10 }}>📝 {myCong.memo}</div>}
          
          {/* 동료 */}
          {colleagues.length > 0 && <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>같은 근무지 동료 ({colleagues.length}명)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {colleagues.map(c => (<a key={c.id} href={c.phone ? `tel:${c.phone}` : "#"} style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(107,138,255,0.08)", border: "1px solid rgba(107,138,255,0.2)", color: "#8fa6ff", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                👤 {c.name}{c.phone && " 📞"}
              </a>))}
            </div>
          </div>}
        </div>

        {/* 진행중 프로그램 */}
        {activePg && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(76,217,154,0.1), rgba(76,217,154,0.02))", border: "1px solid rgba(76,217,154,0.25)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "#4cd99a", boxShadow: "0 0 8px #4cd99a", animation: "blink 2s infinite" }}></span>
            <span style={{ color: "#4cd99a", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>진행중 프로그램</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f4f5fa" }}>{activePg.title}</div>
          <div style={{ fontSize: 12, color: "#b0b3c4", marginTop: 4 }}>⏰ {activePg.time} ~ {activePg.endTime} {activePg.location && `· 📍 ${activePg.location}`}</div>
          {activePg.description && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6, lineHeight: 1.5 }}>{activePg.description}</div>}
        </div>}

        {/* 내 구역 사건/신고 */}
        {myIncidents.length > 0 && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,94,126,0.1), rgba(255,94,126,0.02))", border: "1px solid rgba(255,94,126,0.25)", borderRadius: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "#ff5e7e", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>🚨 내 구역 진행중 사건 ({myIncidents.length})</span>
          </div>
          {myIncidents.map(i => (<div key={i.id} style={{ padding: 10, marginBottom: 6, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "#f4f5fa", fontSize: 14, fontWeight: 600 }}>{i.type}</span>
              <span style={{ fontSize: 11, color: "#6c6e7d", fontFamily: "JetBrains Mono, monospace" }}>{i.time?.split(" ")[1] || i.time}</span>
            </div>
            <div style={{ fontSize: 12, color: "#b0b3c4", marginTop: 4 }}>📍 {i.location}</div>
            {i.desc && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{i.desc}</div>}
          </div>))}
        </div>}

        {/* 빠른 액션 */}
        <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f4f5fa", marginBottom: 10 }}>빠른 동작</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <a href="tel:119" style={{ padding: 14, borderRadius: 12, background: "linear-gradient(180deg, rgba(255,94,126,0.15), rgba(255,94,126,0.05))", border: "1px solid rgba(255,94,126,0.3)", color: "#ff738e", fontSize: 14, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>🚑 119 응급</a>
            <a href="tel:112" style={{ padding: 14, borderRadius: 12, background: "linear-gradient(180deg, rgba(107,138,255,0.15), rgba(107,138,255,0.05))", border: "1px solid rgba(107,138,255,0.3)", color: "#8fa6ff", fontSize: 14, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>👮 112 경찰</a>
          </div>
        </div>
      </>}
    </div>
  </div>);
}

// ─── 비상연락망 ─────────────────────────────────────────────────
function EmergencyContactsPage({ settings, setSettings, session }) {
  const contacts = settings.emergencyContacts || [];
  const canEdit = ["admin", "manager", "sysadmin"].includes(session?.role);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");

  const [form, setForm] = useState({ group: "축제운영본부", name: "", role: "", phone: "", priority: "normal", note: "" });

  // 그룹 목록 (자동 추출 + 기본값)
  const defaultGroups = ["축제운영본부", "안전관리실", "의료지원", "경찰/소방", "외부기관", "주관기관", "기타"];
  const usedGroups = [...new Set(contacts.map(c => c.group).filter(Boolean))];
  const allGroups = [...new Set([...defaultGroups, ...usedGroups])];

  const submit = () => {
    if (!form.name || !form.phone) { alert("이름과 연락처는 필수입니다."); return; }
    const id = editId || ("ec_" + Date.now());
    setSettings(prev => {
      const list = prev.emergencyContacts || [];
      if (editId) {
        return { ...prev, emergencyContacts: list.map(c => c.id === editId ? { ...c, ...form } : c) };
      }
      return { ...prev, emergencyContacts: [...list, { id, ...form }] };
    });
    setForm({ group: "축제운영본부", name: "", role: "", phone: "", priority: "normal", note: "" });
    setShowAdd(false); setEditId(null);
  };

  const startEdit = (c) => { setEditId(c.id); setForm(c); setShowAdd(true); };
  const remove = (id) => { if (confirm("삭제하시겠습니까?")) setSettings(p => ({ ...p, emergencyContacts: (p.emergencyContacts || []).filter(c => c.id !== id) })); };

  // 필터
  const filtered = contacts.filter(c => {
    if (filterGroup !== "all" && c.group !== filterGroup) return false;
    if (search && !(c.name?.includes(search) || c.role?.includes(search) || c.phone?.includes(search) || c.group?.includes(search))) return false;
    return true;
  }).sort((a, b) => {
    const pri = { critical: 0, high: 1, normal: 2 };
    return (pri[a.priority] || 2) - (pri[b.priority] || 2);
  });

  // 그룹별 분류
  const grouped = {};
  filtered.forEach(c => {
    const g = c.group || "기타";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(c);
  });

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      {/* v2 페이지 헤더 */}
      <div style={{ padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, rgba(255,94,126,0.12), rgba(255,94,126,0.04))", border: "1px solid rgba(255,94,126,0.25)", borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #ff5e7e, #c2185b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 12px rgba(255,94,126,0.4)" }}>🚨</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f5fa", letterSpacing: "-0.01em" }}>비상연락망</div>
            <div style={{ fontSize: 11, color: "#b0b3c4", marginTop: 2 }}>총 {contacts.length}명 · 우선순위순</div>
          </div>
          {canEdit && <button onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ group: "축제운영본부", name: "", role: "", phone: "", priority: "normal", note: "" }); }} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,94,126,0.3)", background: "rgba(255,94,126,0.1)", color: "#ff738e", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ 추가</button>}
        </div>
      </div>

      {/* 긴급 연락처 (119/112) - 항상 상단 표시 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <a href="tel:119" style={{ padding: "14px 12px", borderRadius: 14, background: "linear-gradient(135deg, rgba(255,94,126,0.18), rgba(255,94,126,0.05))", border: "1.5px solid rgba(255,94,126,0.35)", color: "#ff738e", textAlign: "center", textDecoration: "none", boxShadow: "0 4px 12px -4px rgba(255,94,126,0.3)" }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🚑</div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>119</div>
          <div style={{ fontSize: 10, color: "#ff8a99", marginTop: 2, fontWeight: 600 }}>응급/소방</div>
        </a>
        <a href="tel:112" style={{ padding: "14px 12px", borderRadius: 14, background: "linear-gradient(135deg, rgba(107,138,255,0.18), rgba(107,138,255,0.05))", border: "1.5px solid rgba(107,138,255,0.35)", color: "#8fa6ff", textAlign: "center", textDecoration: "none", boxShadow: "0 4px 12px -4px rgba(107,138,255,0.3)" }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>👮</div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>112</div>
          <div style={{ fontSize: 10, color: "#a5b8ff", marginTop: 2, fontWeight: 600 }}>경찰</div>
        </a>
        <a href="tel:120" style={{ padding: "14px 12px", borderRadius: 14, background: "linear-gradient(135deg, rgba(76,217,154,0.18), rgba(76,217,154,0.05))", border: "1.5px solid rgba(76,217,154,0.35)", color: "#4cd99a", textAlign: "center", textDecoration: "none", boxShadow: "0 4px 12px -4px rgba(76,217,154,0.3)" }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🏛️</div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>120</div>
          <div style={{ fontSize: 10, color: "#7ee5b3", marginTop: 2, fontWeight: 600 }}>다산콜</div>
        </a>
      </div>

      {/* 추가/수정 폼 */}
      {showAdd && <div style={{ padding: 16, marginBottom: 12, background: "linear-gradient(180deg, rgba(255,94,126,0.06), rgba(255,94,126,0.02))", border: "1px solid rgba(255,94,126,0.2)", borderRadius: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f4f5fa", marginBottom: 12 }}>{editId ? "✏️ 연락처 수정" : "+ 새 연락처"}</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>그룹</div>
            <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, boxSizing: "border-box" }}>
              {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>이름 *</div>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="홍길동" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>직책/역할</div>
              <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="안전관리실장" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>연락처 *</div>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" inputMode="tel" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>우선순위</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[{ k: "critical", n: "🔴 최우선", c: "#ff5e7e" }, { k: "high", n: "🟠 우선", c: "#ff9a3c" }, { k: "normal", n: "🔵 일반", c: "#6b8aff" }].map(p => (<button key={p.k} onClick={() => setForm({ ...form, priority: p.k })} style={{ padding: "10px 8px", borderRadius: 10, border: form.priority === p.k ? `1.5px solid ${p.c}` : "1px solid rgba(255,255,255,0.1)", background: form.priority === p.k ? `${p.c}15` : "rgba(255,255,255,0.02)", color: form.priority === p.k ? p.c : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{p.n}</button>))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6c6e7d", marginBottom: 4, fontWeight: 600 }}>메모</div>
            <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="역할 / 담당 영역 등" rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowAdd(false); setEditId(null); }} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#b0b3c4", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
            <button onClick={submit} style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #ff738e, #ff4f72)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{editId ? "✓ 수정" : "+ 추가"}</button>
          </div>
        </div>
      </div>}

      {/* 검색 + 필터 */}
      {contacts.length > 0 && <>
        <div style={{ marginBottom: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 이름/직책/연락처 검색" style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#f4f5fa", fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
          <button onClick={() => setFilterGroup("all")} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: filterGroup === "all" ? "1.5px solid #ff5e7e" : "1px solid rgba(255,255,255,0.1)", background: filterGroup === "all" ? "rgba(255,94,126,0.1)" : "rgba(255,255,255,0.03)", color: filterGroup === "all" ? "#ff738e" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>전체 ({contacts.length})</button>
          {usedGroups.map(g => { const cnt = contacts.filter(c => c.group === g).length; return (<button key={g} onClick={() => setFilterGroup(g)} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 999, border: filterGroup === g ? "1.5px solid #ff5e7e" : "1px solid rgba(255,255,255,0.1)", background: filterGroup === g ? "rgba(255,94,126,0.1)" : "rgba(255,255,255,0.03)", color: filterGroup === g ? "#ff738e" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{g} ({cnt})</button>); })}
        </div>
      </>}

      {/* 연락처 목록 (그룹별) */}
      {contacts.length === 0 ? <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📞</div>
        <div style={{ color: "#f4f5fa", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>등록된 비상연락처가 없습니다</div>
        {canEdit && <div style={{ color: "#b0b3c4", fontSize: 13 }}>위의 [+ 추가] 버튼으로 등록하세요</div>}
      </div> :
        Object.entries(grouped).map(([group, list]) => (<div key={group} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6c6e7d", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8, paddingLeft: 4 }}>{group} ({list.length})</div>
          {list.map(c => {
            const pColor = c.priority === "critical" ? "#ff5e7e" : c.priority === "high" ? "#ff9a3c" : "#6b8aff";
            return (<div key={c.id} style={{ padding: 14, marginBottom: 6, borderRadius: 12, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: `1px solid ${pColor}20`, borderLeft: `3px solid ${pColor}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#f4f5fa" }}>{c.name}</span>
                    {c.role && <span style={{ fontSize: 11, color: "#94A3B8" }}>· {c.role}</span>}
                  </div>
                  {c.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{c.note}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <a href={`tel:${c.phone}`} style={{ padding: "8px 14px", borderRadius: 10, background: `linear-gradient(180deg, ${pColor}, ${pColor}dd)`, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace", boxShadow: `0 4px 12px -4px ${pColor}40` }}>📞 {c.phone}</a>
                  {canEdit && <>
                    <button onClick={() => startEdit(c)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 11, cursor: "pointer" }}>✏️</button>
                    <button onClick={() => remove(c.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,94,126,0.2)", background: "rgba(255,94,126,0.05)", color: "#ff5e7e", fontSize: 11, cursor: "pointer" }}>🗑</button>
                  </>}
                </div>
              </div>
            </div>);
          })}
        </div>))
      }

      {/* 일괄 SMS 발송 (관리자) */}
      {canEdit && contacts.length > 0 && <div style={{ marginTop: 14, padding: 14, background: "linear-gradient(180deg, rgba(107,138,255,0.06), rgba(107,138,255,0.02))", border: "1px solid rgba(107,138,255,0.2)", borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#8fa6ff", marginBottom: 8 }}>📨 비상연락망 일괄 SMS</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>현재 표시된 {filtered.length}명에게 비상 메시지를 발송합니다.</div>
        <button onClick={async () => {
          const msg = prompt(`${filtered.length}명에게 발송할 비상 메시지를 입력하세요:`, `[${settings.festivalName || "축제"}] 비상연락 - 즉시 회신 요망`);
          if (!msg) return;
          const targets = filtered.map(c => ({ name: c.name, phone: c.phone }));
          const r = await sendSolapi(settings, msg, targets);
          alert(r.ok ? `✅ 발송 완료\n성공: ${r.success} / 실패: ${r.fail}` : `❌ 발송 실패: ${r.error || "알 수 없음"}`);
        }} style={{ width: "100%", padding: "11px 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg, #6b8aff, #5a7aff)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📨 {filtered.length}명에게 일괄 발송</button>
      </div>}
    </div>
  </div>);
}

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
      return (<div key={node.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, marginBottom: 4 }}>
        <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{node.name}</span>
        {node.position && <span style={{ color: "#66BB6A", fontSize: 12 }}>{node.position}</span>}
        {node.phone && <a href={`tel:${node.phone.replace(/-/g, "")}`} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#66BB6A", fontSize: 13, fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>📞</a>}
      </div>);
    }

    return (<div key={node.id} style={{ marginLeft: depth * 14, marginBottom: 6 }}>
      <div style={{ borderRadius: 10, border: "1px solid rgba(33,150,243,0.15)", overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>🏢</span>
          <span style={{ color: "#42A5F5", fontSize: 14, fontWeight: 800, flex: 1 }}>{node.name}</span>
          {node.position && <span style={{ color: "#42A5F5", fontSize: 12 }}>{node.position}</span>}
          <span style={{ color: "#94A3B8", fontSize: 12 }}>{childPersons.length}명</span>
        </div>
        {childPersons.length > 0 && <div style={{ padding: "4px 10px 6px" }}>
          {childPersons.map(p => renderNode(p, 0))}
        </div>}
      </div>
      {childOrgs.map(c => renderNode(c, depth + 1))}
    </div>);
  };

  return (<div style={{ maxWidth: 1100, margin: "12px auto 0" }}>
    <div onClick={onToggle} style={{ padding: "14px 16px", borderRadius: show ? "12px 12px 0 0" : 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 22 }}>📋</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>조직도 / 비상연락망</div>
        <div style={{ color: "#94A3B8", fontSize: 13 }}>{orgCount}개 조직 · {personCount}명</div>
      </div>
      <span style={{ color: "#94A3B8", fontSize: 14 }}>{show ? "▲" : "▼"}</span>
    </div>
    {show && <div style={{ padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderTop: "none", borderRadius: "0 0 12px 12px" }}>
      {roots.map(r => renderNode(r, 0))}
      {orgPersons.length > 0 && <>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "14px 0 10px", paddingTop: 12 }}>
          <span style={{ color: "#8892b0", fontSize: 14, fontWeight: 700 }}>📞 비상연락망</span>
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {orgPersons.map(n => {
            const parentOrg = orgData.find(o => o.id === n.parentId && o.type === "org");
            return (<div key={n.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderRadius: 8, gap: 10, background: "rgba(255,255,255,0.02)", flexWrap: "wrap" }}>
              <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700, minWidth: 50 }}>{n.name}</span>
              {n.position && <span style={{ color: "#66BB6A", fontSize: 14, fontWeight: 600, minWidth: 50 }}>{n.position}</span>}
              {parentOrg && <span style={{ color: "#94A3B8", fontSize: 14, flex: 1 }}>🏢 {parentOrg.name}</span>}
              <a href={`tel:${n.phone.replace(/-/g, "")}`} style={{ padding: "8px 16px", borderRadius: 20, background: "rgba(76,175,80,0.12)", border: "1px solid rgba(76,175,80,0.25)", color: "#66BB6A", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>📞 {n.phone}</a>
            </div>);
          })}
        </div>
      </>}
    </div>}
  </div>);
}

// ─── Dashboard ───────────────────────────────────────────────────
function Dashboard({ categories: rawCategories, settings, onCardClick, onRefresh, alerts, onAction, onActionReport, onDeleteAlert, onDeleteNotice, userRole, updateAvailable, onSearch }) {
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
                  <span style={{ color: "#94A3B8", fontSize: 13 }}>{selected.kmaCategory ? `🌤️ 기상청 ${selected.kmaCategory}` : selected.apiConfig?.enabled ? "🔌 커스텀API" : "✏️ 수동입력"}</span>
                  {selected.lastUpdated && <span style={{ color: "#94A3B8", fontSize: 14 }}>| 🕐 {selected.lastUpdated}</span>}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 42, fontWeight: 900, color: li.color, fontVariantNumeric: "tabular-nums" }}>{selected.currentValue.toLocaleString()}<span style={{ fontSize: 16, color: "#8892b0", marginLeft: 4 }}>{selected.unit}</span></div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, alignItems: "center" }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 14, fontWeight: 700 }}>{li.icon} {li.label}</span>
                {selected.actionStatus && <span style={{ padding: "6px 12px", borderRadius: 20, background: selected.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(76,175,80,0.15)", border: `1px solid ${selected.actionStatus === "handling" ? "rgba(255,152,0,0.3)" : "rgba(76,175,80,0.3)"}`, color: selected.actionStatus === "handling" ? "#FFA726" : "#66BB6A", fontSize: 13, fontWeight: 700 }}>{selected.actionStatus === "handling" ? "🔧 조치중" : "✅ 조치완료"}</span>}
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
                  <div style={{ color: "#66BB6A", fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{selected.currentValue.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                  <div style={{ color: "#8892b0", fontSize: 13 }}>📊 누적 방문</div>
                  <div style={{ color: "#42A5F5", fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{cumVal.toLocaleString()}</div>
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
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()}명`, "체류"]} />
                    {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 14 }} />}
                    {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" label={{ value: "경계", fill: "#FFA726", fontSize: 14 }} />}
                    <Line type="monotone" dataKey="value" stroke="#66BB6A" strokeWidth={3} dot={{ fill: "#66BB6A", r: 3 }} />
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
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} />
                    <Line type="monotone" dataKey="체류" stroke="#66BB6A" strokeWidth={2} dot={false} name="🏃 체류" />
                    <Line type="monotone" dataKey="누적" stroke="#42A5F5" strokeWidth={2} dot={false} name="📊 누적" />
                  </LineChart>
                </ResponsiveContainer>
              </div>}

              {/* 데이터 없을 때 안내 */}
              {history.length < 2 && hLog.length < 2 && <div style={{ textAlign: "center", padding: 20, marginBottom: 16, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ color: "#94A3B8", fontSize: 14 }}>📊 인파계수 데이터가 쌓이면 그래프가 표시됩니다</p>
                <p style={{ color: "#94A3B8", fontSize: 14 }}>체류 추이: 30분 간격 자동 기록 | 체류/누적 비교: 5분 간격 자동 기록</p>
              </div>}

              {/* 일자별 기록 */}
              {(settings.dailyRecords || []).length >= 1 && <div style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>📅 일자별 방문 현황</h3>
                {(settings.dailyRecords || []).length >= 2 && <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={(settings.dailyRecords || []).map(r => ({ date: r.date, 누적방문: r.cumulative || 0, 최대체류: r.peakCurrent || 0 }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fill: "#556", fontSize: 13 }} />
                    <YAxis tick={{ fill: "#556", fontSize: 14 }} width={50} />
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} />
                    <Line type="monotone" dataKey="누적방문" stroke="#42A5F5" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="최대체류" stroke="#FFA726" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>}
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {(settings.dailyRecords || []).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                      <span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{r.date}</span>
                      <span style={{ color: "#42A5F5", fontSize: 14, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                      <span style={{ color: "#FFA726", fontSize: 13 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>}

              {/* 구역별 체류/누적 */}
              {zoneData.filter(z => z.name).length > 0 && <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <h4 style={{ color: "#8892b0", fontSize: 13, margin: "0 0 10px" }}>🗺️ 구역별 현황</h4>
                <div style={{ display: "grid", gap: 6 }}>
                  {zoneData.filter(z => z.name).map(z => (
                    <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                      <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, flex: 1 }}>{z.name}</span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: "#66BB6A", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{(z.count || 0).toLocaleString()}</span>
                        <span style={{ color: "#94A3B8", fontSize: 14, margin: "0 4px" }}>/</span>
                        <span style={{ color: "#42A5F5", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{(z.cumulative || 0).toLocaleString()}</span>
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
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "실황"]} />
                  {!selected.isTempDual && selected.thresholds.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 14 }} />}
                  {!selected.isTempDual && selected.thresholds.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" label={{ value: "경계", fill: "#FFA726", fontSize: 14 }} />}
                  <Line type="monotone" dataKey="value" stroke={li.color} strokeWidth={3} dot={{ fill: li.color, r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>}

          {/* 📊 실황 그래프 (인파 외 카테고리: 풍속/강수/기온 등) */}
          {selected.id !== "crowd" && (selected.history || []).length >= 2 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: li.color, fontSize: 13, marginBottom: 8 }}>📊 실황 추이 (최근 24시간)</h3>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={(selected.history || []).slice(-24)} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "실황"]} />
                  {selected.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" label={{ value: "주의", fill: "#FFC107", fontSize: 12 }} />}
                  {selected.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" label={{ value: "경계", fill: "#FFA726", fontSize: 12 }} />}
                  {selected.thresholds?.RED?.[0] > 0 && <ReferenceLine y={selected.thresholds.RED[0]} stroke="#EF5350" strokeDasharray="4 4" label={{ value: "심각", fill: "#EF5350", fontSize: 12 }} />}
                  <Line type="monotone" dataKey="value" stroke={li.color} strokeWidth={2.5} dot={{ fill: li.color, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4, fontSize: 12, color: "#94A3B8" }}>
              <span>● 실시간 측정값</span>
              <span>점선: 임계값</span>
            </div>
          </div>}

          {/* 📊 실황 데이터 부족 안내 (history 너무 짧을 때) */}
          {selected.id !== "crowd" && (selected.history || []).length < 2 && selected.kmaCategory && <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ color: "#94A3B8", fontSize: 13, marginBottom: 4 }}>실황 데이터 수집 중</div>
            <div style={{ color: "#6c6e7d", fontSize: 11 }}>10분마다 자동 갱신됩니다 (현재값: {selected.currentValue}{selected.unit})</div>
          </div>}

          {/* 초단기 예보 그래프 */}
          {(selected.forecast || []).length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#FFA726", fontSize: 13, marginBottom: 8 }}>📋 초단기 예보 (향후 6시간)</h3>
            <div style={{ width: "100%", height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={selected.forecast} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 13 }} />
                  <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "예보"]} />
                  {selected.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" />}
                  {selected.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="value" stroke="#FFA726" strokeWidth={2} strokeDasharray="6 3" dot={{ fill: "#FFA726", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: li.color }} /><span style={{ color: "#94A3B8", fontSize: 14 }}>실황</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: "#FFA726", borderTop: "2px dashed #FF9800" }} /><span style={{ color: "#94A3B8", fontSize: 14 }}>예보</span></div>
            </div>
          </div>}

          {/* 단기 예보 그래프 (향후 3일) */}
          {(selected.shortForecast || []).length > 0 && <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#42A5F5", fontSize: 13, marginBottom: 8 }}>📅 단기 예보 (향후 3일, 3시간 간격)</h3>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={selected.shortForecast} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                  <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 11 }} interval={Math.floor(selected.shortForecast.length / 8)} />
                  <YAxis tick={{ fill: "#556", fontSize: 13 }} width={45} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 13 }} formatter={(v) => [`${Number(v).toLocaleString()} ${selected.unit}`, "단기예보"]} />
                  {selected.thresholds?.YELLOW?.[0] > 0 && <ReferenceLine y={selected.thresholds.YELLOW[0]} stroke="#FFC107" strokeDasharray="4 4" />}
                  {selected.thresholds?.ORANGE?.[0] > 0 && <ReferenceLine y={selected.thresholds.ORANGE[0]} stroke="#FFA726" strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="value" stroke="#42A5F5" strokeWidth={2} dot={{ fill: "#42A5F5", r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 2, background: "#42A5F5" }} /><span style={{ color: "#94A3B8", fontSize: 13 }}>단기예보 (기상청)</span></div>
            </div>
          </div>}

          {/* 기준값 표시 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 16 }}>
            {Object.entries(LEVELS).map(([lk, lvi]) => (<div key={lk} style={{ padding: "8px 10px", borderRadius: 8, background: lk === lv ? lvi.bg : "rgba(255,255,255,0.02)", border: `1px solid ${lk === lv ? lvi.border : "#1a1a2e"}`, textAlign: "center" }}>
              <div style={{ color: lvi.color, fontSize: 14, fontWeight: 700 }}>{lvi.label}</div>
              <div style={{ color: lk === lv ? "#fff" : "#556", fontSize: 13, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{selected.thresholds[lk]?.[0]}~{selected.thresholds[lk]?.[1] === Infinity ? "∞" : selected.thresholds[lk]?.[1]}</div>
            </div>))}
          </div>

          {/* 조치 버튼 — 주의 이상일 때만 */}
          {isWarning && <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button onClick={() => onAction?.(selected.id, "handling")} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: selected.actionStatus === "handling" ? "2px solid #FF9800" : "1px solid #444",
              background: selected.actionStatus === "handling" ? "rgba(255,152,0,0.15)" : "rgba(255,255,255,0.03)",
              color: selected.actionStatus === "handling" ? "#FFA726" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>🔧 조치중</button>
            <button onClick={() => onAction?.(selected.id, "resolved")} style={{
              flex: 1, padding: "12px", borderRadius: 10, border: selected.actionStatus === "resolved" ? "2px solid #4CAF50" : "1px solid #444",
              background: selected.actionStatus === "resolved" ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.03)",
              color: selected.actionStatus === "resolved" ? "#66BB6A" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>✅ 조치완료</button>
          </div>}

          {/* 조치사항 작성 */}
          {isWarning && <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.15)", marginBottom: 12 }}>
            <h4 style={{ color: "#FFA726", fontSize: 13, margin: "0 0 10px", fontWeight: 700 }}>📝 조치사항 작성</h4>
            <textarea id={`action-text-${selected.id}`} placeholder="조치 내용을 입력하세요..." defaultValue={selected.actionReport?.content || ""} style={{ width: "100%", minHeight: 70, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Label style={{ margin: 0, flex: "0 0 auto" }}>담당자</Label>
              <select onChange={e => {}} id={`action-assignee-${selected.id}`} defaultValue={selected.actionReport?.assigneeId || ""} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                <option value="">선택</option>
                {(settings.workers || []).map(w => <option key={w.id} value={w.id}>{w.name} ({w.role === "manager" ? "책임자" : "요원"}) — {w.position || "미배치"}</option>)}
              </select>
            </div>
            <button onClick={() => {
              const txt = document.getElementById(`action-text-${selected.id}`)?.value || "";
              const assigneeId = document.getElementById(`action-assignee-${selected.id}`)?.value || "";
              const worker = (settings.workers || []).find(w => w.id === assigneeId);
              onActionReport?.(selected.id, { content: txt, assigneeId, assigneeName: worker?.name || "" });
            }} style={{ marginTop: 10, width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #FF9800, #F57C00)", color: "#fff", boxShadow: "0 4px 12px rgba(255,152,0,0.3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>💾 조치사항 저장</button>
            {selected.actionReport?.content && <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>최근 조치 기록:</div>
              <div style={{ color: "#E2E8F0", fontSize: 14, whiteSpace: "pre-wrap" }}>{selected.actionReport.content}</div>
              {selected.actionReport.assigneeName && <div style={{ color: "#FFA726", fontSize: 13, marginTop: 4 }}>👤 담당: {selected.actionReport.assigneeName}</div>}
              {selected.actionReport.createdAt && <div style={{ color: "#94A3B8", fontSize: 14, marginTop: 2 }}>🕐 {selected.actionReport.createdAt}</div>}
            </div>}
          </div>}

          {/* 점검사항 */}
          {isWarning && selected.actionItems?.length > 0 && <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h4 style={{ color: "#8892b0", fontSize: 14, margin: "0 0 8px" }}>📋 점검사항</h4>
            {selected.actionItems.map((a, i) => <div key={i} style={{ color: "#999", fontSize: 14, padding: "3px 0" }}>• {a}</div>)}
          </div>}

          {/* CMS 설정 이동 */}
          <button onClick={() => onCardClick(selected.id)} style={{ marginTop: 14, width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>⚙️ CMS 설정으로 이동</button>
          <button onClick={() => setSelectedId(null)} style={{ marginTop: 8, width: "100%", padding: "14px", borderRadius: 10, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>← 전체 현황으로 돌아가기</button>
        </div>
      </div>
    </div>);
  }

  // ── Main Dashboard View ──
  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "16px max(12px, env(safe-area-inset-right)) 80px max(12px, env(safe-area-inset-left))" }}>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:0.9}}`}</style>

    {/* CueFlow 스타일 헤더 카드 */}
    <div style={{ maxWidth: 900, margin: "0 auto 16px", padding: "16px 18px", borderRadius: 20, background: "linear-gradient(135deg, rgba(66,165,245,0.12), rgba(66,165,245,0.02) 50%, rgba(171,71,188,0.06))", border: "1px solid rgba(66,165,245,0.35)", boxShadow: "0 0 0 1px rgba(66,165,245,0.12), 0 8px 40px rgba(66,165,245,0.18), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(66,165,245,0.6), transparent)", opacity: 0.8 }} />
      <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(66,165,245,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: -40, width: 150, height: 150, borderRadius: "50%", background: "radial-gradient(circle, rgba(171,71,188,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, position: "relative" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(66,165,245,0.22), rgba(66,165,245,0.06))", border: "1px solid rgba(66,165,245,0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{settings.logoEmoji || "🎪"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: -0.5, margin: 0, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{settings.festivalName || "축제 안전관리"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, fontFeatureSettings: "'tnum'", fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{fmtTime(now)}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{fmtDate(now)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", position: "relative" }}>
        <span style={{ padding: "5px 12px", borderRadius: 8, background: olv.bg, border: `1px solid ${olv.border}`, color: olv.color, fontSize: 12, fontWeight: 700 }}>{olv.icon} {olv.label}</span>
        {settings.is24HourMode && <span style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.3)", color: "#66BB6A", fontSize: 12, fontWeight: 700 }}><span style={{ animation: "pulse 2s infinite", display: "inline-block" }}>●</span> 24H</span>}
        {loc.name && <span style={{ color: "#94A3B8", fontSize: 12, padding: "5px 4px" }}>📍 {loc.name}</span>}
        {kma.enabled && <span style={{ color: "#66BB6A", fontSize: 12, padding: "5px 4px" }}>🌤️ LIVE</span>}
        <span style={{ flex: 1 }} />
        {onSearch && <button onClick={onSearch} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(156,39,176,0.25)", background: "rgba(156,39,176,0.04)", color: "#AB47BC", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🔍 검색</button>}
        <button onClick={handleRefresh} disabled={spinning} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(33,150,243,0.25)", background: "rgba(33,150,243,0.04)", color: "#42A5F5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <span style={{ display: "inline-block", animation: spinning ? "spin 1s linear infinite" : "none", marginRight: 4 }}>🔄</span>{spinning ? "..." : "최신화"}
        </button>
        {updateAvailable && <button onClick={() => {
          const overlay = document.createElement("div");
          overlay.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999"><div style="width:40px;height:40px;border:3px solid #333;border-top:3px solid #2196F3;border-radius:50%;animation:spin 1s linear infinite"></div><div style="color:#ccd6f6;margin-top:16px;font-size:16px;font-weight:700">업데이트 적용 중...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
          document.body.appendChild(overlay);
          setTimeout(() => { if (window.applySwUpdate) window.applySwUpdate(); else window.location.reload(); }, 500);
        }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 12, fontWeight: 700, cursor: "pointer", animation: "pulse 2s infinite" }}>📲 업데이트</button>}
      </div>
    </div>

    {/* 긴급상황 배너 */}
    {settings.emergencyLevel > 0 && <div style={{ maxWidth: 900, margin: "0 auto 10px", padding: "14px 18px", borderRadius: 14, background: settings.emergencyLevel >= 3 ? "linear-gradient(135deg, rgba(244,67,54,0.2), rgba(244,67,54,0.05))" : "linear-gradient(135deg, rgba(255,152,0,0.15), rgba(255,152,0,0.03))", border: `2px solid ${settings.emergencyLevel >= 3 ? "rgba(244,67,54,0.5)" : "rgba(255,152,0,0.4)"}`, textAlign: "center", animation: settings.emergencyLevel >= 3 ? "blink 1.5s infinite" : "none", boxShadow: settings.emergencyLevel >= 3 ? "0 4px 20px rgba(244,67,54,0.2)" : "none" }}>
      <span style={{ fontSize: 22 }}>🚨</span>
      <span style={{ color: settings.emergencyLevel >= 3 ? "#EF5350" : "#FFA726", fontWeight: 800, fontSize: 18, marginLeft: 8, letterSpacing: -0.3 }}>{["", "1단계: 관심", "2단계: 주의", "3단계: 경계", "4단계: 심각"][settings.emergencyLevel]}</span>
      {settings.emergencyMessage && <div style={{ color: "#E2E8F0", fontSize: 13, marginTop: 6 }}>{settings.emergencyMessage}</div>}
    </div>}

    {/* 📢 공지 */}
    {(settings.notices || []).length > 0 && <div style={{ maxWidth: 1100, margin: "0 auto 6px" }}>
      {settings.notices.map(n => (
        <div key={n.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📢</span>
          <span style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 600, flex: 1 }}>{n.content}</span>
          {(userRole === "admin" || userRole === "manager" || userRole === "sysadmin") && <button onClick={() => onDeleteNotice?.(n.id)} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 12, cursor: "pointer" }}>✕</button>}
        </div>
      ))}
    </div>}

    {/* 조치중 */}
    {(() => { const handling = categories.filter(c => c.actionStatus === "handling"); return handling.length > 0 ? (
      <div style={{ maxWidth: 1100, margin: "0 auto 6px", padding: "8px 12px", borderRadius: 10, background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.2)" }}>
        <span style={{ color: "#FFA726", fontWeight: 700, fontSize: 13 }}>🔧 조치중 {handling.length}건</span>
        {handling.map(cat => <span key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ marginLeft: 8, color: "#E2E8F0", fontSize: 12, cursor: "pointer" }}>{cat.icon}{cat.name}</span>)}
      </div>
    ) : null; })()}

    {/* ═══ 👥 축제장 인원관리 ═══ */}
    <div style={{ maxWidth: 1100, margin: "8px auto 10px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>👥</span>
      <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>축제장 인원관리</span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(33,150,243,0.2), transparent)" }} />
    </div>
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 10 }}>
      {categories.filter(c => c.id === "crowd" && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const fc = cat.forecast || []; const nextFc = fc[0];
        const crowdLS = (() => { try { return JSON.parse(localStorage.getItem("_crowd") || "{}"); } catch { return {}; } })();
        const cumVal = crowdLS.cumulative || 0;
        const gateData = (settings.gates || []).map(g => { const s = (crowdLS.zones || []).find(sz => sz.id === g.id); return { ...g, count: s?.count || 0, cumulative: s?.cumulative || 0 }; });
        return (
        <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: `linear-gradient(145deg, ${li.color}10, rgba(255,255,255,0.03) 60%)`, borderRadius: 16, padding: "16px", border: `1px solid ${li.color}40`, position: "relative", overflow: "hidden", cursor: "pointer", boxShadow: `0 0 0 1px ${li.color}20, 0 8px 32px ${li.color}20, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`, transition: "all 0.3s" }}>
          {/* 상단 글로우 라인 */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${li.color}, transparent)`, opacity: 0.6 }} />
          {/* 코너 글로우 */}
          <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${li.color}30 0%, transparent 70%)`, pointerEvents: "none" }} />
          {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: li.color, animation: "blink 1.5s infinite" }} />}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, position: "relative" }}>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ color: "#E2E8F0", fontWeight: 600, fontSize: 14, letterSpacing: -0.2 }}>체류 인원</span>
            <span style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 8, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 12, fontWeight: 700 }}>{li.icon} {li.label}</span>
            {cat.actionStatus && <span style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(255,152,0,0.15)", color: "#FFA726", fontSize: 12, fontWeight: 700 }}>🔧 조치중</span>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, position: "relative" }}>
            <div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, fontWeight: 500 }}>실황 체류</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: li.color, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'", lineHeight: 1, letterSpacing: -1,  }}>{cat.currentValue.toLocaleString()}</span>
                <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}>{cat.unit}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, fontWeight: 500 }}>누적 방문</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'", color: "#CBD5E1", lineHeight: 1, letterSpacing: -0.5 }}>{cumVal.toLocaleString()}</span>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>명</span>
              </div>
            </div>
          </div>
          {/* 출입구별 현황 */}
          {gateData.filter(g => g.name).length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 6 }}>
            {gateData.filter(g => g.name).map(g => (
              <div key={g.id} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 3, fontWeight: 500 }}>🚪 {g.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ color: "#66BB6A", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" }}>{g.count}</span>
                  <span style={{ color: "#94A3B8", fontSize: 12 }}>체류</span>
                  <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" }}>누적 {g.cumulative}</span>
                </div>
              </div>
            ))}
          </div>}
          {cat.lastUpdated && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 12 }}>업데이트 {cat.lastUpdated}</div>}
        </div>); })}
    </div>
    {/* 구역별 혼잡도 */}
    {settings.features?.congestion !== false && (settings.zones || []).filter(z => z.name && z.dashboardShow !== false && (!z.zoneType || z.zoneType === "normal" || z.zoneType === "performance" || z.zoneType === "parking")).length > 0 && <div style={{ maxWidth: 1100, margin: "8px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 8 }}>
      {(settings.zones || []).filter(z => z.name && z.dashboardShow !== false && (!z.zoneType || z.zoneType === "normal" || z.zoneType === "performance" || z.zoneType === "parking")).map(z => {
        const c = (settings.zoneCongestion || []).find(cc => cc.zoneId === z.id);
        const CL = { smooth: { label: "원활", color: "#66BB6A", icon: "🟢" }, crowded: { label: "혼잡", color: "#FFA726", icon: "🟡" }, danger: { label: "위험", color: "#EF5350", icon: "🔴" } };
        const cl = c ? CL[c.level] : null;
        return (<div key={z.id} style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: `1px solid ${cl?.color || "rgba(255,255,255,0.08)"}55`, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: c?.memo || c?.photos?.length ? 10 : 0 }}>
            <span style={{ fontSize: 16 }}>{cl?.icon || "⚪"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 600 }}>{z.name}</div>
              {c?.reportedAt && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 1 }}>{c.reportedByName} · {c.reportedAt}</div>}
            </div>
            <span style={{ padding: "4px 12px", borderRadius: 10, background: cl ? `${cl.color}20` : "rgba(255,255,255,0.04)", border: cl ? `1px solid ${cl.color}40` : "1px solid rgba(255,255,255,0.06)", color: cl?.color || "#6B7280", fontSize: 12, fontWeight: 700 }}>{cl?.label || "미보고"}</span>
          </div>
          {c?.memo && <div style={{ color: "#8892b0", fontSize: 12, lineHeight: 1.5, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 6 }}>💬 {c.memo}</div>}
          {c?.photos?.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {c.photos.map(p => <div key={p.id} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => setViewPhoto(p)}>
              <img src={p.data} alt="" style={{ width: 100, height: 75, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }} />
              <div style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 2 }}>{p.time}</div>
            </div>)}
          </div>}
        </div>);
      })}
    </div>}

    {/* ═══ 🌍 환경관리 ═══ */}
    {categories.filter(c => c.id !== "crowd" && !EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).length > 0 && <>
      <div style={{ maxWidth: 1100, margin: "18px auto 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>🌍</span>
        <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>환경관리</span>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(76,175,80,0.2), transparent)" }} />
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
        {categories.filter(c => c.id !== "crowd" && !EXCLUDE_FROM_OVERALL.includes(c.id) && settings.dashboardVisible?.[c.id] !== false).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; const fc = cat.forecast || []; const nextFc = fc[0]; return (
          <div key={cat.id} onClick={() => setSelectedId(cat.id)} style={{ background: `linear-gradient(145deg, ${li.color}10, rgba(255,255,255,0.03) 60%)`, borderRadius: 16, padding: "18px", border: `1px solid ${li.color}40`, position: "relative", overflow: "hidden", cursor: "pointer", boxShadow: `0 0 0 1px ${li.color}20, 0 8px 28px ${li.color}18, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`, transition: "all 0.3s" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${li.color}, transparent)`, opacity: 0.6 }} />
            <div style={{ position: "absolute", top: -40, right: -40, width: 100, height: 100, borderRadius: "50%", background: `radial-gradient(circle, ${li.color}25 0%, transparent 70%)`, pointerEvents: "none" }} />
            {(lv === "ORANGE" || lv === "RED") && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: li.color, animation: "blink 1.5s infinite" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, position: "relative" }}>
              <span style={{ fontSize: 16 }}>{cat.icon}</span>
              <span style={{ color: "#E2E8F0", fontWeight: 600, fontSize: 14, letterSpacing: -0.2 }}>{cat.name}</span>
              <span style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 8, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 12, fontWeight: 700 }}>{li.icon} {li.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6, fontWeight: 500 }}>실황</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 600, color: li.color, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'", lineHeight: 1, letterSpacing: -1.5,  }}>{cat.currentValue.toLocaleString()}</span>
                  <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}>{cat.unit}</span>
                </div>
              </div>
              {nextFc && <div style={{ textAlign: "right" }}>
                <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6, fontWeight: 500 }}>예보</div>
                <div style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 14, color: nextFc.value > cat.currentValue ? "#EF5350" : nextFc.value < cat.currentValue ? "#42A5F5" : "#556" }}>{nextFc.value > cat.currentValue ? "↑" : nextFc.value < cat.currentValue ? "↓" : "→"}</span>
                  <span style={{ fontSize: 20, fontWeight: 500, fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'", color: "#8892b0", lineHeight: 1, letterSpacing: -0.5 }}>{nextFc.value}</span>
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{nextFc.time}</div>
              </div>}
            </div>
            {fc.length > 1 && <div style={{ display: "flex", gap: 3, height: 16, alignItems: "flex-end", marginBottom: 8 }}>
              {fc.slice(0, 6).map((f, i) => { const vals = fc.slice(0,6).map(x=>x.value); const mn=Math.min(...vals); const mx=Math.max(...vals); const rng=mx-mn||1; const h=3+((f.value-mn)/rng)*13; return <div key={i} title={`${f.time}: ${f.value}${cat.unit}`} style={{ flex:1, height:h, borderRadius:2, background:li.color, opacity:0.15+(i===0?0.5:0.08*(6-i)) }} />; })}
            </div>}
            {cat.lastUpdated && <div style={{ color: "#94A3B8", fontSize: 12 }}>업데이트 {cat.lastUpdated}</div>}
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
                <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 17 }}>{cat.name}</span>
                {tl && <span style={{ padding: "3px 10px", borderRadius: 8, background: tl.includes("저온") || tl.includes("한파") ? "rgba(66,165,245,0.15)" : "rgba(239,83,80,0.15)", border: `1px solid ${tl.includes("저온") || tl.includes("한파") ? "rgba(66,165,245,0.35)" : "rgba(239,83,80,0.35)"}`, color: tl.includes("저온") || tl.includes("한파") ? "#42A5F5" : "#EF5350", fontSize: 12, fontWeight: 700 }}>{tl}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: li.color, fontVariantNumeric: "tabular-nums" }}>{cat.currentValue.toLocaleString()}</span>
                <span style={{ fontSize: 16, color: "#8892b0" }}>{cat.unit}</span>
                {nextFc && <span style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", color: nextFc.value > cat.currentValue ? "#EF5350" : nextFc.value < cat.currentValue ? "#42A5F5" : "#556", marginLeft: 6 }}>{nextFc.value > cat.currentValue ? "↑" : "↓"} {nextFc.value}</span>}
              </div>
            </div>
            <span style={{ padding: "6px 12px", borderRadius: 10, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 15, fontWeight: 700 }}>{li.label}</span>
          </div>
        </div>); })}
    </div>}

    {/* 주차장 */}
    {settings.features?.parking !== false && (settings.parkingLots || []).length > 0 && settings.dashboardVisible?.parking !== false && <div style={{ maxWidth: 1100, margin: "12px auto 0" }}>
      <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8, paddingLeft: 4 }}>🅿️ 주차장 현황</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>
        {(settings.parkingLots || []).map(lot => {
          const pct = lot.capacity > 0 ? Math.round((lot.current||0)/lot.capacity*100) : 0;
          const color = pct>=100?"#EF5350":pct>=90?"#FFA726":pct>=70?"#FFC107":"#66BB6A";
          const label = pct>=100?"만차":pct>=90?"혼잡":pct>=70?"보통":"여유";
          return (<div key={lot.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "16px", border: `1.5px solid ${color}33` }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 20, marginRight: 8 }}>🅿️</span>
              <span style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 16, flex: 1 }}>{lot.name}</span>
              <span style={{ padding: "6px 12px", borderRadius: 8, background: `${color}15`, color, fontSize: 13, fontWeight: 700 }}>{label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
              <span style={{ color, fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{lot.current||0}</span>
              <span style={{ color: "#94A3B8", fontSize: 16 }}>/ {lot.capacity}</span>
              <span style={{ color: "#94A3B8", fontSize: 14, marginLeft: "auto" }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
              <div style={{ height: "100%", width: `${Math.min(pct,100)}%`, background: color, borderRadius: 4, transition: "width .5s" }} />
            </div>
          </div>);
        })}
      </div>
    </div>}

    {/* 셔틀버스 */}
    {settings.features?.shuttle !== false && (settings.shuttleBuses || []).length > 0 && <div style={{ maxWidth: 1100, margin: "12px auto 0" }}>
      <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8, paddingLeft: 4 }}>🚌 셔틀버스 현황</div>
      <div style={{ display: "grid", gap: 10 }}>
        {(settings.shuttleBuses || []).map(bus => {
          const isRun = bus.status === "running";
          const cap = bus.capacity || 45;
          const pax = bus.passengers || 0;
          const pct = Math.round(pax/cap*100);
          const stops = (settings.shuttleStops || []).sort((a,b) => (a.order||0)-(b.order||0));
          const curIdx = stops.findIndex(s => s.id === bus.currentStopId);
          return (<div key={bus.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "16px", border: `1.5px solid ${isRun ? "#66BB6A" : "#FFA726"}33` }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 20, marginRight: 8 }}>🚌</span>
              <span style={{ color: "#E2E8F0", fontWeight: 800, fontSize: 16, flex: 1 }}>{bus.name}</span>
              <span style={{ padding: "6px 12px", borderRadius: 8, background: isRun ? "rgba(76,175,80,0.12)" : "rgba(255,152,0,0.12)", color: isRun ? "#66BB6A" : "#FFA726", fontSize: 13, fontWeight: 700 }}>{isRun ? "● 운행중" : "○ 대기"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>👥</span>
              <span style={{ color: pax>=cap ? "#EF5350" : "#ccd6f6", fontSize: 24, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{pax}</span>
              <span style={{ color: "#94A3B8", fontSize: 14 }}>/ {cap}명</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", marginLeft: 8 }}>
                <div style={{ height: "100%", width: `${Math.min(pct,100)}%`, background: pax>=cap ? "#EF5350" : "#66BB6A", borderRadius: 3, transition: "width .5s" }} />
              </div>
            </div>
            {/* 정류장 노선도 */}
            {stops.length > 0 && <div style={{ padding: "10px 0 4px" }}>
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                {/* 연결선 */}
                <div style={{ position: "absolute", top: 10, left: 10, right: 10, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, zIndex: 0 }} />
                {curIdx >= 0 && <div style={{ position: "absolute", top: 10, left: 10, width: `${(curIdx / Math.max(stops.length-1,1)) * (100 - 20/stops.length)}%`, height: 3, background: "#00BCD4", borderRadius: 2, zIndex: 1, transition: "width .5s" }} />}
                {stops.map((stop, si) => {
                  const isCur = si === curIdx;
                  const isPassed = curIdx >= 0 && si < curIdx;
                  const isNext = curIdx >= 0 && si === curIdx + 1;
                  return (<div key={stop.id} style={{ flex: 1, textAlign: "center", position: "relative", zIndex: 2 }}>
                    <div style={{ width: isCur ? 20 : 12, height: isCur ? 20 : 12, borderRadius: "50%", background: isCur ? "#00BCD4" : isPassed ? "#00BCD4" : "#333", border: isCur ? "3px solid #00E5FF" : isNext ? "2px solid #00BCD4" : "2px solid #444", margin: `${isCur ? 0 : 4}px auto`, transition: "all .3s", boxShadow: isCur ? "0 0 8px rgba(0,188,212,0.5)" : "none" }}>
                      {isCur && <span style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 14 }}>📍</span>}
                    </div>
                    <div style={{ color: isCur ? "#00E5FF" : isPassed ? "#00BCD4" : "#556", fontSize: 12, fontWeight: isCur ? 800 : 600, marginTop: 6, lineHeight: 1.2 }}>{stop.name}</div>
                  </div>);
                })}
              </div>
            </div>}
            {bus.route && stops.length === 0 && <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>🛣️ {bus.route}</div>}
          </div>);
        })}
      </div>
    </div>}

    {/* 범례 */}
    {/* 범례 */}
    <div style={{ maxWidth: 1100, margin: "8px auto 0", display: "flex", justifyContent: "center", gap: 10 }}>
      {Object.entries(LEVELS).map(([k, v]) => (<div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} /><span style={{ color: "#94A3B8", fontSize: 12 }}>{v.label}</span></div>))}
    </div>
    {alerts && alerts.length > 0 && (
      <div style={{ maxWidth: 1100, margin: "20px auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, margin: 0 }}>🔔 최근 알림</h3>
          <button onClick={() => onDeleteAlert?.("all")} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>전체 삭제</button>
        </div>
        {alerts.slice(0, 5).map((a, i) => { const ali = LEVELS[a.level]; return (
          <div key={i} style={{ background: ali.bg, borderRadius: 8, padding: "10px 14px", border: `1px solid ${ali.border}`, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: ali.color, fontWeight: 700, fontSize: 14 }}>{ali.icon} {a.category}</span>
            <span style={{ color: "#888", fontSize: 14, flex: 1 }}>{a.message.split("\n")[2] || ""}</span>
            <span style={{ color: "#94A3B8", fontSize: 13 }}>{a.time}</span>
            <button onClick={(e) => { e.stopPropagation(); onDeleteAlert?.(i); }} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "rgba(255,255,255,0.08)", color: "#888", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>
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
          <h3 style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📋 금일 주요 조치사항</h3>

          {/* 진행중 카드 (세로 카드형, 메모까지 한 카드로) */}
          {handling.length > 0 && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "#FFA726", animation: "blink 2s infinite" }}/>
              <span style={{ color: "#FFA726", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>진행 중 ({handling.length}건)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10, marginBottom: 16 }}>
              {handling.map(cat => (
                <div key={cat.id} style={{ borderRadius: 12, border: "1.5px solid rgba(255,167,38,0.35)", background: "linear-gradient(180deg, rgba(255,167,38,0.08), rgba(255,167,38,0.02))", padding: 0, overflow: "hidden", boxShadow: "0 4px 16px -4px rgba(255,167,38,0.2)" }}>
                  {/* 헤더 */}
                  <div style={{ padding: "10px 14px", background: "rgba(255,167,38,0.12)", borderBottom: "1px solid rgba(255,167,38,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{cat.icon}</span>
                      <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{cat.name}</span>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(255,167,38,0.2)", color: "#FFA726", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em" }}>🔧 진행중</span>
                  </div>
                  {/* 본문 - 메모/지시사항 */}
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>📝 지시사항</div>
                    <div style={{ color: "#E2E8F0", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 10 }}>{cat.actionReport?.content || "지시 내용이 없습니다"}</div>
                    {/* 메타 정보 (담당자, 시간) */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px dashed rgba(255,167,38,0.15)" }}>
                      <span style={{ color: cat.actionReport?.assigneeName ? "#FFA726" : "#666", fontSize: 11, fontWeight: 600 }}>
                        {cat.actionReport?.assigneeName ? `👤 ${cat.actionReport.assigneeName}` : "👤 미지정"}
                      </span>
                      <span style={{ color: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                        🕐 {cat.handlingStartedAt || cat.actionReport?.createdAt || "-"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* 완료 항목 */}
          {completed.length > 0 && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: "#66BB6A" }}/>
              <span style={{ color: "#66BB6A", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" }}>완료 ({completed.length}건)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
              {completed.map((r, i) => (
                <div key={i} style={{ borderRadius: 10, border: "1px solid rgba(76,175,80,0.2)", background: "rgba(76,175,80,0.04)", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{r.icon}</span>
                      <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                    </div>
                    <span style={{ color: "#66BB6A", fontSize: 10, fontWeight: 700 }}>✅ 완료</span>
                  </div>
                  {r.instruction && <div style={{ color: "#aaa", fontSize: 12, lineHeight: 1.4, marginBottom: 4 }}>📝 {r.instruction}</div>}
                  {r.resolution && r.resolution !== "완료" && r.resolution !== r.instruction && <div style={{ color: "#94A3B8", fontSize: 12, lineHeight: 1.4 }}>↳ {r.resolution}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(76,175,80,0.15)" }}>
                    {r.assignee && <span style={{ color: "#66BB6A", fontSize: 10, fontWeight: 600 }}>👤 {r.assignee}</span>}
                    <span style={{ color: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace", marginLeft: "auto" }}>{r.resolvedAt}</span>
                  </div>
                </div>
              ))}
            </div>
          </>)}
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
  const hasGates = gates.length > 1 || (gates.length === 1 && gates[0]?.name);
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
      <div style={{ color: "#94A3B8", fontSize: 14 }}>{label}</div>
      <div style={{ color: color || "#ccd6f6", fontSize: 28, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{(value || 0).toLocaleString()}</div>
    </div>
  );

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <div style={{ width: "100%", maxWidth: 500 }}>
      <PageHeader icon="👥" title="인파 계수" subtitle={fmtTime(now)} accent="#66BB6A" />
    </div>

    {showZoneFirst && (() => { const z = zoneData.find(zz => zz.id === myGate.id); return z ? (
      <div style={{ width: "100%", maxWidth: 400, marginBottom: 12, padding: 16, borderRadius: 16, background: "rgba(76,175,80,0.06)", border: "1.5px solid rgba(76,175,80,0.2)", textAlign: "center" }}>
        <div style={{ color: "#66BB6A", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📍 내 출입구: {z.name}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 30 }}>
          <Stat label="체류" value={z.count || 0} color="#66BB6A" />
          <Stat label="누적" value={z.cumulative || 0} color="#42A5F5" />
        </div>
      </div>
    ) : null; })()}

    <div style={{ width: "100%", maxWidth: 400, background: li.bg, border: `2px solid ${li.border}`, borderRadius: 20, padding: 20, textAlign: "center", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 30, marginBottom: 8 }}>
        <div>
          <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>🏃 체류 인원</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: li.color, fontVariantNumeric: "tabular-nums" }}>{curTotal.toLocaleString()}</div>
          <div style={{ color: li.color, fontSize: 14, fontWeight: 700 }}>{li.icon} {li.label}</div>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
        <div>
          <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>📊 누적 방문</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#42A5F5", fontVariantNumeric: "tabular-nums" }}>{cumTotal.toLocaleString()}</div>
          <div style={{ color: "#94A3B8", fontSize: 14 }}>총 방문객</div>
        </div>
      </div>
      {settings.venueArea > 0 && <div style={{ color: "#8892b0", fontSize: 13 }}>밀집도: {(curTotal / settings.venueArea).toFixed(2)}명/㎡</div>}
    </div>

    {hasGates && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => setSelZone(null)} style={{ padding: "8px 14px", borderRadius: 8, border: !selZone ? "1.5px solid #2196F3" : "1px solid #333", background: !selZone ? "rgba(33,150,243,0.15)" : "transparent", color: !selZone ? "#42A5F5" : "#667", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>전체</button>
        {zoneData.filter(z => z.name).map(z => (
          <button key={z.id} onClick={() => setSelZone(z.id)} style={{ padding: "8px 14px", borderRadius: 8, border: selZone === z.id ? "1.5px solid #4CAF50" : "1px solid #333", background: selZone === z.id ? "rgba(76,175,80,0.15)" : "transparent", color: selZone === z.id ? "#66BB6A" : "#667", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {z.name} ({z.count || 0})
          </button>
        ))}
      </div>
      {selZone && !showZoneFirst && (() => { const z = zoneData.find(zz => zz.id === selZone); return z ? (
        <div style={{ textAlign: "center", marginTop: 8, padding: 10, background: "rgba(76,175,80,0.06)", borderRadius: 8, border: "1px solid rgba(76,175,80,0.15)" }}>
          <span style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700 }}>📍 {z.name}</span>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 6 }}>
            <Stat label="체류" value={z.count || 0} color="#66BB6A" />
            <Stat label="누적" value={z.cumulative || 0} color="#42A5F5" />
          </div>
        </div>
      ) : null; })()}
    </div>}

    <div style={{ width: "100%", maxWidth: 400 }}>
      <div style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▲ 입장 (체류 + 누적 증가)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
      </div>
      <div style={{ color: "#EF5350", fontSize: 13, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>▼ 퇴장 (체류만 감소, 누적 유지)</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        {[1, 5, 10, 50].map(n => <button key={n} onClick={() => adjustTotal(-n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input id="cc" type="number" placeholder="직접 입력" style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 16 }} />
        <button onClick={() => { const e = document.getElementById("cc"); const v = parseInt(e.value); if (!isNaN(v)) { adjustTotal(v); e.value = ""; } }} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontWeight: 700, cursor: "pointer" }}>적용</button>
      </div>
    </div>

    {hasGates && <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>🗺️ 출입구별 현황</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {zoneData.filter(z => z.name).map(z => (
          <div key={z.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: selZone === z.id ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)", borderRadius: 8, border: selZone === z.id ? "1px solid rgba(76,175,80,0.2)" : "1px solid transparent" }}>
            <span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{z.name}</span>
            <span style={{ color: "#66BB6A", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 50, textAlign: "right" }}>{(z.count || 0).toLocaleString()}</span>
            <span style={{ color: "#94A3B8", fontSize: 14, margin: "0 2px" }}>/</span>
            <span style={{ color: "#42A5F5", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 50, textAlign: "right" }}>{(z.cumulative || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>}

    <div style={{ width: "100%", maxWidth: 400, marginBottom: 14 }}>
      <button onClick={() => setShowExport(!showExport)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>{showExport ? "▲ 닫기" : "📊 데이터 관리 / 엑셀 내보내기"}</button>
      {showExport && <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 8 }}>
        <button onClick={saveDailyRecord} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4CAF50,#388E3C)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📋 금일 데이터 저장 (일일 마감)</button>
        <button onClick={() => exportExcel("hourly")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📥 시간별 현황 엑셀</button>
        <button onClick={() => exportExcel("daily")} style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📥 일자별 현황 엑셀</button>
        <button onClick={() => exportExcel("all")} style={{ padding: "10px", borderRadius: 8, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📥 전체 데이터 엑셀</button>
      </div>}
    </div>

    <div style={{ width: "100%", maxWidth: 400 }}>
      <h3 style={{ color: "#8892b0", fontSize: 13, marginBottom: 8 }}>입력 기록</h3>
      <div style={{ maxHeight: 160, overflow: "auto" }}>
        {log.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6, color: "#aaa", fontSize: 13 }}>
          <span style={{ color: l.delta > 0 ? "#66BB6A" : "#EF5350", fontWeight: 700 }}>{l.delta > 0 ? "+" : ""}{l.delta}</span>
          {l.zone && <span style={{ color: "#94A3B8" }}>{l.zone}</span>}
          <span>체류 {l.total.toLocaleString()}</span>
          <span style={{ color: "#42A5F5" }}>누적 {(l.cum || 0).toLocaleString()}</span>
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

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <PageHeader icon="🅿️" title="주차장 관리" subtitle={`${fmtTime(now)} 기준`} accent="#AB47BC" />

    {myLots.length === 0 && <EmptyState icon="🅿️" title="배정된 주차장이 없습니다" description="관리자에게 주차장 배정을 요청하세요" />}

    {myLots.map(lot => {
      const lv = getParkingLevel(lot); const li = LEVELS[lv];
      const remain = lot.capacity - (lot.current || 0);
      const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
      return (
        <div key={lot.id} style={{ maxWidth: 400, margin: "0 auto 20px", background: "rgba(255,255,255,0.03)", borderRadius: 20, padding: 24, border: `2px solid ${li.border}` }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>🅿️ {lot.name}</h3>
            {lot.address && <p style={{ color: "#94A3B8", fontSize: 13, margin: 0 }}>📍 {lot.address}</p>}
          </div>

          {/* 현황 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ color: "#8892b0", fontSize: 14, marginBottom: 4 }}>현재 주차</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: li.color, fontVariantNumeric: "tabular-nums" }}>{(lot.current || 0).toLocaleString()}</div>
            <div style={{ color: "#8892b0", fontSize: 13 }}>/ {lot.capacity.toLocaleString()}대</div>
            <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: li.color, borderRadius: 4, transition: "width .5s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ color: li.color, fontSize: 14, fontWeight: 700 }}>{pct.toFixed(0)}% 사용</span>
              <span style={{ color: remain <= 0 ? "#EF5350" : "#66BB6A", fontSize: 14, fontWeight: 700 }}>잔여 {remain}대</span>
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
            {[1, 5, 10].map(n => <button key={n} onClick={() => adjustParking(lot.id, n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>+{n}</button>)}
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {[1, 5, 10].map(n => <button key={n} onClick={() => adjustParking(lot.id, -n)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input id={`pk-${lot.id}`} type="number" placeholder="직접 입력" style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} />
            <button onClick={() => { const e = document.getElementById(`pk-${lot.id}`); const v = parseInt(e.value); if (!isNaN(v)) { adjustParking(lot.id, v); e.value = ""; } }} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontWeight: 700, cursor: "pointer" }}>적용</button>
          </div>
          {lot.lastUpdated && <div style={{ textAlign: "center", marginTop: 8, color: "#94A3B8", fontSize: 14 }}>🕐 {lot.lastUpdated}</div>}
        </div>
      );
    })}
    </div>
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

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <PageHeader icon="🚌" title="셔틀버스 관리" subtitle={`${fmtTime(now)} 기준`} accent="#00BCD4" />

    {myBuses.length === 0 && <EmptyState icon="🚌" title="배정된 셔틀버스가 없습니다" description="관리자에게 배정을 요청하세요" />}

    {myBuses.map(bus => {
      const statusColors = { running: "#66BB6A", stopped: "#FFA726", off: "#EF5350" };
      const statusLabels = { running: "🟢 운행중", stopped: "🟡 대기중", off: "🔴 운행종료" };
      const sc = statusColors[bus.status || "off"];
      const cap = bus.capacity || 45;
      const pax = bus.passengers || 0;
      const isFull = pax >= cap;
      const paxPct = Math.min((pax / cap) * 100, 100);
      const paxColor = isFull ? "#EF5350" : pax >= cap * 0.8 ? "#FFA726" : "#66BB6A";
      return (
        <div key={bus.id} style={{ maxWidth: 500, margin: "0 auto 20px", background: "rgba(255,255,255,0.03)", borderRadius: 20, padding: 24, border: `2px solid ${sc}33` }}>
          {/* 버스 정보 */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 36 }}>🚌</div>
            <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "4px 0" }}>{bus.name}</h3>
            {bus.route && <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 4px" }}>노선: {bus.route}</p>}
            <span style={{ color: "#94A3B8", fontSize: 13 }}>{cap}인승</span>
            <div style={{ marginTop: 8 }}>
              <span style={{ padding: "4px 14px", borderRadius: 20, background: `${sc}22`, border: `1px solid ${sc}44`, color: sc, fontSize: 14, fontWeight: 700 }}>{statusLabels[bus.status || "off"]}</span>
            </div>
          </div>

          {/* ★ 탑승인원 카운터 */}
          <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: isFull ? "rgba(244,67,54,0.08)" : "rgba(76,175,80,0.05)", border: `1.5px solid ${isFull ? "rgba(244,67,54,0.2)" : "rgba(76,175,80,0.12)"}` }}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>탑승인원</div>
              <div style={{ fontSize: 42, fontWeight: 900, color: paxColor, fontVariantNumeric: "tabular-nums" }}>{pax}</div>
              <div style={{ color: "#8892b0", fontSize: 13 }}>/ {cap}명</div>
              {isFull && <div style={{ marginTop: 6, padding: "6px 20px", borderRadius: 20, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 14, fontWeight: 800, display: "inline-block", animation: "blink 1.5s infinite" }}>🚫 만차</div>}
            </div>
            {/* 프로그레스 바 */}
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${paxPct}%`, background: paxColor, borderRadius: 5, transition: "width .3s" }} />
            </div>
            {/* +/- 버튼 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[1, 5, 10].map(n => <button key={n} onClick={() => updateBus(bus.id, { passengers: Math.min(cap, pax + n) })} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #2a4a3a", background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 18, fontWeight: 800, cursor: isFull ? "not-allowed" : "pointer", opacity: isFull ? 0.4 : 1 }} disabled={isFull}>+{n}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {[1, 5, 10].map(n => <button key={n} onClick={() => updateBus(bus.id, { passengers: Math.max(0, pax - n) })} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #4a2a2a", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>-{n}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => updateBus(bus.id, { passengers: 0 })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #555", background: "transparent", color: "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 초기화 (0명)</button>
              <button onClick={() => updateBus(bus.id, { passengers: cap })} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${isFull ? "#a33" : "#555"}`, background: isFull ? "rgba(244,67,54,0.1)" : "transparent", color: isFull ? "#EF5350" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🚫 만차 ({cap}명)</button>
            </div>
          </div>

          {/* 현재 위치 */}
          {bus.currentStopName && <div style={{ textAlign: "center", marginBottom: 16, padding: 14, borderRadius: 12, background: "rgba(0,188,212,0.08)", border: "1px solid rgba(0,188,212,0.15)" }}>
            <div style={{ color: "#8892b0", fontSize: 13, marginBottom: 4 }}>현재 위치</div>
            <div style={{ color: "#00BCD4", fontSize: 20, fontWeight: 800 }}>📍 {bus.currentStopName}</div>
            {bus.lastUpdated && <div style={{ color: "#94A3B8", fontSize: 14, marginTop: 4 }}>🕐 {bus.lastUpdated}</div>}
          </div>}

          {/* 운행 상태 버튼 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ s: "running", l: "🟢 운행", c: "#66BB6A" }, { s: "stopped", l: "🟡 대기", c: "#FFA726" }, { s: "off", l: "🔴 종료", c: "#EF5350" }].map(st => (
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
                    <span style={{ width: 32, height: 32, borderRadius: 14, background: isCurrent ? "#00BCD4" : "#333", color: isCurrent ? "#fff" : "#888", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
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
    </div>
  </div>);
}

// ─── Photo Viewer Modal ──────────────────────────────────────────
function PhotoViewer({ photo, onClose, onDelete }) {
  if (!photo) return null;
  return (<div onClick={onClose} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <img src={photo.data} alt="" style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "#8892b0", fontSize: 14 }}>🕐 {photo.time}</span>
      {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #F44336", background: "rgba(244,67,54,0.15)", color: "#EF5350", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗑 사진 삭제</button>}
      <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #555", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, cursor: "pointer" }}>닫기</button>
    </div>
  </div>);
}

// ─── Festival Status Page (축제관리) ─────────────────────────────
function FestivalStatusPage({ settings, setSettings, session, accounts, setAccounts }) {
  const nowFSP = useNow(30000);
  const zones = settings.zones || [];
  const workSites = settings.workSites || [];
  const isAdmin = session?.role === "admin" || session?.role === "manager" || session?.role === "sysadmin" || session?.role === "zonemgr";
  const myZone = zones.find(z => z.accountId === session?.id);
  const [mode, setMode] = useState("festival");
  const [reqTarget, setReqTarget] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [pgDateSel, setPgDateSel] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (settings.festivalDates || []).includes(today) ? today : (settings.festivalDates || [])[0] || today;
  });
  const [pgCatOpen, setPgCatOpen] = useState({ always: false, O: false, P: true, E: false, S: false });
  const [editFspWorker, setEditFspWorker] = useState(null); // { siteId, workerId }
  const [addWorkerSiteId, setAddWorkerSiteId] = useState(null);
  const [newWorker, setNewWorker] = useState({ name: "", phone: "", role: "운영" });
  const [zoneOpen, setZoneOpen] = useState(() => {
    const open = {};
    (settings.zones || []).forEach(z => { open[z.id] = z.accountId === session?.id; });
    return open;
  });
  const toggleZone = (zid) => setZoneOpen(p => ({ ...p, [zid]: !p[zid] }));

  const SITE_CONG = { smooth: { label: "여유", color: "#66BB6A", icon: "🟢" }, crowded: { label: "보통", color: "#FFA726", icon: "🟡" }, danger: { label: "밀집", color: "#EF5350", icon: "🔴" } };

  const STATUS_NORMAL = { standby: { label: "대기", color: "#8892b0", icon: "⏳" }, active: { label: "진행", color: "#66BB6A", icon: "🟢" }, break: { label: "휴식", color: "#FFA726", icon: "☕" }, done: { label: "종료", color: "#94A3B8", icon: "⬛" } };
  const STATUS_SAFETY = { monitoring: { label: "상황관리중", color: "#42A5F5", icon: "🔍" }, fieldSupport: { label: "현장지원", color: "#FFA726", icon: "🚨" }, incident: { label: "사고대처", color: "#EF5350", icon: "🆘" } };
  const STATUS_SUPPORT = { waiting: { label: "지원대기", color: "#8892b0", icon: "⏳" }, moving: { label: "현장이동중", color: "#FFA726", icon: "🚗" }, supporting: { label: "현장지원중", color: "#66BB6A", icon: "🚑" } };
  const STATUS_PERFORMANCE = { standby: { label: "대기", color: "#8892b0", icon: "⏳" }, rehearsal: { label: "리허설", color: "#FFA726", icon: "🎤" }, performing: { label: "공연중", color: "#AB47BC", icon: "🎭" }, done: { label: "종료", color: "#94A3B8", icon: "⬛" } };
  const STATUS_PARKING = { smooth: { label: "원활", color: "#66BB6A", icon: "🟢" }, crowded: { label: "혼잡", color: "#FFA726", icon: "🟡" }, full: { label: "만차", color: "#EF5350", icon: "🔴" } };
  const STATUS_ENTRY = { smooth: { label: "원활", color: "#66BB6A", icon: "🟢" }, crowded: { label: "혼잡", color: "#FFA726", icon: "🟡" }, dense: { label: "밀집", color: "#EF5350", icon: "🔴" } };
  const getStatusMap = (zone) => { const t = zone?.zoneType; return t === "safety" ? STATUS_SAFETY : t === "support" ? STATUS_SUPPORT : t === "performance" ? STATUS_PERFORMANCE : t === "parking" ? STATUS_PARKING : t === "entry" ? STATUS_ENTRY : STATUS_NORMAL; };

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
  const performanceZones = zones.filter(z => z.zoneType === "performance" && z.name);
  const parkingZones = zones.filter(z => z.zoneType === "parking" && z.name);
  const entryZones = zones.filter(z => z.zoneType === "entry" && z.name);
  const normalZones = zones.filter(z => (!z.zoneType || z.zoneType === "normal" || z.zoneType === "none") && z.name);
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
    const isRunning = site.status === "active" || site.status === "break";
    const sc = isRunning && site.congestion ? SITE_CONG[site.congestion] : null;
    const setCong = (siteId, level) => setSettings(prev => ({ ...prev, workSites: (prev.workSites || []).map(s => s.id === siteId ? { ...s, congestion: level } : s) }));
    return (<div key={site.id} style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12 }}>🏠</span>
        <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700, flex: 1 }}>{site.name}</span>
        {sc && <span style={{ padding: "3px 8px", borderRadius: 6, background: `${sc.color}15`, color: sc.color, fontSize: 12, fontWeight: 700 }}>{sc.icon}{sc.label}</span>}
        <span style={{ padding: "3px 8px", borderRadius: 8, background: `${st.color}22`, color: st.color, fontSize: 12, fontWeight: 700 }}>{st.icon} {st.label}</span>
      </div>
      {canEdit && <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {Object.entries(statusMap).map(([k, v]) => (
          <button key={k} onClick={() => { setStatus(site.id, k); if (k !== "active" && k !== "break") setCong(site.id, null); }} style={{ flex: 1, padding: "10px 4px", borderRadius: 8, border: site.status === k ? `2px solid ${v.color}` : "1px solid #333", background: site.status === k ? `${v.color}15` : "transparent", color: v.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.icon} {v.label}</button>
        ))}
      </div>}
      {canEdit && isRunning && <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {Object.entries(SITE_CONG).map(([k, v]) => (
          <button key={k} onClick={() => setCong(site.id, site.congestion === k ? null : k)} style={{ flex: 1, padding: "10px 4px", borderRadius: 8, border: site.congestion === k ? `2px solid ${v.color}` : "1px solid #222", background: site.congestion === k ? `${v.color}10` : "transparent", color: v.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.icon} {v.label}</button>
        ))}
      </div>}
      {(site.workers || []).map(w => {
        const isEditing = editFspWorker?.siteId === site.id && editFspWorker?.workerId === w.id;
        const updateW = (field, val) => { const ws = JSON.parse(JSON.stringify(settings.workSites || [])); const si = ws.findIndex(s => s.id === site.id); if (si >= 0) { ws[si].workers = ws[si].workers.map(ww => ww.id === w.id ? { ...ww, [field]: val } : ww); setSettings(prev => ({ ...prev, workSites: ws })); } };
        const moveW = (toSiteId) => { const ws = JSON.parse(JSON.stringify(settings.workSites || [])); const fi = ws.findIndex(s => s.id === site.id); const ti = ws.findIndex(s => s.id === toSiteId); if (fi >= 0 && ti >= 0 && fi !== ti) { const wk = ws[fi].workers.find(ww => ww.id === w.id); ws[fi].workers = ws[fi].workers.filter(ww => ww.id !== w.id); ws[ti].workers = [...(ws[ti].workers||[]), wk]; setSettings(prev => ({ ...prev, workSites: ws })); setEditFspWorker(null); } };
        const deleteW = () => { if (!confirm(`${w.name} 삭제?`)) return; const ws = JSON.parse(JSON.stringify(settings.workSites || [])); const si = ws.findIndex(s => s.id === site.id); if (si >= 0) { ws[si].workers = ws[si].workers.filter(ww => ww.id !== w.id); setSettings(prev => ({ ...prev, workSites: ws })); setEditFspWorker(null); } };

        if (isEditing && isAdmin) {
          const WSTAT = { working: { label: "근무중", color: "#66BB6A", icon: "🟢" }, away: { label: "자리비움", color: "#FFA726", icon: "🟡" }, moving: { label: "이동중", color: "#42A5F5", icon: "🔵" }, off: { label: "근무종료", color: "#94A3B8", icon: "⚫" } };
          return (<div key={w.id} style={{ padding: "14px", borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "2px solid rgba(33,150,243,0.2)", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>✏️</span>
              <span style={{ color: "#42A5F5", fontSize: 15, fontWeight: 800, flex: 1 }}>근무자 수정</span>
              <button onClick={() => setEditFspWorker(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>닫기 ✕</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {/* 상태 버튼 */}
              <div>
                <label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 6, display: "block" }}>현재 상태</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  {Object.entries(WSTAT).map(([k, v]) => (
                    <button key={k} onClick={() => updateW("wStatus", w.wStatus === k ? null : k)} style={{ padding: "10px 4px", borderRadius: 8, border: w.wStatus === k ? `2px solid ${v.color}` : "1px solid #333", background: w.wStatus === k ? `${v.color}15` : "transparent", color: v.color, fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{v.icon}<br/>{v.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>이름</label><Input value={w.name} onChange={e => updateW("name", e.target.value)} /></div>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>연락처</label><Input value={w.phone || ""} onChange={e => updateW("phone", e.target.value)} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>근무유형</label><Input value={w.type || ""} onChange={e => updateW("type", e.target.value)} /></div>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>역할</label><select value={w.role || ""} onChange={e => updateW("role", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                  {["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
                </select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>근무지 이동</label>
                <select onChange={e => { if (e.target.value) moveW(e.target.value); }} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                  <option value="">현재: {site.name}</option>
                  {(settings.workSites || []).filter(s => s.id !== site.id).map(s => {
                    const z = (settings.zones || []).find(zz => zz.id === s.zoneId);
                    return <option key={s.id} value={s.id}>{s.id === "_pool" ? "⚠️ 미배치" : `${z ? `📍${z.name} → ` : ""}${s.name}`}</option>;
                  })}
                </select></div>
                <div><label style={{ color: "#94A3B8", fontSize: 12, marginBottom: 4, display: "block" }}>계정 연결</label>
                <select value={w.accountId || ""} onChange={e => updateW("accountId", e.target.value || null)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                  <option value="">없음</option>
                  {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditFspWorker(null)} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>✅ 수정 완료</button>
                <button onClick={deleteW} style={{ padding: "12px 18px", borderRadius: 10, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗑 삭제</button>
              </div>
            </div>
          </div>);
        }

        const WSTAT2 = { working: { label: "근무중", color: "#66BB6A", icon: "🟢" }, away: { label: "자리비움", color: "#FFA726", icon: "🟡" }, moving: { label: "이동중", color: "#42A5F5", icon: "🔵" }, off: { label: "근무종료", color: "#94A3B8", icon: "⚫" } };
        const ws2 = WSTAT2[w.wStatus];
        return (<div key={w.id} onClick={isAdmin ? () => setEditFspWorker({ siteId: site.id, workerId: w.id }) : undefined} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, fontSize: 13, cursor: isAdmin ? "pointer" : "default", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", marginBottom: 3, opacity: w.wStatus === "off" ? 0.4 : 1 }}>
          <span style={{ fontSize: 14 }}>{ws2 ? ws2.icon : "👤"}</span>
          <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 14, flex: 1 }}>{w.name}</span>
          {ws2 && <span style={{ padding: "3px 8px", borderRadius: 6, background: `${ws2.color}15`, color: ws2.color, fontSize: 12, fontWeight: 700 }}>{ws2.label}</span>}
          {w.type && <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(206,147,216,0.1)", color: "#E1BEE7", fontSize: 12, fontWeight: 600 }}>{w.type}</span>}
          {w.role && <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(0,150,136,0.1)", color: "#009688", fontSize: 12, fontWeight: 600 }}>{w.role}</span>}
          {w.accountId && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 12 }}>🔑</span>}
          {w.phone && <a href={`tel:${w.phone.replace(/-/g, "")}`} onClick={e => e.stopPropagation()} style={{ color: "#66BB6A", fontSize: 13, textDecoration: "none" }}>📞</a>}
          {isAdmin && <span style={{ color: "#42A5F5", fontSize: 12 }}>✏️</span>}
        </div>);
      })}
      {isAdmin && addWorkerSiteId === site.id && <div style={{ padding: "14px", borderRadius: 12, background: "rgba(76,175,80,0.04)", border: "2px solid rgba(76,175,80,0.2)", marginTop: 4, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>👤</span>
          <span style={{ color: "#66BB6A", fontSize: 14, fontWeight: 800, flex: 1 }}>근무자 추가</span>
          <button onClick={() => setAddWorkerSiteId(null)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>닫기 ✕</button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ color: "#94A3B8", fontSize: 12, display: "block", marginBottom: 4 }}>이름 *</label><Input value={newWorker.name} onChange={e => setNewWorker(p => ({ ...p, name: e.target.value }))} placeholder="홍길동" /></div>
            <div><label style={{ color: "#94A3B8", fontSize: 12, display: "block", marginBottom: 4 }}>연락처</label><Input value={newWorker.phone} onChange={e => setNewWorker(p => ({ ...p, phone: e.target.value }))} placeholder="010-0000-0000" /></div>
          </div>
          <div><label style={{ color: "#94A3B8", fontSize: 12, display: "block", marginBottom: 4 }}>역할</label>
            <select value={newWorker.role} onChange={e => setNewWorker(p => ({ ...p, role: e.target.value }))} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
              {["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={() => {
            if (!newWorker.name) return;
            const wid = "w_" + Date.now();
            let worker = { id: wid, name: newWorker.name, phone: newWorker.phone, type: "", role: newWorker.role, duty: "" };
            // 🔐 자동 계정 생성: 이름이 ID, 비밀번호 1234
            if (setAccounts && accounts) {
              const accountId = newWorker.name.trim();
              const exists = accounts.find(a => a.id === accountId);
              if (!exists) {
                const roleMap = { "주차": "parking", "주차요원": "parking", "셔틀": "shuttle", "셔틀요원": "shuttle", "계수": "counter", "계수원": "counter", "구역": "zonemgr", "구역관리": "zonemgr", "구역관리자": "zonemgr", "무대": "stagemgr", "무대관리": "stagemgr", "관리자": "manager", "운영자": "manager", "운영": "manager", "지원": "manager", "안전관리": "manager", "기술": "manager" };
                const accRole = roleMap[newWorker.role] || "manager";
                const fid = settings.festivalId || session?.festivalId || "default";
                setAccounts(prev => [...prev, { id: accountId, password: simpleHash("1234"), name: newWorker.name, role: accRole, festivalId: fid, festivals: [fid], workerId: wid, siteId: site.id }]);
                worker.accountId = accountId;
                alert(`✅ 근무자 등록 완료\n\n👤 ${newWorker.name}\n🆔 로그인 ID: ${accountId}\n🔑 비밀번호: 1234`);
              } else {
                alert(`⚠️ 동일 ID 존재: ${accountId}\n근무자만 등록되었습니다.`);
              }
            }
            const ws = JSON.parse(JSON.stringify(settings.workSites || []));
            const si = ws.findIndex(s => s.id === site.id);
            if (si >= 0) { ws[si].workers = [...(ws[si].workers || []), worker]; setSettings(prev => ({ ...prev, workSites: ws })); }
            setNewWorker({ name: "", phone: "", role: "운영" });
            setAddWorkerSiteId(null);
          }} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4CAF50, #388E3C)", color: "#fff", boxShadow: "0 4px 12px rgba(76,175,80,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>✅ 등록</button>
        </div>
      </div>}
      {isAdmin && addWorkerSiteId !== site.id && <button onClick={() => { setAddWorkerSiteId(site.id); setNewWorker({ name: "", phone: "", role: "운영" }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px dashed rgba(33,150,243,0.3)", background: "transparent", color: "#42A5F5", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>+ 근무자 추가</button>}
    </div>);
  };

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 500, margin: "0 auto", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
      {/* v2 페이지 헤더 */}
      <div style={{ padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, rgba(255,167,38,0.12), rgba(255,167,38,0.04))", border: "1px solid rgba(255,167,38,0.25)", borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #FFA726, #FF6F00)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 12px rgba(255,167,38,0.4)" }}>🎪</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f5fa", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{settings.festivalName || "축제관리"}</div>
            <div style={{ fontSize: 11, color: "#b0b3c4", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>운영 {opStart}~{opEnd} · {now.toLocaleTimeString("ko-KR")}</div>
          </div>
        </div>
      </div>

      {/* 긴급상황 배너 */}
      {settings.emergencyLevel > 0 && <div style={{ padding: "14px 16px", borderRadius: 14, background: settings.emergencyLevel >= 3 ? "linear-gradient(180deg, rgba(255,94,126,0.18), rgba(255,94,126,0.04))" : "linear-gradient(180deg, rgba(255,154,60,0.15), rgba(255,154,60,0.04))", border: `1.5px solid ${settings.emergencyLevel >= 3 ? "rgba(255,94,126,0.3)" : "rgba(255,154,60,0.3)"}`, marginBottom: 10, animation: settings.emergencyLevel >= 3 ? "blink 1.5s infinite" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>{["", "🔵", "🟡", "🟠", "🔴"][settings.emergencyLevel]}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: settings.emergencyLevel >= 3 ? "#ff5e7e" : "#ff9a3c", fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>🚨 {["", "1단계: 관심", "2단계: 주의", "3단계: 경계", "4단계: 심각"][settings.emergencyLevel]}</div>
            {settings.emergencyMessage && <div style={{ color: "#E2E8F0", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{settings.emergencyMessage}</div>}
          </div>
          <span style={{ color: "#6c6e7d", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{settings.emergencyAt}</span>
        </div>
      </div>}

      {/* v2 종합 현황 4-카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {[{ label: "구역", value: zones.filter(z=>z.name).length, color: "#6b8aff", icon: "📍" },
          { label: "근무지", value: workSites.filter(s=>s.zoneId).length, color: "#4cd99a", icon: "🏠" },
          { label: "근무자", value: totalWorkers, color: "#a980ff", icon: "👷" },
          { label: "요청", value: pendingCount, color: pendingCount > 0 ? "#ff5e7e" : "#6c6e7d", icon: "🔔" }
        ].map(c => (
          <div key={c.label} style={{ padding: "12px 8px", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: `1px solid ${c.color}25`, textAlign: "center", boxShadow: "0 4px 12px -6px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ color: c.color, fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{c.value}</div>
            <div style={{ color: "#6c6e7d", fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 인파혼잡도 (구역별) + 근무지현황 */}
      {(() => {
        const siteCongs = workSites.filter(s => s.congestion && (s.status === "active" || s.status === "break"));
        const sDanger = siteCongs.filter(s => s.congestion === "danger").length;
        const sCrowded = siteCongs.filter(s => s.congestion === "crowded").length;
        const sSmooth = siteCongs.filter(s => s.congestion === "smooth").length;
        const hasZone = congestionData.length > 0;
        const hasSite = siteCongs.length > 0;
        if (!hasZone && !hasSite) return null;
        return (<div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {hasZone && <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", marginBottom: hasSite ? 6 : 0 }}>
            <span style={{ color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>👥 인파</span>
            {[{ icon: "🟢", label: "원활", count: congestionData.filter(c => c.level === "smooth").length, color: "#4cd99a" },
              { icon: "🟡", label: "혼잡", count: crowdedCount, color: "#f5c451" },
              { icon: "🔴", label: "위험", count: dangerCount, color: "#ff5e7e" }
            ].filter(c => c.count > 0).map(c => (
              <span key={c.label} style={{ padding: "4px 10px", borderRadius: 999, background: `${c.color}15`, color: c.color, fontSize: 11, fontWeight: 700, border: `1px solid ${c.color}25` }}>{c.icon} {c.label} {c.count}</span>
            ))}
          </div>}
          {hasSite && <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }}>
            <span style={{ color: "#6c6e7d", fontSize: 11, fontWeight: 600 }}>🏠 근무지</span>
            {[{ icon: "🟢", label: "여유", count: sSmooth, color: "#4cd99a" },
              { icon: "🟡", label: "보통", count: sCrowded, color: "#f5c451" },
              { icon: "🔴", label: "밀집", count: sDanger, color: "#ff5e7e" }
            ].filter(c => c.count > 0).map(c => (
              <span key={c.label} style={{ padding: "4px 10px", borderRadius: 999, background: `${c.color}15`, color: c.color, fontSize: 11, fontWeight: 700, border: `1px solid ${c.color}25` }}>{c.icon} {c.label} {c.count}</span>
            ))}
          </div>}
        </div>);
      })()}

      {/* v2 모드 전환 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setMode("festival")} style={{ padding: "13px", borderRadius: 12, border: mode === "festival" ? "2px solid #6b8aff" : "1px solid rgba(255,255,255,0.08)", background: mode === "festival" ? "linear-gradient(180deg, rgba(107,138,255,0.15), rgba(107,138,255,0.05))" : "rgba(255,255,255,0.02)", color: mode === "festival" ? "#8fa6ff" : "#94a3b8", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}>🎪 축제관리</button>
        <button onClick={() => setMode("safety")} style={{ padding: "13px", borderRadius: 12, border: mode === "safety" ? "2px solid #ff5e7e" : "1px solid rgba(255,255,255,0.08)", background: mode === "safety" ? "linear-gradient(180deg, rgba(255,94,126,0.15), rgba(255,94,126,0.05))" : "rgba(255,255,255,0.02)", color: mode === "safety" ? "#ff738e" : "#94a3b8", fontSize: 14, fontWeight: 700, cursor: "pointer", position: "relative", letterSpacing: "-0.01em" }}>
          🛡️ 안전관리
          {(pendingCount + dangerCount) > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "linear-gradient(135deg, #ff5e7e, #ff4f72)", color: "#fff", boxShadow: "0 0 10px rgba(255,94,126,0.6)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{pendingCount + dangerCount}</span>}
        </button>
      </div>

      {/* 축제관리 모드 */}
      {mode === "festival" && <>
        {/* 구역 관리 */}
        {normalZones.map(zone => {
          const sites = workSites.filter(s => s.zoneId === zone.id);
          const cg = congestionData.find(c => c.zoneId === zone.id);
          const CL = { smooth: { icon: "🟢" }, crowded: { icon: "🟡" }, danger: { icon: "🔴" } };
          const open = zoneOpen[zone.id];
          const siteCongs = sites.filter(s => s.congestion && (s.status === "active" || s.status === "break")).map(s => SITE_CONG[s.congestion]).filter(Boolean);
          return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
            <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ color: "#42A5F5", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontSize: 14 }}>📍</span>
              <span style={{ color: "#42A5F5", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
              {cg && <span>{CL[cg.level]?.icon}</span>}
              {!open && siteCongs.length > 0 && siteCongs.map((sc, i) => <span key={i} style={{ fontSize: 12 }}>{sc.icon}</span>)}
              <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
            </div>
            {open && sites.map(site => renderSiteBlock(site, STATUS_NORMAL, zone))}
            {open && sites.length === 0 && <div style={{ padding: 12, color: "#94A3B8", fontSize: 12, textAlign: "center" }}>근무지 없음</div>}
          </div>);
        })}
        {normalZones.length === 0 && performanceZones.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 13 }}>관리구역이 없습니다.</div>}

        {/* 공연관리 구역 */}
        {performanceZones.map(zone => {
          const sites = workSites.filter(s => s.zoneId === zone.id);
          const open = zoneOpen[zone.id];
          return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(156,39,176,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
            <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(156,39,176,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ color: "#AB47BC", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontSize: 14 }}>🎭</span>
              <span style={{ color: "#AB47BC", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
              <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
            </div>
            {open && sites.map(site => renderSiteBlock(site, STATUS_PERFORMANCE, zone))}
            {open && sites.length === 0 && <div style={{ padding: 12, color: "#94A3B8", fontSize: 12, textAlign: "center" }}>근무지 없음</div>}
          </div>);
        })}

        {/* 프로그램 현황 */}
        {(settings.programs || []).length > 0 && (() => {
          const now3 = nowFSP;
          const nowMin3 = now3.getHours() * 60 + now3.getMinutes();
          const todayStr3 = now3.toISOString().slice(0, 10);
          const fDates = settings.festivalDates || [];
          const dayNames = ["일","월","화","수","목","금","토"];
          const PGCAT = { O: { l: "공식", c: "#42A5F5", icon: "🔷" }, P: { l: "공연", c: "#E91E63", icon: "🎵" }, E: { l: "체험", c: "#66BB6A", icon: "🎨" }, S: { l: "부대", c: "#FFA726", icon: "🎪" } };

          const allPgs = (settings.programs || []);
          const dayPgs = allPgs.filter(p => p.date === pgDateSel || p.date === "always");
          const isToday3 = pgDateSel === todayStr3;

          // 상시 프로그램: 축제 운영시간 전체 (예: 11:00~21:00, 13:00~21:00)
          const opStart = settings.operatingStart || "08:00";
          const opEnd = settings.operatingEnd || "22:00";
          const [osH] = opStart.split(":").map(Number);
          const [oeH] = opEnd.split(":").map(Number);
          const alwaysPgs = dayPgs.filter(p => {
            if (p.date === "always") return true;
            const [sh] = (p.time || "00:00").split(":").map(Number);
            const [eh] = (p.endTime || "23:59").split(":").map(Number);
            return (eh - sh) >= 6; // 6시간 이상 = 상시로 분류
          });
          const timePgs = dayPgs.filter(p => !alwaysPgs.includes(p));

          // 카테고리별 그룹
          const catGroups = {};
          timePgs.forEach(p => {
            const k = p.category || "S";
            if (!catGroups[k]) catGroups[k] = [];
            catGroups[k].push(p);
          });
          Object.values(catGroups).forEach(arr => arr.sort((a, b) => (a.time || "").localeCompare(b.time || "")));

          // 현재 진행중 카운트
          const currentCount = dayPgs.filter(p => {
            if (!isToday3) return false;
            const [sh, sm] = (p.time || "00:00").split(":").map(Number);
            const [eh, em] = (p.endTime || "23:59").split(":").map(Number);
            return nowMin3 >= sh * 60 + sm && nowMin3 <= eh * 60 + em;
          }).length;

          return (<div style={{ marginTop: 14 }}>
            <div style={{ color: "#E1BEE7", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>🎭 프로그램 현황 {isToday3 && currentCount > 0 && <span style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700 }}>🟢 진행 {currentCount}</span>}</div>

            {/* 일자 선택 */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
              {fDates.map((d, i) => {
                const dt = new Date(d);
                const isToday = d === todayStr3;
                const active = pgDateSel === d;
                return (<button key={d} onClick={() => setPgDateSel(d)} style={{ padding: "8px 14px", borderRadius: 20, border: active ? "2px solid #9C27B0" : isToday ? "1.5px solid #4CAF50" : "1px solid #333", background: active ? "rgba(156,39,176,0.15)" : "transparent", color: active ? "#E1BEE7" : isToday ? "#66BB6A" : "#556", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {dt.getMonth()+1}/{dt.getDate()} ({dayNames[dt.getDay()]}){isToday ? " ★" : ""}
                </button>);
              })}
            </div>

            {/* 상시 프로그램 아코디언 */}
            {alwaysPgs.length > 0 && <div style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(0,150,136,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
              <div onClick={() => setPgCatOpen(p => ({ ...p, always: !p.always }))} style={{ padding: "12px 14px", background: "rgba(0,150,136,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ color: "#009688", fontSize: 14 }}>{pgCatOpen.always ? "▼" : "▶"}</span>
                <span style={{ color: "#009688", fontSize: 14, fontWeight: 700 }}>🔄 상시 프로그램</span>
                <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{alwaysPgs.length}개</span>
              </div>
              {pgCatOpen.always && alwaysPgs.sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(p => {
                const pc = PGCAT[p.category] || { l: "", c: "#556", icon: "" };
                const isEnded3 = p.pgStatus === "ended";
                const [sh3,sm3] = (p.time||"00:00").split(":").map(Number);
                const [eh3,em3] = (p.endTime||"23:59").split(":").map(Number);
                const isNow3 = !isEnded3 && nowMin3 >= sh3*60+sm3 && nowMin3 <= eh3*60+em3;
                const inactive3 = isEnded3 || nowMin3 > eh3*60+em3;
                return (<div key={p.id} style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 8, opacity: inactive3 ? 0.3 : 1, filter: inactive3 ? "grayscale(0.8)" : "none" }}>
                  {isNow3 && <span style={{ color: "#66BB6A", fontSize: 12 }}>🟢</span>}
                  {inactive3 && <span style={{ padding: "2px 5px", borderRadius: 4, background: "rgba(85,85,85,0.15)", color: "#888", fontSize: 12, fontWeight: 700 }}>종료</span>}
                  <span style={{ color: inactive3 ? "#445" : "#ccd6f6", fontSize: 13, fontWeight: 700, flex: 1, textDecoration: isEnded3 ? "line-through" : "none" }}>{p.title}</span>
                  <span style={{ color: "#94A3B8", fontSize: 12 }}>{p.time}~{p.endTime}</span>
                  {p.location && <span style={{ color: "#94A3B8", fontSize: 12 }}>📍{p.location}</span>}
                </div>);
              })}
            </div>}

            {/* 카테고리별 아코디언 */}
            {["O", "P", "E", "S"].filter(k => catGroups[k]?.length > 0).map(k => {
              const cat = PGCAT[k];
              const items = catGroups[k];
              const catOpen = pgCatOpen[k];
              return (<div key={k} style={{ marginBottom: 8, borderRadius: 12, border: `1px solid ${cat.c}22`, overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
                <div onClick={() => setPgCatOpen(p => ({ ...p, [k]: !p[k] }))} style={{ padding: "12px 14px", background: `${cat.c}08`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <span style={{ color: cat.c, fontSize: 14 }}>{catOpen ? "▼" : "▶"}</span>
                  <span style={{ color: cat.c, fontSize: 14, fontWeight: 700 }}>{cat.icon} {cat.l}</span>
                  <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{items.length}개</span>
                </div>
                {catOpen && items.map(p => {
                  const isEnded3 = p.pgStatus === "ended";
                  const [sh3,sm3] = (p.time||"00:00").split(":").map(Number);
                  const [eh3,em3] = (p.endTime||"23:59").split(":").map(Number);
                  const isNow3 = !isEnded3 && nowMin3 >= sh3*60+sm3 && nowMin3 <= eh3*60+em3;
                  const isPast3 = isEnded3 || nowMin3 > eh3*60+em3;
                  return (<div key={p.id} style={{ padding: "8px 14px", borderTop: `1px solid ${cat.c}11`, display: "flex", alignItems: "center", gap: 8, opacity: isPast3 ? 0.3 : 1, filter: isPast3 ? "grayscale(0.8)" : "none" }}>
                    {isNow3 && <span style={{ color: "#66BB6A", fontSize: 12 }}>🟢</span>}
                    {isPast3 && <span style={{ padding: "2px 5px", borderRadius: 4, background: "rgba(85,85,85,0.15)", color: "#888", fontSize: 12, fontWeight: 700 }}>종료</span>}
                    <span style={{ color: "#8892b0", fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 45 }}>{p.time}</span>
                    <span style={{ color: isPast3 ? "#445" : "#ccd6f6", fontSize: 13, fontWeight: 700, flex: 1, textDecoration: isEnded3 ? "line-through" : "none" }}>{p.title}</span>
                    {p.location && <span style={{ color: "#94A3B8", fontSize: 12 }}>📍{p.location}</span>}
                  </div>);
                })}
              </div>);
            })}

            {dayPgs.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 13 }}>해당 일자 프로그램 없음</div>}
          </div>);
        })()}
      </>}

      {/* 안전관리 모드 */}
      {mode === "safety" && <>
        {/* 긴급상황 발령 */}
        {isAdmin && <div style={{ padding: "14px", borderRadius: 12, background: "rgba(244,67,54,0.04)", border: "1px solid rgba(244,67,54,0.15)", marginBottom: 14 }}>
          <div style={{ color: "#EF5350", fontSize: 15, fontWeight: 800, marginBottom: 10 }}>🚨 긴급상황 발령</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
            {[{ lv: 0, label: "해제", color: "#66BB6A" }, { lv: 1, label: "관심", color: "#42A5F5" }, { lv: 2, label: "주의", color: "#FFC107" }, { lv: 3, label: "경계", color: "#FFA726" }, { lv: 4, label: "심각", color: "#EF5350" }].map(e => (
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
            <span style={{ color: "#FFA726", fontSize: 14, fontWeight: 800 }}>🏥 의료 현황</span>
            <span style={{ color: "#FFA726", fontSize: 13 }}>치료중 {(settings.medicalRecords||[]).filter(m=>m.status==="treating").length}</span>
            <span style={{ color: "#42A5F5", fontSize: 13 }}>이송 {(settings.medicalRecords||[]).filter(m=>m.status==="transferred").length}</span>
            <span style={{ color: "#66BB6A", fontSize: 13 }}>귀가 {(settings.medicalRecords||[]).filter(m=>m.status==="discharged").length}</span>
          </div>
          {(settings.medicalRecords||[]).filter(m=>m.status==="treating").map((mr,i) => (
            <div key={mr.id} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)", marginBottom: 3, fontSize: 13, display: "flex", gap: 6 }}>
              <span style={{ color: "#FFA726", fontWeight: 700 }}>🆘</span>
              <span style={{ color: "#E2E8F0" }}>{mr.patient || "환자"} — {mr.symptoms}</span>
              <span style={{ color: "#94A3B8", marginLeft: "auto", fontSize: 12 }}>{mr.location}</span>
            </div>
          ))}
        </div>}

        {myRequests.length > 0 && <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#EF5350", fontSize: 15, fontWeight: 800, marginBottom: 8 }}>🔔 수신 요청 ({myRequests.length}건)</div>
          {myRequests.map(req => {
            const rst = req.status === "accepted" ? { label: "접수완료", color: "#42A5F5", icon: "✅" } : { label: "접수대기", color: "#FFA726", icon: "⏳" };
            return (<div key={req.id} style={{ padding: "14px", borderRadius: 12, background: "rgba(244,67,54,0.04)", border: `1.5px solid ${rst.color}44`, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: rst.color, fontSize: 14, fontWeight: 700 }}>{rst.icon} {rst.label}</span>
                <span style={{ color: "#E2E8F0", fontSize: 14 }}>← {req.fromZoneName}</span>
                <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{req.createdAt}</span>
              </div>
              <div style={{ color: "#E2E8F0", fontSize: 14, padding: "8px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 8 }}>💬 {req.message}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {req.status === "pending" && <button onClick={() => updateReqStatus(req.id, "accepted")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 접수완료</button>}
                <button onClick={() => updateReqStatus(req.id, "completed")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4CAF50, #388E3C)", color: "#fff", boxShadow: "0 4px 12px rgba(76,175,80,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🏁 조치완료</button>
              </div>
            </div>);
          })}
        </div>}

        {myZone && (safetyZones.length > 0 || supportZones.length > 0) && <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
          <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>📨 요청 보내기</div>
          <select value={reqTarget} onChange={e => setReqTarget(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, marginBottom: 8 }}>
            <option value="">대상 선택...</option>
            {safetyZones.map(z => <option key={z.id} value={z.id}>🛡️ {z.name}</option>)}
            {supportZones.map(z => <option key={z.id} value={z.id}>🚑 {z.name}</option>)}
            {parkingZones.map(z => <option key={z.id} value={z.id}>🅿️ {z.name}</option>)}
            {entryZones.map(z => <option key={z.id} value={z.id}>🚪 {z.name}</option>)}
            {performanceZones.map(z => <option key={z.id} value={z.id}>🎭 {z.name}</option>)}
          </select>
          <textarea value={reqMsg} onChange={e => setReqMsg(e.target.value)} placeholder="요청 내용" rows={3} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 8 }} />
          <button onClick={sendRequest} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: reqTarget && reqMsg ? "#EF5350" : "#333", color: "#fff", fontSize: 15, fontWeight: 700, cursor: reqTarget && reqMsg ? "pointer" : "default", opacity: reqTarget && reqMsg ? 1 : 0.5 }}>🚨 요청 전송</button>
        </div>}

        {safetyZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(244,67,54,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(244,67,54,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#EF5350", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🛡️</span><span style={{ color: "#EF5350", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_SAFETY, zone))}
        </div>); })}

        {supportZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(255,152,0,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(255,152,0,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#FFA726", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🚑</span><span style={{ color: "#FFA726", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_SUPPORT, zone))}
        </div>); })}

        {/* 주차관리 구역 */}
        {parkingZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(0,150,136,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(0,150,136,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#009688", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🅿️</span><span style={{ color: "#009688", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_PARKING, zone))}
        </div>); })}

        {/* 출입관리 구역 */}
        {entryZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(121,85,72,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(121,85,72,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#795548", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🚪</span><span style={{ color: "#795548", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_ENTRY, zone))}
        </div>); })}

        {/* 공연관리 구역 */}
        {performanceZones.map(zone => { const sites = workSites.filter(s => s.zoneId === zone.id); const open = zoneOpen[zone.id]; return (<div key={zone.id} style={{ marginBottom: 8, borderRadius: 12, border: "1px solid rgba(156,39,176,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
          <div onClick={() => toggleZone(zone.id)} style={{ padding: "12px 14px", background: "rgba(156,39,176,0.06)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <span style={{ color: "#AB47BC", fontSize: 14 }}>{open ? "▼" : "▶"}</span>
            <span>🎭</span><span style={{ color: "#AB47BC", fontSize: 15, fontWeight: 800, flex: 1 }}>{zone.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.length}개 · {sites.reduce((n,s)=>(s.workers||[]).length+n,0)}명</span>
          </div>
          {open && sites.map(site => renderSiteBlock(site, STATUS_PERFORMANCE, zone))}
        </div>); })}

        {(settings.zoneRequests || []).filter(r => r.status === "completed").length > 0 && <div>
          <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📋 조치완료 이력</div>
          {(settings.zoneRequests || []).filter(r => r.status === "completed").reverse().slice(0, 10).map(r => {
            const tZone = zones.find(z => z.id === r.targetZoneId);
            return <div key={r.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(76,175,80,0.04)", border: "1px solid rgba(76,175,80,0.1)", marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: "#66BB6A", fontWeight: 700 }}>✅</span> {r.fromZoneName} → {tZone?.name} <span style={{ color: "#94A3B8" }}>{r.completedAt}</span>
              <div style={{ color: "#94A3B8" }}>{r.message}</div>
            </div>;
          })}
        </div>}

        {safetyZones.length === 0 && supportZones.length === 0 && parkingZones.length === 0 && entryZones.length === 0 && performanceZones.length === 0 && myRequests.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#94A3B8" }}>안전/지원/주차/출입/공연 구역이 없습니다.</div>}
      </>}
    </div>
  </div>);
}


// ─── Program Page (축제 프로그램) ─────────────────────────────────
function ProgramPage({ settings, setSettings, session, onManage }) {
  const programs = (settings.programs || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const rawDates = settings.festivalDates || [];
  // 축제일자가 없으면 프로그램 데이터에서 자동 추출
  const dates = rawDates.length > 0 ? rawDates : [...new Set(programs.map(p => p.date).filter(d => d && d !== "always"))].sort();
  const [selDate, setSelDate] = useState("all");
  const [selCat, setSelCat] = useState("all");
  const [alwaysOpen, setAlwaysOpen] = useState(false);
  const [detailPgId, setDetailPgId] = useState(null);
  const canControl = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);
  const CATS = { all: { label: "전체", color: "#8892b0" }, O: { label: "공식", color: "#42A5F5" }, P: { label: "공연", color: "#E91E63" }, E: { label: "체험", color: "#66BB6A" }, S: { label: "부대", color: "#FFA726" } };

  const now = useNow(30000); // 30초마다 갱신
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayStr = now.toISOString().slice(0, 10);

  const setPgSt = (pgId, status) => setSettings(prev => ({ ...prev, programs: (prev.programs||[]).map(p => p.id === pgId ? { ...p, pgStatus: p.pgStatus === status ? null : status } : p) }));
  const upPg = (pgId, field, val) => setSettings(prev => ({ ...prev, programs: prev.programs.map(p => p.id === pgId ? { ...p, [field]: val } : p) }));

  // 공통 프로그램 카드
  const renderPgCard = (pg, { compact } = {}) => {
    const [sh, sm] = (pg.time || "00:00").split(":").map(Number);
    const [eh, em] = (pg.endTime || "23:59").split(":").map(Number);
    const pgDate = pg.date && pg.date !== "always" ? new Date(pg.date) : null;
    const dateLabel = pgDate ? `${pgDate.getMonth()+1}/${pgDate.getDate()}` : "";
    const cat = CATS[pg.category] || CATS.all;
    const isEnded = pg.pgStatus === "ended";
    const isDatePast = !isEnded && pg.date && pg.date !== "always" && pg.date < todayStr;
    const isTimePast = !isEnded && !isDatePast && pg.date !== "always" && nowMin > eh*60+em;
    const isPast = isEnded || isTimePast || isDatePast;
    const isNow = !isPast && pg.date !== "always" && nowMin >= sh*60+sm && nowMin <= eh*60+em;
    const isDelayed = !isPast && pg.pgStatus === "delayed";
    const isDetail = detailPgId === pg.id;

    if (isDetail) {
      return (<div key={pg.id} style={{ padding: "16px", borderRadius: 14, background: "rgba(156,39,176,0.04)", border: "2px solid rgba(156,39,176,0.2)", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {isNow && <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(76,175,80,0.15)", color: "#66BB6A", fontSize: 13, fontWeight: 700 }}>● 진행중</span>}
          {isPast && <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(85,85,85,0.15)", color: "#888", fontSize: 13, fontWeight: 700 }}>종료</span>}
          {isDelayed && <span style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,152,0,0.15)", color: "#FFA726", fontSize: 13, fontWeight: 700 }}>⏱ 지연</span>}
          <span style={{ padding: "3px 8px", borderRadius: 4, background: `${cat.color}15`, color: cat.color, fontSize: 12, fontWeight: 700 }}>{cat.label}</span>
          <span style={{ flex: 1 }} />
          <button onClick={(e) => { e.stopPropagation(); setDetailPgId(null); }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>닫기 ✕</button>
        </div>
        {canControl ? <div style={{ display: "grid", gap: 10 }}>
          <div><label style={{ color: "#94A3B8", fontSize: 12 }}>프로그램명</label><Input value={pg.title} onChange={e => upPg(pg.id, "title", e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ color: "#94A3B8", fontSize: 12 }}>시작</label><Input type="time" value={pg.time || ""} onChange={e => upPg(pg.id, "time", e.target.value)} /></div>
            <div><label style={{ color: "#94A3B8", fontSize: 12 }}>종료</label><Input type="time" value={pg.endTime || ""} onChange={e => upPg(pg.id, "endTime", e.target.value)} /></div>
          </div>
          <div><label style={{ color: "#94A3B8", fontSize: 12 }}>장소</label><Input value={pg.location || ""} onChange={e => upPg(pg.id, "location", e.target.value)} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><label style={{ color: "#94A3B8", fontSize: 12 }}>담당자</label><Input value={pg.manager || ""} onChange={e => upPg(pg.id, "manager", e.target.value)} /></div>
            <div><label style={{ color: "#94A3B8", fontSize: 12 }}>연락처</label><Input value={pg.managerPhone || ""} onChange={e => upPg(pg.id, "managerPhone", e.target.value)} /></div>
          </div>
          <div><label style={{ color: "#94A3B8", fontSize: 12 }}>내용</label><textarea value={pg.description || ""} onChange={e => upPg(pg.id, "description", e.target.value)} rows={2} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); setPgSt(pg.id, "delayed"); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: isDelayed ? "2px solid #FF9800" : "1px solid #333", background: isDelayed ? "rgba(255,152,0,0.1)" : "transparent", color: "#FFA726", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>⏱ 지연</button>
            <button onClick={(e) => { e.stopPropagation(); setPgSt(pg.id, "ended"); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: isEnded ? "2px solid #556" : "1px solid #333", background: isEnded ? "rgba(85,85,85,0.1)" : "transparent", color: "#888", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{isEnded ? "↩ 종료해제" : "⬛ 종료"}</button>
          </div>
        </div> : <div>
          <div style={{ color: "#E2E8F0", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{pg.title}</div>
          <div style={{ color: "#8892b0", fontSize: 14 }}>{pg.time}~{pg.endTime} {dateLabel && `· ${dateLabel}`}</div>
          {pg.location && <div style={{ color: "#8892b0", fontSize: 14, marginTop: 4 }}>📍 {pg.location}</div>}
          {pg.manager && <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>👤 {pg.manager}{pg.managerPhone ? ` · 📞 ${pg.managerPhone}` : ""}</div>}
          {pg.description && <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{pg.description}</div>}
        </div>}
      </div>);
    }

    return (<div key={pg.id} onClick={() => setDetailPgId(pg.id)} style={{ padding: compact ? "10px 14px" : "14px 16px", borderRadius: compact ? 10 : 14, background: isPast ? "rgba(255,255,255,0.01)" : isDelayed ? "rgba(255,152,0,0.06)" : isNow ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.03)", border: isPast ? "1px solid #1a1a2e" : isDelayed ? "2px solid rgba(255,152,0,0.3)" : isNow ? "2px solid rgba(76,175,80,0.3)" : "1px solid #222", marginBottom: compact ? 4 : 6, opacity: isPast ? 0.4 : 1, filter: isPast ? "grayscale(0.7)" : "none", cursor: "pointer", transition: "all .3s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 12 }}>
        <div style={{ textAlign: "center", minWidth: compact ? 44 : 54, flexShrink: 0 }}>
          {dateLabel && <div style={{ color: "#8892b0", fontSize: 12 }}>{dateLabel}</div>}
          <div style={{ color: isPast ? "#555" : isDelayed ? "#FFA726" : isNow ? "#66BB6A" : "#ccd6f6", fontSize: compact ? 14 : 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pg.time || "--"}</div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>~{pg.endTime}</div>
        </div>
        <div style={{ width: 3, minHeight: compact ? 30 : 40, background: isPast ? "#333" : isDelayed ? "#FFA726" : isNow ? "#66BB6A" : cat.color, borderRadius: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, flexWrap: "wrap" }}>
            {isNow && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(76,175,80,0.15)", color: "#66BB6A", fontSize: 12, fontWeight: 700, animation: "blink 2s infinite" }}>● 진행중</span>}
            {isDelayed && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,152,0,0.15)", color: "#FFA726", fontSize: 12, fontWeight: 700 }}>⏱ 지연</span>}
            {isPast && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(85,85,85,0.15)", color: "#888", fontSize: 12, fontWeight: 700 }}>종료</span>}
            <span style={{ padding: "3px 8px", borderRadius: 4, background: `${cat.color}15`, color: cat.color, fontSize: 12, fontWeight: 700 }}>{cat.label}</span>
          </div>
          <div style={{ color: isPast ? "#445" : "#ccd6f6", fontSize: compact ? 14 : 16, fontWeight: 800, textDecoration: isEnded ? "line-through" : "none" }}>{pg.title}</div>
          {pg.location && <div style={{ color: "#94A3B8", fontSize: 12 }}>📍 {pg.location}</div>}
        </div>
      </div>
    </div>);
  };


  // 날짜 필터만 적용 (카테고리 카운트용)
  const isAlwaysPg = (p) => {
    if (p.date === "always") return true;
    const [sh] = (p.time || "00:00").split(":").map(Number);
    const [eh] = (p.endTime || "23:59").split(":").map(Number);
    return (eh - sh) >= 6;
  };
  const dateFiltered = programs.filter(p => {
    if (selDate !== "all") {
      if (selDate === "always") return isAlwaysPg(p);
      if (p.date !== selDate && p.date !== "always" && !isAlwaysPg(p)) return false;
      if (p.date !== selDate && p.date !== "always") return false;
    }
    return true;
  });

  const filtered = dateFiltered.filter(p => {
    if (selCat !== "all" && p.category !== selCat) return false;
    return true;
  });

  // 상시 프로그램 분리: date=always 또는 6시간 이상
  const alwaysPgs = filtered.filter(p => {
    if (p.date === "always") return true;
    const [sh] = (p.time || "00:00").split(":").map(Number);
    const [eh] = (p.endTime || "23:59").split(":").map(Number);
    return (eh - sh) >= 6;
  });
  const timePgs = filtered.filter(p => !alwaysPgs.includes(p));

  // 정렬: 진행중 → 예정 → 종료
  const sortedTimePgs = [...timePgs].map(pg => {
    const [sh, sm] = (pg.time || "00:00").split(":").map(Number);
    const [eh, em] = (pg.endTime || "23:59").split(":").map(Number);
    const isEnded = pg.pgStatus === "ended";
    const isTimePast = !isEnded && nowMin > eh*60+em;
    const isDatePast = !isEnded && pg.date && pg.date !== "always" && pg.date < todayStr;
    const isPast = isEnded || isTimePast || isDatePast;
    const isNow = !isPast && pg.date !== "always" && nowMin >= sh*60+sm && nowMin <= eh*60+em;
    const order = isNow ? 0 : isPast ? 2 : 1;
    return { ...pg, _order: order };
  }).sort((a, b) => a._order - b._order || (a.time || "").localeCompare(b.time || ""));

  // 그룹: 진행중 / 시간별(예정) / 종료
  const nowGroup = sortedTimePgs.filter(p => p._order === 0);
  const upcomingPgs = sortedTimePgs.filter(p => p._order === 1);
  const pastPgs = sortedTimePgs.filter(p => p._order === 2);
  const timeGroups = {};
  upcomingPgs.forEach(pg => {
    const h = (pg.time || "00:00").split(":")[0];
    const key = h + "시";
    if (!timeGroups[key]) timeGroups[key] = [];
    timeGroups[key].push(pg);
  });

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 500, margin: "0 auto", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
      {/* v2 페이지 헤더 */}
      <div style={{ padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, rgba(171,71,188,0.12), rgba(171,71,188,0.04))", border: "1px solid rgba(171,71,188,0.25)", borderRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #AB47BC, #7B1FA2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 12px rgba(171,71,188,0.4)" }}>🎭</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f5fa", letterSpacing: "-0.01em" }}>축제 프로그램</div>
            <div style={{ fontSize: 11, color: "#b0b3c4", marginTop: 2 }}>{programs.length}개 프로그램 · 진행 {nowGroup.length}개</div>
          </div>
          {["admin","manager","sysadmin"].includes(session?.role) && <button onClick={onManage} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(171,71,188,0.3)", background: "rgba(171,71,188,0.1)", color: "#E1BEE7", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>⚙️ 관리</button>}
        </div>
      </div>

      {/* v2 일자 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        <button onClick={() => setSelDate("all")} style={{ padding: "8px 16px", borderRadius: 999, border: selDate === "all" ? "1.5px solid #AB47BC" : "1px solid rgba(255,255,255,0.1)", background: selDate === "all" ? "rgba(171,71,188,0.15)" : "rgba(255,255,255,0.03)", color: selDate === "all" ? "#E1BEE7" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>전체</button>
        {dates.map((d, i) => {
          const dt = new Date(d); const dayNames = ["일","월","화","수","목","금","토"];
          const isToday = d === todayStr;
          return (<button key={d} onClick={() => setSelDate(d)} style={{ padding: "8px 16px", borderRadius: 999, border: selDate === d ? "1.5px solid #AB47BC" : isToday ? "1.5px solid #4cd99a" : "1px solid rgba(255,255,255,0.1)", background: selDate === d ? "rgba(171,71,188,0.15)" : isToday ? "rgba(76,217,154,0.08)" : "rgba(255,255,255,0.03)", color: selDate === d ? "#E1BEE7" : isToday ? "#4cd99a" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            {dt.getMonth()+1}/{dt.getDate()} ({dayNames[dt.getDay()]}){isToday ? " ●" : ""}
          </button>);
        })}
        <button onClick={() => { setSelDate("always"); setAlwaysOpen(true); }} style={{ padding: "8px 16px", borderRadius: 999, border: selDate === "always" ? "1.5px solid #4cd99a" : "1px solid rgba(255,255,255,0.1)", background: selDate === "always" ? "rgba(76,217,154,0.15)" : "rgba(255,255,255,0.03)", color: selDate === "always" ? "#4cd99a" : "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>상시</button>
      </div>

      {/* v2 카테고리 필터 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 14 }}>
        {Object.entries(CATS).map(([k, v]) => {
          const v2Color = k === "all" ? "#6b8aff" : k === "O" ? "#6b8aff" : k === "P" ? "#ff5e7e" : k === "E" ? "#4cd99a" : "#ff9a3c";
          const cnt = k !== "all" ? dateFiltered.filter(p => p.category === k).length : dateFiltered.length;
          return (<button key={k} onClick={() => setSelCat(k)} style={{ padding: "10px 4px", borderRadius: 12, border: selCat === k ? `1.5px solid ${v2Color}` : "1px solid rgba(255,255,255,0.08)", background: selCat === k ? `${v2Color}15` : "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", color: selCat === k ? v2Color : "#b0b3c4", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center", lineHeight: 1.3 }}>
            <div>{v.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", marginTop: 2, fontSize: 14, fontWeight: 700 }}>{cnt}</div>
          </button>);
        })}
      </div>

      {/* 프로그램 목록 */}
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#6c6e7d", fontSize: 13 }}>해당 조건의 프로그램이 없습니다.</div>}

      {/* 진행중 프로그램 */}
      {nowGroup.length > 0 && <div style={{ marginBottom: 14 }}>
        <div style={{ color: "#4cd99a", fontSize: 11, fontWeight: 700, marginBottom: 8, paddingLeft: 4, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "#4cd99a", boxShadow: "0 0 8px #4cd99a", animation: "blink 2s infinite" }}></span> 진행중 {nowGroup.length}개
        </div>
        {nowGroup.map(pg => renderPgCard(pg))}
      </div>}

      {/* 예정 프로그램 - 시간별 */}
      {Object.entries(timeGroups).map(([timeKey, items]) => (
        <div key={timeKey} style={{ marginBottom: 12 }}>
          <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 6, paddingLeft: 4 }}>⏰ {timeKey}</div>
          {items.map(pg => renderPgCard(pg))}
        </div>
      ))}

      {/* 종료 프로그램 */}
      {pastPgs.length > 0 && <div style={{ marginTop: 4, marginBottom: 12 }}>
        <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 6, paddingLeft: 4 }}>종료 {pastPgs.length}개</div>
        {pastPgs.map(pg => renderPgCard(pg))}
      </div>}

      {/* 상시 프로그램 아코디언 */}
      {alwaysPgs.length > 0 && <div style={{ marginTop: 4, marginBottom: 12, borderRadius: 14, border: "1px solid rgba(0,150,136,0.2)", overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
        <div onClick={() => setAlwaysOpen(!alwaysOpen)} style={{ padding: "14px 16px", background: "rgba(0,150,136,0.06)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <span style={{ color: "#009688", fontSize: 16 }}>{alwaysOpen ? "▼" : "▶"}</span>
          <span style={{ color: "#009688", fontSize: 15, fontWeight: 800 }}>🔄 상시 프로그램</span>
          <span style={{ color: "#94A3B8", fontSize: 13, marginLeft: "auto" }}>{alwaysPgs.length}개</span>
        </div>
        {alwaysOpen && alwaysPgs.sort((a,b) => (a.time||"").localeCompare(b.time||"")).map(pg => renderPgCard(pg))}
      </div>}

    </div>
  </div>);
}


// ─── Stage Management Page (공연관리) ─────────────────────────────
function StageMgmtPage({ settings, setSettings, session }) {
  const perfs = settings.performances || [];
  const [view, setView] = useState("list"); // list | detail | edit | add
  const [selId, setSelId] = useState(null);
  const [dateOpen, setDateOpen] = useState({});
  const [detailTab, setDetailTab] = useState("info");
  const DEFAULT_GENRES = ["보컬","밴드","재즈","댄스","마술","퍼포먼스"];
  const GENRES = [...new Set([...DEFAULT_GENRES, ...(settings.customGenres || [])])];
  const [addGenre, setAddGenre] = useState(false);
  const [newGenre, setNewGenre] = useState("");
  const INST_PRESETS = ["어쿠스틱기타(마이킹)","어쿠스틱기타(DI)","일렉기타(앰프)","일렉기타(이펙터)","키보드","드럼","베이스(DI)","베이스(앰프)","MTR"];
  const programs = (settings.programs || []).filter(p => p.category === "P");
  const canEdit = ["admin","manager","sysadmin","stagemgr"].includes(session?.role);
  const GC = { 보컬: "#E91E63", 밴드: "#EF5350", 재즈: "#42A5F5", 댄스: "#66BB6A", 마술: "#FFA726", 퍼포먼스: "#AB47BC" };
  const DEFAULT_TR = [
    { id: "tr1", item: "보면대", qty: 1 }, { id: "tr2", item: "의자", qty: 1 }, { id: "tr3", item: "퍼커션테이블", qty: 0 },
    { id: "tr4", item: "3.5mm 연결", qty: 0 }, { id: "tr5", item: "마이크스탠드", qty: 1 }, { id: "tr6", item: "앰프", qty: 0, model: "" }
  ];

  const savePerf = (perf) => {
    const id = perf.id || "pf_" + Date.now();
    const exists = perfs.find(p => p.id === id);
    const updated = exists ? perfs.map(p => p.id === id ? { ...perf, id } : p) : [...perfs, { ...perf, id }];
    setSettings(prev => ({ ...prev, performances: updated }));
    setSelId(id); setView("detail"); setDetailTab("info");
  };
  const delPerf = (id) => { if (confirm("삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, performances: perfs.filter(p => p.id !== id) })); setView("list"); } };
  const autoImport = () => {
    const existing = perfs.map(p => p.programId).filter(Boolean);
    const newPgs = programs.filter(p => !existing.includes(p.id));
    if (newPgs.length === 0) { alert("새로 가져올 공연 프로그램이 없습니다."); return; }
    const imported = newPgs.map(p => ({
      id: "pf_" + Date.now() + "_" + p.id, programId: p.id, artist: p.manager || p.title, phone: p.managerPhone || "",
      genre: "보컬", programTitle: p.title, date: p.date, time: p.time, endTime: p.endTime, location: p.location,
      setlist: [], instruments: [], techrider: JSON.parse(JSON.stringify(DEFAULT_TR))
    }));
    setSettings(prev => ({ ...prev, performances: [...perfs, ...imported] }));
    alert("✅ " + imported.length + "개 공연 가져오기 완료");
  };
  const sel = perfs.find(p => p.id === selId);

  // ═══ 편집 폼 ═══
  const EditView = ({ perf }) => {
    const [f, setF] = useState({ ...perf });
    const upF = (k, v) => setF(p => ({ ...p, [k]: v }));
    const addSong = () => upF("setlist", [...(f.setlist||[]), { id: "sl_"+Date.now(), name: "", type: "MR", playtime: "3:30", memo: "" }]);
    const upSong = (i, k, v) => { const sl = [...(f.setlist||[])]; sl[i] = { ...sl[i], [k]: v }; upF("setlist", sl); };
    const delSong = (i) => upF("setlist", (f.setlist||[]).filter((_,j)=>j!==i));
    const moveSong = (i, d) => { const sl = [...(f.setlist||[])]; const ni = i+d; if (ni<0||ni>=sl.length) return; [sl[i],sl[ni]]=[sl[ni],sl[i]]; upF("setlist", sl); };
    const addTech = () => upF("techrider", [...(f.techrider||[]), { id: "tr_"+Date.now(), item: "", qty: 1, memo: "" }]);
    const upTech = (i, k, v) => { const tr = [...(f.techrider||[])]; tr[i] = { ...tr[i], [k]: v }; upF("techrider", tr); };
    const delTech = (i) => upF("techrider", (f.techrider||[]).filter((_,j)=>j!==i));
    const addInst = (name) => upF("instruments", [...(f.instruments||[]), { id: "in_"+Date.now(), name, ch: "M", qty: 1, memo: "" }]);
    const upInst = (i, k, v) => { const ins = [...(f.instruments||[])]; ins[i] = { ...ins[i], [k]: v }; upF("instruments", ins); };
    const delInst = (i) => upF("instruments", (f.instruments||[]).filter((_,j)=>j!==i));
    const moveInst = (i, d) => { const ins = [...(f.instruments||[])]; const ni = i+d; if (ni<0||ni>=ins.length) return; [ins[i],ins[ni]]=[ins[ni],ins[i]]; upF("instruments", ins); };
    const [instCustom, setInstCustom] = useState("");
    const [editTab, setEditTab] = useState("info");
    const copyTR = () => { localStorage.setItem("_tr_clipboard", JSON.stringify({ setlist: f.setlist, instruments: f.instruments, techrider: f.techrider })); alert("✅ 복사 완료"); };
    const pasteTR = () => { try { const d = JSON.parse(localStorage.getItem("_tr_clipboard")); if (d) { if (d.setlist) upF("setlist", d.setlist); if (d.instruments) upF("instruments", d.instruments); if (d.techrider) upF("techrider", d.techrider); alert("✅ 붙여넣기 완료"); } } catch { alert("❌ 실패"); } };
    const importFrom = (srcId) => { const src = perfs.find(p => p.id === srcId); if (src) { if (src.setlist?.length) upF("setlist", JSON.parse(JSON.stringify(src.setlist))); if (src.instruments?.length) upF("instruments", JSON.parse(JSON.stringify(src.instruments))); if (src.techrider?.length) upF("techrider", JSON.parse(JSON.stringify(src.techrider))); alert("✅ " + src.artist + " 데이터 가져오기 완료"); } };
    const tabs = [
      { id: "info", label: "기본정보", icon: "📝" },
      { id: "setlist", label: "셋리스트", icon: "🎵", count: (f.setlist||[]).length },
      { id: "inst", label: "사용악기", icon: "🎸", count: (f.instruments||[]).length },
      { id: "req", label: "요청사항", icon: "📋", count: (f.techrider||[]).filter(t=>t.qty>0).length },
    ];

    return (<div>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setView(f.id ? "detail" : "list")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>← 뒤로</button>
        <span style={{ color: "#E1BEE7", fontSize: 16, fontWeight: 800, flex: 1 }}>{f.id ? "공연 수정" : "새 공연 등록"}</span>
      </div>

      {/* 내부 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => <button key={t.id} onClick={() => setEditTab(t.id)} style={{ padding: "10px 14px", borderRadius: 10, border: editTab === t.id ? "2px solid #9C27B0" : "1px solid #222", background: editTab === t.id ? "rgba(156,39,176,0.08)" : "transparent", color: editTab === t.id ? "#E1BEE7" : "#556", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
          {t.icon} {t.label}{t.count > 0 ? " "+t.count : ""}
        </button>)}
      </div>

      {/* 기본정보 탭 */}
      {editTab === "info" && <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Label>아티스트명 *</Label><Input value={f.artist} onChange={e => upF("artist", e.target.value)} placeholder="아티스트/팀명" /></div>
          <div><Label>연락처</Label><Input value={f.phone} onChange={e => upF("phone", e.target.value)} placeholder="010-0000-0000" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Label>분류</Label>
            <div style={{ display: "flex", gap: 4 }}>
              <select value={f.genre} onChange={e => upF("genre", e.target.value)} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button onClick={() => setAddGenre(!addGenre)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#E1BEE7", fontSize: 14, cursor: "pointer" }}>+</button>
            </div>
            {addGenre && <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <Input value={newGenre} onChange={e => setNewGenre(e.target.value)} placeholder="새 분류명" />
              <button onClick={() => { if (newGenre && !GENRES.includes(newGenre)) { setSettings(prev => ({ ...prev, customGenres: [...(prev.customGenres||[]), newGenre] })); upF("genre", newGenre); setNewGenre(""); setAddGenre(false); } }} style={{ padding: "10px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>추가</button>
            </div>}
          </div>
          <div><Label>연결 프로그램</Label><select value={f.programId || ""} onChange={e => { const pg = programs.find(p=>p.id===e.target.value); upF("programId", e.target.value); if (pg) { upF("programTitle", pg.title); upF("date", pg.date); upF("time", pg.time); upF("endTime", pg.endTime); upF("location", pg.location); } }} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
            <option value="">수동 입력</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.title} ({p.time})</option>)}
          </select></div>
        </div>
        {!f.programId && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><Label>공연시간</Label><Input type="time" value={f.time||""} onChange={e => upF("time", e.target.value)} /></div>
          <div><Label>종료</Label><Input type="time" value={f.endTime||""} onChange={e => upF("endTime", e.target.value)} /></div>
          <div><Label>장소</Label><Input value={f.location||""} onChange={e => upF("location", e.target.value)} placeholder="무대명" /></div>
        </div>}
      </div>}

      {/* 셋리스트 탭 */}
      {editTab === "setlist" && <div>
        {(f.setlist||[]).map((song, si) => (
          <div key={song.id} style={{ position: "relative", padding: "12px", borderRadius: 12, background: "linear-gradient(135deg, rgba(156,39,176,0.06), rgba(156,39,176,0.01))", border: "1px solid rgba(156,39,176,0.2)", marginBottom: 8 }}>
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2 }}>
              <button onClick={() => moveSong(si,-1)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>▲</button>
              <button onClick={() => moveSong(si,1)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>▼</button>
              <button onClick={() => delSong(si)} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, paddingRight: 90 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, rgba(156,39,176,0.3), rgba(156,39,176,0.1))", color: "#E1BEE7", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{si+1}</span>
              <Input value={song.name} onChange={e => upSong(si, "name", e.target.value)} placeholder="곡명" style={{ flex: 1, fontWeight: 600 }} />
            </div>
            <div style={{ display: "flex", gap: 6, paddingLeft: 36 }}>
              <button onClick={() => upSong(si, "type", song.type === "MR" ? "LIVE" : "MR")} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid " + (song.type === "LIVE" ? "#66BB6A" : "#42A5F5"), background: song.type === "LIVE" ? "rgba(76,175,80,0.1)" : "rgba(33,150,243,0.08)", color: song.type === "LIVE" ? "#66BB6A" : "#42A5F5", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{song.type === "LIVE" ? "🎤 라이브" : "🎵 MR"}</button>
              <Input value={song.playtime} onChange={e => upSong(si, "playtime", e.target.value)} placeholder="3:30" style={{ width: 70, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 600 }} />
              <Input value={song.memo||""} onChange={e => upSong(si, "memo", e.target.value)} placeholder="메모" style={{ flex: 1 }} />
            </div>
          </div>
        ))}
        <button onClick={addSong} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "1.5px dashed rgba(156,39,176,0.3)", background: "rgba(156,39,176,0.04)", color: "#E1BEE7", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>+</span>
          <span>곡 추가</span>
        </button>
        {(f.setlist||[]).length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13, marginTop: 10 }}>아직 곡이 없습니다</div>}
      </div>}

      {/* 사용악기 탭 */}
      {editTab === "inst" && <div>
        {/* 프리셋 칩 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {INST_PRESETS.filter(p => !(f.instruments||[]).find(i => i.name === p)).map(preset => (
            <button key={preset} onClick={() => addInst(preset)} style={{ padding: "7px 12px", borderRadius: 16, border: "1px solid rgba(33,150,243,0.25)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ {preset}</button>
          ))}
        </div>
        {/* 직접 입력 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <Input value={instCustom} onChange={e => setInstCustom(e.target.value)} placeholder="직접 입력 (예: 첼로)" />
          <button onClick={() => { if (instCustom) { addInst(instCustom); setInstCustom(""); } }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #42A5F5, #1976D2)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>추가</button>
        </div>
        {/* 타일 그리드 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {(f.instruments||[]).map((inst, ii) => (
            <div key={inst.id} style={{ position: "relative", padding: "12px", borderRadius: 12, background: "linear-gradient(135deg, rgba(33,150,243,0.08), rgba(33,150,243,0.02))", border: "1px solid rgba(33,150,243,0.2)" }}>
              <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 2 }}>
                <button onClick={() => moveInst(ii,-1)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 10, cursor: "pointer" }}>▲</button>
                <button onClick={() => moveInst(ii,1)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 10, cursor: "pointer" }}>▼</button>
                <button onClick={() => delInst(ii)} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingRight: 70 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(33,150,243,0.2)", color: "#42A5F5", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ii+1}</span>
                <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <button onClick={() => upInst(ii, "qty", Math.max(0,(inst.qty||1)-1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>−</button>
                <span style={{ color: "#42A5F5", fontSize: 16, fontWeight: 800, flex: 1, textAlign: "center" }}>{inst.qty||1}</span>
                <button onClick={() => upInst(ii, "qty", (inst.qty||1)+1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>+</button>
                <button onClick={() => upInst(ii, "ch", inst.ch==="S"?"M":"S")} style={{ padding: "5px 10px", borderRadius: 6, border: "1.5px solid "+(inst.ch==="S"?"#66BB6A":"#42A5F5"), background: inst.ch==="S"?"rgba(76,175,80,0.1)":"rgba(33,150,243,0.08)", color: inst.ch==="S"?"#66BB6A":"#42A5F5", fontSize: 12, fontWeight: 700, cursor: "pointer", marginLeft: 4 }}>{inst.ch==="S"?"S":"M"}</button>
              </div>
              <Input value={inst.memo||""} onChange={e => upInst(ii, "memo", e.target.value)} placeholder="메모" style={{ padding: "6px 8px", fontSize: 12 }} />
            </div>
          ))}
          {(f.instruments||[]).length === 0 && <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 30, color: "#94A3B8" }}>위 프리셋을 터치하여 악기를 추가하세요</div>}
        </div>
      </div>}

      {/* 요청사항 탭 */}
      {editTab === "req" && <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 10 }}>
          {(f.techrider||[]).map((tr, ti) => {
            const isOn = tr.qty > 0;
            return (<div key={tr.id} style={{ position: "relative", padding: "12px", borderRadius: 12, background: isOn ? "linear-gradient(135deg, rgba(76,175,80,0.12), rgba(76,175,80,0.03))" : "rgba(255,255,255,0.03)", border: isOn ? "1.5px solid rgba(76,175,80,0.4)" : "1px solid rgba(255,255,255,0.06)", transition: "all 0.2s" }}>
              <button onClick={() => delTech(ti)} style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 6, border: "none", background: "rgba(0,0,0,0.3)", color: "#94A3B8", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              <div onClick={() => upTech(ti, "qty", isOn ? 0 : 1)} style={{ cursor: "pointer", marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: isOn ? "linear-gradient(135deg, #66BB6A, #43A047)" : "rgba(255,255,255,0.04)", border: isOn ? "none" : "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: isOn ? "#fff" : "#475569", fontWeight: 700, marginBottom: 6 }}>{isOn ? "✓" : "○"}</div>
              </div>
              <Input value={tr.item} onChange={e => upTech(ti, "item", e.target.value)} placeholder="항목명" style={{ padding: "8px", fontSize: 13, marginBottom: 6, fontWeight: 600 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => upTech(ti, "qty", Math.max(0, tr.qty - 1))} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>−</button>
                <Input type="number" value={tr.qty} onChange={e => upTech(ti, "qty", parseInt(e.target.value)||0)} style={{ flex: 1, padding: "6px", fontSize: 14, textAlign: "center", fontWeight: 700, color: isOn ? "#66BB6A" : "#94A3B8" }} />
                <button onClick={() => upTech(ti, "qty", tr.qty + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>+</button>
              </div>
            </div>);
          })}
          <button onClick={addTech} style={{ padding: "12px", borderRadius: 12, border: "1.5px dashed rgba(255,152,0,0.3)", background: "rgba(255,152,0,0.04)", color: "#FFA726", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 100 }}>
            <span style={{ fontSize: 24 }}>+</span>
            <span>항목 추가</span>
          </button>
        </div>
      </div>}

      {/* 하단 액션 */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={() => { if (!f.artist) { alert("아티스트명을 입력하세요."); return; } savePerf(f); }} style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>✅ {f.id ? "저장" : "등록"}</button>
        <button onClick={copyTR} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📋</button>
        <button onClick={pasteTR} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>📥</button>
      </div>
      {/* 다른 공연에서 가져오기 */}
      {perfs.filter(p => p.id !== f.id && ((p.setlist||[]).length > 0 || (p.instruments||[]).length > 0)).length > 0 && <div style={{ marginTop: 10 }}>
        <Label>다른 공연에서 테크라이더 가져오기</Label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {perfs.filter(p => p.id !== f.id && ((p.setlist||[]).length > 0 || (p.instruments||[]).length > 0)).map(p => (
            <button key={p.id} onClick={() => importFrom(p.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>📂 {p.artist}</button>
          ))}
        </div>
      </div>}
    </div>);
  };

  // ═══ 상세 뷰 ═══
  const DetailView = ({ pf }) => {
    const gc = GC[pf.genre] || "#556";
    const pg = pf.programId ? programs.find(p => p.id === pf.programId) : null;
    const sl = pf.setlist || []; const ins = pf.instruments || []; const tr = (pf.techrider||[]).filter(t=>t.qty>0);
    const dtabs = [{ id:"info", label:"기본" }, sl.length > 0 && { id:"setlist", label:"🎵 "+sl.length+"곡" }, ins.length > 0 && { id:"inst", label:"🎸 "+ins.length }, tr.length > 0 && { id:"req", label:"📋 "+tr.length }].filter(Boolean);

    return (<div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setView("list")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>← 목록</button>
        <span style={{ flex: 1 }} />
        {canEdit && <button onClick={() => { setView("edit"); }} style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #9C27B0", background: "transparent", color: "#E1BEE7", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✏️ 수정</button>}
        {canEdit && <button onClick={() => delPerf(pf.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 13, cursor: "pointer" }}>🗑</button>}
      </div>

      {/* 프로필 카드 */}
      <div style={{ padding: "28px 20px", borderRadius: 20, background: `linear-gradient(135deg, ${gc}15, ${gc}04)`, border: `1px solid ${gc}33`, marginBottom: 16, textAlign: "center", boxShadow: `0 8px 32px ${gc}15` }}>
        <span style={{ padding: "5px 16px", borderRadius: 20, background: `${gc}20`, color: gc, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{pf.genre}</span>
        <h2 style={{ color: "#fff", fontSize: 26, fontWeight: 600, letterSpacing: -0.5, margin: "14px 0 10px" }}>{pf.artist}</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, color: "#8892b0", fontSize: 14 }}>
          {pf.time && <span>⏰ {pf.time}~{pf.endTime}</span>}
          {(pf.location || pg?.location) && <span>📍 {pf.location || pg?.location}</span>}
        </div>
        {pf.phone && <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 6 }}>📞 {pf.phone}</div>}
      </div>

      {/* 상세 탭 */}
      {dtabs.length > 1 && <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {dtabs.map(t => <button key={t.id} onClick={() => setDetailTab(t.id)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: detailTab===t.id ? "2px solid #9C27B0" : "1px solid #222", background: detailTab===t.id ? "rgba(156,39,176,0.06)" : "transparent", color: detailTab===t.id ? "#E1BEE7" : "#556", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t.label}</button>)}
      </div>}

      {detailTab === "info" && <div style={{ padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
          <div><div style={{ color: "#E1BEE7", fontSize: 24, fontWeight: 800 }}>{sl.length}</div><div style={{ color: "#94A3B8", fontSize: 12 }}>셋리스트</div></div>
          <div><div style={{ color: "#42A5F5", fontSize: 24, fontWeight: 800 }}>{ins.length}</div><div style={{ color: "#94A3B8", fontSize: 12 }}>악기</div></div>
          <div><div style={{ color: "#FFA726", fontSize: 24, fontWeight: 800 }}>{tr.length}</div><div style={{ color: "#94A3B8", fontSize: 12 }}>요청사항</div></div>
        </div>
      </div>}

      {detailTab === "setlist" && <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
        {sl.map((s,i) => <div key={i} style={{ padding: "12px 16px", borderBottom: i<sl.length-1?"1px solid #1a1a2e":"none", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#E1BEE7", fontSize: 16, fontWeight: 800, minWidth: 28 }}>{i+1}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 600 }}>{s.name||"?"}</div>
            {s.memo && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>{s.memo}</div>}
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 6, background: s.type==="LIVE"?"rgba(76,175,80,0.1)":"rgba(33,150,243,0.1)", color: s.type==="LIVE"?"#66BB6A":"#42A5F5", fontSize: 12, fontWeight: 700 }}>{s.type}</span>
          <span style={{ color: "#94A3B8", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{s.playtime}</span>
        </div>)}
      </div>}

      {detailTab === "inst" && <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
        {ins.map((inst,i) => <div key={i} style={{ padding: "12px 16px", borderBottom: i<ins.length-1?"1px solid #1a1a2e":"none", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 600, flex: 1 }}>{inst.name}</span>
          {(inst.qty||1)>1 && <span style={{ color: "#8892b0", fontSize: 14, fontWeight: 700 }}>×{inst.qty}</span>}
          <span style={{ padding: "3px 10px", borderRadius: 6, background: inst.ch==="S"?"rgba(76,175,80,0.1)":"rgba(33,150,243,0.1)", color: inst.ch==="S"?"#66BB6A":"#42A5F5", fontSize: 12, fontWeight: 700 }}>{inst.ch==="S"?"스테레오":"모노"}</span>
          {inst.memo && <span style={{ color: "#94A3B8", fontSize: 12 }}>· {inst.memo}</span>}
        </div>)}
      </div>}

      {detailTab === "req" && <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
        {tr.map((t,i) => <div key={i} style={{ padding: "12px 16px", borderBottom: i<tr.length-1?"1px solid #1a1a2e":"none", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#66BB6A", fontSize: 14 }}>✓</span>
          <span style={{ color: "#E2E8F0", fontSize: 15, flex: 1 }}>{t.item}</span>
          {t.qty>1 && <span style={{ color: "#8892b0", fontSize: 14 }}>×{t.qty}</span>}
          {t.memo && <span style={{ color: "#94A3B8", fontSize: 12 }}>· {t.memo}</span>}
        </div>)}
      </div>}
    </div>);
  };

  // ═══ 리스트 뷰 ═══
  const sorted = [...perfs].sort((a,b) => (a.date||"9999").localeCompare(b.date||"9999") || (a.time||"").localeCompare(b.time||""));
  const dateGroups = {};
  sorted.forEach(pf => { const d = pf.date || "미지정"; if (!dateGroups[d]) dateGroups[d] = []; dateGroups[d].push(pf); });

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(16px, env(safe-area-inset-right)) 80px max(16px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 500, margin: "0 auto" }}>

      {/* 상세 뷰 */}
      {view === "detail" && sel && <DetailView pf={sel} />}

      {/* 편집 뷰 */}
      {view === "edit" && sel && <EditView perf={sel} />}
      {view === "add" && <EditView perf={{ artist: "", phone: "", genre: "보컬", programId: "", setlist: [], instruments: [], techrider: JSON.parse(JSON.stringify(DEFAULT_TR)) }} />}

      {/* 리스트 뷰 */}
      {view === "list" && <>
        {/* CueFlow 스타일 히어로 */}
        <div style={{ textAlign: "center", marginBottom: 20, padding: "24px 16px", borderRadius: 20, background: "linear-gradient(135deg, rgba(156,39,176,0.08), rgba(103,58,183,0.04))", border: "1px solid rgba(156,39,176,0.15)" }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>🎤</div>
          <h2 style={{ color: "#fff", fontSize: 24, fontWeight: 600, letterSpacing: -0.5, margin: "0 0 6px" }}>공연관리</h2>
          <p style={{ color: "#8892b0", fontSize: 13, margin: 0 }}>아티스트 · 셋리스트 · 테크라이더</p>
          <div style={{ marginTop: 12, display: "inline-flex", gap: 6, padding: "6px 14px", borderRadius: 20, background: "rgba(156,39,176,0.12)", border: "1px solid rgba(156,39,176,0.2)" }}>
            <span style={{ color: "#E1BEE7", fontSize: 14, fontWeight: 700 }}>{perfs.length}</span>
            <span style={{ color: "#8892b0", fontSize: 13 }}>개 공연 등록됨</span>
          </div>
        </div>

        {canEdit && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setView("add")} style={{ padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(156,39,176,0.35)" }}>🎤 수동 등록</button>
          <button onClick={autoImport} style={{ padding: "16px", borderRadius: 14, border: "1.5px solid rgba(156,39,176,0.3)", background: "rgba(156,39,176,0.05)", color: "#E1BEE7", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🔄 가져오기</button>
        </div>}

        {Object.entries(dateGroups).map(([dateKey, items]) => {
          const dateLabel = dateKey === "미지정" ? "📅 일자 미지정" : (() => { const d = new Date(dateKey); return "📅 " + (d.getMonth()+1) + "/" + d.getDate() + " (" + ["일","월","화","수","목","금","토"][d.getDay()] + ")"; })();
          const isOpen = dateOpen[dateKey] !== false;
          return (<div key={dateKey} style={{ marginBottom: 10, borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div onClick={() => setDateOpen(p => ({ ...p, [dateKey]: !isOpen }))} style={{ padding: "14px 16px", background: "rgba(156,39,176,0.04)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ color: "#E1BEE7", fontSize: 14 }}>{isOpen ? "▼" : "▶"}</span>
              <span style={{ color: "#E1BEE7", fontSize: 16, fontWeight: 800, flex: 1 }}>{dateLabel}</span>
              <span style={{ padding: "3px 10px", borderRadius: 10, background: "rgba(156,39,176,0.1)", color: "#E1BEE7", fontSize: 13, fontWeight: 700 }}>{items.length}</span>
            </div>
            {isOpen && items.map(pf => {
              const gc = GC[pf.genre] || "#556";
              const pg = pf.programId ? programs.find(p => p.id === pf.programId) : null;
              const sl = (pf.setlist||[]).length; const inst = (pf.instruments||[]).length; const req = (pf.techrider||[]).filter(t=>t.qty>0).length;
              return (<div key={pf.id} onClick={() => { setSelId(pf.id); setView("detail"); setDetailTab("info"); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                <div style={{ width: 4, height: 44, borderRadius: 2, background: gc, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 800 }}>{pf.artist}</span>
                    <span style={{ color: gc, fontSize: 12 }}>{pf.genre}</span>
                  </div>
                  <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 2 }}>
                    {pf.time && <span>⏰ {pf.time}~{pf.endTime}</span>}
                    {(pf.location || pg?.location) && <span style={{ marginLeft: 8 }}>📍 {pf.location || pg?.location}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {sl > 0 && <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(156,39,176,0.08)", color: "#E1BEE7", fontSize: 12, fontWeight: 700 }}>🎵{sl}</span>}
                  {inst > 0 && <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 12, fontWeight: 700 }}>🎸{inst}</span>}
                  {req > 0 && <span style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(255,152,0,0.08)", color: "#FFA726", fontSize: 12, fontWeight: 700 }}>📋{req}</span>}
                </div>
                <span style={{ color: "#333", fontSize: 16 }}>›</span>
              </div>);
            })}
          </div>);
        })}

        {perfs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>등록된 공연이 없습니다.</div>}
      </>}
    </div>
  </div>);
}

// ─── 2.1: Smart Search (통합 검색) ─────────────────────────────
function SearchModal({ open, onClose, settings, categories, onNavigate }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);
  if (!open) return null;

  const query = q.trim().toLowerCase();
  const results = [];

  if (query) {
    // 환경 카테고리
    (categories || []).forEach(c => { if ((c.name || "").toLowerCase().includes(query)) results.push({ type: "category", icon: c.icon || "📊", title: c.name, sub: `${c.currentValue || 0}${c.unit || ""}`, page: "dashboard", id: c.id }); });
    // 구역
    (settings.zones || []).forEach(z => { if ((z.name || "").toLowerCase().includes(query)) results.push({ type: "zone", icon: "📍", title: z.name, sub: `구역 · ${z.zoneType || "일반"}`, page: "congestion" }); });
    // 사이트
    (settings.sites || []).forEach(s => { if ((s.name || "").toLowerCase().includes(query)) results.push({ type: "site", icon: "🏢", title: s.name, sub: `근무지 · ${(s.workers||[]).length}명`, page: "status" }); });
    // 근무자
    (settings.sites || []).forEach(s => (s.workers || []).forEach(w => { if ((w.name || "").toLowerCase().includes(query)) results.push({ type: "worker", icon: "👤", title: w.name, sub: `${s.name} · ${w.role || "운영"} · ${w.phone || ""}`, page: "status" }); }));
    // 프로그램
    (settings.programs || []).forEach(p => { if ((p.title || "").toLowerCase().includes(query) || (p.manager || "").toLowerCase().includes(query)) results.push({ type: "program", icon: "🎭", title: p.title, sub: `${p.date || ""} ${p.time || ""} · ${p.location || ""}`, page: "program" }); });
    // 공연
    (settings.performances || []).forEach(p => { if ((p.artist || "").toLowerCase().includes(query)) results.push({ type: "perf", icon: "🎤", title: p.artist, sub: `공연 · ${p.genre || ""} · ${p.time || ""}`, page: "stage" }); });
    // 자산
    (settings.assets || []).forEach(a => { if ((a.name || "").toLowerCase().includes(query)) results.push({ type: "asset", icon: "📦", title: a.name, sub: `${a.category} · ${a.qty || 0}/${a.total || 0}`, page: "assets" }); });
    // 메시지
    (settings.messages || []).filter(m => (m.content || "").toLowerCase().includes(query)).slice(0, 5).forEach(m => results.push({ type: "msg", icon: "💬", title: m.content.slice(0, 50), sub: `메시지 · ${m.createdBy || ""} · ${m.createdAt || ""}`, page: "chat" }));
  }

  return (<div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px 16px" }}>
    <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderRadius: 18, border: "1px solid rgba(66,165,245,0.3)", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>🔍</span>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="구역, 근무자, 프로그램, 자산, 메시지 검색..." style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 15 }} autoFocus />
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 12 }}>
        {!query && <div style={{ padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>🔎</div>
          <div>전체 자료에서 검색합니다.</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "#475569" }}>구역・근무자・프로그램・공연・자산・메시지</div>
        </div>}
        {query && results.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>"{q}" 검색 결과가 없습니다</div>}
        {results.length > 0 && <div style={{ marginBottom: 8, color: "#94A3B8", fontSize: 11, fontWeight: 700, padding: "0 4px" }}>검색 결과 {results.length}개</div>}
        {results.map((r, i) => (
          <div key={i} onClick={() => { onNavigate(r.page); onClose(); }} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", marginBottom: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{r.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ color: "#94A3B8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>
            </div>
            <span style={{ color: "#475569", fontSize: 14 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  </div>);
}

// ─── 2.1: 근무자 통합 관리 (연락처/식수/무전기/근무지) ─────────────────
function WorkersPage({ settings, setSettings, session, accounts, setAccounts }) {
  const sites = settings.workSites || [];
  const zones = settings.zones || [];
  const assets = settings.assets || [];
  const shifts = settings.shifts || [];
  const today = new Date().toISOString().slice(0, 10);
  const canEdit = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);

  // 토스트
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // 무전기 할당 모달
  const [radioModalWorker, setRadioModalWorker] = useState(null);
  // 근무지 배치 모달
  const [siteModalWorker, setSiteModalWorker] = useState(null);

  // 근무자 근무지 이동
  const moveWorkerSite = (workerId, fromSiteId, toSiteId) => {
    setSettings(prev => {
      const ws = JSON.parse(JSON.stringify(prev.workSites || []));
      const fi = ws.findIndex(s => s.id === fromSiteId);
      if (fi < 0) return prev;
      const worker = (ws[fi].workers || []).find(w => w.id === workerId);
      if (!worker) return prev;

      // 미배치 사이트 자동 생성
      if (toSiteId === "_pool" && !ws.find(s => s.id === "_pool")) {
        ws.push({ id: "_pool", name: "미배치", zoneId: null, status: "standby", workers: [] });
      }
      const ti = ws.findIndex(s => s.id === toSiteId);
      if (ti < 0) return prev;

      ws[fi] = { ...ws[fi], workers: (ws[fi].workers || []).filter(w => w.id !== workerId) };
      ws[ti] = { ...ws[ti], workers: [...(ws[ti].workers || []), worker] };
      return { ...prev, workSites: ws };
    });
    // 계정의 siteId도 업데이트
    if (setAccounts) {
      const w = allWorkers.find(ww => ww.id === workerId);
      if (w?.accountId) {
        setAccounts(prev => prev.map(a => a.id === w.accountId ? { ...a, siteId: toSiteId } : a));
      }
    }
    const toSite = sites.find(s => s.id === toSiteId);
    const toName = toSiteId === "_pool" ? "미배치" : (toSite?.name || zones.find(z => z.id === toSite?.zoneId)?.name || "?");
    showToast(`📍 ${toName}(으)로 이동 완료`);
  };

  // 무전기 할당/회수
  const assignRadio = (worker, assetId, unitId) => {
    setSettings(prev => ({ ...prev, assets: (prev.assets || []).map(a => {
      if (a.id !== assetId) return a;
      const newUnits = (a.units || []).map(u => u.id === unitId ? { ...u, status: "assigned", assignedTo: worker.id, assignedToName: worker.name, history: [...(u.history || []), { ts: Date.now(), action: `${worker.name}에게 할당`, by: session?.name || "?" }] } : u);
      const newQty = newUnits.filter(u => u.status === "available").length;
      return { ...a, units: newUnits, qty: newQty };
    }) }));
    const unit = assets.find(a => a.id === assetId)?.units?.find(u => u.id === unitId);
    showToast(`📻 ${worker.name}님께 #${unit?.number} 할당 완료`);
  };

  const returnRadio = (assetId, unitId) => {
    const asset = assets.find(a => a.id === assetId);
    const unit = asset?.units?.find(u => u.id === unitId);
    setSettings(prev => ({ ...prev, assets: (prev.assets || []).map(a => {
      if (a.id !== assetId) return a;
      const newUnits = (a.units || []).map(u => u.id === unitId ? { ...u, status: "available", assignedTo: null, assignedToName: null, history: [...(u.history || []), { ts: Date.now(), action: "반납", by: session?.name || "?" }] } : u);
      const newQty = newUnits.filter(u => u.status === "available").length;
      return { ...a, units: newUnits, qty: newQty };
    }) }));
    showToast(`📥 #${unit?.number} 반납 완료`, "info");
  };

  const [filter, setFilter] = useState("all"); // all | siteId
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState(null); // {siteId, workerId}
  const [addSiteId, setAddSiteId] = useState(null);
  const [newW, setNewW] = useState({ name: "", phone: "", role: "운영", meals: 1, mealNote: "" });

  // 모든 근무자 평탄화 + 무전기/근무 정보 결합
  const allWorkers = sites.flatMap(s => {
    const zoneName = s.name || zones.find(z => z.id === s.zoneId)?.name || "미배치";
    return (s.workers || []).map(w => {
    // 이 근무자에게 할당된 무전기 찾기
    const radios = [];
    assets.forEach(a => {
      if (a.trackUnits && a.units) {
        a.units.forEach(u => {
          if (u.assignedTo === w.id || u.assignedToName === w.name) {
            radios.push({ assetId: a.id, unitId: u.id, assetName: a.name, number: u.number, category: a.category });
          }
        });
      }
    });
    // 오늘 근무 정보
    const todayShift = shifts.find(sh => sh.workerId === w.id && sh.date === today);
    return {
      ...w,
      siteId: s.id,
      siteName: zoneName,
      radios,
      onDuty: todayShift && !todayShift.checkOut,
      checkInTime: todayShift?.checkIn,
    };
  });
  });

  // 필터/검색
  const filtered = allWorkers.filter(w => {
    if (filter !== "all" && w.siteId !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (w.name || "").toLowerCase().includes(q) ||
             (w.phone || "").includes(q) ||
             (w.role || "").toLowerCase().includes(q) ||
             (w.siteName || "").toLowerCase().includes(q) ||
             w.radios.some(r => r.number.includes(q));
    }
    return true;
  });

  // 통계
  const stats = {
    total: allWorkers.length,
    onDuty: allWorkers.filter(w => w.onDuty).length,
    withRadio: allWorkers.filter(w => w.radios.length > 0).length,
    totalMeals: allWorkers.reduce((s, w) => s + (parseInt(w.meals) || 0), 0),
  };

  const updateWorker = (siteId, workerId, changes) => {
    setSettings(prev => ({ ...prev, workSites: prev.workSites.map(s => s.id === siteId ? { ...s, workers: s.workers.map(w => w.id === workerId ? { ...w, ...changes } : w) } : s) }));
  };
  const removeWorker = (siteId, workerId) => {
    if (!confirm("근무자를 삭제하시겠습니까?\n(연결된 로그인 계정도 함께 삭제됩니다)")) return;
    // 근무자 삭제
    let removedWorker = null;
    setSettings(prev => {
      const site = prev.workSites.find(s => s.id === siteId);
      removedWorker = site?.workers?.find(w => w.id === workerId);
      return { ...prev, workSites: prev.workSites.map(s => s.id === siteId ? { ...s, workers: (s.workers || []).filter(w => w.id !== workerId) } : s) };
    });
    // 연결된 계정도 삭제
    if (setAccounts && removedWorker?.accountId) {
      setAccounts(prev => prev.filter(a => a.id !== removedWorker.accountId && a.workerId !== workerId));
    }
  };
  const addWorker = (siteId) => {
    if (!newW.name) { alert("이름을 입력하세요."); return; }
    const wid = "w_"+Date.now();
    const w = { id: wid, name: newW.name, phone: newW.phone, role: newW.role, meals: parseInt(newW.meals) || 0, mealNote: newW.mealNote };
    setSettings(prev => ({ ...prev, workSites: prev.workSites.map(s => s.id === siteId ? { ...s, workers: [...(s.workers || []), w] } : s) }));

    // 🔐 자동 계정 생성: 이름이 ID, 비밀번호는 1234
    if (setAccounts && accounts) {
      const accountId = newW.name.trim();
      const exists = accounts.find(a => a.id === accountId);
      if (!exists) {
        // 역할 자동 매핑
        const roleMap = { "주차": "parking", "주차요원": "parking", "셔틀": "shuttle", "셔틀요원": "shuttle", "계수": "counter", "계수원": "counter", "구역": "zonemgr", "구역관리": "zonemgr", "구역관리자": "zonemgr", "무대": "stagemgr", "무대관리": "stagemgr", "무대관리자": "stagemgr", "관리자": "manager", "운영자": "manager", "운영": "manager" };
        const accRole = roleMap[newW.role] || "manager";
        const fid = settings.festivalId || session?.festivalId || "default";
        const newAcc = { id: accountId, password: simpleHash("1234"), name: newW.name, role: accRole, festivalId: fid, festivals: [fid], workerId: wid, siteId: siteId };
        setAccounts(prev => [...prev, newAcc]);
        // 근무자에 accountId 연결
        setSettings(prev => ({ ...prev, workSites: prev.workSites.map(s => s.id === siteId ? { ...s, workers: s.workers.map(ww => ww.id === wid ? { ...ww, accountId } : ww) } : s) }));
        alert(`✅ 근무자 등록 완료\n\n👤 이름: ${newW.name}\n🆔 로그인 ID: ${accountId}\n🔑 비밀번호: 1234\n\n첫 로그인 후 비밀번호를 변경하도록 안내하세요.`);
      } else {
        alert(`⚠️ 이미 존재하는 ID입니다: ${accountId}\n근무자는 등록되었지만 계정은 생성되지 않았습니다.`);
      }
    }
    setNewW({ name: "", phone: "", role: "운영", meals: 1, mealNote: "" }); setAddSiteId(null);
  };

  // 식수 종합 (사이트별)
  const mealsBySite = sites.map(s => {
    const zname = s.name || zones.find(z => z.id === s.zoneId)?.name || "미배치";
    const ws = (s.workers || []);
    return { name: zname, count: ws.length, meals: ws.reduce((sum, w) => sum + (parseInt(w.meals) || 0), 0) };
  });

  // CSV 내보내기
  const exportCSV = () => {
    const rows = [["이름", "연락처", "역할", "근무지", "식수", "식사메모", "할당무전기", "오늘근무"]];
    allWorkers.forEach(w => {
      rows.push([w.name, w.phone || "", w.role || "", w.siteName, w.meals || 0, w.mealNote || "", w.radios.map(r => `${r.assetName} #${r.number}`).join("; "), w.onDuty ? `근무중 (${w.checkInTime})` : "-"]);
    });
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `safeflow_workers_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #07070d 0%, #0e0f17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif" }}>
      {/* v2 페이지 헤더 */}
      <div style={{ padding: "16px 18px", marginBottom: 12, background: "linear-gradient(135deg, rgba(107,138,255,0.12), rgba(107,138,255,0.04))", border: "1px solid rgba(107,138,255,0.25)", borderRadius: 16 }}>
        {/* 1행: 로고 + 제목 + 통계 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: canEdit ? 12 : 0 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #6b8aff, #5a7aff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, boxShadow: "0 4px 12px rgba(107,138,255,0.4)", flexShrink: 0 }}>👥</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f5fa", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>근무자 관리</div>
            <div style={{ fontSize: 11, color: "#b0b3c4", marginTop: 2, whiteSpace: "nowrap" }}>총 {stats.total}명 · 근무중 {stats.onDuty}명</div>
          </div>
        </div>
        {/* 2행: 액션 버튼들 (가로 스크롤 가능) */}
        {canEdit && <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2 }}>
            {setAccounts && stats.total > 0 && (() => {
              const noAcc = allWorkers.filter(w => !w.accountId && !accounts?.find(a => a.id === w.name)).length;
              if (noAcc === 0) return null;
              return <button onClick={() => {
                if (!confirm(`계정이 없는 근무자 ${noAcc}명에 대해 일괄로 계정을 생성합니다.\n\n로그인 ID: 이름\n비밀번호: 1234\n\n진행할까요?`)) return;
                const roleMap = { "주차": "parking", "주차요원": "parking", "셔틀": "shuttle", "셔틀요원": "shuttle", "계수": "counter", "계수원": "counter", "구역": "zonemgr", "구역관리": "zonemgr", "구역관리자": "zonemgr", "무대": "stagemgr", "무대관리": "stagemgr", "무대관리자": "stagemgr", "관리자": "manager", "운영자": "manager", "운영": "manager", "지원": "manager", "안전관리": "manager", "기술": "manager" };
                const fid = settings.festivalId || session?.festivalId || "default";
                const newAccs = [];
                let created = 0, skipped = 0;
                allWorkers.forEach(w => {
                  if (w.accountId || accounts?.find(a => a.id === w.name)) { skipped++; return; }
                  const accRole = roleMap[w.role] || "manager";
                  newAccs.push({ id: w.name, password: simpleHash("1234"), name: w.name, role: accRole, festivalId: fid, festivals: [fid], workerId: w.id, siteId: w.siteId });
                  created++;
                });
                if (newAccs.length > 0) {
                  setAccounts(prev => [...prev, ...newAccs]);
                  setSettings(prev => ({ ...prev, workSites: prev.workSites.map(s => ({ ...s, workers: (s.workers || []).map(w => { const acc = newAccs.find(a => a.workerId === w.id); return acc ? { ...w, accountId: acc.id } : w; }) })) }));
                }
                alert(`✅ 일괄 계정 생성 완료\n\n생성: ${created}개\n건너뜀: ${skipped}개 (이미 존재)\n\n비밀번호: 1234\n첫 로그인 후 변경 안내하세요.`);
              }} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(76,217,154,0.3)", background: "rgba(76,217,154,0.1)", color: "#4cd99a", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>🔐 계정({noAcc})</button>;
            })()}
            {/* 사용자관리 → 근무자 복구 */}
            {(() => {
              const fid = settings.festivalId || session?.festivalId || "default";
              const workerRoles = ["manager", "zonemgr", "stagemgr", "counter", "parking", "shuttle"];
              const candidates = (accounts || []).filter(a => 
                workerRoles.includes(a.role) && 
                (a.festivalId === fid || (a.festivals || []).includes(fid))
              );
              const missing = candidates.filter(a => 
                !allWorkers.find(w => w.accountId === a.id || w.name === a.name)
              );
              if (missing.length === 0) return null;
              const roleNameMap = { manager: "운영", zonemgr: "구역관리", stagemgr: "무대관리", counter: "계수", parking: "주차", shuttle: "셔틀" };
              return <button onClick={() => {
                if (!confirm(`📥 사용자관리 → 근무자 복구\n\n사용자관리에 ${missing.length}명의 계정이 있지만 근무자 목록에 없습니다.\n이들을 '미배치' 근무지로 복구합니다.\n\n복구 후 ⚙️관리에서 적절한 근무지로 이동시킬 수 있습니다.\n\n진행하시겠습니까?`)) return;
                setSettings(prev => {
                  const ws = JSON.parse(JSON.stringify(prev.workSites || []));
                  let pi = ws.findIndex(s => s.id === "_pool");
                  if (pi < 0) {
                    ws.push({ id: "_pool", name: "미배치", zoneId: null, status: "standby", workers: [] });
                    pi = ws.length - 1;
                  }
                  missing.forEach(a => {
                    const w = {
                      id: "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                      name: a.name,
                      phone: a.phone || "",
                      role: roleNameMap[a.role] || a.role,
                      meals: 1,
                      mealNote: "",
                      accountId: a.id
                    };
                    ws[pi].workers = [...(ws[pi].workers || []), w];
                  });
                  return { ...prev, workSites: ws };
                });
                alert(`✅ ${missing.length}명 복구 완료\n\n'미배치' 근무지에 추가되었습니다.\n⚙️관리에서 근무지로 이동시키세요.`);
              }} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,154,60,0.4)", background: "linear-gradient(180deg, rgba(255,154,60,0.15), rgba(255,154,60,0.04))", color: "#ff9a3c", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>📥 복구({missing.length})</button>;
            })()}
            {stats.total > 0 && <button onClick={exportCSV} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#b0b3c4", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>📥 CSV</button>}
        </div>}
      </div>

      {/* v2 통계 카드 (4개) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "총인원", value: stats.total, color: "#6b8aff", icon: "👤" },
          { label: "근무중", value: stats.onDuty, color: "#4cd99a", icon: "🟢" },
          { label: "무전기", value: stats.withRadio, color: "#a980ff", icon: "📻" },
          { label: "식수", value: stats.totalMeals, color: "#ff9a3c", icon: "🍱" }
        ].map(c => (
          <div key={c.label} style={{ padding: "12px 8px", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: `1px solid ${c.color}25`, textAlign: "center", boxShadow: "0 4px 12px -6px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ color: c.color, fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{c.value}</div>
            <div style={{ color: "#6c6e7d", fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* 검색 + 추가 버튼 (기존 컴포넌트 유지) */}

    {/* 검색 */}
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", padding: "0 12px", color: "#94A3B8", fontSize: 18 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름·연락처·역할·근무지·무전기번호" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} />
        {search && <Btn variant="ghost" onClick={() => setSearch("")} style={{ padding: "8px 12px", fontSize: 12 }}>✕</Btn>}
      </div>
    </Card>

    {/* 근무지 필터 */}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      <button onClick={() => setFilter("all")} style={{ padding: "8px 14px", borderRadius: 16, border: filter === "all" ? "1.5px solid #42A5F5" : "1px solid rgba(255,255,255,0.1)", background: filter === "all" ? "rgba(33,150,243,0.1)" : "rgba(255,255,255,0.03)", color: filter === "all" ? "#42A5F5" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>전체 ({allWorkers.length})</button>
      {sites.map(s => { const zname = s.name || zones.find(z => z.id === s.zoneId)?.name || '미배치'; const cnt = allWorkers.filter(w => w.siteId === s.id).length; if (cnt === 0 && !s.name) return null; return (
        <button key={s.id} onClick={() => setFilter(s.id)} style={{ padding: "8px 14px", borderRadius: 16, border: filter === s.id ? "1.5px solid #42A5F5" : "1px solid rgba(255,255,255,0.1)", background: filter === s.id ? "rgba(33,150,243,0.1)" : "rgba(255,255,255,0.03)", color: filter === s.id ? "#42A5F5" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📍 {zname} ({cnt})</button>
      ); })}
    </div>

    {/* 식수 종합표 */}
    {filter === "all" && mealsBySite.some(m => m.count > 0) && <Card style={{ background: "linear-gradient(135deg, rgba(255,167,38,0.06), rgba(255,167,38,0.01))", border: "1px solid rgba(255,167,38,0.2)" }}>
      <SectionTitle icon="🍱" accent="#FFA726">근무지별 식수 현황</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {mealsBySite.filter(m => m.count > 0).map(m => (
          <div key={m.name} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ color: "#94A3B8", fontSize: 11, marginBottom: 2 }}>📍 {m.name}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ color: "#FFA726", fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{m.meals}</span>
              <span style={{ color: "#94A3B8", fontSize: 11 }}>식 / {m.count}명</span>
            </div>
          </div>
        ))}
      </div>
    </Card>}

    {/* 근무자 카드 목록 */}
    {filtered.length === 0 && <div style={{ padding: "40px 20px", textAlign: "center", borderRadius: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)), #0e0f17", border: "1px solid rgba(255,255,255,0.08)", marginTop: 12 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
      <div style={{ color: "#f4f5fa", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{search ? "검색 결과 없음" : "등록된 근무자가 없습니다"}</div>
      {canEdit && !search && (() => {
        const fid = settings.festivalId || session?.festivalId || "default";
        const workerRoles = ["manager", "zonemgr", "stagemgr", "counter", "parking", "shuttle"];
        const candidates = (accounts || []).filter(a => 
          workerRoles.includes(a.role) && 
          (a.festivalId === fid || (a.festivals || []).includes(fid))
        );
        const missing = candidates.filter(a => 
          !allWorkers.find(w => w.accountId === a.id || w.name === a.name)
        );
        if (missing.length > 0) {
          return (<>
            <div style={{ color: "#ff9a3c", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              💡 사용자관리에 <b style={{ color: "#FFB74D" }}>{missing.length}명</b>의 계정이 있습니다.<br/>
              위의 <b style={{ color: "#FFB74D" }}>📥 복구</b> 버튼을 누르면 자동으로 가져옵니다.
            </div>
          </>);
        }
        return <div style={{ color: "#6c6e7d", fontSize: 13 }}>축제관리 또는 ⚙️관리 → 인력관리에서 등록하세요</div>;
      })()}
    </div>}

    {filtered.map(w => {
      const isEditing = editId?.workerId === w.id;
      if (isEditing) return (<Card key={w.id} style={{ background: "rgba(33,150,243,0.05)", border: "1px solid rgba(33,150,243,0.25)" }}>
        <h4 style={{ color: "#42A5F5", fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>✏️ {w.name} 정보 수정</h4>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>이름</Label><Input defaultValue={w.name} onBlur={e => updateWorker(w.siteId, w.id, { name: e.target.value })} /></div>
            <div><Label>연락처</Label><Input defaultValue={w.phone} onBlur={e => updateWorker(w.siteId, w.id, { phone: e.target.value })} placeholder="010-0000-0000" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>역할</Label><Input defaultValue={w.role} onBlur={e => updateWorker(w.siteId, w.id, { role: e.target.value })} placeholder="운영/안전/의료" /></div>
            <div><Label>식수</Label><Input type="number" defaultValue={w.meals || 0} onBlur={e => updateWorker(w.siteId, w.id, { meals: parseInt(e.target.value) || 0 })} /></div>
          </div>
          <div><Label>식사 메모 (알레르기/선호)</Label><Input defaultValue={w.mealNote || ""} onBlur={e => updateWorker(w.siteId, w.id, { mealNote: e.target.value })} placeholder="채식/할랄 등" /></div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Btn variant="primary" icon="✅" onClick={() => setEditId(null)} style={{ flex: 1, justifyContent: "center" }}>완료</Btn>
          {w.accountId && setAccounts && <Btn variant="outline" color="#FFA726" icon="🔑" onClick={() => {
            if (!confirm(`${w.name}님의 비밀번호를 1234로 초기화할까요?`)) return;
            setAccounts(prev => prev.map(a => a.id === w.accountId ? { ...a, password: simpleHash("1234") } : a));
            alert(`✅ 비밀번호가 1234로 초기화되었습니다.`);
          }}>비번초기화</Btn>}
          <Btn variant="danger" icon="🗑" onClick={() => { removeWorker(w.siteId, w.id); setEditId(null); }}>삭제</Btn>
        </div>
      </Card>);

      return (<Card key={w.id} style={{ border: w.onDuty ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* 아바타 */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: w.onDuty ? "linear-gradient(135deg, rgba(76,175,80,0.25), rgba(76,175,80,0.05))" : "linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.03))", border: `1px solid ${w.onDuty ? "rgba(76,175,80,0.4)" : "rgba(33,150,243,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{w.onDuty ? "🟢" : "👤"}</div>
            {w.onDuty && <div style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, background: "#66BB6A", border: "2px solid #0d1018", boxShadow: "0 0 8px rgba(76,175,80,0.6)", animation: "pulse 2s infinite" }} />}
          </div>
          {/* 메인 정보 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
              <span style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700 }}>{w.name}</span>
              <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 10, fontWeight: 700 }}>{w.role || "운영"}</span>
              {w.onDuty && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 10, fontWeight: 700 }}>● 근무중 {w.checkInTime}</span>}
            </div>
            <div style={{ color: "#94A3B8", fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span>📍 {w.siteName}</span>
              {w.phone && <a href={`tel:${w.phone}`} style={{ color: "#42A5F5", textDecoration: "none" }}>📞 {w.phone}</a>}
              {w.accountId && <span style={{ color: "#66BB6A" }}>🆔 {w.accountId}</span>}
            </div>
          </div>
          {/* 액션 */}
          {canEdit && <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button onClick={() => setEditId({ siteId: w.siteId, workerId: w.id })} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>✏️</button>
          </div>}
        </div>
        {/* 추가 정보 그리드 */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {/* 근무지 (클릭 → 변경) */}
          <div onClick={() => canEdit && setSiteModalWorker(w)} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(33,150,243,0.05)", border: "1px solid rgba(33,150,243,0.2)", cursor: canEdit ? "pointer" : "default" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "#94A3B8", fontSize: 10 }}>📍 근무지</span>
              {canEdit && <span style={{ color: "#42A5F5", fontSize: 10 }}>변경 ›</span>}
            </div>
            <div style={{ color: "#42A5F5", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.siteName}</div>
          </div>
          {/* 식수 */}
          <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,167,38,0.05)", border: "1px solid rgba(255,167,38,0.15)" }}>
            <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 2 }}>🍱 식수</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ color: "#FFA726", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{w.meals || 0}</span>
              <span style={{ color: "#94A3B8", fontSize: 11 }}>식</span>
            </div>
            {w.mealNote && <div style={{ color: "#FFA726", fontSize: 10, marginTop: 2, opacity: 0.8 }}>📝 {w.mealNote}</div>}
          </div>
          {/* 무전기 */}
          {w.radios.length > 0 ? <div onClick={() => canEdit && setRadioModalWorker(w)} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(171,71,188,0.05)", border: "1px solid rgba(171,71,188,0.2)", cursor: canEdit ? "pointer" : "default" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "#94A3B8", fontSize: 10 }}>📻 무전기</span>
              {canEdit && <span style={{ color: "#AB47BC", fontSize: 10 }}>편집 ›</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {w.radios.map((r, i) => (<div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <span style={{ color: "#AB47BC", fontSize: 12, fontWeight: 600 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>#{r.number}</span> <span style={{ color: "#94A3B8", fontSize: 10 }}>{r.assetName}</span>
                </span>
                {canEdit && <button onClick={(e) => { e.stopPropagation(); if (confirm(`#${r.number} 회수할까요?`)) returnRadio(r.assetId, r.unitId); }} style={{ width: 18, height: 18, borderRadius: 4, border: "none", background: "rgba(244,67,54,0.15)", color: "#EF5350", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>}
              </div>))}
            </div>
          </div> : <div onClick={() => canEdit && setRadioModalWorker(w)} style={{ padding: "8px 10px", borderRadius: 8, background: canEdit ? "rgba(171,71,188,0.04)" : "rgba(255,255,255,0.02)", border: `1px dashed ${canEdit ? "rgba(171,71,188,0.3)" : "rgba(255,255,255,0.04)"}`, cursor: canEdit ? "pointer" : "default" }}>
            <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 2 }}>📻 무전기</div>
            <div style={{ color: canEdit ? "#AB47BC" : "#475569", fontSize: 12, fontWeight: 600 }}>{canEdit ? "+ 할당하기" : "미할당"}</div>
          </div>}
          {/* 근무 상태 */}
          <div style={{ padding: "8px 10px", borderRadius: 8, background: w.onDuty ? "rgba(76,175,80,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${w.onDuty ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.04)"}` }}>
            <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 2 }}>📅 오늘 근무</div>
            <div style={{ color: w.onDuty ? "#66BB6A" : "#475569", fontSize: 12, fontWeight: 600 }}>{w.onDuty ? `${w.checkInTime}~ 근무중` : "출근 전"}</div>
          </div>
        </div>
      </Card>);
    })}

    {/* 근무자 추가 (근무지 선택) */}
    {canEdit && filtered.length > 0 && filter === "all" && <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px dashed rgba(33,150,243,0.3)" }}>
      <div style={{ color: "#42A5F5", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>➕ 근무자 추가</div>
      {!addSiteId ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sites.map(s => { const zname = s.name || zones.find(z => z.id === s.zoneId)?.name || "미배치"; if (!s.name && !s.zoneId) return null; return <button key={s.id} onClick={() => setAddSiteId(s.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(33,150,243,0.3)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📍 {zname}</button>; })}
      </div> : <div style={{ display: "grid", gap: 8 }}>
        <div style={{ color: "#94A3B8", fontSize: 12 }}>📍 {(() => { const s = sites.find(ss => ss.id === addSiteId); return s?.name || zones.find(z => z.id === s?.zoneId)?.name || "미배치"; })()}</div>
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.2)" }}>
          <div style={{ color: "#66BB6A", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>🔐 자동 계정 생성</div>
          <div style={{ color: "#94A3B8", fontSize: 11 }}>로그인 ID = <strong style={{ color: "#66BB6A" }}>{newW.name || "이름"}</strong> · 비밀번호 = <strong style={{ color: "#66BB6A" }}>1234</strong></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Input placeholder="이름 (= 로그인 ID)" value={newW.name} onChange={e => setNewW({ ...newW, name: e.target.value })} />
          <Input placeholder="010-0000-0000" value={newW.phone} onChange={e => setNewW({ ...newW, phone: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 8 }}>
          <Input placeholder="역할 (운영/안전)" value={newW.role} onChange={e => setNewW({ ...newW, role: e.target.value })} />
          <Input type="number" placeholder="식수" value={newW.meals} onChange={e => setNewW({ ...newW, meals: e.target.value })} />
          <Input placeholder="식사 메모" value={newW.mealNote} onChange={e => setNewW({ ...newW, mealNote: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" icon="✅" onClick={() => addWorker(addSiteId)} style={{ flex: 1, justifyContent: "center" }}>추가</Btn>
          <Btn variant="ghost" onClick={() => { setAddSiteId(null); setNewW({ name: "", phone: "", role: "운영", meals: 1, mealNote: "" }); }}>취소</Btn>
        </div>
      </div>}
    </Card>}

    {/* 📍 근무지 변경 모달 */}
    {siteModalWorker && (() => {
      const w = siteModalWorker;
      const validSites = sites.filter(s => s.id !== "_pool");
      const poolSite = sites.find(s => s.id === "_pool");
      return (<div onClick={() => setSiteModalWorker(null)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, maxHeight: "85vh", background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", overflow: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(33,150,243,0.25), rgba(33,150,243,0.05))", border: "1px solid rgba(33,150,243,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📍</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, margin: 0 }}>📍 근무지 변경 - {w.name}</h3>
              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>현재: <span style={{ color: "#42A5F5", fontWeight: 700 }}>{w.siteName}</span></div>
            </div>
            <button onClick={() => setSiteModalWorker(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          {/* 근무지 그리드 */}
          {validSites.length === 0 ? <EmptyState icon="📍" title="등록된 근무지가 없습니다" description="⚙️ 관리 → 인력관리에서 근무지를 추가하세요" /> :
            <div>
              <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 8, padding: "0 4px" }}>📍 근무지 선택 ({validSites.length}곳)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {validSites.map(s => {
                  const zname = s.name || zones.find(z => z.id === s.zoneId)?.name || "미설정";
                  const cnt = (s.workers || []).length;
                  const isMine = s.id === w.siteId;
                  return (<button key={s.id} onClick={() => { if (!isMine) { moveWorkerSite(w.id, w.siteId, s.id); setSiteModalWorker(null); } }} disabled={isMine} style={{ position: "relative", padding: "14px 10px", borderRadius: 10, border: isMine ? "2px solid #66BB6A" : "1.5px solid rgba(33,150,243,0.3)", background: isMine ? "rgba(76,175,80,0.15)" : "rgba(33,150,243,0.05)", color: isMine ? "#66BB6A" : "#42A5F5", cursor: isMine ? "default" : "pointer", textAlign: "left", transition: "all 0.15s" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {zname}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>👥 {cnt}명</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isMine ? "#66BB6A" : "#42A5F5" }}>{isMine ? "✓ 현재" : "이동 ›"}</span>
                    </div>
                  </button>);
                })}
              </div>

              {/* 미배치 옵션 */}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 8, padding: "0 4px" }}>⚠️ 기타</div>
                {(() => {
                  const isMine = w.siteId === "_pool";
                  const cnt = (poolSite?.workers || []).length;
                  return (<button onClick={() => { if (!isMine) { moveWorkerSite(w.id, w.siteId, "_pool"); setSiteModalWorker(null); } }} disabled={isMine} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: isMine ? "2px solid #FFA726" : "1.5px solid rgba(255,167,38,0.3)", background: isMine ? "rgba(255,167,38,0.12)" : "rgba(255,167,38,0.04)", color: "#FFA726", cursor: isMine ? "default" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>⚠️ 미배치 (대기)</span>
                    <span style={{ fontSize: 11 }}>{cnt}명 · {isMine ? "✓ 현재" : "이동 ›"}</span>
                  </button>);
                })()}
              </div>
            </div>}

          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.15)", color: "#94A3B8", fontSize: 11, lineHeight: 1.6 }}>
            <strong style={{ color: "#42A5F5" }}>💡 안내</strong><br/>
            • 근무지 클릭 → 즉시 이동<br/>
            • 연결된 계정의 근무지 정보도 함께 갱신<br/>
            • 미배치는 대기 상태(휴식·이동중)에 사용
          </div>
        </div>
      </div>);
    })()}

    {/* 📻 무전기 할당 모달 */}
    {radioModalWorker && (() => {
      const w = radioModalWorker;
      const radioAssets = assets.filter(a => a.trackUnits && a.units && a.units.length > 0);
      const totalAvailable = radioAssets.reduce((s, a) => s + a.units.filter(u => u.status === "available").length, 0);
      return (<div onClick={() => setRadioModalWorker(null)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, maxHeight: "85vh", background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", overflow: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(171,71,188,0.25), rgba(171,71,188,0.05))", border: "1px solid rgba(171,71,188,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📻</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, margin: 0 }}>📻 무전기 할당 - {w.name}</h3>
              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>📍 {w.siteName} · 사용가능 {totalAvailable}대</div>
            </div>
            <button onClick={() => setRadioModalWorker(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          {/* 현재 할당된 무전기 */}
          {w.radios.length > 0 && <div style={{ padding: 12, borderRadius: 10, background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.2)", marginBottom: 14 }}>
            <div style={{ color: "#66BB6A", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>✅ 현재 할당 ({w.radios.length}대)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {w.radios.map((r, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.3)" }}>
                <span style={{ color: "#66BB6A", fontSize: 14, fontWeight: 800 }}>#{r.number}</span>
                <span style={{ color: "#94A3B8", fontSize: 11 }}>{r.assetName}</span>
                <button onClick={() => returnRadio(r.assetId, r.unitId)} style={{ width: 18, height: 18, borderRadius: 4, border: "none", background: "rgba(244,67,54,0.2)", color: "#EF5350", fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>))}
            </div>
          </div>}

          {/* 자산별 사용가능 무전기 번호 그리드 */}
          {radioAssets.length === 0 ? <EmptyState icon="📻" title="등록된 무전기가 없습니다" description="📦 장비 관리에서 '🔢 개별 번호 추적' ON으로 등록하세요" /> :
            radioAssets.map(a => {
              const availUnits = a.units.filter(u => u.status === "available");
              const assignedUnits = a.units.filter(u => u.status === "assigned");
              const otherUnits = a.units.filter(u => u.status === "broken" || u.status === "lost");
              return (<div key={a.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
                  <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{a.name}</div>
                  <div style={{ color: "#94A3B8", fontSize: 11 }}>가용 {availUnits.length} / 총 {a.units.length}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))", gap: 6 }}>
                  {a.units.map(u => {
                    const STATUS_COLOR = { available: "#66BB6A", assigned: "#42A5F5", broken: "#EF5350", lost: "#FFA726" };
                    const c = STATUS_COLOR[u.status];
                    const isAvailable = u.status === "available";
                    const isMine = u.assignedTo === w.id || u.assignedToName === w.name;
                    return (<button key={u.id} onClick={() => { if (isAvailable) assignRadio(w, a.id, u.id); else if (isMine) returnRadio(a.id, u.id); }} disabled={!isAvailable && !isMine} style={{ position: "relative", padding: "12px 6px", borderRadius: 10, border: `1.5px solid ${c}40`, background: isMine ? `${c}25` : `${c}08`, color: c, fontSize: 16, fontWeight: 800, cursor: (isAvailable || isMine) ? "pointer" : "not-allowed", opacity: (isAvailable || isMine) ? 1 : 0.5, transition: "all 0.15s", fontVariantNumeric: "tabular-nums" }}>
                      #{u.number}
                      {!isAvailable && !isMine && u.assignedToName && <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>👤 {u.assignedToName}</div>}
                      {!isAvailable && !isMine && !u.assignedToName && <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>{u.status === "broken" ? "고장" : u.status === "lost" ? "분실" : ""}</div>}
                      {isMine && <div style={{ fontSize: 9, color: c, fontWeight: 700, marginTop: 2 }}>✓ 내 것</div>}
                      {isAvailable && <div style={{ fontSize: 9, color: c, fontWeight: 600, marginTop: 2 }}>+ 할당</div>}
                    </button>);
                  })}
                </div>
              </div>);
            })}

          <div style={{ padding: 10, borderRadius: 10, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.15)", color: "#94A3B8", fontSize: 11, lineHeight: 1.6 }}>
            <strong style={{ color: "#42A5F5" }}>💡 사용법</strong><br/>
            • <span style={{ color: "#66BB6A", fontWeight: 700 }}>초록색 #번호</span>: 사용 가능 - 클릭으로 할당<br/>
            • <span style={{ color: "#42A5F5", fontWeight: 700 }}>파란색 #번호</span>: 다른 사람 할당됨<br/>
            • 본인 무전기는 클릭으로 반납
          </div>
        </div>
      </div>);
    })()}

    {/* 토스트 알림 */}
    {toast && <div style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 60px)", left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "12px 20px", borderRadius: 12, background: toast.type === "success" ? "linear-gradient(135deg, rgba(76,175,80,0.95), rgba(67,160,71,0.95))" : toast.type === "info" ? "linear-gradient(135deg, rgba(33,150,243,0.95), rgba(25,118,210,0.95))" : "linear-gradient(135deg, rgba(244,67,54,0.95), rgba(211,47,47,0.95))", color: "#fff", fontSize: 14, fontWeight: 700, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", backdropFilter: "blur(10px)", animation: "slideDown 0.3s ease-out", pointerEvents: "none" }}>
      {toast.msg}
    </div>}
    <style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </div>
  </div>);
}

// ─── 2.1: 근무일지 / 교대관리 (Shifts) ─────────────────────────────
function ShiftsPage({ settings, setSettings, session }) {
  const shifts = settings.shifts || [];
  const sites = (settings.sites || []).filter(s => s.name);
  const allWorkers = sites.flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name, siteId: s.id })));
  const me = allWorkers.find(w => w.accountId === session?.id) || allWorkers.find(w => w.name === session?.name);
  const canManage = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);

  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(today);
  const [tab, setTab] = useState("today"); // today | mine | all
  const [showForm, setShowForm] = useState(false);

  // 출퇴근 체크
  const myToday = shifts.find(s => s.workerId === me?.id && s.date === today);
  const checkIn = () => {
    if (!me) { alert("근무자 등록이 안 되어있습니다."); return; }
    const newShift = { id: "sh_"+Date.now(), workerId: me.id, workerName: me.name, siteId: me.siteId, siteName: me.siteName, role: me.role, date: today, checkIn: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }), checkOut: null, log: "", events: [] };
    setSettings(prev => ({ ...prev, shifts: [...(prev.shifts || []), newShift] }));
  };
  const checkOut = () => {
    if (!myToday) return;
    const cot = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    setSettings(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === myToday.id ? { ...s, checkOut: cot } : s) }));
  };
  const updateLog = (id, log) => setSettings(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === id ? { ...s, log } : s) }));
  const addEvent = (id, event) => setSettings(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === id ? { ...s, events: [...(s.events || []), { ts: Date.now(), text: event, time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) }] } : s) }));
  const delShift = (id) => { if (confirm("기록을 삭제하시겠습니까?")) setSettings(prev => ({ ...prev, shifts: prev.shifts.filter(s => s.id !== id) })); };

  const todayShifts = shifts.filter(s => s.date === filterDate);
  const myShifts = shifts.filter(s => s.workerId === me?.id).sort((a,b) => b.date.localeCompare(a.date));
  const allShifts = shifts.sort((a,b) => b.date.localeCompare(a.date) || b.checkIn?.localeCompare(a.checkIn || ""));

  const list = tab === "today" ? todayShifts : tab === "mine" ? myShifts : allShifts;

  return (<PageContainer maxWidth={700}>
    <PageHeader icon="📝" title="근무일지" subtitle="교대 관리 + 일지 작성" accent="#66BB6A" />

    {/* 출퇴근 카드 */}
    {me && <Card style={{ background: myToday ? (myToday.checkOut ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, rgba(76,175,80,0.1), rgba(76,175,80,0.02))") : "rgba(255,255,255,0.04)", border: myToday && !myToday.checkOut ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 50, height: 50, borderRadius: 14, background: myToday && !myToday.checkOut ? "rgba(76,175,80,0.2)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: myToday && !myToday.checkOut ? "pulse 2s infinite" : "none" }}>{myToday && !myToday.checkOut ? "🟢" : "👤"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{me.name}</div>
          <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>
            {!myToday ? "출근 전" : myToday.checkOut ? `근무 종료 (${myToday.checkIn} ~ ${myToday.checkOut})` : `${myToday.checkIn}부터 근무 중`}
          </div>
        </div>
        {!myToday && <Btn variant="primary" color="#66BB6A" icon="▶" onClick={checkIn}>출근</Btn>}
        {myToday && !myToday.checkOut && <Btn variant="primary" color="#EF5350" icon="⏹" onClick={checkOut}>퇴근</Btn>}
      </div>
      {myToday && !myToday.checkOut && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
        <Label>📋 근무 일지</Label>
        <textarea value={myToday.log || ""} onChange={e => updateLog(myToday.id, e.target.value)} placeholder="오늘 근무 내용을 기록하세요..." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#E2E8F0", fontSize: 13, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input id="event-input" placeholder="이슈/특이사항" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", color: "#E2E8F0", fontSize: 12 }} onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { addEvent(myToday.id, e.target.value); e.target.value = ""; } }} />
          <Btn variant="secondary" onClick={() => { const inp = document.getElementById("event-input"); if (inp.value.trim()) { addEvent(myToday.id, inp.value); inp.value = ""; } }} style={{ padding: "8px 14px", fontSize: 12 }}>+ 이벤트</Btn>
        </div>
        {(myToday.events || []).length > 0 && <div style={{ marginTop: 8 }}>
          {myToday.events.slice(-5).reverse().map((ev, i) => <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(33,150,243,0.05)", marginBottom: 4, fontSize: 12, color: "#CBD5E1" }}>
            <span style={{ color: "#42A5F5", fontWeight: 700 }}>{ev.time}</span> · {ev.text}
          </div>)}
        </div>}
      </div>}
    </Card>}

    {/* 탭 */}
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      <button onClick={() => setTab("today")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: tab === "today" ? "1.5px solid rgba(102,187,106,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === "today" ? "rgba(76,175,80,0.08)" : "rgba(255,255,255,0.02)", color: tab === "today" ? "#66BB6A" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📅 오늘 ({todayShifts.length})</button>
      <button onClick={() => setTab("mine")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: tab === "mine" ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === "mine" ? "rgba(33,150,243,0.08)" : "rgba(255,255,255,0.02)", color: tab === "mine" ? "#42A5F5" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>👤 내 기록 ({myShifts.length})</button>
      {canManage && <button onClick={() => setTab("all")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: tab === "all" ? "1.5px solid rgba(255,167,38,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === "all" ? "rgba(255,152,0,0.08)" : "rgba(255,255,255,0.02)", color: tab === "all" ? "#FFA726" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📊 전체 ({allShifts.length})</button>}
    </div>

    {tab === "today" && <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13, marginBottom: 12 }} />}

    {/* 일지 목록 */}
    {list.length === 0 && <EmptyState icon="📝" title="기록이 없습니다" />}
    {list.map(s => (<Card key={s.id}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: s.checkOut ? "rgba(255,255,255,0.04)" : "rgba(76,175,80,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{s.checkOut ? "✅" : "🟢"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{s.workerName}</div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>{s.siteName} · {s.role} · {s.date}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: s.checkOut ? "#94A3B8" : "#66BB6A", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.checkIn} {s.checkOut && `~ ${s.checkOut}`}</div>
          {!s.checkOut && <div style={{ color: "#66BB6A", fontSize: 10, fontWeight: 700 }}>● 근무중</div>}
        </div>
      </div>
      {s.log && <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)", color: "#CBD5E1", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{s.log}</div>}
      {(s.events || []).length > 0 && <div style={{ marginTop: 6 }}>
        {s.events.map((ev, i) => <div key={i} style={{ padding: "4px 8px", fontSize: 11, color: "#94A3B8" }}>
          <span style={{ color: "#42A5F5" }}>● {ev.time}</span> {ev.text}
        </div>)}
      </div>}
      {canManage && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="danger" onClick={() => delShift(s.id)} style={{ padding: "6px 12px", fontSize: 12 }}>🗑 삭제</Btn>
      </div>}
    </Card>))}
  </PageContainer>);
}

// ─── 2.1: 보고서 자동생성 (Reports) ─────────────────────────────
function ReportsPage({ settings, setSettings, session, categories, alerts }) {
  const [tab, setTab] = useState("daily"); // daily | range | custom
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const canExport = ["admin","manager","sysadmin"].includes(session?.role);

  const generateReport = (type) => {
    const dt = new Date();
    const reportDate = type === "daily" ? date : dt.toLocaleDateString("ko-KR");

    const lines = [];
    lines.push(`# ${settings.festivalName || "축제"} 일일 종합 보고서`);
    lines.push(`작성일: ${reportDate} ${dt.toLocaleTimeString("ko-KR")}`);
    lines.push(`작성자: ${session?.name || "?"}`);
    lines.push("");

    // 인파 현황
    const crowd = (categories || []).find(c => c.id === "crowd");
    if (crowd) {
      lines.push("## 1. 인파 현황");
      lines.push(`- 현재 체류: ${(crowd.currentValue || 0).toLocaleString()}명`);
      lines.push(`- 출입구 수: ${(settings.gates || []).length}개`);
      try {
        const cls = JSON.parse(localStorage.getItem("_crowd") || "{}");
        lines.push(`- 누적 방문: ${(cls.cumulative || 0).toLocaleString()}명`);
      } catch {}
      lines.push("");
    }

    // 환경 데이터
    const envCats = (categories || []).filter(c => c.id !== "crowd" && c.id !== "humidity" && c.id !== "temp");
    if (envCats.length > 0) {
      lines.push("## 2. 환경 모니터링");
      envCats.forEach(c => lines.push(`- ${c.icon || ""} ${c.name}: ${c.currentValue || 0}${c.unit || ""}`));
      lines.push("");
    }

    // 구역 혼잡도
    const zones = settings.zones || [];
    const cong = settings.zoneCongestion || [];
    if (zones.length > 0) {
      lines.push("## 3. 구역별 혼잡도");
      zones.forEach(z => {
        const c = cong.find(cc => cc.zoneId === z.id);
        const lv = c ? { smooth: "🟢 원활", crowded: "🟡 혼잡", danger: "🔴 위험" }[c.level] : "⚪ 미보고";
        lines.push(`- ${z.name}: ${lv}${c?.memo ? ` (${c.memo})` : ""}`);
      });
      lines.push("");
    }

    // 알림 이력
    const todayAlerts = (alerts || []).filter(a => {
      try { return a.time && a.time.includes(reportDate.slice(0, 10)) || a.time && new Date(a.time).toDateString() === new Date(date).toDateString(); } catch { return false; }
    });
    if ((alerts || []).length > 0) {
      lines.push("## 4. 알림 발생 이력");
      lines.push(`총 ${alerts.length}건 (당일 ${todayAlerts.length}건)`);
      alerts.slice(0, 20).forEach(a => lines.push(`- [${a.level}] ${a.category}: ${a.time}`));
      lines.push("");
    }

    // 근무 현황
    const todayShifts = (settings.shifts || []).filter(s => s.date === date);
    if (todayShifts.length > 0) {
      lines.push("## 5. 근무 현황");
      lines.push(`총 ${todayShifts.length}명 근무`);
      todayShifts.forEach(s => lines.push(`- ${s.workerName} (${s.siteName}/${s.role}): ${s.checkIn}${s.checkOut ? ` ~ ${s.checkOut}` : " ~ 근무중"}`));
      lines.push("");
    }

    // 자산 현황
    const assets = settings.assets || [];
    if (assets.length > 0) {
      lines.push("## 6. 장비/자산 현황");
      const totalQty = assets.reduce((s,a) => s+(a.total||0), 0);
      const availQty = assets.reduce((s,a) => s+(a.qty||0), 0);
      const broken = assets.reduce((s,a) => s+(a.units||[]).filter(u => u.status === "broken").length, 0);
      const lost = assets.reduce((s,a) => s+(a.units||[]).filter(u => u.status === "lost").length, 0);
      lines.push(`총 ${totalQty}개 / 가용 ${availQty}개 / 고장 ${broken}개 / 분실 ${lost}개`);
      lines.push("");
    }

    // 공연
    const perfsToday = (settings.performances || []).filter(p => p.date === date);
    if (perfsToday.length > 0) {
      lines.push("## 7. 공연 일정");
      perfsToday.forEach(p => lines.push(`- ${p.time || "?"} ${p.artist} (${p.genre || ""}) @ ${p.location || ""}`));
      lines.push("");
    }

    lines.push("---");
    lines.push(`SAFEFLOW · ${settings.festivalName || "축제 안전관리시스템"}`);
    return lines.join("\n");
  };

  const downloadFile = (content, filename, mime = "text/plain;charset=utf-8") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportMD = () => {
    const content = generateReport("daily");
    downloadFile(content, `safeflow_report_${date}.md`);
  };

  const exportCSV = () => {
    const rows = [["일시", "구역", "혼잡도", "메모", "보고자"]];
    (settings.zoneCongestion || []).forEach(c => {
      const z = (settings.zones || []).find(zz => zz.id === c.zoneId);
      rows.push([c.reportedAt || "", z?.name || "", c.level || "", c.memo || "", c.reportedByName || ""]);
    });
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile("\ufeff" + csv, `safeflow_congestion_${date}.csv`, "text/csv;charset=utf-8");
  };

  const exportShiftsCSV = () => {
    const rows = [["날짜", "근무자", "근무지", "역할", "출근", "퇴근", "일지"]];
    (settings.shifts || []).filter(s => tab === "daily" ? s.date === date : true).forEach(s => {
      rows.push([s.date, s.workerName, s.siteName, s.role, s.checkIn, s.checkOut || "", s.log || ""]);
    });
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile("\ufeff" + csv, `safeflow_shifts_${date}.csv`, "text/csv;charset=utf-8");
  };

  const printReport = () => {
    const content = generateReport("daily").replace(/\n/g, "<br>").replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^- (.*)$/gm, "• $1");
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>SAFEFLOW Report</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}h1{border-bottom:2px solid #42A5F5;padding-bottom:8px}h2{color:#1976D2;margin-top:24px}</style></head><body>${content}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const preview = generateReport("daily");

  return (<PageContainer maxWidth={800}>
    <PageHeader icon="📄" title="보고서" subtitle="일일 종합 보고서 자동 생성" accent="#FFA726" />

    {!canExport && <EmptyState icon="🔒" title="권한 없음" description="관리자만 보고서를 생성할 수 있습니다" />}

    {canExport && <>
      <Card>
        <Label>📅 보고서 일자</Label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} />
      </Card>

      <SectionTitle icon="📥" accent="#FFA726">내보내기</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <Btn variant="primary" color="#FFA726" icon="📄" onClick={exportMD} style={{ padding: "14px", justifyContent: "center" }}>마크다운 (.md)</Btn>
        <Btn variant="primary" color="#42A5F5" icon="🖨️" onClick={printReport} style={{ padding: "14px", justifyContent: "center" }}>인쇄/PDF</Btn>
        <Btn variant="primary" color="#66BB6A" icon="📊" onClick={exportCSV} style={{ padding: "14px", justifyContent: "center" }}>혼잡도 CSV</Btn>
        <Btn variant="primary" color="#AB47BC" icon="👥" onClick={exportShiftsCSV} style={{ padding: "14px", justifyContent: "center" }}>근무일지 CSV</Btn>
      </div>

      <SectionTitle icon="👁️" accent="#42A5F5">미리보기</SectionTitle>
      <Card>
        <pre style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{preview}</pre>
      </Card>
    </>}
  </PageContainer>);
}

// ─── 2.1: QR코드 관리 ─────────────────────────────
function QRPage({ settings, setSettings, session }) {
  const [tab, setTab] = useState("entry"); // entry | asset
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const baseUrl = window.location.origin + window.location.pathname;

  // QR 코드 라이브러리 없이 SVG로 간단 QR (실제 데이터 인코딩은 외부 API 사용)
  const qrUrl = (data) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&color=000000&bgcolor=ffffff`;

  const gates = settings.gates || [];
  const assets = (settings.assets || []).filter(a => a.trackUnits);
  const allUnits = assets.flatMap(a => (a.units || []).map(u => ({ ...u, assetId: a.id, assetName: a.name, category: a.category })));

  // 스캔 시뮬레이션 (카메라 미사용 시 수동 입력)
  const handleManualScan = () => {
    const code = prompt("QR 코드 값을 입력하세요 (URL 또는 ID):");
    if (!code) return;
    if (code.includes("?gate=")) {
      const gateId = code.split("?gate=")[1].split("&")[0];
      const gate = gates.find(g => g.id === gateId);
      setScanResult({ type: "gate", data: gate, raw: code });
    } else if (code.includes("?asset=")) {
      const assetCode = code.split("?asset=")[1].split("&")[0];
      const [aid, uid] = assetCode.split(":");
      const asset = assets.find(a => a.id === aid);
      const unit = allUnits.find(u => u.id === uid);
      setScanResult({ type: "asset", data: { asset, unit }, raw: code });
    } else {
      setScanResult({ type: "unknown", raw: code });
    }
  };

  const downloadQR = (url, filename) => {
    const a = document.createElement("a"); a.href = url; a.download = filename; a.target = "_blank"; a.click();
  };

  return (<PageContainer maxWidth={800}>
    <PageHeader icon="🔑" title="QR 코드 관리" subtitle="출입구·장비 QR 생성 및 스캔" accent="#9C27B0" />

    {/* 스캔 영역 */}
    <Card style={{ background: "linear-gradient(135deg, rgba(156,39,176,0.06), rgba(156,39,176,0.01))", border: "1px solid rgba(156,39,176,0.25)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: "rgba(156,39,176,0.15)", border: "1px solid rgba(156,39,176,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📷</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>QR 스캔</div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>QR 코드 또는 URL을 입력하세요</div>
        </div>
        <Btn variant="primary" color="#AB47BC" icon="📷" onClick={handleManualScan}>스캔</Btn>
      </div>
      {scanResult && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.3)" }}>
        {scanResult.type === "gate" && scanResult.data && <div>
          <div style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>✅ 출입구 인식</div>
          <div style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700 }}>📍 {scanResult.data.name}</div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>코드: {scanResult.data.id}</div>
        </div>}
        {scanResult.type === "asset" && scanResult.data.unit && <div>
          <div style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>✅ 장비 인식</div>
          <div style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700 }}>📦 {scanResult.data.asset?.name} #{scanResult.data.unit.number}</div>
          <div style={{ color: "#94A3B8", fontSize: 12 }}>{scanResult.data.unit.assignedToName ? `할당: ${scanResult.data.unit.assignedToName}` : "보관중"}</div>
        </div>}
        {scanResult.type === "unknown" && <div>
          <div style={{ color: "#FFA726", fontSize: 13, fontWeight: 700 }}>⚠️ 알 수 없는 코드</div>
          <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{scanResult.raw}</div>
        </div>}
      </div>}
    </Card>

    {/* 탭 */}
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      <button onClick={() => setTab("entry")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: tab === "entry" ? "1.5px solid rgba(156,39,176,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === "entry" ? "rgba(156,39,176,0.08)" : "rgba(255,255,255,0.02)", color: tab === "entry" ? "#AB47BC" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🚪 출입구 ({gates.length})</button>
      <button onClick={() => setTab("asset")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: tab === "asset" ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === "asset" ? "rgba(33,150,243,0.08)" : "rgba(255,255,255,0.02)", color: tab === "asset" ? "#42A5F5" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📦 장비 ({allUnits.length})</button>
    </div>

    {tab === "entry" && (gates.length === 0 ? <EmptyState icon="🚪" title="출입구가 등록되지 않음" description="⚙️ 관리 → 출입구에서 등록하세요" /> :
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {gates.map(g => { const url = `${baseUrl}?gate=${g.id}`; return (<Card key={g.id} style={{ padding: 14, textAlign: "center" }}>
          <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📍 {g.name}</div>
          <img src={qrUrl(url)} alt={g.name} style={{ width: 140, height: 140, borderRadius: 8, background: "#fff", padding: 8 }} />
          <div style={{ color: "#94A3B8", fontSize: 10, marginTop: 6, wordBreak: "break-all" }}>{url}</div>
          <Btn variant="secondary" icon="📥" onClick={() => downloadQR(qrUrl(url), `qr_gate_${g.name}.png`)} style={{ marginTop: 8, fontSize: 12, padding: "6px 12px", width: "100%", justifyContent: "center" }}>다운로드</Btn>
        </Card>); })}
      </div>)}

    {tab === "asset" && (allUnits.length === 0 ? <EmptyState icon="📦" title="개별 추적 장비 없음" description="장비 등록 시 '🔢 개별 번호 추적'을 켜야 QR이 생성됩니다" /> :
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {allUnits.map(u => { const url = `${baseUrl}?asset=${u.assetId}:${u.id}`; return (<Card key={u.id} style={{ padding: 12, textAlign: "center" }}>
          <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{u.assetName}</div>
          <div style={{ color: "#42A5F5", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>#{u.number}</div>
          <img src={qrUrl(url)} alt={u.number} style={{ width: 110, height: 110, borderRadius: 6, background: "#fff", padding: 6 }} />
          <Btn variant="secondary" icon="📥" onClick={() => downloadQR(qrUrl(url), `qr_${u.assetName}_${u.number}.png`)} style={{ marginTop: 8, fontSize: 11, padding: "5px 10px", width: "100%", justifyContent: "center" }}>다운로드</Btn>
        </Card>); })}
      </div>)}

    <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.15)", color: "#94A3B8", fontSize: 12, lineHeight: 1.6 }}>
      <strong style={{ color: "#42A5F5" }}>💡 사용법</strong><br/>
      • 출입구 QR을 출입구에 부착하면 시민이 스캔하여 바로 해당 페이지 이동<br/>
      • 장비 QR을 장비에 부착하면 스캔으로 즉시 자산 정보 확인<br/>
      • 다운로드 후 인쇄해서 부착하세요
    </div>
  </PageContainer>);
}


function HeatmapPage({ settings, setSettings, session }) {
  const [mode, setMode] = useState("view"); // view | draw | edit
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawingZoneId, setDrawingZoneId] = useState("");
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [areaDetailId, setAreaDetailId] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showWorkers, setShowWorkers] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | synced
  const mapRef = useRef(null);
  const fileRef = useRef(null);
  const canEdit = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);
  const zones = settings.zones || [];
  const congestion = settings.zoneCongestion || [];
  const workSites = settings.workSites || [];
  const assets = settings.assets || [];

  // 🗺️ 자동 동기화 - usePersist 사용 (변경 시 자동 저장 + Realtime 자동 수신)
  const fid = session?.festivalId || "default";
  const [mapImage, setMapImage] = usePersist(`${fid}_map_img_v1`, null);
  const [mapAreas, setMapAreas] = usePersist(`${fid}_map_areas_v1`, []);

  // 마이그레이션: settings → 별도 키 (한번만)
  useEffect(() => {
    if (!mapImage && settings.mapImage) {
      console.log("[히트맵] 도면 마이그레이션");
      setMapImage(settings.mapImage);
    }
    if ((!mapAreas || mapAreas.length === 0) && settings.mapAreas?.length > 0) {
      console.log("[히트맵] 영역 마이그레이션:", settings.mapAreas.length + "개");
      setMapAreas(settings.mapAreas);
    }
    if (settings.mapImage || settings.mapAreas?.length > 0) {
      setTimeout(() => setSettings(prev => { const n = { ...prev }; delete n.mapImage; delete n.mapAreas; return n; }), 1500);
    }
  }, []);

  // 동기화 상태 표시 (저장 중 / 완료 표시)
  useEffect(() => {
    setSyncStatus("saving");
    const t = setTimeout(() => setSyncStatus("synced"), 2500);
    return () => clearTimeout(t);
  }, [mapImage, mapAreas]);

  // 구역별 근무자/무전기 정보 자동 집계
  const getAreaInfo = (zoneId) => {
    const sitesInZone = workSites.filter(s => s.zoneId === zoneId);
    const workers = sitesInZone.flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name || zones.find(z => z.id === s.zoneId)?.name || "?" })));
    const onDutyCount = workers.filter(w => (settings.shifts || []).some(sh => sh.workerId === w.id && sh.date === new Date().toISOString().slice(0, 10) && !sh.checkOut)).length;
    // 이 구역 근무자에게 할당된 무전기
    const radios = [];
    assets.forEach(a => {
      if (a.trackUnits && a.units) {
        a.units.forEach(u => {
          if (u.status === "assigned" && workers.find(w => w.id === u.assignedTo || w.name === u.assignedToName)) {
            radios.push({ assetName: a.name, number: u.number, assignedToName: u.assignedToName });
          }
        });
      }
    });
    return { sites: sitesInZone, workers, workerCount: workers.length, onDutyCount, radios, radioCount: radios.length };
  };

  // 이미지 압축 - 큰 도면도 빠른 동기화 가능
  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 1600; // 최대 변 길이
          let { width, height } = img;
          if (width > MAX) { height = (height * MAX) / width; width = MAX; }
          if (height > MAX) { width = (width * MAX) / height; height = MAX; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG 75% 품질
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const sizeKB = Math.round(compressed.length / 1024);
      setMapImage(compressed);
      console.log(`[히트맵] 이미지 업로드 완료: ${sizeKB}KB`);
      if (sizeKB > 800) alert(`⚠️ 이미지 크기가 큽니다 (${sizeKB}KB).\n작은 이미지로 업로드하면 동기화가 더 빠릅니다.`);
    } catch (err) {
      alert("이미지 처리 실패: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const getMapPos = (e) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  const handleMapClick = (e) => {
    if (mode !== "draw") return;
    if (!drawingZoneId) { alert("먼저 위에서 구역을 선택하세요."); return; }
    const pos = getMapPos(e); if (!pos) return;
    setDrawingPoints([...drawingPoints, pos]);
  };

  const finishDrawing = () => {
    if (drawingPoints.length < 3) { alert("최소 3개 점이 필요합니다."); return; }
    const newArea = { id: "ma_" + Date.now(), zoneId: drawingZoneId, points: drawingPoints };
    setMapAreas(prev => [...(prev || []), newArea]);
    setDrawingPoints([]); setDrawingZoneId(""); setMode("view");
    alert("✅ 영역이 추가되었습니다.\n\n다른 기기에 자동으로 동기화됩니다 (3~5초).");
  };

  const cancelDrawing = () => {
    setDrawingPoints([]); setDrawingZoneId(""); setMode("view");
  };

  const undoLastPoint = () => {
    setDrawingPoints(drawingPoints.slice(0, -1));
  };

  const removeArea = (id) => {
    if (confirm("이 영역을 삭제하시겠습니까?")) {
      setMapAreas(prev => (prev || []).filter(a => a.id !== id));
      setSelectedAreaId(null);
    }
  };

  const getCongestionLevel = (zoneId) => {
    const c = congestion.find(cc => cc.zoneId === zoneId);
    return c?.level || "smooth";
  };
  const CL = { smooth: "#66BB6A", crowded: "#FFA726", danger: "#EF5350" };

  // 영역의 중심 좌표 계산
  const getAreaCenter = (points) => {
    if (!points?.length) return { x: 50, y: 50 };
    const cx = points.reduce((s,p) => s+p.x, 0) / points.length;
    const cy = points.reduce((s,p) => s+p.y, 0) / points.length;
    return { x: cx, y: cy };
  };

  // 폴리곤 SVG path
  const pointsToPath = (pts) => pts.map(p => `${p.x},${p.y}`).join(" ");

  // 미배치 구역
  const placedZoneIds = mapAreas.map(a => a.zoneId);
  const unplacedZones = zones.filter(z => !placedZoneIds.includes(z.id));

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(16px, env(safe-area-inset-right)) 80px max(16px, env(safe-area-inset-left))" }}>
    <style>{`@keyframes glow-pulse{0%,100%{filter:drop-shadow(0 0 8px currentColor) drop-shadow(0 0 16px currentColor)}50%{filter:drop-shadow(0 0 16px currentColor) drop-shadow(0 0 32px currentColor)}}`}</style>
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <PageHeader icon="🗺️" title="히트맵 지도" subtitle={`도면 ${mapImage ? "✓" : "X"} · 영역 ${mapAreas?.length || 0}개`} accent="#42A5F5" action={<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8, background: syncStatus === "saving" ? "rgba(255,167,38,0.1)" : "rgba(76,175,80,0.1)", border: `1px solid ${syncStatus === "saving" ? "rgba(255,167,38,0.3)" : "rgba(76,175,80,0.3)"}` }}>
        <span style={{ fontSize: 12, color: syncStatus === "saving" ? "#FFA726" : "#66BB6A", fontWeight: 700 }}>
          {syncStatus === "saving" ? "⏳ 동기화중..." : "✅ 자동 동기화"}
        </span>
      </div>} />

      {!mapImage && canEdit && <Card style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📍</div>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 8px" }}>축제장 도면 업로드</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>도면을 올리면 구역 영역을 그릴 수 있습니다.</p>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: uploading ? "#444" : "linear-gradient(135deg, #42A5F5, #1976D2)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: uploading ? "wait" : "pointer" }}>{uploading ? "⏳ 압축 중..." : "📤 도면 업로드"}</button>
        <p style={{ color: "#94A3B8", fontSize: 11, marginTop: 10 }}>이미지가 자동으로 1600px 이내로 압축됩니다 (JPEG 75%)</p>
      </Card>}

      {!mapImage && !canEdit && <Card style={{ textAlign: "center", padding: 40 }}>
        <p style={{ color: "#94A3B8", fontSize: 14 }}>관리자가 도면을 업로드하지 않았습니다.</p>
      </Card>}

      {mapImage && <>
        {/* 컨트롤 - 모드 전환 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setMode("view")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: mode === "view" ? "1.5px solid #42A5F5" : "1px solid rgba(255,255,255,0.1)", background: mode === "view" ? "rgba(33,150,243,0.1)" : "rgba(255,255,255,0.03)", color: mode === "view" ? "#42A5F5" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>👁️ 보기</button>
          {canEdit && <button onClick={() => setMode("draw")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: mode === "draw" ? "1.5px solid #FFA726" : "1px solid rgba(255,255,255,0.1)", background: mode === "draw" ? "rgba(255,152,0,0.1)" : "rgba(255,255,255,0.03)", color: mode === "draw" ? "#FFA726" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✏️ 영역 그리기</button>}
          {canEdit && <button onClick={() => setMode("edit")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: mode === "edit" ? "1.5px solid #EF5350" : "1px solid rgba(255,255,255,0.1)", background: mode === "edit" ? "rgba(244,67,54,0.1)" : "rgba(255,255,255,0.03)", color: mode === "edit" ? "#EF5350" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🗑 삭제</button>}
          {canEdit && <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />}
          {canEdit && <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#94A3B8", fontSize: 13, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.5 : 1 }}>{uploading ? "⏳" : "🔄"}</button>}
        </div>

        {/* 그리기 모드 - 구역 선택 */}
        {mode === "draw" && <div style={{ padding: "12px", borderRadius: 12, background: "rgba(255,152,0,0.06)", border: "1px solid rgba(255,152,0,0.25)", marginBottom: 12 }}>
          <div style={{ color: "#FFA726", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>✏️ 영역 그리기 모드</div>
          {!drawingZoneId ? <div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 8 }}>1️⃣ 그릴 구역을 선택하세요:</div>
            {unplacedZones.length === 0 ? <div style={{ color: "#94A3B8", fontSize: 12 }}>⚠️ 모든 구역이 이미 배치되었습니다. 추가 구역은 ⚙️관리 → 구역설정에서 등록하세요.</div> :
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{unplacedZones.map(z => (
                <button key={z.id} onClick={() => setDrawingZoneId(z.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,152,0,0.3)", background: "rgba(255,152,0,0.05)", color: "#FFA726", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📍 {z.name}</button>
              ))}</div>}
          </div> : <div>
            <div style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🎯 그리는 중: <span style={{ color: "#FFA726" }}>{zones.find(z => z.id === drawingZoneId)?.name}</span></div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 8 }}>2️⃣ 지도를 클릭해서 점을 찍으세요. 최소 3개 점이 필요합니다.</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ padding: "6px 10px", borderRadius: 6, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 12, fontWeight: 700 }}>📍 점 {drawingPoints.length}개</span>
              <button onClick={undoLastPoint} disabled={drawingPoints.length === 0} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: drawingPoints.length === 0 ? "#475569" : "#94A3B8", fontSize: 12, cursor: drawingPoints.length === 0 ? "not-allowed" : "pointer" }}>↶ 되돌리기</button>
              <button onClick={finishDrawing} disabled={drawingPoints.length < 3} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: drawingPoints.length < 3 ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, #66BB6A, #43A047)", color: drawingPoints.length < 3 ? "#475569" : "#fff", fontSize: 12, fontWeight: 700, cursor: drawingPoints.length < 3 ? "not-allowed" : "pointer" }}>✅ 저장</button>
              <button onClick={cancelDrawing} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(244,67,54,0.2)", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>✕ 취소</button>
            </div>
          </div>}
        </div>}

        {mode === "edit" && <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(244,67,54,0.06)", border: "1px solid rgba(244,67,54,0.2)", marginBottom: 12 }}>
          <div style={{ color: "#EF5350", fontSize: 12, fontWeight: 700 }}>🗑 삭제 모드 - 지도에서 영역을 클릭하면 삭제됩니다</div>
        </div>}

        {/* 범례 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 12, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#94A3B8", fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: "#66BB6A" }} />원활</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#94A3B8", fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: "#FFA726" }} />혼잡</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#94A3B8", fontSize: 12 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: "#EF5350" }} />위험</span>
        </div>

        {/* 지도 */}
        <div ref={mapRef} onClick={handleMapClick} style={{ position: "relative", width: "100%", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", cursor: mode === "draw" && drawingZoneId ? "crosshair" : "default", background: "#000" }}>
          <img src={mapImage} alt="map" style={{ width: "100%", display: "block", opacity: 0.7, pointerEvents: "none" }} draggable={false} />

          {/* SVG 오버레이 - 폴리곤 영역 */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            {/* 저장된 영역 */}
            {mapAreas.map(area => {
              const zone = zones.find(z => z.id === area.zoneId);
              if (!zone) return null;
              const lv = getCongestionLevel(area.zoneId);
              const color = CL[lv];
              const isSelected = selectedAreaId === area.id;
              return (<g key={area.id} style={{ pointerEvents: mode === "edit" ? "auto" : "none", cursor: mode === "edit" ? "pointer" : "default" }} onClick={(e) => { e.stopPropagation(); if (mode === "edit") removeArea(area.id); else setSelectedAreaId(area.id === selectedAreaId ? null : area.id); }}>
                {/* 글로우 효과 (블러된 폴리곤) */}
                <polygon points={pointsToPath(area.points)} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="0.6" strokeOpacity="0.4" style={{ filter: `drop-shadow(0 0 4px ${color})`, animation: lv !== "smooth" ? "glow-pulse 2s infinite" : "none", color }} />
                {/* 본 영역 */}
                <polygon points={pointsToPath(area.points)} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="0.4" strokeOpacity="0.9" />
              </g>);
            })}

            {/* 그리는 중 폴리곤 */}
            {mode === "draw" && drawingPoints.length > 0 && <>
              {drawingPoints.length >= 3 && <polygon points={pointsToPath(drawingPoints)} fill="#FFA726" fillOpacity="0.2" stroke="#FFA726" strokeWidth="0.4" strokeDasharray="1,1" />}
              {drawingPoints.length >= 2 && <polyline points={pointsToPath(drawingPoints)} fill="none" stroke="#FFA726" strokeWidth="0.4" strokeDasharray="0.8,0.5" />}
            </>}
          </svg>

          {/* 영역 라벨 (HTML) - 클릭 가능 + 근무자/무전기 정보 */}
          {showLabels && mapAreas.map(area => {
            const zone = zones.find(z => z.id === area.zoneId);
            if (!zone) return null;
            const lv = getCongestionLevel(area.zoneId);
            const color = CL[lv];
            const center = getAreaCenter(area.points);
            const info = getAreaInfo(area.zoneId);
            return (<div key={area.id} onClick={(e) => { if (mode === "view") { e.stopPropagation(); setAreaDetailId(area.zoneId); } }} style={{ position: "absolute", left: `${center.x}%`, top: `${center.y}%`, transform: "translate(-50%, -50%)", pointerEvents: mode === "view" ? "auto" : "none", cursor: mode === "view" ? "pointer" : "default", zIndex: 5 }}>
              <div style={{ padding: "5px 10px", borderRadius: 8, background: `${color}EE`, border: "1.5px solid #fff", color: "#fff", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", boxShadow: `0 0 16px ${color}AA, 0 2px 8px rgba(0,0,0,0.3)`, textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>📍 {zone.name}</div>
                {showWorkers && (info.workerCount > 0 || info.radioCount > 0) && <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.95, display: "flex", justifyContent: "center", gap: 6 }}>
                  {info.workerCount > 0 && <span>👥 {info.workerCount}{info.onDutyCount > 0 ? `(${info.onDutyCount})` : ""}</span>}
                  {info.radioCount > 0 && <span>📻 {info.radioCount}</span>}
                </div>}
              </div>
            </div>);
          })}

          {/* 그리는 중 점 */}
          {mode === "draw" && drawingPoints.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: 12, height: 12, borderRadius: 6, background: "#FFA726", border: "2px solid #fff", transform: "translate(-50%, -50%)", boxShadow: "0 0 12px rgba(255,167,38,0.8)", pointerEvents: "none" }} />
          ))}

          {mode === "draw" && drawingZoneId && drawingPoints.length === 0 && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ padding: "12px 20px", borderRadius: 12, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 14, fontWeight: 700 }}>👆 지도를 클릭하여 영역을 그리세요</div>
          </div>}
        </div>

        {/* 미배치 구역 안내 */}
        {mode === "view" && unplacedZones.length > 0 && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(255,152,0,0.05)", border: "1px solid rgba(255,152,0,0.15)" }}>
          <div style={{ color: "#FFA726", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📌 영역 미설정 구역 ({unplacedZones.length})</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{unplacedZones.map(z => <span key={z.id} style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", color: "#94A3B8", fontSize: 11 }}>{z.name}</span>)}</div>
        </div>}

        {/* 통계 + 표시 토글 */}
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center", marginBottom: 12 }}>
            {["smooth", "crowded", "danger"].map(lv => {
              const count = mapAreas.filter(a => getCongestionLevel(a.zoneId) === lv).length;
              const labels = { smooth: "원활", crowded: "혼잡", danger: "위험" };
              return <div key={lv}>
                <div style={{ color: CL[lv], fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{count}</div>
                <div style={{ color: "#94A3B8", fontSize: 12 }}>{labels[lv]}</div>
              </div>;
            })}
          </div>
          <div style={{ paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setShowLabels(!showLabels)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: showLabels ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.1)", background: showLabels ? "rgba(33,150,243,0.08)" : "rgba(255,255,255,0.02)", color: showLabels ? "#42A5F5" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showLabels ? "👁️ 라벨 ON" : "👁️ 라벨 OFF"}</button>
            <button onClick={() => setShowWorkers(!showWorkers)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: showWorkers ? "1.5px solid rgba(76,175,80,0.5)" : "1px solid rgba(255,255,255,0.1)", background: showWorkers ? "rgba(76,175,80,0.08)" : "rgba(255,255,255,0.02)", color: showWorkers ? "#66BB6A" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showWorkers ? "👥 인력정보 ON" : "👥 인력정보 OFF"}</button>
          </div>
        </Card>

        {/* 영역 클릭 → 상세 모달 */}
        {areaDetailId && (() => {
          const zone = zones.find(z => z.id === areaDetailId);
          if (!zone) return null;
          const info = getAreaInfo(areaDetailId);
          const lv = getCongestionLevel(areaDetailId);
          const color = CL[lv];
          return (<div onClick={() => setAreaDetailId(null)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, maxHeight: "85vh", background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", overflow: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 50, height: 50, borderRadius: 12, background: `${color}25`, border: `1px solid ${color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📍</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: "#E2E8F0", fontSize: 17, fontWeight: 700, margin: 0 }}>{zone.name}</h3>
                  <div style={{ color, fontSize: 12, fontWeight: 700, marginTop: 2 }}>● {lv === "smooth" ? "원활" : lv === "crowded" ? "혼잡" : "위험"}</div>
                </div>
                <button onClick={() => setAreaDetailId(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>

              {/* 통계 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
                <div style={{ padding: "8px 6px", borderRadius: 8, background: "rgba(33,150,243,0.05)", border: "1px solid rgba(33,150,243,0.15)", textAlign: "center" }}>
                  <div style={{ color: "#42A5F5", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{info.sites.length}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>📍 근무지</div>
                </div>
                <div style={{ padding: "8px 6px", borderRadius: 8, background: "rgba(33,150,243,0.05)", border: "1px solid rgba(33,150,243,0.15)", textAlign: "center" }}>
                  <div style={{ color: "#42A5F5", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{info.workerCount}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>👥 인력</div>
                </div>
                <div style={{ padding: "8px 6px", borderRadius: 8, background: "rgba(76,175,80,0.05)", border: "1px solid rgba(76,175,80,0.15)", textAlign: "center" }}>
                  <div style={{ color: "#66BB6A", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{info.onDutyCount}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>🟢 근무중</div>
                </div>
                <div style={{ padding: "8px 6px", borderRadius: 8, background: "rgba(171,71,188,0.05)", border: "1px solid rgba(171,71,188,0.15)", textAlign: "center" }}>
                  <div style={{ color: "#AB47BC", fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{info.radioCount}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>📻 무전기</div>
                </div>
              </div>

              {/* 근무지 목록 */}
              {info.sites.length > 0 && <div style={{ marginBottom: 14 }}>
                <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📍 근무지</div>
                {info.sites.map(s => (<div key={s.id} style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 4 }}>
                  <div style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600 }}>{s.name || zone.name}</div>
                  <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 2 }}>👥 {(s.workers || []).length}명 · 상태 {s.status === "active" ? "🟢 가동" : s.status === "warning" ? "🟡 주의" : "⚪ 대기"}</div>
                </div>))}
              </div>}

              {/* 근무자 명단 */}
              {info.workers.length > 0 ? <div>
                <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>👥 근무자 명단 ({info.workers.length}명)</div>
                {info.workers.map(w => {
                  const isOnDuty = (settings.shifts || []).some(sh => sh.workerId === w.id && sh.date === new Date().toISOString().slice(0, 10) && !sh.checkOut);
                  // 무전기 찾기
                  const myRadios = [];
                  assets.forEach(a => { if (a.trackUnits && a.units) a.units.forEach(u => { if (u.assignedTo === w.id || u.assignedToName === w.name) myRadios.push(`${a.name} #${u.number}`); }); });
                  return (<div key={w.id} style={{ padding: "10px 12px", borderRadius: 10, background: isOnDuty ? "rgba(76,175,80,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${isOnDuty ? "rgba(76,175,80,0.2)" : "rgba(255,255,255,0.04)"}`, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{isOnDuty ? "🟢" : "👤"}</span>
                      <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{w.name}</span>
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 10, fontWeight: 600 }}>{w.role || "운영"}</span>
                      {isOnDuty && <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(76,175,80,0.15)", color: "#66BB6A", fontSize: 10, fontWeight: 700 }}>● 근무중</span>}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "#94A3B8" }}>
                      {w.phone && <a href={`tel:${w.phone}`} style={{ color: "#42A5F5", textDecoration: "none" }}>📞 {w.phone}</a>}
                      <span>📍 {w.siteName}</span>
                      {myRadios.length > 0 && <span style={{ color: "#AB47BC" }}>📻 {myRadios.join(", ")}</span>}
                    </div>
                  </div>);
                })}
              </div> : <EmptyState icon="👥" title="배치된 근무자가 없습니다" description="⚙️ 인력관리에서 이 구역에 근무자를 배치하세요" />}
            </div>
          </div>);
        })()}
      </>}
    </div>
  </div>);
}

// ─── 2.0: Location Walkie-Talkie (위치 워키토키) ─────────────────────────────
function LocationPage({ settings, setSettings, session }) {
  const [tracking, setTracking] = useState(false);
  const watchId = useRef(null);
  const locations = settings.workerLocations || {};
  const sites = (settings.sites || []).filter(s => s.id && s.name);
  const allWorkers = sites.flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name, siteId: s.id })));
  const me = allWorkers.find(w => w.accountId === session?.id) || allWorkers.find(w => w.name === session?.name);

  const updateMyLocation = (lat, lng) => {
    if (!me) return;
    const ts = Date.now();
    setSettings(prev => ({ ...prev, workerLocations: { ...(prev.workerLocations || {}), [me.id]: { lat, lng, ts, name: me.name, siteName: me.siteName, status: "active" } } }));
  };

  const startTracking = () => {
    if (!navigator.geolocation) { alert("위치 서비스를 지원하지 않는 브라우저입니다."); return; }
    if (!me) { alert("근무자 정보를 찾을 수 없습니다.\n관리자에게 근무자 등록을 요청하세요."); return; }
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      pos => updateMyLocation(pos.coords.latitude, pos.coords.longitude),
      err => { alert("위치 권한이 거부되었습니다.\n브라우저 설정에서 위치 권한을 허용해주세요."); setTracking(false); },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 }
    );
  };

  const stopTracking = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    setTracking(false);
    if (me) setSettings(prev => ({ ...prev, workerLocations: { ...(prev.workerLocations || {}), [me.id]: { ...(prev.workerLocations?.[me.id] || {}), status: "off", ts: Date.now() } } }));
  };

  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); }, []);

  // 거리 계산 (Haversine)
  const dist = (a, b) => {
    const R = 6371; const dLat = (b.lat-a.lat)*Math.PI/180; const dLng = (b.lng-a.lng)*Math.PI/180;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  };
  const fmtAge = (ts) => {
    const m = Math.floor((Date.now()-ts)/60000);
    if (m < 1) return "방금";
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m/60); if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h/24)}일 전`;
  };

  const myLoc = me ? locations[me.id] : null;
  const others = Object.entries(locations).filter(([wid, l]) => wid !== me?.id && l.lat).map(([wid, l]) => {
    const w = allWorkers.find(ww => ww.id === wid);
    return { ...l, id: wid, name: l.name || w?.name || "?", siteName: l.siteName || w?.siteName || "?", distance: myLoc ? dist(myLoc, l) : null };
  }).sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(16px, env(safe-area-inset-right)) 80px max(16px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <PageHeader icon="📍" title="위치 공유" subtitle="GPS 기반 근무자 실시간 위치" accent="#66BB6A" />

      {/* 내 상태 */}
      <Card style={{ background: tracking ? "linear-gradient(135deg, rgba(76,175,80,0.1), rgba(76,175,80,0.02))" : "linear-gradient(135deg, rgba(244,67,54,0.06), rgba(244,67,54,0.01))", border: `1px solid ${tracking ? "rgba(76,175,80,0.3)" : "rgba(244,67,54,0.2)"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: tracking ? "rgba(76,175,80,0.2)" : "rgba(244,67,54,0.15)", border: `1px solid ${tracking ? "#66BB6A" : "rgba(244,67,54,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: tracking ? "pulse 2s infinite" : "none" }}>📍</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700 }}>{me ? me.name : "(미등록)"}</div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>{me ? me.siteName : "근무지 정보 없음"} · {tracking ? "위치 공유 중" : "위치 공유 꺼짐"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {!tracking ? <button onClick={startTracking} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #66BB6A, #388E3C)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>▶ 공유 시작</button> :
            <button onClick={stopTracking} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #EF5350, #C62828)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>⏹ 공유 중지</button>}
        </div>
        {myLoc && tracking && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", color: "#94A3B8", fontSize: 12 }}>
          📡 위도 {myLoc.lat.toFixed(6)} / 경도 {myLoc.lng.toFixed(6)} · {fmtAge(myLoc.ts)} 갱신
        </div>}
      </Card>

      {/* 다른 근무자 */}
      <h3 style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700, margin: "20px 0 10px", letterSpacing: 0.5 }}>👥 다른 근무자 ({others.length})</h3>
      {others.length === 0 && <Card style={{ textAlign: "center", padding: 30 }}>
        <p style={{ color: "#94A3B8", fontSize: 13 }}>현재 위치 공유 중인 다른 근무자가 없습니다.</p>
      </Card>}
      {others.map(o => (
        <Card key={o.id} style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: o.status === "active" ? "#66BB6A" : "#666", boxShadow: o.status === "active" ? "0 0 8px #66BB6A" : "none" }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{o.name}</div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>{o.siteName} · {fmtAge(o.ts)}</div>
            </div>
            {o.distance !== null && <div style={{ textAlign: "right" }}>
              <div style={{ color: o.distance < 0.1 ? "#66BB6A" : o.distance < 0.5 ? "#FFA726" : "#94A3B8", fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{o.distance < 1 ? `${(o.distance*1000).toFixed(0)}m` : `${o.distance.toFixed(1)}km`}</div>
              <a href={`https://maps.google.com/?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer" style={{ color: "#42A5F5", fontSize: 11, textDecoration: "none" }}>🗺️ 지도</a>
            </div>}
          </div>
        </Card>
      ))}

      <div style={{ marginTop: 16, padding: "12px", borderRadius: 10, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.15)", color: "#94A3B8", fontSize: 12, lineHeight: 1.6 }}>
        <strong style={{ color: "#42A5F5" }}>💡 안내</strong><br/>
        • 위치 정보는 30초마다 갱신됩니다<br/>
        • 공유 중지 시 즉시 정보가 가려집니다<br/>
        • 모바일 환경에서 가장 정확합니다 (GPS)
      </div>
    </div>
  </div>);
}

// ─── 2.0: Asset Management (장비/물품) ─────────────────────────────
function AssetsPage({ settings, setSettings, session }) {
  const assets = settings.assets || [];
  const cats = settings.assetCategories || ["무전기", "생수", "리플렛", "멀티탭", "응급키트", "조끼", "안전모", "안전장비", "의자", "테이블", "조명", "음향", "기타"];
  const [filter, setFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const [unitsModalId, setUnitsModalId] = useState(null);
  const [newAsset, setNewAsset] = useState({ name: "", category: cats[0], total: 1, qty: 1, location: "", status: "available", trackUnits: false, units: [] });
  const canEdit = ["admin","manager","sysadmin","zonemgr"].includes(session?.role);

  // 모든 근무자 목록 (할당용)
  const allWorkers = (settings.sites || []).flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name })));

  const filtered = filter === "all" ? assets : assets.filter(a => a.category === filter);
  const STATUS = { available: { label: "사용가능", color: "#66BB6A", icon: "✅" }, inuse: { label: "사용중", color: "#42A5F5", icon: "🔄" }, broken: { label: "고장", color: "#EF5350", icon: "❌" }, lost: { label: "분실", color: "#FFA726", icon: "❓" } };
  const UNIT_STATUS = { available: { label: "보관중", color: "#66BB6A", icon: "✅" }, assigned: { label: "할당됨", color: "#42A5F5", icon: "👤" }, broken: { label: "고장", color: "#EF5350", icon: "❌" }, lost: { label: "분실", color: "#FFA726", icon: "❓" } };

  // 개별 단위 자동 생성/동기화
  const syncUnits = (a) => {
    if (!a.trackUnits) return a.units || [];
    const existing = a.units || [];
    const total = a.total || 1;
    if (existing.length >= total) return existing.slice(0, total);
    const newUnits = [...existing];
    for (let i = existing.length; i < total; i++) {
      newUnits.push({ id: "u_"+Date.now()+"_"+i, number: String(i+1).padStart(2, "0"), status: "available", assignedTo: null, assignedToName: null, history: [{ ts: Date.now(), action: "등록", by: session?.name || "?" }] });
    }
    return newUnits;
  };

  const saveAsset = (a) => {
    const id = a.id || "as_"+Date.now();
    let finalAsset = { ...a, id };
    if (a.trackUnits) {
      finalAsset.units = syncUnits(finalAsset);
      // qty 자동 계산: available 상태 단위 수
      finalAsset.qty = finalAsset.units.filter(u => u.status === "available").length;
    }
    const exists = assets.find(x => x.id === id);
    const updated = exists ? assets.map(x => x.id === id ? finalAsset : x) : [...assets, { ...finalAsset, history: finalAsset.history || [{ ts: Date.now(), action: "등록", by: session?.name || "?" }] }];
    setSettings(prev => ({ ...prev, assets: updated }));
    setEditId(null); setAddMode(false);
    setNewAsset({ name: "", category: cats[0], total: 1, qty: 1, location: "", status: "available", trackUnits: false, units: [] });
  };

  const delAsset = (id) => { if (confirm("삭제하시겠습니까?")) setSettings(prev => ({ ...prev, assets: assets.filter(a => a.id !== id) })); };

  const checkOut = (id, to) => {
    const a = assets.find(x => x.id === id); if (!a) return;
    const upd = { ...a, qty: Math.max(0, a.qty - 1), assignedTo: to, status: a.qty <= 1 ? "inuse" : a.status, history: [...(a.history||[]), { ts: Date.now(), action: `대여 (${to})`, by: session?.name || "?" }] };
    setSettings(prev => ({ ...prev, assets: assets.map(x => x.id === id ? upd : x) }));
  };
  const checkIn = (id) => {
    const a = assets.find(x => x.id === id); if (!a) return;
    const upd = { ...a, qty: Math.min(a.total, a.qty + 1), assignedTo: null, status: "available", history: [...(a.history||[]), { ts: Date.now(), action: "반납", by: session?.name || "?" }] };
    setSettings(prev => ({ ...prev, assets: assets.map(x => x.id === id ? upd : x) }));
  };

  // 단위(개별 무전기 등) 액션
  const updateUnit = (assetId, unitId, changes, actionLabel) => {
    const a = assets.find(x => x.id === assetId); if (!a) return;
    const newUnits = (a.units || []).map(u => u.id === unitId ? { ...u, ...changes, history: [...(u.history||[]), { ts: Date.now(), action: actionLabel, by: session?.name || "?" }] } : u);
    const newQty = newUnits.filter(u => u.status === "available").length;
    setSettings(prev => ({ ...prev, assets: assets.map(x => x.id === assetId ? { ...x, units: newUnits, qty: newQty } : x) }));
  };

  // 통계
  const stats = { total: assets.reduce((s,a)=>s+(a.total||0),0), available: assets.reduce((s,a)=>s+(a.qty||0),0), broken: assets.reduce((s,a)=>s+(a.units||[]).filter(u=>u.status==="broken").length,0) || assets.filter(a=>a.status==="broken").length, lost: assets.reduce((s,a)=>s+(a.units||[]).filter(u=>u.status==="lost").length,0) || assets.filter(a=>a.status==="lost").length };

  // 단위 관리 모달
  const unitsAsset = unitsModalId ? assets.find(a => a.id === unitsModalId) : null;

  const Form = ({ asset, onSave, onCancel }) => {
    const [f, setF] = useState({ ...asset });
    const upF = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (<Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.2)" }}>
      <h4 style={{ color: "#42A5F5", fontSize: 14, margin: "0 0 12px", fontWeight: 700 }}>{f.id ? "✏️ 수정" : "➕ 새 장비 등록"}</h4>
      <div style={{ display: "grid", gap: 10 }}>
        <div><Label>품명</Label><Input value={f.name} onChange={e => upF("name", e.target.value)} placeholder="예: 무전기 모델A" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Label>분류</Label><select value={f.category} onChange={e => upF("category", e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><Label>위치/보관</Label><Input value={f.location||""} onChange={e => upF("location", e.target.value)} placeholder="예: 본부석" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Label>총 수량</Label><Input type="number" value={f.total} onChange={e => upF("total", parseInt(e.target.value)||1)} /></div>
          <div><Label>현재 가용</Label><Input type="number" value={f.qty} onChange={e => upF("qty", parseInt(e.target.value)||0)} disabled={f.trackUnits} style={f.trackUnits ? { opacity: 0.5 } : {}} /></div>
        </div>

        {/* 개별 추적 토글 */}
        <div onClick={() => upF("trackUnits", !f.trackUnits)} style={{ padding: "12px 14px", borderRadius: 10, background: f.trackUnits ? "rgba(76,175,80,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${f.trackUnits ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.08)"}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: f.trackUnits ? "#66BB6A" : "#333", position: "relative", flexShrink: 0 }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: f.trackUnits ? 18 : 2, transition: "all .2s" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700 }}>🔢 개별 번호 추적 {f.trackUnits ? "ON" : "OFF"}</div>
            <div style={{ color: "#94A3B8", fontSize: 11 }}>무전기처럼 1번/2번/3번 개별 할당이 필요한 경우 켜세요</div>
          </div>
        </div>

        {!f.trackUnits && <div><Label>상태</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{Object.entries(STATUS).map(([k, v]) => (
            <button key={k} onClick={() => upF("status", k)} style={{ padding: "8px 14px", borderRadius: 8, border: f.status === k ? `1.5px solid ${v.color}` : "1px solid rgba(255,255,255,0.1)", background: f.status === k ? `${v.color}20` : "rgba(255,255,255,0.02)", color: f.status === k ? v.color : "#94A3B8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{v.icon} {v.label}</button>
          ))}</div>
        </div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={() => { if (!f.name) { alert("품명을 입력하세요."); return; } onSave(f); }} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #42A5F5, #1976D2)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 저장</button>
        <button onClick={onCancel} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>취소</button>
      </div>
    </Card>);
  };

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(16px, env(safe-area-inset-right)) 80px max(16px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <PageHeader icon="📦" title="물자 관리" subtitle="무전기·생수·리플렛·멀티탭 등 자산 인벤토리" accent="#42A5F5" />

      {/* 통계 */}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, textAlign: "center" }}>
          <div><div style={{ color: "#42A5F5", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{stats.total}</div><div style={{ color: "#94A3B8", fontSize: 11 }}>총수량</div></div>
          <div><div style={{ color: "#66BB6A", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{stats.available}</div><div style={{ color: "#94A3B8", fontSize: 11 }}>가용</div></div>
          <div><div style={{ color: "#EF5350", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{stats.broken}</div><div style={{ color: "#94A3B8", fontSize: 11 }}>고장</div></div>
          <div><div style={{ color: "#FFA726", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{stats.lost}</div><div style={{ color: "#94A3B8", fontSize: 11 }}>분실</div></div>
        </div>
      </Card>

      {/* 분류 필터 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setFilter("all")} style={{ padding: "8px 14px", borderRadius: 16, border: filter === "all" ? "1.5px solid #42A5F5" : "1px solid rgba(255,255,255,0.1)", background: filter === "all" ? "rgba(33,150,243,0.1)" : "rgba(255,255,255,0.03)", color: filter === "all" ? "#42A5F5" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>전체 ({assets.length})</button>
        {cats.map(c => { const cnt = assets.filter(a => a.category === c).length; return (
          <button key={c} onClick={() => setFilter(c)} style={{ padding: "8px 14px", borderRadius: 16, border: filter === c ? "1.5px solid #42A5F5" : "1px solid rgba(255,255,255,0.1)", background: filter === c ? "rgba(33,150,243,0.1)" : "rgba(255,255,255,0.03)", color: filter === c ? "#42A5F5" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{c} ({cnt})</button>
        ); })}
      </div>

      {canEdit && !addMode && !editId && <>
        {/* 빠른 추가 프리셋 */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 4 }}>
          {[
            { cat: "무전기", icon: "📻", name: "무전기", default: 10 },
            { cat: "생수", icon: "💧", name: "생수 500ml", default: 100 },
            { cat: "리플렛", icon: "📄", name: "안내 리플렛", default: 500 },
            { cat: "멀티탭", icon: "🔌", name: "멀티탭", default: 5 },
            { cat: "응급키트", icon: "🩹", name: "응급키트", default: 3 },
            { cat: "조끼", icon: "🦺", name: "안전조끼", default: 20 },
          ].map(p => (
            <button key={p.cat} onClick={() => {
              setNewAsset({ name: p.name, category: p.cat, total: p.default, qty: p.default, location: "", status: "available", trackUnits: false, units: [] });
              setAddMode(true);
            }} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(33,150,243,0.25)", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>{p.icon} {p.cat}</button>
          ))}
        </div>
        <button onClick={() => setAddMode(true)} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px dashed rgba(33,150,243,0.4)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>+ 직접 등록</button>
      </>}
      {addMode && <Form asset={newAsset} onSave={saveAsset} onCancel={() => setAddMode(false)} />}

      {/* 자산 목록 */}
      {filtered.length === 0 && !addMode && <Card style={{ textAlign: "center", padding: 30 }}><p style={{ color: "#94A3B8", fontSize: 13 }}>등록된 장비가 없습니다.</p></Card>}
      {filtered.map(a => {
        if (editId === a.id) return <Form key={a.id} asset={a} onSave={saveAsset} onCancel={() => setEditId(null)} />;
        const tracked = a.trackUnits && a.units?.length > 0;
        const st = STATUS[a.status] || STATUS.available;
        const lowStock = (a.qty || 0) === 0;

        // 개별 추적 카드
        if (tracked) {
          const counts = { available: a.units.filter(u=>u.status==="available").length, assigned: a.units.filter(u=>u.status==="assigned").length, broken: a.units.filter(u=>u.status==="broken").length, lost: a.units.filter(u=>u.status==="lost").length };
          return (<Card key={a.id} style={{ border: "1px solid rgba(33,150,243,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(33,150,243,0.15)", border: "1px solid rgba(33,150,243,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📻</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 11, fontWeight: 600 }}>{a.category}</span>
                  <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{a.name}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 10, fontWeight: 700 }}>🔢 개별</span>
                </div>
                {a.location && <div style={{ color: "#94A3B8", fontSize: 12 }}>📍 {a.location}</div>}
              </div>
            </div>
            {/* 4가지 상태 카운트 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 10 }}>
              {Object.entries(UNIT_STATUS).map(([k, v]) => (
                <div key={k} style={{ padding: "6px 4px", borderRadius: 8, background: counts[k] > 0 ? `${v.color}10` : "rgba(255,255,255,0.02)", border: `1px solid ${counts[k] > 0 ? `${v.color}30` : "rgba(255,255,255,0.04)"}`, textAlign: "center" }}>
                  <div style={{ color: v.color, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{counts[k]}</div>
                  <div style={{ color: "#94A3B8", fontSize: 10 }}>{v.icon} {v.label}</div>
                </div>
              ))}
            </div>
            {canEdit && <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setUnitsModalId(a.id)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(33,150,243,0.3)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>📋 개별 관리 ({a.units.length}대)</button>
              <button onClick={() => setEditId(a.id)} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>✏️</button>
              <button onClick={() => delAsset(a.id)} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(244,67,54,0.2)", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
            </div>}
          </Card>);
        }

        // 일반 자산 카드
        return (<Card key={a.id} style={{ border: lowStock ? "1px solid rgba(244,67,54,0.3)" : "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: `${st.color}15`, border: `1px solid ${st.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{st.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 11, fontWeight: 600 }}>{a.category}</span>
                <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{a.name}</span>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 12 }}>
                {a.location && <span>📍 {a.location}</span>}
                {a.assignedTo && <span style={{ marginLeft: 8 }}>👤 {a.assignedTo}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: lowStock ? "#EF5350" : st.color, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{a.qty}<span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 500 }}> / {a.total}</span></div>
              <div style={{ color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</div>
            </div>
          </div>
          {canEdit && <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <button onClick={() => { const to = prompt("대여자 이름:"); if (to && a.qty > 0) checkOut(a.id, to); }} disabled={a.qty === 0} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(76,175,80,0.3)", background: a.qty === 0 ? "rgba(255,255,255,0.02)" : "rgba(76,175,80,0.05)", color: a.qty === 0 ? "#475569" : "#66BB6A", fontSize: 12, fontWeight: 600, cursor: a.qty === 0 ? "not-allowed" : "pointer" }}>📤 대여</button>
            <button onClick={() => checkIn(a.id)} disabled={a.qty >= a.total} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(33,150,243,0.3)", background: a.qty >= a.total ? "rgba(255,255,255,0.02)" : "rgba(33,150,243,0.05)", color: a.qty >= a.total ? "#475569" : "#42A5F5", fontSize: 12, fontWeight: 600, cursor: a.qty >= a.total ? "not-allowed" : "pointer" }}>📥 반납</button>
            <button onClick={() => setEditId(a.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>✏️</button>
            <button onClick={() => delAsset(a.id)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(244,67,54,0.2)", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>}
        </Card>);
      })}
    </div>

    {/* 개별 단위 관리 모달 */}
    {unitsAsset && <div onClick={() => setUnitsModalId(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, maxHeight: "85vh", background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", overflow: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ color: "#E2E8F0", fontSize: 17, fontWeight: 700, margin: 0 }}>📋 {unitsAsset.name} - 개별 관리</h3>
          <button onClick={() => setUnitsModalId(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
          {(unitsAsset.units || []).map(u => {
            const us = UNIT_STATUS[u.status] || UNIT_STATUS.available;
            return (<div key={u.id} style={{ padding: "12px", borderRadius: 12, background: `${us.color}08`, border: `1.5px solid ${us.color}40`, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: us.color, fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>#{u.number}</span>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: `${us.color}15`, color: us.color, fontSize: 10, fontWeight: 700 }}>{us.icon} {us.label}</span>
              </div>
              {u.assignedToName && <div style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.2)" }}>
                <div style={{ color: "#42A5F5", fontSize: 12, fontWeight: 700 }}>👤 {u.assignedToName}</div>
              </div>}
              {/* 액션 */}
              {u.status === "available" && <select value="" onChange={e => { if (e.target.value) {
                const w = allWorkers.find(ww => ww.id === e.target.value);
                if (w) updateUnit(unitsAsset.id, u.id, { status: "assigned", assignedTo: w.id, assignedToName: w.name }, `${w.name}에게 할당`);
              } }} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid rgba(33,150,243,0.3)", background: "rgba(33,150,243,0.05)", color: "#42A5F5", fontSize: 12, cursor: "pointer" }}>
                <option value="">👤 근무자 할당...</option>
                {allWorkers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.siteName})</option>)}
              </select>}
              {u.status === "assigned" && <button onClick={() => updateUnit(unitsAsset.id, u.id, { status: "available", assignedTo: null, assignedToName: null }, "반납")} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid rgba(76,175,80,0.3)", background: "rgba(76,175,80,0.05)", color: "#66BB6A", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📥 반납</button>}
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <button onClick={() => updateUnit(unitsAsset.id, u.id, { status: u.status === "broken" ? "available" : "broken" }, u.status === "broken" ? "수리완료" : "고장 신고")} style={{ flex: 1, padding: "5px", borderRadius: 5, border: "1px solid rgba(244,67,54,0.2)", background: u.status === "broken" ? "rgba(244,67,54,0.15)" : "transparent", color: "#EF5350", fontSize: 11, cursor: "pointer" }}>❌ {u.status === "broken" ? "수리" : "고장"}</button>
                <button onClick={() => updateUnit(unitsAsset.id, u.id, { status: u.status === "lost" ? "available" : "lost" }, u.status === "lost" ? "회수" : "분실 신고")} style={{ flex: 1, padding: "5px", borderRadius: 5, border: "1px solid rgba(255,152,0,0.2)", background: u.status === "lost" ? "rgba(255,152,0,0.15)" : "transparent", color: "#FFA726", fontSize: 11, cursor: "pointer" }}>❓ {u.status === "lost" ? "회수" : "분실"}</button>
              </div>
            </div>);
          })}
        </div>
      </div>
    </div>}
  </div>);
}

function CongestionPage({ settings, setSettings, session }) {
  const zones = settings.zones || [];
  const myZone = zones.find(z => z.accountId === session?.id);
  const congestion = settings.zoneCongestion || [];
  const [selLevel, setSelLevel] = useState({});
  const [memos, setMemos] = useState({});
  const [zonePhotos, setZonePhotos] = useState({});
  const [viewPhoto, setViewPhoto] = useState(null);
  const [viewPhotoZone, setViewPhotoZone] = useState(null);
  const CONG_LEVELS = { smooth: { label: "원활", color: "#66BB6A", icon: "🟢", bg: "rgba(76,175,80,0.1)" }, crowded: { label: "혼잡", color: "#FFA726", icon: "🟡", bg: "rgba(255,152,0,0.1)" }, danger: { label: "위험", color: "#EF5350", icon: "🔴", bg: "rgba(244,67,54,0.1)" } };

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
  const normalOnly = zones.filter(z => z.name && (!z.zoneType || z.zoneType === "normal" || z.zoneType === "performance" || z.zoneType === "parking"));
  const myZoneNormal = normalOnly.find(z => z.accountId === session?.id);
  const viewZones = isAdmin ? normalOnly : myZoneNormal ? [myZoneNormal] : [];

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left))" }}>
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <PageHeader icon="🚦" title="인파혼잡도 관리" subtitle="① 단계 선택 → ② 사진/메모 → ③ 보고 완료" accent="#FFA726" />

    {viewZones.length === 0 && <EmptyState icon="🚦" title="배정된 구역이 없습니다" description="관리자가 구역을 설정하고 계정에 배정해주세요" />}

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
            <div style={{ color: "#E2E8F0", fontSize: 18, fontWeight: 800 }}>{zone.name}</div>
            {zone.range && <div style={{ color: "#94A3B8", fontSize: 12 }}>{zone.range}</div>}
          </div>
          {cl && <div style={{ textAlign: "center", padding: "6px 14px", borderRadius: 10, background: cl.bg, border: `1px solid ${cl.color}44` }}>
            <div style={{ fontSize: 20 }}>{cl.icon}</div>
            <div style={{ color: cl.color, fontSize: 14, fontWeight: 800 }}>{cl.label}</div>
          </div>}
        </div>

        {/* 현재 보고 내역 */}
        {cur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ color: "#8892b0", fontSize: 12 }}>마지막 보고:</span>
            <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700 }}>{cur.reportedByName}</span>
            <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{cur.reportedAt}</span>
          </div>
          {cur.memo && <div style={{ color: "#E2E8F0", fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>💬 {cur.memo}</div>}
          {cur.photos?.length > 0 && <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {cur.photos.map(p => <div key={p.id} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => { setViewPhoto(p); setViewPhotoZone(zone.id); }}>
              <img src={p.data} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }} />
              <div style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 2 }}>{p.time}</div>
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
            {curPhotos.length > 0 && <span style={{ color: "#66BB6A", fontSize: 13, fontWeight: 700 }}>{curPhotos.length}장</span>}
          </div>
          {curPhotos.length > 0 && <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8, paddingBottom: 4 }}>
            {curPhotos.map((p, i) => <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
              <img src={p.data} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }} />
              <button onClick={() => setZonePhotos(prev => ({ ...prev, [zone.id]: prev[zone.id].filter((_, idx) => idx !== i) }))} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>)}
          </div>}
          <textarea value={curMemo} onChange={e => setMemos(p => ({ ...p, [zone.id]: e.target.value }))} placeholder="현장 상황 메모" rows={2} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 10 }} />

          {/* ③ 보고 완료 */}
          <button onClick={() => submitReport(zone.id)} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: selected ? (CONG_LEVELS[selected]?.color || "#42A5F5") : "#333", color: "#fff", fontSize: 16, fontWeight: 800, cursor: selected ? "pointer" : "default", opacity: selected ? 1 : 0.4 }}>
            {selected ? `${CONG_LEVELS[selected].icon} ${CONG_LEVELS[selected].label} 보고 완료` : "단계를 먼저 선택하세요"}
          </button>
        </>}
      </div>);
    })}

    {/* 전체 현황 (관리자) */}
    {isAdmin && normalOnly.length > 0 && <div style={{ maxWidth: 500, margin: "20px auto 0" }}>
      <h3 style={{ color: "#8892b0", fontSize: 15, fontWeight: 700, marginBottom: 10, textAlign: "center" }}>📊 전체 구역 혼잡도 현황</h3>
      <div style={{ display: "grid", gap: 6 }}>
        {normalOnly.map(z => {
          const c = congestion.find(cc => cc.zoneId === z.id);
          const cl = c ? CONG_LEVELS[c.level] : { label: "미보고", color: "#94A3B8", icon: "⚪" };
          return (<div key={z.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: `1px solid ${cl.color}33`, gap: 10 }}>
            <span style={{ fontSize: 18 }}>{cl.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{z.name}</div>
              {c?.reportedAt && <div style={{ color: "#94A3B8", fontSize: 12 }}>{c.reportedByName} · {c.reportedAt}</div>}
            </div>
            <span style={{ color: cl.color, fontSize: 16, fontWeight: 800 }}>{cl.label}</span>
            {c?.photos?.length > 0 && <span style={{ color: "#42A5F5", fontSize: 12 }}>📷{c.photos.length}</span>}
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
    </div>
  </div>);
}

// ─── Message Page ───────────────────────────────────────────────
// ─── Chat Page (메시지) ──────────────────────────────────────────
// ─── Chat Page (메시지) ──────────────────────────────────────────
function ChatPage({ settings, setSettings, accounts, session }) {
  const [channel, setChannel] = useState("all");
  const [msg, setMsg] = useState("");
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [readIds, setReadIds] = useState(() => { try { return JSON.parse(sessionStorage.getItem("read_msgs") || "[]"); } catch { return []; } });
  const chatRef = useRef(null);
  const inputRef = useRef(null);

  const allMessages = settings.messages || [];
  const chatAccounts = (accounts || []).filter(a => a.id !== session?.id);

  const myMessages = allMessages.filter(m => {
    if (channel === "all") return m.type === "all" || m.type === "notice";
    if (channel === "notice") return m.type === "notice";
    return m.type === "target" && ((m.to === session?.id && m.createdById === channel) || (m.createdById === session?.id && m.to === channel));
  }).slice().reverse();

  // Mark read
  useEffect(() => {
    const unread = myMessages.filter(m => !readIds.includes(m.id) && m.createdById !== session?.id).map(m => m.id);
    if (unread.length > 0) { const next = [...new Set([...readIds, ...unread])]; setReadIds(next); sessionStorage.setItem("read_msgs", JSON.stringify(next)); }
  }, [channel, myMessages.length]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [channel, myMessages.length]);

  // @mention handler
  const handleInput = (val) => {
    setMsg(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt >= 0 && lastAt === val.length - 1 - (val.length - 1 - lastAt)) {
      const afterAt = val.slice(lastAt + 1);
      if (!afterAt.includes(" ") && afterAt.length < 20) {
        setShowMention(true);
        setMentionFilter(afterAt);
        return;
      }
    }
    setShowMention(false);
  };

  const insertMention = (acc) => {
    const lastAt = msg.lastIndexOf("@");
    setMsg(msg.slice(0, lastAt) + "@" + acc.name + " ");
    setShowMention(false);
    inputRef.current?.focus();
  };

  const sendMsg = () => {
    if (!msg.trim()) return;
    const time = new Date().toLocaleString("ko-KR");
    const base = { id: "m" + Date.now(), content: msg.trim(), createdAt: time, createdBy: session.name, createdById: session.id };

    // Check for @mentions → send as target messages too
    const mentions = [];
    const mentionRegex = /@(\S+)/g;
    let match;
    while ((match = mentionRegex.exec(msg)) !== null) {
      const acc = chatAccounts.find(a => a.name === match[1]);
      if (acc) mentions.push(acc);
    }

    if (channel === "notice") {
      setSettings(prev => ({ ...prev,
        notices: [{ id: "n" + Date.now(), content: msg.trim(), createdAt: time, createdBy: session.name }, ...(prev.notices || [])],
        messages: [{ ...base, type: "notice" }, ...(prev.messages || [])].slice(0, 200)
      }));
    } else if (channel !== "all" && channel !== "notice") {
      // 1:1 DM
      setSettings(prev => ({ ...prev, messages: [{ ...base, type: "target", to: channel }, ...(prev.messages || [])].slice(0, 200) }));
    } else {
      // 전체 + @mention targets
      const newMsgs = [{ ...base, type: "all", to: "전체" }];
      mentions.forEach(acc => {
        newMsgs.push({ ...base, id: base.id + "_" + acc.id, type: "target", to: acc.id, content: msg.trim() });
      });
      setSettings(prev => ({ ...prev, messages: [...newMsgs, ...(prev.messages || [])].slice(0, 200) }));
    }
    setMsg("");
    setShowMention(false);
  };

  const filteredAccounts = chatAccounts.filter(a => !mentionFilter || a.name.includes(mentionFilter));

  // Unread per channel
  const getUnread = (chId) => {
    if (chId === "all") return allMessages.filter(m => m.type === "all" && !readIds.includes(m.id) && m.createdById !== session?.id).length;
    return allMessages.filter(m => m.type === "target" && m.to === session?.id && m.createdById === chId && !readIds.includes(m.id)).length;
  };
  const dmAccounts = chatAccounts.filter(a => allMessages.some(m => m.type === "target" && ((m.to === session?.id && m.createdById === a.id) || (m.createdById === session?.id && m.to === a.id))));

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", flexDirection: "column" }}>
    <div style={{ padding: "calc(env(safe-area-inset-top) + 50px) 14px 8px", background: "rgba(13,17,23,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(10px)" }}>
      <PageHeader icon="💬" title="메시지" subtitle="실시간 소통" accent="#42A5F5" />
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
        {[{ id: "all", label: "📣 전체" }, { id: "notice", label: "📢 공지" }].map(ch => {
          const unread = getUnread(ch.id);
          return (<button key={ch.id} onClick={() => setChannel(ch.id)} style={{ padding: "7px 14px", borderRadius: 20, border: channel === ch.id ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.06)", background: channel === ch.id ? "linear-gradient(135deg, rgba(33,150,243,0.12), rgba(33,150,243,0.04))" : "rgba(255,255,255,0.02)", color: channel === ch.id ? "#42A5F5" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", position: "relative", flexShrink: 0 }}>
            {ch.label}
            {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{unread}</span>}
          </button>);
        })}
        {dmAccounts.map(a => {
          const unread = getUnread(a.id);
          const rl = ROLES[a.role] || {};
          return (<button key={a.id} onClick={() => setChannel(a.id)} style={{ padding: "7px 14px", borderRadius: 20, border: channel === a.id ? `2px solid ${rl.color || "#556"}` : "1px solid #333", background: channel === a.id ? `${rl.color || "#556"}15` : "transparent", color: channel === a.id ? (rl.color || "#ccd6f6") : "#556", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", position: "relative", flexShrink: 0 }}>
            {a.name}
            {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{unread}</span>}
          </button>);
        })}
      </div>
    </div>

    {/* 채팅 */}
    <div ref={chatRef} style={{ flex: 1, padding: "12px 16px", overflowY: "auto", maxWidth: 600, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
      {myMessages.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
        <div style={{ fontSize: 14 }}>{channel === "all" ? "전체 채팅에 메시지를 보내보세요" : "대화를 시작하세요"}</div>
        {channel === "all" && <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 8 }}>@이름 으로 특정 사람에게 알림을 보낼 수 있습니다</div>}
      </div>}
      {myMessages.map(m => {
        const isMine = m.createdById === session?.id;
        const isNotice = m.type === "notice";
        // Highlight @mentions
        const parts = m.content.split(/(@\S+)/g);
        return (<div key={m.id} style={{ display: "flex", justifyContent: isNotice ? "center" : isMine ? "flex-end" : "flex-start", marginBottom: 8 }}>
          {isNotice ? (
            <div style={{ padding: "8px 16px", borderRadius: 10, background: "rgba(156,39,176,0.1)", border: "1px solid rgba(156,39,176,0.15)", maxWidth: "90%" }}>
              <div style={{ color: "#E1BEE7", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📢 공지</div>
              <div style={{ color: "#E2E8F0", fontSize: 14, whiteSpace: "pre-wrap" }}>{m.content}</div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>{m.createdBy} · {m.createdAt}</div>
            </div>
          ) : (
            <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isMine ? "rgba(33,150,243,0.12)" : "rgba(255,255,255,0.04)", border: isMine ? "1px solid rgba(33,150,243,0.15)" : "1px solid #222" }}>
              {!isMine && <div style={{ color: ROLES[accounts?.find(a => a.id === m.createdById)?.role]?.color || "#8892b0", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{m.createdBy}</div>}
              <div style={{ color: "#E2E8F0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{parts.map((p, i) => p.startsWith("@") ? <span key={i} style={{ color: "#42A5F5", fontWeight: 700 }}>{p}</span> : p)}</div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 3, textAlign: isMine ? "right" : "left" }}>{m.createdAt}</div>
            </div>
          )}
        </div>);
      })}
    </div>

    {/* @mention 자동완성 */}
    {showMention && filteredAccounts.length > 0 && <div style={{ position: "fixed", bottom: 130, left: 16, right: 16, maxWidth: 600, margin: "0 auto", background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 6, zIndex: 100, maxHeight: 200, overflowY: "auto" }}>
      {filteredAccounts.map(a => (
        <div key={a.id} onClick={() => insertMention(a)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: "transparent" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(33,150,243,0.1)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <span style={{ color: ROLES[a.role]?.color || "#556", fontSize: 13, fontWeight: 700 }}>@{a.name}</span>
          <span style={{ color: "#94A3B8", fontSize: 12 }}>{ROLES[a.role]?.label}</span>
        </div>
      ))}
    </div>}

    {/* 입력 */}
    <div style={{ padding: "10px 16px 80px", background: "#0d1117", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea ref={inputRef} value={msg} onChange={e => handleInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder={channel === "notice" ? "📢 공지사항..." : "@이름 으로 지정, Enter 전송"} rows={1} style={{ flex: 1, padding: "12px 14px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "none", boxSizing: "border-box", fontFamily: "inherit", maxHeight: 80 }} />
        <button onClick={sendMsg} style={{ width: 44, height: 44, borderRadius: 22, border: "none", background: msg.trim() ? "#42A5F5" : "#333", color: "#fff", fontSize: 18, cursor: msg.trim() ? "pointer" : "default", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
      </div>
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
    const target = org.find(n => n.id === targetId);
    const newParent = target?.type === "person" ? target.parentId : targetId;
    setSettings(prev => ({ ...prev, orgChart: (prev.orgChart || []).map(n => n.id === dragId ? { ...n, parentId: newParent || null } : n) }));
    setDragId(null);
  };

  const moveOrgNode = (nodeId, dir) => {
    const node = org.find(n => n.id === nodeId);
    if (!node) return;
    const siblings = org.filter(n => n.parentId === node.parentId && n.type === node.type).sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = siblings.findIndex(s => s.id === nodeId);
    if (idx < 0 || idx + dir < 0 || idx + dir >= siblings.length) return;
    setSettings(prev => ({ ...prev, orgChart: (prev.orgChart || []).map(n => {
      if (n.id === nodeId) return { ...n, order: idx + dir };
      if (n.id === siblings[idx + dir].id) return { ...n, order: idx };
      return n;
    }) }));
  };

  const renderNode = (node, depth) => {
    const children = getChildren(node.id);
    const childOrgs = children.filter(c => c.type === "org");
    const childPersons = children.filter(c => c.type === "person");
    const isCol = collapsed[node.id];
    const isOrg = node.type === "org";

    if (!isOrg) {
      return (
        <div key={node.id} draggable onDragStart={(e) => { e.stopPropagation(); setDragId(node.id); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "2px solid #4CAF50"; }}
          onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.outline = "none"; handleDrop(node.id); }}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 3, cursor: "grab", border: "1px solid transparent" }}>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>⠿</span>
          <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{node.name}</span>
          {node.position && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(76,175,80,0.1)", color: "#66BB6A", fontSize: 12, fontWeight: 700 }}>{node.position}</span>}
          {node.memo && <span style={{ color: "#94A3B8", fontSize: 12 }}>{node.memo}</span>}
          {node.phone && <a href={`tel:${node.phone.replace(/-/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#66BB6A", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>📞</a>}
          <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: "auto" }}>
            <button onClick={(e) => { e.stopPropagation(); moveOrgNode(node.id, -1); }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>▲</button>
            <button onClick={(e) => { e.stopPropagation(); moveOrgNode(node.id, 1); }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>▼</button>
            <button onClick={(e) => { e.stopPropagation(); startEdit(node); }} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>✏️</button>
            <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
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
            {children.length > 0 ? <button onClick={() => setCollapsed(p => ({ ...p, [node.id]: !p[node.id] }))} style={{ background: "none", border: "none", color: "#42A5F5", fontSize: 14, cursor: "pointer", padding: 0, width: 18 }}>{isCol ? "▶" : "▼"}</button> : <span style={{ width: 18 }} />}
            <span style={{ fontSize: 16 }}>🏢</span>
            <span style={{ color: "#42A5F5", fontSize: 15, fontWeight: 800, flex: 1 }}>{node.name}</span>
            {node.position && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(33,150,243,0.12)", color: "#42A5F5", fontSize: 12, fontWeight: 700 }}>{node.position}</span>}
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{childPersons.length}명</span>
            <button onClick={(e) => { e.stopPropagation(); startEdit(node); }} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>✏️</button>
            <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>
          {node.memo && <div style={{ padding: "4px 14px 6px", color: "#94A3B8", fontSize: 12 }}>{node.memo}</div>}

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
      <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📋 안전관리 조직도 / 비상연락망</h3>
      <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>조직을 먼저 만들고, 인원을 해당 조직에 배치하세요. 드래그로 이동 가능.</p>

      {/* 추가 모드 선택 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => { setAddMode("org"); setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: addMode === "org" && !editId ? "1.5px solid #2196F3" : "1px solid #333", background: addMode === "org" && !editId ? "rgba(33,150,243,0.1)" : "transparent", color: addMode === "org" && !editId ? "#42A5F5" : "#667", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🏢 조직 추가</button>
        <button onClick={() => { setAddMode("person"); setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: addMode === "person" && !editId ? "1.5px solid #4CAF50" : "1px solid #333", background: addMode === "person" && !editId ? "rgba(76,175,80,0.1)" : "transparent", color: addMode === "person" && !editId ? "#66BB6A" : "#667", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>👤 인원 추가</button>
      </div>

      {/* 입력 폼 */}
      <div style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${editId ? "rgba(33,150,243,0.3)" : "#222"}`, marginBottom: 16 }}>
        <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{editId ? `✏️ ${addMode === "org" ? "조직" : "인원"} 수정` : addMode === "org" ? "🏢 조직 추가" : "👤 인원 추가"}</div>
        {addMode === "person" && !editId && (() => {
          const allWorkers = (settings.workSites || []).flatMap(s => (s.workers || []).map(w => ({ ...w, siteName: s.name })));
          return allWorkers.length > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <Label>등록된 근무자에서 선택</Label>
              <select onChange={e => { const w = allWorkers.find(ww => ww.id === e.target.value); if (w) setForm({ name: w.name, position: w.role || w.duty || "", phone: w.phone || "", memo: `${w.type || ""} ${w.siteName || ""}`.trim() }); e.target.value = ""; }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
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
          <select value={addToParent || ""} onChange={e => setAddToParent(e.target.value || null)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
            <option value="">최상위 (소속 없음)</option>
            {orgs.map(o => <option key={o.id} value={o.id}>🏢 {o.name}{o.position ? ` (${o.position})` : ""}</option>)}
          </select>
        </div>}

        <div style={{ display: "flex", gap: 8 }}>
          {editId ? (<>
            <button onClick={updateNode} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontWeight: 700, cursor: "pointer" }}>수정 완료</button>
            <button onClick={() => { setEditId(null); setForm({ name: "", position: "", phone: "", memo: "" }); }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", cursor: "pointer" }}>취소</button>
          </>) : (
            <button onClick={addNode} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: addMode === "org" ? "#42A5F5" : "#66BB6A", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{addMode === "org" ? "🏢 조직 추가" : "👤 인원 추가"}</button>
          )}
        </div>
      </div>

      {/* 트리 뷰 */}
      <div onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.outline = "2px dashed #FF9800"; }} onDragLeave={(e) => { e.currentTarget.style.outline = "none"; }} onDrop={(e) => { e.preventDefault(); e.currentTarget.style.outline = "none"; handleDrop(null); }} style={{ minHeight: 60, padding: 8, borderRadius: 10, border: "1px dashed #222" }}>
        {roots.length === 0 && <p style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", padding: 20 }}>🏢 조직을 먼저 추가한 후, 👤 인원을 배치하세요.</p>}
        {roots.map(r => renderNode(r, 0))}
      </div>
    </Card>

    {/* 비상연락망 */}
    {org.filter(n => n.type === "person" && n.phone).length > 0 && <Card>
      <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>📞 비상연락망</h3>
      <div style={{ display: "grid", gap: 4 }}>
        {org.filter(n => n.type === "person" && n.phone).map(n => {
          const parentOrg = org.find(o => o.id === n.parentId && o.type === "org");
          return (<div key={n.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, minWidth: 60 }}>{n.name}</span>
            {n.position && <span style={{ color: "#66BB6A", fontSize: 14, fontWeight: 600, minWidth: 50 }}>{n.position}</span>}
            {parentOrg && <span style={{ color: "#94A3B8", fontSize: 14, flex: 1 }}>🏢 {parentOrg.name}</span>}
            <a href={`tel:${n.phone.replace(/-/g, "")}`} style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(76,175,80,0.1)", border: "1px solid rgba(76,175,80,0.2)", color: "#66BB6A", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>📞 {n.phone}</a>
          </div>);
        })}
      </div>
    </Card>}
  </div>);
}

// ─── CMS Page ────────────────────────────────────────────────────
function CMSPage({ categories, setCategories, settings, setSettings, alerts, setAlerts, smsLog, initialTab, initialCatId, extraTabs, onExtraTab, userRole, accounts, setAccounts, onDataReset, onForceSync, updateAvailable }) {
  const [tab, setTab] = useState(initialTab || "monitor");
  const [focusCat, setFocusCat] = useState(initialCatId || null);
  const [editWorker, setEditWorker] = useState(null); // {siteId, workerId}
  const [nc, setNc] = useState({ name: "", phone: "" });
  const [locLoading, setLocLoading] = useState(false);
  const [apiTestResult, setApiTestResult] = useState({});
  const [kmaTestResult, setKmaTestResult] = useState(null);
  const [newCat, setNewCat] = useState({ name: "", unit: "", source: "manual", icon: "📊", apiInterval: 10, thresholds: { BLUE: [0, 100], YELLOW: [100, 200], ORANGE: [200, 300], RED: [300, Infinity] }, currentValue: 0, actionItems: ["점검"], alertMessages: { BLUE: "정상", YELLOW: "주의", ORANGE: "경계", RED: "경보" }, apiConfig: { url: "", method: "GET", headers: "", responsePath: "", enabled: false }, kmaCategory: "", history: [] });
  const [editPgId, setEditPgId] = useState(null);

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

  return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", padding: "20px max(16px, env(safe-area-inset-right)) 80px max(16px, env(safe-area-inset-left))" }}>
    {/* CueFlow 스타일 CMS 헤더 */}
    <div style={{ maxWidth: 800, margin: "0 auto 16px", padding: "16px 18px", borderRadius: 18, background: "linear-gradient(135deg, rgba(244,67,54,0.06), rgba(244,67,54,0.01))", border: "1px solid rgba(244,67,54,0.2)", boxShadow: "0 0 0 1px rgba(244,67,54,0.06), 0 4px 24px rgba(244,67,54,0.1), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, rgba(244,67,54,0.22), rgba(244,67,54,0.06))", border: "1px solid rgba(244,67,54,0.3)", boxShadow: "0 0 16px rgba(244,67,54,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🛡️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ color: "#fff", fontSize: 17, fontWeight: 700, letterSpacing: -0.3, margin: 0, lineHeight: 1.2 }}>{settings.festivalName || "축제"} 관리</h2>
          <p style={{ color: "#94A3B8", fontSize: 12, margin: "2px 0 0" }}>시스템 · 기능 · 데이터 설정</p>
        </div>
      </div>
    </div>

    {/* 그룹별 탭 네비게이션 */}
    <div style={{ maxWidth: 800, margin: "0 auto 20px" }}>
      {tabGroups.map((g, gi) => (
        <div key={g.label} style={{ marginBottom: gi === tabGroups.length - 1 ? 0 : 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ color: "#94A3B8", fontSize: 12, fontWeight: 700, marginBottom: 8, paddingLeft: 4, letterSpacing: 0.3, textTransform: "uppercase" }}>{g.label}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {g.tabs.map(t => <button key={t.id} onClick={() => { if ((extraTabs||[]).find(et => et.id === t.id)) { onExtraTab?.(t.id); return; } setTab(t.id); if (t.id !== "apiconfig") setFocusCat(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: tab === t.id ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.06)", background: tab === t.id ? "linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.05))" : "rgba(255,255,255,0.02)", color: tab === t.id ? "#42A5F5" : "#94A3B8", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", transition: "all .2s", boxShadow: tab === t.id ? "0 0 12px rgba(33,150,243,0.2)" : "none" }}>{t.label}</button>)}
          </div>
        </div>
      ))}
    </div>
    <div style={{ maxWidth: 800, margin: "0 auto" }}>

    {/* Monitor */}
    {tab === "monitor" && <div>{categories.map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id} style={{ border: `1px solid ${li.border}`, cursor: "pointer", boxShadow: `0 0 0 1px ${li.color}10, 0 4px 20px ${li.color}15` }} onClick={() => { setTab(cat.kmaCategory ? "kma" : "apiconfig"); setFocusCat(cat.id); }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div><span style={{ fontSize: 18, marginRight: 6 }}>{cat.icon}</span><span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 14 }}>{cat.name}</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: li.color, fontWeight: 700, fontSize: 22, fontVariantNumeric: "tabular-nums", textShadow: `0 0 12px ${li.color}40` }}>{cat.currentValue.toLocaleString()}{cat.unit}</span><span style={{ padding: "3px 10px", borderRadius: 8, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 12, fontWeight: 700 }}>{li.label}</span></div>
      </div>
      <div style={{ marginTop: 4, color: "#94A3B8", fontSize: 14 }}>{cat.kmaCategory ? `🌤️기상청 ${cat.kmaCategory}` : cat.apiConfig?.enabled ? "🔌커스텀API" : "✏️수동"} | 클릭하여 설정 ›</div>
      <HistoryChart cat={cat} />
    </Card>); })}</div>}

    {/* ── KMA API Settings ── */}
    {tab === "kma" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🌤️ 기상청 초단기실황조회 API</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 16px" }}>공공데이터포털 VilageFcstInfoService_2.0 / getUltraSrtNcst</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>공공데이터포털 인증키 (ServiceKey)</Label><Input value={kma.serviceKey || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, serviceKey: e.target.value } })} placeholder="인증키를 입력하세요 (Decoding 키)" style={{ fontVariantNumeric: "tabular-nums", fontSize: 14 }} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label>수집 간격 (분)</Label><Input type="number" value={kma.interval || 10} onChange={e => setSettings({ ...settings, kma: { ...kma, interval: parseInt(e.target.value) || 10 } })} /></div>
            <div><Label>데이터 형식</Label><Input value="JSON" disabled style={{ color: "#94A3B8" }} /></div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>📍 격자 좌표 (nx, ny)</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 12px" }}>축제 위치 좌표에서 자동 변환됩니다. 필요시 수동 입력도 가능합니다.</p>
        <div style={{ padding: 12, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 12 }}>
          <p style={{ color: "#8892b0", fontSize: 14, margin: 0 }}>📍 현재 위치: {loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)})<br />🔄 자동 변환 격자: <strong style={{ color: "#66BB6A" }}>nx={grid.nx}, ny={grid.ny}</strong></p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><Label>nx 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nxOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nxOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.nx}`} /></div>
          <div><Label>ny 수동 지정 (비우면 자동)</Label><Input type="number" value={kma.nyOverride || ""} onChange={e => setSettings({ ...settings, kma: { ...kma, nyOverride: e.target.value ? parseInt(e.target.value) : null } })} placeholder={`자동: ${grid.ny}`} /></div>
        </div>
        <p style={{ color: "#94A3B8", fontSize: 14, margin: 0 }}>적용 격자: nx={kma.nxOverride || grid.nx}, ny={kma.nyOverride || grid.ny}</p>
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>🔗 항목별 기상청 카테고리 매핑</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 12px" }}>각 모니터링 항목에 기상청 응답 카테고리를 연결합니다.</p>
        {categories.map(cat => (
          <div key={cat.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            <span style={{ color: "#E2E8F0", fontSize: 13, minWidth: 100 }}>{cat.icon} {cat.name}</span>
            <select value={cat.kmaCategory || ""} onChange={e => setCategories(p => p.map(c => c.id === cat.id ? { ...c, kmaCategory: e.target.value } : c))} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
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
          <span style={{ color: kmaTestResult.ok ? "#66BB6A" : "#EF5350", fontSize: 14, fontWeight: 700 }}>{kmaTestResult.ok ? "✅ 성공" : "❌ 실패"}</span>
          {kmaTestResult.simulated && <span style={{ padding: "3px 8px", borderRadius: 10, background: "rgba(255,152,0,0.15)", border: "1px solid rgba(255,152,0,0.3)", color: "#FFA726", fontSize: 14, fontWeight: 700 }}>시뮬레이션</span>}
        </div>
        <pre style={{ color: "#aaa", fontSize: 13, margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all", fontVariantNumeric: "tabular-nums" }}>{kmaTestResult.msg}</pre>
        {kmaTestResult.items && <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 6px", fontWeight: 700 }}>수신 데이터:</p>
          {kmaTestResult.items.map((item, i) => (<div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ color: "#66BB6A", fontSize: 14, fontWeight: 700, minWidth: 40 }}>{item.category}</span>
            <span style={{ color: "#E2E8F0", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{item.obsrValue}</span>
            <span style={{ color: "#94A3B8", fontSize: 13 }}>{KMA_CODES[item.category]?.name || ""} ({KMA_CODES[item.category]?.unit || ""})</span>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>😷 에어코리아 미세먼지 API</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 16px" }}>공공데이터포털 → 한국환경공단 에어코리아 대기오염정보</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Label style={{ minWidth: 60 }}>활성화</Label>
            <div onClick={() => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, enabled: !(prev.airQuality?.enabled) } }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.airQuality?.enabled ? "#66BB6A" : "#333", position: "relative", cursor: "pointer" }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: settings.airQuality?.enabled ? 22 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ color: settings.airQuality?.enabled ? "#66BB6A" : "#EF5350", fontSize: 13, fontWeight: 700 }}>{settings.airQuality?.enabled ? "ON" : "OFF"}</span>
          </div>
          <div><Label>API 인증키 (공공데이터포털)</Label><Input value={settings.airQuality?.serviceKey || ""} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, serviceKey: e.target.value } }))} placeholder="공공데이터포털에서 발급받은 인증키" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>시도명</Label><select value={settings.airQuality?.sidoName || "경남"} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, sidoName: e.target.value } }))} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
              {["서울","부산","대구","인천","광주","대전","울산","세종","경기","강원","충북","충남","전북","전남","경북","경남","제주"].map(s => <option key={s} value={s}>{s}</option>)}
            </select></div>
            <div><Label>지역 필터</Label><Input value={settings.airQuality?.stationFilter || ""} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, stationFilter: e.target.value } }))} placeholder="진주, 종로 등" /></div>
          </div>
          <div><Label>갱신 주기 (분)</Label><Input type="number" value={settings.airQuality?.interval || 30} onChange={e => setSettings(prev => ({ ...prev, airQuality: { ...prev.airQuality, interval: parseInt(e.target.value) || 30 } }))} /></div>
          {settings.airQuality?.lastFetch && <p style={{ color: "#66BB6A", fontSize: 13 }}>✅ 마지막 수신: {settings.airQuality.lastFetch}</p>}
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
          }} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #FF9800, #F57C00)", color: "#fff", boxShadow: "0 4px 12px rgba(255,152,0,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🧪 미세먼지 API 테스트</button>
        </div>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#42A5F5", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API:</strong> getCtprvnRltmMesureDnsty (시도별 실시간 측정정보)<br />
          • <strong>시도명:</strong> 경남, 서울, 부산 등 선택<br />
          • <strong>지역 필터:</strong> 측정소명에 포함된 텍스트 (예: 진주, 종로)<br />
          • <strong>수집항목:</strong> PM10(미세먼지), PM2.5(초미세먼지)
        </p>
      </Card>

      {/* 🌊 댐 방류현황 (K-water) */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🌊 댐 방류현황 (K-water)</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 16px" }}>한국수자원공사 다목적댐 운영 정보 API</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Label style={{ minWidth: 60 }}>활성화</Label>
            <div onClick={() => setSettings(prev => ({ ...prev, dam: { ...prev.dam, enabled: !(prev.dam?.enabled) } }))} style={{ width: 44, height: 24, borderRadius: 12, background: settings.dam?.enabled ? "#66BB6A" : "#333", position: "relative", cursor: "pointer" }}>
              <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: settings.dam?.enabled ? 22 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ color: settings.dam?.enabled ? "#66BB6A" : "#EF5350", fontSize: 13, fontWeight: 700 }}>{settings.dam?.enabled ? "ON" : "OFF"}</span>
          </div>
          <div><Label>API 인증키</Label><Input value={settings.dam?.serviceKey || ""} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, serviceKey: e.target.value } }))} placeholder="공공데이터포털 인증키" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>댐 이름</Label><select value={settings.dam?.damName || "남강"} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, damName: e.target.value } }))} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
              {["소양강","충주","횡성","안동","임하","합천","남강","밀양","운문","대청","용담","섬진강","주암","장흥"].map(d => <option key={d} value={d}>{d}댐</option>)}
            </select></div>
            <div><Label>갱신 주기 (분)</Label><Input type="number" value={settings.dam?.interval || 30} onChange={e => setSettings(prev => ({ ...prev, dam: { ...prev.dam, interval: parseInt(e.target.value) || 30 } }))} /></div>
          </div>
          {settings.dam?.lastFetch && <p style={{ color: "#66BB6A", fontSize: 13 }}>✅ 마지막 수신: {settings.dam.lastFetch}</p>}
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
                const nm = target.damnm || target.damNm || "";
                const discharge = parseFloat(target.sflowqy || target.totdcwtrqy || target.outflowqy) || 0;
                const inflow = parseFloat(target.inflowqy) || 0;
                setCategories(p => p.map(c => c.id === "dam" ? { ...c, currentValue: discharge, lastUpdated: new Date().toLocaleTimeString("ko-KR"), dataType: "실황" } : c));
                setSettings(prev => ({ ...prev, dam: { ...prev.dam, lastFetch: new Date().toLocaleString("ko-KR") } }));
                const allDams = allItems.map(i => i.damnm || i.damNm).filter(Boolean).join(", ");
                const fields = Object.keys(target).join(", ");
                alert(`✅ ${nm}댐\n📅 ${vdate} ${vtime}시\n\n🌊 방류량: ${discharge} ㎥/s\n💧 유입량: ${inflow} ㎥/s\n📏 현재수위: ${target.nowlowlevel || "-"} EL.m\n📦 현재저수량: ${target.nowrsvwtqy || "-"} 백만㎥\n📊 저수율: ${target.rsvwtrt || "-"}%\n📏 전일수위: ${target.lastlowlevel || "-"} EL.m\n🌧️ 강우량: ${target.rainqy || "-"} mm\n\n🏗️ 전체 댐:\n${allDams}\n\n📋 응답필드:\n${fields}\n\n대시보드에 방류량 반영됨`);
              } else {
                const allDams = allItems.map(i => i.damnm || i.damNm).filter(Boolean).join(", ");
                alert(`❌ "${filter}" 댐을 찾을 수 없습니다.\n\n전체 댐 목록:\n${allDams}\n\n위 이름 중 하나를 입력하세요.`);
              }
            } catch (e) { alert(`❌ API 호출 실패: ${e.message}`); }
          }} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🌊 댐 방류량 테스트</button>
        </div>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#42A5F5", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
          ℹ️ <strong>API:</strong> 한국수자원공사_다목적댐 운영 정보 (/multipurPoseDamlist)<br />
          • <strong>대시보드 표시:</strong> 방류량(sflowqy) ㎥/s<br />
          • <strong>기타 수집:</strong> 유입량, 수위, 저수량, 저수율, 강우량<br />
          • <strong>인증키:</strong> 공공데이터포털 → 한국수자원공사_다목적댐 운영 정보 활용신청
        </p>
      </Card>
    </div>}

    {/* ── Custom API Config ── */}
    {tab === "apiconfig" && <div>
      <div style={{ padding: 10, borderRadius: 8, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.12)", marginBottom: 14 }}>
        <p style={{ color: "#8892b0", fontSize: 13, margin: 0 }}>🔌 기상청 외 커스텀 API를 설정합니다. URL에 <code style={{ color: "#66BB6A" }}>{"{lat}"}</code>, <code style={{ color: "#66BB6A" }}>{"{lon}"}</code> 사용 가능.</p>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
        {categories.map(cat => <button key={cat.id} onClick={() => setFocusCat(cat.id)} style={{ padding: "6px 12px", borderRadius: 8, border: focusCat === cat.id ? "1px solid #2196F3" : "1px solid #252525", background: focusCat === cat.id ? "rgba(33,150,243,0.15)" : "transparent", color: focusCat === cat.id ? "#42A5F5" : "#667", fontSize: 13, cursor: "pointer" }}>{cat.icon}{cat.name}</button>)}
      </div>
      {catForFocus && <Card><h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 14px" }}>{catForFocus.icon} {catForFocus.name} 커스텀 API</h3>
        {catForFocus.kmaCategory && <div style={{ padding: 8, borderRadius: 8, background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)", marginBottom: 12 }}><p style={{ color: "#66BB6A", fontSize: 13, margin: 0 }}>🌤️ 이 항목은 기상청 API ({catForFocus.kmaCategory})에 매핑되어 있습니다. 커스텀 API를 활성화하면 기상청 대신 커스텀 API가 사용됩니다.</p></div>}
        <div style={{ display: "grid", gap: 10 }}>
          <div><Label>API URL</Label><Input value={catForFocus.apiConfig?.url || ""} onChange={e => upApiCfg(catForFocus.id, "url", e.target.value)} placeholder="https://api.example.com/data?lat={lat}" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>Method</Label><select value={catForFocus.apiConfig?.method || "GET"} onChange={e => upApiCfg(catForFocus.id, "method", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}><option value="GET">GET</option><option value="POST">POST</option></select></div>
            <div><Label>간격(분)</Label><Input type="number" value={catForFocus.apiInterval || 10} onChange={e => setCategories(p => p.map(c => c.id === catForFocus.id ? { ...c, apiInterval: parseInt(e.target.value) || 10 } : c))} /></div>
          </div>
          <div><Label>Headers (JSON)</Label><Input value={catForFocus.apiConfig?.headers || ""} onChange={e => upApiCfg(catForFocus.id, "headers", e.target.value)} placeholder='{"Authorization":"Bearer xxx"}' /></div>
          <div><Label>응답 경로 (JSON Path)</Label><Input value={catForFocus.apiConfig?.responsePath || ""} onChange={e => upApiCfg(catForFocus.id, "responsePath", e.target.value)} placeholder="data.value" /></div>
          <Toggle on={catForFocus.apiConfig?.enabled || false} onToggle={() => upApiCfg(catForFocus.id, "enabled", !catForFocus.apiConfig?.enabled)} labelOn="커스텀 API 활성" labelOff="비활성" />
          <button onClick={() => testCustomApi(catForFocus)} style={{ padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #FF9800, #F57C00)", color: "#fff", boxShadow: "0 4px 12px rgba(255,152,0,0.3)", fontWeight: 700, cursor: "pointer" }}>🧪 테스트</button>
          {apiTestResult[catForFocus.id] && <div style={{ padding: 10, borderRadius: 8, background: apiTestResult[catForFocus.id].ok ? "rgba(76,175,80,0.08)" : "rgba(244,67,54,0.08)", border: `1px solid ${apiTestResult[catForFocus.id].ok ? "#4CAF5044" : "#F4433644"}` }}><span style={{ color: apiTestResult[catForFocus.id].ok ? "#66BB6A" : "#EF5350", fontSize: 14 }}>{apiTestResult[catForFocus.id].ok ? "✅" : "❌"} {apiTestResult[catForFocus.id].msg}</span></div>}
        </div></Card>}
    </div>}

    {/* Operating */}
    {/* Thresholds */}
    {tab === "thresholds" && <div>{categories.map(cat => (<Card key={cat.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3 style={{ color: "#E2E8F0", fontSize: 14, margin: 0 }}>{cat.icon} {cat.name} ({cat.unit})</h3><button onClick={() => { if (confirm("삭제?")) setCategories(p => p.filter(c => c.id !== cat.id)); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 6 }}>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ padding: 8, borderRadius: 8, background: lv.bg, border: `1px solid ${lv.border}` }}><div style={{ color: lv.color, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{lv.label}</div><div style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="number" value={cat.thresholds[lk]?.[0] ?? 0} onChange={e => upThr(cat.id, lk, 0, e.target.value)} style={{ width: 55, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={cat.thresholds[lk]?.[1] === Infinity ? "∞" : cat.thresholds[lk]?.[1] ?? 0} onChange={e => upThr(cat.id, lk, 1, e.target.value)} style={{ width: 55, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }} /></div></div>))}</div></Card>))}</div>}

    {/* Manual */}
    {tab === "manual" && <div>
      {categories.filter(c => c.source === "manual" || !c.kmaCategory).map(cat => { const lv = getLevel(cat); const li = LEVELS[lv]; return (<Card key={cat.id}><h3 style={{ color: "#E2E8F0", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 140, fontSize: 18, fontWeight: 700 }} /><span style={{ color: "#8892b0" }}>{cat.unit}</span><span style={{ padding: "6px 12px", borderRadius: 20, background: li.bg, border: `1px solid ${li.border}`, color: li.color, fontSize: 13, fontWeight: 700 }}>{li.icon} {li.label}</span></div></Card>); })}
      <Card style={{ background: "rgba(33,150,243,0.03)", border: "1px solid rgba(33,150,243,0.12)" }}><p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 10px" }}>🔄 API 항목 비상 수동 입력</p>
        {categories.filter(c => c.kmaCategory || c.apiConfig?.enabled).map(cat => (<div key={cat.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}><span style={{ color: "#E2E8F0", fontSize: 14, minWidth: 70 }}>{cat.icon}{cat.name}</span><Input type="number" value={cat.currentValue} onChange={e => upVal(cat.id, e.target.value)} style={{ width: 100, fontSize: 13 }} /><span style={{ color: "#555", fontSize: 13 }}>{cat.unit}</span></div>))}</Card></div>}

    {/* Alert messages */}
    {tab === "alertmsg" && <div>{categories.map(cat => (<Card key={cat.id}><h3 style={{ color: "#E2E8F0", fontSize: 14, margin: "0 0 10px" }}>{cat.icon} {cat.name}</h3>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ marginBottom: 8 }}><Label><span style={{ color: lv.color }}>{lv.icon}{lv.label}</span></Label><textarea value={cat.alertMessages?.[lk] || ""} onChange={e => upMsg(cat.id, lk, e.target.value)} rows={2} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${lv.border}`, background: "rgba(255,255,255,0.03)", color: "#ddd", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>))}</Card>))}</div>}

    {/* SMS */}
    {tab === "sms" && <div>
      <Card><h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 12px" }}>📱 Solapi SMS 설정</h3><div style={{ display: "grid", gap: 10 }}>
        <div><Label>API Key</Label><Input value={settings.solapiApiKey} onChange={e => setSettings({ ...settings, solapiApiKey: e.target.value })} placeholder="NCSA..." /></div>
        <div><Label>API Secret</Label><Input value={settings.solapiApiSecret} onChange={e => setSettings({ ...settings, solapiApiSecret: e.target.value })} placeholder="API Secret 입력" /></div>
        <div><Label>발신번호 (사전 등록 필요)</Label><Input type="tel" value={settings.solapiSender} onChange={e => setSettings({ ...settings, solapiSender: e.target.value })} placeholder="01012345678" /></div>
        <div><Label>경계이상 반복 발송 간격(분)</Label><Input type="number" value={settings.smsIntervalMin} onChange={e => setSettings({ ...settings, smsIntervalMin: parseInt(e.target.value) || 30 })} style={{ width: 100 }} /></div>
        <Toggle on={settings.smsEnabled} onToggle={() => setSettings({ ...settings, smsEnabled: !settings.smsEnabled })} labelOn="SMS 활성" labelOff="비활성" />

        {/* 테스트 발송 */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Input id="sms-test-phone" placeholder="테스트 수신번호" style={{ flex: 1 }} />
            <button onClick={async () => {
              const phone = document.getElementById("sms-test-phone")?.value;
              if (!phone) { alert("수신번호를 입력하세요."); return; }
              if (!settings.solapiApiKey || !settings.solapiApiSecret || !settings.solapiSender) { alert("API Key, Secret, 발신번호를 먼저 입력하세요."); return; }
              const result = await sendSolapi(settings, `[축제 안전관리시스템] 테스트 메시지입니다.\n발송시간: ${new Date().toLocaleString("ko-KR")}`, [{ name: "테스트", phone }]);
              alert(result.success ? "✅ 테스트 발송 성공!" : "❌ 발송 실패. API Key/Secret/발신번호를 확인하세요.");
            }} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4CAF50, #388E3C)", color: "#fff", boxShadow: "0 4px 12px rgba(76,175,80,0.3)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📩 테스트 발송</button>
          </div>
        </div>
      </div></Card>

      {/* 안전관리책임자 */}
      <Card>
        <h3 style={{ color: "#EF5350", fontSize: 15, margin: "0 0 4px" }}>🔴 안전관리책임자</h3>
        <p style={{ color: "#94A3B8", fontSize: 14, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsManagers || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(244,67,54,0.05)", borderRadius: 6, border: "1px solid rgba(244,67,54,0.1)" }}><span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsManagers: settings.smsManagers.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#EF5350", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsManagers: [...(settings.smsManagers || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      {/* 안전요원 */}
      <Card>
        <h3 style={{ color: "#FFA726", fontSize: 15, margin: "0 0 4px" }}>🟠 안전요원</h3>
        <p style={{ color: "#94A3B8", fontSize: 14, margin: "0 0 10px" }}>경계/경보 알림 + 조치중/조치완료 SMS 수신</p>
        {(settings.smsStaff || []).map((c, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "6px 10px", background: "rgba(255,152,0,0.05)", borderRadius: 6, border: "1px solid rgba(255,152,0,0.1)" }}><span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{c.name}</span><span style={{ color: "#8892b0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{c.phone}</span><button onClick={() => setSettings({ ...settings, smsStaff: settings.smsStaff.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "#EF5350", cursor: "pointer" }}>✕</button></div>))}
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Input placeholder="이름" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} style={{ width: 80 }} /><Input placeholder="01012345678" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} style={{ flex: 1 }} /><button onClick={() => { if (nc.name && nc.phone) { setSettings({ ...settings, smsStaff: [...(settings.smsStaff || []), { name: nc.name, phone: nc.phone }] }); setNc({ name: "", phone: "" }); } }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #FF9800, #F57C00)", color: "#fff", boxShadow: "0 4px 12px rgba(255,152,0,0.3)", fontWeight: 700, cursor: "pointer" }}>추가</button></div>
      </Card>

      <Card><h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 10px" }}>📋 발송 이력</h3>{(!smsLog || !smsLog.length) ? <p style={{ color: "#94A3B8", fontSize: 14 }}>없음</p> : <div style={{ maxHeight: 200, overflow: "auto" }}>{smsLog.map((l, i) => (<div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}><span style={{ color: l.success ? "#66BB6A" : "#EF5350" }}>{l.success ? "✅" : "❌"}</span> <span style={{ color: "#555" }}>{l.time}</span><div style={{ color: "#777", whiteSpace: "pre-wrap", marginTop: 2 }}>{l.preview}</div></div>))}</div>}</Card>
    </div>}

    {/* Zone Management */}
    {/* 출입구 관리 (계수용) */}
    {/* 구역설정 (구역 + 근무지 통합) */}
    {tab === "zonesetup" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>🗺️ 관리구역 등록</h3>
        {(settings.zones || []).map((z, i) => {
          const ZTYPES = { none: { label: "속성없음", color: "#8892b0", icon: "⬜" }, normal: { label: "구역관리", color: "#42A5F5", icon: "📍" }, performance: { label: "공연관리", color: "#AB47BC", icon: "🎭" }, safety: { label: "안전관리", color: "#EF5350", icon: "🛡️" }, support: { label: "지원관리", color: "#FFA726", icon: "🚑" }, parking: { label: "주차관리", color: "#009688", icon: "🅿️" }, entry: { label: "출입관리", color: "#795548", icon: "🚪" } };
          const zt = ZTYPES[z.zoneType] || ZTYPES.normal;
          return (
          <div key={z.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 8, border: `1px solid ${zt.color}33` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: zt.color, fontWeight: 700, fontSize: 14 }}>{zt.icon} {z.name || `구역 ${i+1}`}</span>
              <span style={{ padding: "3px 8px", borderRadius: 4, background: `${zt.color}15`, color: zt.color, fontSize: 12, fontWeight: 700 }}>{zt.label}</span>
              <span style={{ color: "#94A3B8", fontSize: 12, flex: 1 }}>{(settings.workSites || []).filter(s => s.zoneId === z.id).length}개 근무지</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div><Label>구역명</Label><Input value={z.name} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, name: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="A구역" /></div>
              <div><Label>범위</Label><Input value={z.range || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, range: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="동문~남문" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
              <div><Label>구역 속성</Label><select value={z.zoneType || "normal"} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, zoneType: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
                <option value="none">⬜ 속성없음</option>
                <option value="normal">📍 구역관리</option>
                <option value="performance">🎭 공연관리</option>
                <option value="safety">🛡️ 안전관리</option>
                <option value="support">🚑 지원관리</option>
                <option value="parking">🅿️ 주차관리</option>
                <option value="entry">🚪 출입관리</option>
              </select></div>
              <div><Label>대시보드 표시</Label>
                <div onClick={() => { const zs = [...settings.zones]; zs[i] = { ...z, dashboardShow: !(z.dashboardShow !== false) }; setSettings({ ...settings, zones: zs }); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", cursor: "pointer" }}>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: z.dashboardShow !== false ? "#66BB6A" : "#333", position: "relative" }}><div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: z.dashboardShow !== false ? 18 : 2, transition: "all .3s" }} /></div>
                  <span style={{ color: z.dashboardShow !== false ? "#66BB6A" : "#EF5350", fontSize: 13 }}>{z.dashboardShow !== false ? "ON" : "OFF"}</span>
                </div>
              </div>
            </div>
            <div><Label>담당 계정 (구역관리자)</Label>
              <div style={{ display: "flex", gap: 6 }}>
                <select value={z.accountId || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, accountId: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>🏠 근무지 관리</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>근무지를 만들고 구역에 배치합니다.</p>
        {(settings.workSites || []).map((site, si) => (
          <div key={site.id} style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 8, border: "1px solid rgba(255,255,255,0.06)" }}
            draggable onDragStart={e => e.dataTransfer.setData("siteId", site.id)}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
            onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = "none"; const d = e.dataTransfer.getData("siteId"); if (d && d !== site.id) { const ws = [...(settings.workSites || [])]; const di = ws.findIndex(s => s.id === d); const ti = ws.findIndex(s => s.id === site.id); if (di >= 0 && ti >= 0) { const [item] = ws.splice(di, 1); ws.splice(ti, 0, item); setSettings(prev => ({ ...prev, workSites: ws })); } } }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ cursor: "grab", fontSize: 14 }}>⠿</span>
              <Input value={site.name} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, name: e.target.value }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="근무지명" style={{ flex: 1 }} />
              <select value={site.zoneId || ""} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, zoneId: e.target.value || null }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 12, maxWidth: 110 }}>
                <option value="">미지정</option>
                {(settings.zones || []).filter(z => z.name).map(z => <option key={z.id} value={z.id}>📍{z.name}</option>)}
              </select>
              <button onClick={() => setSettings(prev => ({ ...prev, workSites: prev.workSites.filter(s => s.id !== site.id) }))} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 8px" }}>📋 근무유형</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(settings.workTypes || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 6, background: "rgba(156,39,176,0.08)", border: "1px solid rgba(156,39,176,0.15)" }}>
              <span style={{ color: "#E1BEE7", fontSize: 13 }}>{t}</span>
              <button onClick={() => setSettings(prev => ({ ...prev, workTypes: prev.workTypes.filter((_, j) => j !== i) }))} style={{ padding: 0, border: "none", background: "none", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4 }}>
            <Input id="new-wt2" placeholder="새 유형" style={{ width: 100 }} />
            <button onClick={() => { const inp = document.getElementById("new-wt2"); if (inp?.value) { setSettings(prev => ({ ...prev, workTypes: [...(prev.workTypes || []), inp.value] })); inp.value = ""; } }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
        </div>
      </Card>

      {/* ① 근무자 등록 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>👤 근무자 등록</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>먼저 근무자를 등록하면 아래 '미배치' 목록에 추가됩니다.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div><Label>이름 *</Label><Input id="sw-name" placeholder="홍길동" /></div>
          <div><Label>연락처</Label><Input id="sw-phone" placeholder="010-1234-5678" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><Label>근무유형</Label><select id="sw-type" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
            {(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
          <div><Label>역할</Label><select id="sw-role" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
            {["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
          </select></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><Label>근무지 배치</Label>
          <select id="sw-site" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
            <option value="_pool">⚠️ 미배치</option>
            {(settings.workSites || []).filter(s => s.id !== "_pool").map(s => {
              const zone = (settings.zones || []).find(z => z.id === s.zoneId);
              return <option key={s.id} value={s.id}>{zone ? `📍${zone.name} → ` : ""}{s.name}</option>;
            })}
          </select></div>
          <div><Label>계정 연결</Label>
          <select id="sw-account" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
            <option value="">없음 (계정 없는 근무자)</option>
            {(accounts||[]).map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
          </select></div>
        </div>
        <button onClick={() => {
          const name = document.getElementById("sw-name")?.value;
          if (!name) { alert("이름을 입력하세요."); return; }
          const phone = document.getElementById("sw-phone")?.value || "";
          const type = document.getElementById("sw-type")?.value || "";
          const role = document.getElementById("sw-role")?.value || "";
          let accountId = document.getElementById("sw-account")?.value || null;
          const wid = "w_" + Date.now();
          const siteId = document.getElementById("sw-site")?.value || "_pool";

          // 🔐 자동 계정 생성: 계정 미선택 시 이름으로 새 계정 생성
          let createdNewAccount = false;
          if (!accountId && setAccounts && accounts) {
            const exists = accounts.find(a => a.id === name.trim());
            if (!exists) {
              const roleMap = { "주차": "parking", "주차요원": "parking", "셔틀": "shuttle", "셔틀요원": "shuttle", "계수": "counter", "계수원": "counter", "구역": "zonemgr", "구역관리": "zonemgr", "구역관리자": "zonemgr", "무대": "stagemgr", "무대관리": "stagemgr", "관리자": "manager", "운영자": "manager", "운영": "manager", "지원": "manager", "안전관리": "manager", "기술": "manager" };
              const accRole = roleMap[role] || "manager";
              const fid = settings.festivalId || "default";
              accountId = name.trim();
              setAccounts(prev => [...prev, { id: accountId, password: simpleHash("1234"), name, role: accRole, festivalId: fid, festivals: [fid], workerId: wid, siteId }]);
              createdNewAccount = true;
            }
          }

          const worker = { id: wid, name, phone, type, role, duty: "", accountId };
          const ws = [...(settings.workSites || [])];
          let target = ws.find(s => s.id === siteId);
          if (!target) { target = ws.find(s => s.id === "_pool"); }
          if (!target) { target = { id: "_pool", name: "미배치", zoneId: null, status: "standby", workers: [] }; ws.push(target); }
          const ti = ws.indexOf(target);
          ws[ti] = { ...target, workers: [...(target.workers || []), worker] };
          setSettings(prev => ({ ...prev, workSites: ws }));
          document.getElementById("sw-name").value = "";
          document.getElementById("sw-phone").value = "";
          const siteName = siteId === "_pool" ? "미배치" : target.name;
          alert("✅ " + name + " 등록 완료 → " + siteName + (createdNewAccount ? `\n\n🔐 자동 계정 생성됨\n🆔 ID: ${accountId}\n🔑 비밀번호: 1234` : ""));
        }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #4CAF50, #388E3C)", color: "#fff", boxShadow: "0 4px 12px rgba(76,175,80,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>👤 근무자 등록 (계정 미선택 시 자동 생성)</button>
      </Card>

      {/* ② 배치 관리 (드래그) */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📋 근무자 배치</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>근무자를 드래그하여 근무지에 배치합니다.</p>

        {/* 미배치 근무자 */}
        {(() => {
          const pool = (settings.workSites || []).find(s => s.id === "_pool");
          const poolWorkers = pool?.workers || [];
          if (poolWorkers.length === 0) return null;
          return (<div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(255,152,0,0.06)", border: "1.5px dashed rgba(255,152,0,0.3)" }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#FFA726"; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = "rgba(255,152,0,0.3)"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "rgba(255,152,0,0.3)"; const wid = e.dataTransfer.getData("workerId"); const from = e.dataTransfer.getData("fromSite"); if (wid && from && from !== "_pool") { const ws = [...(settings.workSites || [])]; const fi = ws.findIndex(s => s.id === from); const pi = ws.findIndex(s => s.id === "_pool"); if (fi >= 0 && pi >= 0) { const w = ws[fi].workers.find(ww => ww.id === wid); if (w) { ws[fi] = { ...ws[fi], workers: ws[fi].workers.filter(ww => ww.id !== wid) }; ws[pi] = { ...ws[pi], workers: [...ws[pi].workers, w] }; setSettings(prev => ({ ...prev, workSites: ws })); } } } }}>
            <div style={{ color: "#FFA726", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠️ 미배치 근무자 ({poolWorkers.length}명)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {poolWorkers.map(w => {
                const isEditing = editWorker?.siteId === "_pool" && editWorker?.workerId === w.id;
                const updateW = (field, val) => { const ws = [...(settings.workSites || [])]; const pi = ws.findIndex(s => s.id === "_pool"); if (pi >= 0) { ws[pi] = { ...ws[pi], workers: ws[pi].workers.map(ww => ww.id === w.id ? { ...ww, [field]: val } : ww) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                return isEditing ? (
                  <div key={w.id} style={{ width: "100%", padding: "12px", borderRadius: 10, background: "rgba(33,150,243,0.06)", border: "1.5px solid rgba(33,150,243,0.2)", marginBottom: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div><Label>이름</Label><Input value={w.name} onChange={e => updateW("name", e.target.value)} /></div>
                      <div><Label>연락처</Label><Input value={w.phone || ""} onChange={e => updateW("phone", e.target.value)} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div><Label>근무유형</Label><select value={w.type || ""} onChange={e => updateW("type", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                        <option value="">선택</option>{(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                      <div><Label>역할</Label><select value={w.role || ""} onChange={e => updateW("role", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                        <option value="">선택</option>{["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
                      </select></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <div><Label>근무지 배치</Label><select onChange={e => { if (!e.target.value) return; const ws = [...(settings.workSites||[])]; const pi = ws.findIndex(s => s.id === "_pool"); const ti = ws.findIndex(s => s.id === e.target.value); if (pi>=0 && ti>=0) { ws[pi] = {...ws[pi], workers: ws[pi].workers.filter(ww=>ww.id!==w.id)}; ws[ti] = {...ws[ti], workers: [...(ws[ti].workers||[]), w]}; setSettings(prev=>({...prev, workSites: ws})); setEditWorker(null); } }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                        <option value="">미배치 (현재)</option>
                        {(settings.workSites||[]).filter(s=>s.id!=="_pool").map(s => { const z=(settings.zones||[]).find(zz=>zz.id===s.zoneId); return <option key={s.id} value={s.id}>{z?`📍${z.name} → `:""}{s.name}</option>; })}
                      </select></div>
                      <div><Label>계정 연결</Label><select value={w.accountId || ""} onChange={e => updateW("accountId", e.target.value || null)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                        <option value="">없음</option>
                        {(accounts||[]).map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                      </select></div>
                    </div>
                    <button onClick={() => setEditWorker(null)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 수정 완료</button>
                  </div>
                ) : (
                  <div key={w.id} draggable onDragStart={e => { e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", "_pool"); }}
                    style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "grab", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{w.name}</span>
                    {w.type && <span style={{ color: "#E1BEE7", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{w.type}</span>}
                    {w.role && <span style={{ color: "#009688", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{w.role}</span>}
                    {w.accountId && <span style={{ color: "#42A5F5", fontSize: 12, flexShrink: 0 }}>🔑</span>}
                    <button onClick={(e) => { e.stopPropagation(); setEditWorker({ siteId: "_pool", workerId: w.id }); }} style={{ padding: "3px 8px", border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "#8892b0", fontSize: 12, cursor: "pointer", borderRadius: 4, flexShrink: 0 }}>✏️</button>
                    <button onClick={() => { const ws = [...(settings.workSites || [])]; const pi = ws.findIndex(s => s.id === "_pool"); if (pi >= 0) { ws[pi] = { ...ws[pi], workers: ws[pi].workers.filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "2px 4px", border: "none", background: "none", color: "#EF5350", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>);
        })()}

        {/* 구역 아코디언 */}
        {(settings.zones || []).filter(z => z.name).map(zone => {
          const sites = (settings.workSites || []).filter(s => s.zoneId === zone.id && s.id !== "_pool");
          return (<div key={zone.id} style={{ marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "rgba(33,150,243,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#42A5F5", fontSize: 15, fontWeight: 800, flex: 1 }}>📍 {zone.name}</span>
              <span style={{ color: "#94A3B8", fontSize: 12 }}>{sites.reduce((n, s) => n + (s.workers || []).length, 0)}명</span>
            </div>
            {sites.map(site => {
              const sIdx = (settings.workSites || []).findIndex(s => s.id === site.id);
              return (<div key={site.id} style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "rgba(76,175,80,0.06)"; }}
                onDragLeave={e => { e.currentTarget.style.background = "transparent"; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.background = "transparent"; const wid = e.dataTransfer.getData("workerId"); const from = e.dataTransfer.getData("fromSite"); if (wid && from && from !== site.id) { const ws = [...(settings.workSites || [])]; const fi = ws.findIndex(s => s.id === from); const ti = ws.findIndex(s => s.id === site.id); if (fi >= 0 && ti >= 0) { const w = (ws[fi].workers || []).find(ww => ww.id === wid); if (w) { ws[fi] = { ...ws[fi], workers: ws[fi].workers.filter(ww => ww.id !== wid) }; ws[ti] = { ...ws[ti], workers: [...(ws[ti].workers || []), w] }; setSettings(prev => ({ ...prev, workSites: ws })); } } } }}>
                <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>🏠 {site.name} <span style={{ color: "#94A3B8", fontWeight: 500 }}>({(site.workers || []).length}명)</span></div>
                {(site.workers || []).map(w => {
                  const isEditing = editWorker?.siteId === site.id && editWorker?.workerId === w.id;
                  const updateW = (field, val) => { const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 >= 0) { ws[si2] = { ...ws[si2], workers: ws[si2].workers.map(ww => ww.id === w.id ? { ...ww, [field]: val } : ww) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                  const deleteW = () => { if (!confirm(`${w.name} 근무자를 삭제하시겠습니까?`)) return; const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 >= 0) { ws[si2] = { ...ws[si2], workers: ws[si2].workers.filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); } };
                  return isEditing ? (
                    <div key={w.id} style={{ padding: "14px", borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1.5px solid rgba(33,150,243,0.2)", marginBottom: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><Label>이름</Label><Input value={w.name} onChange={e => updateW("name", e.target.value)} /></div>
                        <div><Label>연락처</Label><Input value={w.phone || ""} onChange={e => updateW("phone", e.target.value)} /></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><Label>근무유형</Label><select value={w.type || ""} onChange={e => updateW("type", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                          <option value="">선택</option>{(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                        </select></div>
                        <div><Label>역할</Label><select value={w.role || ""} onChange={e => updateW("role", e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                          <option value="">선택</option>{["관리자","계수","운영","지원","안전관리","기술"].map(r => <option key={r} value={r}>{r}</option>)}
                        </select></div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <div><Label>근무지 이동</Label><select onChange={e => { if (!e.target.value) return; const ws2 = [...(settings.workSites||[])]; const fi2 = ws2.findIndex(s2=>s2.id===site.id); const ti2 = ws2.findIndex(s2=>s2.id===e.target.value); if (fi2>=0&&ti2>=0&&fi2!==ti2) { const wk2=ws2[fi2].workers.find(ww=>ww.id===w.id); ws2[fi2]={...ws2[fi2],workers:ws2[fi2].workers.filter(ww=>ww.id!==w.id)}; ws2[ti2]={...ws2[ti2],workers:[...(ws2[ti2].workers||[]),wk2]}; setSettings(prev=>({...prev,workSites:ws2})); setEditWorker(null); } }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                          <option value="">현재: {site.name}</option>
                          {(settings.workSites||[]).filter(s2=>s2.id!==site.id).map(s2 => { const z2=(settings.zones||[]).find(zz=>zz.id===s2.zoneId); return <option key={s2.id} value={s2.id}>{s2.id==="_pool"?"⚠️ 미배치":`${z2?`📍${z2.name} → `:""}${s2.name}`}</option>; })}
                        </select></div>
                        <div><Label>계정 연결</Label><select value={w.accountId || ""} onChange={e => updateW("accountId", e.target.value || null)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                          <option value="">없음</option>
                          {(accounts||[]).map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                        </select></div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditWorker(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 완료</button>
                        <button onClick={deleteW} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#EF5350", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🗑 삭제</button>
                      </div>
                    </div>
                  ) : (
                    <div key={w.id} draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", site.id); }}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 4, cursor: "grab", border: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, color: "#94A3B8", flexShrink: 0 }}>⠿</span>
                      <span style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{w.name}</span>
                      {w.type && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(156,39,176,0.1)", color: "#E1BEE7", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{w.type}</span>}
                      {w.role && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(0,150,136,0.1)", color: "#009688", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{w.role}</span>}
                      {w.accountId && <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(33,150,243,0.1)", color: "#42A5F5", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>🔑{w.accountId}</span>}
                      {w.phone && <span style={{ color: "#94A3B8", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{w.phone}</span>}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 4, flexShrink: 0 }}>
                        <button onClick={(e) => { e.stopPropagation(); const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 < 0) return; const wks = [...(ws[si2].workers || [])]; const wi2 = wks.findIndex(ww => ww.id === w.id); if (wi2 > 0) { [wks[wi2-1], wks[wi2]] = [wks[wi2], wks[wi2-1]]; ws[si2] = { ...ws[si2], workers: wks }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>▲</button>
                        <button onClick={(e) => { e.stopPropagation(); const ws = [...(settings.workSites || [])]; const si2 = ws.findIndex(s => s.id === site.id); if (si2 < 0) return; const wks = [...(ws[si2].workers || [])]; const wi2 = wks.findIndex(ww => ww.id === w.id); if (wi2 < wks.length - 1) { [wks[wi2], wks[wi2+1]] = [wks[wi2+1], wks[wi2]]; ws[si2] = { ...ws[si2], workers: wks }; setSettings(prev => ({ ...prev, workSites: ws })); } }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>▼</button>
                        <button onClick={(e) => { e.stopPropagation(); setEditWorker({ siteId: site.id, workerId: w.id }); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); deleteW(); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 13, cursor: "pointer" }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
                {(site.workers || []).length === 0 && <div style={{ color: "#94A3B8", fontSize: 14, padding: "16px", textAlign: "center", border: "1px dashed #444", borderRadius: 10 }}>여기에 근무자를 드래그하세요</div>}
              </div>);
            })}
            {sites.length === 0 && <div style={{ padding: "12px 14px", color: "#94A3B8", fontSize: 12 }}>이 구역에 근무지가 없습니다. 구역설정에서 추가하세요.</div>}
          </div>);
        })}
      </Card>
    </div>}


    {tab === "gates" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>🚪 출입구 설정 (인파계수)</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>인파 계수를 위한 출입구를 등록합니다. 담당 계정을 지정하면 해당 계수원이 로그인 시 자동으로 배정됩니다.</p>
        {(settings.gates || []).map((g, i) => (
          <div key={g.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#66BB6A", fontWeight: 700, fontSize: 14 }}>🚪 {g.name || `출입구 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, gates: settings.gates.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>출입구명</Label><Input value={g.name} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, name: e.target.value }; setSettings({ ...settings, gates: gs }); }} placeholder="정문, 동문 등" /></div>
              <div><Label>담당자 이름</Label><Input value={g.assignee || ""} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, assignee: e.target.value }; setSettings({ ...settings, gates: gs }); }} placeholder="홍길동" /></div>
            </div>
            <div><Label>담당 계정</Label>
              <select value={g.accountId || ""} onChange={e => { const gs = [...settings.gates]; gs[i] = { ...g, accountId: e.target.value }; setSettings({ ...settings, gates: gs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>🗺️ 관리구역 설정 (혼잡도)</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>혼잡도 보고를 위한 관리구역을 설정합니다. 담당자가 구역별 혼잡 상태를 보고합니다.</p>
        {(settings.zones || []).map((z, i) => (
          <div key={z.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#42A5F5", fontWeight: 700, fontSize: 14 }}>📍 {z.name || `구역 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, zones: settings.zones.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>구역명</Label><Input value={z.name} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, name: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="A구역" /></div>
              <div><Label>구역범위</Label><Input value={z.range} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, range: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="동문~남문" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Label>담당자 이름</Label><Input value={z.assignee} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, assignee: e.target.value }; setSettings({ ...settings, zones: zs }); }} placeholder="홍길동" /></div>
              <div><Label>담당 계정</Label>
                <select value={z.accountId || ""} onChange={e => { const zs = [...settings.zones]; zs[i] = { ...z, accountId: e.target.value }; setSettings({ ...settings, zones: zs }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
                  <option value="">미지정</option>
                  {(accounts || []).filter(a => a.role === "counter" || a.role === "admin" || a.role === "manager").map(a => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                </select>
              </div>
            </div>
            {z.accountId && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(76,175,80,0.06)" }}>
              <span style={{ color: "#66BB6A", fontSize: 14 }}>✅ {z.accountId} 계정이 로그인하면 이 구역이 자동 선택됩니다</span>
            </div>}
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, zones: [...(settings.zones || []), { id: "z" + Date.now(), name: "", range: "", assignee: "", accountId: "", count: 0 }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #444", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>+ 구역 추가</button>
      </Card>
      <Card style={{ background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.12)" }}>
        <p style={{ color: "#42A5F5", fontSize: 13, margin: 0, lineHeight: 1.7 }}>ℹ️ 담당 계정을 지정하면 해당 계수원이 로그인 시 자동으로 배정 구역이 선택됩니다. 구역별 인원 합계가 전체 인파관리 수치로 집계됩니다.</p>
      </Card>
    </div>}

    {/* Workers Management */}
    {tab === "workers" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>👷 안전관리 근무자 명단</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>등록된 근무자는 조치사항 작성 시 담당자로 지정할 수 있습니다.</p>
        {(settings.workers || []).map((w, i) => (
          <div key={w.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 10, border: `1px solid ${w.role === "manager" ? "rgba(244,67,54,0.2)" : "rgba(255,152,0,0.15)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ padding: "3px 8px", borderRadius: 10, background: w.role === "manager" ? "rgba(244,67,54,0.15)" : "rgba(255,152,0,0.15)", color: w.role === "manager" ? "#EF5350" : "#FFA726", fontSize: 14, fontWeight: 700 }}>{w.role === "manager" ? "🔴 책임자" : "🟠 요원"}</span>
                <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 14 }}>{w.name || "이름 미입력"}</span>
              </div>
              <button onClick={() => setSettings({ ...settings, workers: settings.workers.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>이름</Label><Input value={w.name} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, name: e.target.value }; setSettings({ ...settings, workers: ws }); }} placeholder="홍길동" /></div>
              <div><Label>역할</Label><select value={w.role} onChange={e => { const ws = [...settings.workers]; ws[i] = { ...w, role: e.target.value }; setSettings({ ...settings, workers: ws }); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 10px" }}>📋 근무자 현황</h3>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 1fr 1fr", gap: 6, padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 6 }}>
            <span style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700 }}>역할</span>
            <span style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700 }}>이름</span>
            <span style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700 }}>연락처</span>
            <span style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700 }}>근무위치</span>
            <span style={{ color: "#94A3B8", fontSize: 14, fontWeight: 700 }}>임무</span>
          </div>
          {(settings.workers || []).map(w => (
            <div key={w.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr 80px 1fr 1fr", gap: 6, padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
              <span style={{ color: w.role === "manager" ? "#EF5350" : "#FFA726", fontSize: 14, fontWeight: 700 }}>{w.role === "manager" ? "책임자" : "요원"}</span>
              <span style={{ color: "#E2E8F0", fontSize: 13 }}>{w.name}</span>
              <span style={{ color: "#8892b0", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{w.phone}</span>
              <span style={{ color: "#8892b0", fontSize: 14 }}>{w.position || "-"}</span>
              <span style={{ color: "#8892b0", fontSize: 14 }}>{w.duty || "-"}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
          <span style={{ color: "#94A3B8", fontSize: 13 }}>책임자 {(settings.workers||[]).filter(w=>w.role==="manager").length}명 | 요원 {(settings.workers||[]).filter(w=>w.role==="staff").length}명 | 총 {(settings.workers||[]).length}명</span>
        </div>
      </Card>}
    </div>}

    {/* Parking Lot Management */}
    {tab === "parking" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🅿️ 주차장 관리</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>주차장을 등록하고, 계정관리에서 주차요원 계정을 생성한 뒤 주차장을 배정하세요.</p>
        {(settings.parkingLots || []).map((lot, i) => (
          <div key={lot.id} style={{ padding: 14, background: "rgba(156,39,176,0.04)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(156,39,176,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#AB47BC", fontWeight: 700, fontSize: 14 }}>🅿️ {lot.name || `주차장 ${i + 1}`}</span>
              <button onClick={() => setSettings({ ...settings, parkingLots: settings.parkingLots.filter((_, j) => j !== i) })} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>주차장 이름</Label><Input value={lot.name} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, name: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="제1주차장" /></div>
              <div><Label>가능 대수</Label><Input type="number" value={lot.capacity || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, capacity: parseInt(e.target.value) || 0 }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="200" /></div>
            </div>
            <div style={{ marginBottom: 8 }}><Label>주차장 주소</Label><Input value={lot.address || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, address: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="주소 입력" /></div>
            <div><Label>담당 주차요원 (계정 ID)</Label><Input value={lot.assigneeId || ""} onChange={e => { const ls = [...settings.parkingLots]; ls[i] = { ...lot, assigneeId: e.target.value }; setSettings({ ...settings, parkingLots: ls }); }} placeholder="parking1" /></div>
          </div>
        ))}
        <button onClick={() => setSettings({ ...settings, parkingLots: [...(settings.parkingLots || []), { id: "pk" + Date.now(), name: "", address: "", capacity: 100, current: 0, assigneeId: "" }] })} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #9C27B0", background: "transparent", color: "#AB47BC", fontSize: 13, cursor: "pointer" }}>+ 주차장 추가</button>
      </Card>
      {(settings.parkingLots || []).length > 0 && <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 10px" }}>📋 주차장 현황</h3>
        {(settings.parkingLots || []).map(lot => {
          const remain = lot.capacity - (lot.current || 0);
          const pct = lot.capacity > 0 ? ((lot.current || 0) / lot.capacity * 100) : 0;
          return <div key={lot.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 4 }}>
            <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700, minWidth: 80 }}>{lot.name}</span>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? "#EF5350" : pct >= 70 ? "#FFA726" : "#66BB6A", borderRadius: 3, transition: "width .5s" }} />
            </div>
            <span style={{ color: "#8892b0", fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>{lot.current || 0}/{lot.capacity}</span>
            <span style={{ color: remain <= 0 ? "#EF5350" : "#66BB6A", fontSize: 14, fontWeight: 700, minWidth: 45 }}>{remain <= 0 ? "만차" : `잔여${remain}`}</span>
          </div>;
        })}
      </Card>}
      <Card style={{ background: "rgba(156,39,176,0.04)", border: "1px solid rgba(156,39,176,0.12)" }}>
        <p style={{ color: "#AB47BC", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📍 셔틀버스 정류장</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>정류장을 순서대로 등록하세요. 셔틀요원이 정류장 도착 시 버튼을 눌러 위치를 업데이트합니다.</p>
        {(settings.shuttleStops || []).sort((a,b) => (a.order||0)-(b.order||0)).map((stop, i) => (
          <div key={stop.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,188,212,0.04)", borderRadius: 8, marginBottom: 4, border: "1px solid rgba(0,188,212,0.1)" }}>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: "#00BCD4", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i+1}</span>
            <Input value={stop.name} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, name: e.target.value}; setSettings({...settings, shuttleStops: ss}); }} placeholder="정류장명" style={{ flex: 1, padding: "8px 10px", fontSize: 13 }} />
            <Input type="number" value={stop.order||i+1} onChange={e => { const ss = [...(settings.shuttleStops||[])]; ss[ss.findIndex(s=>s.id===stop.id)] = {...stop, order: parseInt(e.target.value)||0}; setSettings({...settings, shuttleStops: ss}); }} style={{ width: 50, padding: "10px", fontSize: 14, textAlign: "center" }} />
            <button onClick={() => setSettings({...settings, shuttleStops: (settings.shuttleStops||[]).filter(s=>s.id!==stop.id)})} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>
        ))}
        <button onClick={() => { const ord = (settings.shuttleStops||[]).length + 1; setSettings({...settings, shuttleStops: [...(settings.shuttleStops||[]), {id: "st"+Date.now(), name: "", order: ord}]}); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px dashed #00BCD4", background: "transparent", color: "#00BCD4", fontSize: 13, cursor: "pointer", marginTop: 8 }}>+ 정류장 추가</button>
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🚌 셔틀버스 배차</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>버스를 등록하고, 계정관리에서 셔틀요원 계정을 만든 뒤 담당자를 배정하세요.</p>
        {(settings.shuttleBuses || []).map((bus, i) => (
          <div key={bus.id} style={{ padding: 14, background: "rgba(0,188,212,0.03)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(0,188,212,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#00BCD4", fontWeight: 700, fontSize: 14 }}>🚌 {bus.name || `버스 ${i+1}`}</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {bus.status && <span style={{ padding: "3px 8px", borderRadius: 10, background: bus.status==="running"?"rgba(76,175,80,0.15)":bus.status==="stopped"?"rgba(255,152,0,0.15)":"rgba(244,67,54,0.15)", color: bus.status==="running"?"#66BB6A":bus.status==="stopped"?"#FFA726":"#EF5350", fontSize: 13, fontWeight: 700 }}>{bus.status==="running"?"운행중":bus.status==="stopped"?"대기":"종료"}</span>}
                <button onClick={() => setSettings({...settings, shuttleBuses: settings.shuttleBuses.filter((_,j)=>j!==i)})} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><Label>버스명</Label><Input value={bus.name||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,name:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="1호차" /></div>
              <div><Label>노선명</Label><Input value={bus.route||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,route:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="축제장↔주차장" /></div>
              <div><Label>정원 (인승)</Label><select value={bus.capacity||45} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,capacity:parseInt(e.target.value)}; setSettings({...settings,shuttleBuses:bs}); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
                <option value={25}>25인승</option>
                <option value={45}>45인승</option>
              </select></div>
            </div>
            <div><Label>담당 셔틀요원 (계정 ID)</Label><Input value={bus.assigneeId||""} onChange={e => { const bs=[...(settings.shuttleBuses||[])]; bs[i]={...bus,assigneeId:e.target.value}; setSettings({...settings,shuttleBuses:bs}); }} placeholder="shuttle1" /></div>
            {bus.currentStopName && <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(0,188,212,0.06)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#00BCD4", fontSize: 13 }}>📍 {bus.currentStopName} ({bus.lastUpdated||""})</span>
              <span style={{ color: (bus.passengers||0)>=(bus.capacity||45)?"#EF5350":"#66BB6A", fontSize: 13, fontWeight: 700 }}>👥 {bus.passengers||0}/{bus.capacity||45}</span>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>👥 인파 현황</h3>
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
                <div style={{ color: "#66BB6A", fontSize: 32, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{curVal.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "center", padding: 16, borderRadius: 12, background: "rgba(33,150,243,0.06)", border: "1px solid rgba(33,150,243,0.15)" }}>
                <div style={{ color: "#8892b0", fontSize: 13 }}>📊 누적 방문</div>
                <div style={{ color: "#42A5F5", fontSize: 32, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{cumVal.toLocaleString()}</div>
              </div>
            </div>

            {/* 누적 수동 조정 */}
            <h4 style={{ color: "#E2E8F0", fontSize: 13, margin: "0 0 8px" }}>🔧 누적 방문객 수동 조정</h4>
            <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 10px" }}>오차 보정이나 초기값 설정 시 사용합니다.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <Input id="cum-adj" type="number" placeholder="숫자 입력 (예: 5000)" style={{ flex: 1 }} />
              <button onClick={() => { const v = parseInt(document.getElementById("cum-adj")?.value); if (!isNaN(v) && v >= 0) { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = v; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, v, cd.zones || [], "admin"); document.getElementById("cum-adj").value = ""; alert(`✅ 누적 방문객이 ${v.toLocaleString()}명으로 설정되었습니다.`); } else { alert("0 이상의 숫자를 입력하세요."); } }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>설정</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <button onClick={() => { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.cumulative = 0; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(cd.total || 0, 0, cd.zones || [], "admin"); alert("✅ 누적 초기화 완료"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>누적만 초기화 (0명)</button>
              <button onClick={() => { const cd = { total: 0, cumulative: 0, zones: (crowdData.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })) }; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(0, 0, cd.zones, "admin"); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0 } : c)); alert("✅ 전체 초기화 완료 (체류 + 누적)"); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.08)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>전체 초기화</button>
            </div>

            {/* 체류 수동 조정 */}
            <h4 style={{ color: "#E2E8F0", fontSize: 13, margin: "0 0 8px" }}>🔧 체류 인원 수동 조정</h4>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Input id="cur-adj" type="number" placeholder="현재 체류 인원 직접 설정" style={{ flex: 1 }} />
              <button onClick={() => { const v = parseInt(document.getElementById("cur-adj")?.value); if (!isNaN(v) && v >= 0) { const cd = JSON.parse(localStorage.getItem("_crowd") || "{}"); cd.total = v; localStorage.setItem("_crowd", JSON.stringify(cd)); if (window.crowdDB) window.crowdDB.set(v, cd.cumulative || 0, cd.zones || [], "admin"); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: v } : c)); document.getElementById("cur-adj").value = ""; alert(`✅ 체류 인원이 ${v.toLocaleString()}명으로 설정되었습니다.`); } }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4CAF50, #388E3C)", color: "#fff", boxShadow: "0 4px 12px rgba(76,175,80,0.3)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>설정</button>
            </div>

            {/* 구역별 누적 현황 */}
            {zoneData.filter(z => z.name).length > 0 && <>
              <h4 style={{ color: "#E2E8F0", fontSize: 13, margin: "0 0 8px" }}>🗺️ 구역별 현황</h4>
              <div style={{ display: "grid", gap: 4, marginBottom: 16 }}>
                {zoneData.filter(z => z.name).map(z => (
                  <div key={z.id} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                    <span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{z.name}</span>
                    <span style={{ color: "#66BB6A", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>체류 {(z.count || 0).toLocaleString()}</span>
                    <span style={{ color: "#42A5F5", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right", marginLeft: 8 }}>누적 {(z.cumulative || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>}
          </>);
        })()}
      </Card>

      {/* 시간별 추이 그래프 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>📈 시간별 추이</h3>
        {(() => {
          const hLog = settings.hourlyLog || [];
          if (hLog.length < 2) return <p style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", padding: 20 }}>데이터가 2건 이상 기록되면 그래프가 표시됩니다.<br/>(5분 간격 자동 기록)</p>;
          const chartData = hLog.slice(-60).map(h => ({ time: h.time, 체류: h.current || 0, 누적: h.cumulative || 0 }));
          return (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="time" tick={{ fill: "#556", fontSize: 14 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#556", fontSize: 14 }} width={45} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} />
                <Line type="monotone" dataKey="체류" stroke="#66BB6A" strokeWidth={2} dot={false} name="🏃 체류" />
                <Line type="monotone" dataKey="누적" stroke="#42A5F5" strokeWidth={2} dot={false} name="📊 누적" />
              </LineChart>
            </ResponsiveContainer>
          );
        })()}
      </Card>

      {/* 일자별 기록 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>📅 일자별 기록</h3>
        {(settings.dailyRecords || []).length === 0 ? <p style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", padding: 20 }}>인파계수 → 📊 데이터 관리 → 📋 금일 데이터 저장으로 기록합니다.</p> : <>
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
                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 14 }} />
                    <Line type="monotone" dataKey="누적방문" stroke="#42A5F5" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="최대체류" stroke="#FFA726" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null;
          })()}
          <div style={{ display: "grid", gap: 4 }}>
            {(settings.dailyRecords || []).map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{r.date}</span>
                <span style={{ color: "#42A5F5", fontSize: 14, fontWeight: 700, marginRight: 12 }}>누적 {(r.cumulative || 0).toLocaleString()}</span>
                <span style={{ color: "#FFA726", fontSize: 13 }}>최대 {(r.peakCurrent || 0).toLocaleString()}</span>
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
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 10px" }}>📋 근무유형 설정</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {(settings.workTypes || []).map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "rgba(156,39,176,0.08)", border: "1px solid rgba(156,39,176,0.15)" }}>
              <span style={{ color: "#E1BEE7", fontSize: 13 }}>{t}</span>
              <button onClick={() => setSettings(prev => ({ ...prev, workTypes: prev.workTypes.filter((_, j) => j !== i) }))} style={{ padding: 0, border: "none", background: "none", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input id="new-worktype" placeholder="새 유형 (예: 파견직)" style={{ flex: 1 }} />
          <button onClick={() => { const inp = document.getElementById("new-worktype"); if (inp?.value) { setSettings(prev => ({ ...prev, workTypes: [...(prev.workTypes || []), inp.value] })); inp.value = ""; } }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
      </Card>

      {/* 근무지 관리 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🏠 근무지 관리</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>근무지를 만들고 구역에 배치합니다. 드래그로 이동 가능.</p>
        {(settings.workSites || []).map((site, si) => (
          <div key={site.id} style={{ padding: 14, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 10 }}
            draggable onDragStart={e => e.dataTransfer.setData("siteId", site.id)}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.outline = "2px solid #2196F3"; }}
            onDragLeave={e => { e.currentTarget.style.outline = "none"; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.outline = "none"; const dragId = e.dataTransfer.getData("siteId"); if (dragId && dragId !== site.id) { const ws = [...(settings.workSites || [])]; const di = ws.findIndex(s => s.id === dragId); const ti = ws.findIndex(s => s.id === site.id); if (di >= 0 && ti >= 0) { const [item] = ws.splice(di, 1); ws.splice(ti, 0, item); setSettings(prev => ({ ...prev, workSites: ws })); } } }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ cursor: "grab", fontSize: 16 }}>⠿</span>
              <Input value={site.name} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, name: e.target.value }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="근무지명 (예: A구역 안내소)" style={{ flex: 1 }} />
              <select value={site.zoneId || ""} onChange={e => { const ws = [...(settings.workSites || [])]; ws[si] = { ...site, zoneId: e.target.value || null }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13, maxWidth: 120 }}>
                <option value="">구역 미지정</option>
                {(settings.zones || []).filter(z => z.name).map(z => <option key={z.id} value={z.id}>📍{z.name}</option>)}
              </select>
              <button onClick={() => setSettings(prev => ({ ...prev, workSites: prev.workSites.filter(s => s.id !== site.id) }))} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
            </div>

            {/* 근무자 목록 */}
            <div style={{ marginLeft: 20 }}>
              {(site.workers || []).map((w, wi) => (
                <div key={w.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}
                  draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("workerId", w.id); e.dataTransfer.setData("fromSite", site.id); }}>
                  <span style={{ cursor: "grab", fontSize: 12, color: "#94A3B8" }}>⠿</span>
                  <Input value={w.name} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, name: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="이름" style={{ width: 70 }} />
                  <Input value={w.phone || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, phone: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="연락처" style={{ width: 100 }} />
                  <select value={w.type || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, type: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 12 }}>
                    <option value="">유형</option>
                    {(settings.workTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input value={w.duty || ""} onChange={e => { const ws = [...(settings.workSites || [])]; const wk = [...(ws[si].workers || [])]; wk[wi] = { ...w, duty: e.target.value }; ws[si] = { ...ws[si], workers: wk }; setSettings(prev => ({ ...prev, workSites: ws })); }} placeholder="담당업무" style={{ flex: 1 }} />
                  <button onClick={() => { const ws = [...(settings.workSites || [])]; ws[si] = { ...ws[si], workers: (ws[si].workers || []).filter(ww => ww.id !== w.id) }; setSettings(prev => ({ ...prev, workSites: ws })); }} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>✕</button>
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
      {/* 매뉴얼 & 자동생성 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>📖</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#42A5F5", fontSize: 16, fontWeight: 700 }}>지역축제장 안전관리 매뉴얼</div>
            <div style={{ color: "#94A3B8", fontSize: 13 }}>행정안전부 2021 · 5단계 46항목</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => window.open("/safety-manual.pdf", "_blank")} style={{ padding: "14px", borderRadius: 10, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📖 매뉴얼 보기</button>
          <button onClick={() => {
            if (!confirm("매뉴얼 기반 체크리스트를 자동 생성합니다.\n기존 체크리스트가 초기화됩니다.")) return;
            const def = [
              { id: "cl_plan", title: "축제 계획 단계", category: "plan", items: [
                "안전관리계획 수립 및 심의 완료","행사장 위치 위험요인 검토","비상 대피경로 및 대피장소 확보",
                "안전관리 조직 구성 (총괄/부문별)","유관기관 비상연락체계 구축","안전관리비 확보 (전체비용 1% 이상)",
                "보험가입 (참가자/관람객/진행자)","안전관리인력 배치계획 수립","의료지원 계획 수립","교통 및 주차 대책 수립"
              ].map((t,i) => ({ id: "p"+i, text: t, checked: false, enabled: true })) },
              { id: "cl_pre", title: "축제 시작 전 (개장 전)", category: "pre", items: [
                "무대/구조물 안전점검 완료","전기시설 안전점검 (누전차단기 등)","가스시설 안전점검",
                "소화기/소방시설 비치 확인","비상방송 시스템 테스트","대피경로 안내판 설치 확인",
                "안전요원 배치 확인","의료진/구급장비 배치 확인","출입구 통제 시설 확인",
                "CCTV/통신장비 작동 확인","기상상황 확인 (폭우/강풍/폭염)","화장실/편의시설 점검",
                "비상차량 진입로 확보","안전관리요원 무전기/확성기 지급"
              ].map((t,i) => ({ id: "b"+i, text: t, checked: false, enabled: true })) },
              { id: "cl_dur", title: "축제 진행 중", category: "during", items: [
                "출입구 통제 인력 배치 확인","관람객 밀집도 수시 확인","안전관리요원 순찰 실시",
                "기상변화 모니터링","음향/조명 장비 상태 확인","비상대피 안내방송 준비",
                "화기취급 구역 안전관리","응급환자 발생 대비 의료진 대기","쓰레기 수거/위생 상태","주차장/교통 상황 점검"
              ].map((t,i) => ({ id: "d"+i, text: t, checked: false, enabled: true })) },
              { id: "cl_post", title: "축제 종료 시", category: "post", items: [
                "관람객 안전 퇴장 유도 완료","전기/가스 차단 확인","시설물 파손 여부 점검",
                "분실물 수거","안전관리 문제점 분석 기록","주차장 차량 소통 안전 관리"
              ].map((t,i) => ({ id: "e"+i, text: t, checked: false, enabled: true })) },
              { id: "cl_emer", title: "사고 발생 시 대응", category: "emergency", items: [
                "119/112 신고","관람객 대피 유도","사고현장 통제",
                "응급처치 실시","상급기관 보고","사고 수습 및 복구"
              ].map((t,i) => ({ id: "em"+i, text: t, checked: false, enabled: true })) },
            ];
            setSettings(prev => ({ ...prev, checklists: def }));
            alert("✅ 5개 카테고리, 46개 항목이 생성되었습니다.");
          }} style={{ padding: "14px", borderRadius: 10, border: "1px solid #4CAF50", background: "rgba(76,175,80,0.08)", color: "#66BB6A", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 자동 생성</button>
        </div>
      </Card>

      {/* 체크리스트 목록 */}
      {(settings.checklists || []).map((cl, ci) => {
        const enabledItems = cl.items.filter(i => i.enabled !== false);
        const done = enabledItems.filter(i => i.checked === "done" || i.checked === true).length;
        const fixCount = enabledItems.filter(i => i.checked === "fix").length;
        const total = enabledItems.length;
        const pct = total > 0 ? Math.round(done / total * 100) : 0;
        const catColors = { plan: "#AB47BC", pre: "#42A5F5", during: "#66BB6A", post: "#FFA726", emergency: "#EF5350" };
        const catLabels = { plan: "계획", pre: "시작 전", during: "진행 중", post: "종료", emergency: "사고대응" };
        const catColor = catColors[cl.category] || "#8892b0";
        return (<Card key={cl.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ padding: "6px 12px", borderRadius: 6, background: `${catColor}15`, color: catColor, fontSize: 13, fontWeight: 700 }}>{catLabels[cl.category] || cl.category}</span>
            <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: 0, flex: 1 }}>{cl.title}</h3>
            <span style={{ color: pct === 100 ? "#66BB6A" : catColor, fontSize: 16, fontWeight: 800 }}>{done}/{total}</span>
            {fixCount > 0 && <span style={{ color: "#FFA726", fontSize: 13, fontWeight: 700 }}>🔧{fixCount}</span>}
            <button onClick={() => { if (confirm(`"${cl.title}" 삭제?`)) setSettings(prev => ({ ...prev, checklists: prev.checklists.filter((_,j) => j !== ci) })); }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", marginBottom: 12 }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#66BB6A" : catColor, borderRadius: 3, transition: "width .3s" }} /></div>
          {cl.items.map((item, ii) => {
            const isOff = item.enabled === false;
            const status = item.checked === "done" ? "done" : item.checked === "fix" ? "fix" : item.checked === true ? "done" : item.checked ? item.checked : null;
            const stColor = status === "done" ? "#66BB6A" : status === "fix" ? "#FFA726" : null;
            const setItemStatus = (st) => {
              const cls = JSON.parse(JSON.stringify(settings.checklists || []));
              cls[ci].items[ii] = { ...cls[ci].items[ii], checked: status === st ? false : st, checkedBy: status === st ? "" : (session?.name || ""), checkedAt: status === st ? "" : new Date().toLocaleString("ko-KR") };
              setSettings(prev => ({ ...prev, checklists: cls }));
              if (status !== st) setSettings(prev => ({ ...prev, timeline: [...(prev.timeline || []), { id: "tl_" + Date.now(), time: new Date().toLocaleString("ko-KR"), type: "check", message: (st === "done" ? "✅ " : "🔧 ") + cl.title + ' - "' + item.text + '"', actor: session?.name }] }));
            };
            const toggleEnabled = () => {
              const cls = JSON.parse(JSON.stringify(settings.checklists || []));
              cls[ci].items[ii] = { ...cls[ci].items[ii], enabled: isOff };
              setSettings(prev => ({ ...prev, checklists: cls }));
            };
            return (<div key={item.id} style={{ padding: "12px", borderRadius: 10, background: isOff ? "rgba(255,255,255,0.01)" : status === "done" ? "rgba(76,175,80,0.04)" : status === "fix" ? "rgba(255,152,0,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${isOff ? "#1a1a2e" : status === "done" ? "rgba(76,175,80,0.2)" : status === "fix" ? "rgba(255,152,0,0.2)" : "#222"}`, marginBottom: 5, opacity: isOff ? 0.35 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: !isOff && !status ? 8 : 0 }}>
                {/* ON/OFF 토글 */}
                <div onClick={toggleEnabled} style={{ width: 32, height: 18, borderRadius: 9, background: isOff ? "#333" : "#66BB6A", position: "relative", cursor: "pointer", flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: isOff ? 2 : 16, transition: "all .3s" }} />
                </div>
                {/* 텍스트 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isOff ? "#445" : stColor || "#ccd6f6", fontSize: 14, fontWeight: 600, textDecoration: isOff ? "line-through" : "none" }}>{item.text}</div>
                  {item.checkedBy && <div style={{ color: "#94A3B8", fontSize: 12 }}>👤 {item.checkedBy} · {item.checkedAt} {status === "fix" ? "· 🔧보완필요" : ""}</div>}
                </div>
                {/* 상태 뱃지 */}
                {status === "done" && <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(76,175,80,0.15)", color: "#66BB6A", fontSize: 12, fontWeight: 700 }}>완료</span>}
                {status === "fix" && <span style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,152,0,0.15)", color: "#FFA726", fontSize: 12, fontWeight: 700 }}>보완</span>}
                {/* 수정/삭제 */}
                <button onClick={() => { const t = prompt("항목 수정:", item.text); if (t && t !== item.text) { const cls = JSON.parse(JSON.stringify(settings.checklists||[])); cls[ci].items[ii] = { ...item, text: t }; setSettings(prev => ({ ...prev, checklists: cls })); } }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✏️</button>
                <button onClick={() => { if (confirm("삭제?")) { const cls = JSON.parse(JSON.stringify(settings.checklists||[])); cls[ci].items.splice(ii, 1); setSettings(prev => ({ ...prev, checklists: cls })); } }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>🗑</button>
              </div>
              {/* 완료/보완 버튼 */}
              {!isOff && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setItemStatus("done")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: status === "done" ? "2px solid #4CAF50" : "1px solid #333", background: status === "done" ? "rgba(76,175,80,0.1)" : "transparent", color: "#66BB6A", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✅ 완료</button>
                <button onClick={() => setItemStatus("fix")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: status === "fix" ? "2px solid #FF9800" : "1px solid #333", background: status === "fix" ? "rgba(255,152,0,0.1)" : "transparent", color: "#FFA726", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔧 보완</button>
              </div>}
            </div>);
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Input id={`nci_${cl.id}`} placeholder="점검항목 추가..." style={{ flex: 1, fontSize: 14 }} />
            <button onClick={() => { const inp = document.getElementById(`nci_${cl.id}`); if (!inp?.value) return; const cls = [...(settings.checklists||[])]; cls[ci] = { ...cls[ci], items: [...cls[ci].items, { id: "ci_"+Date.now(), text: inp.value, checked: false, enabled: true }] }; setSettings(prev => ({ ...prev, checklists: [...cls] })); inp.value = ""; }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: catColor, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>+ 추가</button>
          </div>
        </Card>);
      })}

      {/* 체크리스트 추가 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>➕ 새 체크리스트</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <Input id="new_cl_title" placeholder="체크리스트 제목" style={{ flex: 1, fontSize: 14 }} />
          <select id="new_cl_cat" style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
            <option value="plan">계획</option><option value="pre">시작 전</option><option value="during">진행 중</option><option value="post">종료</option><option value="emergency">사고대응</option>
          </select>
          <button onClick={() => { const t = document.getElementById("new_cl_title"); const c = document.getElementById("new_cl_cat"); if (!t?.value) return; setSettings(prev => ({ ...prev, checklists: [...(prev.checklists||[]), { id: "cl_"+Date.now(), title: t.value, category: c.value, items: [] }] })); t.value = ""; }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>추가</button>
        </div>
      </Card>
      <button onClick={() => { if (confirm("모든 체크 초기화? (항목 유지)")) setSettings(prev => ({ ...prev, checklists: (prev.checklists||[]).map(cl => ({ ...cl, items: cl.items.map(i => ({ ...i, checked: false, checkedBy: "", checkedAt: "" })) })) })); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 14, cursor: "pointer", marginBottom: 8 }}>🔄 체크 초기화 (항목 유지)</button>
    </div>}


    {tab === "programs" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📥 엑셀 일괄 등록</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 12px" }}>양식 다운로드 → 작성 → 업로드</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => {
            const sample = [
              { 날짜: "2026-05-02", 시작시간: "09:00", 종료시간: "10:00", 프로그램명: "개막식", 장소: "주무대", 구분: "공식", 담당자: "홍길동", 연락처: "010-1234-5678", 내용: "개막 행사", 상시여부: "" },
              { 날짜: "2026-05-02", 시작시간: "13:00", 종료시간: "21:00", 프로그램명: "전통체험", 장소: "진주성", 구분: "체험", 담당자: "", 연락처: "", 내용: "", 상시여부: "Y" },
            ];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sample);
            ws["!cols"] = [{wch:12},{wch:10},{wch:10},{wch:25},{wch:15},{wch:8},{wch:10},{wch:15},{wch:30},{wch:8}];
            XLSX.utils.book_append_sheet(wb, ws, "프로그램");
            XLSX.writeFile(wb, "축제프로그램_양식.xlsx");
          }} style={{ padding: "12px", borderRadius: 10, border: "1px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📥 양식 다운로드</button>
          <label style={{ padding: "12px", borderRadius: 10, border: "1px solid #4CAF50", background: "rgba(76,175,80,0.08)", color: "#66BB6A", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
            📤 엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = (evt) => {
                try {
                  const wb = XLSX.read(evt.target.result, { type: "binary" });
                  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                  const catMap = {"공식":"O","공연":"P","체험":"E","부대":"S","부대행사":"S"};
                  const progs = rows.filter(r => r["프로그램명"]).map((r, i) => ({
                    id: "pg_u" + Date.now() + "_" + i,
                    title: r["프로그램명"] || "", date: r["상시여부"] === "Y" ? "always" : (r["날짜"] || ""),
                    time: String(r["시작시간"]||"").slice(0,5), endTime: String(r["종료시간"]||"").slice(0,5),
                    location: r["장소"] || "", category: catMap[r["구분"]] || r["구분"] || "",
                    manager: r["담당자"] || "", managerPhone: r["연락처"] || "", description: r["내용"] || "",
                  }));
                  if (!progs.length) { alert("데이터 없음"); return; }
                  setSettings(prev => ({ ...prev, programs: progs }));
                  alert(`✅ ${progs.length}개 프로그램 등록`);
                } catch (err) { alert("❌ " + err.message); }
              };
              reader.readAsBinaryString(file); e.target.value = "";
            }} style={{ display: "none" }} />
          </label>
        </div>
      </Card>

      {/* 수동 추가 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 12px" }}>➕ 프로그램 수동 추가</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div><Label>프로그램명 *</Label><Input id="pg-title" placeholder="개막식, 풍물놀이 등" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>구분 *</Label><select id="pg-cat" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
              <option value="O">🔷 공식</option><option value="P">🎵 공연</option><option value="E">🎨 체험</option><option value="S">🎪 부대</option>
            </select></div>
            <div><Label>일자</Label><select id="pg-date" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
              {(settings.festivalDates || []).map(d => { const dt = new Date(d); return <option key={d} value={d}>{dt.getMonth()+1}/{dt.getDate()}</option>; })}
              <option value="always">🔄 상시 (매일)</option>
            </select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>시작시간</Label><Input type="time" id="pg-time" /></div>
            <div><Label>종료시간</Label><Input type="time" id="pg-end" /></div>
          </div>
          <div><Label>장소</Label><Input id="pg-loc" placeholder="진주성 특설무대" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><Label>담당자</Label><Input id="pg-mgr" placeholder="이름" /></div>
            <div><Label>연락처</Label><Input id="pg-phone" placeholder="010-0000-0000" /></div>
          </div>
          <div><Label>프로그램 내용</Label><textarea id="pg-desc" placeholder="프로그램 상세 내용" rows={2} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>
          <button onClick={() => {
            const title = document.getElementById("pg-title")?.value;
            if (!title) { alert("프로그램명을 입력하세요."); return; }
            const pg = {
              id: "pg_" + Date.now(), title,
              category: document.getElementById("pg-cat")?.value || "S",
              date: document.getElementById("pg-date")?.value || (settings.festivalDates || [])[0] || "",
              time: document.getElementById("pg-time")?.value || "",
              endTime: document.getElementById("pg-end")?.value || "",
              location: document.getElementById("pg-loc")?.value || "",
              manager: document.getElementById("pg-mgr")?.value || "",
              managerPhone: document.getElementById("pg-phone")?.value || "",
              description: document.getElementById("pg-desc")?.value || "",
            };
            setSettings(prev => ({ ...prev, programs: [...(prev.programs || []), pg] }));
            document.getElementById("pg-title").value = "";
            document.getElementById("pg-loc").value = "";
            document.getElementById("pg-mgr").value = "";
            document.getElementById("pg-phone").value = "";
            document.getElementById("pg-desc").value = "";
            alert("✅ " + title + " 추가 완료");
          }} style={{ padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>🎭 프로그램 추가</button>
        </div>
      </Card>

      {/* 등록된 프로그램 목록 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: 0, flex: 1 }}>📋 등록 목록 ({(settings.programs||[]).length}개)</h3>
          <button onClick={() => {
            if (!(settings.programs||[]).length) return;
            const catMap = {"O":"공식","P":"공연","E":"체험","S":"부대"};
            const data = (settings.programs||[]).map(p => ({ 날짜: p.date === "always" ? "상시" : p.date, 시작시간: p.time, 종료시간: p.endTime, 프로그램명: p.title, 장소: p.location, 구분: catMap[p.category]||"", 담당자: p.manager||"", 연락처: p.managerPhone||"", 내용: p.description||"" }));
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "프로그램");
            XLSX.writeFile(wb, `프로그램_${settings.festivalName||"축제"}.xlsx`);
          }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 12, cursor: "pointer" }}>📥 내보내기</button>
        </div>
        {(settings.programs || []).sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.time||"").localeCompare(b.time||"")).map((pg) => {
          const catMap = { O: { l: "공식", c: "#42A5F5" }, P: { l: "공연", c: "#E91E63" }, E: { l: "체험", c: "#66BB6A" }, S: { l: "부대", c: "#FFA726" } };
          const cat = catMap[pg.category] || { l: pg.category, c: "#556" };
          const dateLabel = pg.date === "always" ? "🔄상시" : pg.date ? new Date(pg.date).getMonth()+1 + "/" + new Date(pg.date).getDate() : "";
          const stLabel = pg.pgStatus === "delayed" ? "⏱지연" : pg.pgStatus === "ended" ? "종료" : "";
          const isEditing = editPgId === pg.id;
          const upPg = (field, val) => setSettings(prev => ({ ...prev, programs: prev.programs.map(p => p.id === pg.id ? { ...p, [field]: val } : p) }));

          if (isEditing) {
            return (<div key={pg.id} style={{ padding: "16px", borderRadius: 12, background: "rgba(156,39,176,0.04)", border: "2px solid rgba(156,39,176,0.2)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>✏️</span>
                <h4 style={{ color: "#E1BEE7", fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>프로그램 수정</h4>
                <button onClick={() => setEditPgId(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>닫기 ✕</button>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div><Label>프로그램명</Label><Input value={pg.title} onChange={e => upPg("title", e.target.value)} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><Label>구분</Label><select value={pg.category || ""} onChange={e => upPg("category", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                    <option value="O">🔷 공식</option><option value="P">🎵 공연</option><option value="E">🎨 체험</option><option value="S">🎪 부대</option>
                  </select></div>
                  <div><Label>일자</Label><select value={pg.date || ""} onChange={e => upPg("date", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }}>
                    {(settings.festivalDates || []).map(d => { const dt = new Date(d); return <option key={d} value={d}>{dt.getMonth()+1}/{dt.getDate()}</option>; })}
                    <option value="always">🔄 상시</option>
                  </select></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><Label>시작시간</Label><Input type="time" value={pg.time || ""} onChange={e => upPg("time", e.target.value)} /></div>
                  <div><Label>종료시간</Label><Input type="time" value={pg.endTime || ""} onChange={e => upPg("endTime", e.target.value)} /></div>
                </div>
                <div><Label>장소</Label><Input value={pg.location || ""} onChange={e => upPg("location", e.target.value)} placeholder="진주성 특설무대" /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><Label>담당자</Label><Input value={pg.manager || ""} onChange={e => upPg("manager", e.target.value)} /></div>
                  <div><Label>연락처</Label><Input value={pg.managerPhone || ""} onChange={e => upPg("managerPhone", e.target.value)} /></div>
                </div>
                <div><Label>프로그램 내용</Label><textarea value={pg.description || ""} onChange={e => upPg("description", e.target.value)} rows={2} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} /></div>
                <button onClick={() => setEditPgId(null)} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #9C27B0, #7B1FA2)", color: "#fff", boxShadow: "0 4px 12px rgba(156,39,176,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>✅ 수정 완료</button>
              </div>
            </div>);
          }

          return (<div key={pg.id} style={{ padding: "12px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 50, textAlign: "center" }}>
                <div style={{ color: "#8892b0", fontSize: 12 }}>{dateLabel}</div>
                <div style={{ color: "#E2E8F0", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{pg.time || "--:--"}</div>
              </div>
              <span style={{ padding: "3px 8px", borderRadius: 6, background: `${cat.c}15`, color: cat.c, fontSize: 12, fontWeight: 700 }}>{cat.l}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{pg.title}</div>
                <div style={{ color: "#94A3B8", fontSize: 12 }}>{pg.location ? "📍"+pg.location : ""} {pg.manager ? "👤"+pg.manager : ""}</div>
              </div>
              {stLabel && <span style={{ color: pg.pgStatus === "delayed" ? "#FFA726" : "#556", fontSize: 12, fontWeight: 700 }}>{stLabel}</span>}
              <button onClick={() => setEditPgId(pg.id)} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #9C27B0", background: "rgba(156,39,176,0.08)", color: "#E1BEE7", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✏️</button>
              <button onClick={() => { if (confirm(`"${pg.title}" 삭제?`)) setSettings(prev => ({ ...prev, programs: prev.programs.filter(p => p.id !== pg.id) })); }} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>🗑</button>
            </div>
          </div>);
        })}
      </Card>
      <button onClick={() => { if (confirm("프로그램 전체 초기화?")) setSettings(prev => ({ ...prev, programs: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 13, cursor: "pointer" }}>🔄 프로그램 초기화</button>
    </div>}


    {tab === "medical" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 10px" }}>🏥 응급환자 기록</h3>
        <button onClick={() => setSettings(prev => ({ ...prev, medicalRecords: [{ id: "med_"+Date.now(), time: new Date().toLocaleString("ko-KR"), location: "", symptoms: "", action: "", status: "treating", patient: "", responder: session?.name || "" }, ...(prev.medicalRecords||[])] }))} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>🆘 응급환자 발생 등록</button>
        {(settings.medicalRecords || []).map((mr, mi) => {
          const stMap = { treating: { label: "치료중", color: "#FFA726" }, transferred: { label: "이송완료", color: "#42A5F5" }, discharged: { label: "귀가", color: "#66BB6A" } };
          const mst = stMap[mr.status] || stMap.treating;
          const upMed = (field, val) => { const m = [...(settings.medicalRecords||[])]; m[mi] = { ...mr, [field]: val }; setSettings(prev => ({ ...prev, medicalRecords: m })); };
          return (<div key={mr.id} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${mst.color}33`, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ color: "#EF5350", fontSize: 14, fontWeight: 700 }}>🏥 #{mi+1}</span>
              <span style={{ color: "#94A3B8", fontSize: 12, flex: 1 }}>{mr.time}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(stMap).map(([k, v]) => (
                  <button key={k} onClick={() => { upMed("status", k); if (k !== mr.status) setSettings(prev => ({ ...prev, timeline: [...(prev.timeline||[]), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "medical", message: `🏥 응급환자 #${mi+1} → ${v.label}`, actor: session?.name }] })); }} style={{ padding: "6px 10px", borderRadius: 6, border: mr.status === k ? `2px solid ${v.color}` : "1px solid #333", background: mr.status === k ? `${v.color}15` : "transparent", color: v.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{v.label}</button>
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
              <span style={{ color: "#94A3B8", fontSize: 12 }}>담당: {mr.responder}</span>
              <button onClick={() => { if (confirm("이 기록을 삭제하시겠습니까?")) setSettings(prev => ({ ...prev, medicalRecords: prev.medicalRecords.filter((_,i)=>i!==mi) })); }} style={{ marginLeft: "auto", padding: "3px 8px", borderRadius: 4, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>삭제</button>
            </div>
          </div>);
        })}
        {(settings.medicalRecords||[]).length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>응급환자 기록이 없습니다.</div>}
      </Card>
      <button onClick={() => { if (confirm("모든 의료기록을 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, medicalRecords: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 13, cursor: "pointer" }}>🔄 의료기록 초기화</button>
    </div>}

    {/* 상황일지 */}
    {tab === "timeline" && <div>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: 0, flex: 1 }}>📋 상황일지</h3>
          <span style={{ color: "#94A3B8", fontSize: 13 }}>{(settings.timeline||[]).length}건</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Input id="tl_manual" placeholder="수동 기록 입력" style={{ flex: 1 }} />
          <button onClick={() => { const inp = document.getElementById("tl_manual"); if (!inp?.value) return; setSettings(prev => ({ ...prev, timeline: [...(prev.timeline||[]), { id: "tl_"+Date.now(), time: new Date().toLocaleString("ko-KR"), type: "manual", message: inp.value, actor: session?.name }] })); inp.value = ""; }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>기록</button>
        </div>
        {(settings.timeline || []).slice().reverse().map(tl => {
          const typeIcon = { check: "✅", emergency: "🚨", medical: "🏥", request: "📨", manual: "📝", congestion: "🚦", status: "📊" }[tl.type] || "📌";
          const typeColor = { emergency: "#EF5350", medical: "#FFA726", manual: "#42A5F5" }[tl.type] || "#8892b0";
          return (<div key={tl.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ width: 70, flexShrink: 0, textAlign: "right" }}><div style={{ color: "#94A3B8", fontSize: 12 }}>{tl.time?.split(" ")[0]}</div><div style={{ color: "#8892b0", fontSize: 12, fontWeight: 700 }}>{tl.time?.split(" ")[1]}</div></div>
            <div style={{ width: 3, background: typeColor, borderRadius: 2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#E2E8F0", fontSize: 13 }}>{typeIcon} {tl.message}</div>
              {tl.actor && <div style={{ color: "#94A3B8", fontSize: 12 }}>👤 {tl.actor}</div>}
            </div>
          </div>);
        })}
        {(settings.timeline||[]).length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8" }}>기록이 없습니다.</div>}
      </Card>
      <button onClick={() => { if (confirm("상황일지를 초기화하시겠습니까?")) setSettings(prev => ({ ...prev, timeline: [] })); }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 13, cursor: "pointer" }}>🔄 상황일지 초기화</button>
    </div>}

    {tab === "custom" && <Card><h3 style={{ color: "#E2E8F0", fontSize: 15, margin: "0 0 14px" }}>➕ 항목 추가</h3><div style={{ display: "grid", gap: 10 }}>{[{ l: "항목명", k: "name" }, { l: "단위", k: "unit" }, { l: "아이콘", k: "icon" }].map(f => (<div key={f.k}><Label>{f.l}</Label><Input value={newCat[f.k]} onChange={e => setNewCat({ ...newCat, [f.k]: e.target.value })} /></div>))}<div><Label>기상청 카테고리</Label><select value={newCat.kmaCategory || ""} onChange={e => setNewCat({ ...newCat, kmaCategory: e.target.value })} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff" }}><option value="">없음</option>{Object.entries(KMA_CODES).map(([code, info]) => <option key={code} value={code}>{code} — {info.name}</option>)}</select></div>{Object.entries(LEVELS).map(([lk, lv]) => (<div key={lk} style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: lv.color, fontSize: 13, fontWeight: 700, minWidth: 36 }}>{lv.label}</span><input type="number" value={newCat.thresholds[lk][0]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [parseFloat(e.target.value) || 0, t[lk][1]]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} /><span style={{ color: "#444" }}>~</span><input type="text" value={newCat.thresholds[lk][1] === Infinity ? "∞" : newCat.thresholds[lk][1]} onChange={e => { const t = { ...newCat.thresholds }; t[lk] = [t[lk][0], e.target.value === "∞" ? Infinity : parseFloat(e.target.value) || 0]; setNewCat({ ...newCat, thresholds: t }); }} style={{ width: 65, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} /></div>))}<button onClick={() => { if (!newCat.name) return; setCategories(p => [...p, { ...newCat, id: "c_" + Date.now(), source: newCat.kmaCategory ? "api" : "manual" }]); }} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>추가</button></div></Card>}

    {/* Settings */}
    {tab === "settings" && <div>
      {/* 축제 기본정보 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div onClick={() => { const e = prompt("로고 이모지:", settings.logoEmoji); if (e) setSettings({ ...settings, logoEmoji: e }); }} style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(156,39,176,0.1)", border: "2px solid rgba(156,39,176,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, cursor: "pointer", flexShrink: 0 }}>{settings.logoEmoji || "🏮"}</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ color: "#E2E8F0", fontSize: 18, margin: "0 0 2px", fontWeight: 800 }}>🎪 축제 기본정보</h3>
            <p style={{ color: "#94A3B8", fontSize: 12, margin: 0 }}>로고를 터치하면 이모지를 변경할 수 있습니다</p>
          </div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>축제명 *</Label><Input value={settings.festivalName} onChange={e => setSettings({ ...settings, festivalName: e.target.value })} placeholder="제25회 진주논개제" style={{ fontSize: 16, fontWeight: 700 }} /></div>
          <div><Label>부제목</Label><Input value={settings.festivalSubtitle} onChange={e => setSettings({ ...settings, festivalSubtitle: e.target.value })} placeholder="축제 안전관리시스템" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>관리기관</Label><Input value={settings.organization} onChange={e => setSettings({ ...settings, organization: e.target.value })} placeholder="진주시청" /></div>
            <div><Label>대표 연락처</Label><Input value={settings.contactNumber} onChange={e => setSettings({ ...settings, contactNumber: e.target.value })} placeholder="055-000-0000" /></div>
          </div>
        </div>
      </Card>

      {/* 운영 일정 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 18, margin: "0 0 4px", fontWeight: 800 }}>📅 운영 일정</h3>
        <p style={{ color: "#94A3B8", fontSize: 12, margin: "0 0 16px" }}>축제 운영 기간과 시간을 설정합니다</p>

        {/* 일자 등록 */}
        <div style={{ marginBottom: 16 }}>
          <Label>축제 일자</Label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <Input type="date" id="fest-date-start" style={{ flex: 1 }} />
            <span style={{ color: "#94A3B8", fontSize: 14, alignSelf: "center" }}>~</span>
            <Input type="date" id="fest-date-end" style={{ flex: 1 }} />
            <button onClick={() => {
              const s = document.getElementById("fest-date-start")?.value;
              const e = document.getElementById("fest-date-end")?.value;
              if (!s) { const d = document.getElementById("fest-date-start")?.value; if (d && !(settings.festivalDates||[]).includes(d)) setSettings({...settings, festivalDates: [...(settings.festivalDates||[]), d].sort()}); return; }
              const dates = [];
              let cur = new Date(s);
              const end = e ? new Date(e) : cur;
              while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
              const merged = [...new Set([...(settings.festivalDates||[]), ...dates])].sort();
              setSettings({...settings, festivalDates: merged});
            }} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>추가</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(settings.festivalDates || []).map((d, i) => {
              const dt = new Date(d); const dayNames = ["일","월","화","수","목","금","토"];
              const isToday = d === new Date().toISOString().slice(0, 10);
              return <div key={d} style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 10, background: isToday ? "rgba(76,175,80,0.1)" : "rgba(33,150,243,0.06)", border: isToday ? "1.5px solid rgba(76,175,80,0.3)" : "1px solid rgba(33,150,243,0.12)" }}>
                <span style={{ color: isToday ? "#66BB6A" : "#42A5F5", fontSize: 14, fontWeight: 700 }}>{i+1}일차</span>
                <span style={{ color: "#E2E8F0", fontSize: 14 }}>{dt.getMonth()+1}/{dt.getDate()}</span>
                <span style={{ color: "#94A3B8", fontSize: 12 }}>({dayNames[dt.getDay()]})</span>
                {isToday && <span style={{ color: "#66BB6A", fontSize: 12, fontWeight: 700 }}>오늘</span>}
                <button onClick={() => setSettings({...settings, festivalDates: (settings.festivalDates||[]).filter(x => x !== d)})} style={{ padding: "3px 8px", borderRadius: 4, border: "none", background: "transparent", color: "#a33", fontSize: 12, cursor: "pointer", marginLeft: 4 }}>✕</button>
              </div>;
            })}
          </div>
          {(settings.festivalDates||[]).length === 0 && <div style={{ padding: 12, color: "#94A3B8", fontSize: 13, textAlign: "center" }}>날짜를 추가하세요 (시작~종료일 범위 또는 개별 추가)</div>}
        </div>

        {/* 운영 시간 */}
        <div style={{ padding: "16px", borderRadius: 12, background: "rgba(33,150,243,0.04)", border: "1px solid rgba(33,150,243,0.1)" }}>
          <Label>일일 운영시간</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <Input type="time" value={settings.operatingStart} onChange={e => setSettings({...settings, operatingStart: e.target.value})} style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }} />
            <span style={{ color: "#94A3B8", fontSize: 16 }}>~</span>
            <Input type="time" value={settings.operatingEnd} onChange={e => setSettings({...settings, operatingEnd: e.target.value})} style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Toggle on={settings.is24HourMode} onToggle={() => setSettings({...settings, is24HourMode: !settings.is24HourMode})} labelOn="🔒 24시간 감시 모드" labelOff="설정 시간 운영" />
          </div>
        </div>

        {/* 저장된 일자별 데이터 */}
        {(settings.dailyRecords || []).length > 0 && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ color: "#8892b0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📋 일자별 누적 데이터</div>
          {(settings.dailyRecords || []).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: i % 2 ? "transparent" : "rgba(255,255,255,0.02)", borderRadius: 6 }}>
              <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{r.date}</span>
              <span style={{ color: "#42A5F5", fontSize: 14 }}>누적 {(r.cumulative||0).toLocaleString()}명</span>
              <span style={{ color: "#66BB6A", fontSize: 13 }}>최대 {(r.peakCurrent||0).toLocaleString()}</span>
            </div>
          ))}
        </div>}
      </Card>

      {/* 위치 + 면적 */}
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 18, margin: "0 0 4px", fontWeight: 800 }}>📍 행사장 위치</h3>
        <p style={{ color: "#94A3B8", fontSize: 12, margin: "0 0 14px" }}>기상청 API 연동에 사용됩니다</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <button onClick={autoLocate} disabled={locLoading} style={{ padding: "14px", borderRadius: 10, border: loc.mode === "auto" ? "2px solid #4CAF50" : "1px solid #333", background: loc.mode === "auto" ? "rgba(76,175,80,0.08)" : "transparent", color: loc.mode === "auto" ? "#66BB6A" : "#8892b0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{locLoading ? "📡 확인 중..." : "📡 자동 위치"}</button>
          <button onClick={() => setSettings({...settings, location: {...loc, mode: "manual"}})} style={{ padding: "14px", borderRadius: 10, border: loc.mode === "manual" ? "2px solid #FF9800" : "1px solid #333", background: loc.mode === "manual" ? "rgba(255,152,0,0.08)" : "transparent", color: loc.mode === "manual" ? "#FFA726" : "#8892b0", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>✏️ 수동 입력</button>
        </div>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <div><Label>위치명</Label><Input value={loc.name||""} onChange={e => setSettings({...settings, location: {...loc, name: e.target.value, mode: "manual"}})} placeholder="진주성" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>위도</Label><Input type="number" step="0.0001" value={loc.lat||""} onChange={e => setSettings({...settings, location: {...loc, lat: parseFloat(e.target.value)||0, mode: "manual"}})} /></div>
            <div><Label>경도</Label><Input type="number" step="0.0001" value={loc.lon||""} onChange={e => setSettings({...settings, location: {...loc, lon: parseFloat(e.target.value)||0, mode: "manual"}})} /></div>
          </div>
        </div>
        <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", marginBottom: 14, fontSize: 13, color: "#94A3B8" }}>📍 {loc.name} ({loc.lat?.toFixed(4)}, {loc.lon?.toFixed(4)}) — {loc.mode === "auto" ? "자동" : "수동"} | 격자: nx={grid.nx}, ny={grid.ny}</div>

        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 8px", fontWeight: 700 }}>📐 행사장 면적</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <Input type="number" value={settings.venueArea} onChange={e => setSettings({...settings, venueArea: parseFloat(e.target.value)||0})} style={{ width: 140, fontSize: 18, fontWeight: 700 }} />
          <span style={{ color: "#8892b0", fontSize: 14 }}>㎡</span>
          <span style={{ color: "#94A3B8", fontSize: 13 }}>= {(settings.venueArea * 0.3025).toFixed(0)}평</span>
        </div>
        <button onClick={() => { const t = calcCrowdThr(settings.venueArea); setCategories(p => p.map(c => c.id === "crowd" ? { ...c, thresholds: t } : c)); alert("✅ 인파 기준 자동 적용 완료"); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 면적 기반 인파 기준 자동 적용</button>
      </Card>



      {/* 🔄 Supabase 동기화 설정 */}
      <SupabaseSyncCard />

      {/* PWA 설치 */}
      <Card style={{ background: "linear-gradient(135deg, rgba(66,165,245,0.08), rgba(66,165,245,0.02))", border: "1px solid rgba(66,165,245,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, rgba(66,165,245,0.25), rgba(66,165,245,0.05))", border: "1px solid rgba(66,165,245,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg viewBox="0 0 64 64" width="26" height="26" fill="none">
              <path d="M32 4L8 14V30C8 44 18 56 32 60C46 56 56 44 56 30V14L32 4Z" stroke="#42A5F5" strokeWidth="2.5" fill="rgba(66,165,245,0.1)"/>
              <path d="M22 32L29 39L42 24" stroke="#42A5F5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>SAFEFLOW 앱 설치</div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>홈 화면에서 빠르게 실행</div>
          </div>
          <button onClick={() => { if (window.installPWA) window.installPWA(); else alert("브라우저 메뉴에서 '홈 화면에 추가' 또는 '앱 설치'를 선택하세요."); }} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #42A5F5, #1976D2)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📥 설치</button>
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.04)", color: "#94A3B8", fontSize: 12, lineHeight: 1.5 }}>
          <strong style={{ color: "#CBD5E1" }}>📱 모바일 설치 방법:</strong><br/>
          • <strong style={{ color: "#42A5F5" }}>iOS Safari</strong>: 공유 → 홈 화면에 추가<br/>
          • <strong style={{ color: "#42A5F5" }}>Android Chrome</strong>: 메뉴 → 앱 설치
        </div>
      </Card>

      {/* 앱 업데이트 */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📲</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>{updateAvailable ? "새 버전 준비됨" : "최신 버전"}</div>
            <div style={{ color: "#94A3B8", fontSize: 12 }}>대시보드 상단에서도 확인 가능</div>
          </div>
          <button onClick={() => {
            if (updateAvailable) {
              const o = document.createElement("div");
              o.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999"><div style="width:40px;height:40px;border:3px solid #333;border-top:3px solid #2196F3;border-radius:50%;animation:spin 1s linear infinite"></div><div style="color:#ccd6f6;margin-top:16px;font-size:16px;font-weight:700">업데이트 중...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
              document.body.appendChild(o);
              setTimeout(() => { if (window.applySwUpdate) window.applySwUpdate(); else window.location.reload(); }, 500);
            } else {
              navigator.serviceWorker?.getRegistration().then(r => { if (r) r.update().then(() => setTimeout(() => alert("✅ 최신 버전입니다."), 2000)); }).catch(() => alert("✅ 최신 버전입니다."));
            }
          }} style={{ padding: "10px 20px", borderRadius: 10, border: updateAvailable ? "none" : "1px solid #333", background: updateAvailable ? "#42A5F5" : "transparent", color: updateAvailable ? "#fff" : "#8892b0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{updateAvailable ? "🔄 업데이트" : "🔍 확인"}</button>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>💾 설정 저장 / 불러오기</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>축제 설정 전체를 파일로 저장하고 다시 불러올 수 있습니다.</p>
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
          <button onClick={() => document.getElementById("settings-upload").click()} style={{ padding: "14px", borderRadius: 10, border: "1.5px solid #FF9800", background: "rgba(255,152,0,0.08)", color: "#FFA726", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
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
        <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.7 }}>저장 항목: 축제명, 운영시간, 위치, 순면적, 기상청API, SMS, 구역, 근무자, 주차장, 계정정보, 모니터링항목, 대시보드 표시설정</span>
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#EF5350", fontSize: 16, margin: "0 0 4px" }}>🔄 데이터 초기화</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>운영 중 수동 입력된 데이터를 항목별로 초기화합니다. 설정은 유지됩니다.</p>
        <div style={{ display: "grid", gap: 8 }}>

          <button onClick={() => { if (confirm("인파관리 데이터를 초기화하시겠습니까?\n현재 인원수가 0으로 리셋됩니다.")) { setCategories(p => p.map(c => c.id === "crowd" ? { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null } : c)); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })) })); if (window.crowdDB) window.crowdDB.set(0, 0, (settings.zones || []).map(z => ({ ...z, count: 0, cumulative: 0 })), "reset"); onDataReset?.(); alert("✅ 인파관리 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#EF5350", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            👥 인파관리 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>전체 인원 + 구역별 인원 → 0</span>
          </button>

          <button onClick={() => { if (confirm("주차장 현황을 초기화하시겠습니까?\n모든 주차장의 현재 대수가 0으로 리셋됩니다.")) { setSettings(prev => ({ ...prev, parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })) })); onDataReset?.(); alert("✅ 주차장 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#EF5350", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🅿️ 주차장 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>모든 주차장 현재 대수 → 0</span>
          </button>

          <button onClick={() => { if (confirm("메시지 및 공지를 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, messages: [], notices: [] })); alert("✅ 메시지/공지 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#EF5350", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            💬 메시지/공지 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>발송이력 + 대시보드 공지 삭제</span>
          </button>

          <button onClick={() => { if (confirm("알림 이력을 모두 삭제하시겠습니까?")) { setAlerts([]); alert("✅ 알림 이력 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#EF5350", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            🔔 알림 이력 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>경보 알림 이력 전체 삭제</span>
          </button>

          <button onClick={() => { if (confirm("조치사항 이력을 모두 삭제하시겠습니까?")) { setSettings(prev => ({ ...prev, resolvedHistory: [] })); setCategories(p => p.map(c => ({ ...c, actionStatus: null, actionReport: null }))); alert("✅ 조치사항 초기화 완료"); }}} style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(244,67,54,0.2)", background: "rgba(244,67,54,0.05)", color: "#EF5350", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
            📋 조치사항 초기화 <span style={{ color: "#888", fontSize: 14, marginLeft: 8 }}>지시/조치 이력 + 진행상태 삭제</span>
          </button>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, marginTop: 4 }}>
            <button onClick={() => { if (confirm("⚠️ 모든 운영 데이터를 초기화하시겠습니까?\n\n인파, 주차장, 메시지, 알림, 조치사항이 모두 리셋됩니다.\n(설정/계정/구역/근무자/기상데이터는 유지)")) { setCategories(p => p.map(c => { if (c.id === "crowd") return { ...c, currentValue: 0, history: [], actionStatus: null, actionReport: null }; return { ...c, actionStatus: null, actionReport: null }; })); setSettings(prev => ({ ...prev, zones: (prev.zones || []).map(z => ({ ...z, count: 0 })), parkingLots: (prev.parkingLots || []).map(l => ({ ...l, current: 0 })), messages: [], notices: [], resolvedHistory: [] })); setAlerts([]); if (window.crowdDB) window.crowdDB.set(0, 0, [], "reset"); onDataReset?.(); alert("✅ 전체 운영 데이터 초기화 완료\n(기상 실황/예보 데이터는 유지됩니다)"); }}} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "2px solid #F44336", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ⚠️ 전체 초기화 (운영 데이터 일괄 리셋)
            </button>
          </div>
        </div>
      </Card>
    </div>}
    {/* 대시보드 관리 */}
    {tab === "navmgmt" && <div>
      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🔌 기능 ON/OFF</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>사용하지 않는 기능을 끄면 메뉴와 대시보드에서 숨겨집니다.</p>
        {[
          { group: "👥 인파/안전", items: [
            { k: "crowd", icon: "👥", label: "인파관리 (계수/출입구)" },
            { k: "congestion", icon: "🚦", label: "인파혼잡도" },
            { k: "heatmap", icon: "🗺️", label: "히트맵 지도 (2.0)" },
            { k: "checklist", icon: "✅", label: "안전점검 체크리스트" },
            { k: "emergency", icon: "🚨", label: "긴급상황 발령" },
            { k: "medical", icon: "🏥", label: "의료/응급 기록" },
          ]},
          { group: "🎪 축제운영", items: [
            { k: "parking", icon: "🅿️", label: "주차관리" },
            { k: "shuttle", icon: "🚌", label: "셔틀버스" },
            { k: "program", icon: "🎭", label: "축제 프로그램" },
            { k: "stage", icon: "🎤", label: "공연관리" },
            { k: "assets", icon: "📦", label: "물자 관리 (2.0)" },
            { k: "timeline", icon: "📋", label: "상황일지" },
          ]},
          { group: "👤 인력/위치", items: [
            { k: "location", icon: "📍", label: "위치 워키토키 (2.0)" },
            { k: "workers", icon: "👥", label: "근무자 관리 (2.1)" },
            { k: "shifts", icon: "📝", label: "근무일지/교대 (2.1)" },
          ]},
          { group: "📊 자동화/생산성", items: [
            { k: "reports", icon: "📄", label: "보고서 자동생성 (2.1)" },
            { k: "qrcode", icon: "🔑", label: "QR코드 관리 (2.1)" },
            { k: "smartAlert", icon: "🔔", label: "스마트 알림 (2.1)" },
          ]},
          { group: "📡 데이터/연동", items: [
            { k: "weather", icon: "🌤️", label: "기상청 연동" },
            { k: "sms", icon: "📱", label: "SMS 알림" },
            { k: "message", icon: "💬", label: "메시지/공지" },
            { k: "customApi", icon: "🔌", label: "커스텀 API" },
          ]},
        ].map(g => (<div key={g.group} style={{ marginBottom: 12 }}>
          <div style={{ color: "#8892b0", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{g.group}</div>
          {g.items.map(f => {
            const on = settings.features?.[f.k] !== false;
            return (<div key={f.k} onClick={() => setSettings({ ...settings, features: { ...(settings.features || {}), [f.k]: !on } })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: on ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.01)", borderRadius: 8, marginBottom: 3, cursor: "pointer", border: `1px solid ${on ? "rgba(76,175,80,0.12)" : "#1a1a2e"}` }}>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#66BB6A" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: on ? 18 : 2, transition: "all .3s" }} />
              </div>
              <span style={{ fontSize: 16 }}>{f.icon}</span>
              <span style={{ color: on ? "#ccd6f6" : "#556", fontSize: 13, fontWeight: 700, flex: 1 }}>{f.label}</span>
              <span style={{ color: on ? "#66BB6A" : "#EF5350", fontSize: 12, fontWeight: 700 }}>{on ? "ON" : "OFF"}</span>
            </div>);
          })}
        </div>))}
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>🔄 데이터 개별 초기화</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>각 기능의 데이터를 개별적으로 초기화합니다.</p>
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
            <button key={r.label} onClick={() => { if (confirm(`${r.label} 데이터를 초기화하시겠습니까?`)) r.action(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 16 }}>{r.icon}</span>
              <span style={{ color: "#E2E8F0", fontSize: 14, flex: 1 }}>{r.label}</span>
              <span style={{ color: "#EF5350", fontSize: 12, fontWeight: 700 }}>초기화</span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📱 하단 메뉴 순서</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>드래그 또는 ▲▼ 버튼으로 순서를 변경하세요.</p>
        {(() => {
          const allItems = [
            { id: "dashboard", icon: "📊", label: "대시보드" },
            { id: "myzone", icon: "📍", label: "내 구역" },
            { id: "counter", icon: "👥", label: "인파계수", feat: "crowd" },
            { id: "congestion", icon: "🚦", label: "혼잡도", feat: "congestion" },
            { id: "heatmap", icon: "🗺️", label: "히트맵", feat: "heatmap" },
            { id: "parking", icon: "🅿️", label: "주차관리", feat: "parking" },
            { id: "shuttle", icon: "🚌", label: "셔틀버스", feat: "shuttle" },
            { id: "chat", icon: "💬", label: "메시지", feat: "message" },
            { id: "status", icon: "🎪", label: "축제관리" },
            { id: "program", icon: "🎭", label: "프로그램" },
            { id: "stage", icon: "🎤", label: "공연관리", feat: "stage" },
            { id: "location", icon: "📍", label: "위치", feat: "location" },
            { id: "emergency", icon: "🚨", label: "비상연락망" },
            { id: "assets", icon: "📦", label: "물자", feat: "assets" },
            { id: "shifts", icon: "📝", label: "근무일지", feat: "shifts" },
            { id: "workers", icon: "👥", label: "근무자관리", feat: "workers" },
            { id: "reports", icon: "📄", label: "보고서", feat: "reports" },
            { id: "qrcode", icon: "🔑", label: "QR코드", feat: "qrcode" },
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
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px", background: enabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", opacity: enabled ? 1 : 0.4, cursor: "grab" }}>
                <span style={{ fontSize: 14, color: "#94A3B8" }}>⠿</span>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, flex: 1 }}>{item.label}</span>
                {!enabled && <span style={{ color: "#EF5350", fontSize: 12 }}>OFF</span>}
                <button onClick={(e) => { e.stopPropagation(); moveNav(item.id, -1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 16, cursor: "pointer" }}>▲</button>
                <button onClick={(e) => { e.stopPropagation(); moveNav(item.id, 1); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 16, cursor: "pointer" }}>▼</button>
              </div>);
            })}
          </div>);
        })()}
      </Card>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 4px" }}>📊 대시보드 표시 항목</h3>
        <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 14px" }}>대시보드에 표시할 모니터링 항목을 선택합니다.</p>
        {categories.map(cat => {
          const vis = settings.dashboardVisible?.[cat.id] !== false;
          return <div key={cat.id} onClick={() => setSettings({ ...settings, dashboardVisible: { ...(settings.dashboardVisible || {}), [cat.id]: !vis } })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: vis ? "rgba(76,175,80,0.04)" : "rgba(255,255,255,0.01)", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: `1px solid ${vis ? "rgba(76,175,80,0.12)" : "#1a1a2e"}` }}>
            <div style={{ width: 36, height: 20, borderRadius: 10, background: vis ? "#66BB6A" : "#333", position: "relative", transition: "all .3s", flexShrink: 0 }}>
              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: vis ? 18 : 2, transition: "all .3s" }} />
            </div>
            <span style={{ fontSize: 16 }}>{cat.icon}</span>
            <span style={{ color: vis ? "#ccd6f6" : "#556", fontSize: 14, fontWeight: 600 }}>{cat.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{cat.unit}</span>
          </div>;
        })}
      </Card>
    </div>}

    {tab === "alerts" && <div>{alerts.length === 0 && <p style={{ color: "#94A3B8", textAlign: "center", padding: 20 }}>이력 없음</p>}{alerts.map((a, i) => { const li = LEVELS[a.level]; return (<div key={i} style={{ background: li.bg, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${li.border}` }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: li.color, fontWeight: 700, fontSize: 14 }}>{li.icon}{a.category}</span><span style={{ color: "#94A3B8", fontSize: 14 }}>{a.time}</span></div><pre style={{ color: "#bbb", fontSize: 13, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" }}>{a.message}</pre></div>); })}{alerts.length > 0 && <button onClick={() => setAlerts([])} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>전체 삭제</button>}</div>}

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
      let shortFcstData = null;
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

        // 3) 단기예보 (getVilageFcst) — 향후 3일 예보 (3시간 간격)
        try {
          const sp = getShortFcstParams(settings);
          const url3 = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(kma.serviceKey)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${sp.bd}&base_time=${sp.bt}&nx=${sp.nx}&ny=${sp.ny}`;
          const res3 = await fetch(url3);
          const json3 = await res3.json();
          const items3 = json3?.response?.body?.items?.item;
          if (items3 && items3.length > 0) {
            shortFcstData = {};
            // 단기예보 카테고리 매핑: TMP(기온) → T1H, POP(강수확률), PCP(강수량) → RN1, WSD(풍속), REH(습도), SKY(하늘), PTY(강수형태)
            items3.forEach(i => {
              const cat = i.category;
              const mappedCat = cat === "TMP" ? "T1H" : cat === "PCP" ? "RN1" : cat;
              if (!shortFcstData[mappedCat]) shortFcstData[mappedCat] = [];
              let val = parseFloat(i.fcstValue);
              if (cat === "PCP" && (i.fcstValue === "강수없음" || i.fcstValue === "-" || isNaN(val))) val = 0;
              if (isNaN(val)) val = 0;
              shortFcstData[mappedCat].push({ 
                time: `${i.fcstDate.slice(4,6)}/${i.fcstDate.slice(6)} ${i.fcstTime.slice(0,2)}:${i.fcstTime.slice(2)}`,
                value: Math.round(val * 10) / 10,
                fcstDate: i.fcstDate,
                fcstTime: i.fcstTime
              });
            });
          }
        } catch (e) { console.warn("[KMA] 단기예보 실패:", e); }
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
          const newValue = Math.round(dataMap[c.kmaCategory] * 10) / 10;
          const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          // history 누적: 마지막 시각이 같으면 업데이트, 다르면 추가, 최대 48개 (8시간 이상 - 10분 간격)
          const prevHistory = c.history || [];
          let newHistory = [...prevHistory];
          if (newHistory.length > 0 && newHistory[newHistory.length - 1].time === timeStr) {
            newHistory[newHistory.length - 1] = { time: timeStr, value: newValue };
          } else {
            newHistory.push({ time: timeStr, value: newValue });
          }
          if (newHistory.length > 48) newHistory = newHistory.slice(-48);
          return { 
            ...c, 
            currentValue: newValue, 
            lastUpdated: new Date().toLocaleTimeString("ko-KR"), 
            forecast: fcstData[c.kmaCategory] || [], 
            shortForecast: (shortFcstData && shortFcstData[c.kmaCategory]) || [],
            history: newHistory,
            dataType: "실황" 
          };
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
          const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          const updateHist = (prevHist, newVal) => {
            let h = [...(prevHist || [])];
            if (h.length > 0 && h[h.length - 1].time === timeStr) {
              h[h.length - 1] = { time: timeStr, value: newVal };
            } else {
              h.push({ time: timeStr, value: newVal });
            }
            return h.length > 48 ? h.slice(-48) : h;
          };
          setCategories(p => p.map(c => {
            if (c.id === "pm10") return { ...c, currentValue: pm10, lastUpdated: time, history: updateHist(c.history, pm10), dataType: "실황" };
            if (c.id === "pm25") return { ...c, currentValue: pm25, lastUpdated: time, history: updateHist(c.history, pm25), dataType: "실황" };
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
          const discharge = parseFloat(target.sflowqy || target.totdcwtrqy || target.outflowqy) || 0;
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
  sysadmin: { label: "시스템관리자", color: "#E91E63", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "heatmap", "chat", "status", "program", "stage", "location", "assets", "shifts", "workers", "reports", "qrcode", "cms", "emergency"], desc: "축제 생성/관리 + 모든 기능" },
  admin: { label: "관리자", color: "#EF5350", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "heatmap", "chat", "status", "program", "stage", "location", "assets", "shifts", "workers", "reports", "qrcode", "cms", "emergency"], desc: "모든 기능 접근" },
  manager: { label: "운영자", color: "#FFA726", pages: ["dashboard", "counter", "parking", "shuttle", "congestion", "heatmap", "chat", "status", "program", "stage", "location", "assets", "shifts", "workers", "reports", "qrcode", "cms", "emergency"], desc: "설정 변경 가능 (계정관리 제외)" },
  zonemgr: { label: "구역관리자", color: "#009688", pages: ["dashboard", "congestion", "heatmap", "status", "program", "inbox", "location", "assets", "shifts", "qrcode", "emergency"], desc: "담당 구역 혼잡도/근무자/상태 관리" },
  stagemgr: { label: "무대관리자", color: "#AB47BC", pages: ["dashboard", "stage", "status", "program", "chat", "assets", "shifts", "emergency"], desc: "공연/무대 관리 + 아티스트/셋리스트" },
  operations: { label: "운영인력", color: "#FF7043", pages: ["myzone", "program", "location", "emergency", "chat", "shifts"], desc: "현장 운영인력 - 지정구역/프로그램/위치/비상연락망" },
  counter: { label: "계수원", color: "#66BB6A", pages: ["counter", "congestion", "dashboard", "chat", "status", "program", "location", "shifts", "emergency"], desc: "인파 계수 + 대시보드 조회" },
  parking: { label: "주차요원", color: "#AB47BC", pages: ["parking", "dashboard", "chat", "status", "program", "location", "shifts", "emergency"], desc: "주차장 관리 + 대시보드 조회" },
  shuttle: { label: "셔틀요원", color: "#00BCD4", pages: ["shuttle", "dashboard", "chat", "status", "program", "location", "shifts", "emergency"], desc: "셔틀버스 위치 관리" },
  viewer: { label: "뷰어", color: "#42A5F5", pages: ["dashboard", "chat", "status", "program", "emergency"], desc: "대시보드 조회만 가능" },
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
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", overflow: "hidden" }}>
      {/* 배경 글로우 효과 */}
      <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(66,165,245,0.12) 0%, transparent 70%)", filter: "blur(40px)", animation: "pulse-bg 4s ease-in-out infinite" }} />
      <style>{`@keyframes pulse-bg{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.1);opacity:0.9}}@keyframes logo-glow{0%,100%{box-shadow:0 0 30px rgba(66,165,245,0.3),inset 0 1px 0 rgba(255,255,255,0.1)}50%{box-shadow:0 0 50px rgba(66,165,245,0.5),inset 0 1px 0 rgba(255,255,255,0.15)}}`}</style>
      <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 88, height: 88, borderRadius: 24, background: "linear-gradient(135deg, rgba(66,165,245,0.25), rgba(66,165,245,0.05))", border: "1px solid rgba(66,165,245,0.4)", boxShadow: "0 0 30px rgba(66,165,245,0.3), inset 0 1px 0 rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", animation: "logo-glow 3s ease-in-out infinite" }}>
            <svg viewBox="0 0 64 64" width="48" height="48" fill="none">
              <path d="M32 4L8 14V30C8 44 18 56 32 60C46 56 56 44 56 30V14L32 4Z" stroke="#42A5F5" strokeWidth="2.5" fill="rgba(66,165,245,0.1)"/>
              <path d="M22 32L29 39L42 24" stroke="#42A5F5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 800, margin: "0 0 6px", letterSpacing: 5, textShadow: "0 0 20px rgba(66,165,245,0.4)" }}>SAFEFLOW</h1>
          <p style={{ color: "#94A3B8", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 500 }}>축제 안전관리 플랫폼</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 32, border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "#8892b0", fontSize: 14, display: "block", marginBottom: 6 }}>아이디</label>
            <input value={uid} onChange={e => { setUid(e.target.value); setError(""); }} placeholder="아이디 입력"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 16, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: "#8892b0", fontSize: 14, display: "block", marginBottom: 6 }}>비밀번호</label>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setError(""); }}
                placeholder="비밀번호 입력" onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={{ width: "100%", padding: "14px 48px 14px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 16, boxSizing: "border-box" }} />
              <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94A3B8", fontSize: 18, cursor: "pointer" }}>
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>
          {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.2)", marginBottom: 16 }}>
            <span style={{ color: "#EF5350", fontSize: 13 }}>❌ {error}</span>
          </div>}
          <button onClick={handleLogin} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2196F3,#1565C0)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(33,150,243,0.3)" }}>
            로그인
          </button>
        </div>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ color: "#334", fontSize: 13, lineHeight: 1.8 }}>
            기본 계정 안내<br />
            <span style={{ color: "#94A3B8" }}>관리자: admin / admin1234</span><br />
            <span style={{ color: "#94A3B8" }}>계수원: counter1 / 1234</span><br />
            <span style={{ color: "#94A3B8" }}>상황실: viewer / view</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Account Manager (CMS sub-page) ─────────────────────────────
function AccountManager({ accounts, setAccounts, currentUser }) {
  const [newAcc, setNewAcc] = useState({ id: "", pw: "", name: "", role: "operations" });
  const [editPw, setEditPw] = useState({});
  // 다중 선택 + 일괄 변경
  const [selected, setSelected] = useState(new Set());
  const [bulkRole, setBulkRole] = useState("operations");

  const addAccount = () => {
    if (!newAcc.id || !newAcc.pw || !newAcc.name) return;
    if (accounts.find(a => a.id === newAcc.id)) { alert("이미 존재하는 아이디입니다."); return; }
    setAccounts([...accounts, { id: newAcc.id, password: simpleHash(newAcc.pw), name: newAcc.name, role: newAcc.role, festivalId: currentUser.festivalId, festivals: [currentUser.festivalId] }]);
    setNewAcc({ id: "", pw: "", name: "", role: "operations" });
  };

  const ROLE_RANK = { sysadmin: 100, admin: 80, manager: 60, zonemgr: 50, stagemgr: 45, counter: 40, parking: 40, shuttle: 40, operations: 35, viewer: 20 };
  const myRank = ROLE_RANK[currentUser.role] || 0;
  const canManage = (acc) => {
    if (acc.id === currentUser.id) return false; // 자기 자신 수정 불가
    const targetRank = ROLE_RANK[acc.role] || 0;
    return myRank > targetRank; // 자기보다 낮은 등급만 관리 가능
  };

  // 일괄 역할 변경
  const applyBulkRole = () => {
    const newRank = ROLE_RANK[bulkRole] || 0;
    if (newRank >= myRank) { alert("자신보다 높거나 같은 등급으로 변경할 수 없습니다."); return; }
    const targetIds = [...selected].filter(id => {
      const acc = accounts.find(a => a.id === id);
      return acc && canManage(acc);
    });
    if (targetIds.length === 0) { alert("일괄 변경 가능한 계정이 없습니다."); return; }
    if (!confirm(`선택한 ${targetIds.length}명을 [${ROLES[bulkRole]?.label}] 유형으로 일괄 변경합니다.\n진행하시겠습니까?`)) return;
    setAccounts(accounts.map(a => targetIds.includes(a.id) ? { ...a, role: bulkRole } : a));
    setSelected(new Set());
    alert(`✅ ${targetIds.length}명의 유형이 [${ROLES[bulkRole]?.label}](으)로 변경되었습니다.`);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    const manageable = accounts.filter(a => canManage(a)).map(a => a.id);
    setSelected(new Set(manageable));
  };

  const clearSelection = () => setSelected(new Set());

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
      {/* v2 일괄 유형 변경 패널 */}
      <div style={{ padding: 16, marginBottom: 14, background: "linear-gradient(180deg, rgba(255,112,67,0.08), rgba(255,112,67,0.02))", border: "1px solid rgba(255,112,67,0.25)", borderRadius: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>🎯</span>
          <span style={{ color: "#FF7043", fontSize: 14, fontWeight: 700 }}>유형 일괄 변경</span>
          <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: "auto" }}>{selected.size}명 선택됨</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          <button onClick={selectAll} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,112,67,0.3)", background: "rgba(255,112,67,0.1)", color: "#FF7043", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✓ 전체 선택 (수정가능 계정만)</button>
          <button onClick={clearSelection} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#b0b3c4", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✕ 선택 해제</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>변경할 유형:</span>
          <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} style={{ flex: 1, minWidth: 140, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "#0e0f17", color: "#fff", fontSize: 13, fontFamily: "inherit" }}>
            {Object.entries(ROLES).filter(([k]) => (ROLE_RANK[k] || 0) < myRank).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={applyBulkRole} disabled={selected.size === 0} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: selected.size === 0 ? "rgba(255,255,255,0.05)" : "linear-gradient(180deg, #FF7043, #E64A19)", color: selected.size === 0 ? "#6c6e7d" : "#fff", fontSize: 13, fontWeight: 700, cursor: selected.size === 0 ? "default" : "pointer" }}>일괄 적용 ({selected.size})</button>
        </div>
        {ROLES[bulkRole]?.desc && <div style={{ marginTop: 8, padding: 8, fontSize: 11, color: "#FFB74D", background: "rgba(255,152,0,0.06)", borderRadius: 8, lineHeight: 1.4 }}>💡 {ROLES[bulkRole].desc}</div>}
      </div>

      <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>👤 계정 목록 ({accounts.length}명)</h3>
        {accounts.map(acc => {
          const rl = ROLES[acc.role] || ROLES.viewer;
          const editable = canManage(acc);
          const isSelf = acc.id === currentUser.id;
          const isSelected = selected.has(acc.id);
          let isOnline = false, lastSeenLabel = "";
          try { const pr = JSON.parse(localStorage.getItem("fest_presence") || "{}")[acc.id]; if (pr) { const diff = Date.now() - pr.lastSeen; isOnline = diff < 120000; if (!isOnline) { const min = Math.floor(diff/60000); lastSeenLabel = min < 60 ? `${min}분 전` : min < 1440 ? `${Math.floor(min/60)}시간 전` : `${Math.floor(min/1440)}일 전`; } } } catch {}
          return (
            <div key={acc.id} style={{ padding: "12px 14px", background: isSelected ? "rgba(255,112,67,0.08)" : editable ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.01)", borderRadius: 10, marginBottom: 8, border: isSelected ? "1.5px solid rgba(255,112,67,0.4)" : isSelf ? "1px solid rgba(33,150,243,0.3)" : "1px solid transparent", opacity: editable || isSelf ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* 체크박스 (수정 가능한 계정만) */}
                  {editable && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(acc.id)} style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#FF7043" }} />}
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: isOnline ? "#66BB6A" : "#556", flexShrink: 0 }} />
                  <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: 14 }}>{acc.name}</span>
                  <span style={{ color: "#94A3B8", fontSize: 14 }}>({acc.id})</span>
                  <span style={{ padding: "3px 8px", borderRadius: 10, background: `${rl.color}22`, border: `1px solid ${rl.color}44`, color: rl.color, fontSize: 14, fontWeight: 700 }}>{rl.label}</span>
                  {isOnline && <span style={{ color: "#66BB6A", fontSize: 12, fontWeight: 700 }}>● 접속중</span>}
                  {!isOnline && lastSeenLabel && <span style={{ color: "#94A3B8", fontSize: 12 }}>{lastSeenLabel}</span>}
                  {isSelf && <span style={{ color: "#42A5F5", fontSize: 14 }}>← 현재</span>}
                </div>
                {editable && <button onClick={() => deleteAcc(acc.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #a33", background: "rgba(244,67,54,0.1)", color: "#EF5350", fontSize: 14, cursor: "pointer" }}>삭제</button>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {editable && (
                  <select value={acc.role} onChange={e => changeRole(acc.id, e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
                    {Object.entries(ROLES).filter(([k]) => (ROLE_RANK[k] || 0) < myRank).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                )}
                {(editable || isSelf) && <>
                  <input type="password" placeholder="새 비밀번호" value={editPw[acc.id] || ""} onChange={e => setEditPw({ ...editPw, [acc.id]: e.target.value })}
                    style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14, width: 120 }} />
                  <button onClick={() => changePw(acc.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "linear-gradient(135deg, #FF9800, #F57C00)", color: "#fff", boxShadow: "0 4px 12px rgba(255,152,0,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>변경</button>
                </>}
                {!editable && !isSelf && <span style={{ color: "#94A3B8", fontSize: 12 }}>🔒 상위 관리자</span>}
              </div>
              {editable && (() => {
                const allPages = [
                  { id: "dashboard", icon: "📊", label: "대시보드" },
                  { id: "counter", icon: "👥", label: "인파계수" },
                  { id: "congestion", icon: "🚦", label: "혼잡도" },
                  { id: "status", icon: "🎪", label: "축제관리" },
                  { id: "program", icon: "🎭", label: "프로그램" },
                  { id: "parking", icon: "🅿️", label: "주차" },
                  { id: "shuttle", icon: "🚌", label: "셔틀" },
                  { id: "chat", icon: "💬", label: "메시지" },
                  { id: "cms", icon: "⚙️", label: "관리" },
                  { id: "stage", icon: "🎤", label: "공연관리" },
                ];
                const rolePg = (ROLES[acc.role] || ROLES.viewer).pages;
                const enabled = acc.enabledPages || rolePg;
                return (<div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>하단바 기능</span>
                    <button onClick={() => setAccounts(accounts.map(a => a.id === acc.id ? { ...a, enabledPages: undefined } : a))} style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>기본값</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {allPages.map(p => {
                      const on = enabled.includes(p.id);
                      const isDefault = rolePg.includes(p.id);
                      return (<button key={p.id} onClick={() => {
                        const cur = [...(acc.enabledPages || rolePg)];
                        const next = on ? cur.filter(x => x !== p.id) : [...cur, p.id];
                        setAccounts(accounts.map(a => a.id === acc.id ? { ...a, enabledPages: next } : a));
                      }} style={{ padding: "6px 12px", borderRadius: 6, border: on ? "1.5px solid #4CAF50" : "1px solid #333", background: on ? "rgba(76,175,80,0.08)" : "transparent", color: on ? "#66BB6A" : "#556", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {p.icon} {p.label}{!isDefault && on ? " +" : ""}
                      </button>);
                    })}
                  </div>
                </div>);
              })()}
            </div>
          );
        })}
      </Card>
      {(currentUser.role === "admin" || currentUser.role === "sysadmin") && <button onClick={() => { if (confirm("모든 접속 기기에 설정을 동기화합니다.\n다른 기기는 자동으로 새로고침됩니다.")) { onForceSync?.(); alert("✅ 전체 동기화 완료\n다른 기기가 자동으로 새로고침됩니다."); } }} style={{ width: "100%", padding: "14px", borderRadius: 10, border: "2px solid #2196F3", background: "rgba(33,150,243,0.08)", color: "#42A5F5", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>🔄 전체 기기 동기화</button>}
      {(currentUser.role === "admin" || currentUser.role === "sysadmin") && <Card>
        <h3 style={{ color: "#E2E8F0", fontSize: 16, margin: "0 0 14px" }}>➕ 계정 추가</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>아이디</Label><Input value={newAcc.id} onChange={e => setNewAcc({ ...newAcc, id: e.target.value })} placeholder="영문/숫자" /></div>
            <div><Label>이름</Label><Input value={newAcc.name} onChange={e => setNewAcc({ ...newAcc, name: e.target.value })} placeholder="계수원2" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><Label>비밀번호</Label><Input type="password" value={newAcc.pw} onChange={e => setNewAcc({ ...newAcc, pw: e.target.value })} placeholder="4자 이상" /></div>
            <div><Label>권한</Label>
              <select value={newAcc.role} onChange={e => setNewAcc({ ...newAcc, role: e.target.value })} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }}>
                {Object.entries(ROLES).filter(([k]) => (ROLE_RANK[k] || 0) < myRank).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addAccount} style={{ padding: "12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2196F3, #1976D2)", color: "#fff", boxShadow: "0 4px 12px rgba(33,150,243,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>계정 생성</button>
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

  // 🔄 환경변수가 있으면 localStorage에 자동 저장 (한번만)
  // index.html에서 localStorage를 읽어 Supabase 초기화함
  useEffect(() => {
    try {
      const hasUrl = localStorage.getItem('_sb_url');
      const hasKey = localStorage.getItem('_sb_key');
      if (!hasUrl || !hasKey) {
        // import.meta.env에서 자동 가져오기 (Vite 빌드 시 치환됨)
        const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
        const envKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';
        if (envUrl && envKey && envUrl.startsWith('http')) {
          localStorage.setItem('_sb_url', envUrl);
          localStorage.setItem('_sb_key', envKey);
          console.log('[SAFEFLOW] 환경변수에서 Supabase 설정 자동 저장 - 새로고침 후 동기화 시작');
          // 새로고침해서 index.html이 다시 실행되도록
          if (!hasUrl) setTimeout(() => window.location.reload(), 500);
        }
      }
    } catch {}
  }, []);
  
  if (fatalError) {
    return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: "#EF5350", fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>앱 오류 발생</h2>
        <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 16px" }}>{String(fatalError)}</p>
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>🔄 초기화 후 재시작</button>
        <button onClick={() => setFatalError(null)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", fontSize: 13, cursor: "pointer" }}>다시 시도</button>
      </div>
    </div>);
  }

  try {
    return <AppMain onError={setFatalError} />;
  } catch (e) {
    return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>💥</div>
        <h2 style={{ color: "#EF5350", fontSize: 18, margin: "8px 0" }}>렌더링 오류</h2>
        <p style={{ color: "#888", fontSize: 13 }}>{String(e)}</p>
        <button onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload(); }} style={{ marginTop: 16, padding: "12px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🔄 초기화</button>
      </div>
    </div>);
  }
}

function AppMain({ onError }) {
  const [accounts, setAccounts] = usePersist("fest_accounts_v2", DEFAULT_ACCOUNTS);
  const [festivals, setFestivals] = usePersist("fest_festivals_v1", DEFAULT_FESTIVALS);
  const [syncVersion, setSyncVersion] = usePersist("fest_sync_v1", 0);
  const syncRef = useRef(syncVersion);
  const [session, setSession] = useState(null);
  const [selectedFestival, setSelectedFestival] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // PWA 업데이트 감지
  useEffect(() => {
    const handler = () => setUpdateAvailable(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

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

  // 동기화 감지: 다른 기기에서 동기화 시 자동 새로고침
  useEffect(() => {
    if (syncRef.current !== 0 && syncVersion !== syncRef.current) {
      syncRef.current = syncVersion;
      window.location.reload();
    }
    syncRef.current = syncVersion;
  }, [syncVersion]);

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

    return (<div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0a0d1a 0%, #0b0e17 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px", fontFamily: "'Noto Sans KR',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
      <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>🎪 축제 선택</h1>
      <p style={{ color: "#8892b0", fontSize: 14, margin: "0 0 24px" }}>{session.name}님, 관리할 축제를 선택하세요</p>

      <div style={{ width: "100%", maxWidth: 500, display: "grid", gap: 12 }}>
        {myFests.map(f => (
          <div key={f.id} onClick={() => handleSelectFestival(f)} style={{ padding: "20px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", transition: "all .2s" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#E2E8F0", marginBottom: 4 }}>🏮 {f.name}</div>
            {f.subtitle && <div style={{ color: "#94A3B8", fontSize: 13 }}>{f.subtitle}</div>}
            {f.dates && <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>📅 {f.dates}</div>}
          </div>
        ))}
      </div>

      {/* 시스템 관리자: 축제 생성 */}
      {isSysAdmin && <FestivalManager festivals={festivals} setFestivals={setFestivals} accounts={accounts} setAccounts={setAccounts} />}

      <button onClick={handleLogout} style={{ marginTop: 24, padding: "10px 24px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>로그아웃</button>
    </div>);
  }

  return <AuthenticatedApp session={{ ...session, festivalId: selectedFestival.id }} accounts={accounts} setAccounts={setAccounts} festivals={festivals} onLogout={handleLogout} onBackToFestivalSelect={handleBackToFestivalSelect} initialPage={page} setPage={setPage} onForceSync={() => setSyncVersion(v => (typeof v === 'number' ? v : 0) + 1)} updateAvailable={updateAvailable} />;
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
        <input value={newFest.name} onChange={e => setNewFest(p => ({ ...p, name: e.target.value }))} placeholder="축제명 *" style={{ padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={newFest.subtitle} onChange={e => setNewFest(p => ({ ...p, subtitle: e.target.value }))} placeholder="부제목" style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }} />
          <input value={newFest.dates} onChange={e => setNewFest(p => ({ ...p, dates: e.target.value }))} placeholder="기간 (예: 4/15~4/20)" style={{ padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13 }} />
        </div>
        <button onClick={addFestival} style={{ padding: "12px", borderRadius: 8, border: "none", background: "#E91E63", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🎪 축제 생성</button>
      </div>

      {/* 축제 목록 */}
      <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
        {festivals.map(f => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, gap: 10 }}>
            <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700, flex: 1 }}>🏮 {f.name}</span>
            <span style={{ color: "#94A3B8", fontSize: 12 }}>{f.dates || ""}</span>
            {f.id !== "default" && <button onClick={() => deleteFestival(f.id)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #a33", background: "transparent", color: "#EF5350", fontSize: 12, cursor: "pointer" }}>🗑</button>}
          </div>
        ))}
      </div>

      {/* 계정 관리 */}
      <button onClick={() => setShowAccounts(!showAccounts)} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 13, cursor: "pointer" }}>{showAccounts ? "▲ 계정 관리 닫기" : "👤 계정 축제 배정 관리"}</button>
      {showAccounts && <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
        {accounts.filter(a => a.role !== "sysadmin").map(acc => (
          <div key={acc.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: ROLES[acc.role]?.color || "#888", fontSize: 12, fontWeight: 700 }}>{ROLES[acc.role]?.label}</span>
              <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>{acc.name}</span>
              <span style={{ color: "#94A3B8", fontSize: 12 }}>({acc.id})</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {festivals.map(f => {
                const assigned = (acc.festivals || [acc.festivalId]).includes(f.id);
                return <button key={f.id} onClick={() => {
                  const curFests = acc.festivals || [acc.festivalId || "default"];
                  const newFests = assigned ? curFests.filter(x => x !== f.id) : [...curFests, f.id];
                  if (newFests.length === 0) { alert("최소 1개 축제에 배정해야 합니다."); return; }
                  setAccounts(p => p.map(a => a.id === acc.id ? { ...a, festivals: newFests, festivalId: newFests[0] } : a));
                }} style={{ padding: "6px 12px", borderRadius: 6, border: assigned ? "1px solid #4CAF50" : "1px solid #333", background: assigned ? "rgba(76,175,80,0.1)" : "transparent", color: assigned ? "#66BB6A" : "#556", fontSize: 12, cursor: "pointer" }}>{assigned ? "✅" : "⬜"} {f.name}</button>;
              })}
            </div>
          </div>
        ))}
      </div>}
    </div>
  </div>);
}

function AuthenticatedApp({ session, accounts, setAccounts, festivals, onLogout, onBackToFestivalSelect, initialPage, setPage: setPageExt, onForceSync, updateAvailable }) {
  const [page, setPageInternal] = useState(initialPage);
  const setPage = (p) => { setPageInternal(p); setPageExt(p); };
  const [showMore, setShowMore] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // 🖥️ PC 관제센터 모드 (1024px 이상 자동 감지 + 사용자 토글 가능)
  const [forceMobile, setForceMobile] = useState(() => localStorage.getItem("_force_mobile") === "1");
  // 🎨 새 모바일 디자인 (클로드디자인 v2) - 기본 ON
  const [useNewMobile, setUseNewMobile] = useState(() => localStorage.getItem("_new_mobile") !== "0");
  const toggleNewMobile = () => {
    const next = !useNewMobile;
    setUseNewMobile(next);
    localStorage.setItem("_new_mobile", next ? "1" : "0");
  };
  // body 클래스로 글로벌 v2 톤 적용
  useEffect(() => {
    if (useNewMobile) document.body.classList.add("md-v2-active");
    else document.body.classList.remove("md-v2-active");
    return () => document.body.classList.remove("md-v2-active");
  }, [useNewMobile]);
  const [isPC, setIsPC] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => setIsPC(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isManager = ["admin", "sysadmin", "manager"].includes(session?.role);
  // 관리자는 모든 화면 사이즈에서 관제센터 사용 가능 (모바일은 햄버거 메뉴)
  const useControlCenter = isManager && !forceMobile;
  const toggleMobileView = () => {
    const next = !forceMobile;
    setForceMobile(next);
    localStorage.setItem("_force_mobile", next ? "1" : "0");
  };
  // 키보드 단축키: Cmd/Ctrl + K
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(s => !s); }
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const fid = session.festivalId || "default";
  const [categories, setCategories] = usePersist(`${fid}_cat_v10`, DEFAULT_CATEGORIES);
  const [settings, setSettings] = usePersist(`${fid}_set_v10`, DEFAULT_SETTINGS);
  const [alerts, setAlerts] = usePersist(`${fid}_alr_v10`, []);
  const [smsLog, setSmsLog] = usePersist(`${fid}_sms_v10`, []);
  const [activeAlert, setActiveAlert] = useState(null);
  const [cmsTab, setCmsTab] = useState(null);
  const [cmsCatId, setCmsCatId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevLevels = useRef({}); const lastSms = useRef(0); const alertCooldown = useRef({});

  // 🔒 근무자 자동 백업: 근무자 수가 변경될 때마다 백업 (최대 1분에 1번)
  const lastWorkerBackup = useRef(0);
  const lastWorkerCount = useRef(-1);
  useEffect(() => {
    const totalWorkers = (settings.workSites || []).reduce((s, x) => s + (x.workers || []).length, 0);
    
    // 첫 로드 시는 카운트만 기록
    if (lastWorkerCount.current < 0) {
      lastWorkerCount.current = totalWorkers;
      return;
    }
    
    const prev = lastWorkerCount.current;
    
    // 근무자가 50% 이상 갑자기 감소하면 경고 + 강제 백업
    if (prev > 5 && totalWorkers < prev * 0.5) {
      console.warn(`⚠️ [자동백업] 근무자 급감 감지: ${prev}명 → ${totalWorkers}명`);
      console.warn(`💡 복구: window._safeflow.listBackups() → window._safeflow.restoreBackup(0)`);
    }
    
    // 변경 감지 + 1분에 1번만 백업
    const now = Date.now();
    if (totalWorkers !== prev && now - lastWorkerBackup.current > 60000) {
      lastWorkerBackup.current = now;
      // localStorage에 백업 (Supabase 비용 절감)
      try {
        const ts = new Date().toISOString();
        const list = JSON.parse(localStorage.getItem('_worker_backups') || '[]');
        const backupKey = `${fid}_workers_backup_${now}`;
        const data = { ts, workSites: settings.workSites || [], total: totalWorkers };
        localStorage.setItem(backupKey, JSON.stringify(data));
        list.unshift({ key: backupKey, ts, total: totalWorkers });
        // 최근 10개만
        if (list.length > 10) {
          const removed = list.splice(10);
          removed.forEach(r => { try { localStorage.removeItem(r.key); } catch {} });
        }
        localStorage.setItem('_worker_backups', JSON.stringify(list));
        console.log(`📦 [자동백업] 근무자 ${totalWorkers}명 백업 완료`);
      } catch (e) { console.warn('[자동백업] 실패:', e); }
    }
    
    lastWorkerCount.current = totalWorkers;
  }, [settings.workSites, fid]);

  const active = isActive(settings);
  const role = ROLES[session.role] || ROLES.viewer;
  const myAccount = accounts.find(a => a.id === session.id);
  const allowedPages = myAccount?.enabledPages || role.pages;

  // 접속 상태 추적 (localStorage, 리렌더 없음)
  useEffect(() => {
    const updatePresence = () => {
      try {
        const p = JSON.parse(localStorage.getItem("fest_presence") || "{}");
        p[session.id] = { name: session.name, role: session.role, lastSeen: Date.now() };
        localStorage.setItem("fest_presence", JSON.stringify(p));
      } catch {}
    };
    updatePresence();
    const iv = setInterval(updatePresence, 30000);
    return () => clearInterval(iv);
  }, [session.id]);

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
    // 스마트 알림 - 조용한 시간 체크
    const aSet = settings.alertSettings || {};
    const qh = aSet.quietHours || {};
    const isQuiet = (() => {
      if (!qh.enabled) return false;
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      const start = qh.start || "22:00", end = qh.end || "07:00";
      // 자정 넘김 (22:00 ~ 07:00) 처리
      if (start > end) return hm >= start || hm < end;
      return hm >= start && hm < end;
    })();
    const cooldownMs = (aSet.cooldownMin || 10) * 60 * 1000;

    categories.forEach(cat => {
      // 🚫 humidity(습도)는 EXCLUDE_FROM_OVERALL에 있어 종합경보엔 빠지지만
      //    개별 알림은 발생하므로 여기서도 제외
      if (EXCLUDE_FROM_OVERALL.includes(cat.id)) {
        return;
      }
      const lv = getLevel(cat); const prev = prevLevels.current[cat.id];
      if ((lv === "ORANGE" || lv === "RED") && prev && prev !== lv) {
        // 조용한 시간: RED만 알림 (ORANGE는 스킵)
        if (isQuiet && lv !== "RED") {
          prevLevels.current[cat.id] = lv;
          return;
        }
        // 중복 방지
        const lastKey = `${cat.id}_${lv}`;
        const lastTime = alertCooldown.current[lastKey] || 0;
        const now = Date.now();
        if (now - lastTime < cooldownMs) {
          prevLevels.current[cat.id] = lv;
          return;
        }
        alertCooldown.current[lastKey] = now;
        const li = LEVELS[lv]; const time = new Date().toLocaleString("ko-KR");
        const msg = `⚠️ [${settings.festivalName} 긴급알림] ⚠️\n\n${cat.alertMessages?.[lv] || ""}\n\n${cat.name}: ${cat.currentValue.toLocaleString()}${cat.unit} (${li.label})\n\n점검:\n${(cat.actionItems || []).map(a => `• ${a}`).join("\n")}\n\n발신: ${settings.festivalName} 종합상황실\n시간: ${time}`;
        setAlerts(p => [{ id: "al_"+now, category: cat.name, catId: cat.id, level: lv, message: msg, time, ts: now, snoozedUntil: 0 }, ...p].slice(0, 100));
        setActiveAlert({ category: cat.name, level: lv, message: msg, time });
      }
      // 🔔 스마트 알림 - 자동 해결: BLUE 복귀 시 해당 카테고리 알림 자동 dismiss
      if (lv === "BLUE" && (prev === "ORANGE" || prev === "RED")) {
        setAlerts(p => p.filter(a => a.category !== cat.name));
        // cooldown도 초기화하여 다음에 다시 발생하면 즉시 알림
        delete alertCooldown.current[`${cat.id}_ORANGE`];
        delete alertCooldown.current[`${cat.id}_RED`];
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

  // v2 모바일 디자인용 카테고리 상세 모달 state
  const [v2DetailCatId, setV2DetailCatId] = useState(null);
  const v2DetailCat = v2DetailCatId ? categories.find(c => c.id === v2DetailCatId) : null;
  
  const onCardClick = (catId) => {
    // v2 모바일 디자인일 때: 카테고리 상세 모달 띄우기 (그래프 화면)
    if (useNewMobile && !isPC) {
      setV2DetailCatId(catId);
      return;
    }
    // 기존 동작: CMS 설정으로 이동 (관리자만)
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
  const unreadCount = 0; const _unused_unread = myMessages.filter(m => !readIds.includes(m.id)).length;

  const ft = settings.features || {};
  const navOrderRaw = settings.navOrder || ["dashboard", "counter", "congestion", "heatmap", "parking", "shuttle", "chat", "status", "program", "stage", "location", "assets", "shifts", "workers", "reports", "qrcode", "cms"]; const navOrder = [...navOrderRaw]; ["dashboard","counter","congestion","heatmap","parking","shuttle","chat","status","program","stage","location","assets","shifts","reports","qrcode","cms"].forEach(id => { if (!navOrder.includes(id)) navOrder.push(id); });
  const allNavs = [
    { id: "dashboard", icon: "📊", label: "대시보드" },
    { id: "myzone", icon: "📍", label: "내 구역" },
    ft.crowd !== false && { id: "counter", icon: "👥", label: "인파계수" },
    ft.congestion !== false && { id: "congestion", icon: "🚦", label: "혼잡도" },
    { id: "status", icon: "🎪", label: "축제관리" },
    { id: "program", icon: "🎭", label: "프로그램" },
    ft.stage !== false && { id: "stage", icon: "🎤", label: "공연관리" },
    ft.heatmap !== false && { id: "heatmap", icon: "🗺️", label: "히트맵" },
    ft.location !== false && { id: "location", icon: "📍", label: "위치" },
    { id: "emergency", icon: "🚨", label: "비상연락망" },
    ft.assets !== false && { id: "assets", icon: "📦", label: "물자" },
    ft.shifts !== false && { id: "shifts", icon: "📝", label: "근무일지" },
    ft.workers !== false && { id: "workers", icon: "👥", label: "근무자" },
    ft.reports !== false && { id: "reports", icon: "📄", label: "보고서" },
    ft.qrcode !== false && { id: "qrcode", icon: "🔑", label: "QR" },
    ft.parking !== false && { id: "parking", icon: "🅿️", label: "주차관리" },
    ft.shuttle !== false && { id: "shuttle", icon: "🚌", label: "셔틀버스" },
    ft.message !== false && { id: "chat", icon: "💬", label: "메시지" },
    { id: "cms", icon: "⚙️", label: "관리" },
  ].filter(Boolean);
  const navs = allNavs
    .filter(n => allowedPages.includes(n.id))
    .sort((a, b) => { const ai = navOrder.indexOf(a.id); const bi = navOrder.indexOf(b.id); return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi); });

  // Inject account tab into CMS if admin
  const cmsExtraTabs = (session.role === "admin" || session.role === "manager")
    ? [{ id: "accounts", label: "👤 계정관리" }] : [];

  // 🖥️ PC 관제센터 모드 - 1024px 이상 + 관리자 + 토글 안 한 경우
  if (useControlCenter) {
    // 모바일 (768px 미만): 하단 네비 + 세로카드 구조
    if (!isPC) {
      return (<CCErrorBoundary>
        <MobileControlCenter
          session={session}
          accounts={accounts}
          setAccounts={setAccounts}
          settings={settings}
          setSettings={setSettings}
          categories={categories}
          setCategories={setCategories}
          alerts={alerts}
          setAlerts={setAlerts}
          smsLog={smsLog}
          setSmsLog={setSmsLog}
          onLogout={onLogout}
          onMobileSwitch={toggleMobileView}
          setActiveAlert={setActiveAlert}
          onAction={handleAction}
        />
      </CCErrorBoundary>);
    }
    // PC/태블릿: 사이드바 구조
    return (<CCErrorBoundary>
      <ControlCenterDashboard
        session={session}
        accounts={accounts}
        setAccounts={setAccounts}
        settings={settings}
        setSettings={setSettings}
        categories={categories}
        setCategories={setCategories}
        alerts={alerts}
        setAlerts={setAlerts}
        smsLog={smsLog}
        setSmsLog={setSmsLog}
        onLogout={onLogout}
        onMobileSwitch={toggleMobileView}
        setActiveAlert={setActiveAlert}
        onAction={handleAction}
        onNav={(id) => {
          const map = { dashboard: "dashboard", monitor: "counter", alert: "chat", incident: "chat", map: "heatmap", resource: "assets", report: "reports", user: "workers", settings: "cms" };
          if (map[id]) { setPage(map[id]); }
        }}
      />
    </CCErrorBoundary>);
  }

  return (<div style={{ fontFamily: "'Noto Sans KR',-apple-system,sans-serif" }}>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&display=swap" rel="stylesheet" />
    <style>{`@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    {useNewMobile && <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{MD_GLOBAL_V2}</style>
    </>}
    <AlertToast alert={activeAlert} onClose={() => setActiveAlert(null)} />
    
    {/* v2 모바일 디자인용 카테고리 상세 모달 */}
    {v2DetailCat && <CategoryDetailModal cat={v2DetailCat} settings={settings} session={session} onAction={(catId, status) => { handleAction(catId, status); }} onClose={() => setV2DetailCatId(null)} />}

    {/* Top bar - user info (새 모바일 디자인 대시보드면 숨김) */}
    {!(useNewMobile && page === "dashboard") && <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1001, background: "rgba(10,10,26,0.95)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 12px) 8px calc(env(safe-area-inset-left) + 12px)", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(10px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ padding: "3px 8px", borderRadius: 10, background: `${role.color}22`, border: `1px solid ${role.color}44`, color: role.color, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{role.label}</span>
        <span style={{ color: "#8892b0", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {isManager && forceMobile && <button onClick={toggleMobileView} title="관제센터로 전환" style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(107,138,255,0.3)", background: "rgba(107,138,255,0.06)", color: "#6b8aff", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>🖥️ 관제센터</button>}
        <button onClick={toggleNewMobile} title={useNewMobile ? "기존 디자인" : "새 디자인 v2"} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(169,128,255,0.3)", background: "rgba(169,128,255,0.06)", color: "#a980ff", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{useNewMobile ? "🎨 v2" : "🎨 v1"}</button>
        <button onClick={() => setShowSearch(true)} title="통합 검색 (Ctrl+K)" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(66,165,245,0.25)", background: "rgba(33,150,243,0.06)", color: "#42A5F5", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>🔍 <span style={{ fontSize: 11, opacity: 0.6, display: "none" }}>⌘K</span></button>
        {(session.festivals?.length > 1 || session.role === "sysadmin") && onBackToFestivalSelect && <button onClick={onBackToFestivalSelect} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#FFA726", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>🎪 축제변경</button>}
        <button onClick={onLogout} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>로그아웃</button>
      </div>
    </div>}

    {/* 통합 검색 모달 */}
    <SearchModal open={showSearch} onClose={() => setShowSearch(false)} settings={settings} categories={categories} onNavigate={(p) => setPage(p)} />

    {/* Bottom nav */}
    {/* 더보기 메뉴 오버레이 */}
    {showMore && <div onClick={() => setShowMore(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1001, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom) + 64px)", background: "linear-gradient(180deg, #11141d 0%, #0d1018 100%)", borderTop: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px 20px 0 0", padding: "12px 16px 16px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 8px" }} />
        <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 12, fontWeight: 600, marginBottom: 12, letterSpacing: 1 }}>전체 메뉴</div>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {navs.map(n => (
            <button key={n.id} onClick={() => { setPage(n.id); setShowMore(false); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ padding: "14px 4px", borderRadius: 12, border: page === n.id ? "1.5px solid rgba(33,150,243,0.5)" : "1px solid rgba(255,255,255,0.06)", background: page === n.id ? "linear-gradient(135deg, rgba(33,150,243,0.15), rgba(33,150,243,0.04))" : "rgba(255,255,255,0.02)", color: page === n.id ? "#42A5F5" : "#94A3B8", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative", transition: "all 0.2s" }}>
              <span style={{ fontSize: 24, lineHeight: 1 }}>{n.icon}</span>
              <span style={{ fontSize: 12, fontWeight: page === n.id ? 700 : 500 }}>{n.label}</span>
              {n.id === "cms" && updateAvailable && <span style={{ position: "absolute", top: 8, right: 10, width: 7, height: 7, borderRadius: 4, background: "#42A5F5", boxShadow: "0 0 8px rgba(33,150,243,0.6)" }} />}
              {n.id === "inbox" && unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: 8, padding: "1px 5px", borderRadius: 8, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", fontSize: 10, fontWeight: 700 }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>}

    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000, background: "rgba(11,14,23,0.85)", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "center", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 -4px 20px rgba(0,0,0,0.3)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {(() => {
        const MAX = 5;
        if (navs.length <= MAX) {
          return navs.map(n => <button key={n.id} onClick={() => { setPage(n.id); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ flex: 1, maxWidth: 130, padding: "12px 0 10px", border: "none", background: "none", color: page === n.id ? "#42A5F5" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span><span style={{ fontSize: 13, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span>
            {n.id === "inbox" && unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: "calc(50% - 18px)", width: 16, height: 16, borderRadius: 8, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            {n.id === "cms" && updateAvailable && <span style={{ position: "absolute", top: 6, right: "calc(50% - 16px)", width: 8, height: 8, borderRadius: 4, background: "#42A5F5" }} />}
          </button>);
        }
        // 5개 이상이면 4개 + 더보기
        const pinned = navs.slice(0, MAX - 1);
        const isInPinned = pinned.find(n => n.id === page);
        const visibleNavs = isInPinned ? pinned : [...pinned.slice(0, MAX - 2), navs.find(n => n.id === page) || pinned[pinned.length - 1]];

        return (<>
          {visibleNavs.filter(Boolean).map(n => <button key={n.id} onClick={() => { setPage(n.id); setShowMore(false); if (n.id !== "cms") { setCmsTab(null); setCmsCatId(null); } }} style={{ flex: 1, maxWidth: 130, padding: "12px 0 10px", border: "none", background: "none", color: page === n.id ? "#42A5F5" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span><span style={{ fontSize: 13, fontWeight: page === n.id ? 700 : 400 }}>{n.label}</span>
            {n.id === "inbox" && unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: "calc(50% - 18px)", width: 16, height: 16, borderRadius: 8, background: "linear-gradient(135deg, #F44336, #D32F2F)", color: "#fff", boxShadow: "0 4px 12px rgba(244,67,54,0.3)", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
            {n.id === "cms" && updateAvailable && <span style={{ position: "absolute", top: 6, right: "calc(50% - 16px)", width: 8, height: 8, borderRadius: 4, background: "#42A5F5" }} />}
          </button>)}
          <button onClick={() => setShowMore(!showMore)} style={{ flex: 1, maxWidth: 130, padding: "12px 0 10px", border: "none", background: "none", color: showMore ? "#42A5F5" : "#556", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 20 }}>⋯</span><span style={{ fontSize: 13, fontWeight: showMore ? 700 : 400 }}>더보기</span>
          </button>
        </>);
      })()}
    </nav>

    {/* Content */}
    <div style={{ paddingTop: useNewMobile && page === "dashboard" ? 0 : "calc(env(safe-area-inset-top) + 44px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 70px)" }}>
      {page === "dashboard" && useNewMobile && active && <MobileNewDashboard
        session={session}
        settings={settings}
        categories={categories}
        alerts={alerts}
        onCardClick={onCardClick}
        onSearch={() => setShowSearch(true)}
        onAlertClick={(a) => setActiveAlert(a)}
        onPageChange={setPage}
        onLogout={onLogout}
        isManager={isManager}
        onSwitchToOldDesign={toggleNewMobile}
        onAction={handleAction}
        setActiveAlert={(cat) => {
          // cat이 카테고리면 onCardClick으로 모달 열기
          if (cat && cat.id && categories.find(c => c.id === cat.id)) {
            onCardClick(cat.id);
          } else {
            setActiveAlert(cat);
          }
        }}
        onDeleteAlert={(idx) => {
          const now = Date.now();
          if (idx === "all") {
            categories.forEach(c => { ["ORANGE", "RED"].forEach(lv => { alertCooldown.current[`${c.id}_${lv}`] = now; }); });
            setAlerts([]);
          } else {
            const target = alerts[idx];
            if (target) {
              const cat = categories.find(c => c.name === target.category);
              if (cat) alertCooldown.current[`${cat.id}_${target.level}`] = now;
            }
            setAlerts(p => p.filter((_, i) => i !== idx));
          }
        }}
      />}
      {page === "dashboard" && !useNewMobile && (active ? <Dashboard categories={categories} settings={settings} onCardClick={onCardClick} onRefresh={handleRefresh} alerts={alerts} onAction={handleAction} onActionReport={handleActionReport} onDeleteAlert={(idx) => {
        // 삭제 시 해당 알림의 cooldown을 현재 시각으로 갱신 (10분 내 재생성 방지)
        const now = Date.now();
        if (idx === "all") {
          // 전체 삭제: 모든 카테고리 cooldown 갱신
          categories.forEach(c => { ["ORANGE", "RED"].forEach(lv => { alertCooldown.current[`${c.id}_${lv}`] = now; }); });
          setAlerts([]);
        } else {
          // 개별 삭제: 해당 카테고리 cooldown 갱신
          const target = alerts[idx];
          if (target) {
            const cat = categories.find(c => c.name === target.category);
            if (cat) alertCooldown.current[`${cat.id}_${target.level}`] = now;
          }
          setAlerts(p => p.filter((_, i) => i !== idx));
        }
      }} onDeleteNotice={(nid) => setSettings(prev => ({ ...prev, notices: (prev.notices || []).filter(n => n.id !== nid) }))} userRole={session.role} updateAvailable={updateAvailable} onSearch={() => setShowSearch(true)} /> : <InactiveOverlay settings={settings} />)}
      {page === "counter" && <CounterPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} session={session} />}
      {page === "parking" && <ParkingPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "shuttle" && <ShuttlePage settings={settings} setSettings={setSettings} session={session} />}
      {page === "chat" && <ChatPage settings={settings} setSettings={setSettings} accounts={accounts} session={session} />}
      
      {page === "congestion" && <CongestionPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "program" && <ProgramPage settings={settings} setSettings={setSettings} session={session} onManage={() => { setCmsTab("programs"); setPage("cms"); }} />}
      {page === "stage" && <StageMgmtPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "heatmap" && <HeatmapPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "location" && <LocationPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "assets" && <AssetsPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "shifts" && <ShiftsPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "workers" && <WorkersPage settings={settings} setSettings={setSettings} session={session} accounts={accounts} setAccounts={setAccounts} />}
      {page === "reports" && <ReportsPage settings={settings} setSettings={setSettings} session={session} categories={categories} alerts={alerts} />}
      {page === "qrcode" && <QRPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "status" && <FestivalStatusPage settings={settings} setSettings={setSettings} session={session} accounts={accounts} setAccounts={setAccounts} />}
      {page === "myzone" && <MyZonePage settings={settings} setSettings={setSettings} session={session} accounts={accounts} />}
      {page === "emergency" && <EmergencyContactsPage settings={settings} setSettings={setSettings} session={session} />}
      {page === "cms" && cmsTab === "accounts" ? (
        <div style={{ minHeight: "100vh", background: "#0d1117", padding: "20px 16px" }}>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 14px" }}>👤 계정 관리</h2>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <button onClick={() => setCmsTab(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#8892b0", fontSize: 14, cursor: "pointer" }}>← CMS로 돌아가기</button>
          </div>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <AccountManager accounts={accounts} setAccounts={setAccounts} currentUser={session} />
          </div>
        </div>
      ) : page === "cms" && (
        <CMSPage categories={categories} setCategories={setCategories} settings={settings} setSettings={setSettings} alerts={alerts} setAlerts={setAlerts} smsLog={smsLog} initialTab={cmsTab} initialCatId={cmsCatId} extraTabs={cmsExtraTabs} onExtraTab={(id) => setCmsTab(id)} userRole={session.role} accounts={accounts} setAccounts={setAccounts} onDataReset={() => setRefreshKey(k => k + 1)} onForceSync={onForceSync} updateAvailable={updateAvailable} />
      )}
    </div>
  </div>);
}
