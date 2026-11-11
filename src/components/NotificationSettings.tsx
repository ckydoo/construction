'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Lucide from '@/components/lucide';
import { apiGet, apiSend } from '@/lib/client';
import { userMessage } from '@/lib/user-message';
import { Badge, Button, Card, CardHead, Field, Skeleton, Toggle } from '@/components/ui';
import { useToast } from '@/components/Providers';

type Prefs = {
  email_security: boolean;
  email_billing: boolean;
  in_app_approvals: boolean;
  in_app_tasks: boolean;
  in_app_support: boolean;
  in_app_digest: boolean;
  digest_frequency: 'daily' | 'weekly' | 'off';
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
  in_app_enabled: boolean;
  mute_all: boolean;
  unsubscribeUrl: string;
  unsubscribed_at: string | null;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const ZONES = ['Africa/Harare', 'Africa/Johannesburg', 'UTC'];

function Row({ title, description, checked, onChange, essential }: {
  title: string; description: string; checked: boolean; onChange?: (v: boolean) => void; essential?: boolean;
}) {
  return <div className="flex items-center justify-between gap-4 border-b divider py-3.5 last:border-b-0">
    <div className="min-w-0"><p className="text-[13px] font-medium text-ink-800 dark:text-slate-100">{title}</p><p className="mt-0.5 text-[11px] leading-relaxed muted">{description}</p></div>
    {essential ? <Badge tone="green">Always on</Badge> : <Toggle checked={checked} onChange={onChange || (() => {})} label={checked ? 'On' : 'Off'}/>}
  </div>;
}

export default function NotificationSettings({ org }: { org: string }) {
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['notification-preferences', org], queryFn: () => apiGet('/api/account/notifications') });
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data?.preferences) setPrefs(data.preferences as Prefs); }, [data]);

  async function save(patch: Partial<Prefs> & { resubscribe?: boolean }) {
    if (!prefs || busy) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch, unsubscribed_at: patch.resubscribe ? null : prefs.unsubscribed_at });
    setBusy(true);
    try {
      const r = await apiSend('/api/account/notifications', 'PATCH', patch);
      setPrefs(r.preferences as Prefs);
      toast.push({ tone: 'success', title: 'Notification settings saved' });
    } catch (err: any) {
      setPrefs(previous);
      toast.push({ tone: 'error', title: 'Could not save', description: userMessage(err, 'We couldn’t save those settings. Please try again.') });
    } finally { setBusy(false); }
  }

  if (isLoading || !prefs) return <Card><CardHead title="Notifications" subtitle="Choose what MYLA shows and sends"/><div className="space-y-3 p-5"><Skeleton className="h-10"/><Skeleton className="h-10"/><Skeleton className="h-10"/></div></Card>;

  return <div className="space-y-4">
    <Card>
      <CardHead title="Email & notification centre" subtitle="Quiet by default. Only essential account and billing messages are emailed."/>
      <div className="px-5 pb-4">
        {prefs.unsubscribed_at && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-2.5"><Lucide.Bell size={16} className="mt-0.5 shrink-0"/><p>Optional emails are off. Essential account and billing messages still arrive.</p></div>
          <Button size="sm" variant="outline" loading={busy} onClick={()=>save({ resubscribe: true, mute_all: false })}>Turn them back on</Button>
        </div>}
        <Row title="Account & security" description="Verification, sign-in and password changes." checked={prefs.email_security} essential/>
        <Row title="Billing" description="Invoices, payment reminders and subscription changes." checked={prefs.email_billing} essential/>
        <Row title="Approvals" description="Shown in the notification centre for the people who can act. Never emailed." checked={prefs.in_app_approvals} onChange={v=>save({ in_app_approvals: v })}/>
        <Row title="Tasks & deadlines" description="Due and overdue actions, grouped and deduplicated. Never emailed." checked={prefs.in_app_tasks} onChange={v=>save({ in_app_tasks: v })}/>
        <Row title="Support replies" description="Updates on tickets you raised or are assigned to. Never emailed." checked={prefs.in_app_support} onChange={v=>save({ in_app_support: v })}/>
        <Row title="Workspace summary" description="One calm summary in the notification centre. Never emailed." checked={prefs.in_app_digest} onChange={v=>save({ in_app_digest: v })}/>
      </div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead title="Timing" subtitle="Respect quiet hours and your working day"/>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Field label="Summary"><select className="select" value={prefs.digest_frequency} onChange={e=>save({ digest_frequency: e.target.value as Prefs['digest_frequency'] })}>
            <option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
          </select></Field>
          <Field label="Quiet from"><select className="select" value={prefs.quiet_hours_start} onChange={e=>save({ quiet_hours_start: Number(e.target.value) })}>
            {HOURS.map(h=><option key={h} value={h}>{hourLabel(h)}</option>)}
          </select></Field>
          <Field label="Quiet until"><select className="select" value={prefs.quiet_hours_end} onChange={e=>save({ quiet_hours_end: Number(e.target.value) })}>
            {HOURS.map(h=><option key={h} value={h}>{hourLabel(h)}</option>)}
          </select></Field>
          <div className="sm:col-span-3"><Field label="Time zone"><select className="select" value={prefs.timezone} onChange={e=>save({ timezone: e.target.value })}>
            {ZONES.map(z=><option key={z} value={z}>{z}</option>)}
          </select></Field></div>
          <p className="text-[11px] leading-relaxed muted sm:col-span-3">A chosen summary appears once in the notification centre after quiet hours, not as a separate email.</p>
        </div>
      </Card>
      <Card>
        <CardHead title="In-app & mute" subtitle="Useful alerts without filling anyone’s inbox"/>
        <div className="px-5 pb-4">
          <Row title="In-app notifications" description="Show alerts in the bell menu. Essential messages stay available." checked={prefs.in_app_enabled} onChange={v=>save({ in_app_enabled: v })}/>
          <Row title="Mute optional emails" description="Keeps MYLA to essential account, security and billing messages." checked={prefs.mute_all} onChange={v=>save({ mute_all: v })}/>
        </div>
        <div className="border-t divider px-5 py-4">
          <p className="text-[11px] leading-relaxed muted">MYLA never emails for every record edit. Workspace reminders are deduplicated, targeted to the right roles and paused during your quiet hours.</p>
          <a href={prefs.unsubscribeUrl} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"><Lucide.Bell size={14}/>Turn off optional emails with one click</a>
        </div>
      </Card>
    </div>
  </div>;
}
