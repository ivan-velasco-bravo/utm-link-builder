import React from 'react';
import {
  Button,
  Divider,
  Flex,
  Text,
  Alert,
  LoadingSpinner,
  Textarea,
  hubspot,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';
import { useState, useEffect } from 'react';

const DEFAULT_PARAMS: ParamDef[] = [
  {
    key: 'utm_source',
    label: 'UTM Source',
    description: 'The website or platform where the link is placed — identifies the origin of the traffic.',
    example: 'linkedin, google, hubspot, youtube',
  },
  {
    key: 'utm_medium',
    label: 'UTM Medium',
    description: 'The marketing channel type used to deliver the traffic.',
    example: 'paid-social, mkt-emails, paid-search',
  },
  {
    key: 'utm_campaign',
    label: 'UTM Campaign',
    description: 'The campaign identifier, including the activation month and campaign name.',
    example: 'YYYY-MM_campaign-name',
  },
  {
    key: 'utm_content',
    label: 'UTM Content',
    description: 'The activation date combined with the specific content asset identifier (post, ad, email, creative).',
    example: 'YYYY-MM-DD_content-asset-name',
  },
  {
    key: 'utm_term',
    label: 'UTM Term',
    description: 'The placement within the platform (feed, story, link position, ad group, match type).',
    example: 'feed, story, link-placement, ad-group',
  },
  {
    key: 'utm_topic',
    label: 'UTM Topic',
    description: 'The AI model or theme associated with the campaign. Custom GA4 dimension.',
    example: 'flux-1, sdxl, model-announcement',
  },
];

interface FieldOption {
  label: string;
  value: string;
}

interface ParamDef {
  key: string;
  label: string;
  description: string;
  example: string;
}

interface Definitions {
  params: Record<string, { description: string; example: string }>;
  sources: Record<string, string>;
  mediums: Record<string, string>;
}

const callFn = (action: string, params?: any): Promise<any> =>
  hubspot.serverless('utm_builder_app_function', { parameters: { action, params } });

// Column widths — consistent across all sections
const COL_LABEL = '160px';
const COL_SLUG  = '160px';
const COL_EX    = '200px';

export const DefinitionsPage = () => {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
  const [isAdmin, setIsAdmin]   = useState(false);

  const [sources, setSources]   = useState<FieldOption[]>([]);
  const [mediums, setMediums]   = useState<FieldOption[]>([]);
  const [params]                = useState<ParamDef[]>(DEFAULT_PARAMS);

  const [defs, setDefs]   = useState<Definitions>({ params: {}, sources: {}, mediums: {} });
  const [draft, setDraft] = useState<Definitions>({ params: {}, sources: {}, mediums: {} });

  useEffect(() => { loadAll(); }, []);

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

      const liveSources: FieldOption[] = config?.fieldValues?.sources || [];
      const liveMediums: FieldOption[] = config?.fieldValues?.mediums || [];
      setSources(liveSources);
      setMediums(liveMediums);

      const saved: Definitions = config?.definitionsCurrent || { params: {}, sources: {}, mediums: {} };

      const mergedParams: Record<string, { description: string; example: string }> = {};
      for (const p of DEFAULT_PARAMS) {
        mergedParams[p.key] = saved.params?.[p.key] || { description: p.description, example: p.example };
      }

      const mergedSources: Record<string, string> = {};
      for (const s of liveSources) {
        mergedSources[s.value] = saved.sources?.[s.value] || '';
      }
      const mergedMediums: Record<string, string> = {};
      for (const m of liveMediums) {
        mergedMediums[m.value] = saved.mediums?.[m.value] || '';
      }

      const merged: Definitions = { params: mergedParams, sources: mergedSources, mediums: mergedMediums };
      setDefs(merged);
      setDraft(JSON.parse(JSON.stringify(merged)));
    } catch (e) {
      setError('Failed to load definitions.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setDraft(JSON.parse(JSON.stringify(defs)));
    setEditMode(true);
    setSuccess(false);
    setError(null);
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(defs)));
    setEditMode(false);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await callFn('saveDefinitions', { definitions: draft });
      if (result?.error) throw new Error(result.error);
      setDefs(JSON.parse(JSON.stringify(draft)));
      setEditMode(false);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save definitions.');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await callFn('syncFieldValues');
      if (result?.error) throw new Error(result.error);
      await loadAll();
    } catch (e) {
      setError('Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const updateDraftParam  = (key: string, field: 'description' | 'example', value: string) =>
    setDraft(prev => ({ ...prev, params: { ...prev.params, [key]: { ...prev.params[key], [field]: value } } }));

  const updateDraftSource = (key: string, value: string) =>
    setDraft(prev => ({ ...prev, sources: { ...prev.sources, [key]: value } }));

  const updateDraftMedium = (key: string, value: string) =>
    setDraft(prev => ({ ...prev, mediums: { ...prev.mediums, [key]: value } }));

  if (loading) return <LoadingSpinner label="Loading definitions..." />;

  const editable = isAdmin;
  const rowBg    = (i: number): Record<string, string> => ({
    padding: '8px 4px',
    background: i % 2 === 0 ? '#f5f8fa' : '#ffffff',
  });
  const editCellStyle: Record<string, string> = {
    background: '#edf4ff',
    border: '1px solid #b3d4ff',
    borderRadius: '4px',
    padding: '4px 6px',
  };

  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Term & Value Definitions</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Term & Value Definitions</PageTitle>

      <Flex direction="column" gap="large">
        <Text variant="microcopy">
          This page documents the meaning, format, and expected values for every UTM field used in Runware campaigns. Use it as a reference when building links or onboarding new team members. Admins can edit descriptions and examples directly — labels are always synced from HubSpot property values.
        </Text>

        {error   && <Alert title="Error"  variant="error"  >{error}</Alert>}
        {success && <Alert title="Saved!" variant="success">Definitions updated successfully.</Alert>}

        {/* Action buttons */}
        <Flex direction="row" gap="small">
          {editable && !editMode && (
            <Button onClick={handleEdit} variant="primary">Edit definitions</Button>
          )}
          {editMode && (
            <>
              <Button onClick={handleSave} variant="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save definitions'}
              </Button>
              <Button onClick={handleCancel} variant="secondary" disabled={saving}>
                Cancel
              </Button>
            </>
          )}
          {editable && (
            <Button onClick={handleSync} variant="secondary" disabled={syncing || editMode}>
              {syncing ? 'Syncing...' : 'Sync field values'}
            </Button>
          )}
        </Flex>

        {/* ── Runware UTM Parameters Structure ── */}
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: 'bold' }}>Runware UTM Parameters Structure</Text>

          {/* Header */}
          <Flex direction="row" gap="none" style={{ padding: '4px 4px' }}>
            <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
              <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Parameter</Text>
            </Flex>
            <Flex style={{ minWidth: COL_EX, width: COL_EX }}>
              <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Format / Example</Text>
            </Flex>
            <Flex style={{ flex: 1 }}>
              <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Description</Text>
            </Flex>
          </Flex>
          <Divider />

          {params.map((p, i) => (
            <React.Fragment key={p.key}>
              {i > 0 && <Divider />}
              <Flex direction="row" gap="none" style={rowBg(i)}>
                <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
                  <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{p.label}</Text>
                </Flex>
                <Flex style={{ minWidth: COL_EX, width: COL_EX }}>
                  {editMode ? (
                    <Flex style={editCellStyle}>
                      <Input
                        name={`param_ex_${p.key}`}
                        value={draft.params[p.key]?.example || ''}
                        onChange={(v) => updateDraftParam(p.key, 'example', v)}
                        placeholder="Format / example..."
                      />
                    </Flex>
                  ) : (
                    <Text variant="microcopy" format={{ fontStyle: 'italic' }}>
                      {defs.params[p.key]?.example || p.example}
                    </Text>
                  )}
                </Flex>
                <Flex style={{ flex: 1 }}>
                  {editMode ? (
                    <Flex style={editCellStyle}>
                      <Textarea
                        name={`param_desc_${p.key}`}
                        value={draft.params[p.key]?.description || ''}
                        onChange={(v) => updateDraftParam(p.key, 'description', v)}
                        placeholder="Description..."
                      
  rows={2}
/>
                    </Flex>
                  ) : (
                    <Text variant="microcopy">{defs.params[p.key]?.description || p.description}</Text>
                  )}
                </Flex>
              </Flex>
            </React.Fragment>
          ))}
        </Flex>

        {/* ── Source Definitions ── */}
        {sources.length > 0 && (
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>Source Definitions</Text>

            <Flex direction="row" gap="none" style={{ padding: '4px 4px' }}>
              <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Label</Text>
              </Flex>
              <Flex style={{ minWidth: COL_SLUG, width: COL_SLUG }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>URL Slug</Text>
              </Flex>
              <Flex style={{ flex: 1 }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Description</Text>
              </Flex>
            </Flex>
            <Divider />

            {sources.map((s, i) => (
              <React.Fragment key={s.value}>
                {i > 0 && <Divider />}
                <Flex direction="row" gap="none" style={rowBg(i)}>
                  <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
                    <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{s.label}</Text>
                  </Flex>
                  <Flex style={{ minWidth: COL_SLUG, width: COL_SLUG }}>
                    <Text variant="microcopy" format={{ fontStyle: 'italic' }}>{s.value}</Text>
                  </Flex>
                  <Flex style={{ flex: 1 }}>
                    {editMode ? (
                      <Flex style={editCellStyle}>
                        <Textarea
                          name={`source_${s.value}`}
                          value={draft.sources[s.value] || ''}
                          onChange={(v) => updateDraftSource(s.value, v)}
                          placeholder="Describe this source..."
                        
  rows={2}
/>
                      </Flex>
                    ) : (
                      <Text variant="microcopy">{defs.sources[s.value] || '—'}</Text>
                    )}
                  </Flex>
                </Flex>
              </React.Fragment>
            ))}
          </Flex>
        )}

        {/* ── Medium Definitions ── */}
        {mediums.length > 0 && (
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>Medium Definitions</Text>

            <Flex direction="row" gap="none" style={{ padding: '4px 4px' }}>
              <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Label</Text>
              </Flex>
              <Flex style={{ minWidth: COL_SLUG, width: COL_SLUG }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>URL Slug</Text>
              </Flex>
              <Flex style={{ flex: 1 }}>
                <Text variant="microcopy" format={{ fontWeight: 'bold' }}>Description</Text>
              </Flex>
            </Flex>
            <Divider />

            {mediums.map((m, i) => (
              <React.Fragment key={m.value}>
                {i > 0 && <Divider />}
                <Flex direction="row" gap="none" style={rowBg(i)}>
                  <Flex style={{ minWidth: COL_LABEL, width: COL_LABEL }}>
                    <Text variant="microcopy" format={{ fontWeight: 'demibold' }}>{m.label}</Text>
                  </Flex>
                  <Flex style={{ minWidth: COL_SLUG, width: COL_SLUG }}>
                    <Text variant="microcopy" format={{ fontStyle: 'italic' }}>{m.value}</Text>
                  </Flex>
                  <Flex style={{ flex: 1 }}>
                    {editMode ? (
                      <Flex style={editCellStyle}>
                        <Textarea
                          name={`medium_${m.value}`}
                          value={draft.mediums[m.value] || ''}
                          onChange={(v) => updateDraftMedium(m.value, v)}
                          placeholder="Describe this medium..."
                        
  rows={2}
/>
                      </Flex>
                    ) : (
                      <Text variant="microcopy">{defs.mediums[m.value] || '—'}</Text>
                    )}
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
