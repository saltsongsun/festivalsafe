/* global React */
const { useState } = React;

// ─── Icon (minimal lucide-style strokes) ───────────────────────────
const Icon = ({ name, size = 16, color }) => {
  const s = { width: size, height: size, color: color || 'currentColor' };
  const paths = {
    home: <path d="M3 12 L12 4 L21 12 M5 10 v10 h14 V10"/>,
    monitor: <path d="M3 5 h18 v12 H3 z M8 21 h8 M12 17 v4"/>,
    bell: <path d="M6 8 a6 6 0 0 1 12 0 c0 5 2 7 2 7 H4 s2-2 2-7 M10 19 a2 2 0 0 0 4 0"/>,
    file: <path d="M14 3 H6 v18 h12 V8 z M14 3 v5 h4"/>,
    map: <path d="M9 4 L3 6 v14 l6-2 6 2 6-2 V4 l-6 2 z M9 4 v14 M15 6 v14"/>,
    layers: <path d="M12 3 L3 8 l9 5 9-5 z M3 13 l9 5 9-5 M3 18 l9 5 9-5"/>,
    chart: <path d="M3 3 v18 h18 M7 14 v4 M11 10 v8 M15 13 v5 M19 6 v12"/>,
    users: <path d="M9 11 a4 4 0 1 0 0-8 a4 4 0 0 0 0 8 z M2 21 v-2 a4 4 0 0 1 4-4 h6 a4 4 0 0 1 4 4 v2 M22 21 v-2 a4 4 0 0 0-3-4 M16 3 a4 4 0 0 1 0 8"/>,
    settings: <path d="M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0-6 z M19 12 l2-1 -1-3 -2 0 -1-2 0-2 -3-1 -1 1 -2 0 -1-1 -3 1 0 2 -1 2 -2 0 -1 3 2 1 0 2 -2 1 1 3 2 0 1 2 0 2 3 1 1-1 2 0 1 1 3-1 0-2 1-2 2 0 1-3 -2-1 z"/>,
    plus: <path d="M12 5 v14 M5 12 h14"/>,
    refresh: <path d="M21 12 a9 9 0 0 1-15 6 M3 12 a9 9 0 0 1 15-6 M21 4 v6 h-6 M3 20 v-6 h6"/>,
    search: <path d="M11 11 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0-14 0 M21 21 l-5-5"/>,
    close: <path d="M6 6 l12 12 M18 6 L6 18"/>,
    check: <path d="M5 12 l5 5 L20 6"/>,
    arrow: <path d="M5 12 h14 M13 6 l6 6-6 6"/>,
    chevron: <path d="M9 6 l6 6-6 6"/>,
    wind: <path d="M9.6 4.5 a3 3 0 1 1 2.4 4.5 H2 M12.6 19.5 a3 3 0 1 0 2.4-4.5 H2 M17.7 8.5 a4 4 0 1 1 3 6.5 H2"/>,
    rain: <path d="M16 20 v2 M12 18 v3 M20 18 v3 M19 14 a4 4 0 0 0 -7-2 a5 5 0 0 0-9 2 a4 4 0 0 0 4 4 h11 a4 4 0 0 0 1-4 z"/>,
    thermo: <path d="M14 4 a2 2 0 0 0-4 0 v10.5 a4 4 0 1 0 4 0 z"/>,
    drop: <path d="M12 3 c-3 6-7 9-7 13 a7 7 0 0 0 14 0 c0-4-4-7-7-13 z"/>,
    crowd: <path d="M9 11 a3 3 0 1 0 0-6 a3 3 0 0 0 0 6 M3 21 a6 6 0 0 1 12 0 M16 11 a3 3 0 1 0 0-6 M19 21 a6 6 0 0 0-3-5"/>,
    wave: <path d="M2 12 c2-3 4-3 6 0 s 4 3 6 0 s 4-3 6 0 M2 18 c2-3 4-3 6 0 s 4 3 6 0 s 4-3 6 0"/>,
    dust: <path d="M5 8 a2 2 0 1 1 4 0 M3 12 a3 3 0 1 1 6 0 M11 16 a2 2 0 1 1 4 0 M15 9 a2 2 0 1 1 4 0 M13 12 a3 3 0 1 1 6 0"/>,
    location: <path d="M12 21 s-7-7-7-12 a7 7 0 1 1 14 0 c0 5-7 12-7 12 z M12 9 a2 2 0 1 0 0 4 a2 2 0 0 0 0-4 z"/>,
    camera: <path d="M3 8 h4 l2-3 h6 l2 3 h4 v11 H3 z M12 17 a4 4 0 1 0 0-8 a4 4 0 0 0 0 8 z"/>,
    mic: <path d="M12 2 a3 3 0 0 0-3 3 v6 a3 3 0 1 0 6 0 V5 a3 3 0 0 0-3-3 z M5 11 a7 7 0 0 0 14 0 M12 18 v4 M8 22 h8"/>,
    phone: <path d="M5 4 h4 l2 5-2 1 a11 11 0 0 0 5 5 l1-2 5 2 v4 a2 2 0 0 1-2 2 A18 18 0 0 1 3 6 a2 2 0 0 1 2-2 z"/>,
    speaker: <path d="M3 9 v6 h4 l5 4 V5 L7 9 z M16 8 a5 5 0 0 1 0 8 M19 5 a8 8 0 0 1 0 14"/>,
    sms: <path d="M3 5 h18 v13 H7 l-4 4 z M7 10 h10 M7 14 h6"/>,
    history: <path d="M12 8 v4 l3 2 M3 12 a9 9 0 1 0 3-7 M3 4 v5 h5"/>,
    filter: <path d="M3 5 h18 l-7 9 v6 l-4-2 v-4 z"/>,
    download: <path d="M12 4 v12 M6 14 l6 6 6-6 M5 22 h14"/>,
    eye: <path d="M2 12 s4-7 10-7 s 10 7 10 7 s-4 7-10 7 s-10-7-10-7 z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0-6 z"/>,
  };
  return <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};

