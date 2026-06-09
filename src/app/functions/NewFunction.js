const https = require('https');

const HUBDB_TABLE_ID = '2694996157';

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

      // Get users
      case 'getUsers': {
        const r = await apiRequest('GET', '/settings/v3/users?limit=100', null, token);
        if (r.status !== 200) return { error: `Users API ${r.status}`, users: [] };
        return { users: r.data.results || [] };
      }

      // Create a UTM link CRM record
      case 'createUtmLink': {
        const { properties, campaignId } = params;
        const r = await apiRequest('POST', '/crm/v3/objects/2-203776196', { properties }, token);
        if (r.status !== 201) throw new Error(`Create failed ${r.status}: ${JSON.stringify(r.data)}`);
        const id = r.data.id;
        if (campaignId && id) {
          const assoc = await apiRequest('PUT',
            `/crm/v4/objects/2-203776196/${id}/associations/0-35/${campaignId}`,
            [{ associationCategory: 'USER_DEFINED', associationTypeId: 42 }], token);
          if (assoc.status >= 400) return { success: true, id, warning: `Assoc failed: ${JSON.stringify(assoc.data)}` };
        }
        return { success: true, id };
      }

      default: return { error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { error: e.message || JSON.stringify(e) };
  }
};
