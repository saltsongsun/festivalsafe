# 🚨 SAFEFLOW 동기화 최종 해결 가이드

## 현재 상황
- 사이트(festivalsafe.vercel.app)가 **"앱 로드 실패"** 상태
- 빌드 자체가 깨진 것으로 보임

## ✅ 해결 절차 (순서 중요!)

### 1️⃣ 깨진 파일 정리

이전에 만든 파일들 중 다음을 **삭제** 또는 **빈 파일로 교체**:

```bash
# 옵션 A: 삭제
rm src/supabaseClient.js

# 옵션 B: 빈 파일로 (사용자가 안전하게 작업하고 싶을 때)
echo "// placeholder" > src/supabaseClient.js
```

### 2️⃣ 새 파일 3개 교체

다음 3개 파일을 **반드시** 새 버전으로 교체:

| 파일 | 위치 | 핵심 |
|------|------|------|
| `index.html` | 루트 | **여기에 Supabase 로직 통합** ⭐ |
| `src/main.jsx` | src/ | 단순 (supabaseClient import 없음) |
| `src/App.jsx` | src/ | 메인 앱 (동기화 코드 정리) |

### 3️⃣ package.json 정리

`@supabase/supabase-js`가 dependencies에 있어도 OK (사용 안 함, 무시됨)
없어도 OK

### 4️⃣ Git push → Vercel 자동 배포 → 1분 대기

---

## 📱 배포 후 사용

### 시나리오 A: Vercel 환경변수 정상 작동

```
앱 시작 → main.jsx가 환경변수를 localStorage에 저장
  ↓
0.5초 후 자동 새로고침
  ↓
index.html이 localStorage에서 읽어 Supabase 초기화
  ↓
✅ 콘솔: "[SAFEFLOW] ✅ Realtime 구독 성공"
✅ 동기화 작동 시작
```

### 시나리오 B: 환경변수 없음 / 작동 안 함

```
앱 시작 → 콘솔에 "Supabase 설정 필요" 메시지
  ↓
로그인 → ⚙️ 관리 메뉴 → 🔄 기기간 동기화 카드 표시
  ↓
"❌ 설정 필요" 상태 → [설정] 버튼 클릭
  ↓
Supabase URL/Key 직접 입력 → [✅ 저장 + 연결 테스트]
  ↓
연결 성공 → 자동 새로고침
  ↓
✅ 동기화 작동 시작
```

---

## 🔍 작동 확인 (F12 콘솔)

```
정상:
[SAFEFLOW] Supabase 로딩 중... https://xxx.supabase.co
[SAFEFLOW] ✅ Supabase 연결 완료
[SAFEFLOW] Realtime: SUBSCRIBED
[SAFEFLOW] ✅ Realtime 구독 성공 - 기기간 동기화 활성화

다른 기기에서 데이터 변경 시:
[SAFEFLOW] 📡 동기화 수신: festival_default_set_v10
```

---

## ⚠️ 그래도 안 되면

### 1. 콘솔 에러 확인

- `Failed to fetch` → 인터넷 연결 또는 Supabase 일시 정지
- `CHANNEL_ERROR` → Database → Replication 토글 OFF
- `JWT expired` → anon key 만료/잘못됨
- `relation "app_state" does not exist` → 테이블 미생성 (SQL 다시 실행)

### 2. PWA 캐시 강제 삭제

브라우저에서:
- Chrome: F12 → Application → Storage → Clear site data
- iOS: 설정 → Safari → 고급 → 웹사이트 데이터 → 삭제
- 또는 PWA 앱 삭제 후 재설치

### 3. URL에 ?reset=1 추가

```
https://festivalsafe.vercel.app/?reset=1
```

모든 localStorage/sessionStorage 초기화 후 깨끗한 상태로 시작

### 4. 콘솔에서 직접 확인

```javascript
// Supabase 객체 존재 확인
window.storage
// → object {get, set, delete, list} 가 나와야 함

// 연결 테스트
window._safeflow.checkConnection()
// → ✅ Supabase 정상 - app_state 레코드: N

// 저장된 키 보기
window._safeflow.listKeys()
// → 테이블 형식으로 키 목록
```

### 5. Supabase 직접 점검

Supabase 대시보드에서:
- ✅ `app_state` 테이블 존재
- ✅ Database → Replication에서 `app_state` 토글 ON
- ✅ SQL Editor에서:
  ```sql
  SELECT count(*) FROM app_state;
  -- 에러 없이 숫자 나와야 함
  ```
- ✅ RLS 정책:
  ```sql
  -- 모두 허용 (개발용)
  CREATE POLICY "Public all" ON app_state FOR ALL USING (true);
  ```

---

## 🎯 핵심 변경점

이번 버전의 차별점:

| 항목 | 이전 | 신규 |
|------|------|------|
| Supabase 로드 | main.jsx (빌드 실패 가능) | **index.html (빌드 무관)** ⭐ |
| npm 의존성 | 필요 | **불필요** (ESM CDN) |
| 환경변수 | 빌드 시 치환 필요 | **없어도 화면에서 입력 가능** |
| 빌드 실패 시 | 앱 자체 안 뜸 | **앱은 뜨고 동기화만 OFF** |
| 디버그 | 콘솔만 | **화면에서 상태 확인** |

---

배포 후에도 안 된다면 **F12 콘솔의 정확한 에러 메시지**를 알려주세요!
