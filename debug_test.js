// Console 逐行粘贴测试 CSI/S-LANSS 能否保存到 Supabase
// 第1行
var r1=await fetch('https://agjjwugkrdurbcrgilhw.supabase.co/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'e2e-check-fdkjsldf-1784182097@nrm-default.app',password:'E2Epass123!'})})
// 回车

// 第2行
var t=await r1.json()
// 回车

// 第3行
var b={id:crypto.randomUUID(),org_id:'00000000-0000-0000-0000-000000000001',patient_id:'aaaaaaaa-0000-4000-8000-000000000001',encounter_id:'bbbbbbbb-cccc-4ddd-8eee-000000000001',type:'pain_assessment',payload:{csi:{items:{1:2,2:3},total:5,severity:'mild'},slanss:{items:{1:1,2:0},total:1,positive:false}},created_at:new Date().toISOString(),created_by:null}
// 回车

// 第4行
var r2=await fetch('https://agjjwugkrdurbcrgilhw.supabase.co/rest/v1/assessments',{method:'POST',headers:{'Content-Type':'application/json','apikey':'sb_publishable_OgDm-yiaWFfn_x-U9Tcwjg_pH0sbpR4','Authorization':'Bearer '+t.access_token,'Prefer':'return=representation'},body:JSON.stringify(b)})
// 回车

// 第5行
console.log('HTTP',r2.status,await r2.text())
// 回车 -> 贴结果
