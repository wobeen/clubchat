// Builds the real ITDA web app (public/) into one self-contained HTML file for the contest PoC.
// Usage: node build.mjs <repo> <out.html> <disclosure-rows.html>
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [repo, out, rowsFile] = process.argv.slice(2);
const pub = path.join(repo, 'public');
const dataUri = (file, type) => `data:${type};base64,${readFileSync(path.join(pub, file)).toString('base64')}`;

let js = execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['-y', 'esbuild@0.24.0', path.join(pub, 'app.js'), '--bundle', '--format=esm', '--target=es2022', '--minify'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
);
const mark = dataUri('brand/itda-mark.png', 'image/png');
const replaceAll = (from, to) => {
  if (!js.includes(from)) throw new Error(`expected "${from}" in bundle`);
  js = js.split(from).join(to);
};
// Paths that only exist on the dev server become in-file equivalents.
replaceAll('/brand/itda-mark.png', mark);
replaceAll('href="/?practice=1"', 'href="?practice=1"');
replaceAll('href="/"', 'href="?"');
// A file:// page has an opaque origin; changing the URL through the History API throws there.
const shim = `for(const k of['pushState','replaceState']){const f=history[k].bind(history);history[k]=(s,t,u)=>{try{f(s,t,u)}catch{f(s,t)}}}\n`;

const css = ['styles.css', 'messenger.css', 'capsule.css', 'workflow.css', 'white-theme.css', 'paper.css', 'shell.css']
  .map((f) => readFileSync(path.join(pub, f), 'utf8'))
  .join('\n');
const rows = readFileSync(rowsFile, 'utf8');

const pocCss = `
/* PoC wrapper: dev-server-only links hidden; an intro dialog explains what this file is. */
[data-action="preview"], a[href="/android"] { display: none !important; }
.poc-info { position: fixed; left: 12px; bottom: 12px; z-index: 50; width: 48px; height: 48px; border-radius: 14px; border: 1px solid #c3cbd8; background: #fff; color: #023086; font: 700 12px/1.2 inherit; cursor: pointer; }
body:has(.android-room) .poc-info, body:has(#modal[open]) .poc-info { display: none; }
#poc-intro { width: min(720px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid #dde3ec; border-radius: 16px; color: #1e2330; }
#poc-intro::backdrop { background: rgb(2 30 90 / 28%); }
#poc-intro .intro { display: grid; gap: 14px; padding: 26px 28px; }
#poc-intro img { width: 220px; height: auto; }
#poc-intro h1 { margin: 0; font-size: 24px; color: #023086; }
#poc-intro p, #poc-intro li { margin: 0; font-size: 15px; line-height: 1.6; }
#poc-intro ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
#poc-intro .note { padding: 10px 14px; border-radius: 10px; background: #f3f8ff; border: 1px solid #cfe4ff; font-size: 14px; }
#poc-intro details { font-size: 13.5px; }
#poc-intro summary { cursor: pointer; font-weight: 700; color: #023086; min-height: 32px; display: flex; align-items: center; }
#poc-intro table { width: 100%; border-collapse: collapse; margin-top: 8px; }
#poc-intro th, #poc-intro td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #e3e6ec; }
#poc-intro .actions { display: flex; flex-wrap: wrap; gap: 10px; }
#poc-intro .actions a, #poc-intro .actions button { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 18px; border-radius: 10px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
/* The app theme paints every element white with !important; the intro's main button needs the same weight. */
:root body #poc-intro .start { background-color: #0045de !important; border: 1px solid #0045de !important; color: #fff !important; }
#poc-intro .practice { background: #fff; border: 1px solid #c3cbd8; color: #1e2330; }
`;

const intro = `
<dialog id="poc-intro" aria-labelledby="poc-intro-title">
  <div class="intro">
    <img src="${dataUri('brand/itda-logo.png', 'image/png')}" alt="잇다 ITDA">
    <h1 id="poc-intro-title">잇다 PoC · 팀 MEGIT</h1>
    <p>실제 잇다 웹앱을 이 파일 하나로 실행합니다. 설치나 로그인 없이 모든 화면을 직접 써 볼 수 있어요.</p>
    <ol>
      <li><b>캡슐 열기와 대화</b>: 왼쪽 목록에서 캡슐(안건 대화방)을 고르거나 + 로 새 캡슐을 만들고 메시지를 보내세요.</li>
      <li><b>결론 초안</b>: 대화 위 <b>결론 초안 만들기</b>를 누르면 결정·할 일·미결·일정이 근거 메시지와 함께 정리됩니다. 담당·날짜가 없으면 '확인 필요'로 남아요.</li>
      <li><b>위임과 합류</b>: 메시지 옆 ↳ 또는 캡슐 정보의 <b>하위 캡슐 만들기</b>로 안건을 넘기고, 하위의 결론만 상위로 돌아옵니다.</li>
      <li><b>공동 확인과 승계</b>: 참여자가 모두 확인하면 확정되고 일정이 캘린더에 등록되며, 미결 안건은 다음 캡슐로 넘어갑니다. 설정에서 참여자를 바꿔 다른 사람으로 확인해 보세요.</li>
    </ol>
    <p class="note">모든 대화와 인물은 직접 만든 가상 시연 데이터이고, 이 브라우저 안에만 저장됩니다. 이 파일은 서버·AI를 호출하지 않으며 결론 초안은 규칙 기반 추출로 만듭니다. 실제 서비스에서는 서버의 AI(Claude Haiku)가 초안을 제안하고 코드가 검증한 뒤 참여자가 확인합니다.</p>
    <details><summary>생성형 AI 활용 고지</summary>
      <table><thead><tr><th scope="col">구분</th><th scope="col">도구</th><th scope="col">사용 범위</th></tr></thead><tbody>${rows}</tbody></table>
    </details>
    <div class="actions"><button type="button" class="start" data-poc="start" autofocus>앱 시작하기</button><a class="practice" href="?practice=1">처음이면 3분 연습부터</a></div>
  </div>
</dialog>
<button type="button" class="poc-info" data-poc="info" aria-label="PoC 안내 다시 보기">PoC<br>안내</button>
<script>
{
  const d = document.getElementById('poc-intro');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-poc]');
    if (!a) return;
    if (a.dataset.poc === 'start') { sessionStorage.setItem('itda-poc-intro', 'seen'); d.close(); }
    else d.showModal();
  });
  if (!sessionStorage.getItem('itda-poc-intro') && !location.search.includes('practice')) d.showModal();
}
</script>`;

let html = readFileSync(path.join(pub, 'index.html'), 'utf8');
html = html
  .replace(
    /<link rel="icon"[^>]*>/,
    `<link rel="icon" type="image/png" href="${dataUri('favicon.png', 'image/png')}" />`,
  )
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<title>[^<]*<\/title>/, '<title>잇다 ITDA PoC · MEGIT</title>')
  .replace(/(\s*<link rel="stylesheet"[^>]*>)+/, `\n    <style>\n${css}\n${pocCss}\n    </style>`)
  .replace(
    /<script type="module" src="\/app.js"><\/script>/,
    () => `${intro}\n    <script type="module">\n${shim}${js}\n    </script>`,
  );
for (const must of ['<style>', 'poc-intro', shim.slice(0, 20)])
  if (!html.includes(must)) throw new Error(`build missing ${must}`);
if (/<link rel="stylesheet"|src="\/app.js"/.test(html)) throw new Error('external reference left');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB)`);
