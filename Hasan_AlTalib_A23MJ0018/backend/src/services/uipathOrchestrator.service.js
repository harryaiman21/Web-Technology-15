import axios from 'axios';

const IDENTITY_URL = 'https://cloud.uipath.com/identity_/connect/token';
const SCOPE = 'OR.Jobs OR.Folders OR.Execution';

let cachedToken = null;
let tokenExpiresAt = 0;

function getConfig() {
  const cfg = {
    orgName: process.env.UIPATH_ORG_NAME,
    tenantName: process.env.UIPATH_TENANT_NAME,
    clientId: process.env.UIPATH_CLIENT_ID,
    clientSecret: process.env.UIPATH_CLIENT_SECRET,
    folderId: process.env.UIPATH_FOLDER_ID,
    releaseKey: process.env.UIPATH_PROCESS_RELEASE_KEY,
  };
  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    const err = new Error(`UiPath config missing: ${missing.join(', ')}`);
    err.code = 'UIPATH_NOT_CONFIGURED';
    throw err;
  }
  return cfg;
}

export function isOrchestratorConfigured() {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt - now > 60_000) {
    return cachedToken;
  }
  const { clientId, clientSecret } = getConfig();

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPE,
  });

  const { data } = await axios.post(IDENTITY_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in - 30) * 1000;
  return cachedToken;
}

function orchestratorBaseUrl() {
  const { orgName, tenantName } = getConfig();
  return `https://cloud.uipath.com/${orgName}/${tenantName}/orchestrator_`;
}

export async function startDispatcherJob() {
  const { folderId, releaseKey } = getConfig();
  const token = await getAccessToken();

  const url = `${orchestratorBaseUrl()}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs`;

  const body = {
    startInfo: {
      ReleaseKey: releaseKey,
      Strategy: 'ModernJobsCount',
      JobsCount: 1,
      InputArguments: '{}',
    },
  };

  const { data } = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-UIPATH-OrganizationUnitId': folderId,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });

  const job = data?.value?.[0] || {};
  return {
    jobKey: job.Key || null,
    state: job.State || 'Pending',
    releaseName: job.ReleaseName || null,
    startTime: job.StartTime || null,
  };
}

export async function getJobStatus(jobKey) {
  const { folderId } = getConfig();
  const token = await getAccessToken();

  const url = `${orchestratorBaseUrl()}/odata/Jobs?$filter=Key eq ${jobKey}`;

  const { data } = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-UIPATH-OrganizationUnitId': folderId,
    },
    timeout: 10_000,
  });

  const job = data?.value?.[0];
  if (!job) return null;

  return {
    jobKey: job.Key,
    state: job.State,
    info: job.Info || null,
    creationTime: job.CreationTime,
    startTime: job.StartTime,
    endTime: job.EndTime,
  };
}
