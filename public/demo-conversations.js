// 가상 시연 데이터. 기존 사용자가 만든 캡슐·대화는 덮어쓰지 않는다.
export function addMessengerExamples(state) {
 if(state.messengerDemoVersion===1)return false;
 const examples=[
 ['publicity','홍보 콘텐츠 회의','SNS 홍보 카드와 포스터 제작을 함께 준비해요.',['minsu','harin','seojun'],[['harin','포스터 시안 2가지 올려뒀어요. 오늘 같이 확인해볼까요?'],['seojun','색감 너무 좋아요! 두 번째 시안으로 이야기해봐요.']],'2026-10-29T17:43:00+09:00'],
 ['operations','11월 운영진 모임','새로운 한 달을 준비하는 우리들의 이야기',['minsu','jieun','doyun','harin'],[['doyun','11월 행사 일정과 예산을 먼저 모아보면 좋겠어요.'],['jieun','좋아요! 각 팀별로 필요한 내용을 정리해서 올릴게요.']],'2026-10-29T16:26:00+09:00'],
 ['booth-design','부스 디자인 팀','작은 아이디어로 만드는 특별한 공간',['minsu','seojun','harin'],[['seojun','부스 배치도 초안 공유해요. 동선은 이렇게 잡으면 어떨까요?'],['harin','입구 쪽에 안내판 하나 있으면 더 좋을 것 같아요 🙌']],'2026-10-29T15:12:00+09:00'],
 ['welcome','신입 부원 환영회','처음 만나는 우리, 반갑게 인사해요',['minsu','jieun','seojun','harin','doyun'],[['jieun','다음 주에 새 부원들과 인사하는 시간 가져요!'],['minsu','좋아요. 서로 소개할 수 있는 짧은 프로그램도 준비해볼게요.']],'2026-10-29T14:05:00+09:00'],
 ['notice','솔크크 공지','우리 모임의 중요한 이야기를 모아요.',['minsu','jieun','seojun','harin','doyun'],[['doyun','이번 주 동아리방 사용 일정 확인해주세요.'],['harin','확인했습니다! 행사 준비하는 분들 모두 힘내요 😊']],'2026-10-29T11:34:00+09:00']
 ];
 for(const [id,title,description,memberIds,lines,at] of examples){if(state.meetings.some(m=>m.id===id))continue;state.meetings.push({id,title,description,parentId:null,memberIds,status:'open',messages:lines.map(([authorId,text],i)=>({id:`${id}-message-${i}`,authorId,text,createdAt:new Date(Date.parse(at)+i*60000).toISOString()})),sourceMessages:[],draft:null,confirmations:[],revision:0,carryover:[],conclusions:[],createdAt:new Date(at).toISOString()});}
 state.messengerDemoVersion=1;state.reads??={};return true;
}
