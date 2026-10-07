(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const desktop = $('#desktop');
  const bootScreen = $('#bootScreen');
  const windowsLayer = $('#windowsLayer');
  const menuPopover = $('#menuPopover');
  const controlPopover = $('#controlPopover');
  const toastEl = $('#toast');
  let zIndex = 6;
  let focusedApp = 'finder';
  let toastTimer;
  let activeFolder = 'Recents';
  let activeFilter = '';
  let currentTrack = null;
  let playing = false;
  let audioElement = new Audio();
  let library = [];
  let photoUrls = [];
  let likedTracks = new Set();
  let waveView = 'library';
  let timerInterval;

  if (localStorage.getItem('kahos-low-motion') === 'on') document.body.classList.add('reduce-motion');

  const folders = {
    Recents: [['📄','Welcome to kahOS.txt','file'],['🖼','Tahoe dark.jpg','file'],['📁','Desktop','folder'],['📁','Documents','folder'],['📁','Downloads','folder'],['📁','Pictures','folder'],['🎵','Focus mix.m4a','file']],
    Applications: [['◧','Finder','app:finder'],['◉','Brave Browser','app:brave'],['▤','Notes','app:notes'],['✿','Photos','app:photos'],['♫','Wave','app:wave'],['⚙','System Settings','app:settings'],['▦','Calendar','app:calendar']],
    Desktop: [['📄','Welcome to kahOS.txt','file'],['📁','Screenshots','folder'],['📁','Projects','folder']],
    Documents: [['📄','Welcome to kahOS.txt','file'],['📄','Getting started.pdf','file'],['📁','Projects','folder'],['📁','Work','folder']],
    Downloads: [['🖼','Tahoe dark.jpg','file'],['📦','Brave Browser.dmg','file'],['📄','Release notes.pdf','file']],
    Pictures: [['🖼','Tahoe dark.jpg','file'],['🖼','Ocean light.jpg','file'],['🖼','Violet dusk.jpg','file']],
    iCloud: [['☁','Desktop','folder'],['☁','Documents','folder']],
    Trash: [['🗑','Trash is empty','file']]
  };

  const appTitles = {finder:'Finder',brave:'Brave Browser',notes:'Notes',calendar:'Calendar',photos:'Photos',wave:'Wave',settings:'System Settings',trash:'Trash',terminal:'Terminal'};
  const iconFor = {finder:'◧',brave:'◉',notes:'▤',calendar:'▦',photos:'✿',wave:'♫',settings:'⚙',trash:'▤',terminal:'>_'};
  const settingGroups = [
    {label:'Account',items:[['Apple Account','●']]},
    {label:'Connectivity',items:[['Wi-Fi','⌁'],['Bluetooth','ᛒ'],['Network','◉'],['VPN','▱']]},
    {label:'Notifications & Focus',items:[['Notifications','◉'],['Sound','♫'],['Focus','☾'],['Screen Time','◷']]},
    {label:'Personalization',items:[['General','⚙'],['Appearance','◐'],['Accessibility','◎'],['Control Center','☷'],['Menu Bar','☰'],['Desktop & Dock','▤'],['Displays','▣'],['Wallpaper','▧'],['Lock Screen','▣']]},
    {label:'Devices & Accounts',items:[['Touch ID & Password','◉'],['Users & Groups','♙'],['Family','♡'],['Internet Accounts','☁'],['Game Center','◎'],['Wallet & Apple Pay','▣'],['Keyboard','⌨'],['Mouse','↖'],['Trackpad','▱'],['Printers & Scanners','▤'],['Battery','▰']]},
    {label:'System Services',items:[['Time Machine','◴'],['Sharing','↗'],['Startup Disk','▰']]},
    {label:'Security',items:[['Privacy & Security','◈'],['Apple Intelligence & Siri','✦']]}
  ];

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function setClock() {
    const now = new Date();
    $('#clockButton').textContent = new Intl.DateTimeFormat(undefined, {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(now);
    $('#dockWeekday').textContent = new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(now).toUpperCase();
    $('#dockDay').textContent = now.getDate();
  }
  setClock();
  setInterval(setClock, 30000);
  function setBattery(level,charging=false) {
    const percent=Math.max(0,Math.min(100,Math.round(level*100)));
    $('#batteryFill').style.width=`${percent}%`;
    $('#batteryPercent').textContent=`${percent}%`;
    $('#batteryButton').title=`Battery ${percent}%${charging?' · Charging':' · preview'}`;
  }
  setBattery(.84);
  if(navigator.getBattery) navigator.getBattery().then(battery=>{
    const update=()=>setBattery(battery.level,battery.charging);
    update();battery.addEventListener('levelchange',update);battery.addEventListener('chargingchange',update);
  }).catch(()=>{});

  function boot() {
    const progress = $('#bootProgress');
    const status = $('#bootStatus');
    let step = 0;
    const messages = ['Checking startup disk…','Loading desktop services…','Preparing your workspace…'];
    const interval = setInterval(() => {
      step += 1;
      progress.style.width = `${Math.min(step * 34,100)}%`;
      status.textContent = messages[Math.min(step - 1,messages.length - 1)];
      if (step >= 3) {
        clearInterval(interval);
        setTimeout(() => { bootScreen.classList.add('done'); desktop.classList.add('ready'); }, 230);
        setTimeout(() => bootScreen.remove(), 950);
      }
    }, 330);
  }
  boot();

  function setFocused(app) {
    focusedApp = app;
    $('#activeAppLabel').textContent = appTitles[app] || 'Finder';
    $$('.app-window').forEach(win => win.style.zIndex = win.dataset.app === app ? ++zIndex : win.style.zIndex);
    $$('.dock-app').forEach(item => item.classList.toggle('open', item.dataset.open === app));
  }

  function openApp(app, shell = null) {
    hidePopovers();
    const existing = $(`.app-window[data-app="${app}"]`);
    if (existing) { existing.style.display = 'block'; existing.style.zIndex = ++zIndex; setFocused(app); if(app==='terminal'&&shell)selectTerminalShell(existing,shell); return; }
    const win = document.createElement('section');
    win.className = 'app-window';
    win.dataset.app = app;
    win.style.zIndex = ++zIndex;
    const title = appTitles[app] || 'App';
    win.innerHTML = `<header class="window-titlebar"><div class="traffic-lights"><button aria-label="Close window"></button><button aria-label="Minimize window"></button><button aria-label="Zoom window"></button></div><span class="window-title">${title}</span></header><div class="window-body">${appBody(app)}</div>`;
    windowsLayer.append(win);
    bindWindow(win);
    bindApp(win, app);
    if(app==='terminal'&&shell)selectTerminalShell(win,shell);
    setFocused(app);
  }

  function appBody(app) {
    if (app === 'finder' || app === 'trash') return finderBody(app);
    if (app === 'brave') return `<div class="browser-content"><div class="browser-toolbar"><button aria-label="Back">‹</button><button aria-label="Forward">›</button><button aria-label="Reload">↻</button><input class="browser-address" aria-label="Search the web" value="Search with Brave" /></div><div class="browser-home"><div class="brave-mark">◉</div><span class="widget-eyebrow">PRIVATE BY DEFAULT</span><h2>Search the web.</h2><p>Fast, private, and ready when you are.</p><form class="browser-search"><input aria-label="Search query" placeholder="Search with Brave" autocomplete="off"><button>Search</button></form><small>Search opens in your default browser.</small></div></div>`;
    if (app === 'notes') return `<div class="app-content"><div class="note-paper"><span class="widget-eyebrow">WELCOME NOTE</span><h2>Welcome to kahOS</h2><p>A calm desktop, tuned for focus.</p><textarea aria-label="Note" spellcheck="false">Your workspace is ready. Open Finder to browse your files, use Settings to choose a wallpaper, or try Brave Browser for a quick search.\n\nTip: press ⌘K or Ctrl+K to find an app.</textarea></div></div>`;
    if (app === 'settings') return settingsBody();
    if (app === 'calendar') return calendarBody();
    if (app === 'wave') return musicBody();
    if (app === 'photos') return photosBody();
    if (app === 'terminal') return terminalBody();
    return `<div class="app-content"><h2>Trash</h2><p>Your Trash is empty.</p></div>`;
  }

  function photosBody() {
    return `<div class="photos-layout app-content"><header class="photos-header"><div><span class="widget-eyebrow">YOUR LIBRARY</span><h2>Photos</h2><p>Wallpapers and pictures, organized in one place.</p></div><label class="photo-import-button">＋ Import Photos<input class="photo-files" type="file" accept="image/*" multiple hidden></label></header><section class="photo-album"><div class="photo-album-heading"><strong>Wallpaper collection</strong><span>5 items</span></div><div class="wallpaper-options photo-wallpapers">${wallpaperOption('user','Tahoe dark')}${wallpaperOption('aurora','Aurora')}${wallpaperOption('graphite','Graphite')}${wallpaperOption('violet','Violet dusk')}${wallpaperOption('coast','Coastal light')}</div></section><section class="photo-imports"><div class="photo-album-heading"><strong>Imported on this device</strong><span class="photo-count">0 items</span></div><div class="photo-import-grid"></div><div class="photo-empty"><span>▧</span><strong>Your photos stay yours.</strong><small>Import images to preview them here. Nothing is uploaded or saved outside this browser session.</small></div></section><div class="photo-viewer" hidden role="dialog" aria-modal="true" aria-label="Photo preview"><button class="photo-viewer-close" aria-label="Close photo preview">×</button><img alt=""><span></span></div></div>`;
  }
  function finderBody(app) {
    const initial = app === 'trash' ? 'Trash' : 'Recents';
    return `<div class="finder-layout"><aside class="finder-sidebar"><div class="sidebar-heading">Favorites</div><nav class="finder-nav">${[['Recents','◷'],['Applications','▦'],['Desktop','▣'],['Documents','▤'],['Downloads','↓'],['Pictures','▧'],['iCloud','☁'],['Trash','▤']].map(([name,icon])=>`<button class="${name===initial?'active':''}" data-folder="${name}"><span class="nav-icon">${icon}</span>${name}</button>`).join('')}</nav><div class="sidebar-heading" style="margin-top:18px">Locations</div><nav class="finder-nav"><button data-folder="Macintosh HD"><span class="nav-icon">▰</span>Macintosh HD</button></nav></aside><section class="finder-main"><div class="finder-toolbar"><span class="finder-path">${initial}</span><input class="finder-search" type="search" placeholder="Search" aria-label="Search files"></div><div class="file-grid"></div><div class="finder-status"></div></section></div>`;
  }

  function renderFiles(win, folder = activeFolder, filter = activeFilter) {
    activeFolder = folder;
    activeFilter = filter;
    const data = folders[folder] || [['▰','Macintosh HD','folder'],['📁','Users','folder'],['📁','Applications','folder'],['📁','System','folder']];
    const items = data.filter(item => item[1].toLowerCase().includes(filter.toLowerCase()));
    const grid = $('.file-grid',win);
    if (!grid) return;
    grid.innerHTML = items.length ? items.map(([glyph,name,type])=>`<button class="file-item" data-entry="${name}" data-type="${type}"><span class="file-glyph">${glyph}</span><span>${name}</span></button>`).join('') : '<div class="finder-status">No matching files</div>';
    $('.finder-path',win).textContent = folder;
    $('.finder-status',win).textContent = `${items.length} items`;
    $$('.finder-nav button',win).forEach(button => button.classList.toggle('active',button.dataset.folder === folder));
  }

  function settingsBody() {
    const navigation = settingGroups.map(group => `<div class="settings-group"><span>${group.label}</span>${group.items.map(([name,icon])=>`<button class="settings-nav-item ${name==='Appearance'?'active':''}" data-setting="${name}"><span>${icon}</span>${name}</button>`).join('')}</div>`).join('');
    return `<div class="settings-layout"><aside class="settings-sidebar"><div class="settings-account"><span class="account-avatar">A</span><div><strong>Apple Account</strong><small>Sign in to kahOS</small></div></div><label class="settings-search-wrap"><span>⌕</span><input class="settings-search" type="search" placeholder="Search Settings" aria-label="Search settings"></label><nav class="settings-nav">${navigation}</nav></aside><section class="settings-main">${appearancePaneHtml()}</section></div>`;
  }

  const preferencePanes = {
    'Apple Account': {icon:'●',description:'Account services are shown here as a local prototype.',rows:[['Sign in to kahOS','Accounts are not connected in this preview.','button','Sign In'],['iCloud','Sync is not configured.','button','Set Up']]},
    'Wi-Fi': {icon:'⌁',description:'Connect to a wireless network and manage known networks.',rows:[['Wi-Fi','Connected to kahOS Network','toggle',true],['Ask to join networks','Discover available networks nearby.','toggle',true],['Known Networks','Review saved network preferences.','button','Details']]},
    'Bluetooth': {icon:'ᛒ',description:'Connect accessories and nearby devices.',rows:[['Bluetooth','Allow accessories to connect.','toggle',true],['Nearby Devices','No devices connected.','button','Scan']]},
    'Network': {icon:'◉',description:'Manage network services, DNS, and local connections.',rows:[['Network Service','Wi-Fi · Connected','select',['Wi-Fi','Ethernet','Off']],['Private Wi-Fi Address','Use a rotating local address.','toggle',true],['DNS & Proxies','Configure advanced network details.','button','Details']]},
    'VPN': {icon:'▱',description:'Add a private network connection.',rows:[['VPN Status','No VPN configurations.','status','Not Connected'],['Add VPN Configuration','Add a supported VPN profile.','button','Add Configuration']]},
    'Notifications': {icon:'◉',description:'Choose how apps alert you and where notifications appear.',rows:[['Allow Notifications','Show alerts and banners.','toggle',true],['Show Previews','When unlocked','select',['Always','When Unlocked','Never']],['Notification Center','Keep recent alerts together.','toggle',true]]},
    'Sound': {icon:'♫',description:'Choose output, input, and alert sounds.',rows:[['Output Device','kahOS Speakers','select',['kahOS Speakers','Headphones']],['Output Volume','', 'range',68],['Play sound effects','Play interface sounds.','toggle',true],['Alert Volume','', 'range',54]]},
    'Focus': {icon:'☾',description:'Choose what can interrupt you and when.',rows:[['Do Not Disturb','Silence notifications temporarily.','toggle',false],['Focus Schedule','No schedule','select',['No Schedule','Weekdays','Every Day']],['Share Focus Status','Let apps show that notifications are silenced.','toggle',false]]},
    'Screen Time': {icon:'◷',description:'Review screen time and manage app limits.',rows:[['Screen Time','Track this device locally.','toggle',false],['Downtime','No downtime scheduled.','button','Set Schedule'],['App Limits','No app limits configured.','button','Add Limit']]},
    'General': {icon:'⚙',description:'Manage system information, updates, language, and default apps.',rows:[['About kahOS','Version 0.5.0 · Tahoe-inspired desktop','button','About'],['Default Web Browser','Brave Browser','select',['Brave Browser','System Browser']],['Software Update','Your preview is up to date.','button','Check Now'],['Language & Region','English · Italy','button','Details'],['Date & Time','Set automatically','toggle',true]]},
    'Accessibility': {icon:'◎',description:'Adjust display, motion, audio, and input for your needs.',rows:[['Reduce Motion','Limit movement and animation.','toggle',false],['Increase Contrast','Strengthen boundaries and text.','toggle',false],['Reduce Transparency','Use more opaque surfaces.','toggle',false],['Display & Text Size','Review visual accessibility options.','button','Customize']]},
    'Control Center': {icon:'☷',description:'Choose the controls available in the menu bar and Control Center.',rows:[['Wi-Fi','Show in the menu bar.','toggle',true],['Bluetooth','Show in the menu bar.','toggle',true],['Focus','Show in the menu bar.','toggle',true],['Sound','Show in the menu bar.','toggle',true],['Now Playing','Show media controls.','toggle',true]]},
    'Menu Bar': {icon:'☰',description:'Choose which status items are visible.',rows:[['Show Date','Display date in the menu bar.','toggle',true],['Show Battery Percentage','Display battery percentage.','toggle',true],['Show Wi-Fi','Display network status.','toggle',true],['Automatically Hide Menu Bar','Hide it when not in use.','toggle',false]]},
    'Desktop & Dock': {icon:'▤',description:'Customize the desktop, widgets, Dock, and window behavior.',rows:[['Dock Position','Bottom','select',['Bottom','Left','Right']],['Dock Size','', 'range',58],['Magnification','Enlarge icons on hover.','toggle',true],['Show suggested and recent apps','Keep recent apps in the Dock.','toggle',false],['Click wallpaper to reveal desktop','Stage Manager','select',['Always','Only in Stage Manager','Never']]]},
    'Displays': {icon:'▣',description:'Adjust display appearance and brightness.',rows:[['Brightness','', 'range',85],['Appearance','Dark','select',['Dark','Light','Auto']],['Resolution','Default for display','button','More Options'],['Night Shift','Reduce blue light in the evening.','toggle',false]]},
    'Lock Screen': {icon:'▣',description:'Choose what appears while kahOS is locked or idle.',rows:[['Start Screen Saver when inactive','5 minutes','select',['Never','5 minutes','10 minutes','20 minutes']],['Require password after screen saver','Immediately','select',['Immediately','1 minute','5 minutes']],['Show clock when locked','Show a large clock.','toggle',true]]},
    'Touch ID & Password': {icon:'◉',description:'Biometric hardware is not available in this desktop preview.',rows:[['Touch ID','No compatible sensor detected.','status','Unavailable'],['Login Password','This preview has no system accounts.','status','Not Set']]},
    'Users & Groups': {icon:'♙',description:'Manage local users and sign-in options.',rows:[['Current User','Alex · Administrator','status','Active'],['Guest User','Allow temporary local access.','toggle',false],['Add User','Create a local user profile.','button','Add User']]},
    'Family': {icon:'♡',description:'Family sharing is not connected in this local preview.',rows:[['Family Sharing','Connect an account to set up family services.','status','Not Set Up'],['Purchase Sharing','Requires a connected account.','status','Unavailable']]},
    'Internet Accounts': {icon:'☁',description:'Connect online accounts to supported apps.',rows:[['Accounts','No accounts connected.','status','None'],['Add Account','Account sign-in is not implemented in this preview.','button','Add Account']]},
    'Game Center': {icon:'◎',description:'Game Center account and multiplayer options.',rows:[['Game Center','Sign-in is not configured.','toggle',false],['Nearby Players','Allow discovery by nearby players.','toggle',false]]},
    'Wallet & Apple Pay': {icon:'▣',description:'Payment hardware and secure account services are not connected in this preview.',rows:[['Cards','No payment cards are stored.','status','Unavailable'],['Express Mode','Requires supported hardware.','status','Unavailable']]},
    'Keyboard': {icon:'⌨',description:'Adjust key repeat, input sources, and shortcuts.',rows:[['Key Repeat','', 'range',62],['Delay Until Repeat','Short','select',['Long','Medium','Short']],['Keyboard Navigation','Move focus between controls.','toggle',true],['Keyboard Shortcuts','Review available shortcuts.','button','Customize']]},
    'Mouse': {icon:'↖',description:'Adjust pointer speed and scrolling.',rows:[['Tracking Speed','', 'range',56],['Natural Scrolling','Scroll content with your gesture.','toggle',true],['Secondary Click','Enable right-click.','toggle',true]]},
    'Trackpad': {icon:'▱',description:'Adjust trackpad gestures and pointer speed.',rows:[['Tracking Speed','', 'range',58],['Tap to Click','Tap lightly to click.','toggle',true],['Force Click and haptic feedback','Use pressure-sensitive actions.','toggle',false],['Natural Scrolling','Scroll content with your gesture.','toggle',true]]},
    'Printers & Scanners': {icon:'▤',description:'Manage printers and scanners connected to this device.',rows:[['Printers','No printers configured.','status','None'],['Add Printer','Search for a local printer.','button','Add Printer']]},
    'Time Machine': {icon:'◴',description:'Choose a backup destination for your files.',rows:[['Automatic Backups','Schedule regular backups.','toggle',false],['Backup Disk','No backup disk selected.','status','Not Set'],['Add Backup Disk','Select a local destination.','button','Choose Disk']]},
    'Sharing': {icon:'↗',description:'Choose services and resources this device can share.',rows:[['File Sharing','Share files over the local network.','toggle',false],['Screen Sharing','Allow remote screen access.','toggle',false],['Media Sharing','Share media with nearby devices.','toggle',false]]},
    'Startup Disk': {icon:'▰',description:'Choose a startup system. Native startup selection is not available in this preview.',rows:[['Startup Volume','kahOS Preview','status','Selected'],['Restart to Startup Manager','Requires a native bootloader.','button','Restart']]},
    'Battery': {icon:'▰',description:'Review battery use and power options.',rows:[['Battery Health','No battery sensor detected.','status','Unavailable'],['Low Power Mode','Reduce background activity.','toggle',true],['Show Battery Percentage','Display charge in the menu bar.','toggle',true]]},
    'Privacy & Security': {icon:'◈',description:'Review app access and privacy controls for this preview.',rows:[['Location Services','Allow apps to request your location.','toggle',false],['Camera','No camera access granted.','status','Off'],['Microphone','No microphone access granted.','status','Off'],['Analytics & Improvements','Share diagnostics from this preview.','toggle',false]]},
    'Apple Intelligence & Siri': {icon:'✦',description:'Voice and cloud intelligence services are not connected in this preview.',rows:[['Siri','Voice assistant is not configured.','toggle',false],['Apple Intelligence','Requires supported services and hardware.','status','Unavailable'],['Improve Siri & Dictation','Share audio samples for improvement.','toggle',false]]}
  };

  function appearancePaneHtml() {
    const intensity = Number(localStorage.getItem('kahos-glass') || 72);
    const mode = localStorage.getItem('kahos-appearance') || 'dark';
    const accent = localStorage.getItem('kahos-accent') || '#a995ff';
    const colors = ['#a995ff','#ff7b72','#ffb454','#f4d35e','#53d6a3','#61b9ff','#ed82c6'];
    return `<div class="settings-pane appearance-pane"><div class="settings-pane-head"><div><span class="widget-eyebrow">PERSONALIZATION</span><h2>Appearance</h2><p>Choose the look of menus, windows, and controls.</p></div></div><section class="preference-card appearance-controls"><div class="preference-row"><div><strong>Appearance</strong><small>Choose a light or dark appearance.</small></div><div class="segmented-control">${[['light','Light'],['dark','Dark'],['auto','Auto']].map(([id,label])=>`<button class="appearance-mode ${mode===id?'selected':''}" data-mode="${id}">${label}</button>`).join('')}</div></div><div class="preference-row accent-row"><div><strong>Accent color</strong><small>Used for selection and active controls.</small></div><div class="accent-choices">${colors.map(color=>`<button class="accent-choice ${accent===color?'selected':''}" data-accent="${color}" style="--swatch:${color}" aria-label="Accent ${color}"></button>`).join('')}</div></div></section><section class="glass-section"><div class="glass-heading"><div><span class="widget-eyebrow">WINDOW MATERIAL</span><h3>Liquid Glass</h3></div><span class="glass-value" id="glassValue">${intensity}%</span></div><p>Move from the solid, classic Mac look to translucent Liquid Glass. The surface stays tinted and readable at every setting.</p><div class="glass-preview" id="glassPreview"><div class="preview-desktop-icons"><i></i><i></i><i></i></div><div class="preview-menu-bar"><span>kahOS</span><span>File&nbsp;&nbsp; Edit&nbsp;&nbsp; View</span><span>Wi-Fi&nbsp;&nbsp; 9:41</span></div><div class="preview-window"><div class="preview-traffic"><i></i><i></i><i></i></div><strong>Quick Settings</strong><small>Personalize your desktop</small><div class="preview-control"><span>Appearance</span><b>Dark</b></div><div class="preview-control"><span>Liquid Glass</span><b id="previewGlassLabel">${intensity}%</b></div></div><div class="preview-dock"><i></i><i></i><i></i><i></i><i></i></div></div><div class="glass-slider-wrap"><div class="glass-slider-top"><strong>Glass intensity</strong><span id="glassModeLabel">${glassLabel(intensity)}</span></div><input class="glass-slider" id="glassSlider" type="range" min="0" max="100" step="1" value="${intensity}" aria-label="Liquid Glass intensity"><div class="glass-endpoints"><span>Classic · solid</span><span>Liquid Glass · translucent</span></div></div></section><section class="preference-card compact-card"><div class="preference-row"><div><strong>Reduce transparency</strong><small>Keep surfaces more opaque for legibility.</small></div><button class="pref-toggle" data-pref="Appearance:reduce-transparency" aria-pressed="${localStorage.getItem('kahos-pref-Appearance:reduce-transparency')==='true'}"><i></i></button></div></section></div>`;
  }

  function glassLabel(value) {
    if (value < 20) return 'Classic Mac';
    if (value < 48) return 'Subtle glass';
    if (value < 78) return 'Liquid Glass';
    return 'More translucent';
  }

  function renderSettingsPane(win, name) {
    const main = $('.settings-main',win);
    if (!main) return;
    win.dataset.pane = name;
    if (name === 'Appearance') main.innerHTML = appearancePaneHtml();
    else if (name === 'Wallpaper') main.innerHTML = wallpaperPaneHtml();
    else main.innerHTML = genericSettingsPane(name);
    $$('.settings-nav-item',win).forEach(button=>button.classList.toggle('active',button.dataset.setting===name));
    bindSettingsPane(win,name);
  }

  function wallpaperPaneHtml() {
    return `<div class="settings-pane"><div class="settings-pane-head"><div><span class="widget-eyebrow">PERSONALIZATION</span><h2>Wallpaper</h2><p>Choose a look for the desktop and Lock Screen.</p></div></div><div class="wallpaper-options">${wallpaperOption('user','Your Tahoe dark')}${wallpaperOption('aurora','Aurora')}${wallpaperOption('graphite','Graphite')}${wallpaperOption('violet','Violet dusk')}${wallpaperOption('coast','Coastal light')}</div><div class="preference-card compact-card"><div class="preference-row"><div><strong>Apple wallpaper downloads</strong><small>Browse the official Apple wallpaper collection.</small></div><button class="pref-action apple-wallpaper-link">Browse Apple</button></div><div class="preference-row"><div><strong>Low-power motion</strong><small>Limit interface motion and transitions.</small></div><button class="pref-toggle" data-pref="Wallpaper:low-motion" aria-pressed="${localStorage.getItem('kahos-low-motion')==='on'}"><i></i></button></div></div></div>`;
  }

  function genericSettingsPane(name) {
    const pane = preferencePanes[name] || {icon:'⚙',description:'Settings for this part of your kahOS desktop.',rows:[]};
    return `<div class="settings-pane"><div class="settings-pane-head"><div><span class="widget-eyebrow">SYSTEM SETTINGS</span><h2>${name}</h2><p>${pane.description}</p></div><span class="pane-symbol">${pane.icon}</span></div><section class="preference-card">${pane.rows.map(([label,detail,type,value],index)=>preferenceRow(name,label,detail,type,value,index)).join('')}</section><p class="settings-footnote">Some controls are previews and depend on system hardware or services.</p></div>`;
  }

  function preferenceRow(category,label,detail,type,value,index) {
    const key = `${category}:${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
    const saved = localStorage.getItem(`kahos-pref-${key}`);
    if (type === 'toggle') {
      const on = saved === null ? !!value : saved === 'true';
      return `<div class="preference-row"><div><strong>${label}</strong><small>${detail}</small></div><button class="pref-toggle ${on?'on':''}" data-pref="${key}" aria-pressed="${on}" aria-label="${label}"><i></i></button></div>`;
    }
    if (type === 'range') {
      const current = saved === null ? value : Number(saved);
      return `<div class="preference-row preference-range-row"><div><strong>${label}</strong><small class="range-value">${current}%</small></div><input class="pref-range" type="range" min="0" max="100" value="${current}" data-pref="${key}" aria-label="${label}"></div>`;
    }
    if (type === 'select') {
      const options = value;
      const current = saved || options[0];
      return `<div class="preference-row"><div><strong>${label}</strong><small>${detail}</small></div><select class="pref-select" data-pref="${key}" aria-label="${label}">${options.map(option=>`<option ${option===current?'selected':''}>${option}</option>`).join('')}</select></div>`;
    }
    if (type === 'status') return `<div class="preference-row"><div><strong>${label}</strong><small>${detail}</small></div><span class="pref-status">${value}</span></div>`;
    return `<div class="preference-row"><div><strong>${label}</strong><small>${detail}</small></div><button class="pref-action" data-action="${label}">${value}</button></div>`;
  }

  function bindSettingsPane(win,name) {
    const main = $('.settings-main',win);
    const glass = $('#glassSlider',main);
    if (glass) glass.addEventListener('input',()=>applyGlass(glass.value,true));
    $$('.appearance-mode',main).forEach(button=>button.addEventListener('click',()=>{
      localStorage.setItem('kahos-appearance',button.dataset.mode);
      $$('.appearance-mode',main).forEach(item=>item.classList.toggle('selected',item===button));
      document.documentElement.dataset.appearance=button.dataset.mode;
      toast(`${button.textContent} appearance selected`);
    }));
    $$('.accent-choice',main).forEach(button=>button.addEventListener('click',()=>{
      localStorage.setItem('kahos-accent',button.dataset.accent);
      document.documentElement.style.setProperty('--accent',button.dataset.accent);
      document.documentElement.style.setProperty('--accent-color',button.dataset.accent);
      $$('.accent-choice',main).forEach(item=>item.classList.toggle('selected',item===button));
    }));
    $$('[data-wall]',main).forEach(button=>button.addEventListener('click',()=>setWallpaper(button.dataset.wall,win)));
    const motion = $('[data-pref="Wallpaper:low-motion"]',main);
    if (motion) motion.addEventListener('click',()=>{
      const on=motion.getAttribute('aria-pressed')!=='true';motion.setAttribute('aria-pressed',String(on));motion.classList.toggle('on',on);
      document.body.classList.toggle('reduce-motion',on);localStorage.setItem('kahos-low-motion',on?'on':'off');
    });
    $$('.pref-toggle',main).forEach(button=>{
      if(button===motion)return;
      button.addEventListener('click',()=>{
        const on=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(on));button.classList.toggle('on',on);
        const key=button.dataset.pref;localStorage.setItem(`kahos-pref-${key}`,String(on));
        if(key==='Appearance:reduce-transparency') applyGlass(localStorage.getItem('kahos-glass')||72,false);
        if(key==='Accessibility:reduce-motion'){document.body.classList.toggle('reduce-motion',on);localStorage.setItem('kahos-low-motion',on?'on':'off')}
      });
    });
    $$('.pref-range',main).forEach(input=>input.addEventListener('input',()=>{
      localStorage.setItem(`kahos-pref-${input.dataset.pref}`,input.value);
      const label=$('.range-value',input.parentElement);if(label)label.textContent=`${input.value}%`;
      if(input.dataset.pref==='Displays:brightness') desktop.style.filter=`brightness(${input.value/85})`;
    }));
    $$('.pref-select',main).forEach(select=>select.addEventListener('change',()=>localStorage.setItem(`kahos-pref-${select.dataset.pref}`,select.value)));
    $$('.pref-action',main).forEach(button=>button.addEventListener('click',()=>{
      if(button.classList.contains('apple-wallpaper-link')) window.open('https://developer.apple.com/wwdc26/wallpaper/','_blank','noopener,noreferrer');
      else toast(`${button.dataset.action||button.textContent} is a preview control`);
    }));
  }

  function applyGlass(value, persist = false) {
    const intensity=Math.max(0,Math.min(100,Number(value)||0));
    const level=intensity/100;
    const alpha=0.96-(level*0.50);
    const panelAlpha=0.98-(level*0.24);
    const blur=Math.round(level*28);
    document.documentElement.style.setProperty('--glass-level',level.toFixed(2));
    document.documentElement.style.setProperty('--glass-alpha',alpha.toFixed(2));
    document.documentElement.style.setProperty('--panel-alpha',panelAlpha.toFixed(2));
    document.documentElement.style.setProperty('--glass-blur',`${blur}px`);
    document.documentElement.style.setProperty('--glass-saturation',(1+level*.48).toFixed(2));
    document.documentElement.style.setProperty('--dock-alpha',(0.92-level*.45).toFixed(2));
    document.documentElement.style.setProperty('--glass-border-alpha',(0.24-level*.08).toFixed(2));
    document.documentElement.style.setProperty('--preview-alpha',(0.98-level*.54).toFixed(2));
    const valueLabel=$('#glassValue');if(valueLabel)valueLabel.textContent=`${intensity}%`;
    const previewLabel=$('#previewGlassLabel');if(previewLabel)previewLabel.textContent=`${intensity}%`;
    const modeLabel=$('#glassModeLabel');if(modeLabel)modeLabel.textContent=glassLabel(intensity);
    const reduceTransparency=localStorage.getItem('kahos-pref-Appearance:reduce-transparency')==='true';
    if(reduceTransparency){document.documentElement.style.setProperty('--glass-alpha','.96');document.documentElement.style.setProperty('--panel-alpha','.98');document.documentElement.style.setProperty('--glass-blur','0px');document.documentElement.style.setProperty('--preview-alpha','.96');document.documentElement.style.setProperty('--dock-alpha','.92');}
    const input=$('#glassSlider');if(input&&Number(input.value)!==intensity)input.value=String(intensity);
    if(persist)localStorage.setItem('kahos-glass',String(intensity));
  }

  function bindSettings(win) {
    $$('.settings-nav-item',win).forEach(button=>button.addEventListener('click',()=>renderSettingsPane(win,button.dataset.setting)));
    const search=$('.settings-search',win);
    search.addEventListener('input',()=>{
      const query=search.value.trim().toLowerCase();
      $$('.settings-nav-item',win).forEach(button=>{button.hidden=!!query&&!button.dataset.setting.toLowerCase().includes(query)});
      const first=$('.settings-nav-item:not([hidden])',win);if(query&&first)renderSettingsPane(win,first.dataset.setting);
    });
    bindSettingsPane(win,'Appearance');
  }

  function wallpaperOption(name,label) {
    const image = name === 'user' ? 'background-image:url("../assets/wallpapers/tahoe-dark-user.jpg")' : '';
    const selected = (localStorage.getItem('kahos-wallpaper') || 'user') === name;
    return `<button class="wallpaper-option ${selected?'selected':''}" data-wall="${name}" style="${image}" aria-label="Set ${label} wallpaper"><span>${label}</span></button>`;
  }

  function calendarBody() {
    const now = new Date();
    const start = new Date(now.getFullYear(),now.getMonth(),1).getDay();
    const count = new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    const cells = ['S','M','T','W','T','F','S'].map(d=>`<span class="head">${d}</span>`);
    for(let i=0;i<start;i++) cells.push('<span></span>');
    for(let d=1;d<=count;d++) cells.push(`<span class="${d===now.getDate()?'today':''}">${d}</span>`);
    return `<div class="app-content"><div class="simple-card"><span class="widget-eyebrow">${new Intl.DateTimeFormat(undefined,{year:'numeric'}).format(now)}</span><h2>${new Intl.DateTimeFormat(undefined,{month:'long'}).format(now)}</h2><div class="calendar-grid">${cells.join('')}</div></div></div>`;
  }

  function musicBody() {
    return `<div class="wave-layout"><aside class="wave-sidebar"><div class="wave-brand"><img src="../assets/icons/wave.svg" alt=""><span>Wave</span></div><button class="wave-nav active" data-wave-view="library">⌂ <span>Your library</span></button><button class="wave-nav" data-wave-view="liked">♡ <span>Liked tracks</span></button><div class="wave-sidebar-foot">Private by design<br><small>Files stay on this device</small></div></aside><section class="wave-main"><header class="wave-header"><div><span class="widget-eyebrow">YOUR MUSIC, YOUR WAY</span><h2>Listen without limits.</h2><p>Import audio you own. No ads, tracking, or account required.</p></div><label class="wave-import">＋ Add music<input class="wave-files" type="file" accept="audio/*" multiple hidden></label></header><label class="wave-search">⌕ <input class="wave-filter" placeholder="Search your library" aria-label="Search library"></label><div class="wave-list-head"><span>TRACK</span><span>FILE</span><span>TIME</span><span></span></div><div class="wave-track-list"></div><div class="wave-empty"><div class="wave-empty-icon">♫</div><strong>Your library starts here</strong><p>Import MP3, FLAC, WAV, or other audio files to build a private, ad-free collection.</p><label class="wave-import secondary">Choose audio files<input class="wave-files" type="file" accept="audio/*" multiple hidden></label></div><footer class="wave-player"><button class="wave-toggle" aria-label="Play">▶</button><div class="wave-player-meta"><strong class="wave-current-title">Choose a track</strong><small class="wave-current-subtitle">Local playback · no network required</small></div><span class="wave-time">0:00</span><input class="wave-seek" type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="wave-duration">0:00</span><input class="wave-volume" type="range" min="0" max="1" step="0.01" value="0.8" aria-label="Volume"></footer></section></div>`;
  }

  const terminalProfiles = {
    mac:{label:'macOS · zsh',prompt:'alex@kahos ~ %',welcome:'zsh · kahOS preview shell',icon:'<span class="terminal-os-mark apple-mark"><img src="../assets/icons/kahos-logo-source.jpg" alt="Apple logo"></span>'},
    windows:{label:'Windows · PowerShell',prompt:'PS C:\\Users\\Alex>',welcome:'PowerShell · kahOS preview shell',icon:'<span class="terminal-os-mark windows-mark"><i></i><i></i><i></i><i></i></span>'},
    linux:{label:'Linux · bash',prompt:'alex@kahos:~$',welcome:'bash · kahOS preview shell',icon:'<span class="terminal-os-mark linux-mark">L</span>'}
  };

  function terminalBody() {
    return `<div class="terminal-app"><nav class="terminal-profiles" aria-label="Terminal profiles">${Object.entries(terminalProfiles).map(([id,profile])=>`<button class="terminal-profile ${id==='mac'?'active':''}" data-shell="${id}">${profile.icon}<span>${profile.label}</span></button>`).join('')}</nav><div class="terminal-session" data-shell="mac"><div class="terminal-output" aria-live="polite"></div><form class="terminal-command-line"><span class="terminal-prompt">${terminalProfiles.mac.prompt}</span><input class="terminal-input" aria-label="Terminal command" autocomplete="off" spellcheck="false"><button aria-label="Run command">↵</button></form></div><p class="terminal-safety-note">Preview shells only · commands are simulated and do not run on your computer.</p></div>`;
  }

  function selectTerminalShell(win,id) {
    const profile=terminalProfiles[id]||terminalProfiles.mac;
    win.dataset.shell=id in terminalProfiles?id:'mac';
    $('.terminal-session',win).dataset.shell=win.dataset.shell;
    $$('.terminal-profile',win).forEach(button=>button.classList.toggle('active',button.dataset.shell===win.dataset.shell));
    $('.terminal-prompt',win).textContent=profile.prompt;
    $('.terminal-output',win).replaceChildren();
    terminalWrite(win,profile.welcome,'terminal-welcome-line');
    $('.terminal-input',win).focus();
  }

  function terminalWrite(win,text,className='') {
    const line=document.createElement('div');
    line.className=`terminal-output-line ${className}`.trim();
    line.textContent=text;
    $('.terminal-output',win).append(line);
    $('.terminal-output',win).scrollTop=$('.terminal-output',win).scrollHeight;
  }

  function runPreviewCommand(win,command) {
    const shell=win.dataset.shell||'mac';
    const profile=terminalProfiles[shell];
    terminalWrite(win,`${profile.prompt} ${command}`,'terminal-command-echo');
    const normalized=command.trim().toLowerCase();
    if(!normalized)return;
    if(normalized==='clear'||normalized==='cls'){ $('.terminal-output',win).replaceChildren(); return; }
    let result='Command not found. Try help.';
    if(normalized==='help') result=shell==='windows'?'Commands: help, dir, cd, whoami, date, clear':'Commands: help, ls, cd, pwd, whoami, date, clear';
    else if(['whoami','whoami.exe'].includes(normalized)) result=shell==='windows'?'kahOS\\Alex':'alex';
    else if(normalized==='date'||normalized==='get-date') result=new Date().toLocaleString();
    else if((shell==='windows'&&['dir','ls'].includes(normalized))||((shell==='mac'||shell==='linux')&&normalized==='ls')) result=shell==='windows'?' Desktop  Documents  Downloads  Pictures':'Desktop  Documents  Downloads  Pictures';
    else if(['pwd','get-location'].includes(normalized)) result=shell==='windows'?'C:\\Users\\Alex':'/home/alex';
    else if(normalized==='uname'&&shell==='linux') result='kahOS-preview Linux compatibility profile';
    else if(normalized.startsWith('echo ')) result=command.slice(5);
    else if(/\.exe(?:\s|$)/i.test(command)) result='Windows .exe support is a future OS requirement; this preview cannot execute binaries.';
    else if(normalized.startsWith('sudo')) result='Administrator commands are disabled in this safe preview.';
    terminalWrite(win,result);
  }

  function bindWindow(win) {
    win.addEventListener('pointerdown', () => { win.style.zIndex = ++zIndex; setFocused(win.dataset.app); });
    const close = $('.traffic-lights button:first-child',win);
    close.addEventListener('click',event=>{event.stopPropagation();const app=win.dataset.app;if(app==='photos'){photoUrls.forEach(url=>URL.revokeObjectURL(url));photoUrls=[];}win.remove();const dock=$(`.dock-app[data-open="${app}"]`);if(dock)dock.classList.remove('open');if(focusedApp===app)setFocused('finder');});
    $('.traffic-lights button:nth-child(2)',win).addEventListener('click',event=>{event.stopPropagation();win.classList.toggle('minimized');win.style.display=win.style.display==='none'?'block':'none';});
    $('.traffic-lights button:nth-child(3)',win).addEventListener('click',event=>{event.stopPropagation();win.classList.toggle('zoomed');if(win.classList.contains('zoomed')){win.dataset.oldStyle=win.getAttribute('style')||'';win.style.left='0';win.style.top='0';win.style.transform='none';win.style.width='100%';win.style.height='100%';win.style.borderRadius='0'}else{win.removeAttribute('style');win.style.zIndex=++zIndex;}});
    const titlebar = $('.window-titlebar',win);
    titlebar.addEventListener('pointerdown',event=>{
      if(event.target.closest('.traffic-lights') || win.classList.contains('zoomed')) return;
      const rect=win.getBoundingClientRect();const dx=event.clientX-rect.left;const dy=event.clientY-rect.top;
      titlebar.setPointerCapture(event.pointerId);
      const move=e=>{win.style.left=`${Math.max(0,Math.min(innerWidth-90,e.clientX-dx))}px`;win.style.top=`${Math.max(38,Math.min(innerHeight-90,e.clientY-dy))}px`;win.style.transform='none';};
      const end=()=>{titlebar.removeEventListener('pointermove',move);titlebar.removeEventListener('pointerup',end);};
      titlebar.addEventListener('pointermove',move);titlebar.addEventListener('pointerup',end);
    });
  }

  function bindApp(win, app) {
    if(app==='finder'||app==='trash') {
      renderFiles(win,app==='trash'?'Trash':'Recents');
      $$('.finder-nav button',win).forEach(button=>button.addEventListener('click',()=>renderFiles(win,button.dataset.folder,'')));
      $('.finder-search',win).addEventListener('input',event=>renderFiles(win,activeFolder,event.target.value));
      $('.file-grid',win).addEventListener('dblclick',event=>{
        const item=event.target.closest('.file-item');if(!item)return;
        const type=item.dataset.type;
        if(type==='folder') { const name=item.dataset.entry; if(folders[name]) renderFiles(win,name,''); else toast(`${name} opened`); }
        else if(type.startsWith('app:')) openApp(type.slice(4));
        else toast(`${item.dataset.entry} selected`);
      });
      $('.file-grid',win).addEventListener('click',event=>{const item=event.target.closest('.file-item');if(item){$$('.file-item',win).forEach(i=>i.classList.remove('selected'));item.classList.add('selected')}});
    }
    if(app==='brave') {
      const form=$('.browser-search',win);const address=$('.browser-address',win);
      const search=query=>{const value=query.trim();if(!value)return;const url=`https://search.brave.com/search?q=${encodeURIComponent(value)}`;window.open(url,'_blank','noopener,noreferrer');address.value=value;toast('Opening Brave Search in a new tab');};
      form.addEventListener('submit',event=>{event.preventDefault();search($('input',form).value)});
      address.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search(address.value)}});
      $('.browser-toolbar button:nth-child(3)',win).addEventListener('click',()=>toast('Page refreshed'));
    }
    if(app==='notes') {
      const area=$('textarea',win);const key='kahos-welcome-note';area.value=localStorage.getItem(key)||area.value;area.addEventListener('input',()=>localStorage.setItem(key,area.value));
    }
    if(app==='settings') bindSettings(win);
    if(app==='photos') bindPhotos(win);
    if(app==='wave') bindWave(win);
    if(app==='terminal') {
      $$('.terminal-profile',win).forEach(button=>button.addEventListener('click',()=>selectTerminalShell(win,button.dataset.shell)));
      $('.terminal-command-line',win).addEventListener('submit',event=>{event.preventDefault();const input=$('.terminal-input',win);const command=input.value;input.value='';runPreviewCommand(win,command)});
      selectTerminalShell(win,'mac');
    }
  }

  function bindPhotos(win) {
    const input=$('.photo-files',win), grid=$('.photo-import-grid',win), empty=$('.photo-empty',win), viewer=$('.photo-viewer',win);
    $$('[data-wall]',win).forEach(button=>button.addEventListener('click',()=>setWallpaper(button.dataset.wall,win)));
    input.addEventListener('change',()=>{
      for(const file of input.files){
        if(!file.type.startsWith('image/')) continue;
        const url=URL.createObjectURL(file);photoUrls.push(url);
        const tile=document.createElement('button');tile.className='photo-import-tile';tile.type='button';
        const image=document.createElement('img');image.src=url;image.alt=file.name;image.loading='lazy';
        const label=document.createElement('span');label.textContent=file.name;
        tile.append(image,label);tile.addEventListener('click',()=>{viewer.querySelector('img').src=url;viewer.querySelector('img').alt=file.name;viewer.querySelector('span').textContent=file.name;viewer.hidden=false});grid.append(tile);
      }
      input.value='';
      const count=grid.children.length;$('.photo-count',win).textContent=`${count} ${count===1?'item':'items'}`;empty.hidden=count>0;
    });
    $('.photo-viewer-close',win).addEventListener('click',()=>{viewer.hidden=true;viewer.querySelector('img').removeAttribute('src')});
    viewer.addEventListener('click',event=>{if(event.target===viewer){viewer.hidden=true;viewer.querySelector('img').removeAttribute('src')}});
  }
  function setWallpaper(name,win) {
    localStorage.setItem('kahos-wallpaper',name);
    const map={user:"url('../assets/wallpapers/tahoe-dark-user.jpg')",aurora:'radial-gradient(ellipse at 15% 25%,rgba(94,211,180,.85),transparent 36%),radial-gradient(ellipse at 75% 70%,rgba(110,87,212,.9),transparent 38%),linear-gradient(145deg,#112840,#111127 52%,#522d6a)',graphite:'radial-gradient(ellipse at 55% 22%,#5e626b,transparent 37%),linear-gradient(135deg,#111216,#25262e 54%,#09090b)',violet:'radial-gradient(ellipse at 30% 75%,#c158d7,transparent 42%),radial-gradient(ellipse at 80% 20%,#4569dd,transparent 43%),linear-gradient(135deg,#1c1035,#101a34)',coast:'radial-gradient(ellipse at 70% 65%,#52a9ba,transparent 36%),radial-gradient(ellipse at 30% 40%,#db9675,transparent 43%),linear-gradient(160deg,#254369,#0e1627 70%)'};
    desktop.style.backgroundImage=map[name]||map.user;
    $$('[data-wall]',win).forEach(button=>button.classList.toggle('selected',button.dataset.wall===name));
    toast(name==='user'?'Your Tahoe dark wallpaper is set':`${name[0].toUpperCase()+name.slice(1)} wallpaper is set`);
  }

  function hidePopovers() { menuPopover.hidden=true;controlPopover.hidden=true; }
  function menuItems(menu) {
    const groups={
      kahOS:[['About kahOS','about'],['System Settings','settings'],['Sleep','sleep'],['Restart…','restart']],
      File:[['New Finder Window','finder'],['Open Brave Browser','brave'],['Close Window','close']],
      Edit:[['Undo','toast:Nothing to undo'],['Copy','toast:Selected content copied'],['Select All','toast:All items selected']],
      View:[['Show Desktop','desktop'],['Change Wallpaper','settings']],
      Window:[['Minimize','minimize'],['Zoom','zoom']],
      Go:[['Recents','folder:Recents'],['Applications','folder:Applications'],['Documents','folder:Documents'],['Downloads','folder:Downloads'],['Computer','folder:Macintosh HD']],
      Help:[['kahOS User Guide','notes'],['About This Prototype','about']]
    };
    return (groups[menu]||groups.kahOS).map(([label,action])=>`<button data-action="${action}">${label}</button>`).join('');
  }
  function showMenu(menu,button) {
    controlPopover.hidden=true;
    menuPopover.innerHTML=menuItems(menu);
    menuPopover.className='popover menu-popover';
    const rect=button.getBoundingClientRect();menuPopover.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-220))}px`;
    menuPopover.hidden=false;
    $$('button',menuPopover).forEach(item=>item.addEventListener('click',()=>{
      const action=item.dataset.action;hidePopovers();
      if(action==='close'){const win=$(`.app-window[data-app="${focusedApp}"]`);if(win)win.remove()}
      else if(action==='sleep')toast('Display sleeping…')
      else if(action==='restart'){bootScreen.classList.remove('done');desktop.classList.remove('ready');setTimeout(()=>{bootScreen.classList.add('done');desktop.classList.add('ready')},900)}
      else if(action==='desktop'){$$('.app-window').forEach(win=>win.style.display='none');toast('Desktop shown')}
      else if(action==='minimize'){const win=$(`.app-window[data-app="${focusedApp}"]`);if(win)win.style.display='none'}
      else if(action==='zoom'){const win=$(`.app-window[data-app="${focusedApp}"]`);if(win)$('.traffic-lights button:nth-child(3)',win).click()}
      else if(action==='about')showAbout()
      else if(action.startsWith('folder:')){const folder=action.slice(7);openApp('finder');const finder=$('.app-window[data-app="finder"]');if(finder)renderFiles(finder,folder,'')}
      else if(action.startsWith('toast:'))toast(action.slice(6))
      else openApp(action);
    }));
  }
  function showAbout(){
    const existing=$('.app-window[data-app="about"]');if(existing){existing.remove()}
    const win=document.createElement('section');win.className='app-window';win.dataset.app='about';win.style.zIndex=++zIndex;win.style.width='380px';win.style.height='300px';
    win.innerHTML=`<header class="window-titlebar"><div class="traffic-lights"><button aria-label="Close window"></button><button aria-label="Minimize window"></button><button aria-label="Zoom window"></button></div><span class="window-title">About kahOS</span></header><div class="window-body app-content" style="text-align:center;padding-top:30px"><div class="boot-logo" style="margin:0 auto 13px;width:65px;height:65px"><img src="../assets/icons/kahos-logo-source.jpg" alt=""></div><h2>kahOS</h2><p>Version 0.5.0 · Tahoe-inspired desktop preview</p><p>Designed to stay light: static assets, vanilla JavaScript, no framework runtime.</p></div>`;
    windowsLayer.append(win);bindWindow(win);setFocused('about');
  }

  $('#appleMenuButton').addEventListener('click',event=>showMenu('kahOS',event.currentTarget));
  $$('.menu-item').forEach(button=>button.addEventListener('click',()=>showMenu(button.dataset.menu,button)));
  $$('.dock-app,.desktop-shortcut,.welcome-widget button').forEach(button=>button.addEventListener('click',()=>openApp(button.dataset.open,button.dataset.shell)));
  $('#controlCenterButton').addEventListener('click',()=>{menuPopover.hidden=true;controlPopover.hidden=!controlPopover.hidden});
  $('#clockButton').addEventListener('click',()=>openApp('calendar'));
  $('#wifiButton').addEventListener('click',()=>toast('Connected to kahOS Network'));
  $('#islandTrigger').addEventListener('click',()=>toggleIsland());
  $('#islandMainButton').addEventListener('click',()=>toggleIsland());
  $('#dynamicIsland').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleIsland()}});
  $('#islandClose').addEventListener('click',event=>{event.stopPropagation();$('#dynamicIsland').classList.remove('expanded')});
  $('#playToggle').addEventListener('click',togglePlayback);
  $('#previousTrack').addEventListener('click',()=>skipTrack(-1));
  $('#nextTrack').addEventListener('click',()=>skipTrack(1));
  $('#timerButton').addEventListener('click',startTimer);
  $('#wifiToggle').addEventListener('click',event=>{const toggle=$('.toggle',event.currentTarget);toggle.classList.toggle('on');toast(toggle.classList.contains('on')?'Wi-Fi connected':'Wi-Fi off')});
  $('#focusToggle').addEventListener('click',event=>{const toggle=$('.toggle',event.currentTarget);toggle.classList.toggle('on');toast(toggle.classList.contains('on')?'Focus enabled':'Focus disabled')});
  $('.brightness-row input').addEventListener('input',event=>{desktop.style.filter=`brightness(${event.target.value/85})`});
  document.addEventListener('click',event=>{if(!event.target.closest('.popover')&&!event.target.closest('.menu-item')&&!event.target.closest('#appleMenuButton')&&!event.target.closest('#controlCenterButton'))hidePopovers()});
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openFinderSearch()}
    if(event.key==='Escape')hidePopovers();
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='q'){const win=$(`.app-window[data-app="${focusedApp}"]`);if(win)win.remove()}
  });

  function openFinderSearch(){
    openApp('finder');
    const win=$('.app-window[data-app="finder"]');const input=$('.finder-search',win);input.focus();input.placeholder='Find apps or files';
    input.addEventListener('input',()=>{
      const query=input.value.toLowerCase();
      const matches=Object.entries(appTitles).filter(([,title])=>title.toLowerCase().includes(query));
      if(query&&matches.length===1){const [app]=matches[0];$('.finder-status',win).textContent=`App found · double-click ${appTitles[app]} in Applications`}
      else renderFiles(win,'Applications',query);
    });
    renderFiles(win,'Applications','');
  }

  function toggleIsland(){
    const island=$('#dynamicIsland');island.classList.toggle('expanded');
  }
  function formatTime(seconds){if(!Number.isFinite(seconds))return '0:00';return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`}
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  function updateWavePlayer(){
    const track=library[currentTrack];playing=!audioElement.paused;
    $$('.app-window[data-app="wave"]').forEach(win=>{
      const q=sel=>$(sel,win);if(!q('.wave-toggle'))return;
      q('.wave-toggle').textContent=playing?'Ⅱ':'▶';q('.wave-toggle').setAttribute('aria-label',playing?'Pause':'Play');
      q('.wave-current-title').textContent=track?.title||'Choose a track';q('.wave-current-subtitle').textContent=track?.artist||'Local playback · no network required';
      q('.wave-time').textContent=formatTime(audioElement.currentTime);q('.wave-duration').textContent=formatTime(audioElement.duration);
      q('.wave-seek').value=Number.isFinite(audioElement.duration)&&audioElement.duration?Math.round(audioElement.currentTime/audioElement.duration*1000):0;
      const query=q('.wave-filter').value.toLowerCase();q('.wave-track-list').innerHTML=library.map((item,index)=>({item,index})).filter(({item,index})=>(waveView!=='liked'||likedTracks.has(index))&&item.title.toLowerCase().includes(query)).map(({item,index})=>`<div class="wave-track ${index===currentTrack?'selected':''}" data-track="${index}"><button class="wave-track-open"><span class="wave-track-art">♫</span><span class="wave-track-title">${escapeHtml(item.title)}<small>${escapeHtml(item.artist)}</small></span></button><span class="wave-track-album">${escapeHtml(item.file.name)}</span><span class="wave-track-time">${item.duration||'—'}</span><button class="wave-like ${likedTracks.has(index)?'liked':''}" data-like="${index}" aria-label="${likedTracks.has(index)?'Remove like':'Like track'}">♥</button></div>`).join('');
      const visible=waveView==='liked'?likedTracks.size:library.length;q('.wave-empty').hidden=visible>0;
      $$('.wave-track-open',win).forEach(button=>button.onclick=()=>playTrack(Number(button.closest('.wave-track').dataset.track)));
      $$('.wave-like',win).forEach(button=>button.onclick=()=>{const index=Number(button.dataset.like);if(likedTracks.has(index))likedTracks.delete(index);else likedTracks.add(index);updateWavePlayer()});
    });
    $('#trackTitle').textContent=track?.title||'Nothing playing';$('#trackArtist').textContent=track?.artist||'Add local audio in Wave';
    $('#trackProgress').style.width=Number.isFinite(audioElement.duration)&&audioElement.duration?`${audioElement.currentTime/audioElement.duration*100}%`:'0%';
    $('.track-time').innerHTML=`<span>${formatTime(audioElement.currentTime)}</span><span>${formatTime(audioElement.duration)}</span>`;
    $('#playToggle').textContent=playing?'Ⅱ':'▶';$('#playToggle').setAttribute('aria-label',playing?'Pause playback':'Play playback');
    $$('.island-wave i').forEach(bar=>bar.style.animationPlayState=playing?'running':'paused');
  }
  function playTrack(index){if(!library[index])return;currentTrack=index;audioElement.src=library[index].url;audioElement.play().then(updateWavePlayer).catch(()=>toast('Audio could not be played in this browser'));updateWavePlayer()}
  function togglePlayback(){if(!library.length){openApp('wave');toast('Add local audio to start playback');return}if(audioElement.paused)audioElement.play().catch(()=>{});else audioElement.pause();updateWavePlayer()}
  function skipTrack(direction){
    if(!library.length){openApp('wave');toast('Add local audio to start playback');return}
    if(direction<0&&audioElement.currentTime>3){audioElement.currentTime=0;updateWavePlayer();return}
    const next=(currentTrack===null?0:(currentTrack+direction+library.length)%library.length);
    playTrack(next);
  }
  function bindWave(win){
    $$('.wave-files',win).forEach(input=>input.addEventListener('change',()=>{const start=library.length;for(const file of input.files){if(file.type.startsWith('audio/'))library.push({file,title:file.name.replace(/\.[^.]+$/,''),artist:'Local file',url:URL.createObjectURL(file),duration:'—'})}if(library.length>start)playTrack(start);input.value='';updateWavePlayer()}));
    $('.wave-filter',win).addEventListener('input',updateWavePlayer);$('.wave-toggle',win).addEventListener('click',togglePlayback);
    $$('.wave-nav',win).forEach(button=>button.addEventListener('click',()=>{waveView=button.dataset.waveView;$$('.wave-nav',win).forEach(nav=>nav.classList.toggle('active',nav===button));updateWavePlayer()}));
    $('.wave-seek',win).addEventListener('input',event=>{if(Number.isFinite(audioElement.duration))audioElement.currentTime=audioElement.duration*Number(event.target.value)/1000});
    $('.wave-volume',win).addEventListener('input',event=>audioElement.volume=Number(event.target.value));updateWavePlayer();
  }
  audioElement.volume=.8;audioElement.addEventListener('timeupdate',updateWavePlayer);
  audioElement.addEventListener('loadedmetadata',()=>{if(currentTrack!==null)library[currentTrack].duration=formatTime(audioElement.duration);updateWavePlayer()});
  audioElement.addEventListener('ended',()=>{if(currentTrack!==null&&currentTrack<library.length-1)playTrack(currentTrack+1);else updateWavePlayer()});
  function startTimer(){
    clearInterval(timerInterval);let left=600;const button=$('#timerButton');button.textContent='10:00 remaining';
    timerInterval=setInterval(()=>{left-=1;if(left<=0){clearInterval(timerInterval);button.textContent='Start 10 min timer';toast('Timer complete');return}button.textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')} remaining`},1000);
  }

  // Restore a chosen local/gradient wallpaper while keeping the supplied image as the default.
  const savedWallpaper=localStorage.getItem('kahos-wallpaper');
  if(savedWallpaper&&savedWallpaper!=='user'){
    const map={aurora:'radial-gradient(ellipse at 15% 25%,rgba(94,211,180,.85),transparent 36%),radial-gradient(ellipse at 75% 70%,rgba(110,87,212,.9),transparent 38%),linear-gradient(145deg,#112840,#111127 52%,#522d6a)',graphite:'radial-gradient(ellipse at 55% 22%,#5e626b,transparent 37%),linear-gradient(135deg,#111216,#25262e 54%,#09090b)',violet:'radial-gradient(ellipse at 30% 75%,#c158d7,transparent 42%),radial-gradient(ellipse at 80% 20%,#4569dd,transparent 43%),linear-gradient(135deg,#1c1035,#101a34)',coast:'radial-gradient(ellipse at 70% 65%,#52a9ba,transparent 36%),radial-gradient(ellipse at 30% 40%,#db9675,transparent 43%),linear-gradient(160deg,#254369,#0e1627 70%)'};
    if(map[savedWallpaper])desktop.style.backgroundImage=map[savedWallpaper];
  }
  document.documentElement.dataset.appearance=localStorage.getItem('kahos-appearance')||'dark';
  document.documentElement.style.setProperty('--accent',localStorage.getItem('kahos-accent')||'#a995ff');
  document.documentElement.style.setProperty('--accent-color',localStorage.getItem('kahos-accent')||'#a995ff');
  applyGlass(localStorage.getItem('kahos-glass')||72,false);
})();
