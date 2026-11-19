// 운영용 정적 파일 빌드: public/ 을 출력 폴더로 복사하고 index.html 에 itda-api 메타를 주입한다.
// 원본 public/ 은 바꾸지 않는다. 사용: node deploy/build-static.mjs [출력 폴더, 기본 deploy/dist/public]
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = path.join(root, 'public');
const out = path.resolve(process.argv[2] || path.join(root, 'deploy', 'dist', 'public'));
const META = '<meta name="itda-api" content="on" />';

export function injectApiMeta(html) {
  if (/<meta\s+name="itda-api"/.test(html)) throw new Error('index.html already has itda-api meta');
  const next = html.replace(/<meta charset="utf-8"\s*\/?>/, (m) => `${m}\n    ${META}`);
  if (next === html) throw new Error('<meta charset="utf-8"> not found in index.html');
  return next;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await rm(out, { recursive: true, force: true });
  await cp(src, out, { recursive: true });
  const file = path.join(out, 'index.html');
  await writeFile(file, injectApiMeta(await readFile(file, 'utf8')));
  console.log(`static build → ${out}`);
}
