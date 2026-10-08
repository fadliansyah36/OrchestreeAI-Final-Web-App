import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const targets = [
  'apps/client/components/billing/BillingHubScreen.tsx',
  'apps/client/components/selection/UniversalSelectionHubScreen.tsx',
  'apps/client/components/ProactiveChannelsScreen.tsx',
  'apps/client/components/AIDataPermissionScreen.tsx',
  'apps/client/components/EnterpriseHubScreen.tsx',
  'apps/client/components/sales/LeadPipelineScreen.tsx',
  'apps/client/components/sales/PersonaConfigurationScreen.tsx',
  'apps/client/components/omnichannel/OmnichannelInboxScreen.tsx',
  'apps/client/components/omnichannel/CustomerMergeReviewScreen.tsx',
  'apps/client/components/omnichannel/ChannelAccountsScreen.tsx',
  'apps/client/components/sales/ProductCatalogScreen.tsx',
  'apps/client/components/sales/OrderManagementScreen.tsx',
  'apps/client/components/CampaignBuilderScreen.tsx',
  'apps/client/components/ServiceRequestScreen.tsx',
  'apps/client/components/SalesCoachScreen.tsx',
  'apps/client/components/SalesGuardrailsScreen.tsx',
  'apps/client/components/RevenueIntelligenceScreen.tsx',
  'apps/client/components/MessageExperimentScreen.tsx',
  'apps/client/components/workforce/HomeOverviewScreen.tsx',
  'apps/client/components/landing/PricingSection.tsx',
  'apps/client/app/overview/page.tsx',
  'apps/admin/app/page.tsx',
];

const errors = [];
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    errors.push(`missing: ${relative}`);
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  const rawFetch = /(^|[^A-Za-z0-9_$.])fetch\s*\(/m.test(content);
  if (rawFetch) {
    errors.push(`direct fetch remains: ${relative}`);
  }
  if (!content.includes("from '@orchestree/api-client'")) {
    errors.push(`shared api client import missing: ${relative}`);
  }
}

if (errors.length) {
  console.error('REPAIR-FE-04 API client gate FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`REPAIR-FE-04 API client gate PASS — ${targets.length} existing UI/page surfaces use @orchestree/api-client transport.`);
