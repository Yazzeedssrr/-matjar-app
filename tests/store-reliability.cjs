const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const vm=require('node:vm');
const source=readFileSync('assets/makhraj-app.js','utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
function harness(){
 const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',innerHTML:'',disabled:false,isConnected:true});return nodes.get(k);};
 const c={state:{session:{user:{id:'owner'}},cart:[{qty:1}]},els:{panel:{}},calls:[],writes:0,paid:false,URLSearchParams,Date,setTimeout,console,
 $:s=>node(s),$$:()=>[],esc:v=>String(v).replaceAll('<','&lt;'),supportStatus:s=>s,supportLanguageOptions:()=>'',closeSheet:()=>{},toast:()=>{},showView:()=>{},saveLocal:()=>{},
 localStorage:{getItem:()=>null,setItem:()=>{}},sessionStorage:{getItem:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',removeItem:()=>{}},location:{search:'?payment=success&order_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',pathname:'/app.html'},history:{replaceState:()=>{}},window:{}};
 c.openSheet=html=>{c.html=html;node('#supportTranslationLanguage').value='ar';};
 c.sb={from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{subject:'Test',status:'open'}}),order:async()=>({data:[{id:'m',message:'<img src=x>',created_at:0,source_language:'auto'}]}),maybeSingle:async()=>({data:{payment_status:c.paid?'paid':'unpaid'}}),insert:async()=>{c.writes++;await new Promise(r=>setTimeout(r,5));return {error:{message:'failed'}};}};return q;},functions:{invoke:async(n,args)=>{c.calls.push(args);return {data:{translated_text:'translation'}};}}};
 vm.createContext(c);vm.runInContext(extract('  async function openTicket(','  function supportStatus(')+extract('  async function handlePaymentReturn(','  function bindStatic(')+extract('  function openPasswordRecovery(','  function friendlyAuthError('),c);
 return {c,node};
}
test('Opening a thread and changing language never call translation or erase reply',async()=>{const {c,node}=harness();await c.openTicket('t');assert.equal(c.calls.length,0);assert.ok(c.html.includes('&lt;img'));assert.ok(c.html.includes('data-no-i18n'));node('#replyMessage').value='draft';node('#supportTranslationLanguage').onchange({target:{value:'en'}});assert.equal(node('#replyMessage').value,'draft');assert.equal(c.calls.length,0);await node('#translateSupportThread').onclick({currentTarget:node('#translateSupportThread')});assert.equal(c.calls.length,1);});
test('Repeated reply clicks send once and failure preserves draft',async()=>{const {c,node}=harness();await c.openTicket('t');node('#replyMessage').value='draft';await Promise.all([node('#sendReply').onclick(),node('#sendReply').onclick()]);assert.equal(c.writes,1);assert.equal(node('#replyMessage').value,'draft');assert.equal(node('#sendReply').disabled,false);});
test('Return URL alone does not confirm payment or erase cart',async()=>{const {c}=harness();await c.handlePaymentReturn();assert.equal(c.state.cart.length,1);assert.match(c.html,/بانتظار تأكيد/);c.paid=true;await c.handlePaymentReturn();assert.equal(c.state.cart.length,0);assert.match(c.html,/تم تأكيد/);});
test('Recovery validates matching password and updates authenticated user',async()=>{const {c,node}=harness();c.friendlyAuthError=e=>e.message;let writes=0;c.sb.auth={updateUser:async()=>{writes++;return {};}};c.openPasswordRecovery();node('#recoveryPassword').value='abcdef';node('#recoveryConfirm').value='different';await node('#saveRecovery').onclick({currentTarget:node('#saveRecovery')});assert.equal(writes,0);node('#recoveryConfirm').value='abcdef';await node('#saveRecovery').onclick({currentTarget:node('#saveRecovery')});assert.equal(writes,1);});

test('Public build excludes stale private files on repeated builds',async()=>{const {mkdirSync,writeFileSync,existsSync}=require('node:fs');const {execFileSync}=require('node:child_process');mkdirSync('dist',{recursive:true});writeFileSync('dist/private-backup.json','private');execFileSync(process.execPath,['scripts/build-store.mjs']);assert.equal(existsSync('dist/private-backup.json'),false);assert.equal(existsSync('dist/app.html'),true);});

test('Returning to an older paid order preserves the current cart',async()=>{const {c}=harness();c.paid=true;c.sessionStorage.getItem=()=> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';await c.handlePaymentReturn();assert.equal(c.state.cart.length,1);});

test('Social login only enables providers confirmed by server settings',async()=>{
 const buttons=['google','apple','github'].map(authProvider=>({dataset:{authProvider},disabled:true,textContent:authProvider})),status={};
 const c={cfg:{supabaseUrl:'https://example.supabase.co',supabaseKey:'public'},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({external:{google:true,apple:false,github:false}})}),$$:()=>buttons,$:()=>status};
 vm.createContext(c);vm.runInContext(extract('  function authRedirect(','  function openPasswordRecovery('),c);
 await c.loadAuthProviders({isConnected:true});assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);assert.equal(buttons[2].disabled,true);
});
test('Social login uses current storefront return URL and rejects unknown providers',async()=>{
 const calls=[],c={location:{origin:'https://shop.example',pathname:'/-matjar-app/app.html'},sb:{auth:{signInWithOAuth:async args=>{calls.push(args);return {};}}},els:{panel:{}},$:()=>({isConnected:true})};
 vm.createContext(c);vm.runInContext(extract('  function authRedirect(','  function openPasswordRecovery('),c);
 const button={disabled:false};await c.socialLogin('unknown',button);assert.equal(calls.length,0);await c.socialLogin('google',button);assert.equal(calls[0].options.redirectTo,'https://shop.example/-matjar-app/app.html');assert.equal(button.disabled,false);
});
