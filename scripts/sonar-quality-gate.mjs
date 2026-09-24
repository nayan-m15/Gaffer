import { readFile, writeFile } from 'node:fs/promises';

// Read the submitted task ID, rather than a project-wide status that another
// branch's analysis could replace. Never log credentials or raw HTTP bodies.
const host = process.env.SONAR_HOST_URL;
const token = process.env.SONAR_TOKEN;
if (!host || !token) throw new Error('SONAR_HOST_URL and SONAR_TOKEN are required.');

async function get(path, params) {
  const url = new URL(`${host.replace(/\/$/, '')}/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`SonarQube ${path} returned HTTP ${response.status}.`);
  return response.json();
}

const report = await readFile('.scannerwork/report-task.txt', 'utf8');
const taskId = /^ceTaskId=(.+)$/m.exec(report)?.[1].trim();
if (!taskId) throw new Error('Scanner report does not contain a task ID.');
const { task } = await get('api/ce/task', { id: taskId });
if (!task.analysisId) throw new Error(`Analysis has no result (task status: ${task.status}).`);
const { projectStatus } = await get('api/qualitygates/project_status', {
  analysisId: task.analysisId,
});
await writeFile('.scannerwork/quality-gate.json', JSON.stringify(projectStatus, null, 2));
console.log(`Quality gate: ${projectStatus.status}`);
console.table(projectStatus.conditions.map((condition) => ({
  metric: condition.metricKey,
  status: condition.status,
  actual: condition.actualValue ?? 'n/a',
  comparator: condition.comparator,
  threshold: condition.errorThreshold,
})));
