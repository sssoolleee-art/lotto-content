// 로또 6/45 당첨 결과를 모아 앱이 읽는 압축 JSON(data/draws.json)으로 저장한다.
// 1순위: 동행복권 공개 조회 API, 실패 시 공개 미러(smok95/lotto)로 보충한다.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/draws.json', import.meta.url);
const MIRROR = 'https://smok95.github.io/lotto/results/all.json';

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// [회차, 'YYYY-MM-DD', n1..n6, 보너스, 1등 1인당 당첨금, 1등 당첨자 수, 총 판매액]
async function fromOfficial(no) {
  const d = await getJson(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${no}`);
  if (d.returnValue !== 'success') return null;
  return [d.drwNo, d.drwNoDate, d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6, d.bnusNo, d.firstWinamnt, d.firstPrzwnerCo, d.totSellamnt];
}

function fromMirrorRow(m) {
  // divisions[0]이 비어 있으면 1등 당첨자가 없던 회차 (이월)
  const div1 = m.divisions?.[0] ?? {};
  return [m.draw_no, m.date.slice(0, 10), ...m.numbers, m.bonus_no, div1.prize ?? 0, div1.winners ?? 0, m.total_sales_amount ?? 0];
}

let rows = [];
try { rows = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 첫 실행 */ }
const have = new Map(rows.map((r) => [r[0], r]));

try {
  const mirror = await getJson(MIRROR);
  for (const m of mirror) if (!have.has(m.draw_no)) have.set(m.draw_no, fromMirrorRow(m));
} catch (e) { console.warn('mirror failed', e.message); }

// 최신 회차 이후를 공식 API로 확인 (주 1회 추첨이라 최대 몇 회차)
let next = Math.max(0, ...have.keys()) + 1;
for (let i = 0; i < 5; i++) {
  try {
    const r = await fromOfficial(next);
    if (!r) break;
    have.set(r[0], r); next++;
  } catch (e) { console.warn('official failed', e.message); break; }
}

const out = [...have.values()].sort((a, b) => a[0] - b[0]);
if (!out.length) throw new Error('no data');
await writeFile(OUT, JSON.stringify(out));
console.log('draws', out.length, 'latest', out.at(-1));
