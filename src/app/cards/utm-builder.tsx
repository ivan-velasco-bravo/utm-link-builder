import {
  Button,
  Flex,
  Input,
  Select,
  Text,
  Alert,
  LoadingSpinner,
  Divider,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';
import { hubspot } from '@hubspot/ui-extensions';
import { useState, useEffect } from 'react';

export const HomePage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [sourceOptions, setSourceOptions] = useState<{label: string, value: string}[]>([]);
  const [mediumOptions, setMediumOptions] = useState<{label: string, value: string}[]>([]);
  const [placementOptions, setPlacementOptions] = useState<{label: string, value: string}[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<{label: string, value: string}[]>([]);

  const [form, setForm] = useState({
    content_piece_name: '',
    destination_url: '',
    utm_campaign: '',
    utm_source: '',
    utm_medium: '',
    utm_content: '',
    utm_term: '',
    link_placement: '',
    campaign_id: '',
  });

  const [taggedUrl, setTaggedUrl] = useState('');

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    buildTaggedUrl();
  }, [form.destination_url, form.utm_source, form.utm_medium, form.utm_campaign, form.utm_content, form.utm_term]);

  const loadOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sourceRes, mediumRes, placementRes, campaignsRes] = await Promise.all([
        hubspot.fetch('https://api.hubapi.com/crm/v3/properties/2-203776196/utm_source'),
        hubspot.fetch('https://api.hubapi.com/crm/v3/properties/2-203776196/utm_medium'),
        hubspot.fetch('https://api.hubapi.com/crm/v3/properties/2-203776196/link_placement'),
        hubspot.fetch('https://api.hubapi.com/marketing/v3/campaigns/?limit=100'),
      ]);

      const [sourceData, mediumData, placementData, campaignsData] = await Promise.all([
        sourceRes.json(),
        mediumRes.json(),
        placementRes.json(),
        campaignsRes.json(),
      ]);

      setSourceOptions(sourceData.options.map((o: any) => ({ label: o.label, value: o.value })));
      setMediumOptions(mediumData.options.map((o: any) => ({ label: o.label, value: o.value })));
      setPlacementOptions(placementData.options.map((o: any) => ({ label: o.label, value: o.value })));
      setCampaignOptions((campaignsData.results || []).map((c: any) => ({
        label: c.properties?.hs_name || c.id,
        value: c.id,
      })));
    } catch (e) {
      setError('Failed to load options. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const buildTaggedUrl = () => {
    if (!form.destination_url) {
      setTaggedUrl('');
      return;
    }
    try {
      const url = new URL(form.destination_url);
      if (form.utm_source) url.searchParams.set('utm_source', form.utm_source);
      if (form.utm_medium) url.searchParams.set('utm_medium', form.utm_medium);
      if (form.utm_campaign) url.searchParams.set('utm_campaign', form.utm_campaign);
      if (form.utm_content) url.searchParams.set('utm_content', form.utm_content);
      if (form.utm_term) url.searchParams.set('utm_term', form.utm_term);
      setTaggedUrl(url.toString());
    } catch {
      setTaggedUrl('');
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!form.content_piece_name || !form.destination_url || !form.utm_source || !form.utm_medium) {
      setError('Content Piece Name, Destination URL, Source and Medium are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const properties: Record<string, string> = {
        content_piece_name: form.content_piece_name,
        destination_url: form.destination_url,
        utm_campaign: form.utm_campaign,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_content: form.utm_content,
        utm_term: form.utm_term,
        link_placement: form.link_placement,
        tagged_url: taggedUrl,
      };

      const createRes = await hubspot.fetch('https://api.hubapi.com/crm/v3/objects/2-203776196', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties }),
      });

      if (!createRes.ok) throw new Error('Failed to create UTM Link record');

      const created = await createRes.json();

      if (form.campaign_id && created.id) {
        await hubspot.fetch(
          `https://api.hubapi.com/crm/v4/objects/2-203776196/${created.id}/associations/campaigns/${form.campaign_id}`,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]) }
        );
      }

      setSuccess(true);
      setForm(prev => ({
        content_piece_name: '',
        destination_url: '',
        utm_campaign: '',
        utm_source: '',
        utm_medium: '',
        utm_content: '',
        utm_term: '',
        link_placement: '',
        campaign_id: prev.campaign_id,
      }));
      setTaggedUrl('');
    } catch (e) {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading UTM Builder..." />;

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>UTM Builder</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>UTM Link Builder</PageTitle>

      <Flex direction="column" gap="medium">

        {error && <Alert title="Error" variant="error">{error}</Alert>}
        {success && <Alert title="Saved!" variant="success">UTM Link created and associated to campaign.</Alert>}

        <Select
          label="Campaign"
          name="campaign_id"
          value={form.campaign_id}
          onChange={val => handleChange('campaign_id', val)}
          options={campaignOptions}
          placeholder="Select a campaign..."
        />

        <Input
          label="Content Piece Name"
          name="content_piece_name"
          value={form.content_piece_name}
          onChange={val => handleChange('content_piece_name', val)}
          placeholder="e.g. LinkedIn post - June product launch"
        />

        <Input
          label="Destination URL"
          name="destination_url"
          value={form.destination_url}
          onChange={val => handleChange('destination_url', val)}
          placeholder="https://runware.ai/..."
        />

        <Flex direction="row" gap="small">
          <Select
            label="UTM Source"
            name="utm_source"
            value={form.utm_source}
            onChange={val => handleChange('utm_source', val)}
            options={sourceOptions}
            placeholder="Select source..."
          />
          <Select
            label="UTM Medium"
            name="utm_medium"
            value={form.utm_medium}
            onChange={val => handleChange('utm_medium', val)}
            options={mediumOptions}
            placeholder="Select medium..."
          />
        </Flex>

        <Input
          label="UTM Campaign"
          name="utm_campaign"
          value={form.utm_campaign}
          onChange={val => handleChange('utm_campaign', val)}
          placeholder="e.g. june-product-launch"
        />

        <Flex direction="row" gap="small">
          <Input
            label="UTM Content"
            name="utm_content"
            value={form.utm_content}
            onChange={val => handleChange('utm_content', val)}
            placeholder="e.g. hero-banner"
          />
          <Input
            label="UTM Term"
            name="utm_term"
            value={form.utm_term}
            onChange={val => handleChange('utm_term', val)}
            placeholder="e.g. image-api"
          />
        </Flex>

        <Select
          label="Link Placement"
          name="link_placement"
          value={form.link_placement}
          onChange={val => handleChange('link_placement', val)}
          options={placementOptions}
          placeholder="Select placement..."
        />

        {taggedUrl ? (
          <>
            <Divider />
            <Text format={{ fontWeight: 'bold' }}>Generated URL</Text>
            <Text>{taggedUrl}</Text>
            <Button
              onClick={() => hubspot.copyTextToClipboard(taggedUrl)}
              variant="secondary"
            >
              Copy to Clipboard
            </Button>
          </>
        ) : null}

        <Divider />

        <Button
          onClick={handleSave}
          variant="primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save UTM Link'}
        </Button>

      </Flex>
    </>
  );
};
