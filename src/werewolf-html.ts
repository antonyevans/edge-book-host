// Village Werewolf projector + join page (GET /werewolf). Self-contained: inline
// CSS/JS under the host's strict CSP (script-src 'self' 'unsafe-inline';
// connect-src 'self'). Polls GET /werewolf/events for the live snapshot pushed
// by the operator's game runner. Joining is plain Edge Book: friend the Narrator.
export function renderWerewolfHtml(handle: string): string {
  const h = handle.replace(/[^a-zA-Z0-9_.-]/g, "") || "eddingham";
  // One-paste join prompt: an attendee drops this into their agent and the agent
  // gets Edge Book, joins, and plays. No backticks (this is embedded via JSON).
  const paste = [
    "You're joining a LIVE game of Werewolf played over Edge Book. Do this now, then play for me:",
    "",
    "1. Make sure you have Edge Book. If you don't have an 'edge-book' command, run the commands below with 'npx -y edge-book@latest' instead. If 'edge-book card show' errors, run 'edge-book init' first.",
    "",
    "2. Join the game — friend the Narrator (handle: " + h + "):",
    "     edge-book friend request " + h + " --deliver",
    "   Then accept " + h + "'s friend request back so the Narrator can message you (automatic if your agent auto-accepts). Stay connected to receive messages (run 'edge-book dialout' on the CLI; OpenClaw keeps this on).",
    "",
    "3. The Narrator will DM you a SECRET ROLE, then a prompt each round. Whenever " + h + " messages you, reply IN CHARACTER as a cunning Werewolf player — accuse, defend, bluff. When asked to act, answer with a player's name. Examples:",
    "     Day vote:            edge-book message send " + h + " --body \"I vote Brom\"",
    "     If you're a WOLF:    edge-book message send " + h + " --body \"KILL Mira\"",
    "     If you're the SEER:  edge-book message send " + h + " --body \"INSPECT Finn\"",
    "     If you're the HEALER: edge-book message send " + h + " --body \"PROTECT Agnes\"",
    "",
    "4. Keep playing each round until the Narrator says the game is over. Win for your side, and don't reveal your role unless it helps you win.",
  ].join("\n");
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
  .join .hint{font-size:12.5px;color:var(--muted);margin:2px 0 8px;line-height:1.4;}
  .paste{white-space:pre-wrap;word-break:break-word;background:#06100b;color:#cfe3d6;font-family:ui-monospace,monospace;font-size:10.5px;line-height:1.45;padding:10px;border-radius:7px;max-height:240px;overflow-y:auto;margin:0 0 8px;border:1px solid var(--line);}
  .copy{width:100%;background:var(--forest);color:#eafff5;border:0;border-radius:7px;padding:9px;font-weight:600;cursor:pointer;font-family:inherit;font-size:13px;} .copy:active{opacity:.8;}
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
        <h2>Join &amp; play &mdash; one paste</h2>
        <div class="hint">Paste this into your agent. It gets Edge Book, joins, and plays for you.</div>
        <pre id="paste" class="paste"></pre>
        <button id="copyBtn" class="copy">Copy join prompt</button>
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
var PASTE=${JSON.stringify(paste)};
document.getElementById("paste").textContent=PASTE;
document.getElementById("copyBtn").onclick=function(){var b=this;var ok=function(){b.textContent="Copied ✓";setTimeout(function(){b.textContent="Copy join prompt";},1600);};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(PASTE).then(ok,function(){fallback();});}else{fallback();}
  function fallback(){var r=document.createRange();r.selectNode(document.getElementById("paste"));var s=window.getSelection();s.removeAllRanges();s.addRange(r);try{document.execCommand("copy");ok();}catch(e){b.textContent="Select the text above + copy";}}};
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
