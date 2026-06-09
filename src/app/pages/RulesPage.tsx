import React from 'react';
import {
  Button,
  Divider,
  Flex,
  Heading,
  Text,
  Alert,
  LoadingSpinner,
  Toggle,
  hubspot,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';
import { useState, useEffect } from 'react';

const DEFAULT_SOURCES = [
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

const DEFAULT_MEDIUMS = [
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

type FieldOption = { label: string; value: string };
type MapState = Record<string, Record<string, boolean>>;

interface Definitions {
  params?: Record<string, { description: string; example: string }>;
  sources?: Record<string, string>;
  mediums?: Record<string, string>;
}

function mapToState(map: Record<string, string[]>, srcs: FieldOption[], meds: FieldOption[]): MapState {
  const state: MapState = {};
  for (const src of srcs) {
    state[src.value] = {};
    for (const med of meds) {
      state[src.value][med.value] = (map[src.value] || []).includes(med.value);
    }
  }
  return state;
}

function stateToMap(state: MapState, srcs: FieldOption[], meds: FieldOption[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const src of srcs) {
    map[src.value] = meds.filter(med => state[src.value]?.[med.value]).map(med => med.value);
  }
  return map;
}

export const RulesPage = () => {
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [matrix, setMatrix]               = useState<MapState>({});
  const [dirty, setDirty]                 = useState(false);
  const [isAdmin, setIsAdmin]             = useState(false);
  const [superAdminOnly, setSuperAdminOnly] = useState(false);
  const [sources, setSources]             = useState<FieldOption[]>([]);
  const [mediums, setMediums]             = useState<FieldOption[]>([]);
  const [lastUpdated, setLastUpdated]     = useState<string | null>(null);
  const [lastUpdatedBy, setLastUpdatedBy] = useState<string | null>(null);
  const [definitions, setDefinitions]     = useState<Definitions>({});

  useEffect(() => { loadAll(); }, []);

  const callFn = (action: string, params?: any): Promise<any> =>
    hubspot.serverless('utm_builder_app_function', { parameters: { action, params } });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [configResult, adminResult] = await Promise.all([
        callFn('getConfig'),
        callFn('checkAdmin'),
      ]);

      setIsAdmin(adminResult?.isAdmin === true);

      const config = configResult?.config;
      if (config) {
        setSuperAdminOnly(config.superAdminOnly === true);

        const liveSources = config.fieldValues?.sources?.length > 0
          ? config.fieldValues.sources : DEFAULT_SOURCES;
        const liveMediums = config.fieldValues?.mediums?.length > 0
          ? config.fieldValues.mediums : DEFAULT_MEDIUMS;
        setSources(liveSources);
        setMediums(liveMediums);

        const map = config.sourcesMediumsMap || DEFAULT_MAP;
        setMatrix(mapToState(map, liveSources, liveMediums));

        if (config.lastUpdatedDatetime) {
          setLastUpdated(new Date(config.lastUpdatedDatetime).toLocaleString());
        }
        setLastUpdatedBy(config.lastUpdatedByUser || null);
        setDefinitions(config.definitionsCurrent || {});
      } else {
        setSources(DEFAULT_SOURCES);
        setMediums(DEFAULT_MEDIUMS);
        setMatrix(mapToState(DEFAULT_MAP, DEFAULT_SOURCES, DEFAULT_MEDIUMS));
      }
    } catch (e) {
      setSources(DEFAULT_SOURCES);
      setMediums(DEFAULT_MEDIUMS);
      setMatrix(mapToState(DEFAULT_MAP, DEFAULT_SOURCES, DEFAULT_MEDIUMS));
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
      const result = await callFn('saveMap', { map: stateToMap(matrix, sources, mediums) });
      if (result?.error) throw new Error(result.error);
      setSaved(true);
      setDirty(false);
      await loadAll();
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
      const result = await callFn('saveSetting', { superAdminOnly: newVal });
      if (result?.error) throw new Error(result.error);
    } catch (e) {
      setError('Failed to update setting.');
    }
  };

  const handleSync = async () => {
    if (!isAdmin) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await callFn('syncFieldValues');
      if (result?.error) throw new Error(result.error);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading..." />;

  const editable = !superAdminOnly || isAdmin;
  const rowBg = (i: number) => ({ padding: '6px 4px', background: i % 2 === 0 ? '#f5f8fa' : '#ffffff' });

  const ButtonRow = () => (
    <Flex direction="row" gap="small">
      {editable && (
        <>
          <Button
            onClick={() => { setMatrix(mapToState(DEFAULT_MAP, sources, mediums)); setDirty(true); setSaved(false); }}
            variant="secondary"
          >
            Reset to defaults
          </Button>
          <Button
            onClick={() => handleSave(editable)}
            variant="primary"
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </>
      )}
      {isAdmin && (
        <Button onClick={handleSync} variant="secondary" disabled={syncing || !editable}>
          {syncing ? 'Syncing...' : 'Sync field values'}
        </Button>
      )}
    </Flex>
  );

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Field Dependencies</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Field Dependencies</PageTitle>

      <Flex direction="column" gap="large">
        <Text variant="microcopy">
          Define which UTM Mediums are available for each UTM Source. When a source is selected on the Create UTM Link page, only its allowed mediums will appear. Use this page to configure those dependencies, then save to apply them across the app. Sync field values to pull the latest source and medium options from HubSpot.
        </Text>

        <Flex direction="row" gap="none" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Flex direction="column" gap="none">
            {lastUpdated && (
              <Text variant="microcopy">
                Last updated: {lastUpdated}{lastUpdatedBy ? ` by ${lastUpdatedBy}` : ''}
              </Text>
            )}
          </Flex>
          {isAdmin && (
            <Flex direction="row" gap="extra-small" style={{ alignItems: 'center' }}>
              <Toggle
                name="super_admin_only"
                label={superAdminOnly ? 'LOCK ON' : 'LOCK OFF'}
                checked={superAdminOnly}
                onChange={(checked) => handleToggleSuperAdminOnly(checked)}
              />
              <Text variant="microcopy" title="Only app editors will be able to make changes">ⓘ</Text>
            </Flex>
          )}
        </Flex>

        {!editable && (
          <Alert title="View only" variant="warning">Editing is locked. Only app editors can make changes.</Alert>
        )}

        {error && <Alert title="Error" variant="error">{error}</Alert>}
        {saved && <Alert title="Saved!" variant="success">Dependencies updated successfully.</Alert>}

        <ButtonRow />

        {/* Dependency matrix */}
        <Flex direction="column" gap="extra-small">
          <Flex direction="row" gap="none">
            <Flex direction="column" gap="none" style={{ minWidth: '160px', width: '160px' }}>
              <Text format={{ fontWeight: 'bold' }} variant="microcopy">Medium</Text>
            </Flex>
            <Flex direction="column" gap="none" style={{ flex: 1, alignItems: 'center' }}>
              <Text format={{ fontWeight: 'bold' }} variant="microcopy">Source</Text>
            </Flex>
          </Flex>
          <Flex direction="row" gap="none">
            <Flex direction="column" gap="none" style={{ minWidth: '160px', width: '160px' }}>
              <Text variant="microcopy"> </Text>
            </Flex>
            {sources.map((src) => (
              <Flex key={src.value} direction="column" gap="none" style={{ minWidth: '68px', width: '68px', textAlign: 'center' }}>
                <Text variant="microcopy">{src.label}</Text>
              </Flex>
            ))}
          </Flex>

          {mediums.map((med, i) => (
            <React.Fragment key={med.value}>
              {i > 0 && <Divider />}
              <Flex direction="row" gap="none">
                <Flex direction="column" gap="none" style={{ minWidth: '110px', width: '110px' }}>
                  <Text variant="microcopy">{med.label}</Text>
                </Flex>
                {sources.map(src => (
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
            </React.Fragment>
          ))}
        </Flex>

        <ButtonRow />

        {/* Source definitions — read only */}
        {sources.length > 0 && (
          <Flex direction="column" gap="extra-small" style={{ paddingTop: "24px" }}>
            <Heading>Source Definitions:</Heading>
            <Flex direction="row" gap="none" style={{ padding: '4px 4px' }}>
              <Flex style={{ minWidth: '160px', width: '160px' }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Label</Text>
              </Flex>
              <Flex style={{ flex: 1 }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Description</Text>
              </Flex>
            </Flex>
            <Divider />
            {sources.map(({ label, value }, i) => (
              <React.Fragment key={value}>
                {i > 0 && <Divider />}
                <Flex direction="row" gap="none" style={rowBg(i)}>
                  <Flex style={{ minWidth: '160px', width: '160px' }}>
                    <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{label}</Text>
                  </Flex>
                  <Flex style={{ flex: 1 }}>
                    <Text variant="microcopy">{definitions.sources?.[value] || '—'}</Text>
                  </Flex>
                </Flex>
              </React.Fragment>
            ))}
          </Flex>
        )}

        {/* Medium definitions — read only */}
        {mediums.length > 0 && (
          <Flex direction="column" gap="extra-small" style={{ paddingTop: "24px" }}>
            <Heading>Medium Definitions:</Heading>
            <Flex direction="row" gap="none" style={{ padding: '4px 4px' }}>
              <Flex style={{ minWidth: '160px', width: '160px' }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Label</Text>
              </Flex>
              <Flex style={{ flex: 1 }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Description</Text>
              </Flex>
            </Flex>
            <Divider />
            {mediums.map(({ label, value }, i) => (
              <React.Fragment key={value}>
                {i > 0 && <Divider />}
                <Flex direction="row" gap="none" style={rowBg(i)}>
                  <Flex style={{ minWidth: '160px', width: '160px' }}>
                    <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{label}</Text>
                  </Flex>
                  <Flex style={{ flex: 1 }}>
                    <Text variant="microcopy">{definitions.mediums?.[value] || '—'}</Text>
                  </Flex>
                </Flex>
              </React.Fragment>
            ))}
          </Flex>
        )}
      </Flex>
    </>
  );
};
