import {
  Button,
  Flex,
  Text,
  Alert,
  LoadingSpinner,
  ToggleGroup,
  hubspot,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
  PageLink,
} from '@hubspot/ui-extensions/pages';
import { useState, useEffect } from 'react';

const SOURCES = [
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Google', value: 'google' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'HS Emails', value: 'hubspot' },
  { label: 'Klaviyo', value: 'klaviyo' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Partner', value: 'partner' },
  { label: 'X/Twitter', value: 'x_twitter' },
  { label: 'Offline', value: 'offline' },
];

const MEDIUMS = [
  { label: 'Paid social', value: 'paid-social' },
  { label: 'Organic social', value: 'organic-social' },
  { label: 'Influencer Campaigns', value: 'influencer' },
  { label: 'Retargeting Activities', value: 'retargeting' },
  { label: 'Marketing emails', value: 'mkt-emails' },
  { label: 'Sales emails', value: 'sales-emails' },
  { label: 'SMS', value: 'sms' },
  { label: 'Push notifications', value: 'push' },
  { label: 'Referral traffic', value: 'referral' },
  { label: 'Affiliate traffic', value: 'affiliate' },
  { label: 'Paid search', value: 'paid-search' },
  { label: 'Banner/display', value: 'display' },
  { label: 'Video Campaigns', value: 'video' },
  { label: 'QR Code', value: 'qr' },
  { label: 'Print', value: 'print' },
  { label: 'Webinars', value: 'webinar' },
  { label: 'Events', value: 'event' },
];

export const DEFAULT_MAP: Record<string, string[]> = {
  linkedin:  ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  instagram: ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  facebook:  ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  google:    ['retargeting', 'referral', 'paid-search', 'display', 'video'],
  youtube:   ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  reddit:    ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  tiktok:    ['paid-social', 'organic-social', 'influencer', 'retargeting'],
  hubspot:   ['mkt-emails', 'sales-emails', 'sms', 'push', 'webinar'],
  klaviyo:   ['mkt-emails', 'sales-emails', 'sms', 'push'],
  whatsapp:  ['paid-social', 'organic-social', 'sms'],
  partner:   ['affiliate', 'qr', 'print', 'webinar', 'event'],
  x_twitter: ['paid-social', 'organic-social', 'influencer', 'retargeting', 'referral'],
  offline:   ['qr', 'print', 'event'],
};

export const STORAGE_KEY = 'utm_source_medium_map';

type MapState = Record<string, Record<string, boolean>>;

function mapToState(map: Record<string, string[]>): MapState {
  const state: MapState = {};
  for (const src of SOURCES) {
    state[src.value] = {};
    for (const med of MEDIUMS) {
      state[src.value][med.value] = (map[src.value] || []).includes(med.value);
    }
  }
  return state;
}

function stateToMap(state: MapState): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const src of SOURCES) {
    map[src.value] = MEDIUMS.filter(med => state[src.value]?.[med.value]).map(med => med.value);
  }
  return map;
}

