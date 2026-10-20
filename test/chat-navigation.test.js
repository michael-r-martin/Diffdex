const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chatNavigationItems}=require('../src/chat-navigation');

test('chat navigation counts unique displayable pending files and excludes resolved and unavailable reviews',()=>{
  const sessions=[{key:'a',title:'First'},{key:'b',title:'Second',reviewSummary:{warnings:2}},{key:'c',title:'Caught up'}];
  const doc=(key,uri,extra={})=>({reviewKey:`${key}:${uri}`,uri,hunks:[{}],...extra});
  const documents=[doc('a','file:///z.js'),doc('a','file:///a.js'),doc('a','file:///z.js'),doc('b','file:///b.js'),
    doc('b','file:///conflict.js',{warning:'Incoming conflict'}),doc('b','file:///stale.js',{detached:true}),doc('c','file:///done.js',{hunks:[]})];
  assert.deepEqual(chatNavigationItems(sessions,documents),[
    {key:'a',title:'First',files:['file:///a.js','file:///z.js'],warnings:0},
    {key:'b',title:'Second',files:['file:///b.js'],warnings:2}
  ]);
  assert.deepEqual(chatNavigationItems(sessions,[]),[]);
});

test('jump command switches selection, opens the first pending file, and refuses stale chats',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'diff-chat-jump-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first=path.join(root,'a.js'),second=path.join(root,'b.js');
  for(const file of [first,second])fs.writeFileSync(file,'new\n');
  const uri=file=>({fsPath:file,scheme:'file',toString:()=>`file://${file}`});
  const capture=file=>({path:file,before:{exists:true,text:'old\n'},after:{exists:true,text:'new\n'},updatedAt:1});
  let sessions=[{key:'one',sessionId:'one',cwd:root,files:[capture(first)]},{key:'two',sessionId:'two',cwd:root,files:[capture(second)]}];
  const commands=new Map(),saved=new Map([['selectedChat','one']]),opened=[],messages=[],payloads=[];
  let ready;
  const initial=new Promise(resolve=>ready=resolve);
  const disposable=()=>({dispose(){}});
  class Sidebar{update(state){this.state=state;}}
  const vscode={
    Uri:{file:uri,parse:value=>uri(value.slice('file://'.length))},StatusBarAlignment:{Left:1},
    EventEmitter:class{event=()=>{};fire(){}},
    commands:{registerCommand(name,fn){commands.set(name,fn);return disposable();},async executeCommand(name,...args){
      if(name==='_codexDiff.setChanges'){payloads.push(args[0]);ready();return [];}
      return commands.get(name)?.(...args);
    }},
    workspace:{workspaceFolders:[{uri:uri(root)}],textDocuments:[],getConfiguration:()=>({get:()=>undefined}),onDidChangeTextDocument:disposable},
    window:{createOutputChannel:()=>({appendLine(){}}),createStatusBarItem:()=>({show(){}}),
      registerTreeDataProvider:disposable,registerWebviewViewProvider:disposable,onDidChangeVisibleTextEditors:disposable,
      async showTextDocument(value){opened.push(value.toString());},showInformationMessage(message){messages.push(message);}}
  };
  const extensionPath=path.resolve('src/extension.js');
  const realRequire=require('node:module').createRequire(extensionPath);
  const context=vm.createContext({module:{exports:{}},require:name=>name==='vscode'?vscode:name==='./store'?{listSessions:()=>sessions}:name==='./sidebar'?{ReviewSidebar:Sidebar}:name==='./chat-titles'?{createTitleReader:()=>()=>new Map([['one','First'],['two','Second']])}:realRequire(name),
    process:{env:{}},setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},queueMicrotask});
  vm.runInContext(fs.readFileSync(extensionPath,'utf8'),context);
  context.module.exports.activate({extensionPath:root,subscriptions:[],workspaceState:{get:key=>saved.get(key),async update(key,value){saved.set(key,value);}}});
  await initial;
  // Let the initial refresh release its busy flag.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(payloads.at(-1).otherChats[0].key,'two');
  assert.equal(await commands.get('codexDiff.jumpToChat')({key:'two'}),true);
  assert.equal(saved.get('selectedChat'),'two');
  assert.equal(opened.at(-1),`file://${second}`);
  assert.equal(payloads.at(-1).otherChats[0].key,'one');
  sessions=sessions.filter(session=>session.key!=='one');
  assert.equal(await commands.get('codexDiff.jumpToChat')({key:'one'}),false);
  assert.equal(saved.get('selectedChat'),'two');
  assert.equal(opened.length,1);
  assert.match(messages.at(-1),/no longer has changes/);
});
