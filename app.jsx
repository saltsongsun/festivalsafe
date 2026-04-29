/* global React, ReactDOM, SCREENS, Icon */
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "sidebar": "left",
  "density": "default",
  "showMobile": true,
  "view": "dual"
}/*EDITMODE-END*/;

const App = () => {
  const [active, setActive] = useState(0);
  const [view, setView] = useState('both');
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const screen = SCREENS[active];
  const Desktop = screen.desktop;
  const Mobile = screen.mobile;

  const densityClass = tweaks.density === 'compact' ? 'compact' : tweaks.density === 'spacious' ? 'spacious' : '';

  return (
    <>
      <div className="tabs">
        {SCREENS.map((s, i) => (
          <button key={s.id} className={`tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)} data-screen-label={`${s.num} ${s.title}`}>
            <span className="num">{s.num}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>

      <div className={`screen ${densityClass}`}>
        <div className="screen-head">
          <h1 className="screen-title">{screen.title}</h1>
          <p className="screen-sub">{screen.sub}</p>
          <div className="screen-note">
            <span className="lbl">NOTE</span>
            <span>{screen.note}</span>
          </div>
        </div>

        <div className="controls">
          <span className="ctrl-label">VIEW</span>
          <div className="seg">
            <button className={view === 'both' ? 'active' : ''} onClick={() => setView('both')}>⊞ 듀얼 뷰 (권장)</button>
            <button className={view === 'desktop' ? 'active' : ''} onClick={() => setView('desktop')}>🖥️ 데스크톱만</button>
            <button className={view === 'mobile' ? 'active' : ''} onClick={() => setView('mobile')}>📱 모바일만</button>
          </div>
        </div>

        {view === 'desktop' && <Desktop tweaks={tweaks}/>}
        {view === 'mobile' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Mobile/>
          </div>
        )}
        {view === 'both' && (
          <div className="dual-stage">
            <div className="dual-desktop">
              <div className="stage-tag"><span className="sdot"/>관제센터 · 데스크톱</div>
              <Desktop tweaks={tweaks}/>
            </div>
            <div className="dual-mobile">
              <div className="stage-tag"><span className="sdot"/>현장 · 모바일</div>
              <Mobile/>
            </div>
          </div>
        )}

        <div className="scratch">
          <h4>📝 다음 단계</h4>
          <ul>
            <li>듀얼 뷰에서 데스크톱 관제 + 현장 모바일이 어떻게 함께 동작하는지 확인하세요.</li>
            <li>마음에 드는 화면을 알려주시면 충실도를 올려 동작하는 프로토타입으로 발전시킵니다.</li>
            <li>오른쪽 하단 <b>Tweaks</b>에서 사이드바 위치 / 정보 밀도 조정 가능.</li>
          </ul>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="레이아웃">
          <TweakRadio label="사이드바" value={tweaks.sidebar}
            options={[{value:'left',label:'왼쪽'},{value:'right',label:'오른쪽'},{value:'top',label:'상단'}]}
            onChange={v => setTweak('sidebar', v)}/>
          <TweakRadio label="정보 밀도" value={tweaks.density}
            options={[{value:'compact',label:'촘촘'},{value:'default',label:'기본'},{value:'spacious',label:'여유'}]}
            onChange={v => setTweak('density', v)}/>
        </TweakSection>
      </TweaksPanel>

      <style>{`
        .layout { flex-direction: ${tweaks.sidebar === 'right' ? 'row-reverse' : 'row'}; }
        ${tweaks.sidebar === 'top' ? `
          .layout { flex-direction: column; }
          .sidebar { width: 100%; position: static; display: flex; flex-wrap: wrap; padding: 8px; gap: 4px; }
          .sb-section { display: none; }
          .sb-item { padding: 6px 12px; }
        ` : ''}
      `}</style>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
