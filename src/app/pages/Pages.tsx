import { hubspot } from '@hubspot/ui-extensions';
import {
  createPageRouter,
  PageHeader,
  PageRoutes,
} from '@hubspot/ui-extensions/pages';
import { HomePage } from './HomePage.tsx';
import { NewUtmBuilderPage } from './NewUtmBuilderPage.tsx';
import { MassUtmBuilderPage } from './MassUtmBuilderPage.tsx';
import { DocsPage } from './DocsPage.tsx';
import { RulesPage } from './RulesPage.tsx';
import { DefinitionsPage } from './DefinitionsPage.tsx';
import { InstructionsPage } from './InstructionsPage.tsx';

const PageLayout = ({ children }: { children: any }) => (
  <>
    <PageHeader>
      <PageHeader.SecondaryActions>
        <PageHeader.PageLink to="/instructions">Instructions</PageHeader.PageLink>
        <PageHeader.PageLink to="/new-utm-builder">Single UTM Builder</PageHeader.PageLink>
        <PageHeader.PageLink to="/mass-utm-builder">Mass UTM Builder</PageHeader.PageLink>
        <PageHeader.PageLink to="/rules">Field Dependencies</PageHeader.PageLink>
        <PageHeader.PageLink to="/definitions">Term & Value Definitions</PageHeader.PageLink>
      </PageHeader.SecondaryActions>
    </PageHeader>
    {children}
  </>
);

const PageRouter = createPageRouter(
  <PageRoutes layoutComponent={PageLayout}>
    <PageRoutes.IndexRoute component={NewUtmBuilderPage} />
    <PageRoutes.Route path="/instructions" component={InstructionsPage} />
    <PageRoutes.Route path="/new-utm-builder" component={NewUtmBuilderPage} />
    <PageRoutes.Route path="/mass-utm-builder" component={MassUtmBuilderPage} />
    <PageRoutes.Route path="/rules" component={RulesPage} />
    <PageRoutes.Route path="/definitions" component={DefinitionsPage} />
    <PageRoutes.Route path="/docs" component={DocsPage} />
    <PageRoutes.Route path="/legacy-utm-builder" component={HomePage} />
  </PageRoutes>,
);

hubspot.extend(() => <PageRouter />);
