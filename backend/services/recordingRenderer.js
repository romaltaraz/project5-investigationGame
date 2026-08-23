// services/recordingRenderer.js
//
// Renders recording evidence as the SAME self-contained HTML document the
// game has always used (waveform decoration, meta panel, transcript rows,
// styling - all pixel-identical to the pre-existing renderer), now with a
// real <audio> element wired to it: play/pause, click-a-line-to-seek, and
// active-line highlighting driven by the line's real (audio-derived)
// startTime/endTime. This file IS the "existing recording UI" - it is
// enhanced in place, not replaced.
//
// The waveform bars stay purely decorative (static SVG, as before) - they
// are never claimed to represent real audio frequency data.

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatClock = (totalSeconds = 0) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export const renderRecordingWithAudio = ({ caseName, evidence, turns, audioFilename, durationSeconds }) => {
  const rows = turns.map((turn, i) => `<div class="row" data-start="${turn.startTime}" data-end="${turn.endTime}">
        <div class="ts">${formatClock(turn.startTime)}</div>
        <div class="content">
          <div class="spk ${i % 2 === 0 ? 'spk-a' : 'spk-b'}">${escapeHtml(turn.speaker)}</div>
          <div class="text">${escapeHtml(turn.text)}</div>
        </div>
      </div>`).join('\n');

  // Waveform bars (static decorative SVG - not derived from real audio data)
  const barHeights = [8,14,22,18,30,12,26,20,10,28,16,24,8,20,14,32,10,18,26,12,22,16,8,30,20,14];
  const bars = barHeights.map((h, i) => {
    const x = 4 + i * 15;
    const y = 36 - h;
    return `<rect x="${x}" y="${y}" width="10" height="${h}" rx="2" fill="#c07030" opacity="${0.4 + (h / 80)}"/>`;
  }).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>תמלול הקלטה — ${escapeHtml(caseName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scrollbar-width:thin;scrollbar-color:rgba(212,173,99,.7) rgba(255,255,255,.04)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(17,13,11,.85);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
    body{font-family:'Courier New',Consolas,monospace;background:#0c0800;color:#c8b060;min-height:100vh}
    .top-bar{background:#1a0800;border-bottom:2px solid #7a3000;padding:10px 20px;display:flex;justify-content:space-between;align-items:center}
    .top-label{font-size:10px;letter-spacing:4px;color:#c03000;text-transform:uppercase}
    .top-id{font-size:10px;letter-spacing:2px;color:#4a3010}
    .wave-area{background:#0a0500;border-bottom:1px solid #3a1800;padding:14px 20px;display:flex;align-items:center;gap:16px}
    .play-btn{width:40px;height:40px;border-radius:50%;background:#2a1000;border:1px solid #7a3000;display:flex;align-items:center;justify-content:center;color:#c07030;font-size:18px;flex-shrink:0;cursor:pointer;user-select:none}
    .play-btn:hover{background:#3a1500}
    .wave-info{display:flex;flex-direction:column;gap:4px}
    .wave-status{font-size:9px;letter-spacing:3px;color:#c03000}
    .wave-dur{font-size:10px;color:#4a3010}
    .meta{padding:14px 20px;border-bottom:1px solid #2a1000;background:#080400;font-size:11px;color:#7a5020;line-height:2}
    .meta b{color:#a07030;margin-left:8px}
    .transcript-hdr{padding:10px 20px;font-size:9px;letter-spacing:4px;color:#3a2008;background:#060300;border-bottom:1px solid #150a00}
    .row{display:grid;grid-template-columns:52px 1fr;border-bottom:1px solid #120800;cursor:pointer;transition:background .15s ease}
    .row:hover{background:rgba(192,112,48,.08)}
    .row:nth-child(even){background:#070401}
    .row.active{background:rgba(192,112,48,.2);box-shadow:inset 3px 0 0 #c07030}
    .ts{padding:14px 8px;font-size:10px;color:#3a2408;border-left:1px solid #1a0c00;text-align:center;font-variant-numeric:tabular-nums}
    .row.active .ts{color:#e2bb73}
    .content{padding:12px 16px}
    .spk{font-size:9px;letter-spacing:2px;margin-bottom:4px;text-transform:uppercase}
    .spk-a{color:#c07030}
    .spk-b{color:#4a8aaa}
    .text{font-size:13px;color:#c8c0a0;line-height:1.6}
    .row.active .text{color:#f0e8d0}
    .footer{padding:12px 20px;border-top:2px solid #2a1000;background:#060300;font-size:9px;letter-spacing:2px;color:#2a1808;display:flex;justify-content:space-between}
  </style>
</head>
<body>
  <audio id="rec-audio" src="${escapeHtml(audioFilename)}" preload="metadata"></audio>
  <div class="top-bar">
    <span class="top-label">⬤ הקלטה מיורטת — סודי ביותר</span>
    <span class="top-id">AUDIO-INTERCEPT · תמלול</span>
  </div>
  <div class="wave-area">
    <div class="play-btn" id="play-btn">▶</div>
    <svg width="390" height="40" viewBox="0 0 390 40">${bars}</svg>
    <div class="wave-info">
      <div class="wave-status" id="wave-status">▐▐ מוכן לניגון</div>
      <div class="wave-dur" id="wave-dur">${formatClock(durationSeconds)} דקות</div>
    </div>
  </div>
  <div class="meta">
    <div><b>תיק:</b> ${escapeHtml(caseName)}</div>
    <div><b>תיאור:</b> ${escapeHtml(evidence.description || '')}</div>
  </div>
  <div class="transcript-hdr">▶ תמלול שיחה — לחץ על שורה כדי לדלג אליה</div>
  ${rows}
  <div class="footer">
    <span>הקובץ מוגן — שימוש פנימי בלבד</span>
    <span>OPS-INTEL · UNIT 7</span>
  </div>
  <script>
  (function () {
    var audio = document.getElementById('rec-audio');
    var playBtn = document.getElementById('play-btn');
    var waveStatus = document.getElementById('wave-status');
    var waveDur = document.getElementById('wave-dur');
    var rows = Array.prototype.slice.call(document.querySelectorAll('.row[data-start]'));

    function formatTime(s) {
      s = Math.max(0, s || 0);
      var mm = Math.floor(s / 60);
      var ss = Math.floor(s % 60);
      return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }

    function updatePlayState() {
      playBtn.textContent = audio.paused ? '▶' : '⏸';
      waveStatus.textContent = audio.paused ? '▐▐ מוכן לניגון' : '▶ מנגן כעת';
    }

    playBtn.addEventListener('click', function () {
      if (audio.paused) { audio.play(); } else { audio.pause(); }
    });
    audio.addEventListener('play', updatePlayState);
    audio.addEventListener('pause', updatePlayState);
    audio.addEventListener('ended', updatePlayState);
    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration)) {
        waveDur.textContent = formatTime(audio.duration) + ' דקות';
      }
    });

    audio.addEventListener('timeupdate', function () {
      var t = audio.currentTime;
      for (var i = 0; i < rows.length; i++) {
        var start = parseFloat(rows[i].getAttribute('data-start'));
        var nextStart = i + 1 < rows.length ? parseFloat(rows[i + 1].getAttribute('data-start')) : Infinity;
        if (t >= start && t < nextStart) {
          rows[i].classList.add('active');
        } else {
          rows[i].classList.remove('active');
        }
      }
    });

    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        audio.currentTime = parseFloat(row.getAttribute('data-start'));
        audio.play();
      });
    });

    function reportHeight() {
      var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.parent.postMessage({ source: 'evidence-frame', height: h }, '*');
    }
    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);
  })();
  </script>
</body>
</html>`;
};
