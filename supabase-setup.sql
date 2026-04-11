-- ============================================================
-- 축제 재난안전 모니터링 — Supabase 테이블 (v2)
-- ⚠️ 기존 테이블을 삭제하고 재생성합니다
-- Supabase Dashboard → SQL Editor 에서 실행하세요
-- ============================================================

DROP TABLE IF EXISTS crowd_realtime CASCADE;
DROP TABLE IF EXISTS app_state CASCADE;
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS sms_log CASCADE;
DROP TABLE IF EXISTS crowd_log CASCADE;

-- 1) 앱 상태 (설정, 카테고리, 알림 등 일반 데이터)
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) ★ 인파 전용 테이블 (계수원↔관리자 충돌 방지)
CREATE TABLE crowd_realtime (
  id TEXT PRIMARY KEY DEFAULT 'main',
  total INTEGER DEFAULT 0,
  zones JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT ''
);

INSERT INTO crowd_realtime (id, total, zones) VALUES ('main', 0, '[]');

-- 3) 알림 이력
CREATE TABLE alert_history (
  id BIGSERIAL PRIMARY KEY,
  category TEXT, level TEXT, message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) SMS 이력
CREATE TABLE sms_log (
  id BIGSERIAL PRIMARY KEY,
  success BOOLEAN DEFAULT false, preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime 활성화
ALTER TABLE app_state REPLICA IDENTITY FULL;
ALTER TABLE crowd_realtime REPLICA IDENTITY FULL;

-- RLS (모두 허용)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all" ON app_state FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE crowd_realtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all" ON crowd_realtime FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all" ON alert_history FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all" ON sms_log FOR ALL USING (true) WITH CHECK (true);

-- Publication
ALTER PUBLICATION supabase_realtime ADD TABLE app_state;
ALTER PUBLICATION supabase_realtime ADD TABLE crowd_realtime;