// ─── Primitives ───────────────────────────────────────────────────
const Card = ({ children, title, sub, action, soft, tinted, style, className = '' }) => (
  <div className={`card ${soft ? 'soft' : ''} ${tinted ? 'tinted' : ''} ${className}`} style={style}>
    {(title || sub || action) && (
      <div className="card-h">
        <div>
          {title && <div className="card-title">{title}</div>}
          {sub && <div className="card-sub">{sub}</div>}
        </div>
        {action}
      </div>
    )}
    {children}
  </div>
);

const Chip = ({ level, children, lg, pulse }) => (
  <span className={`chip ${level} ${lg ? 'lg' : ''}`}>
    <span className={`dot ${pulse ? 'pulse' : ''}`} />{children}
  </span>
);

const Btn = ({ children, variant = '', size = '', block, icon, onClick, style }) => (
  <button className={`btn ${variant} ${size} ${block ? 'block' : ''} ${icon ? 'icon' : ''}`} onClick={onClick} style={style}>{children}</button>
);

const Spark = ({ danger, ok, points }) => {
  const def = points || (danger
    ? "M0 30 L 10 28 L 20 22 L 30 24 L 40 16 L 50 18 L 60 12 L 70 8 L 80 6 L 100 4"
    : ok ? "M0 18 L 10 20 L 20 16 L 30 18 L 40 14 L 50 16 L 60 12 L 70 14 L 80 12 L 100 14"
    : "M0 22 L 10 18 L 20 22 L 30 16 L 40 20 L 50 14 L 60 18 L 70 12 L 80 16 L 100 14");
  const color = danger ? 'var(--red)' : ok ? 'var(--green)' : 'var(--accent)';
  return (
    <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g-${danger?'d':ok?'o':'n'}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={def + " L 100 36 L 0 36 Z"} fill={`url(#g-${danger?'d':ok?'o':'n'})`} stroke="none"/>
      <path d={def} fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────
const Sidebar = ({ active }) => {
  const items = [
    { id: 'home', name: '대시보드', ico: 'home' },
    { id: 'monitor', name: '실시간 모니터링', ico: 'monitor' },
    { id: 'alert', name: '알림 / 경보', ico: 'bell', badge: '3' },
    { id: 'incident', name: '사건 / 신고', ico: 'file' },
    { id: 'map', name: '지도 상황도', ico: 'map' },
    { id: 'resource', name: '리소스 관리', ico: 'layers' },
    { id: 'report', name: '리포트', ico: 'chart' },
    { id: 'user', name: '사용자 관리', ico: 'users' },
  ];
  return (
    <div className="sidebar">
      <div className="sb-section">메인</div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      {items.slice(0, 5).map(it => (
        <div key={it.id} className={`sb-item ${active === it.id ? 'active' : ''}`}>
          <span className="ico"><Icon name={it.ico} size={16}/></span>
          <span>{it.name}</span>
          {it.badge && <span className="badge">{it.badge}</span>}
        </div>
      ))}
      </div>
      <div className="sb-section" style={{ marginTop: 14 }}>관리</div>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      {items.slice(5).map(it => (
        <div key={it.id} className={`sb-item ${active === it.id ? 'active' : ''}`}>
          <span className="ico"><Icon name={it.ico} size={16}/></span>
          <span>{it.name}</span>
        </div>
      ))}
      </div>
      <div style={{ marginTop: 16, padding: 14, background: 'linear-gradient(180deg, rgba(107,138,255,0.08), rgba(107,138,255,0.02))', borderRadius: 12, border: '1px solid rgba(107,138,255,0.18)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 6, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>현재 운영중</div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing:'-0.01em' }}>진주논개제</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>D+2 · 14:32</div>
      </div>
    </div>
  );
};

// ─── PHONE shell ──────────────────────────────────────────────────
const Phone = ({ children, label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
    <div className="phone-shell">
      <div className="phone-notch"/>
      <div className="phone-screen">
        <div className="phone-status">
          <span>14:32</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>5G</span>
            <span style={{ display: 'inline-block', width: 18, height: 9, border: '1px solid currentColor', borderRadius: 2, position: 'relative' }}>
              <span style={{ position: 'absolute', inset: 1, background: 'currentColor', width: 12 }}/>
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
    {label && <div style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{label}</div>}
  </div>
);

// Metric icons map
const METRIC_ICO = { crowd: 'crowd', wind: 'wind', rain: 'rain', temp: 'thermo', humidity: 'drop', dam: 'wave', pm25: 'dust' };

// Metric tile
const Metric = ({ id, name, val, unit, lv, trend, danger, alert }) => (
  <div className={`metric ${alert ? 'alert' : ''} ${danger ? 'danger' : ''}`}>
    <div className="metric-h">
      <span className="metric-name"><span className="metric-icon"><Icon name={METRIC_ICO[id] || 'chart'} size={13}/></span>{name}</span>
      {lv && <Chip level={lv}>{lv === 'blue' ? '정상' : lv === 'yellow' ? '주의' : lv === 'orange' ? '경계' : '심각'}</Chip>}
    </div>
    <div className="metric-val">{val}<span className="metric-unit"> {unit}</span></div>
    <Spark danger={danger} ok={!danger && !alert}/>
    {trend && <div className="metric-trend">{trend}</div>}
  </div>
);

// ═════════════════════════════════════════════════════════════════
// SCREEN 1: 대시보드
// ═════════════════════════════════════════════════════════════════

const Desktop_Dashboard = () => (
  <div className="layout">
    <Sidebar active="home"/>
    <div className="main-col">
      {/* Greeting */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>2026년 4월 29일 수요일 · 운영 5시간 32분 경과</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 4 }}>
            지금 <span style={{ color: 'var(--orange)' }}>경계</span> 단계예요
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm"><Icon name="refresh" size={14}/>새로고침</Btn>
          <Btn size="sm" variant="primary"><Icon name="bell" size={14}/>경보 발령</Btn>
        </div>
      </div>

      {/* Top alert banner */}
      <Card tinted style={{ marginBottom: 16, border: '1px solid rgba(255,154,60,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,154,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--orange)' }}>
            <Icon name="wind" size={22}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Chip level="orange" pulse>ORANGE · 경계</Chip>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>2분 전 발생</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>강풍 11.2 m/s — 무대 구조물 점검을 시작하세요</div>
          </div>
          <Btn variant="primary">대응 시작<Icon name="arrow" size={14}/></Btn>
          <Btn variant="ghost">무시</Btn>
        </div>
      </Card>

      {/* Metric grid */}
      <div className="g4" style={{ marginBottom: 16 }}>
        <Metric id="crowd" name="인파" val="14,820" unit="명" lv="yellow" alert trend="↑ 1시간 전 대비 +1,240"/>
        <Metric id="wind" name="풍속" val="11.2" unit="m/s" lv="orange" danger trend="↑ 임계값 9 m/s 초과"/>
        <Metric id="rain" name="강우량" val="2.1" unit="mm" lv="blue" trend="약한 비"/>
        <Metric id="temp" name="기온" val="28.4" unit="°C" lv="yellow" alert trend="↑ 폭염주의 임계 근접"/>
      </div>
      <div className="g4" style={{ marginBottom: 16 }}>
        <Metric id="humidity" name="습도" val="67" unit="%" lv="blue"/>
        <Metric id="dam" name="댐 방류량" val="120" unit="㎥/s" lv="blue"/>
        <Metric id="pm25" name="초미세먼지" val="32" unit="㎍/㎥" lv="yellow"/>
        <Card style={{ background: 'var(--bg-2)' }}>
          <div className="card-sub">활성 경보</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'JetBrains Mono', marginTop: 4, marginBottom: 6 }}>3 <span style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'inherit' }}>건</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Chip level="orange">●1</Chip><Chip level="yellow">●2</Chip>
          </div>
        </Card>
      </div>

      {/* Two-column lower */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card title="활성 경보" sub="실시간 갱신" action={<Btn size="sm" variant="ghost">전체 보기</Btn>}>
          {[
            { lv: 'orange', t: '강풍 경계', d: '풍속 11.2 m/s · 임계값 9 m/s 초과', time: '14:30', who: '자동', actions: true },
            { lv: 'yellow', t: '인파 주의 · A구역', d: '5,420명 · 1.42명/㎡', time: '14:21', who: '자동' },
            { lv: 'yellow', t: '폭염 주의', d: '28.4°C · 30분간 지속 상승', time: '13:55', who: '자동' },
          ].map((a, i) => (
            <div key={i} className="list-row">
              <Chip level={a.lv} pulse={a.lv === 'orange'}>●</Chip>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.t}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{a.d}</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.time}</span>
              {a.actions ? <Btn size="sm" variant="primary">대응</Btn> : <Btn size="sm" variant="ghost">상세</Btn>}
            </div>
          ))}
        </Card>

        <Card title="권장 조치" sub="강풍 경계 대응">
          {['무대 구조물 점검', '현수막 고정 확인', 'A구역 출입 제한 안내', 'SMS 발송 (안전요원 12명)'].map((t, i) => (
            <div key={i} className="list-row" style={{ padding: '10px 0' }}>
              <span className={`check ${i === 0 ? 'on' : ''}`}>{i === 0 && <Icon name="check" size={12}/>}</span>
              <span style={{ flex: 1, fontSize: 13, color: i === 0 ? 'var(--text-3)' : 'var(--text)', textDecoration: i === 0 ? 'line-through' : 'none' }}>{t}</span>
            </div>
          ))}
          <Btn variant="primary" block style={{ marginTop: 8 }}>전체 조치 실행</Btn>
        </Card>
      </div>
    </div>
  </div>
);

