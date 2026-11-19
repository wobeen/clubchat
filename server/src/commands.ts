import { createHash, randomUUID } from 'node:crypto';
// @ts-expect-error shared domain module is intentionally plain JavaScript
import * as domain from '../../public/domain.js';
import { assertCanRead, capsuleRepresentation, domainState } from './capsules.js';
import { ApiError, notFound } from './errors.js';
import { isUuid, withIdempotency } from './idempotency.js';
import type { Database } from './types.js';

type Executor = (state: any, capsule: any, payload: any) => unknown;
const executors: Record<string, Executor> = {
  'send-message': (state, capsule, payload) => domain.sendMessage(state, capsule, payload?.text),
  delegate: (state, capsule, payload) => domain.delegate(state, capsule, payload),
  'extract-draft': (state, capsule) => domain.extractDraft(state, capsule),
  'update-draft-item': (state, capsule, payload) =>
    domain.updateDraftItem(state, capsule, payload?.type, payload?.item),
  'remove-draft-item': (state, capsule, payload) => domain.removeDraftItem(state, capsule, payload?.type, payload?.id),
  'restore-draft': (state, capsule, payload) => domain.restoreDraft(state, capsule, payload?.revision),
  'resume-conversation': (state, capsule) => domain.resumeConversation(state, capsule),
  confirm: (state, capsule) => domain.confirmMeeting(state, capsule),
  'set-confirmation-members': (state, capsule, payload) =>
    domain.setConfirmationMembers(state, capsule, payload?.memberIds, payload?.reason),
  'mark-member-departed': (state, capsule, payload) =>
    domain.markMemberDeparted(state, capsule, payload?.memberId, payload?.reason),
  'transfer-facilitator': (state, capsule, payload) =>
    domain.transferFacilitator(state, capsule, payload?.memberId, payload?.reason),
  'set-agenda-status': (state, capsule, payload) => domain.setAgendaStatus(state, capsule, payload?.agendaId, payload),
  'dispose-child': (state, capsule, payload) => domain.disposeChild(state, capsule, payload?.childId, payload),
  'create-correction': (state, capsule, payload) => domain.createCorrection(state, capsule, payload?.reason),
  'start-scheduled': (state, capsule) => domain.startScheduled(state, capsule),
};

const allowedStates: Record<string, string[]> = {
  'send-message': ['open', 'review'],
  delegate: ['open', 'review'],
  'extract-draft': ['open', 'review'],
  'update-draft-item': ['review'],
  'remove-draft-item': ['review'],
  'restore-draft': ['review'],
  'resume-conversation': ['review'],
  confirm: ['review'],
  'set-confirmation-members': ['open', 'review'],
  'mark-member-departed': ['open', 'review'],
  'transfer-facilitator': ['open', 'review'],
  'set-agenda-status': ['review'],
  'dispose-child': ['open', 'review'],
  'create-correction': ['confirmed'],
  'start-scheduled': ['scheduled'],
};
const facilitatorCommands = new Set([
  'set-confirmation-members',
  'mark-member-departed',
  'transfer-facilitator',
  'dispose-child',
]);

function assertCommandPermission(command: string, capsule: any, userId: string): void {
  if (!allowedStates[command]?.includes(capsule.status))
    throw new ApiError(422, 'domain_rule', '이 상태에서는 명령을 실행할 수 없어요.');
  if (facilitatorCommands.has(command) && userId !== (capsule.facilitatorId || capsule.memberIds[0]))
    throw new ApiError(403, 'forbidden', '캡슐 진행자만 실행할 수 있어요.');
  if (command === 'confirm' && !capsule.confirmationMemberIds.includes(userId))
    throw new ApiError(403, 'forbidden', '현재 확인 대상자만 확인할 수 있어요.');
}

function rewriteReferences(value: any, ids: Map<string, string>): any {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteReferences(item, ids));
  if (value && typeof value === 'object')
    for (const key of Object.keys(value)) value[key] = rewriteReferences(value[key], ids);
  return value;
}

function prepareNewMeeting(meeting: any): void {
  const all = [...(meeting.messages || []), ...(meeting.sourceMessages || [])];
  const ids = new Map<string, string>();
  for (const message of all) ids.set(message.id, randomUUID());
  rewriteReferences(meeting.draft, ids);
  rewriteReferences(meeting.draftHistory, ids);
  meeting.draftMessageIds = meeting.draftMessageIds?.map((id: string) => ids.get(id) ?? id);
  for (const message of all) {
    const source = message.sourceMessageId || message.id;
    message.id = ids.get(message.id);
    message.sourceMessageId = source;
  }
}

