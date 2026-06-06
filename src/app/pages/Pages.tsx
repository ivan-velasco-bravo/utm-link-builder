import { hubspot } from '@hubspot/ui-extensions';
import {
  createPageRouter,
  PageHeader,
  PageRoutes,
  usePageRoute,
} from '@hubspot/ui-extensions/pages';
import { HomePage } from './HomePage.tsx';
import { DocsPage } from './DocsPage.tsx';
import { RulesPage } from './RulesPage.tsx';

const PageLayout = ({ children }: { children: any }) => {
  const { currentPath } = usePageRoute();
  const isRules = (currentPath || '').includes('rules');
  return (
    <>
      <PageHeader>
        <PageHeader.SecondaryActions>
          {isRules
            ? <PageHeader.PageLink to="/">Create UTM Link</PageHeader.PageLink>
            : <PageHeader.PageLink to="/rules">Source → Medium Rules</PageHeader.PageLink>
          }
        </PageHeader.SecondaryActions>
      </PageHeader>
      {children}
    </>
  );
};

const PageRouter = createPageRouter(
  <PageRoutes layoutComponent={PageLayout}>
    <PageRoutes.IndexRoute component={HomePage} />
    <PageRoutes.Route path="/rules" component={RulesPage} />
    <PageRoutes.Route path="/docs" component={DocsPage} />
  </PageRoutes>,
);

hubspot.extend(() => <PageRouter />);