const Mobile_Dashboard = () => (
  <Phone label="📱 관리자 모바일 — 대시보드">
    <div style={{ padding: '16px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>관제센터</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>진주논개제</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="btn icon sm"><Icon name="search" size={14}/></div>
          <div className="btn icon sm" style={{ position: 'relative' }}>
            <Icon name="bell" size={14}/>
            <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, background: 'var(--red)', borderRadius: '50%' }}/>
          </div>
        </div>
      </div>

      <Card tinted style={{ borderColor: 'rgba(255,154,60,0.3)', padding: 14, marginBottom: 12 }}>
        <Chip level="orange" pulse>ORANGE · 경계</Chip>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8, lineHeight: 1.3 }}>강풍 11.2 m/s</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>무대 구조물 점검 필요</div>
        <Btn variant="primary" block style={{ marginTop: 10 }}>대응 시작 →</Btn>
      </Card>

      <div className="g2" style={{ marginBottom: 12 }}>
        <Metric id="wind" name="풍속" val="11.2" unit="m/s" lv="orange" danger/>
        <Metric id="crowd" name="인파" val="14.8K" unit="명" lv="yellow" alert/>
      </div>
      <div className="g2" style={{ marginBottom: 12 }}>
        <Metric id="temp" name="기온" val="28.4" unit="°C" lv="yellow" alert/>
        <Metric id="rain" name="강우" val="2.1" unit="mm" lv="blue"/>
      </div>

      <Card title="활성 경보 3" style={{ padding: 12 }}>
        {[
          { lv: 'orange', t: '강풍 경계', time: '14:30' },
          { lv: 'yellow', t: '인파 주의 (A구역)', time: '14:21' },
          { lv: 'yellow', t: '폭염 주의', time: '13:55' },
        ].map((a, i) => (
          <div key={i} className="list-row" style={{ padding: '10px 4px' }}>
            <Chip level={a.lv}>●</Chip>
            <span style={{ flex: 1, fontSize: 13 }}>{a.t}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.time}</span>
          </div>
        ))}
      </Card>
    </div>

    {/* Bottom nav */}
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 16px 22px', background: 'var(--bg-1)', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-around' }}>
      {[{i:'home',n:'홈',a:1},{i:'monitor',n:'모니터'},{i:'map',n:'지도'},{i:'bell',n:'알림'},{i:'users',n:'더보기'}].map((it,i)=>(
        <div key={i} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:3,color: it.a?'var(--accent)':'var(--text-3)',fontSize:10 }}>
          <Icon name={it.i} size={20}/><span>{it.n}</span>
        </div>
      ))}
    </div>
  </Phone>
);