async function persistMeeting(
  tx: Database,
  meeting: any,
  orgId: string,
  actorId: string,
  isNew: boolean,
): Promise<void> {
  if (isNew) {
    prepareNewMeeting(meeting);
    await tx.query(
      `insert into capsules (
        id,org_id,title,description,status,revision,version,member_set_version,conclusion_version,
        facilitator_id,parent_id,previous_id,correction_of,deferred_from,starts_at,confirmed_at,
        draft,draft_message_ids,draft_history,carryover,conclusions,agenda_statuses,policy_history,
        delegation_disposition,scheduled_from,confirmed_snapshot,correction_reason,correction_impacts,
        created_by,created_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30
      )`,
      [
        meeting.id,
        orgId,
        meeting.title,
        meeting.description || '',
        meeting.status,
        meeting.revision || 0,
        meeting.version || 0,
        meeting.memberSetVersion || 0,
        meeting.conclusionVersion || 0,
        meeting.facilitatorId || null,
        meeting.parentId || null,
        meeting.previousId || null,
        meeting.correctionOf || null,
        meeting.deferredFrom || null,
        meeting.startsAt || null,
        meeting.confirmedAt || null,
        meeting.draft || null,
        meeting.draftMessageIds || null,
        meeting.draftHistory || [],
        meeting.carryover || [],
        meeting.conclusions || [],
        meeting.agendaStatuses || {},
        meeting.policyHistory || [],
        meeting.delegationDisposition || null,
        meeting.scheduledFrom || null,
        meeting.confirmedSnapshot || null,
        meeting.correctionReason || null,
        meeting.correctionImpacts || [],
        actorId,
        meeting.createdAt,
      ],
    );
  } else {
    await tx.query(
      `update capsules set
        title=$2,description=$3,status=$4,revision=$5,version=$6,member_set_version=$7,
        conclusion_version=$8,facilitator_id=$9,parent_id=$10,previous_id=$11,correction_of=$12,
        deferred_from=$13,starts_at=$14,confirmed_at=$15,draft=$16,draft_message_ids=$17,
        draft_history=$18,carryover=$19,conclusions=$20,agenda_statuses=$21,policy_history=$22,
        delegation_disposition=$23,scheduled_from=$24,confirmed_snapshot=$25,correction_reason=$26,
        correction_impacts=$27 where id=$1`,
      [
        meeting.id,
        meeting.title,
        meeting.description || '',
        meeting.status,
        meeting.revision || 0,
        meeting.version || 0,
        meeting.memberSetVersion || 0,
        meeting.conclusionVersion || 0,
        meeting.facilitatorId || null,
        meeting.parentId || null,
        meeting.previousId || null,
        meeting.correctionOf || null,
        meeting.deferredFrom || null,
        meeting.startsAt || null,
        meeting.confirmedAt || null,
        meeting.draft || null,
        meeting.draftMessageIds || null,
        meeting.draftHistory || [],
        meeting.carryover || [],
        meeting.conclusions || [],
        meeting.agendaStatuses || {},
        meeting.policyHistory || [],
        meeting.delegationDisposition || null,
        meeting.scheduledFrom || null,
        meeting.confirmedSnapshot || null,
        meeting.correctionReason || null,
        meeting.correctionImpacts || [],
      ],
    );
  }

  for (const userId of meeting.memberIds) {
    const departed = (meeting.departedMemberIds || []).includes(userId);
    const target = (meeting.confirmationMemberIds || meeting.memberIds).includes(userId) && !departed;
    await tx.query(
      `insert into capsule_members (capsule_id,user_id,is_confirmation_target,departed_at)
       values ($1,$2,$3,case when $4 then now() else null end)
       on conflict (capsule_id,user_id) do update set
         is_confirmation_target=excluded.is_confirmation_target,
         departed_at=case when $4 then coalesce(capsule_members.departed_at,now()) else null end`,
      [meeting.id, userId, target, departed],
    );
  }

  await tx.query('delete from confirmations where capsule_id=$1', [meeting.id]);
  for (const record of meeting.confirmationRecords || [])
    await tx.query(
      `insert into confirmations (capsule_id,user_id,revision,member_set_version,conclusion_version,at)
       values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
      [meeting.id, record.memberId, record.revision, record.memberSetVersion, record.conclusionVersion, record.at],
    );

  for (const [isSource, messages] of [
    [false, meeting.messages || []],
    [true, meeting.sourceMessages || []],
  ] as const)
    for (const message of messages)
      await tx.query(
        `insert into messages (id,capsule_id,author_id,text,is_source,source_message_id,created_at)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
        [
          message.id,
          meeting.id,
          message.authorId,
          message.text,
          isSource,
          message.sourceMessageId || null,
          message.createdAt,
        ],
      );
}

async function persistCalendar(tx: Database, state: any, relatedIds: string[]): Promise<void> {
  if (!relatedIds.length) return;
  await tx.query('delete from calendar_events where capsule_id=any($1::uuid[])', [relatedIds]);
  for (const event of state.calendar)
    await tx.query(
      `insert into calendar_events
       (id,org_id,capsule_id,source_id,kind,text,at,location,participant_ids,corrects_event_id)
       select $1,org_id,$2,$3,$4,$5,$6,$7,$8,$9 from capsules where id=$2`,
      [
        event.id,
        event.meetingId,
        event.sourceId || event.id,
        event.kind,
        event.text,
        event.at,
        event.location || null,
        event.participantIds,
        event.correctsEventId || null,
      ],
    );
}

