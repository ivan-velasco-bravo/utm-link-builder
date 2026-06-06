import {
  Button,
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

import { DEFAULT_MAP, STORAGE_KEY } from './RulesPage.tsx';

function isValidUrl(val: string): boolean {
  if (!val) return false;
  try {
    const normalized = val.startsWith('http') ? val : 'https://' + val;
    const url = new URL(normalized);
    // Must have a dot in hostname AND TLD must be at least 2 chars
    const parts = url.hostname.split('.');
    return parts.length >= 2 && parts[parts.length - 1].length >= 2;
  } catch { return false; }
}

function normalizeUrl(val: string): string {
  if (!val) return '';
  return val.startsWith('http') ? val : 'https://' + val;
}

export const HomePage = () => {
  const actions = useExtensionActions();
  const [loading, setLoading] = useState(true);
  const [sourceMediumMap, setSourceMediumMap] = useState<Record<string, string[]>>(DEFAULT_MAP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [sourceOptions, setSourceOptions] = useState<{label: string, value: string}[]>([]);
  const [mediumOptions, setMediumOptions] = useState<{label: string, value: string}[]>([]);
  const [placementOptions, setPlacementOptions] = useState<{label: string, value: string}[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<{label: string, value: string, utm: string}[]>([]);
  const [userOptions, setUserOptions] = useState<{label: string, value: string}[]>([]);

  const [salesAgentMode, setSalesAgentMode] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [form, setForm] = useState({
    campaign_id: '',
    campaign_utm: '',
    destination_url: '',
    utm_source: '',
    utm_medium: '',
    content_piece_name: '',
    link_placement: '',
    utm_term: '',
  });

  const [slugError, setSlugError] = useState('');
  const [urlError, setUrlError] = useState('');

  const filteredMediumOptions = form.utm_source && sourceMediumMap[form.utm_source]
    ? mediumOptions.filter(o => sourceMediumMap[form.utm_source].includes(o.value))
    : mediumOptions;

  const utmContent = form.content_piece_name
    ? form.content_piece_name + (form.link_placement ? '_' + form.link_placement : '')
    : '';

  const taggedUrl = (() => {
    if (!form.destination_url || !form.utm_source || !form.utm_medium || !form.campaign_utm || !utmContent) return '';
    if (!isValidUrl(form.destination_url)) return '';
    try {
      const url = new URL(normalizeUrl(form.destination_url));
      url.searchParams.set('utm_source', form.utm_source);
      url.searchParams.set('utm_medium', form.utm_medium);
      url.searchParams.set('utm_campaign', form.campaign_utm);
      url.searchParams.set('utm_content', utmContent);
      if (form.utm_term) url.searchParams.set('utm_term', form.utm_term);
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

      const campaignsData = await callFn('getCampaigns');
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
          utm: decodeURIComponent(c.properties?.hs_utm || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]+/g, '').replace(/^-|-$/g, ''),
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
    setForm(prev => ({ ...prev, campaign_id: val, campaign_utm: campaign?.utm || '' }));
    setSuccess(false);
    setError(null);
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
  };

  const handleChange = (field: string, value: string) => {
    if (field === 'utm_source') {
      // Reset medium if no longer valid for new source
      const validMediums = sourceMediumMap[value] || [];
      if (form.utm_medium && !validMediums.includes(form.utm_medium)) {
        setForm(prev => ({ ...prev, utm_source: value, utm_medium: '' }));
        setSuccess(false);
        setError(null);
        return;
      }
    }
    if (field === 'content_piece_name') {
      const slugged = toSlug(value);
      setSlugError(slugged && !isValidSlug(slugged) ? 'Lowercase letters, numbers, hyphens and underscores only.' : '');
      setForm(prev => ({ ...prev, [field]: slugged }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
    setSuccess(false);
    setError(null);
  };

  const handleSalesAgentToggle = (val: string[]) => {
    const enabled = val.includes('agent');
    setSalesAgentMode(enabled);
    setForm(prev => ({ ...prev, utm_term: '' }));
    if (enabled && userOptions.length === 0) loadUsers();
  };

  const validate = (): boolean => {
    if (!form.campaign_id) { setError('Please select a campaign.'); return false; }
    if (!form.destination_url) { setError('Destination URL is required.'); return false; }
    if (!isValidUrl(form.destination_url)) { setError('Please enter a valid URL.'); return false; }
    if (!form.utm_source) { setError('UTM Source is required.'); return false; }
    if (!form.utm_medium) { setError('UTM Medium is required.'); return false; }
    if (!form.content_piece_name) { setError('Content Piece Name is required.'); return false; }
    if (!isValidSlug(form.content_piece_name)) { setError('Content Piece Name must be lowercase with no spaces.'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const destUrl = normalizeUrl(form.destination_url);
      const properties: Record<string, string> = {
        content_piece_name: form.content_piece_name,
        destination_url: destUrl,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_campaign: form.campaign_utm,
        utm_content: utmContent,
        tagged_url: taggedUrl,
      };
      if (form.link_placement) properties.link_placement = form.link_placement;
      if (form.utm_term) properties.utm_term = form.utm_term;

      const result = await callFn('createUtmLink', { properties, campaignId: form.campaign_id });
      if (result.error) throw new Error(result.error);

      setSuccess(true);
      if (result.id) setCreatedId(result.id);
      setForm(prev => ({
        campaign_id: prev.campaign_id,
        campaign_utm: prev.campaign_utm,
        destination_url: '',
        utm_source: '',
        utm_medium: '',
        content_piece_name: '',
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
    setForm({ campaign_id: '', campaign_utm: '', destination_url: '', utm_source: '', utm_medium: '', content_piece_name: '', link_placement: '', utm_term: '' });
    setError(null);
    setSuccess(false);
    setCreatedId(null);
    setSlugError('');
    setUrlError('');
    setSalesAgentMode(false);
  };

  if (loading) return <LoadingSpinner label="Loading UTM Builder..." />;

  const recordUrl = createdId
    ? `https://app-eu1.hubspot.com/contacts/144066378/record/2-203776196/${createdId}`
    : null;

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>UTM Builder</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Create UTM Link</PageTitle>

      <Flex direction="row" gap="large">

        {/* Left: Form */}
        <Flex direction="column" gap="medium">

          {error && <Alert title="Error" variant="error">{error}</Alert>}
          {success && (
            <Flex direction="column" gap="extra-small">
              <Alert title="Saved!" variant="success">
                UTM Link created and associated with campaign.
              </Alert>
              {recordUrl && <Link href={recordUrl}>View created UTM Link record →</Link>}
            </Flex>
          )}

          <Select label="Campaign" name="campaign_id" value={form.campaign_id} onChange={handleCampaignChange} options={campaignOptions} placeholder="Search campaigns..." required />
          {form.campaign_utm && <Text format={{ fontWeight: 'demibold' }}>utm_campaign: {form.campaign_utm}</Text>}

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

          <Flex direction="row" gap="small">
            <Select label="UTM Source" name="utm_source" value={form.utm_source} onChange={val => handleChange('utm_source', val)} options={sourceOptions} placeholder="Select source..." required />
            <Select label="UTM Medium" name="utm_medium" value={form.utm_medium} onChange={val => handleChange('utm_medium', val)} options={filteredMediumOptions} placeholder={form.utm_source ? "Select medium..." : "Select source first..."} required />
          </Flex>

          <Input label="Content Piece Name" name="content_piece_name" value={form.content_piece_name} onChange={val => handleChange('content_piece_name', val)} placeholder="e.g. q3-brand-video" required error={!!slugError} validationMessage={slugError || 'Lowercase, no spaces. Combined with placement to form utm_content.'} />

          <Select label="Link Placement" name="link_placement" value={form.link_placement} onChange={val => handleChange('link_placement', val)} options={placementOptions} placeholder="Select placement..." />

          <Divider />

          <ToggleGroup name="sales_agent" label="Sales Agent link?" options={[{ label: 'Yes, assign to a sales agent', value: 'agent' }]} value={salesAgentMode ? ['agent'] : []} onChange={handleSalesAgentToggle} />

          {salesAgentMode ? (
            loadingUsers ? <LoadingSpinner label="Loading users..." /> :
            <Select label="Sales Agent (UTM Term)" name="utm_term" value={form.utm_term} onChange={val => handleChange('utm_term', val)} options={userOptions} placeholder="Select agent..." />
          ) : (
            <Input label="UTM Term" name="utm_term" value={form.utm_term} onChange={val => handleChange('utm_term', toSlug(val).slice(0, 20))} placeholder="e.g. ai-image-generation" validationMessage={"Max 20 characters. " + (form.utm_term.length > 0 ? form.utm_term.length + "/20" : "")} />
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
            <Text variant="microcopy">{form.utm_source || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_medium</Text>
            <Text variant="microcopy">{form.utm_medium || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_campaign</Text>
            <Text variant="microcopy">{form.campaign_utm || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_content</Text>
            <Text variant="microcopy">{utmContent || '—'}</Text>
            <Text format={{ fontWeight: 'demibold' }}>utm_term</Text>
            <Text variant="microcopy">{form.utm_term || '—'}</Text>
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
