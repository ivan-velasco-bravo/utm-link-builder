const https = require('https');

const HUBDB_TABLE_ID = '2694996157';
const UTM_LINK_OBJECT_TYPE = '2-203776196';

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path, method,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function findCampaignStartDateProperty(properties) {
  const byName = new Map((properties || []).map(p => [p.name, p]));
  const preferredNames = [
    'hs_start_date',
    'hs_campaign_start_date',
    'campaign_start_date',
    'start_date',
  ];

  for (const name of preferredNames) {
    if (byName.has(name)) return name;
  }

  const exactLabel = (properties || []).find(p => (p.label || '').toLowerCase() === 'campaign start date');
  if (exactLabel) return exactLabel.name;

  const startDate = (properties || []).find(p => {
    const label = (p.label || '').toLowerCase();
    return label.includes('start date') && (p.type === 'date' || p.type === 'datetime');
  });
  return startDate?.name || null;
}

function formatApiError(prefix, status, data) {
  const details = [];

  if (data && typeof data === 'object') {
    if (data.message) details.push(data.message);

    if (Array.isArray(data.errors)) {
      data.errors.forEach(error => {
        const propertyName = error?.context?.propertyName?.[0];
        const message = error?.message || error?.error || '';
        if (propertyName && message) details.push(`${propertyName}: ${message}`);
        else if (message) details.push(message);
      });
    }

    if (Array.isArray(data.validationResults)) {
      data.validationResults.forEach(result => {
        const name = result?.name || result?.propertyName || result?.field || 'field';
        const message = result?.message || result?.error || JSON.stringify(result);
        details.push(`${name}: ${message}`);
      });
    }
  }

  if (details.length === 0) {
    details.push(typeof data === 'string' ? data : JSON.stringify(data));
  }

  return `${prefix} ${status}: ${details.join(' | ')}`.slice(0, 1200);
}

async function findExistingUtmLink(contentPieceName, token) {
  if (!contentPieceName) return null;

  const r = await apiRequest('POST', `/crm/v3/objects/${UTM_LINK_OBJECT_TYPE}/search`, {
    filterGroups: [{
      filters: [{
        propertyName: 'content_piece_name',
        operator: 'EQ',
        value: contentPieceName,
      }],
    }],
    properties: ['content_piece_name', 'tagged_url'],
    limit: 1,
  }, token);

  if (r.status !== 200) {
    throw new Error(formatApiError('Duplicate check failed', r.status, r.data));
  }

  const duplicate = r.data.results?.[0];
  if (!duplicate) return null;

  return {
    id: duplicate.id,
    contentPieceName: duplicate.properties?.content_piece_name || contentPieceName,
    taggedUrl: duplicate.properties?.tagged_url || '',
  };
}

function duplicateError() {
  return 'A UTM Link record already exists with this tagged URL.';
}

// Get the single 'current' config row from HubDB
async function getConfigRow(token) {
  const r = await apiRequest('GET', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows/draft?limit=50`, null, token);
  if (r.status !== 200) return { row: null, error: `getRows failed: ${r.status}` };
  const rows = r.data.results || [];
  const row = rows.find(r => r.values?.name === 'current') || null;
  return { row, rowId: row?.id || null };
}

// Check if user can edit based on HubSpot superAdmin OR editor_emails in HubDB
async function canEdit(context, token) {
  try {
    const userEmail = context.userEmail || context.user?.email;
    if (!userEmail) return false;

    // Check editor_emails from HubDB config row
    const { row } = await getConfigRow(token);
    if (!row) return false;
    const editorEmailsRaw = row.values?.editor_emails;
    if (!editorEmailsRaw) return false;
    const editorEmails = JSON.parse(editorEmailsRaw);
    return Array.isArray(editorEmails) && editorEmails.includes(userEmail);
  } catch { return false; }
}

// Save updated values to the 'current' config row
async function saveConfigRow(rowId, values, token) {
  // If row exists, patch it; if not, create it
  let r;
  if (rowId) {
    r = await apiRequest('PATCH', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows/${rowId}/draft`, { values }, token);
  } else {
    r = await apiRequest('POST', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows`, { name: 'current', values }, token);
  }
  if (r.status >= 400) return { error: `save failed: ${r.status} ${JSON.stringify(r.data).substring(0, 300)}` };

  // Push draft to live
  const pub = await apiRequest('POST', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/draft/push-live`, null, token);
  if (pub.status >= 400) return { error: `publish failed: ${pub.status}` };
  return { success: true };
}

