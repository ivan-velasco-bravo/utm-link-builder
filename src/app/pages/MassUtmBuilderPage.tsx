import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  DateInput,
  DescriptionList,
  DescriptionListItem,
  Divider,
  Flex,
  Input,
  Link,
  LoadingSpinner,
  Select,
  Text,
  hubspot,
  useExtensionContext,
  useExtensionActions,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';
import { useEffect, useState } from 'react';
import { DEFAULT_MAP } from './RulesPage.tsx';

const SLUG_REGEX = /^[a-z0-9][a-z0-9\-_]*[a-z0-9]$|^[a-z0-9]$/;

interface DateInputValue {
  year: number;
  month: number;
  date: number;
}

interface FieldOption {
  label: string;
  value: string;
}

interface CampaignOption {
  label: string;
  value: string;
  baseUtm: string;
  utm: string;
  activationMonth: string;
}

interface LinkRow {
  id: string;
  destination_url: string;
  content_activation_date: string;
  utm_source: string;
  use_source_website: boolean;
  source_website: string;
  utm_medium: string;
  content_piece_name: string;
  utm_topic: string;
  link_placement: string;
  utm_term: string;
}

function isValidSlug(val: string): boolean {
  return SLUG_REGEX.test(val);
}

function toSlug(val: string): string {
  return val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
}

function toWebsiteSource(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\s+/g, '-');
}

function isValidUrl(val: string): boolean {
  if (!val) return false;
  try {
    const normalized = val.startsWith('http') ? val : 'https://' + val;
    const url = new URL(normalized);
    const parts = url.hostname.split('.');
    return parts.length >= 2 && parts[parts.length - 1].length >= 2;
  } catch {
    return false;
  }
}

function normalizeUrl(val: string): string {
  if (!val) return '';
  return val.startsWith('http') ? val : 'https://' + val;
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

function toHubSpotDateValue(val: string): string {
  const parts = parseDateParts(val);
  if (!parts) return '';
  return String(Date.UTC(parts.year, parts.month - 1, parts.day));
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

function buildCampaignUtm(activationMonth: string, baseUtm: string): string {
  if (!baseUtm) return '';
  if (!activationMonth) return baseUtm;
  if (baseUtm.startsWith(`${activationMonth}-`)) return baseUtm;
  return `${activationMonth}-${baseUtm.replace(/^\d{4}-\d{2}[_-]/, '')}`;
}

function createEmptyRow(): LinkRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  };
}

function getRowSource(row: LinkRow): string {
  return row.use_source_website ? toWebsiteSource(row.source_website) : row.utm_source;
}

function getRowUtmContent(row: LinkRow): string {
  return row.content_activation_date && row.content_piece_name
    ? `${row.content_activation_date}_${row.content_piece_name}${row.link_placement ? '_' + row.link_placement : ''}`
    : '';
}

function buildTaggedUrl(row: LinkRow, campaignUtm: string): string {
  const source = getRowSource(row);
  const utmContent = getRowUtmContent(row);

  if (!row.destination_url || !source || !row.utm_medium || !campaignUtm || !utmContent || !row.utm_topic) return '';
  if (!isValidUrl(row.destination_url) || !isValidIsoDate(row.content_activation_date)) return '';

  try {
    const url = new URL(normalizeUrl(row.destination_url));
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', row.utm_medium);
    url.searchParams.set('utm_campaign', campaignUtm);
    url.searchParams.set('utm_content', utmContent);
    if (row.utm_term) url.searchParams.set('utm_term', row.utm_term);
    url.searchParams.set('utm_topic', row.utm_topic);
    return url.toString();
  } catch {
    return '';
  }
}

