import {
  Divider,
  Flex,
  Text,
} from '@hubspot/ui-extensions';
import {
  PageBreadcrumbs,
  PageTitle,
} from '@hubspot/ui-extensions/pages';

export const InstructionsPage = () => {
  return (
    <>
      <PageBreadcrumbs>
        <PageBreadcrumbs.Current>Instructions</PageBreadcrumbs.Current>
      </PageBreadcrumbs>
      <PageTitle>Instructions</PageTitle>

      <Flex direction="column" gap="medium">
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: 'bold' }}>Start with a Campaign</Text>
          <Text>
            Create the HubSpot Campaign before building links. Recommended: name the Campaign with the start year and month followed by a descriptive name, such as 2026-06-summer-product-launch.
          </Text>
          <Text>
            This creates the Campaign UTM parameter in the right YYYY-MM-campaign-name format, so you should not need to edit it later.
          </Text>
          <Text>
            Do not update Campaign UTMs once tagged links are live. Changing them later can break or split campaign tracking.
          </Text>
        </Flex>

        <Divider />

        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: 'bold' }}>Using the URL Builder</Text>
          <Text>
            Open the URL Builder from your bookmarked HubSpot app link. Once links are saved, they can be found on the Assets tab of the related Campaign.
          </Text>
          <Text>
            The app does not allow duplicate tagged URLs. From a UTM point of view, two records with the same final URL would represent the same tracking link, so a duplicate would not add reporting value and could create confusion about which record should be used.
          </Text>
        </Flex>

        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: 'bold' }}>Single UTM Builder</Text>
          <Text>
            Create one tagged URL at a time. Select a Campaign, add the destination URL, choose source and medium, enter the content activation date and content name, then review, save, and copy the generated URL.
          </Text>
          <Text>
            Use Website Source when the source is a specific partner, sponsor, publisher, or syndicated-content website instead of a standard source option.
          </Text>
        </Flex>

        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: 'bold' }}>Mass UTM Builder</Text>
          <Text>
            Create multiple tagged URLs for the same Campaign. Add rows, clone similar links, adjust the fields for each row, review each URL, and save all links together.
          </Text>
          <Text>
            If a tagged URL already exists, the app will show an error with a link to the existing UTM Link record.
          </Text>
        </Flex>

        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: 'bold' }}>Field Dependencies</Text>
          <Text>
            Manage which UTM Medium values are available for each UTM Source. Use this to keep source and medium combinations consistent.
          </Text>
        </Flex>

        <Flex direction="column" gap="small">
          <Text format={{ fontWeight: 'bold' }}>Term & Value Definitions</Text>
          <Text>
            Review and manage the approved UTM field definitions so naming stays consistent across teams and campaigns.
          </Text>
        </Flex>
      </Flex>
    </>
  );
};
