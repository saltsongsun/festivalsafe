# 🏮 축제 재난안전 모니터링 — Vercel + Supabase 배포 가이드

## 전체 흐름 (약 15분)

```
Step 1: Supabase 프로젝트 생성 (5분)
Step 2: GitHub 저장소 생성 (3분)
Step 3: Vercel 배포 (3분)
Step 4: 접속 후 설정 (4분)
```

---

## Step 1: Supabase 설정

### 1-1. 프로젝트 생성

```
1. https://supabase.com 접속 → GitHub로 로그인
2. "New Project" 클릭
3. 입력:
   - Organization: 기본값 사용
   - Project name: festival-safety
   - Database password: 비밀번호 설정 (기억해두세요!)
   - Region: Northeast Asia (Tokyo)
4. "Create new project" → 2~3분 대기
```

### 1-2. 테이블 생성

```
1. 좌측 메뉴 "SQL Editor" 클릭
2. "New query" 클릭
3. 프로젝트 폴더의 supabase-setup.sql 파일 내용을 전체 복사 → 붙여넣기
4. "Run" 클릭
5. "Success" 확인
```

### 1-3. API 키 확인

```
1. 좌측 메뉴 "Project Settings" (⚙️ 톱니바퀴)
2. "API" 탭 클릭
3. 아래 두 값을 복사해두세요:

   Project URL:  https://xxxxxxxx.supabase.co
   anon public:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...
```

⚠️ **service_role 키는 절대 사용하지 마세요!** anon (public) 키만 사용합니다.

---

## Step 2: GitHub 저장소 생성

### 방법 A: 웹 브라우저로 (가장 쉬움)

```
1. https://github.com 로그인
2. 우측 상단 "+" → "New repository"
3. Repository name: festival-safety
4. Public 선택
5. "Create repository" 클릭
6. "uploading an existing file" 클릭
7. 이 폴더의 모든 파일을 드래그앤드롭:
   - package.json
   - vite.config.js
   - vercel.json
   - index.html
   - .gitignore
   - src/main.jsx
   - src/App.jsx
8. "Commit changes" 클릭
```

### 방법 B: Git CLI로

```bash
cd festival-safety
git init
git add .
git commit -m "축제 안전관리 시스템"
git branch -M main
git remote add origin https://github.com/[당신의계정]/festival-safety.git
git push -u origin main
```

---

## Step 3: Vercel 배포

```
1. https://vercel.com 접속 → GitHub로 로그인
2. "Add New" → "Project"
3. "Import Git Repository" → "festival-safety" 선택 → "Import"
4. ⚡ 환경변수 설정 (중요!):
   "Environment Variables" 섹션을 열고:

   Name: VITE_SUPABASE_URL
   Value: https://xxxxxxxx.supabase.co    ← Step 1-3에서 복사한 값

   Name: VITE_SUPABASE_ANON_KEY
   Value: eyJhbGciOi...                  ← Step 1-3에서 복사한 값

5. "Deploy" 클릭
6. 2~3분 후 완료!
7. 배포된 URL 확인: https://festival-safety-xxx.vercel.app
```

---

## Step 4: 접속 후 설정

배포된 URL에 접속합니다.

### 기본 로그인 계정

| 아이디 | 비밀번호 | 권한 |
|--------|----------|------|
| admin | admin1234 | 관리자 (모든 기능) |
| counter1 | 1234 | 계수원 (인파계수+대시보드) |
| viewer | view | 상황실 (대시보드만) |

### 초기 설정 체크리스트

```
관리(CMS) → 🔧 설정 에서:

□ 운영 시간 설정 (예: 09:00 ~ 22:00)
□ 축제명, 관리기관, 연락처 수정
□ 📍 위치 → "자동 위치" 또는 수동 좌표 입력
□ 📐 순면적 입력 → 인파 기준 자동 적용

관리(CMS) → 🌤️ 기상청 에서:

□ 기상청 API 인증키 확인 (기본 입력됨)
□ 격자 좌표 확인 (위치 기반 자동 계산)
□ "테스트 호출" 버튼 → 데이터 수신 확인

관리(CMS) → 📱 SMS 에서:

□ Solapi API Key/Secret 입력
□ 발신번호 등록
□ 안전관리책임자 연락처 추가
□ 안전요원 연락처 추가
□ SMS 활성화

관리(CMS) → 🗺️ 구역 에서:

□ 구역 추가 (A구역, B구역 ...)
□ 구역범위 입력 (예: 동문~남문)
□ 담당자 이름 입력

관리(CMS) → 👤 계정관리 에서:

□ admin 비밀번호 변경
□ 계수원 계정 추가 (구역당 1명)
□ 상황실/관리자 계정 추가
```

---

## 운영 구조

```
┌─────────────────────────────────────────┐
│              Vercel (프론트엔드)           │
│    https://festival-safety.vercel.app    │
├─────────────────────────────────────────┤
│  📊 대시보드    👥 인파계수    ⚙️ CMS     │
│  (상황실 모니터) (계수원 모바일) (관리자)    │
└───────────────┬─────────────────────────┘
                │ API 호출
┌───────────────┴─────────────────────────┐
│           Supabase (백엔드 DB)            │
│    실시간 데이터 공유 + Realtime 구독      │
│    모든 기기가 같은 데이터를 봅니다        │
└───────────────┬─────────────────────────┘
                │
    ┌───────────┴───────────┐
    │   기상청 API (날씨)    │
    │   Solapi API (SMS)     │
    └───────────────────────┘
```

---

## QR코드 활용

각 역할별 접속 URL을 QR코드로 만들어 배포하면 편리합니다.
(URL은 모두 동일하며, 로그인 계정에 따라 화면이 달라집니다)

QR코드 생성: https://qr.io 또는 https://goqr.me

---

## 문제 해결

### "Supabase 미설정" 메시지가 뜰 때
→ Vercel 환경변수가 올바르게 설정되었는지 확인
→ Vercel Dashboard → Settings → Environment Variables

### 기상청 API 데이터가 안 올 때
→ CMS → 기상청 → 테스트 호출로 확인
→ 인증키가 만료되었을 수 있음 → data.go.kr에서 재발급

### 여러 기기에서 데이터가 동기화 안 될 때
→ Supabase Dashboard → Database → Replication → app_state 테이블 활성화 확인
→ 브라우저 새로고침

### Supabase 프로젝트가 일시정지됨
→ 무료 플랜은 1주일 미접속 시 자동 정지
→ Supabase Dashboard에서 "Resume project" 클릭
→ 축제 전날 미리 접속하여 깨워두세요

---

## 비용

| 서비스 | 무료 한도 | 예상 비용 |
|--------|----------|----------|
| Vercel | 월 100GB 트래픽 | **무료** |
| Supabase | 500MB DB, 5만 MAU | **무료** |
| 기상청 API | 일 10,000건 | **무료** |
| Solapi SMS | - | 건당 ~20원 |

축제 기간 동안 완전 무료로 운영 가능합니다. (SMS 제외)