function buildCampaignUrl(portalId: number, campaignId: string): string {
  return `https://app-eu1.hubspot.com/marketing/${portalId}/campaigns/${encodeURIComponent(campaignId)}`;
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

export const MassUtmBuilderPage = () => {
  const actions = useExtensionActions();
  const context = useExtensionContext<'pages'>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceMediumMap, setSourceMediumMap] = useState<Record<string, string[]>>(DEFAULT_MAP);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sourceOptions, setSourceOptions] = useState<FieldOption[]>([]);
  const [mediumOptions, setMediumOptions] = useState<FieldOption[]>([]);
  const [placementOptions, setPlacementOptions] = useState<FieldOption[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);

  const [campaignId, setCampaignId] = useState('');
  const [campaignUtm, setCampaignUtm] = useState('');
  const [campaignActivationMonth, setCampaignActivationMonth] = useState('');
  const [rows, setRows] = useState<LinkRow[]>([createEmptyRow()]);

  const selectedCampaign = campaignOptions.find(campaign => campaign.value === campaignId);
  const campaignUtmWarning = getCampaignUtmWarning(selectedCampaign);
  const campaignUrl = campaignId && context.portal?.id ? buildCampaignUrl(context.portal.id, campaignId) : '';

  useEffect(() => {
    loadStoredMap();
    loadOptions();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadStoredMap, 30000);
    return () => clearInterval(interval);
  }, []);

  const callFn = async (action: string, params?: any): Promise<any> => {
    const result = await hubspot.serverless('utm_builder_app_function', {
      parameters: { action, params },
    });
    return result;
  };

  const loadStoredMap = async () => {
    try {
      const result = await hubspot.serverless('utm_builder_app_function', {
        parameters: { action: 'getMap' },
      });
      if (result.map) setSourceMediumMap(result.map);
    } catch {
      // Use default map.
    }
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
        ...optionsData.placementOptions.map((o: any) => ({ label: o.label, value: o.value })),
      ]);

      const campaignsData = await callFn('getCampaignsWithStartDate');
      if (campaignsData.error) throw new Error(`Campaigns error: ${campaignsData.error}`);

      const campaigns = (campaignsData.campaigns || [])
        .filter((c: any) => {
          const status = (c.properties?.hs_campaign_status || '').toLowerCase();
          return status !== 'completed' && status !== 'cancelled';
        })
        .map((c: any) => ({
          label: c.properties?.hs_name || `Campaign ${c.id}`,
          value: c.id,
          baseUtm: decodeURIComponent(c.properties?.hs_utm || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]+/g, '').replace(/^-|-$/g, ''),
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

  const updateRow = (id: string, updates: Partial<LinkRow>) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...updates } : row));
    setSuccess(null);
    setError(null);
  };

  const handleRowChange = (id: string, field: keyof LinkRow, value: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;

    if (field === 'utm_source') {
      const validMediums = sourceMediumMap[value] || [];
      updateRow(id, {
        utm_source: value,
        utm_medium: row.utm_medium && !validMediums.includes(row.utm_medium) ? '' : row.utm_medium,
      });
      return;
    }

    if (field === 'content_piece_name' || field === 'utm_topic') {
      updateRow(id, { [field]: toSlug(value) } as Partial<LinkRow>);
      return;
    }

    updateRow(id, { [field]: value } as Partial<LinkRow>);
  };

  const handleRowDateChange = (id: string, val: DateInputValue | null) => {
    if (!val) {
      updateRow(id, { content_activation_date: '' });
      return;
    }

    updateRow(id, { content_activation_date: `${val.year}-${pad2(val.month + 1)}-${pad2(val.date)}` });
  };

  const handleWebsiteSourceToggle = (id: string, checked: boolean) => {
    updateRow(id, {
      use_source_website: checked,
      utm_source: checked ? '' : rows.find(row => row.id === id)?.utm_source || '',
    });
  };

  const handleCampaignChange = (value: string) => {
    const campaign = campaignOptions.find(c => c.value === value);
    setCampaignId(value);
    setCampaignUtm(campaign?.utm || '');
    setCampaignActivationMonth(campaign?.activationMonth || '');
    setSuccess(null);
    setError(null);
  };

  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
    setSuccess(null);
    setError(null);
  };

  const cloneRow = (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;

    const clone = { ...row, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    const index = rows.findIndex(r => r.id === id);
    setRows(prev => [
      ...prev.slice(0, index + 1),
      clone,
      ...prev.slice(index + 1),
    ]);
    setSuccess(null);
    setError(null);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.length === 1 ? [createEmptyRow()] : prev.filter(row => row.id !== id));
    setSuccess(null);
    setError(null);
  };

  const getFilteredMediumOptions = (row: LinkRow): FieldOption[] => {
    if (row.use_source_website) return mediumOptions;
    return row.utm_source && sourceMediumMap[row.utm_source]
      ? mediumOptions.filter(option => sourceMediumMap[row.utm_source].includes(option.value))
      : mediumOptions;
  };

  const validateRows = (): string | null => {
    if (!campaignId) return 'Please select a campaign.';
    if (!campaignUtm) return 'Selected campaign must have a Campaign UTM value.';

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const label = `Link ${index + 1}`;

      if (!row.destination_url) return `${label}: Destination URL is required.`;
      if (!isValidUrl(row.destination_url)) return `${label}: Enter a valid Destination URL.`;
      if (!row.content_activation_date) return `${label}: Content Activation Date is required.`;
      if (!isValidIsoDate(row.content_activation_date)) return `${label}: Content Activation Date must use YYYY-MM-DD.`;
      if (row.use_source_website) {
        if (!getRowSource(row)) return `${label}: Source Website is required.`;
      } else if (!row.utm_source) return `${label}: UTM Source is required.`;
      if (!row.utm_medium) return `${label}: UTM Medium is required.`;
      if (!row.content_piece_name) return `${label}: Content Piece Name is required.`;
      if (!isValidSlug(row.content_piece_name)) return `${label}: Content Piece Name must be lowercase with no spaces.`;
      if (!row.utm_topic) return `${label}: UTM Topic is required.`;
      if (!isValidSlug(row.utm_topic)) return `${label}: UTM Topic must be lowercase with no spaces.`;
      if (!buildTaggedUrl(row, campaignUtm)) return `${label}: Complete all required fields to generate a tagged URL.`;
    }

    return null;
  };

  const buildProperties = (row: LinkRow): Record<string, string> => {
    const properties: Record<string, string> = {
      content_piece_name: row.content_piece_name,
      destination_url: normalizeUrl(row.destination_url),
      content_activation_date: toHubSpotDateValue(row.content_activation_date),
      utm_medium: row.utm_medium,
      utm_campaign: campaignUtm,
      utm_content: getRowUtmContent(row),
      utm_topic: row.utm_topic,
      tagged_url: buildTaggedUrl(row, campaignUtm),
    };

    if (row.use_source_website) {
      properties.source_website = getRowSource(row);
    } else {
      properties.utm_source = row.utm_source;
    }
    if (row.link_placement) properties.link_placement = row.link_placement;
    if (row.utm_term) properties.utm_term = row.utm_term;

    return properties;
  };

  const handleSaveAll = async () => {
    const validationError = validateRows();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const items = rows.map(row => ({ properties: buildProperties(row) }));
      const result = await callFn('createUtmLinks', { items, campaignId });
      if (result.error) throw new Error(result.error);

      const count = result.created?.length || items.length;
      setSuccess(`${count} UTM Link record${count === 1 ? '' : 's'} created and associated with campaign.`);
      setRows([createEmptyRow()]);
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyTaggedUrl = (taggedUrl: string) => {
    if (!taggedUrl) return;
    actions.copyTextToClipboard(taggedUrl);
    actions.addAlert({ type: 'SUCCESS', message: 'Tagged URL copied to clipboard!' });
  };

  if (loading) return <LoadingSpinner label="Loading Mass UTM Builder..." />;

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Mass UTM Builder</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Mass UTM Builder</PageTitle>

      <Flex direction="column" gap="medium">
        {error && <Alert title="Error" variant="error">{error}</Alert>}
        {success && <Alert title="Saved!" variant="success">{success}</Alert>}

        <Flex direction="row" gap="small" align="end">
          <Box flex={1}>
            <Select label="Campaign" name="campaign_id" value={campaignId} onChange={value => handleCampaignChange(String(value))} options={campaignOptions} placeholder="Search campaigns..." required />
          </Box>
          {campaignUrl && (
            <Box flex="none">
              <Link href={{ url: campaignUrl, external: true }}>Open Campaign</Link>
            </Box>
          )}
        </Flex>
        {campaignActivationMonth && <Text format={{ fontWeight: 'demibold' }}>activation month: {campaignActivationMonth}</Text>}
        {campaignUtm && <Text format={{ fontWeight: 'demibold' }}>utm_campaign: {campaignUtm}</Text>}
        {campaignUtmWarning && (
          <Alert title="Campaign UTM format warning" variant="warning">
            {campaignUtmWarning}
          </Alert>
        )}

        <Divider />

        <Flex direction="row" gap="small">
          <Button onClick={addRow} variant="secondary">Add link</Button>
          <Button onClick={handleSaveAll} variant="primary" disabled={saving || rows.length === 0}>{saving ? 'Saving...' : `Save ${rows.length} link${rows.length === 1 ? '' : 's'}`}</Button>
        </Flex>

        {rows.map((row, index) => {
          const taggedUrl = buildTaggedUrl(row, campaignUtm);
          const selectedSource = getRowSource(row);
          const mediumPlaceholder = row.use_source_website || row.utm_source ? 'Select medium...' : 'Select source first...';

          return (
            <Card key={row.id}>
              <Flex direction="column" gap="medium">
                <Flex direction="row" gap="small" justify="between" align="center">
                  <Text format={{ fontWeight: 'bold' }}>Link {index + 1}</Text>
                  <Flex direction="row" gap="small">
                    <Button onClick={() => cloneRow(row.id)} variant="secondary">Clone</Button>
                    <Button onClick={() => removeRow(row.id)} variant="secondary">Remove</Button>
                  </Flex>
                </Flex>

                <Flex direction="row" gap="large" wrap="wrap">
                  <Box flex={2}>
                    <Flex direction="column" gap="medium">
                      <Flex direction="column" gap="small">
                        <Text format={{ fontWeight: 'demibold' }}>Source</Text>
                        <Checkbox
                          name={`website_source_${row.id}`}
                          value="website_source"
                          checked={row.use_source_website}
                          onChange={checked => handleWebsiteSourceToggle(row.id, checked)}
                        >
                          Website Source
                        </Checkbox>
                        <Flex direction="row" gap="small">
                          <Select
                            label="UTM Source"
                            name={`utm_source_${row.id}`}
                            value={row.utm_source}
                            onChange={value => handleRowChange(row.id, 'utm_source', String(value))}
                            options={sourceOptions}
                            placeholder={row.use_source_website ? 'Using source website...' : 'Select source...'}
                            required={!row.use_source_website}
                            readOnly={row.use_source_website}
                          />
                          {row.use_source_website && (
                            <Input
                              label="Source Website"
                              name={`source_website_${row.id}`}
                              value={row.source_website}
                              onChange={value => handleRowChange(row.id, 'source_website', value)}
                              placeholder="e.g. partner-site.com"
                              required
                              validationMessage={selectedSource ? `utm_source=${selectedSource}` : undefined}
                            />
                          )}
                          <Select
                            label="UTM Medium"
                            name={`utm_medium_${row.id}`}
                            value={row.utm_medium}
                            onChange={value => handleRowChange(row.id, 'utm_medium', String(value))}
                            options={getFilteredMediumOptions(row)}
                            placeholder={mediumPlaceholder}
                            required
                          />
                        </Flex>
                      </Flex>

                      <Flex direction="column" gap="small">
                        <Text format={{ fontWeight: 'demibold' }}>Classification</Text>
                        <Flex direction="row" gap="small">
                          <Input
                            label="UTM Topic"
                            name={`utm_topic_${row.id}`}
                            value={row.utm_topic}
                            onChange={value => handleRowChange(row.id, 'utm_topic', value)}
                            placeholder="e.g. model-theme"
                            required
                            error={!!row.utm_topic && !isValidSlug(row.utm_topic)}
                            validationMessage="Lowercase, no spaces."
                          />
                          <Input
                            label="UTM Term"
                            name={`utm_term_${row.id}`}
                            value={row.utm_term}
                            onChange={value => handleRowChange(row.id, 'utm_term', toSlug(value).slice(0, 20))}
                            placeholder="e.g. ai-image-generation"
                            validationMessage={`Max 20 characters. ${row.utm_term.length > 0 ? `${row.utm_term.length}/20` : ''}`}
                          />
                        </Flex>
                      </Flex>

                      <Flex direction="column" gap="small">
                        <Text format={{ fontWeight: 'demibold' }}>Content</Text>
                        <Flex direction="row" gap="small">
                          <DateInput
                            label="Content Activation Date"
                            name={`content_activation_date_${row.id}`}
                            value={toDateInputValue(row.content_activation_date) || undefined}
                            onChange={value => handleRowDateChange(row.id, value)}
                            format="YYYY-MM-DD"
                            clearButtonLabel="Clear"
                            todayButtonLabel="Today"
                            required
                            validationMessage="Used as the date prefix for utm_content."
                          />
                          <Input
                            label="Content Piece Name"
                            name={`content_piece_name_${row.id}`}
                            value={row.content_piece_name}
                            onChange={value => handleRowChange(row.id, 'content_piece_name', value)}
                            placeholder="e.g. q3-brand-video"
                            required
                            error={!!row.content_piece_name && !isValidSlug(row.content_piece_name)}
                            validationMessage="Lowercase, no spaces. Combined with placement to form utm_content."
                          />
                          <Select
                            label="Link Placement"
                            name={`link_placement_${row.id}`}
                            value={row.link_placement}
                            onChange={value => handleRowChange(row.id, 'link_placement', String(value))}
                            options={placementOptions}
                            placeholder="Select placement..."
                          />
                        </Flex>
                      </Flex>
                    </Flex>
                  </Box>

                  <Box flex={1}>
                    <Flex direction="column" gap="small">
                      <Input
                        label="Destination URL"
                        name={`destination_url_${row.id}`}
                        value={row.destination_url}
                        onChange={value => handleRowChange(row.id, 'destination_url', value)}
                        placeholder="runware.ai/pricing"
                        required
                      />

                      <Divider />

                      <Text format={{ fontWeight: 'demibold' }}>UTM Preview</Text>
                      <DescriptionList direction="column">
                        <DescriptionListItem label="utm_source">{selectedSource || '-'}</DescriptionListItem>
                        <DescriptionListItem label="utm_medium">{row.utm_medium || '-'}</DescriptionListItem>
                        <DescriptionListItem label="utm_campaign">{campaignUtm || '-'}</DescriptionListItem>
                        <DescriptionListItem label="utm_content">{getRowUtmContent(row) || '-'}</DescriptionListItem>
                        <DescriptionListItem label="utm_term">{row.utm_term || '-'}</DescriptionListItem>
                        <DescriptionListItem label="utm_topic">{row.utm_topic || '-'}</DescriptionListItem>
                      </DescriptionList>

                      <Text format={{ fontWeight: 'demibold' }}>Tagged URL</Text>
                      {taggedUrl ? (
                        <Text truncate={{ tooltipText: taggedUrl }}>{taggedUrl}</Text>
                      ) : (
                        <Text variant="microcopy">Fill in required fields to generate this URL.</Text>
                      )}
                      <Button onClick={() => handleCopyTaggedUrl(taggedUrl)} variant="secondary" disabled={!taggedUrl}>Copy URL</Button>
                    </Flex>
                  </Box>
                </Flex>
              </Flex>
            </Card>
          );
        })}

        <Divider />

        <Flex direction="row" gap="small">
          <Button onClick={addRow} variant="secondary">Add link</Button>
          <Button onClick={handleSaveAll} variant="primary" disabled={saving || rows.length === 0}>{saving ? 'Saving...' : `Save ${rows.length} link${rows.length === 1 ? '' : 's'}`}</Button>
        </Flex>
      </Flex>
    </>
  );
};
