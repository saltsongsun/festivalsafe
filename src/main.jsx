import React from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import App from './App.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase = null
try {
  if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
    supabase = createClient(supabaseUrl, supabaseKey)
    console.log('✅ Supabase 연결:', supabaseUrl)
  } else {
    console.log('⚠️ Supabase 미설정 → localStorage 모드')
  }
} catch (e) { console.warn('Supabase 초기화 실패:', e) }

window.storage = supabase ? {
  async get(key) {
    try {
      const { data } = await supabase.from('app_state').select('value').eq('key', key).maybeSingle()
      if (!data) { const v = localStorage.getItem(key); return v ? { key, value: v } : null }
      return { key, value: JSON.stringify(data.value) }
    } catch { const v = localStorage.getItem(key); return v ? { key, value: v } : null }
  },
  async set(key, value) {
    try { await supabase.from('app_state').upsert({ key, value: JSON.parse(value), updated_at: new Date().toISOString() }, { onConflict: 'key' }) } catch {}
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

window.crowdDB = supabase ? {
  async get() {
    try {
      const { data } = await supabase.from('crowd_realtime').select('*').eq('id', 'main').maybeSingle()
      return data || { total: 0, cumulative: 0, zones: [] }
    } catch {
      try { return JSON.parse(localStorage.getItem('_crowd') || '{}') } catch { return { total: 0, cumulative: 0, zones: [] } }
    }
  },
  async set(total, cumulative, zones, updatedBy) {
    const obj = { total, cumulative: cumulative || 0, zones: zones || [], updated_by: updatedBy || '', updated_at: new Date().toISOString() }
    localStorage.setItem('_crowd', JSON.stringify(obj))
    try { await supabase.from('crowd_realtime').upsert({ id: 'main', ...obj }, { onConflict: 'id' }) } catch {}
    return obj
  }
} : {
  async get() { try { return JSON.parse(localStorage.getItem('_crowd') || '{"total":0,"cumulative":0,"zones":[]}') } catch { return { total: 0, cumulative: 0, zones: [] } } },
  async set(total, cumulative, zones, updatedBy) {
    const obj = { total, cumulative: cumulative || 0, zones: zones || [], updated_by: updatedBy || '' }
    localStorage.setItem('_crowd', JSON.stringify(obj))
    return obj
  }
}

if (supabase) {
  supabase.channel('sync_state')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (p) => {
      if (p.new?.key && p.new?.value) window.dispatchEvent(new CustomEvent('supabase-sync', { detail: { key: p.new.key, value: p.new.value } }))
    }).subscribe()

  supabase.channel('sync_crowd')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crowd_realtime' }, (p) => {
      if (p.new) {
        localStorage.setItem('_crowd', JSON.stringify(p.new))
        window.dispatchEvent(new CustomEvent('crowd-update', { detail: p.new }))
      }
    }).subscribe()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
