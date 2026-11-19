import type { Database } from './types.js';
import { notFound } from './errors.js';

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value == null ? null : new Date(String(value)).toISOString();

const mapMessage = (message: any) => ({
  id: message.id,
  authorId: message.author_id,
  text: message.text,
  createdAt: iso(message.created_at),
  ...(message.source_message_id ? { sourceMessageId: message.source_message_id } : {}),
});

function represent(capsule: any, memberRows: any[], confirmationRows: any[], messageRows: any[]): any {
  const members = memberRows.filter((row) => row.capsule_id === capsule.id);
  const confirmations = confirmationRows.filter((row) => row.capsule_id === capsule.id);
  const messages = messageRows.filter((row) => row.capsule_id === capsule.id);
  return {
    id: capsule.id,
    title: capsule.title,
    description: capsule.description,
    status: capsule.status,
    revision: capsule.revision,
    version: capsule.version,
    memberSetVersion: capsule.member_set_version,
    conclusionVersion: capsule.conclusion_version,
    facilitatorId: capsule.facilitator_id,
    parentId: capsule.parent_id,
    previousId: capsule.previous_id,
    correctionOf: capsule.correction_of,
    deferredFrom: capsule.deferred_from,
    startsAt: iso(capsule.starts_at),
    confirmedAt: iso(capsule.confirmed_at),
    createdAt: iso(capsule.created_at),
    memberIds: members.map((row) => row.user_id),
    confirmationMemberIds: members
      .filter((row) => row.is_confirmation_target && !row.departed_at)
      .map((row) => row.user_id),
    departedMemberIds: members.filter((row) => row.departed_at).map((row) => row.user_id),
    messages: messages.filter((row) => !row.is_source).map(mapMessage),
    sourceMessages: messages.filter((row) => row.is_source).map(mapMessage),
    confirmations: confirmations.map((row) => row.user_id),
    confirmationRecords: confirmations.map((row) => ({
      memberId: row.user_id,
      revision: row.revision,
      memberSetVersion: row.member_set_version,
      conclusionVersion: row.conclusion_version,
      at: iso(row.at),
    })),
    draft: capsule.draft,
    draftMessageIds: capsule.draft_message_ids,
    draftHistory: capsule.draft_history,
    carryover: capsule.carryover,
    conclusions: capsule.conclusions,
    agendaStatuses: capsule.agenda_statuses,
    policyHistory: capsule.policy_history,
    delegationDisposition: capsule.delegation_disposition,
    scheduledFrom: capsule.scheduled_from,
    confirmedSnapshot: capsule.confirmed_snapshot,
    correctionReason: capsule.correction_reason,
    correctionImpacts: capsule.correction_impacts,
  };
}

export async function canReadCapsule(db: Database, id: string, userId: string): Promise<boolean> {
  const result = await db.query(
    'select 1 from capsule_members where capsule_id=$1 and user_id=$2 and departed_at is null',
    [id, userId],
  );
  return result.rowCount > 0;
}

export async function canReadCapsuleMetadata(db: Database, id: string, userId: string): Promise<boolean> {
  const result = await db.query(
    `select 1 from capsules child
     left join capsule_members direct on direct.capsule_id=child.id and direct.user_id=$2 and direct.departed_at is null
     left join capsule_members parent on parent.capsule_id=child.parent_id and parent.user_id=$2 and parent.departed_at is null
     where child.id=$1 and (direct.user_id is not null or parent.user_id is not null)`,
    [id, userId],
  );
  return result.rowCount > 0;
}

export async function assertCanRead(db: Database, id: string, userId: string): Promise<void> {
  if (!(await canReadCapsule(db, id, userId))) throw notFound();
}

