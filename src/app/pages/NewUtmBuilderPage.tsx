import {
  Button,
  Checkbox,
  DateInput,
  Flex,
  Input,
  Select,
  Text,
  Alert,
  LoadingSpinner,
  Divider,
  ToggleGroup,
  Link,
  hubspot,
  useExtensionActions,
  useExtensionContext,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';
import { useState, useEffect } from 'react';

const SLUG_REGEX = /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$|^[a-z0-9]$/;

function isValidSlug(val: string): boolean {
  return SLUG_REGEX.test(val);
}

function toSlug(val: string): string {
  return val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
}

function toSourceWebsiteValue(val: string): string {
  if (!val) return '';
  try {
    const url = new URL(normalizeUrl(val));
    return url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch {
    return val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

import { DEFAULT_MAP } from './RulesPage.tsx';

function isValidUrl(val: string): boolean {
  if (!val) return false;
  try {
    const trimmed = val.trim();
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
    const url = new URL(normalized);
    // Must have a dot in hostname AND TLD must be at least 2 chars
    const parts = url.hostname.split('.');
    return parts.length >= 2 && parts[parts.length - 1].length >= 2;
  } catch { return false; }
}

function normalizeUrl(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

function pad2(val: number): string {
  return String(val).padStart(2, '0');
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function parseDateParts(val: string): { year: number; month: number; day: number } | null {
  if (!val) return null;

  const dateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return {
      year: Number(dateMatch[1]),
      month: Number(dateMatch[2]),
      day: Number(dateMatch[3]),
    };
  }

  const timestamp = /^\d+$/.test(val) ? Number(val) : Date.parse(val);
  if (Number.isNaN(timestamp)) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isValidDate(val: string): boolean {
  const parts = parseDateParts(val);
  if (!parts) return false;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() + 1 === parts.month &&
    date.getUTCDate() === parts.day
  );
}

function isValidIsoDate(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val) && isValidDate(val);
}

function toYearMonth(val: string): string {
  const parts = parseDateParts(val);
  return parts ? `${parts.year}-${pad2(parts.month)}` : '';
}

function buildCampaignUtm(activationMonth: string, baseUtm: string): string {
  if (!baseUtm) return '';
  if (!activationMonth) return baseUtm;
  if (baseUtm.startsWith(`${activationMonth}-`)) return baseUtm;
  return `${activationMonth}-${baseUtm.replace(/^\d{4}-\d{2}[_-]/, '')}`;
}

function toHubSpotDateValue(val: string): string {
  const parts = parseDateParts(val);
  if (!parts) return '';
  return String(Date.UTC(parts.year, parts.month - 1, parts.day));
}

interface DateInputValue {
  year: number;
  month: number;
  date: number;
}

function toDateInputValue(val: string): DateInputValue | null {
  const parts = parseDateParts(val);
  if (!parts) return null;

  return {
    year: parts.year,
    month: parts.month - 1,
    date: parts.day,
  };
}

interface CampaignOption {
  label: string;
  value: string;
  baseUtm: string;
  utm: string;
  startDate: string;
  activationMonth: string;
}

interface DuplicateRecord {
  id: string;
  contentPieceName?: string;
  taggedUrl?: string;
}

function getCampaignUtmWarning(campaign?: CampaignOption): string | null {
  if (!campaign) return null;
  if (!campaign.activationMonth) {
    return 'Campaign Start Date is empty. Populate it on the related Campaign, then update the campaign UTM to follow YYYY-MM-Campaign_name using the campaign start month.';
  }
  if (!campaign.baseUtm.startsWith(`${campaign.activationMonth}-`)) {
    const campaignName = campaign.baseUtm.replace(/^\d{4}-\d{2}[_-]/, '') || 'Campaign_name';
    return `Campaign UTM should start with ${campaign.activationMonth}- based on the Campaign Start Date. Update the related Campaign UTM to ${campaign.activationMonth}-${campaignName}.`;
  }
  return null;
}

function buildUtmLinkRecordUrl(portalId: number, recordId: string): string {
  return `https://app-eu1.hubspot.com/contacts/${portalId}/record/2-203776196/${encodeURIComponent(recordId)}`;
}

export const NewUtmBuilderPage = () => {
  const actions = useExtensionActions();
  const context = useExtensionContext<'pages'>();
  const [loading, setLoading] = useState(true);
  const [sourceMediumMap, setSourceMediumMap] = useState<Record<string, string[]>>(DEFAULT_MAP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] = useState<DuplicateRecord | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [sourceOptions, setSourceOptions] = useState<{label: string, value: string}[]>([]);
  const [mediumOptions, setMediumOptions] = useState<{label: string, value: string}[]>([]);
  const [placementOptions, setPlacementOptions] = useState<{label: string, value: string}[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

  const [salesAgentMode, setSalesAgentMode] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [form, setForm] = useState({
    campaign_id: '',
    campaign_utm: '',
    campaign_activation_month: '',
    destination_url: '',
    content_activation_date: getTodayDate(),
    utm_source: '',
    use_source_website: false,
    source_website: '',
    utm_medium: '',
    content_piece_name: '',
    utm_topic: '',
    link_placement: '',
    utm_term: '',
  });

  const [slugError, setSlugError] = useState('');
  const [topicSlugError, setTopicSlugError] = useState('');
  const [dateError, setDateError] = useState('');
  const [urlError, setUrlError] = useState('');

  const selectedCampaign = campaignOptions.find(campaign => campaign.value === form.campaign_id);
  const campaignUtmWarning = getCampaignUtmWarning(selectedCampaign);

  const selectedSource = form.use_source_website ? toSourceWebsiteValue(form.source_website) : form.utm_source;

  const filteredMediumOptions = !form.use_source_website && form.utm_source && sourceMediumMap[form.utm_source]
    ? mediumOptions.filter(o => sourceMediumMap[form.utm_source].includes(o.value))
    : mediumOptions;

  const utmContent = form.content_activation_date && form.content_piece_name
    ? `${form.content_activation_date}_${form.content_piece_name}${form.link_placement ? '_' + form.link_placement : ''}`
    : '';

  const taggedUrl = (() => {
    if (!form.destination_url || !selectedSource || !form.utm_medium || !form.campaign_utm || !utmContent) return '';
    if (!isValidUrl(form.destination_url)) return '';
    if (form.use_source_website && !isValidUrl(form.source_website)) return '';
    if (!isValidIsoDate(form.content_activation_date)) return '';
    try {
      const url = new URL(normalizeUrl(form.destination_url));
      url.searchParams.set('utm_source', selectedSource);
      url.searchParams.set('utm_medium', form.utm_medium);
      url.searchParams.set('utm_campaign', form.campaign_utm);
      url.searchParams.set('utm_content', utmContent);
      if (form.utm_term) url.searchParams.set('utm_term', form.utm_term);
      if (form.utm_topic) url.searchParams.set('utm_topic', form.utm_topic);
      return url.toString();
    } catch { return ''; }
  })();

  useEffect(() => {
    loadStoredMap();
    loadOptions();
  }, []);

  // Reload map when page gains focus
  useEffect(() => {
    const interval = setInterval(loadStoredMap, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStoredMap = async () => {
    try {
      const result = await hubspot.serverless('utm_builder_app_function', {
        parameters: { action: 'getMap' }
      });
      if (result.map) setSourceMediumMap(result.map);
    } catch { /* use default */ }
  };

  const callFn = async (action: string, params?: any): Promise<any> => {
    const result = await hubspot.serverless('utm_builder_app_function', {
      parameters: { action, params },
    });
    return result;
  };

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const optionsData = await callFn('getOptions');
      if (optionsData.error) throw new Error(`Options error: ${optionsData.error}`);

      setSourceOptions(optionsData.sourceOptions.map((o: any) => ({ label: o.label, value: o.value })));
      setMediumOptions(optionsData.mediumOptions.map((o: any) => ({ label: o.label, value: o.value })));
      setPlacementOptions([
        { label: 'None', value: '' },
        ...optionsData.placementOptions.map((o: any) => ({ label: o.label, value: o.value }))
      ]);

      const campaignsData = await callFn('getCampaignsWithStartDate');
      if (campaignsData.error) throw new Error(`Campaigns error: ${campaignsData.error}`);

      // Filter out completed campaigns
      const campaigns = (campaignsData.campaigns || [])
        .filter((c: any) => {
          const status = (c.properties?.hs_campaign_status || '').toLowerCase();
          return status !== 'completed' && status !== 'cancelled';
        })
        .map((c: any) => ({
          label: c.properties?.hs_name || `Campaign ${c.id}`,
          value: c.id,
          baseUtm: decodeURIComponent(c.properties?.hs_utm || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]+/g, '').replace(/^-|-$/g, ''),
          startDate: c.campaignStartDate || '',
          activationMonth: toYearMonth(c.campaignStartDate || ''),
        }))
        .map((c: CampaignOption) => ({
          ...c,
          utm: buildCampaignUtm(c.activationMonth, c.baseUtm),
        }));
      setCampaignOptions(campaigns);

    } catch (e) {
      setError(`Failed to load: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await callFn('getUsers');
      if (data.error) throw new Error(data.error);
      const users = (data.users || []).map((u: any) => {
        const first = (u.firstName || '').toLowerCase();
        const lastInitial = (u.lastName || '')[0]?.toLowerCase() || '';
        const val = lastInitial ? `${first}_${lastInitial}` : first;
        return { label: `${u.firstName || ''} ${u.lastName || ''}`.trim() + ` (${val})`, value: val };
      });
      setUserOptions(users);
    } catch (e) {
      setUserOptions([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCampaignChange = (val: string) => {
    const campaign = campaignOptions.find(c => c.value === val);
    setForm(prev => ({
      ...prev,
      campaign_id: val,
      campaign_utm: campaign?.utm || '',
      campaign_activation_month: campaign?.activationMonth || '',
    }));
    setSuccess(false);
    setError(null);
    setDuplicateRecord(null);
  };

  const handleDateChange = (val: string) => {
    setForm(prev => ({ ...prev, content_activation_date: val }));
    if (val && !isValidIsoDate(val)) {
      setDateError('Use a valid date in YYYY-MM-DD format.');
    } else {
      setDateError('');
    }
    setSuccess(false);
    setError(null);
    setDuplicateRecord(null);
  };

  const handleDatePickerChange = (val: DateInputValue | null) => {
    if (!val) {
      handleDateChange('');
      return;
    }

    handleDateChange(`${val.year}-${pad2(val.month + 1)}-${pad2(val.date)}`);
  };

  const handleSourceWebsiteToggle = (checked: boolean) => {
    setForm(prev => ({
      ...prev,
      use_source_website: checked,
      utm_source: checked ? '' : prev.utm_source,
    }));
    setSuccess(false);
    setError(null);
    setDuplicateRecord(null);
  };

  const handleUrlChange = (val: string) => {
    setForm(prev => ({ ...prev, destination_url: val }));
    if (val && !isValidUrl(val)) {
      setUrlError('Enter a valid URL (e.g. runware.ai/pricing or https://runware.ai/pricing)');
    } else {
      setUrlError('');
    }
    setSuccess(false);
    setError(null);
    setDuplicateRecord(null);
  };

  const handleChange = (field: string, value: string) => {
    if (field === 'utm_source') {
      // Reset medium if no longer valid for new source
      const validMediums = sourceMediumMap[value] || [];
      if (form.utm_medium && !validMediums.includes(form.utm_medium)) {
        setForm(prev => ({ ...prev, utm_source: value, utm_medium: '' }));
        setSuccess(false);
        setError(null);
        setDuplicateRecord(null);
        return;
      }
    }
    if (field === 'content_piece_name' || field === 'utm_topic') {
      const slugged = toSlug(value);
      const nextError = slugged && !isValidSlug(slugged) ? 'Lowercase letters, numbers, hyphens and underscores only.' : '';
      if (field === 'content_piece_name') {
        setSlugError(nextError);
      } else {
        setTopicSlugError(nextError);
      }
      setForm(prev => ({ ...prev, [field]: slugged }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
    setSuccess(false);
    setError(null);
    setDuplicateRecord(null);
  };

  const handleSalesAgentToggle = (val: string[]) => {
    const enabled = val.includes('agent');
    setSalesAgentMode(enabled);
    setForm(prev => ({ ...prev, utm_term: '' }));
    if (enabled && userOptions.length === 0) loadUsers();
  };

  const validate = (): boolean => {
    if (!form.campaign_id) { setError('Please select a campaign.'); return false; }
    if (!form.campaign_utm) { setError('Selected campaign must have a Campaign UTM value.'); return false; }
    if (!form.destination_url) { setError('Destination URL is required.'); return false; }
    if (!isValidUrl(form.destination_url)) { setError('Please enter a valid URL.'); return false; }
    if (!form.content_activation_date) { setError('Content Activation Date is required.'); return false; }
    if (!isValidIsoDate(form.content_activation_date)) { setError('Content Activation Date must use YYYY-MM-DD.'); return false; }
    if (form.use_source_website) {
      if (!selectedSource) { setError('Source Website is required.'); return false; }
      if (!isValidUrl(form.source_website)) { setError('Source Website must be a valid URL.'); return false; }
    } else if (!form.utm_source) { setError('UTM Source is required.'); return false; }
    if (!form.utm_medium) { setError('UTM Medium is required.'); return false; }
    if (!form.content_piece_name) { setError('Content Piece Name is required.'); return false; }
    if (!isValidSlug(form.content_piece_name)) { setError('Content Piece Name must be lowercase with no spaces.'); return false; }
    if (form.utm_topic && !isValidSlug(form.utm_topic)) { setError('UTM Topic must be lowercase with no spaces.'); return false; }
    return true;
  };

  const handleSave = async () => {
    setDuplicateRecord(null);
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const destUrl = normalizeUrl(form.destination_url);
      const properties: Record<string, string> = {
        content_piece_name: taggedUrl,
        destination_url: destUrl,
        content_activation_date: toHubSpotDateValue(form.content_activation_date),
        utm_medium: form.utm_medium,
        utm_campaign: form.campaign_utm,
        utm_content: utmContent,
        tagged_url: taggedUrl,
      };
      if (form.use_source_website) {
        properties.source_website = normalizeUrl(form.source_website);
      } else {
        properties.utm_source = form.utm_source;
      }
      if (form.link_placement) properties.link_placement = form.link_placement;
      if (form.utm_term) properties.utm_term = form.utm_term;
      if (form.utm_topic) properties.utm_topic = form.utm_topic;

      const result = await callFn('createUtmLink', { properties, campaignId: form.campaign_id });
      if (result.error) {
        if (result.duplicate) setDuplicateRecord(result.duplicate);
        throw new Error(result.error);
      }

      setSuccess(true);
      setDuplicateRecord(null);
      if (result.id) setCreatedId(result.id);
      setForm(prev => ({
        campaign_id: prev.campaign_id,
        campaign_utm: prev.campaign_utm,
        campaign_activation_month: prev.campaign_activation_month,
        destination_url: '',
        content_activation_date: getTodayDate(),
        utm_source: '',
        use_source_website: false,
        source_website: '',
        utm_medium: '',
        content_piece_name: '',
        utm_topic: '',
        link_placement: '',
        utm_term: '',
      }));
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!taggedUrl) return;
    actions.copyTextToClipboard(taggedUrl);
    actions.addAlert({ type: 'SUCCESS', message: 'Tagged URL copied to clipboard!' });
  };

  const handleCopyAndSave = async () => {
    handleCopy();
    await handleSave();
  };

  const handleSaveAndNew = async () => {
    await handleSave();
    // Reset everything except campaign on success
  };

  const handleReset = () => {
    setForm({
      campaign_id: '',
      campaign_utm: '',
      campaign_activation_month: '',
      destination_url: '',
      content_activation_date: getTodayDate(),
      utm_source: '',
      use_source_website: false,
      source_website: '',
      utm_medium: '',
      content_piece_name: '',
      utm_topic: '',
      link_placement: '',
      utm_term: '',
    });
    setError(null);
    setDuplicateRecord(null);
    setSuccess(false);
    setCreatedId(null);
    setSlugError('');
    setTopicSlugError('');
    setDateError('');
    setUrlError('');
    setSalesAgentMode(false);
  };

  if (loading) return <LoadingSpinner label="Loading UTM Builder..." />;

  const portalId = context.portal?.id;
  const recordUrl = createdId && portalId
    ? buildUtmLinkRecordUrl(portalId, createdId)
    : null;
  const duplicateRecordUrl = duplicateRecord?.id && portalId
    ? buildUtmLinkRecordUrl(portalId, duplicateRecord.id)
    : null;

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Single UTM Builder</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Single UTM Builder</PageTitle>

      <Flex direction="row" gap="large">

        {/* Left: Form */}
        <Flex direction="column" gap="medium">

          {error && (
            <Alert title="Error" variant="error">
              <Flex direction="column" gap="extra-small">
                <Text>{error}</Text>
                {duplicateRecordUrl && (
                  <Link href={{ url: duplicateRecordUrl, external: true }}>Open existing UTM Link record</Link>
                )}
              </Flex>
            </Alert>
          )}
          {success && (
            <Flex direction="column" gap="extra-small">
              <Alert title="Saved!" variant="success">
                UTM Link created and associated with campaign.
              </Alert>
              {recordUrl && <Link href={{ url: recordUrl, external: true }}>View created UTM Link record</Link>}
            </Flex>
          )}

          <Select label="Campaign" name="campaign_id" value={form.campaign_id} onChange={handleCampaignChange} options={campaignOptions} placeholder="Search campaigns..." required />
          {form.campaign_activation_month && <Text format={{ fontWeight: 'demibold' }}>activation month: {form.campaign_activation_month}</Text>}
          {form.campaign_utm && <Text format={{ fontWeight: 'demibold' }}>utm_campaign: {form.campaign_utm}</Text>}
          {campaignUtmWarning && (
            <Alert title="Campaign UTM format warning" variant="warning">
              {campaignUtmWarning}
            </Alert>
          )}

          <Divider />

          <Input
            label="Destination URL"
            name="destination_url"
            value={form.destination_url}
            onChange={handleUrlChange}
            placeholder="runware.ai/pricing"
            required
            error={!!urlError}
            validationMessage={urlError || undefined}
          />

          <Divider />

          <Checkbox
            name="website_source"
            value="website_source"
            checked={form.use_source_website}
            onChange={checked => handleSourceWebsiteToggle(checked)}
          >
            Website Source
          </Checkbox>

          <Flex direction="row" gap="small">
            <Select label="UTM Source" name="utm_source" value={form.utm_source} onChange={val => handleChange('utm_source', val)} options={sourceOptions} placeholder={form.use_source_website ? "Using source website..." : "Select source..."} required={!form.use_source_website} readOnly={form.use_source_website} />
            {form.use_source_website && (
              <Input
                label="Source Website"
                name="source_website"
                value={form.source_website}
                onChange={val => handleChange('source_website', val)}
                placeholder="e.g. partner-site.com"
                required
                error={!!form.source_website && !isValidUrl(form.source_website)}
                validationMessage={form.source_website && !isValidUrl(form.source_website) ? 'Enter a valid URL.' : undefined}
              />
            )}
            <Select label="UTM Medium" name="utm_medium" value={form.utm_medium} onChange={val => handleChange('utm_medium', val)} options={filteredMediumOptions} placeholder={form.use_source_website || form.utm_source ? "Select medium..." : "Select source first..."} required />
          </Flex>

          <Flex direction="row" gap="small">
            <DateInput
              label="Content Activation Date"
              name="content_activation_date"
              value={toDateInputValue(form.content_activation_date) || undefined}
              onChange={handleDatePickerChange}
              format="YYYY-MM-DD"
              clearButtonLabel="Clear"
              todayButtonLabel="Today"
              required
              error={!!dateError}
              validationMessage={dateError || undefined}
            />
            <Input label="Content Piece Name" name="content_piece_name" value={form.content_piece_name} onChange={val => handleChange('content_piece_name', val)} placeholder="e.g. q3-brand-video" required error={!!slugError} validationMessage={slugError || undefined} />
          </Flex>

          <Select label="Link Placement" name="link_placement" value={form.link_placement} onChange={val => handleChange('link_placement', val)} options={placementOptions} placeholder="Select placement..." />

          <Input label="UTM Topic" name="utm_topic" value={form.utm_topic} onChange={val => handleChange('utm_topic', val)} placeholder="e.g. model-theme" error={!!topicSlugError} validationMessage={topicSlugError || undefined} />

          <Divider />

          <ToggleGroup name="sales_agent" label="Sales Agent link?" options={[{ label: 'Yes, assign to a sales agent', value: 'agent' }]} value={salesAgentMode ? ['agent'] : []} onChange={handleSalesAgentToggle} />

          {salesAgentMode ? (
            loadingUsers ? <LoadingSpinner label="Loading users..." /> :
            <Select label="Sales Agent (UTM Term)" name="utm_term" value={form.utm_term} onChange={val => handleChange('utm_term', val)} options={userOptions} placeholder="Select agent..." />
          ) : (
            <Input label="UTM Term" name="utm_term" value={form.utm_term} onChange={val => handleChange('utm_term', toSlug(val).slice(0, 20))} placeholder="e.g. ai-image-generation" />
          )}

          <Divider />

          <Flex direction="row" gap="small">
            <Button onClick={handleReset} variant="secondary">Clear</Button>
            <Button onClick={handleSaveAndNew} variant="secondary" disabled={saving}>{saving ? 'Saving...' : 'Save & New'}</Button>
            <Button onClick={handleCopyAndSave} variant="primary" disabled={saving || !taggedUrl}>{saving ? 'Saving...' : 'Save & Copy URL'}</Button>
          </Flex>

        </Flex>

        {/* Right: Preview */}
        <Flex direction="column" gap="medium">

          {/* UTM Parameters - top */}
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>UTM Parameters</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_source</Text>
            <Text variant="microcopy">{selectedSource || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_medium</Text>
            <Text variant="microcopy">{form.utm_medium || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_campaign</Text>
            <Text variant="microcopy">{form.campaign_utm || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_content</Text>
            <Text variant="microcopy">{utmContent || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_term</Text>
            <Text variant="microcopy">{form.utm_term || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_topic</Text>
            <Text variant="microcopy">{form.utm_topic || '—'}</Text>
          </Flex>

          <Divider />

          {/* Tagged URL - below */}
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: 'bold' }}>Tagged URL</Text>
            {taggedUrl ? (
              <Flex direction="column" gap="small">
                <Alert title="Your tagged URL is ready" variant="info">
                  {taggedUrl}
                </Alert>
                <Button onClick={handleCopyAndSave} variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save & Copy URL'}</Button>
              </Flex>
            ) : (
              <Text variant="microcopy">Fill in all required fields to generate URL.</Text>
            )}
          </Flex>

        </Flex>

      </Flex>
    </>
  );
};
