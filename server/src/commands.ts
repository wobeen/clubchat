import { createHash, randomUUID } from 'node:crypto';
// @ts-expect-error shared domain module is intentionally plain JavaScript
import * as domain from '../../public/domain.js';
import {
  canReadCapsule,
  canReadCapsuleMetadata,
  capsuleRepresentation,
  domainState,
  relatedCapsuleIds,
} from './capsules.js';
import { ApiError, notFound } from './errors.js';
import { isUuid, withIdempotency } from './idempotency.js';
import type { Database } from './types.js';

type Executor = (state: any, capsule: any, payload: any) => unknown;
class RetryRelations extends Error {}
const json = (value: unknown): string | null => (value == null ? null : JSON.stringify(value));
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuidArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isUuid);
const invalid = (message = '요청 형식이 올바르지 않아요.'): never => {
  throw new ApiError(400, 'invalid_request', message);
};

function validatePayload(command: string, value: unknown): Record<string, any> {
  if (!object(value)) invalid();
  const payload = structuredClone(value) as Record<string, any>;
  if (command === 'send-message' && typeof payload.text !== 'string') invalid('text가 필요해요.');
  if (command === 'delegate') {
    if (typeof payload.title !== 'string' || !uuidArray(payload.messageIds) || !uuidArray(payload.memberIds)) invalid();
  }
  if (command === 'update-draft-item') {
    if (!['decisions', 'tasks', 'unresolved', 'events'].includes(payload.type) || !object(payload.item)) invalid();
    if (!isUuid(payload.item.id)) invalid('초안 항목 id는 UUID여야 해요.');
    if (payload.item.evidenceIds !== undefined && !uuidArray(payload.item.evidenceIds)) invalid();
    if (payload.type === 'events') {
      if (typeof payload.item.at !== 'string' || Number.isNaN(Date.parse(payload.item.at)))
        invalid('일정 날짜가 올바르지 않아요.');
      payload.item.at = new Date(payload.item.at).toISOString();
      if (!uuidArray(payload.item.participantIds)) invalid();
    }
  }
  if (command === 'remove-draft-item') {
    if (!['decisions', 'tasks', 'unresolved', 'events'].includes(payload.type) || !isUuid(payload.id)) invalid();
  }
  if (command === 'restore-draft' && !Number.isInteger(payload.revision)) invalid();
  if (command === 'set-confirmation-members') {
    if (!uuidArray(payload.memberIds) || typeof payload.reason !== 'string') invalid();
  }
  if (['mark-member-departed', 'transfer-facilitator'].includes(command)) {
    if (!isUuid(payload.memberId) || typeof payload.reason !== 'string') invalid();
  }
  if (command === 'set-agenda-status') {
    if (!isUuid(payload.agendaId) || !['open', 'resolved', 'deferred'].includes(payload.status)) invalid();
    if (typeof payload.reason !== 'string') invalid();
    if (payload.targetEventIds !== undefined && !uuidArray(payload.targetEventIds)) invalid();
  }
  if (command === 'dispose-child') {
    if (!isUuid(payload.childId) || !['deferred', 'cancelled'].includes(payload.status)) invalid();
    if (typeof payload.reason !== 'string' || (payload.followUpId !== undefined && !isUuid(payload.followUpId)))
      invalid();
  }
  if (command === 'create-correction' && typeof payload.reason !== 'string') invalid();
  return payload;
}
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
  previous?: any,
): Promise<void> {
  if (!previous) {
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
        json(meeting.draft),
        meeting.draftMessageIds || null,
        json(meeting.draftHistory || []),
        json(meeting.carryover || []),
        json(meeting.conclusions || []),
        json(meeting.agendaStatuses || {}),
        json(meeting.policyHistory || []),
        json(meeting.delegationDisposition),
        meeting.scheduledFrom || null,
        json(meeting.confirmedSnapshot),
        meeting.correctionReason || null,
        json(meeting.correctionImpacts || []),
        actorId,
        meeting.createdAt,
      ],
    );
    if (meeting.status === 'scheduled' && meeting.startsAt)
      await tx.query(
        `insert into jobs (kind,payload,run_at) values ('activate-scheduled',$1,$2)
         on conflict (kind,payload) do nothing`,
        [json({ capsuleId: meeting.id }), meeting.startsAt],
      );
  } else {
    const updated = await tx.query(
      `update capsules set
        title=$2,description=$3,status=$4,revision=$5,version=$6,member_set_version=$7,
        conclusion_version=$8,facilitator_id=$9,parent_id=$10,previous_id=$11,correction_of=$12,
        deferred_from=$13,starts_at=$14,confirmed_at=$15,draft=$16,draft_message_ids=$17,
        draft_history=$18,carryover=$19,conclusions=$20,agenda_statuses=$21,policy_history=$22,
        delegation_disposition=$23,scheduled_from=$24,confirmed_snapshot=$25,correction_reason=$26,
        correction_impacts=$27 where id=$1 and version=$28`,
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
        json(meeting.draft),
        meeting.draftMessageIds || null,
        json(meeting.draftHistory || []),
        json(meeting.carryover || []),
        json(meeting.conclusions || []),
        json(meeting.agendaStatuses || {}),
        json(meeting.policyHistory || []),
        json(meeting.delegationDisposition),
        meeting.scheduledFrom || null,
        json(meeting.confirmedSnapshot),
        meeting.correctionReason || null,
        json(meeting.correctionImpacts || []),
        previous.version,
      ],
    );
    if (!updated.rowCount)
      throw new ApiError(409, 'version_conflict', '다른 변경이 있어요. 최신 버전을 확인해주세요.', {
        version: previous.version,
      });
  }

  const previousMembers = new Map<string, { target: boolean; departed: boolean }>();
  if (previous)
    for (const userId of previous.memberIds)
      previousMembers.set(userId, {
        target: (previous.confirmationMemberIds || previous.memberIds).includes(userId),
        departed: (previous.departedMemberIds || []).includes(userId),
      });
  for (const userId of meeting.memberIds) {
    const departed = (meeting.departedMemberIds || []).includes(userId);
    const target = (meeting.confirmationMemberIds || meeting.memberIds).includes(userId) && !departed;
    const old = previousMembers.get(userId);
    if (old && old.target === target && old.departed === departed) continue;
    await tx.query(
      `insert into capsule_members (capsule_id,user_id,is_confirmation_target,departed_at)
       values ($1,$2,$3,case when $4 then now() else null end)
       on conflict (capsule_id,user_id) do update set
         is_confirmation_target=excluded.is_confirmation_target,
         departed_at=case when $4 then coalesce(capsule_members.departed_at,now()) else null end`,
      [meeting.id, userId, target, departed],
    );
  }

  const confirmationKey = (record: any) =>
    `${record.memberId}:${record.revision}:${record.memberSetVersion}:${record.conclusionVersion}:${record.at}`;
  const oldConfirmations = new Set((previous?.confirmationRecords || []).map(confirmationKey));
  const nextConfirmations = new Set((meeting.confirmationRecords || []).map(confirmationKey));
  const removedUsers = (previous?.confirmationRecords || [])
    .filter((record: any) => !nextConfirmations.has(confirmationKey(record)))
    .map((record: any) => record.memberId);
  if (removedUsers.length)
    await tx.query('delete from confirmations where capsule_id=$1 and user_id=any($2::uuid[])', [
      meeting.id,
      [...new Set(removedUsers)],
    ]);
  for (const record of meeting.confirmationRecords || []) {
    if (oldConfirmations.has(confirmationKey(record))) continue;
    await tx.query(
      `insert into confirmations (capsule_id,user_id,revision,member_set_version,conclusion_version,at)
       values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
      [meeting.id, record.memberId, record.revision, record.memberSetVersion, record.conclusionVersion, record.at],
    );
  }

  const previousMessageIds = new Set(
    [...(previous?.messages || []), ...(previous?.sourceMessages || [])].map((message) => message.id),
  );
  for (const [isSource, messages] of [
    [false, meeting.messages || []],
    [true, meeting.sourceMessages || []],
  ] as const)
    for (const message of messages) {
      if (previousMessageIds.has(message.id)) continue;
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
}

function stableUuid(...parts: string[]): string {
  const bytes = createHash('sha256').update(parts.join(':')).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function persistCalendar(tx: Database, state: any, changedCapsuleIds: Set<string>): Promise<void> {
  for (const event of state.calendar.filter((item: any) => changedCapsuleIds.has(item.meetingId))) {
    const sourceId = event.sourceId || event.id;
    if (!isUuid(sourceId)) invalid('일정 source id는 UUID여야 해요.');
    if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) invalid('일정 날짜가 올바르지 않아요.');
    await tx.query(
      `insert into calendar_events
       (id,org_id,capsule_id,source_id,kind,text,at,location,participant_ids,corrects_event_id)
       select $1,org_id,$2,$3,$4,$5,$6,$7,$8,$9 from capsules where id=$2
       on conflict (capsule_id,source_id) do update set
         kind=excluded.kind,text=excluded.text,at=excluded.at,location=excluded.location,
         participant_ids=excluded.participant_ids,corrects_event_id=excluded.corrects_event_id`,
      [
        stableUuid(event.meetingId, sourceId),
        event.meetingId,
        sourceId,
        event.kind,
        event.text,
        new Date(event.at).toISOString(),
        event.location || null,
        event.participantIds,
        event.correctsEventId || null,
      ],
    );
  }
}

function notificationId(capsuleId: string, sourceId: string, userId: string): string {
  return stableUuid(capsuleId, sourceId, userId);
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
  const payload = validatePayload(input.command, input.payload);
  const commandRequest = {
    capsuleId: input.capsuleId,
    command: input.command,
    expectedVersion: input.expectedVersion,
    payload,
  };
  let body: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      body = await withIdempotency(db, input.userId, input.key, commandRequest, async (tx) => {
        if (!(await canReadCapsule(tx, input.capsuleId, input.userId))) {
          if (await canReadCapsuleMetadata(tx, input.capsuleId, input.userId))
            throw new ApiError(403, 'forbidden', '하위 캡슐 참여자만 명령을 실행할 수 있어요.');
          throw notFound();
        }
        const extraIds = [payload.childId, payload.followUpId].filter(isUuid);
        const relationIds = await relatedCapsuleIds(tx, input.capsuleId, extraIds);
        const locked = await tx.query<any>(
          'select id,version,org_id from capsules where id=any($1::uuid[]) order by id for update',
          [relationIds],
        );
        const verifiedRelationIds = await relatedCapsuleIds(tx, input.capsuleId, extraIds);
        if (
          verifiedRelationIds.length !== relationIds.length ||
          verifiedRelationIds.some((id, index) => id !== relationIds[index])
        )
          throw new RetryRelations();
        const lockedTarget = locked.rows.find((row: any) => row.id === input.capsuleId);
        if (!lockedTarget) throw notFound();
        if (input.command !== 'send-message') {
          if (!Number.isInteger(input.expectedVersion))
            throw new ApiError(400, 'invalid_request', 'expectedVersion이 필요해요.');
          if (lockedTarget.version !== input.expectedVersion)
            throw new ApiError(409, 'version_conflict', '다른 변경이 있어요. 최신 버전을 확인해주세요.', {
              version: lockedTarget.version,
            });
        }

        const messageIds = [input.capsuleId, ...(input.command === 'dispose-child' ? extraIds : [])];
        const state = await domainState(tx, input.capsuleId, input.userId, messageIds, relationIds);
        const capsule = state.meetings.find((meeting: any) => meeting.id === input.capsuleId);
        assertCommandPermission(input.command, capsule, input.userId);
        const beforeMeetings = new Map<string, any>(
          state.meetings.map((meeting: any) => [meeting.id, structuredClone(meeting)]),
        );
        const beforeCalendarState = structuredClone(state.calendar);
        const beforeCalendar = JSON.stringify(beforeCalendarState);
        try {
          executor(state, capsule, payload);
        } catch (error) {
          if (!(error instanceof Error) || error.constructor !== Error) throw error;
          throw new ApiError(422, 'domain_rule', error.message);
        }

        const changed = state.meetings.filter((meeting: any) => {
          const before = beforeMeetings.get(meeting.id);
          if (!before) return true;
          return (
            JSON.stringify({ ...before, version: undefined }) !== JSON.stringify({ ...meeting, version: undefined })
          );
        });
        const changedIds = new Set<string>(changed.map((meeting: any) => meeting.id));
        for (const meeting of changed) {
          const previous = beforeMeetings.get(meeting.id);
          meeting.version = previous ? previous.version + 1 : 0;
          await persistMeeting(tx, meeting, lockedTarget.org_id, input.userId, previous);
          await tx.query(`insert into outbox (topic,payload) values ('capsule.changed',$1)`, [
            json({ capsuleId: meeting.id, version: meeting.version }),
          ]);
        }

        if (beforeCalendar !== JSON.stringify(state.calendar)) {
          await persistCalendar(tx, state, changedIds);
          await tx.query(`insert into outbox (topic,payload) values ('calendar.changed',$1)`, [
            json({ orgId: lockedTarget.org_id }),
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
                json({ id, userId, capsuleId: input.capsuleId, sourceId: event.sourceId || event.id, text }),
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
      break;
    } catch (error) {
      if (!(error instanceof RetryRelations) || attempt === 2) throw error;
    }
  }
  return { status: 200, body };
}