export async function capsuleRepresentation(
  db: Database,
  id: string,
  messageLimit = 50,
  includeMessages = true,
): Promise<any> {
  // A node-postgres transaction uses one client; keep its queries sequential.
  const capsules = await db.query<any>('select * from capsules where id=$1', [id]);
  const members = await db.query<any>(
    'select capsule_id,user_id,is_confirmation_target,departed_at from capsule_members where capsule_id=$1 order by user_id',
    [id],
  );
  const confirmations = await db.query<any>(
    'select capsule_id,user_id,revision,member_set_version,conclusion_version,at from confirmations where capsule_id=$1 order by at',
    [id],
  );
  const messages = includeMessages
    ? await db.query<any>(
        `select * from (
          (select id,capsule_id,author_id,text,is_source,source_message_id,created_at
           from messages where capsule_id=$1 and not is_source
           order by created_at desc,id desc limit $2)
          union all
          (select id,capsule_id,author_id,text,is_source,source_message_id,created_at
           from messages where capsule_id=$1 and is_source)
        ) selected order by created_at,id`,
        [id, messageLimit],
      )
    : { rows: [] };
  if (!capsules.rows[0]) throw notFound();
  return represent(capsules.rows[0], members.rows, confirmations.rows, messages.rows);
}

export async function relatedCapsuleIds(
  db: Database,
  capsuleId: string,
  extraCapsuleIds: string[] = [],
): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `with target as (
       select id,org_id,parent_id,previous_id,correction_of from capsules where id=$1
     )
     select distinct related.id from target
     join capsules related on related.org_id=target.org_id and (
       related.id=target.id or related.id=target.parent_id or related.id=target.previous_id or
       related.id=target.correction_of or related.parent_id=target.id or related.previous_id=target.id or
       related.correction_of=target.id or related.id=any($2::uuid[]) or related.parent_id=any($2::uuid[])
     ) order by related.id`,
    [capsuleId, extraCapsuleIds],
  );
  return rows.rows.map((row) => row.id);
}

export async function domainState(
  db: Database,
  capsuleId: string,
  profileId: string,
  messageCapsuleIds: string[] = [capsuleId],
  relatedIds?: string[],
): Promise<any> {
  const ids = relatedIds ?? (await relatedCapsuleIds(db, capsuleId));
  if (!ids.length) throw notFound();
  const target = await db.query<{ org_id: string }>('select org_id from capsules where id=$1', [capsuleId]);
  if (!target.rows[0]) throw notFound();
  const orgId = target.rows[0].org_id;
  const org = await db.query<any>('select name from organizations where id=$1', [orgId]);
  const orgMembers = await db.query<any>(
    `select u.id,u.name,om.teams,om.grade,om.role from org_members om
     join users u on u.id=om.user_id where om.org_id=$1 and om.left_at is null`,
    [orgId],
  );
  const capsules = await db.query<any>('select * from capsules where id=any($1::uuid[]) order by created_at desc', [
    ids,
  ]);
  const members = await db.query<any>(
    `select capsule_id,user_id,is_confirmation_target,departed_at from capsule_members
     where capsule_id=any($1::uuid[]) order by capsule_id,user_id`,
    [ids],
  );
  const confirmations = await db.query<any>(
    `select capsule_id,user_id,revision,member_set_version,conclusion_version,at from confirmations
     where capsule_id=any($1::uuid[]) order by capsule_id,at`,
    [ids],
  );
  const messages = messageCapsuleIds.length
    ? await db.query<any>(
        `select id,capsule_id,author_id,text,is_source,source_message_id,created_at from messages
         where capsule_id=any($1::uuid[]) order by created_at,id`,
        [messageCapsuleIds],
      )
    : { rows: [] };
  const events = await db.query<any>(
    `select id,capsule_id,source_id,kind,text,at,location,participant_ids,corrects_event_id
     from calendar_events where capsule_id=any($1::uuid[]) order by at,id`,
    [ids],
  );
  return {
    version: 3,
    profileId,
    organization: org.rows[0].name,
    members: orgMembers.rows,
    meetings: capsules.rows.map((capsule) => represent(capsule, members.rows, confirmations.rows, messages.rows)),
    calendar: events.rows.map((event) => ({
      id: event.id,
      meetingId: event.capsule_id,
      sourceId: event.source_id,
      kind: event.kind,
      text: event.text,
      at: iso(event.at),
      location: event.location,
      participantIds: event.participant_ids,
      correctsEventId: event.corrects_event_id,
    })),
    notifications: [],
  };
}
