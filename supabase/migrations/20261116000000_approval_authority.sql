-- New approvals only. Historical records are not backfilled.
create or replace function public.guard_timesheet_variation_approval()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare old_status text := ''; s text := upper(coalesce(new.status,'')); actor_id uuid; actor_role text; hours_normal numeric; hours_overtime numeric; d1 date; d2 date;
begin
 if new.resource not in ('timesheets','changeOrders') then return new; end if;
 if upper(coalesce(new.data->>'status',s))<>s then raise exception 'Status must match record data'; end if;
 if tg_op='UPDATE' then old_status:=upper(coalesce(old.status,'')); end if;
 -- Approval metadata is always controlled by the database, never by client input.
 if tg_op='UPDATE' then
   new.data:=jsonb_set(jsonb_set(new.data,'{approvalActorId}',coalesce(old.data->'approvalActorId','null'::jsonb),true),'{approvedAt}',coalesce(old.data->'approvedAt','null'::jsonb),true);
 else
   new.data:=new.data-'approvalActorId'-'approvedAt';
 end if;
 if new.resource='timesheets' then
   begin
     hours_normal:=coalesce(nullif(new.data->>'regularHours',''),'0')::numeric;
     hours_overtime:=coalesce(nullif(new.data->>'overtimeHours',''),'0')::numeric;
     if hours_normal<0 or hours_overtime<0 or hours_normal::text in ('NaN','Infinity','-Infinity') or hours_overtime::text in ('NaN','Infinity','-Infinity') then raise exception 'bad hours'; end if;
   exception when others then raise exception 'Timesheet hours must be valid non-negative numbers'; end;
   if nullif(new.data->>'regularHours','') is null and nullif(new.data->>'overtimeHours','') is null then
     new.data:=jsonb_set(new.data,'{totalHours}','null'::jsonb,true);
   else
     new.data:=jsonb_set(new.data,'{totalHours}',to_jsonb(hours_normal+hours_overtime),true);
   end if;
 end if;
 -- Once newly approved, substantive fields cannot be edited until the record
 -- is returned to draft. This does not impose a new lock on legacy approvals.
 if (new.resource='timesheets' and s='POSTED' and old_status not in ('APPROVED','POSTED')) or (new.resource='changeOrders' and s='INCLUDED_IN_CERT' and old_status not in ('APPROVED','INCLUDED_IN_CERT')) then raise exception 'Record must be approved first'; end if;
 if tg_op='UPDATE' and old_status in ('APPROVED','POSTED','INCLUDED_IN_CERT') and nullif(old.data->>'approvedAt','') is not null then
   if (new.data - array['status','approvalActorId','approvedAt','totalHours']) is distinct from (old.data - array['status','approvalActorId','approvedAt','totalHours']) then
     raise exception 'Return the approved record to draft before changing it';
   end if;
   if s='DRAFT' then
     actor_id:=auth.uid(); actor_role:=public.app_role(new.organization_id);
     if actor_id is null or not public.app_can_write(new.organization_id,new.resource) or not public.app_has_capability(new.organization_id,'records.update') or not public.app_visible_record_id(new.organization_id,new.id)
       or (new.resource='timesheets' and actor_role not in ('OWNER','ADMIN','PROJECT_MANAGER','SITE_ENGINEER','ESTIMATOR'))
       or (new.resource='changeOrders' and actor_role not in ('OWNER','ADMIN','PROJECT_MANAGER','FINANCE_MANAGER','ESTIMATOR')) then raise exception 'Reopening not authorized'; end if;
     new.data:=new.data-'approvalActorId'-'approvedAt';
     perform public.app_log_activity(new.organization_id,null,'REOPEN',new.resource,'Returned approved record '||new.id||' to draft');
   elsif (new.resource='timesheets' and s not in ('APPROVED','POSTED')) or (new.resource='changeOrders' and s not in ('APPROVED','INCLUDED_IN_CERT')) then
     raise exception 'Return the approved record to draft before changing its status';
   end if;
 end if;
 if s='APPROVED' and old_status<>'APPROVED' then
   if tg_op<>'UPDATE' or old_status not in ('SUBMITTED','UNDER_REVIEW') or (new.resource='timesheets' and old_status<>'SUBMITTED') then raise exception 'Submit the record before approval'; end if;
   actor_id:=auth.uid(); actor_role:=public.app_role(new.organization_id);
   if actor_id is null or not public.app_can_write(new.organization_id,new.resource) or not public.app_has_capability(new.organization_id,'records.update') or not public.app_visible_record_id(new.organization_id,new.id) then raise exception 'Approval not authorized'; end if;
   if (new.resource='timesheets' and actor_role not in ('OWNER','ADMIN','PROJECT_MANAGER','SITE_ENGINEER','ESTIMATOR')) or (new.resource='changeOrders' and actor_role not in ('OWNER','ADMIN','PROJECT_MANAGER','FINANCE_MANAGER','ESTIMATOR')) then raise exception 'Approval not authorized'; end if;
   if new.resource='timesheets' then
     if nullif(new.data->>'employeeId','') is null or nullif(new.data->>'projectId','') is null then raise exception 'Employee and project are required before approval'; end if;
     if nullif(new.data->>'regularHours','') is null and nullif(new.data->>'overtimeHours','') is null then raise exception 'Enter hours before approval'; end if;
     begin
       if coalesce(new.data->>'weekStart','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(new.data->>'weekEnd','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
       d1:=(new.data->>'weekStart')::date; d2:=(new.data->>'weekEnd')::date;
       if d2<d1 then raise exception 'date order'; end if;
     exception when others then raise exception 'Enter a valid timesheet period with end on or after start'; end;
   end if;
   new.data:=jsonb_set(jsonb_set(new.data,'{approvalActorId}',to_jsonb(actor_id::text),true),'{approvedAt}',to_jsonb(clock_timestamp()),true);
   if new.resource='changeOrders' then new.data:=jsonb_set(new.data,'{decisionDate}',to_jsonb(current_date::text),true); end if;
   perform public.app_log_activity(new.organization_id,null,'APPROVE',new.resource,'Approved record '||new.id);
 end if;
 return new;
end $$;
revoke all on function public.guard_timesheet_variation_approval() from public,anon,authenticated;
drop trigger if exists guard_timesheet_variation_approval on public.records;
create trigger guard_timesheet_variation_approval before insert or update on public.records for each row execute function public.guard_timesheet_variation_approval();
