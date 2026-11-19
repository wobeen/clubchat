alter table capsules add column version int not null default 0;
alter table capsules add column scheduled_from text;
alter table capsules add column confirmed_snapshot jsonb;
alter table capsules add column correction_reason text;
alter table capsules add column correction_impacts jsonb not null default '[]';
create unique index on capsules (scheduled_from) where scheduled_from is not null;

alter table calendar_events add column corrects_event_id text;
