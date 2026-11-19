import type { Database } from './types.js';
import { notFound } from './errors.js';

const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : value == null ? null : new Date(String(value)).toISOString();

export async function canReadCapsule(db: Database, id: string, userId: string): Promise<boolean> {
  const r = await db.query(`select 1 from capsule_members where capsule_id=$1 and user_id=$2 and departed_at is null`, [
    id,
    userId,
  ]);
  return r.rowCount > 0;
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
  const result = await db.query<any>('select * from capsules where id=$1', [id]);
  const c = result.rows[0];
  if (!c) throw notFound();
  const [members, messages, sources, confirmations] = await Promise.all([
    db.query<any>(
      'select user_id, is_confirmation_target, departed_at from capsule_members where capsule_id=$1 order by user_id',
      [id],
    ),
    includeMessages
      ? db.query<any>(
          `select * from (select id, author_id, text, created_at from messages where capsule_id=$1 and not is_source order by created_at desc, id desc limit $2) x order by created_at, id`,
          [id, messageLimit],
        )
      : Promise.resolve({ rows: [] }),
    includeMessages
      ? db.query<any>(
          'select id, author_id, text, created_at from messages where capsule_id=$1 and is_source order by created_at, id',
          [id],
        )
      : Promise.resolve({ rows: [] }),
    db.query<any>(
      'select user_id, revision, member_set_version, conclusion_version, at from confirmations where capsule_id=$1 order by at',
      [id],
    ),
  ]);
  const mapMessage = (m: any) => ({ id: m.id, authorId: m.author_id, text: m.text, createdAt: iso(m.created_at) });
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    status: c.status,
    revision: c.revision,
    memberSetVersion: c.member_set_version,
    conclusionVersion: c.conclusion_version,
    facilitatorId: c.facilitator_id,
    parentId: c.parent_id,
    previousId: c.previous_id,
    correctionOf: c.correction_of,
    deferredFrom: c.deferred_from,
    startsAt: iso(c.starts_at),
    confirmedAt: iso(c.confirmed_at),
    createdAt: iso(c.created_at),
    memberIds: members.rows.map((m) => m.user_id),
    confirmationMemberIds: members.rows.filter((m) => m.is_confirmation_target && !m.departed_at).map((m) => m.user_id),
    departedMemberIds: members.rows.filter((m) => m.departed_at).map((m) => m.user_id),
    messages: messages.rows.map(mapMessage),
    sourceMessages: sources.rows.map(mapMessage),
    confirmations: confirmations.rows.map((x) => x.user_id),
    confirmationRecords: confirmations.rows.map((x) => ({
      memberId: x.user_id,
      revision: x.revision,
      memberSetVersion: x.member_set_version,
      conclusionVersion: x.conclusion_version,
      at: iso(x.at),
    })),
    draft: c.draft,
    draftMessageIds: c.draft_message_ids,
    draftHistory: c.draft_history,
    carryover: c.carryover,
    conclusions: c.conclusions,
    agendaStatuses: c.agenda_statuses,
    policyHistory: c.policy_history,
    delegationDisposition: c.delegation_disposition,
  };
}

export async function domainState(
  db: Database,
  capsuleId: string,
  profileId: string,
  messageCapsuleIds: string[] = [capsuleId],
): Promise<any> {
  const row = await db.query<any>('select org_id from capsules where id=$1', [capsuleId]);
  if (!row.rows[0]) throw notFound();
  const orgId = row.rows[0].org_id;
  const [org, memberRows, capsuleRows] = await Promise.all([
    db.query<any>('select name from organizations where id=$1', [orgId]),
    db.query<any>(
      `select u.id, u.name, om.teams, om.grade, om.role from org_members om join users u on u.id=om.user_id where om.org_id=$1 and om.left_at is null`,
      [orgId],
    ),
    db.query<any>(
      `with recursive related(id) as (
      select id from capsules where id=$1
      union
      select c.id from capsules c join related r on
        c.parent_id=r.id or c.id=(select parent_id from capsules where id=r.id) or
        c.previous_id=r.id or c.id=(select previous_id from capsules where id=r.id) or
        c.correction_of=r.id or c.id=(select correction_of from capsules where id=r.id) or
        c.deferred_from=r.id or c.id=(select deferred_from from capsules where id=r.id)
    ) select id from related`,
      [capsuleId],
    ),
  ]);
  const meetings = [];
  for (const c of capsuleRows.rows)
    meetings.push(await capsuleRepresentation(db, c.id, 1000000, messageCapsuleIds.includes(c.id)));
  return {
    version: 3,
    profileId,
    organization: org.rows[0].name,
    members: memberRows.rows,
    meetings,
    calendar: [],
    notifications: [],
  };
}