// ═════════════════════════════════════════════════════════════════
// SCREEN 2: 실시간 모니터링
// ═════════════════════════════════════════════════════════════════

const Desktop_Monitor = () => (
  <div className="layout">
    <Sidebar active="monitor"/>
    <div className="main-col">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { ico: 'crowd', n: '인파', v: '14.8K', lv: 'yellow' },
          { ico: 'wind', n: '풍속', v: '11.2', lv: 'orange', sel: true },
          { ico: 'rain', n: '강우', v: '2.1', lv: 'blue' },
          { ico: 'thermo', n: '기온', v: '28.4', lv: 'yellow' },
          { ico: 'drop', n: '습도', v: '67', lv: 'blue' },
          { ico: 'wave', n: '댐방류', v: '120', lv: 'blue' },
          { ico: 'dust', n: '미세먼지', v: '32', lv: 'yellow' },
        ].map((c, i) => (
          <div key={i} style={{
            padding: '10px 14px', borderRadius: 12,
            background: c.sel ? 'var(--bg-2)' : 'var(--bg-1)',
            border: c.sel ? '1px solid var(--accent)' : '1px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer'
          }}>
            <Icon name={c.ico} size={16} color={c.sel ? 'var(--accent)' : 'var(--text-3)'}/>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.n}</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'JetBrains Mono' }}>{c.v}</div>
            </div>
            <Chip level={c.lv}>●</Chip>
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: 16, background: 'linear-gradient(180deg, rgba(255,154,60,0.08), var(--bg-1))', border: '1px solid rgba(255,154,60,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>풍속 · 기상청 단기실황 (실시간)</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 64, fontWeight: 700, fontFamily: 'JetBrains Mono', letterSpacing: '-0.04em', lineHeight: 1 }}>11.2</span>
              <span style={{ fontSize: 18, color: 'var(--text-3)' }}>m/s</span>
              <Chip level="orange" lg pulse>ORANGE · 경계</Chip>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>
              임계값 <span className="mono">9.0 m/s</span> 초과 · 직전 1시간 평균 <span className="mono">9.8 m/s</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>마지막 업데이트</div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>14:32:08 (8초 전)</div>
            <Btn size="sm" style={{ marginTop: 8 }}><Icon name="refresh" size={12}/>새로고침</Btn>
          </div>
        </div>
      </Card>

      <Card title="추이" sub="최근 24시간 · 30분 간격" action={
        <div className="seg-sm">
          <button>3h</button>
          <button>6h</button>
          <button className="active">24h</button>
          <button>7d</button>
        </div>
      }>
        <div style={{ height: 220, position: 'relative' }}>
          <svg viewBox="0 0 800 220" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            {/* grid */}
            {[40, 80, 120, 160, 200].map(y => <line key={y} x1="0" x2="800" y1={y} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4"/>)}
            {/* threshold lines */}
            <line x1="0" x2="800" y1="80" y2="80" stroke="var(--orange)" strokeWidth="1" strokeDasharray="6 4" opacity="0.6"/>
            <text x="8" y="76" fill="var(--orange)" fontSize="10" fontFamily="JetBrains Mono">ORANGE 9 m/s</text>
            <line x1="0" x2="800" y1="140" y2="140" stroke="var(--yellow)" strokeWidth="1" strokeDasharray="6 4" opacity="0.6"/>
            <text x="8" y="136" fill="var(--yellow)" fontSize="10" fontFamily="JetBrains Mono">YELLOW 5 m/s</text>
            {/* area + path */}
            <defs>
              <linearGradient id="windg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="var(--orange)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 180 L 50 175 L 100 168 L 150 162 L 200 158 L 250 150 L 300 142 L 350 135 L 400 128 L 450 118 L 500 105 L 550 90 L 600 78 L 650 62 L 700 55 L 750 48 L 800 42 L 800 220 L 0 220 Z" fill="url(#windg)"/>
            <path d="M0 180 L 50 175 L 100 168 L 150 162 L 200 158 L 250 150 L 300 142 L 350 135 L 400 128 L 450 118 L 500 105 L 550 90 L 600 78 L 650 62 L 700 55 L 750 48 L 800 42" fill="none" stroke="var(--orange)" strokeWidth="2"/>
            <circle cx="800" cy="42" r="6" fill="var(--orange)" stroke="var(--bg)" strokeWidth="2"/>
          </svg>
        </div>
        <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
          <span>14:00 (어제)</span><span>00:00</span><span>06:00</span><span>12:00</span><span>14:30 지금</span>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <Card title="임계값">
          {[
            { lv: 'blue', n: '정상', r: '0 ~ 5 m/s' },
            { lv: 'yellow', n: '주의', r: '5 ~ 9 m/s' },
            { lv: 'orange', n: '경계', r: '9 ~ 11 m/s', cur: true },
            { lv: 'red', n: '심각', r: '≥ 11 m/s' },
          ].map((t, i) => (
            <div key={i} className="list-row" style={{ padding: '10px 0', opacity: t.cur ? 1 : 0.6 }}>
              <Chip level={t.lv}>{t.n}</Chip>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.r}</span>
              {t.cur && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>현재</span>}
            </div>
          ))}
          <Btn size="sm" variant="ghost" style={{ marginTop: 8 }}><Icon name="settings" size={12}/>임계값 편집</Btn>
        </Card>

        <Card title="대응 체크리스트" sub="ORANGE 경계 단계">
          {[
            { t: '무대 구조물 점검', done: true, who: '시설팀' },
            { t: '현수막 고정 확인', done: false, who: '시설팀' },
            { t: '공연 중지 검토', done: false, who: '운영팀' },
            { t: '관객 대피 경로 확보', done: false, who: '안전요원' },
          ].map((c, i) => (
            <div key={i} className="list-row" style={{ padding: '10px 0' }}>
              <span className={`check ${c.done ? 'on' : ''}`}>{c.done && <Icon name="check" size={12}/>}</span>
              <span style={{ flex: 1, fontSize: 13, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--text-3)' : 'var(--text)' }}>{c.t}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.who}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  </div>
);

const Mobile_Counter = () => (
  <Phone label="📱 현장 계수원 — A구역">
    <div style={{ padding: '16px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Btn size="sm" variant="ghost" icon><Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }}/></Btn>
        <div style={{ fontSize: 14, fontWeight: 600 }}>인파 계수</div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }} className="mono">counter1</span>
      </div>

      <Card style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>A구역 · 동문~남문</span>
          <Chip level="yellow" pulse>주의</Chip>
        </div>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>현재 인파</div>
          <div style={{ fontSize: 56, fontWeight: 700, fontFamily: 'JetBrains Mono', letterSpacing: '-0.04em', lineHeight: 1 }}>5,420</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>1.42 명/㎡ · 임계값 1.0</div>
          <div className="progress" style={{ marginTop: 12 }}>
            <div className="progress-fill" style={{ width: '71%', background: 'var(--yellow)' }}/>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <button style={{ padding: '28px 0', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 32, color: 'var(--text)', fontWeight: 600 }}>−</button>
        <button style={{ padding: '28px 0', background: 'var(--accent)', border: 'none', borderRadius: 14, fontSize: 32, color: 'white', fontWeight: 600 }}>+</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {[1,5,10,50].map(n => (
          <button key={n} style={{ padding: '10px 0', background: 'transparent', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13, color: 'var(--text-2)' }}>+{n}</button>
        ))}
      </div>

      <Card title="최근 입력" style={{ padding: 12 }}>
        {[
          { t: '14:31', d: '+5', who: '나' },
          { t: '14:30', d: '+12', who: '나' },
          { t: '14:28', d: '−3', who: '나' },
          { t: '14:25', d: '+8', who: 'counter2' },
        ].map((h, i) => (
          <div key={i} className="list-row" style={{ padding: '8px 0', fontSize: 12 }}>
            <span className="mono" style={{ color: 'var(--text-3)', width: 40 }}>{h.t}</span>
            <span className="mono" style={{ color: h.d.startsWith('+') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{h.d}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>{h.who}</span>
          </div>
        ))}
      </Card>

      <Btn variant="danger" block style={{ marginTop: 12, padding: 14 }}>🚨 긴급 신고</Btn>
    </div>
  </Phone>
);

// ═════════════════════════════════════════════════════════════════
// SCREEN 3: 알림/경보 발령
// ═════════════════════════════════════════════════════════════════

const Desktop_Alert = () => (
  <div className="layout">
    <Sidebar active="alert"/>
    <div className="main-col">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>알림 / 경보</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>새 경보 발령</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>오늘 발령 12건 · 마지막 14:30</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div>
          <Card title="1. 경보 단계" style={{ marginBottom: 12 }}>
            <div className="g4">
              {[
                { lv: 'blue', n: '정상', d: '일반 안내' },
                { lv: 'yellow', n: '주의', d: '예방 조치' },
                { lv: 'orange', n: '경계', d: '대응 준비', sel: true },
                { lv: 'red', n: '심각', d: '즉시 대응' },
              ].map(t => (
                <button key={t.lv} style={{
                  padding: 16, textAlign: 'left',
                  background: t.sel ? 'rgba(255,154,60,0.1)' : 'var(--bg-2)',
                  border: t.sel ? `1.5px solid var(--${t.lv === 'yellow' ? 'yellow' : t.lv})` : '1px solid var(--line)',
                  borderRadius: 12, color: 'var(--text)', cursor: 'pointer'
                }}>
                  <Chip level={t.lv}>{t.n}</Chip>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{t.d}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="2. 메시지" sub="템플릿: 강풍 경계" style={{ marginBottom: 12 }} action={<Btn size="sm" variant="ghost">템플릿 변경</Btn>}>
            <div style={{ padding: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--orange)', marginBottom: 6 }}>⚠️ 강풍 경계 발령</div>
              풍속 11.2 m/s 측정. 무대 구조물을 점검하고 공연 중지를 검토해주세요. 관객 대피로를 확보하세요.
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>— 진주논개제 안전관리과 · 055-749-8000</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <Btn size="sm" variant="ghost"><Icon name="refresh" size={12}/>AI 다시 작성</Btn>
              <Btn size="sm" variant="ghost"><Icon name="eye" size={12}/>미리보기</Btn>
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>78 / 90자</span>
            </div>
          </Card>

          <Card title="3. 채널">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { i: 'sms', n: 'SMS', on: true, c: '47' },
                { i: 'bell', n: '앱 푸시', on: true, c: '32' },
                { i: 'speaker', n: '현장 방송', on: true, c: '8지점' },
                { i: 'phone', n: '이메일', on: false, c: '47' },
              ].map((c, i) => (
                <button key={i} style={{
                  flex: 1, padding: 14,
                  background: c.on ? 'var(--bg-3)' : 'var(--bg-2)',
                  border: c.on ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                  borderRadius: 10, color: c.on ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                }}>
                  <Icon name={c.i} size={20}/>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.n}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.c}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card title="대상" sub="총 47명에게 발송" style={{ marginBottom: 12 }}>
            {[
              { n: '안전관리책임자', c: 3, on: true },
              { n: '안전요원 (전체)', c: 12, on: true },
              { n: 'A구역 안전요원', c: 4, on: true },
              { n: '의료진', c: 6, on: true },
              { n: '경찰 협력관', c: 2, on: false },
              { n: '소방 협력관', c: 2, on: false },
              { n: '운영 스태프', c: 18, on: true },
            ].map((g, i) => (
              <div key={i} className="list-row" style={{ padding: '10px 0' }}>
                <span className={`check ${g.on ? 'on' : ''}`}>{g.on && <Icon name="check" size={12}/>}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{g.n}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{g.c}명</span>
              </div>
            ))}
          </Card>

          <Card style={{ borderColor: 'rgba(255,94,126,0.4)', background: 'linear-gradient(180deg, rgba(255,94,126,0.06), var(--bg-1))' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: 8 }}>
              <Chip level="red">⚠️ 경고</Chip>
              <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>발송 후 취소 불가</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.55 }}>
              <b style={{ color: 'var(--text)' }}>47명</b>에게 SMS·앱푸시·현장방송이 동시 발송됩니다.
            </div>
            <Btn variant="warn" block size="lg">
              <Icon name="bell" size={14}/>경계 경보 발령
            </Btn>
            <Btn variant="ghost" block style={{ marginTop: 8 }}>임시저장</Btn>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

const Mobile_Alert = () => (
  <Phone label="📱 안전요원 — 수신 알림">
    <div style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>알림</div>
        <Btn size="sm" variant="ghost"><Icon name="filter" size={14}/></Btn>
      </div>

      {/* Latest alert (highlighted) */}
      <Card tinted style={{ borderColor: 'var(--orange)', borderWidth: 1.5, padding: 14, marginBottom: 12, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <Chip level="orange" pulse>NEW</Chip>
        </div>
        <Chip level="orange">⚠️ 강풍 경계</Chip>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
          풍속 11.2 m/s 측정. 무대 구조물을 점검하고 공연 중지를 검토해주세요.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }} className="mono">14:30 · 안전관리과</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
          <Btn size="sm" variant="primary" block>대응 시작</Btn>
          <Btn size="sm" variant="ghost" block>확인</Btn>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 4px 8px' }}>오늘 알림</div>

      {[
        { lv: 'yellow', t: '인파 주의', d: 'A구역 5,420명', time: '14:21' },
        { lv: 'yellow', t: '폭염 주의', d: '28.4°C 지속 상승', time: '13:55' },
        { lv: 'blue', t: '운영 시작 안내', d: '오늘 09:00 ~ 22:00', time: '09:00' },
        { lv: 'blue', t: '교대 안내', d: '12:00 점심 교대', time: '11:30' },
      ].map((a, i) => (
        <div key={i} className="list-row" style={{ padding: '12px 4px', borderBottom: '1px solid var(--line-2)' }}>
          <Chip level={a.lv}>●</Chip>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.t}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.d}</div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.time}</span>
        </div>
      ))}
    </div>
  </Phone>
);

// ═════════════════════════════════════════════════════════════════
// SCREEN 4: 사건/신고
// ═════════════════════════════════════════════════════════════════

const Desktop_Incident = () => (
  <div className="layout">
    <Sidebar active="incident"/>
    <div className="main-col">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>사건 / 신고 관리</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>오늘의 사건 (7)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="seg">
            <button>전체</button>
            <button className="active">진행중 4</button>
            <button>완료 3</button>
          </div>
          <Btn variant="primary"><Icon name="plus" size={14}/>새 사건</Btn>
        </div>
      </div>

      {/* Quick add */}
      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>빠른 등록</span>
          <input className="input full" placeholder="어떤 일이 있었나요? (예: A구역에 부상자 1명)" style={{ flex: 1, background: 'var(--bg-2)' }}/>
          <Btn size="sm" variant="ghost" icon><Icon name="camera" size={14}/></Btn>
          <Btn size="sm" variant="ghost" icon><Icon name="mic" size={14}/></Btn>
          <Btn size="sm" variant="primary">등록</Btn>
        </div>
      </Card>

      {/* List */}
      <Card style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 140px 120px 100px 80px', padding: '12px 16px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--line)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span>단계</span><span>제목</span><span>위치</span><span>담당</span><span>시간</span><span></span>
        </div>
        {[
          { lv: 'red', t: '메인무대 앞 부상자 발생', loc: 'A구역', who: '안전요원 김OO', time: '14:31', status: '대응중' },
          { lv: 'orange', t: '강풍으로 천막 1동 파손', loc: 'B구역 푸드존', who: '시설팀 박OO', time: '14:25', status: '대응중' },
          { lv: 'yellow', t: '주차장 차량 접촉사고', loc: 'D구역', who: '경찰', time: '13:48', status: '대응중' },
          { lv: 'yellow', t: '미끄럼 사고 1건', loc: 'B구역', who: '의료진', time: '12:55', status: '대응중' },
          { lv: 'blue', t: '미아 보호 — 보호자 인계', loc: 'C구역 안내데스크', who: '안내', time: '13:12', status: '완료', done: true },
          { lv: 'blue', t: '음식 알레르기 응급처치', loc: 'B구역', who: '의료진', time: '12:08', status: '완료', done: true },
        ].map((inc, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 140px 120px 100px 80px', padding: '14px 16px', alignItems: 'center', borderBottom: '1px solid var(--line-2)', fontSize: 13, opacity: inc.done ? 0.55 : 1 }}>
            <Chip level={inc.lv}>●</Chip>
            <div>
              <div style={{ fontWeight: 500 }}>{inc.t}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>#{1000 + i}</div>
            </div>
            <span style={{ color: 'var(--text-2)' }}><Icon name="location" size={12}/> {inc.loc}</span>
            <span style={{ color: 'var(--text-2)' }}>{inc.who}</span>
            <span className="mono" style={{ color: 'var(--text-3)', fontSize: 12 }}>{inc.time}</span>
            <Chip level={inc.done ? 'green' : 'orange'}>{inc.status}</Chip>
          </div>
        ))}
      </Card>
    </div>
  </div>
);

const Mobile_Incident = () => (
  <Phone label="📱 안전요원 — 사건 신고">
    <div style={{ padding: '16px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Btn size="sm" variant="ghost" icon><Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }}/></Btn>
        <div style={{ fontSize: 14, fontWeight: 600 }}>새 사건 신고</div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>1 · 사건 유형</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
        {[
          { i: '🩹', n: '부상자', sel: true },
          { i: '🔥', n: '화재' },
          { i: '⚡', n: '정전' },
          { i: '👥', n: '인파' },
          { i: '🌊', n: '침수' },
          { i: '＋', n: '기타' },
        ].map((t, i) => (
          <button key={i} style={{
            padding: '14px 8px',
            background: t.sel ? 'var(--bg-3)' : 'var(--bg-2)',
            border: t.sel ? '1.5px solid var(--accent)' : '1px solid var(--line)',
            borderRadius: 10, color: 'var(--text)', cursor: 'pointer'
          }}>
            <div style={{ fontSize: 22 }}>{t.i}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-2)' }}>{t.n}</div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>2 · 위험도</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {[
          { lv: 'blue', n: '정상' },
          { lv: 'yellow', n: '주의' },
          { lv: 'orange', n: '경계', sel: true },
          { lv: 'red', n: '심각' },
        ].map(t => (
          <button key={t.lv} style={{
            padding: '12px 0',
            background: t.sel ? `rgba(255,154,60,0.15)` : 'var(--bg-2)',
            border: t.sel ? `1.5px solid var(--${t.lv === 'yellow' ? 'yellow' : t.lv})` : '1px solid var(--line)',
            borderRadius: 10, color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600
          }}>
            <Chip level={t.lv}>{t.n}</Chip>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>3 · 위치</div>
      <div className="input full" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="location" size={14} color="var(--accent)"/>
        <span style={{ color: 'var(--text)', flex: 1, fontSize: 13 }}>A구역 · 메인무대 앞</span>
        <Icon name="chevron" size={14}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        <Btn size="sm" variant="ghost" block><Icon name="map" size={12}/>지도 선택</Btn>
        <Btn size="sm" variant="ghost" block><Icon name="location" size={12}/>현재 위치</Btn>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>4 · 상황 설명</div>
      <div className="input full" style={{ minHeight: 80, color: 'var(--text-3)', marginBottom: 8 }}>
        간단히 적어주세요...
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 18 }}>
        <Btn size="sm" variant="ghost" block><Icon name="camera" size={12}/>사진</Btn>
        <Btn size="sm" variant="ghost" block><Icon name="mic" size={12}/>음성</Btn>
      </div>

      <Btn variant="danger" block style={{ padding: 14 }}>🚨 긴급 등록 (즉시 알림)</Btn>
      <Btn block style={{ marginTop: 6 }}>일반 등록</Btn>
    </div>
  </Phone>
);

// ═════════════════════════════════════════════════════════════════
// SCREEN 5: 지도 상황도
// ═════════════════════════════════════════════════════════════════

const Desktop_Map = () => (
  <div className="layout">
    <Sidebar active="map"/>
    <div className="main-col">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>지도 상황도</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>진주논개제 행사장</div>
        </div>
        <div className="seg">
          <button className="active">실시간</button>
          <button>−1h</button>
          <button>−3h</button>
          <button>−6h</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div className="map" style={{ minHeight: 580 }}>
          {/* zone outlines */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <radialGradient id="hot" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,94,94,0.4)"/>
                <stop offset="100%" stopColor="transparent"/>
              </radialGradient>
              <radialGradient id="warm" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(245,196,81,0.3)"/>
                <stop offset="100%" stopColor="transparent"/>
              </radialGradient>
            </defs>
            <path d="M 8 14 L 38 12 L 40 38 L 10 42 Z" fill="rgba(245,196,81,0.06)" stroke="rgba(245,196,81,0.4)" strokeWidth="0.3" strokeDasharray="1 0.6"/>
            <path d="M 44 14 L 74 14 L 76 42 L 46 42 Z" fill="rgba(255,154,60,0.08)" stroke="rgba(255,154,60,0.4)" strokeWidth="0.3" strokeDasharray="1 0.6"/>
            <path d="M 10 48 L 40 48 L 42 76 L 12 78 Z" fill="rgba(77,142,255,0.05)" stroke="rgba(77,142,255,0.3)" strokeWidth="0.3" strokeDasharray="1 0.6"/>
            <path d="M 46 48 L 78 48 L 80 78 L 48 78 Z" fill="rgba(77,142,255,0.05)" stroke="rgba(77,142,255,0.3)" strokeWidth="0.3" strokeDasharray="1 0.6"/>
            <text x="20" y="26" fontSize="2.5" fill="rgba(255,255,255,0.5)" fontFamily="Pretendard">A구역 · 메인무대</text>
            <text x="56" y="28" fontSize="2.5" fill="rgba(255,255,255,0.5)" fontFamily="Pretendard">B구역 · 푸드존</text>
            <text x="22" y="62" fontSize="2.5" fill="rgba(255,255,255,0.5)" fontFamily="Pretendard">C구역 · 부스</text>
            <text x="58" y="62" fontSize="2.5" fill="rgba(255,255,255,0.5)" fontFamily="Pretendard">D구역 · 주차</text>
            {/* heat */}
            <circle cx="56" cy="28" r="14" fill="url(#hot)"/>
            <circle cx="24" cy="28" r="10" fill="url(#warm)"/>
          </svg>

          {[
            { lv: 'red', l: '!', x: 56, y: 28 },
            { lv: 'orange', l: '🚒', x: 48, y: 32 },
            { lv: 'yellow', l: '👥', x: 24, y: 24 },
            { lv: 'blue', l: '🩺', x: 68, y: 60 },
            { lv: 'blue', l: '🅿', x: 22, y: 70 },
            { lv: 'green', l: '🚪', x: 76, y: 18 },
          ].map((p, i) => (
            <div key={i} className={`pin ${p.lv}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <div className="pin-body"><span>{p.l}</span></div>
            </div>
          ))}

          {/* Map controls */}
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Btn size="sm" icon><Icon name="plus" size={14}/></Btn>
            <Btn size="sm" icon><span style={{ fontWeight: 700 }}>−</span></Btn>
            <Btn size="sm" icon><Icon name="location" size={14}/></Btn>
          </div>

          {/* Map legend */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, padding: 10, background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(8px)', borderRadius: 10, border: '1px solid var(--line)', display: 'flex', gap: 14, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }}/>심각</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)' }}/>경계</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)' }}/>주의</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }}/>시설</span>
          </div>
        </div>

        <div>
          <Card title="레이어" style={{ marginBottom: 12 }}>
            {[
              { n: '인파 히트맵', on: true },
              { n: '사건 / 사고', on: true },
              { n: '안전요원 위치', on: true },
              { n: '의료시설', on: true },
              { n: '대피경로', on: false },
              { n: '소화전·AED', on: false },
            ].map((l, i) => (
              <div key={i} className="list-row" style={{ padding: '8px 0' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{l.n}</span>
                <span style={{
                  width: 32, height: 18, borderRadius: 9, background: l.on ? 'var(--accent)' : 'var(--bg-3)',
                  border: '1px solid var(--line)', position: 'relative', flexShrink: 0
                }}>
                  <span style={{ position: 'absolute', top: 1, left: l.on ? 15 : 1, width: 14, height: 14, borderRadius: '50%', background: 'white' }}/>
                </span>
              </div>
            ))}
          </Card>

          <Card title="활성 사건 5">
            {[
              { lv: 'red', t: '부상자 발생', loc: 'A구역' },
              { lv: 'orange', t: '천막 파손', loc: 'B구역' },
              { lv: 'yellow', t: '인파 집중', loc: 'A구역' },
              { lv: 'blue', t: '미아 보호중', loc: 'C구역' },
            ].map((inc, i) => (
              <div key={i} className="list-row" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
                <Chip level={inc.lv}>●</Chip>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{inc.t}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{inc.loc}</div>
                </div>
                <Btn size="sm" variant="ghost" icon><Icon name="arrow" size={12}/></Btn>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  </div>
);

const Mobile_Map = () => (
  <Phone label="📱 모바일 — 지도 상황도">
    <div style={{ position: 'relative', height: 720 }}>
      {/* Full-bleed map */}
      <div className="map" style={{ position: 'absolute', inset: 0, borderRadius: 0, border: 'none', minHeight: 0 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d="M 8 14 L 38 12 L 40 38 L 10 42 Z" fill="rgba(245,196,81,0.08)" stroke="rgba(245,196,81,0.3)" strokeWidth="0.3"/>
          <path d="M 44 14 L 74 14 L 76 42 L 46 42 Z" fill="rgba(255,154,60,0.08)" stroke="rgba(255,154,60,0.3)" strokeWidth="0.3"/>
          <defs>
            <radialGradient id="hot2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,94,94,0.5)"/>
              <stop offset="100%" stopColor="transparent"/>
            </radialGradient>
          </defs>
          <circle cx="56" cy="28" r="14" fill="url(#hot2)"/>
        </svg>
        <div className="pin red" style={{ left: '56%', top: '28%' }}>
          <div className="pin-body"><span>!</span></div>
        </div>
        <div className="pin yellow" style={{ left: '24%', top: '24%' }}>
          <div className="pin-body"><span>👥</span></div>
        </div>
        <div className="pin blue" style={{ left: '68%', top: '60%' }}>
          <div className="pin-body"><span>🩺</span></div>
        </div>
      </div>

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 14, display: 'flex', gap: 8, background: 'linear-gradient(180deg, rgba(10,10,15,0.9), transparent)' }}>
        <div className="input" style={{ flex: 1, background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="search" size={14} color="var(--text-3)"/>
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>구역·사건 검색</span>
        </div>
        <Btn size="sm" icon style={{ background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(8px)' }}><Icon name="layers" size={14}/></Btn>
      </div>

      {/* Bottom sheet */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--bg-1)', borderRadius: '20px 20px 0 0', padding: '14px 18px 28px', borderTop: '1px solid var(--line)' }}>
        <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 12px' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Chip level="red" pulse>심각</Chip>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }} className="mono">14:31 · 1분 전</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>메인무대 앞 부상자 발생</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>A구역 · 담당 김OO 안전요원 · 의료진 출동중</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Btn variant="primary" block><Icon name="phone" size={14}/>담당자 연결</Btn>
          <Btn block><Icon name="arrow" size={14}/>상세 보기</Btn>
        </div>
      </div>
    </div>
  </Phone>
);

// ─── SCREEN MAP ────────────────────────────────────────────────
const SCREENS = [
  {
    id: 'dashboard', num: '01', title: '대시보드',
    sub: '관제센터 첫 화면 — 종합 위험도와 7개 카테고리를 한눈에',
    note: '사이드바 + 7개 카테고리 메트릭 그리드 + 활성 경보 + 권장 조치. 가장 위험한 항목을 상단 배너로 강조.',
    desktop: Desktop_Dashboard, mobile: Mobile_Dashboard, mobileLabel: '관리자 모바일'
  },
  {
    id: 'monitor', num: '02', title: '실시간 모니터링',
    sub: '단일 카테고리 깊이 보기 — 임계값·차트·체크리스트',
    note: '카테고리 칩으로 전환. 큰 수치 + 24h 추이 차트(임계값 라인) + 임계값 표 + 대응 체크리스트.',
    desktop: Desktop_Monitor, mobile: Mobile_Counter, mobileLabel: '현장 계수원'
  },
  {
    id: 'alert', num: '03', title: '알림 / 경보 발령',
    sub: '단계 → 메시지 → 채널 → 대상 → 발령',
    note: '오발송 위험이 큰 화면. 단계별 색상, 대상 명수, 발송 후 취소불가 경고 강조. 모바일은 수신자 입장.',
    desktop: Desktop_Alert, mobile: Mobile_Alert, mobileLabel: '안전요원 수신'
  },
  {
    id: 'incident', num: '04', title: '사건 / 신고',
    sub: '오늘의 사건 목록 + 빠른 등록',
    note: '리스트 뷰가 메인. 데스크톱은 표 형식, 모바일은 단계별 입력으로 현장에서 빠르게 등록.',
    desktop: Desktop_Incident, mobile: Mobile_Incident, mobileLabel: '현장 안전요원'
  },
  {
    id: 'map', num: '05', title: '지도 상황도',
    sub: '구역·핀·히트맵으로 공간 정보',
    note: '레이어 토글, 시간대 스크러버, 사건 핀 클릭 시 상세. 모바일은 전체화면 지도 + 바텀시트.',
    desktop: Desktop_Map, mobile: Mobile_Map, mobileLabel: '관리자 모바일'
  },
];

Object.assign(window, { SCREENS, Icon, Card, Chip, Btn, Sidebar, Phone, Metric });