export const RulesPage = () => {

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<MapState>({});
  const [dirty, setDirty] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [superAdminOnly, setSuperAdminOnly] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const callFn = (action: string, params?: any): Promise<any> =>
    hubspot.serverless('utm_builder_app_function', { parameters: { action, params } });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mapResult, adminResult, settingResult] = await Promise.all([
        callFn('getMap'),
        callFn('checkAdmin'),
        callFn('getSetting', { key: 'superAdminOnly' }),
      ]);
      setIsAdmin(adminResult?.isAdmin === true);
      setSuperAdminOnly(settingResult?.value === 'true');
      setMatrix(mapToState(mapResult?.map || DEFAULT_MAP));
    } catch (e) {
      setMatrix(mapToState(DEFAULT_MAP));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (source: string, medium: string, editable: boolean) => {
    if (!editable) return;
    setMatrix(prev => ({
      ...prev,
      [source]: { ...prev[source], [medium]: !prev[source]?.[medium] },
    }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async (editable: boolean) => {
    if (!editable) return;
    setSaving(true);
    setError(null);
    try {
      const result = await callFn('setMap', { map: stateToMap(matrix) });
      if (result?.error) throw new Error(result.error);
      setSaved(true);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuperAdminOnly = async (newVal: boolean) => {
    if (!isAdmin) return;
    setSuperAdminOnly(newVal);
    try {
      await callFn('setSetting', { key: 'superAdminOnly', value: newVal ? 'true' : 'false' });
    } catch (e) {
      setError('Failed to update setting.');
    }
  };

  if (loading) return <LoadingSpinner label="Loading rules..." />;

  const editable = !superAdminOnly || isAdmin;

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Value Dependencies and Definitions</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Value Dependencies and Definitions</PageTitle>

      <Flex direction="column" gap="large">
        <Text variant="microcopy">
          Source identifies the platform or technical enabler for the traffic — where you are posting or sending content. Medium describes the marketing method or channel type used to deliver that traffic.
        </Text>

        {isAdmin && (
          <ToggleGroup
            name="super_admin_only"
            label="Restrict editing"
            options={[{ label: 'Super Admin only', value: 'superAdminOnly' }]}
            value={superAdminOnly ? ['superAdminOnly'] : []}
            onChange={(val) => handleToggleSuperAdminOnly(val.includes('superAdminOnly'))}
          />
        )}

        {!editable && (
          <Alert title="View only" variant="warning">Only super admins can edit dependency rules.</Alert>
        )}

        {error && <Alert title="Error" variant="error">{error}</Alert>}
        {saved && <Alert title="Saved!" variant="success">Rules updated successfully.</Alert>}

        {editable && (
          <Flex direction="row" gap="small" style={{ margin: "12px 0" }}>
            <Button onClick={() => { setMatrix(mapToState(DEFAULT_MAP)); setDirty(true); setSaved(false); }} variant="secondary">
              Reset to defaults
            </Button>
            <Button onClick={() => handleSave(editable)} variant="primary" disabled={saving || !dirty}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </Flex>
        )}

        <Flex direction="column" gap="extra-small">
          <Flex direction="row" gap="none">
            <Flex direction="column" gap="none" style={{ minWidth: '160px', width: '160px' }}>
              <Text format={{ fontWeight: 'bold' }} variant="microcopy">Mediums</Text>
            </Flex>
            <Flex direction="column" gap="none" style={{ flex: 1, alignItems: 'center' }}>
              <Text format={{ fontWeight: 'bold' }} variant="microcopy">Sources</Text>
            </Flex>
          </Flex>
          <Flex direction="row" gap="none">
            <Flex direction="column" gap="none" style={{ minWidth: '160px', width: '160px' }}>
              <Text variant="microcopy"> </Text>
            </Flex>
            {SOURCES.map((src) => (
              <Flex key={src.value} direction="column" gap="none" style={{ minWidth: '68px', width: '68px', textAlign: 'center' }}>
                <Text variant="microcopy">{src.label}</Text>
              </Flex>
            ))}
          </Flex>

          {MEDIUMS.map((med, i) => (
            <Flex key={med.value} direction="row" gap="none" style={{ background: i % 2 === 0 ? '#f5f8fa' : '#ffffff', border: '1px solid #e5e8eb', borderRadius: '3px' }}>
              <Flex direction="column" gap="none" style={{ minWidth: '110px', width: '110px' }}>
                <Text variant="microcopy">{med.label}</Text>
              </Flex>
              {SOURCES.map(src => (
                <Flex key={src.value} direction="column" gap="none" style={{ minWidth: '68px', width: '68px', alignItems: 'center' }}>
                  <Button
                    onClick={() => toggle(src.value, med.value, editable)}
                    variant={matrix[src.value]?.[med.value] ? 'primary' : 'secondary'}
                    size="xs"
                    disabled={!editable}
                  >
                    {matrix[src.value]?.[med.value] ? '✓' : '·'}
                  </Button>
                </Flex>
              ))}
            </Flex>
          ))}
        </Flex>

        {editable && (
          <Flex direction="row" gap="small" style={{ margin: "12px 0" }}>
            <Button onClick={() => { setMatrix(mapToState(DEFAULT_MAP)); setDirty(true); setSaved(false); }} variant="secondary">
              Reset to defaults
            </Button>
            <Button onClick={() => handleSave(editable)} variant="primary" disabled={saving || !dirty}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </Flex>
        )}
      </Flex>

      <Text variant="microcopy"> </Text>
      <Text variant="microcopy"> </Text>
      <Text variant="microcopy"> </Text>
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: 'bold' }}>Medium Definitions</Text>
        {[
          { key: 'paid-social',    label: 'Paid social',          desc: 'Paid ads on social media platforms (boosted posts, sponsored content, social ad campaigns).' },
          { key: 'organic-social', label: 'Organic social',       desc: 'Unpaid posts, shares, or links shared on social media profiles or pages.' },
          { key: 'influencer',     label: 'Influencer campaigns', desc: 'Content distributed through influencer or creator partnerships on social platforms.' },
          { key: 'retargeting',    label: 'Retargeting',          desc: 'Paid ads shown to users who have previously visited your site or engaged with your content.' },
          { key: 'mkt-emails',     label: 'Marketing emails',     desc: 'Bulk or automated marketing emails sent to lists (newsletters, nurture sequences, promotional blasts).' },
          { key: 'sales-emails',   label: 'Sales emails',         desc: '1:1 or sequenced outreach emails sent by sales reps to prospects or customers.' },
          { key: 'sms',            label: 'SMS',                  desc: 'Text message campaigns sent to opted-in contacts.' },
          { key: 'push',           label: 'Push notifications',   desc: 'Browser or app push notifications sent to subscribed users.' },
          { key: 'referral',       label: 'Referral traffic',     desc: 'Traffic driven by links on third-party websites, directories, or partner pages (non-paid).' },
          { key: 'affiliate',      label: 'Affiliate traffic',    desc: 'Traffic driven by affiliate partners who earn commission on conversions.' },
          { key: 'paid-search',    label: 'Paid search',          desc: 'Pay-per-click ads on search engines (Google Ads, Bing Ads).' },
          { key: 'display',        label: 'Banner / display',     desc: 'Visual display ads served on websites, apps, or ad networks (not search).' },
          { key: 'video',          label: 'Video campaigns',      desc: 'Video ads served on platforms like YouTube, connected TV, or programmatic video networks.' },
          { key: 'qr',             label: 'QR code',              desc: 'Links accessed by scanning a physical QR code (print, packaging, signage, events).' },
          { key: 'print',          label: 'Print',                desc: 'Links appearing in printed materials (magazines, flyers, direct mail, brochures).' },
          { key: 'webinar',        label: 'Webinars',             desc: 'Links shared during or promoting a live or recorded webinar session.' },
          { key: 'event',          label: 'Events',               desc: 'Links associated with in-person or virtual events (conferences, trade shows, meetups).' },
        ].map(({ key, label, desc }, i) => (
          <Flex key={key} direction="row" gap="small" style={{ padding: '6px 8px', background: i % 2 === 0 ? '#f5f8fa' : '#ffffff', borderRadius: '4px' }}>
            <Flex style={{ minWidth: '140px', width: '140px' }}>
              <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{label}</Text>
            </Flex>
            <Flex style={{ flex: 1 }}>
              <Text variant="microcopy">{desc}</Text>
            </Flex>
          </Flex>
        ))}
      </Flex>
    </>
  );
};
