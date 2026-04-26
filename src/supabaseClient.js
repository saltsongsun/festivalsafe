// src/supabaseClient.js
// SAFEFLOW 기기간 동기화 - Supabase 클라이언트
// 기존 app_state 테이블 사용

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 10 } }
  });
  console.log('[SAFEFLOW] ✅ Supabase 연결됨:', SUPABASE_URL);
} else {
  console.error('[SAFEFLOW] ❌ Supabase 환경변수 미설정');
  console.error('  Vercel → Settings → Environment Variables에 추가 필요:');
  console.error('  - VITE_SUPABASE_URL');
  console.error('  - VITE_SUPABASE_ANON_KEY');
}

// ─── window.storage 인터페이스 (usePersist에서 호출) ───────────────
window.storage = {
  // 키 조회
  async get(key) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('app_state')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        console.error('[storage.get]', key, error.message);
        return null;
      }
      if (!data) return null;

      // value가 JSONB로 저장되므로 객체 그대로 옴
      // usePersist는 JSON 문자열을 기대하므로 변환
      const v = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
      return { value: v };
    } catch (e) {
      console.error('[storage.get] 예외:', key, e);
      return null;
    }
  },

  // 키 저장 (upsert)
  async set(key, value) {
    if (!supabase) return null;
    try {
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      // value를 JSON 객체로 파싱하여 JSONB 컬럼에 저장
      let storedValue;
      try { storedValue = JSON.parse(v); } catch { storedValue = v; }

      const { error } = await supabase
        .from('app_state')
        .upsert(
          { key, value: storedValue, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );

      if (error) {
        console.error('[storage.set]', key, error.message);
        return null;
      }
      return { value: v };
    } catch (e) {
      console.error('[storage.set] 예외:', key, e);
      return null;
    }
  },

  // 키 삭제
  async delete(key) {
    if (!supabase) return null;
    try {
      const { error } = await supabase.from('app_state').delete().eq('key', key);
      if (error) return null;
      return { deleted: true };
    } catch (e) { return null; }
  },

  // 키 목록
  async list(prefix) {
    if (!supabase) return null;
    try {
      let q = supabase.from('app_state').select('key');
      if (prefix) q = q.like('key', `${prefix}%`);
      const { data, error } = await q;
      if (error) return null;
      return { keys: (data || []).map(d => d.key) };
    } catch (e) { return null; }
  },
};

// ─── Realtime 구독 - 다른 기기 변경 시 즉시 수신 ──────────────────
if (supabase) {
  // app_state 변경 감지
  supabase
    .channel('app_state_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state' },
      (payload) => {
        const row = payload.new || payload.old;
        if (!row?.key) return;

        const v = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);

        // usePersist가 듣는 이벤트 디스패치
        window.dispatchEvent(new CustomEvent('supabase-sync', {
          detail: { key: row.key, value: v }
        }));

        console.log('[SAFEFLOW] 📡 동기화 수신:', row.key.slice(0, 50));
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[SAFEFLOW] ✅ Realtime 구독 성공 (app_state)');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[SAFEFLOW] ❌ Realtime 오류 - Database → Replication에서 app_state 토글 ON 확인');
      } else if (status === 'TIMED_OUT') {
        console.warn('[SAFEFLOW] ⏱️ Realtime 타임아웃');
      }
    });

  // crowd_realtime 변경 감지 (인파 카운터)
  supabase
    .channel('crowd_realtime_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'crowd_realtime' },
      (payload) => {
        const row = payload.new;
        if (!row) return;
        window.dispatchEvent(new CustomEvent('crowd-sync', {
          detail: { total: row.total, cumulative: row.cumulative, zones: row.zones }
        }));
        console.log('[SAFEFLOW] 👥 인파 동기화:', row.total);
      }
    )
    .subscribe();
}

// ─── 디버깅 헬퍼 (콘솔에서 호출 가능) ────────────────────────
window._safeflow = {
  async checkConnection() {
    if (!supabase) {
      console.error('❌ Supabase 미연결 - 환경변수 확인');
      return false;
    }
    try {
      const { count, error } = await supabase
        .from('app_state')
        .select('*', { count: 'exact', head: true });
      if (error) {
        console.error('❌ DB 접근 실패:', error.message);
        return false;
      }
      console.log('✅ Supabase 정상 - app_state 레코드:', count);
      return true;
    } catch (e) {
      console.error('❌ 예외:', e);
      return false;
    }
  },

  async listKeys() {
    if (!supabase) return [];
    const { data } = await supabase.from('app_state').select('key, updated_at').order('updated_at', { ascending: false });
    console.table(data);
    return data;
  },

  async clearAll() {
    if (!confirm('⚠️ Supabase의 모든 데이터를 삭제하시겠습니까?')) return;
    if (!supabase) return;
    await supabase.from('app_state').delete().neq('key', '___never');
    console.log('✅ 모든 데이터 삭제됨');
    location.reload();
  },
};

export { supabase };
