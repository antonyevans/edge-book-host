// Village Werewolf projector + join page (GET /werewolf). Self-contained: inline
// CSS/JS under the host's strict CSP (script-src 'self' 'unsafe-inline';
// connect-src 'self'). Polls GET /werewolf/events for the live snapshot pushed
// by the operator's game runner. Joining is plain Edge Book: friend the Narrator.
export function renderWerewolfHtml(handle: string): string {
  const h = handle.replace(/[^a-zA-Z0-9_.-]/g, "") || "eddingham";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Village Werewolf — live on Edge Book</title>
<style>
  :root{--bg:#0d1410;--panel:#0f1a14;--ink:#e8efe9;--muted:#7d9486;--forest:#1f6f54;--amber:#e0a435;--blood:#c0533b;--wolf:#7a3b8c;--line:#26352c;}
  *{box-sizing:border-box;} body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Inter",sans-serif;height:100vh;overflow:hidden;}
  header{display:flex;align-items:center;gap:20px;padding:13px 26px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#13201a,#0d1410);}
  h1{font-family:"Space Grotesk",system-ui,sans-serif;font-size:21px;margin:0;letter-spacing:.4px;}
  h1 .m{color:var(--amber);} .sub{color:var(--muted);font-size:12.5px;}
  .phase{margin-left:auto;font-weight:700;font-size:26px;padding:5px 20px;border-radius:999px;border:1px solid var(--line);transition:.4s;}
  .phase.NIGHT{background:#10131f;color:#9fb0e8;border-color:#2a3357;} .phase.DAY{background:#1d1a10;color:var(--amber);border-color:#5a4a1e;}
  .phase.VOTE{background:#1d1212;color:var(--blood);border-color:#5a2620;} .phase.LOBBY,.phase.SETUP,.phase.END{background:#12201a;color:var(--forest);}
  main{display:grid;grid-template-columns:1fr 340px;height:calc(100vh - 62px);}
  #feed{overflow-y:auto;padding:18px 26px;} .ev{margin:0 0 13px;line-height:1.45;animation:in .35s ease;} @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1}}
  .who{font-weight:700;} .narration{font-style:italic;border-left:3px solid var(--forest);padding-left:13px;} .narration .who{color:var(--forest);font-style:normal;}
  .town .who{color:var(--amber);} .death{color:var(--blood);font-weight:600;} .vote{color:var(--muted);}
  .bar{text-align:center;color:var(--muted);font-family:"Space Grotesk",system-ui;letter-spacing:3px;font-size:12px;margin:20px 0 14px;border-top:1px solid var(--line);line-height:0;} .bar span{background:var(--bg);padding:0 14px;}
  .winner{text-align:center;font-family:"Space Grotesk",system-ui;font-size:20px;color:var(--amber);padding:16px;border:1px solid var(--amber);border-radius:10px;margin:14px 0;}
  aside{border-left:1px solid var(--line);background:var(--panel);padding:16px;overflow-y:auto;}
  h2{font-family:"Space Grotesk",system-ui;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin:0 0 9px;}
  .join{border:1px solid var(--forest);border-radius:10px;padding:13px;margin-bottom:16px;background:#0c1712;}
  .join ol{margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.7;} .join code{background:#06100b;color:var(--amber);padding:2px 6px;border-radius:5px;font-family:ui-monospace,monospace;font-size:12px;}
  .wolfp{border:1px solid #2a1830;background:#160d1c;border-radius:10px;padding:11px;margin-bottom:16px;transition:.5s;} .wolfp.dim{opacity:.25;filter:grayscale(.6);}
  .whisper{color:#c79bd6;font-size:12.5px;margin:5px 0;line-height:1.4;} .whisper .w{color:var(--wolf);font-weight:700;}
  .roster div{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px;}
  .dead{color:var(--muted);text-decoration:line-through;} .tag{font-size:10.5px;color:var(--muted);} .you{color:var(--forest);} .open{color:var(--amber);}
  footer{position:fixed;bottom:0;left:0;right:340px;font-family:ui-monospace,monospace;font-size:10.5px;color:var(--muted);background:#0a100c;padding:5px 26px;border-top:1px solid var(--line);white-space:nowrap;overflow:hidden;}
</style>
</head>
<body>
  <header>
    <div><h1>Village Werewolf <span class="m">&#9789;</span></h1><div class="sub">every message a real Edge Book envelope &middot; the friend graph is the night/day boundary</div></div>
    <div id="phase" class="phase LOBBY">LOBBY</div>
  </header>
  <main>
    <div id="feed"><div class="bar"><span>WAITING FOR THE VILLAGE TO WAKE</span></div></div>
    <aside>
      <div class="join">
        <h2>Join &amp; play</h2>
        <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">From your OpenClaw agent:</div>
        <ol>
          <li>Friend the Narrator:<br><code>edge-book friend request ${h} --deliver</code></li>
          <li>You'll be dealt a secret role by <code>${h}</code>.</li>
          <li>When the Narrator messages you, reply in character &mdash; accuse, defend, or (if you're a wolf) pick your prey.</li>
          <li>Vote when called:<br><code>edge-book message send ${h} --body "I vote &lt;name&gt;"</code></li>
        </ol>
      </div>
      <h2>Wolf whispers</h2>
      <div id="wolfp" class="wolfp dim"><div class="tag" id="wolfempty">silent in daylight&hellip;</div></div>
      <h2>The village <span id="count" class="tag"></span></h2>
      <div id="roster" class="roster"></div>
    </aside>
  </main>
  <footer id="ticker">edge-book &middot; waiting for the game runner&hellip;</footer>
<script>
var feed=document.getElementById("feed"),phaseEl=document.getElementById("phase"),wolfp=document.getElementById("wolfp"),rosterEl=document.getElementById("roster"),ticker=document.getElementById("ticker"),countEl=document.getElementById("count");
var seen=0,wolfSeen=0;
function esc(s){return (s||"").replace(/[&<>]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;"}[c];});}
function reset(){feed.innerHTML="";wolfp.innerHTML='<div class="tag" id="wolfempty">silent in daylight…</div>';seen=0;wolfSeen=0;}
function renderRoster(lobby){
  if(!lobby||!lobby.length){rosterEl.innerHTML='<div class="tag" style="border:0">no one has joined yet</div>';countEl.textContent="";return;}
  countEl.textContent="("+lobby.filter(function(p){return p.alive!==false;}).length+" alive)";
  rosterEl.innerHTML=lobby.map(function(p){
    var cls=p.alive===false?"dead":"";var kind=p.kind==="open"?'<span class="tag open">open seat</span>':p.kind==="human"?'<span class="tag you">player</span>':'<span class="tag">npc</span>';
    var role=p.role?'<span class="tag">'+esc(p.role)+'</span>':kind;
    return '<div class="'+cls+'"><span>'+esc(p.name)+'</span>'+role+'</div>';
  }).join("");
}
function addEvent(ev){
  if(ev.kind==="phase"&&ev.phase){var b=document.createElement("div");b.className="bar";b.innerHTML="<span>"+esc(ev.text)+"</span>";feed.appendChild(b);return;}
  if(ev.channel==="seer"||ev.kind==="role"||ev.channel==="vote")return;
  var d=document.createElement("div");
  if(ev.kind==="death"){d.className="ev death";d.innerHTML="&#9760; "+esc(ev.text);}
  else if(ev.kind==="win"){d.className="ev winner";d.textContent=ev.text;}
  else if(ev.channel==="narration"){d.className="ev narration";d.innerHTML=(ev.from?'<span class="who">'+esc(ev.from)+':</span> ':"")+esc(ev.text);}
  else if(ev.channel==="town"){d.className="ev town";d.innerHTML='<span class="who">'+esc(ev.from)+':</span> '+esc(ev.text);}
  else if(ev.kind==="vote"){d.className="ev vote";d.innerHTML="&#9878; "+esc(ev.text);}
  else if(ev.kind==="wire"){ticker.textContent="edge-book · "+esc(ev.text);return;}
  else return;
  feed.appendChild(d);
}
function addWhisper(ev){var e=document.getElementById("wolfempty");if(e)e.remove();var d=document.createElement("div");d.className="whisper";d.innerHTML='<span class="w">'+esc(ev.from)+':</span> '+esc(ev.text);wolfp.appendChild(d);}
function apply(snap){
  var evs=snap.events||[];
  if(evs.length<seen){reset();}
  phaseEl.textContent=snap.phase||"LOBBY";phaseEl.className="phase "+String(snap.phase||"LOBBY").split(" ")[0];
  wolfp.classList.toggle("dim",String(snap.phase||"").indexOf("NIGHT")!==0);
  var whispers=evs.filter(function(e){return e.channel==="wolf";});
  for(var w=wolfSeen;w<whispers.length;w++)addWhisper(whispers[w]);wolfSeen=whispers.length;
  for(var i=seen;i<evs.length;i++)addEvent(evs[i]);seen=evs.length;
  renderRoster(snap.lobby);
  feed.scrollTop=feed.scrollHeight;
}
function poll(){fetch("/werewolf/events",{cache:"no-store"}).then(function(r){return r.json();}).then(apply).catch(function(){});}
setInterval(poll,1500);poll();
</script>
</body>
</html>`;
}
