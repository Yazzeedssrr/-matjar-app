const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const src=readFileSync('assets/makhraj-app.js','utf8');
function context(){
 const nodes=new Map();
 const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',isConnected:true,focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}});return nodes.get(s);};
 const c={state:{session:{user:{id:'self'}},profile:{full_name:'Existing Name',phone:'3135550123'}},els:{panel:{}},
 $:s=>s==='#recoveryPassword'?null:node(s),esc:String,openSheet:html=>c.html=html,closeSheet:()=>c.closed=true,
 renderAccount:()=>{},toast:()=>{},Date,Error};
 vm.createContext(c);
 vm.runInContext(src.slice(src.indexOf('  function maybeOnboard('),src.indexOf('  async function loadProfile('))+
 src.slice(src.indexOf('  function profileModal('),src.indexOf('  function renderFavArea(')),c);
 return {c,node};
}
test('Incomplete account prompts once and retains existing name; complete account does not prompt',()=>{
 const {c}=context();c.maybeOnboard();assert.match(c.html,/أكمل حسابك/);assert.match(c.html,/Existing Name/);
 c.html='unchanged';c.maybeOnboard();assert.equal(c.html,'unchanged');
 c.state.onboardingPrompted=null;c.state.profile.onboarding_completed_at='2026-10-02';c.maybeOnboard();assert.equal(c.html,'unchanged');
});
test('Validation is above the save button and focuses the specific invalid field',async()=>{
 const {c,node}=context();c.profileModal(true);
 assert.ok(c.html.indexOf('id="profileMsg"')<c.html.indexOf('id="saveProfile"'));
 node('#profileName').value='يزيد';node('#profileUsername').value='يزيد';
 await node('#saveProfile').onclick();assert.equal(node('#profileUsername').focused,true);assert.match(node('#profileMsg').textContent,/حرفًا إنجليزيًا/);
 node('#profileUsername').value='yazid';node('#profilePhone').value='123';
 await node('#saveProfile').onclick();assert.equal(node('#profilePhone').focused,true);assert.match(node('#profileMsg').textContent,/رقم هاتف/);
});
test('Arabic phone digits save correctly and repeated taps do not submit twice',async()=>{
 const {c,node}=context();let finish,writes=0;
 c.sb={from:()=>({update:row=>({eq:()=>({select:()=>({single:()=>{writes++;assert.equal(row.phone,'+966551234567');return new Promise(resolve=>finish=()=>resolve({data:row}));}})})})})};
 c.profileModal(true);node('#profileName').value='يزيد';node('#profileUsername').value='Yazid_٢٠٢٦';node('#profilePhone').value='+٩٦٦٥٥١٢٣٤٥٦٧';
 const pending=node('#saveProfile').onclick();await node('#saveProfile').onclick();assert.equal(writes,1);assert.equal(node('#saveProfile').disabled,true);
 finish();await pending;assert.equal(c.state.profile.username,'yazid_2026');assert.match(c.html,/حسابك جاهز/);
});
test('Invalid fields do not save; duplicate username retains draft; successful retry completes profile',async()=>{
 const {c,node}=context();let writes=0;
 c.sb={from:()=>({update:row=>({eq:(key,id)=>({select:()=>({single:async()=>{
 writes++;assert.equal(id,'self');return c.success?{data:row}:{error:{code:'23505'}};
 }})})})})};
 c.profileModal(true);await node('#saveProfile').onclick();assert.equal(writes,0);
 node('#profileName').value='Existing Name';node('#profileUsername').value='my_name';node('#profilePhone').value='+1 (313) 555-0123';
 await node('#saveProfile').onclick();assert.equal(writes,1);assert.match(node('#profileMsg').textContent,/مستخدم بالفعل/);assert.equal(node('#profileName').value,'Existing Name');assert.equal(node('#saveProfile').disabled,false);
 c.success=true;await node('#saveProfile').onclick();assert.ok(c.state.profile.onboarding_completed_at);assert.match(c.html,/حسابك جاهز/);
});
test('Legacy admin entry redirects to the unified dashboard',()=>{
 const admin=readFileSync('admin.html','utf8');assert.match(admin,/location.replace\("seller.html"\)/);assert.doesNotMatch(admin,/makhraj-admin.js/);
});
test('Dashboard keeps sandbox totals separate from genuine paid revenue',async()=>{
 const source=readFileSync('assets/makhraj-seller-v3.js','utf8');
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
 const c={$:node,S:{products:[],costs:{},settings:{},orders:[
 {payment_status:'paid',payment_method:'online',total:7,payments:[{checkout_session_id:'cs_test_example'}]},
 {payment_status:'paid',payment_method:'online',total:20,payments:[{checkout_session_id:'cs_live_example'}],order_items:[]}
 ]},money:n=>Number(n).toFixed(2),loadProducts:async()=>{},loadOrders:async()=>{},loadSettings:async()=>{}};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf(' function testOrder('),source.indexOf(' async function loadOrders('))+
 source.slice(source.indexOf(' async function loadOverview('),source.indexOf(' async function loadSettings(')),c);
 await c.loadOverview();assert.equal(node('mRevenue').textContent,'20.00');assert.equal(node('mTestRevenue').textContent,'7.00');
});
