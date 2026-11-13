import {test,expect} from '@playwright/test';

async function create(page,title){await page.locator('[data-action="create"]').first().click();await page.locator('#create-form input[name="title"]').fill(title);await page.locator('#create-submit').click();await expect(page.locator('.room-heading h1')).toHaveText(title);}
async function send(page,text){await page.locator('#composer textarea').fill(text);await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.locator('.message-bubble').last()).toHaveText(text);}
async function draft(page){await page.locator('.capsule-next-action [data-action="draft"], .chat-bottom-actions [data-action="draft"]').first().click();await expect(page.locator('.minutes-scroll h2')).toHaveText('결론 검토');}
async function view(page,value){await page.locator(`.capsule-view-switch [data-view="${value}"]`).click();}

test('연습을 완료하고 실제 저장소와 분리한다',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?practice=1');await create(page,'연습 독서 캡슐');
 await page.locator('.chat-bottom-actions [data-action="practice-example"]').click();await expect(page.locator('.message')).toHaveCount(3);
 await draft(page);await page.locator('.item-edit').first().click();await page.locator('#item-form input[name="text"]').fill('이번 주 책 한 권 읽고 의견 나누기');await page.locator('button[form="item-form"]').click();
 await expect(page.locator('.minute-item').first()).toContainText('이번 주 책 한 권');
 await page.locator('.review-footer [data-action="confirm"]').click();await page.locator('[data-action="tutorial-colleague"]').click();
 await expect(page.locator('.minutes-scroll h2')).toHaveText('함께 확인한 결론');
 await page.locator('[data-action="tutorial-open-next"]').click();await expect(page.locator('.room-heading h1')).toHaveText('독서 모임');await expect(page.locator('#tutorial-host')).toContainText('첫 캡슐을 완료');
 await page.reload();await expect(page.locator('#tutorial-host')).toContainText('첫 캡슐을 완료');
 await page.screenshot({path:`test-results/tutorial-${test.info().project.name}.png`});
 await page.goto('/');await expect(page.locator('.room-list-rows')).not.toContainText('연습 독서 캡슐');expect(errors).toEqual([]);
});

test('생성 위임 합류 공동확인 후 다음 캡슐까지 잇는다',async({page})=>{
 await page.goto('/');await create(page,'핵심 여정');await send(page,'결정: 준비 방향 합의');await send(page,'미결: 예산 검토');await send(page,'다음 회의: 후속 회의 | 내일 19:00 | 온라인 | 전원');
 await page.locator('#composer textarea').fill('아직 전송하지 않은 메모');await view(page,'minutes');await view(page,'chat');await expect(page.locator('#composer textarea')).toHaveValue('아직 전송하지 않은 메모');await page.locator('#composer textarea').fill('');
 await page.locator('.composer-delegate').click();await page.locator('#delegate-form input[name="title"]').fill('가격 검토');await page.locator('input[name="delegate-message"]').first().check();await page.locator('input[name="delegate-member"][value="minsu"]').check();await page.locator('button[form="delegate-form"]').click();await expect(page.locator('.child-card')).toContainText('가격 검토');
 await page.locator('.child-open').last().click();await send(page,'결정: 가격은 4000원');await draft(page);await page.locator('.review-footer [data-action="confirm"]').click();await expect(page.locator('.minutes-scroll h2')).toHaveText('함께 확인한 결론');
 await page.locator('.capsule-relations button').filter({hasText:'상위'}).click();await draft(page);await expect(page.locator('.minutes-scroll')).toContainText('가격은 4000원');
 if(test.info().project.name==='desktop'){await page.locator('[data-view="split"]').click();await expect(page.locator('.split-conversation #composer')).toBeVisible();await expect(page.locator('.split-minutes .minutes-scroll')).toBeVisible();}
 await view(page,'chat');await send(page,'결정: 추가 합의도 반영');await draft(page);await expect(page.locator('.minutes-scroll')).toContainText('추가 합의도 반영');
 await page.locator('.review-footer [data-action="confirm"]').click();await expect(page.locator('.minutes-scroll h2')).toHaveText('함께 확인한 결론');
 await page.locator('.capsule-relations button').filter({hasText:'다음'}).click();await expect(page.locator('.carryover-banner')).toContainText('예산 검토');
 await expect(page.locator('#storage-status')).toBeHidden();
});

test('동시 탭의 오래된 쓰기를 차단하고 입력을 보존한다',async({page,context})=>{
 await page.goto('/');const second=await context.newPage();await second.goto('/');
 await create(page,'첫 탭 변경');await create(second,'둘째 탭 변경').catch(()=>{});
 await expect(second.locator('#storage-status')).toContainText('다른 창');await expect(second.locator('#create-form input[name="title"]')).toHaveValue('둘째 탭 변경');
 await page.goto('/');await expect(page.locator('.room-list-rows')).toContainText('첫 탭 변경');await expect(page.locator('.room-list-rows')).not.toContainText('둘째 탭 변경');
});