function notificationId(capsuleId: string, sourceId: string, userId: string): string {
  const bytes = createHash('sha256').update(`${capsuleId}:${sourceId}:${userId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function executeCommand(
  db: Database,
  input: {
    userId: string;
    capsuleId: string;
    command: string;
    key: string;
    expectedVersion?: number;
    payload: any;
  },
): Promise<{ status: number; body: any }> {
  const executor = executors[input.command];
  if (!executor) throw notFound();
  const commandRequest = {
    capsuleId: input.capsuleId,
    command: input.command,
    expectedVersion: input.expectedVersion,
    payload: input.payload,
  };
  const body = await withIdempotency(db, input.userId, input.key, commandRequest, async (tx) => {
    await assertCanRead(tx, input.capsuleId, input.userId);
    const locked = await tx.query<any>('select version,org_id from capsules where id=$1 for update', [input.capsuleId]);
    if (!locked.rows[0]) throw notFound();
    if (input.command !== 'send-message') {
      if (!Number.isInteger(input.expectedVersion))
        throw new ApiError(400, 'invalid_request', 'expectedVersion이 필요해요.');
      if (locked.rows[0].version !== input.expectedVersion)
        throw new ApiError(409, 'version_conflict', '다른 변경이 있어요. 최신 버전을 확인해주세요.', {
          version: locked.rows[0].version,
        });
    }

    const extraIds = [input.payload?.childId, input.payload?.followUpId].filter(isUuid);
    const messageIds = [input.capsuleId, ...(input.command === 'dispose-child' ? extraIds : [])];
    const state = await domainState(tx, input.capsuleId, input.userId, messageIds, extraIds);
    const capsule = state.meetings.find((meeting: any) => meeting.id === input.capsuleId);
    assertCommandPermission(input.command, capsule, input.userId);
    const beforeMeetings = new Map<string, any>(
      state.meetings.map((meeting: any) => [meeting.id, structuredClone(meeting)]),
    );
    const beforeCalendarState = structuredClone(state.calendar);
    const beforeCalendar = JSON.stringify(beforeCalendarState);
    try {
      executor(state, capsule, input.payload || {});
    } catch (error) {
      throw new ApiError(422, 'domain_rule', error instanceof Error ? error.message : String(error));
    }

    const changed = state.meetings.filter((meeting: any) => {
      const before = beforeMeetings.get(meeting.id);
      if (!before) return true;
      return JSON.stringify({ ...before, version: undefined }) !== JSON.stringify({ ...meeting, version: undefined });
    });
    const changedIds = new Set(changed.map((meeting: any) => meeting.id));
    for (const meeting of changed) {
      const previous = beforeMeetings.get(meeting.id);
      meeting.version = previous ? previous.version + 1 : 0;
      await persistMeeting(tx, meeting, locked.rows[0].org_id, input.userId, !previous);
      await tx.query(`insert into outbox (topic,payload) values ('capsule.changed',$1)`, [
        { capsuleId: meeting.id, version: meeting.version },
      ]);
    }

    if (beforeCalendar !== JSON.stringify(state.calendar)) {
      await persistCalendar(
        tx,
        state,
        state.meetings.map((meeting: any) => meeting.id),
      );
      await tx.query(`insert into outbox (topic,payload) values ('calendar.changed',$1)`, [
        { orgId: locked.rows[0].org_id },
      ]);
    }

    const priorEvents = new Set(beforeCalendarState.map((event: any) => `${event.meetingId}:${event.sourceId}`));
    const activeMembers = new Set(
      capsule.memberIds.filter((id: string) => !(capsule.departedMemberIds || []).includes(id)),
    );
    for (const event of state.calendar.filter(
      (item: any) => !priorEvents.has(`${item.meetingId}:${item.sourceId || item.id}`),
    )) {
      const text = `${event.text} 일정이 등록됐어요.`;
      for (const userId of event.participantIds.filter((id: string) => activeMembers.has(id))) {
        const id = notificationId(input.capsuleId, event.sourceId || event.id, userId);
        const inserted = await tx.query<{ id: string }>(
          `insert into notifications (id,user_id,capsule_id,text,created_at) values ($1,$2,$3,$4,now())
           on conflict (id) do nothing returning id`,
          [id, userId, input.capsuleId, text],
        );
        if (inserted.rowCount)
          await tx.query(`insert into outbox (topic,payload) values ('notification',$1)`, [
            { id, userId, capsuleId: input.capsuleId, sourceId: event.sourceId || event.id, text },
          ]);
      }
    }

    return {
      capsule: await capsuleRepresentation(tx, input.capsuleId),
      affected: state.meetings
        .filter((meeting: any) => meeting.id !== input.capsuleId && changedIds.has(meeting.id))
        .map((meeting: any) => ({ id: meeting.id, version: meeting.version })),
    };
  });
  return { status: 200, body };
}
