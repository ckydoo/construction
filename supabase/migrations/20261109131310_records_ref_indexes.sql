-- Composite indexes for reverse-link lookups. These keep "Linked records"
-- and project 360 pages fast when a register grows into thousands of rows.
-- Additive only; no data or policy changes.

create index if not exists records_ref_client_id_idx
  on public.records(organization_id, resource, ((data->>'clientId'))) where deleted_at is null;
create index if not exists records_ref_project_id_idx
  on public.records(organization_id, resource, ((data->>'projectId'))) where deleted_at is null;
create index if not exists records_ref_vendor_id_idx
  on public.records(organization_id, resource, ((data->>'vendorId'))) where deleted_at is null;
create index if not exists records_ref_equipment_id_idx
  on public.records(organization_id, resource, ((data->>'equipmentId'))) where deleted_at is null;
create index if not exists records_ref_employee_id_idx
  on public.records(organization_id, resource, ((data->>'employeeId'))) where deleted_at is null;
create index if not exists records_ref_counterparty_idx
  on public.records(organization_id, resource, ((data->>'counterparty'))) where deleted_at is null;
create index if not exists records_ref_submitted_by_idx
  on public.records(organization_id, resource, ((data->>'submittedBy'))) where deleted_at is null;
create index if not exists records_ref_subcontractor_id_idx
  on public.records(organization_id, resource, ((data->>'subcontractorId'))) where deleted_at is null;
create index if not exists records_ref_purchase_order_id_idx
  on public.records(organization_id, resource, ((data->>'purchaseOrderId'))) where deleted_at is null;
create index if not exists records_ref_parent_id_idx
  on public.records(organization_id, resource, ((data->>'parentId'))) where deleted_at is null;
create index if not exists records_ref_requisition_id_idx
  on public.records(organization_id, resource, ((data->>'requisitionId'))) where deleted_at is null;
create index if not exists records_ref_warehouse_id_idx
  on public.records(organization_id, resource, ((data->>'warehouseId'))) where deleted_at is null;
create index if not exists records_ref_account_id_idx
  on public.records(organization_id, resource, ((data->>'accountId'))) where deleted_at is null;
create index if not exists records_ref_manager_idx
  on public.records(organization_id, resource, ((data->>'manager'))) where deleted_at is null;