test('저장 실패 후 재시도로 메시지를 복구하고 중복 생성하지 않는다',async({page})=>{
 await page.goto('/');await create(page,'저장 재시도');
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;window.failWrites=true;IDBObjectStore.prototype.put=function(...args){if(window.failWrites)throw new DOMException('Injected quota failure','QuotaExceededError');return original.apply(this,args);};});
 await page.locator('#composer textarea').fill('결정: 저장 실패에도 보존');await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.locator('#storage-status')).toContainText('저장하지 못했어요');
 await page.evaluate(()=>{window.failWrites=false;});await page.locator('[data-action="storage-retry"]').first().click();await expect(page.locator('#storage-status')).toBeHidden();await expect(page.locator('.message-bubble')).toHaveCount(1);await page.reload();await expect(page.locator('.message-bubble')).toHaveText('결정: 저장 실패에도 보존');
});

test('미결 해결과 정정본을 실제 화면에서 처리한다',async({page})=>{
 await page.goto('/');await create(page,'정정과 미결');await send(page,'결정: 첫 결정');await send(page,'미결: 장소 선택');await draft(page);
 await page.locator('[data-action="agenda"]').click();await page.locator('#agenda-form select[name="status"]').selectOption('resolved');await page.locator('#agenda-form input[name="reason"]').fill('온라인으로 결정');await page.locator('button[form="agenda-form"]').click();await expect(page.locator('.minutes-scroll')).toContainText('해결됨');
 await page.locator('.review-footer [data-action="confirm"]').click();await page.locator('[data-action="correction"]').click();await page.locator('#correction-form input[name="reason"]').fill('결정 문구 정정');await page.locator('button[form="correction-form"]').click();await expect(page.locator('.room-heading h1')).toContainText('정정');
 await page.locator('.item-edit').first().click();await page.locator('#item-form input[name="text"]').fill('정정한 결정');await page.locator('button[form="item-form"]').click();await page.locator('.review-footer [data-action="confirm"]').click();await expect(page.locator('.minutes-scroll h2')).toHaveText('함께 확인한 결론');
 await page.locator('.validation-notice [data-action="open"]').filter({hasText:'원본'}).click();await expect(page.locator('.minute-item').first()).toContainText('첫 결정');await expect(page.locator('.validation-notice').first()).toContainText('최신 결론');
});

test('손상된 원본을 보존하고 복구 화면을 제공한다',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('itda.capsules.v2','{damaged original'));
 await page.goto('/');await expect(page.locator('#storage-status')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('itda.capsules.v2'))).toBe('{damaged original');
 await page.locator('[data-action="storage-recovery"]').first().click();await expect(page.locator('#recovery-form')).toBeVisible();
});

test('불참과 하위 보류를 사유와 함께 공동 확인에 반영한다',async({page})=>{
 await page.goto('/');await page.locator('[data-action="create"]').first().click();await page.locator('#create-form input[name="title"]').fill('예외 처리');await page.locator('input[name="create-member"][value="jieun"]').check();await page.locator('#create-submit').click();await expect(page.locator('.room-heading h1')).toHaveText('예외 처리');
 await send(page,'결정: 이번 안건 확정');await page.locator('.composer-delegate').click();await page.locator('#delegate-form input[name="title"]').fill('나중에 검토');await page.locator('input[name="delegate-message"]').first().check();await page.locator('input[name="delegate-member"][value="minsu"]').check();await page.locator('button[form="delegate-form"]').click();await expect(page.locator('.child-card')).toContainText('나중에 검토');
 await page.locator('[data-action="room-info"]').click();await page.locator('[data-action="policy"]').click();await page.locator('input[name="target"][value="jieun"]').uncheck();await page.locator('#policy-form input[name="reason"]').fill('이번 회의 불참');await page.locator('button[form="policy-form"]').click();
 await page.locator('[data-action="room-info"]').click();await page.locator('[data-action="disposition"]').click();await page.locator('#disposition-form input[name="reason"]').fill('별도 후속 캡슐에서 논의');await page.locator('button[form="disposition-form"]').click();await draft(page);await expect(page.locator('.policy-history')).toContainText('이번 회의 불참');await expect(page.locator('.policy-history')).toContainText('별도 후속 캡슐에서 논의');await page.locator('.review-footer [data-action="confirm"]').click();await expect(page.locator('.confirmation-banner')).toContainText('1/1');await expect(page.locator('.minutes-scroll h2')).toHaveText('함께 확인한 결론');
});