exports.main = async (context) => {
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
  const { action, params } = context.parameters || {};
  if (!token) return { error: 'No token' };

  try {
    switch (action) {

      // Load all config from single 'current' row
      case 'getConfig': {
        const { row, error } = await getConfigRow(token);
        if (error) return { error };
        if (!row) return { config: null };
        const v = row.values || {};
        const parse = (val) => { try { return val ? JSON.parse(val) : null; } catch { return null; } };
        return {
          config: {
            superAdminOnly: v.super_admin_only === 'true',
            editorEmails: parse(v.editor_emails) || [],
            sourcesMediumsMap: parse(v.source_medium_map_current),
            sourcesMediumsMapDefault: parse(v.source_medium_map_default),
            fieldValues: parse(v.field_values),
            definitionsCurrent: parse(v.utm_definitions_current),
            definitionsDefault: parse(v.utm_definitions_default),
            lastUpdatedDatetime: v.last_updated_datetime || null,
            lastUpdatedByUser: v.last_updated_by_user || null,
          }
        };
      }

      // Save dependency map
      case 'saveMap': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        const { row, rowId } = await getConfigRow(token);
        const userEmail = context.userEmail || context.user?.email || 'unknown';
        const values = {
          ...(row?.values || {}),
          source_medium_map_current: JSON.stringify(params.map),
          last_updated_datetime: Date.now(),
          last_updated_by_user: userEmail,
        };
        return await saveConfigRow(rowId, values, token);
      }

      // Save definitions
      case 'saveDefinitions': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        const { row, rowId } = await getConfigRow(token);
        const userEmail = context.userEmail || context.user?.email || 'unknown';
        const values = {
          ...(row?.values || {}),
          utm_definitions_current: JSON.stringify(params.definitions),
          last_updated_datetime: Date.now(),
          last_updated_by_user: userEmail,
        };
        return await saveConfigRow(rowId, values, token);
      }

      // Save superAdminOnly toggle
      case 'saveSetting': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        const { row, rowId } = await getConfigRow(token);
        const userEmail = context.userEmail || context.user?.email || 'unknown';
        const values = {
          ...(row?.values || {}),
          super_admin_only: params.superAdminOnly ? 'true' : 'false',
          last_updated_datetime: Date.now(),
          last_updated_by_user: userEmail,
        };
        return await saveConfigRow(rowId, values, token);
      }

      // Sync field values from HubSpot utm_source and utm_medium properties
      case 'syncFieldValues': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        const [s, m] = await Promise.all([
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_source', null, token),
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_medium', null, token),
        ]);
        const sources = (s.data.options || []).map(o => ({ label: o.label, value: o.value }));
        const mediums = (m.data.options || []).map(o => ({ label: o.label, value: o.value }));
        const { row, rowId } = await getConfigRow(token);
        const userEmail = context.userEmail || context.user?.email || 'unknown';
        const values = {
          ...(row?.values || {}),
          field_values: JSON.stringify({ sources, mediums }),
          last_updated_datetime: Date.now(),
          last_updated_by_user: userEmail,
        };
        return await saveConfigRow(rowId, values, token);
      }

      // Check if current user can edit
      case 'checkAdmin': {
        const userEmail = context.userEmail || context.user?.email || 'not_found';
        const userId = context.userId || context.user?.id || 'not_found';
        const { row } = await getConfigRow(token);
        const editorEmailsRaw = row?.values?.editor_emails || 'empty';
        let isSuperAdmin = false;
        if (userId && userId !== 'not_found') {
          const r = await apiRequest('GET', `/settings/v3/users/${userId}`, null, token);
          isSuperAdmin = r.data?.superAdmin === true;
        }
        const allowed = await canEdit(context, token);
        return { isAdmin: allowed, debug: { userEmail, userId, editorEmailsRaw, isSuperAdmin } };
      }

      // Get source/medium/placement options (used by HomePage)
      case 'getOptions': {
        const [s, m, p] = await Promise.all([
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_source', null, token),
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_medium', null, token),
          apiRequest('GET', '/crm/v3/properties/2-203776196/link_placement', null, token),
        ]);
        return {
          sourceOptions: s.data.options || [],
          mediumOptions: m.data.options || [],
          placementOptions: p.data.options || [],
        };
      }

      // Get campaigns (used by HomePage)
      case 'getCampaigns': {
        const r = await apiRequest('POST', '/crm/v3/objects/0-35/search', {
          properties: ['hs_name', 'hs_utm', 'hs_campaign_status'],
          limit: 100,
          sorts: [{ propertyName: 'hs_name', direction: 'ASCENDING' }]
        }, token);
        if (r.status !== 200) return { error: `Campaigns API ${r.status}: ${JSON.stringify(r.data)}`, campaigns: [] };
        return { campaigns: r.data.results || [] };
      }

      // Get campaigns with Campaign Start Date (used by NewUtmBuilderPage)
      case 'getCampaignsWithStartDate': {
        const props = await apiRequest('GET', '/crm/v3/properties/0-35?archived=false', null, token);
        const campaignStartDateProperty = props.status === 200
          ? findCampaignStartDateProperty(props.data.results || [])
          : null;
        const properties = ['hs_name', 'hs_utm', 'hs_campaign_status'];
        if (campaignStartDateProperty) properties.push(campaignStartDateProperty);

        const r = await apiRequest('POST', '/crm/v3/objects/0-35/search', {
          properties,
          limit: 100,
          sorts: [{ propertyName: 'hs_name', direction: 'ASCENDING' }]
        }, token);
        if (r.status !== 200) return { error: `Campaigns API ${r.status}: ${JSON.stringify(r.data)}`, campaigns: [] };
        return {
          campaigns: (r.data.results || []).map(campaign => ({
            ...campaign,
            campaignStartDate: campaignStartDateProperty
              ? campaign.properties?.[campaignStartDateProperty] || ''
              : '',
          })),
          campaignStartDateProperty,
        };
      }

      // Get users
      case 'getUsers': {
        const r = await apiRequest('GET', '/settings/v3/users?limit=100', null, token);
        if (r.status !== 200) return { error: `Users API ${r.status}`, users: [] };
        return { users: r.data.results || [] };
      }

      // Create a UTM link CRM record
      case 'createUtmLink': {
        const { properties, campaignId } = params;
        const duplicate = await findExistingUtmLink(properties?.content_piece_name, token);
        if (duplicate) return { error: duplicateError(), duplicate };

        const r = await apiRequest('POST', `/crm/v3/objects/${UTM_LINK_OBJECT_TYPE}`, { properties }, token);
        if (r.status !== 201) {
          const duplicateAfterCreate = await findExistingUtmLink(properties?.content_piece_name, token);
          if (duplicateAfterCreate) return { error: duplicateError(), duplicate: duplicateAfterCreate };
          throw new Error(formatApiError('Create failed', r.status, r.data));
        }
        const id = r.data.id;
        if (campaignId && id) {
          const assoc = await apiRequest('PUT',
            `/crm/v4/objects/${UTM_LINK_OBJECT_TYPE}/${id}/associations/0-35/${campaignId}`,
            [{ associationCategory: 'USER_DEFINED', associationTypeId: 42 }], token);
          if (assoc.status >= 400) return { success: true, id, warning: formatApiError('Assoc failed', assoc.status, assoc.data) };
        }
        return { success: true, id };
      }

      // Create multiple UTM link CRM records
      case 'createUtmLinks': {
        const { items, campaignId } = params;
        if (!Array.isArray(items) || items.length === 0) return { error: 'No UTM Link records to create.' };

        const created = [];
        const errors = [];
        const warnings = [];
        const seenContentNames = new Map();

        for (let i = 0; i < items.length; i += 1) {
          const properties = items[i]?.properties;
          if (!properties) {
            errors.push({ index: i, error: 'Missing properties.' });
            continue;
          }

          const contentPieceName = properties.content_piece_name;
          if (contentPieceName && seenContentNames.has(contentPieceName)) {
            errors.push({
              index: i,
              error: `This tagged URL matches Link ${seenContentNames.get(contentPieceName) + 1} in this save.`,
            });
            continue;
          }

          const duplicate = await findExistingUtmLink(contentPieceName, token);
          if (duplicate) {
            errors.push({ index: i, error: duplicateError(), duplicate });
            continue;
          }
          if (contentPieceName) seenContentNames.set(contentPieceName, i);

          const r = await apiRequest('POST', `/crm/v3/objects/${UTM_LINK_OBJECT_TYPE}`, { properties }, token);
          if (r.status !== 201) {
            const duplicateAfterCreate = await findExistingUtmLink(contentPieceName, token);
            if (duplicateAfterCreate) {
              errors.push({ index: i, error: duplicateError(), duplicate: duplicateAfterCreate });
              continue;
            }
            errors.push({ index: i, error: formatApiError('Create failed', r.status, r.data) });
            continue;
          }

          const id = r.data.id;
          created.push({ index: i, id });

          if (campaignId && id) {
            const assoc = await apiRequest('PUT',
              `/crm/v4/objects/${UTM_LINK_OBJECT_TYPE}/${id}/associations/0-35/${campaignId}`,
              [{ associationCategory: 'USER_DEFINED', associationTypeId: 42 }], token);
            if (assoc.status >= 400) warnings.push({ index: i, id, warning: formatApiError('Assoc failed', assoc.status, assoc.data) });
          }
        }

        if (errors.length > 0) {
          const errorDetails = errors
            .map(error => `Link ${error.index + 1}: ${error.error}`)
            .join(' ');
          return {
            error: `Created ${created.length} of ${items.length} UTM Link records. ${errors.length} failed. ${errorDetails}`.slice(0, 1200),
            created,
            errors,
            warnings,
          };
        }

        return { success: true, created, warnings };
      }

      default: return { error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { error: e.message || JSON.stringify(e) };
  }
};
