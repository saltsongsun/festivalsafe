import React from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import App from './App.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase = null
if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
  supabase = createClient(supabaseUrl, supabaseKey)
  console.log('✅ Supabase 연결:', supabaseUrl)
} else {
  console.log('⚠️ Supabase 미설정 → localStorage 모드')
}

// ─── 일반 상태 Storage ───────────────────────────────────────────
window.storage = supabase ? {
  async get(key) {
    try {
      const { data } = await supabase.from('app_state').select('value').eq('key', key).maybeSingle()
      if (!data) { const v = localStorage.getItem(key); return v ? { key, value: v } : null }
      return { key, value: JSON.stringify(data.value) }
    } catch { const v = localStorage.getItem(key); return v ? { key, value: v } : null }
  },
  async set(key, value) {
    try {
      const parsed = JSON.parse(value)
      await supabase.from('app_state').upsert({ key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    } catch {}
    localStorage.setItem(key, value)
    return { key, value }
  },
  async delete(key) { try { await supabase.from('app_state').delete().eq('key', key) } catch {} localStorage.removeItem(key); return { key, deleted: true } },
  async list(prefix) { try { const { data } = await supabase.from('app_state').select('key'); return { keys: (data||[]).map(d=>d.key).filter(k=>!prefix||k.startsWith(prefix)) } } catch { return { keys: [] } } }
} : {
  async get(key) { const v = localStorage.getItem(key); return v ? { key, value: v } : null },
  async set(key, value) { localStorage.setItem(key, value); return { key, value } },
  async delete(key) { localStorage.removeItem(key); return { key, deleted: true } },
  async list(prefix) { const keys=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!prefix||k.startsWith(prefix))keys.push(k)} return{keys} }
}

// ─── 인파 전용 DB ────────────────────────────────────────────────
window.crowdDB = supabase ? {
  async get() {
    try {
      const { data } = await supabase.from('crowd_realtime').select('*').eq('id', 'main').maybeSingle()
      return data || { total: 0, zones: [] }
    } catch { return JSON.parse(localStorage.getItem('_crowd') || '{"total":0,"zones":[]}') }
  },
  async set(total, zones, updatedBy) {
    const obj = { total, zones: zones || [], updated_by: updatedBy || '', updated_at: new Date().toISOString() }
    try { await supabase.from('crowd_realtime').upsert({ id: 'main', ...obj }, { onConflict: 'id' }) } catch {}
    localStorage.setItem('_crowd', JSON.stringify(obj))
    return obj
  }
} : {
  async get() { return JSON.parse(localStorage.getItem('_crowd') || '{"total":0,"zones":[]}') },
  async set(total, zones, updatedBy) {
    const obj = { total, zones: zones || [], updated_by: updatedBy || '' }
    localStorage.setItem('_crowd', JSON.stringify(obj))
    return obj
  }
}

// ─── Realtime 구독 ───────────────────────────────────────────────
if (supabase) {
  // ★ app_state: 이벤트만 전달 (localStorage 덮어쓰기 안 함 → 타이핑 깨짐 방지)
  supabase.channel('sync_state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (p) => {
      if (p.new?.key && p.new?.value) {
        window.dispatchEvent(new CustomEvent('supabase-sync', { detail: { key: p.new.key, value: p.new.value } }))
      }
    })
    .subscribe()

  // crowd_realtime: 계수원 입력은 즉시 반영 필요
  supabase.channel('sync_crowd')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crowd_realtime' }, (p) => {
      if (p.new) {
        localStorage.setItem('_crowd', JSON.stringify(p.new))
        window.dispatchEvent(new CustomEvent('crowd-update', { detail: p.new }))
      }
    })
    .subscribe()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
