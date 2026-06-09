const https = require('https');

const HUBDB_TABLE_ID = '2694996157';
const EDITOR_EMAILS = ['ivan.bravo@tinkermakesperfect.com'];

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

async function canEdit(context, token) {
  try {
    const userEmail = context.userEmail || context.user?.email;
    const userId = context.userId || context.user?.id;
    if (userEmail && EDITOR_EMAILS.includes(userEmail)) return true;
    if (userId) {
      const r = await apiRequest('GET', `/settings/v3/users/${userId}`, null, token);
      return r.data?.superAdmin === true || EDITOR_EMAILS.includes(r.data?.email || '');
    }
    return false;
  } catch { return false; }
}

// HubDB v3 CMS API - uses column names, not IDs
async function hubdbGetRows(token) {
  const r = await apiRequest('GET', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows/draft?limit=50`, null, token);
  if (r.status !== 200) return { rows: [], error: `getRows failed: ${r.status} ${JSON.stringify(r.data).substring(0,300)}` };
  return { rows: r.data.results || [] };
}

async function hubdbGetByKey(key, token) {
  const { rows, error } = await hubdbGetRows(token);
  if (error) return { row: null, error };
  return { row: rows.find(r => r.values?.config_key === key) || null };
}

async function hubdbSave(key, value, token) {
  const { rows, error } = await hubdbGetRows(token);
  if (error) return { error };

  // Delete all rows with this key (cleans duplicates too)
  const toDelete = rows.filter(r => r.values?.config_key === key);
  for (const row of toDelete) {
    await apiRequest('DELETE', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows/${row.id}/draft`, null, token);
  }

  // Create new row using column names (v3 requirement)
  const r = await apiRequest('POST', `/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows`, {
    values: { config_key: key, config_value: value }
  }, token);
  if (r.status >= 400) return { error: `create failed: ${r.status} ${JSON.stringify(r.data).substring(0,300)}` };

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
      case 'getOptions': {
        const [s, m, p] = await Promise.all([
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_source', null, token),
          apiRequest('GET', '/crm/v3/properties/2-203776196/utm_medium', null, token),
          apiRequest('GET', '/crm/v3/properties/2-203776196/link_placement', null, token),
        ]);
        return { sourceOptions: s.data.options || [], mediumOptions: m.data.options || [], placementOptions: p.data.options || [] };
      }
      case 'getCampaigns': {
        const r = await apiRequest('POST', '/crm/v3/objects/0-35/search', {
          properties: ['hs_name', 'hs_utm', 'hs_campaign_status'],
          limit: 100,
          sorts: [{ propertyName: 'hs_name', direction: 'ASCENDING' }]
        }, token);
        if (r.status !== 200) return { error: `Campaigns API ${r.status}: ${JSON.stringify(r.data)}`, campaigns: [] };
        return { campaigns: r.data.results || [] };
      }
      case 'getUsers': {
        const r = await apiRequest('GET', '/settings/v3/users?limit=100', null, token);
        if (r.status !== 200) return { error: `Users API ${r.status}`, users: [] };
        return { users: r.data.results || [] };
      }
      case 'getMap': {
        const { row, error } = await hubdbGetByKey('source_medium_map', token);
        if (error) return { map: null, error };
        if (!row) return { map: null };
        try { return { map: JSON.parse(row.values.config_value) }; }
        catch(e) { return { map: null, error: 'parse: ' + e.message }; }
      }
      case 'setMap': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        return await hubdbSave('source_medium_map', JSON.stringify(params.map), token);
      }
      case 'checkAdmin': {
        const allowed = await canEdit(context, token);
        return { isAdmin: allowed };
      }
      case 'getSetting': {
        const { row, error } = await hubdbGetByKey(params.key, token);
        if (error) return { value: null, error };
        return { value: row?.values?.config_value || null };
      }
      case 'setSetting': {
        const allowed = await canEdit(context, token);
        if (!allowed) return { error: 'No permission.' };
        return await hubdbSave(params.key, params.value, token);
      }
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
